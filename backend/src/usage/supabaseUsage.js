const fetch = require("node-fetch");

const DEFAULT_SUPABASE_URL = "https://fdizzpftrynhlaawsjpq.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_i6MMYWQLq8nAup-pUj4iGw_ls3VcguL";
const PLAN_REQUEST_LIMITS = {
  free: 100,
  pro: null,
  team: null,
  enterprise: null,
};

class UsageLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "UsageLimitError";
    this.status = details.status || 402;
    this.code = details.code || "usage_limit_exceeded";
    this.details = details;
  }
}

function getSupabaseConfig() {
  const url = process.env.CODEGREY_SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey =
    process.env.CODEGREY_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_ANON_KEY;
  return { url: url?.replace(/\/+$/, ""), anonKey };
}

function getAccessToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return "";
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function authHeaders(accessToken, extra = {}) {
  const { anonKey } = getSupabaseConfig();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchSupabase(path, accessToken, options = {}) {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: authHeaders(accessToken, options.headers || {}),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const message = body?.message || body?.error || `Supabase request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function fetchAccountSnapshot(accessToken) {
  if (!accessToken) return null;
  const [profiles, subscriptions] = await Promise.all([
    fetchSupabase("/rest/v1/profiles?select=id,email,full_name,avatar_url,plan&limit=1", accessToken),
    fetchSupabase(
      "/rest/v1/subscriptions?select=plan,status,monthly_price_cents,current_period_end,cancel_at_period_end&limit=1",
      accessToken
    ),
  ]);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  const subscription = Array.isArray(subscriptions) ? subscriptions[0] : null;
  return profile ? { profile, subscription } : null;
}

async function countMonthlyRequests(accessToken) {
  const since = encodeURIComponent(monthStartIso());
  const rows = await fetchSupabase(
    `/rest/v1/usage_events?select=id&event_type=eq.request&created_at=gte.${since}&limit=10000`,
    accessToken
  );
  return Array.isArray(rows) ? rows.length : 0;
}

async function checkUsageAllowance(accessToken, opts = {}) {
  if (opts.keySource === "byok") {
    if (!accessToken) return { syncEnabled: false, reason: "not_signed_in", keySource: "byok" };
    const account = await fetchAccountSnapshot(accessToken).catch(() => null);
    return { syncEnabled: Boolean(account?.profile), account, plan: account?.profile?.plan || "free", used: 0, limit: null, keySource: "byok" };
  }

  if (!accessToken) return { syncEnabled: false, reason: "not_signed_in" };

  let account;
  try {
    account = await fetchAccountSnapshot(accessToken);
  } catch (err) {
    if (err.status === 401) {
      throw new UsageLimitError("Your Codegrey session expired. Sign in again to sync usage and verify credits.", {
        status: 401,
        code: "session_expired",
      });
    }
    throw err;
  }
  if (!account?.profile) {
    throw new UsageLimitError("Sign in again to sync usage and verify your plan.", {
      status: 401,
      code: "account_not_found",
    });
  }

  const subscription = account.subscription;
  const subscriptionActive = !subscription || ["active", "trialing"].includes(subscription.status);
  const plan = subscriptionActive ? subscription?.plan || account.profile.plan || "free" : "free";
  const limit = PLAN_REQUEST_LIMITS[plan] ?? PLAN_REQUEST_LIMITS.free;
  const used = await countMonthlyRequests(accessToken);

  if (limit !== null && used >= limit) {
    throw new UsageLimitError(`Monthly AI request limit reached for the ${plan} plan. Upgrade to continue.`, {
      plan,
      used,
      limit,
    });
  }

  return { syncEnabled: true, account, plan, used, limit, keySource: "plan" };
}

async function recordUsageEvent(accessToken, allowance, event) {
  if (!accessToken || !allowance?.syncEnabled || !allowance.account?.profile?.id) return false;
  const payload = {
    user_id: allowance.account.profile.id,
    event_type: "request",
    model: event.model || null,
    model_id: event.modelId || null,
    key_source: event.keySource || allowance.keySource || "plan",
    tokens_in: Math.max(0, Math.round(event.tokensIn || 0)),
    tokens_out: Math.max(0, Math.round(event.tokensOut || 0)),
    lines: Math.max(0, Math.round(event.lines || 0)),
    cost_cents: Math.max(0, Math.round(event.costCents || 0)),
  };
  await fetchSupabase("/rest/v1/usage_events", accessToken, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  return true;
}

function estimateTokens(value) {
  if (!value) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(text.length / 4);
}

function countChangedLines(oldContent = "", newContent = "") {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  if (!oldLines.length) return newLines.filter((line) => line.trim()).length;

  const commonLength = Math.min(oldLines.length, newLines.length);
  let changed = 0;
  for (let i = 0; i < commonLength; i += 1) {
    if (oldLines[i] !== newLines[i]) changed += 1;
  }
  return changed + Math.max(0, newLines.length - oldLines.length);
}

function splitLines(content) {
  if (!content) return [];
  return String(content).replace(/\r\n/g, "\n").split("\n");
}

module.exports = {
  UsageLimitError,
  checkUsageAllowance,
  countChangedLines,
  estimateTokens,
  getAccessToken,
  getSupabaseConfig,
  recordUsageEvent,
  PLAN_REQUEST_LIMITS,
};
