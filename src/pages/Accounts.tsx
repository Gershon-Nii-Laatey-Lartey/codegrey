import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  Loader,
  LogOut,
  RefreshCw,
  Zap,
  Activity,
  Cpu,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { CodegreyLogo } from "../components/CodegreyLogo";
import { useEffect } from "react";
import { useDesktopAuth, BILLING_URL } from "../lib/desktopAuth";

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "#737373" },
  pro: { label: "Pro", color: "#a78bfa" },
  team: { label: "Team", color: "#38bdf8" },
  enterprise: { label: "Enterprise", color: "#fb923c" },
};

function PlanBadge({ plan }: { plan: string }) {
  const { label, color } = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  return (
    <span
      className="account-plan-badge"
      style={{ "--badge-color": color } as React.CSSProperties}
    >
      {label}
    </span>
  );
}

function Avatar({ name, email }: { name: string | null; email: string | null }) {
  const letter = (name || email || "?").charAt(0).toUpperCase();
  return <div className="account-avatar">{letter}</div>;
}

function MetricTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="acct-metric">
      <div className="acct-metric-icon">{icon}</div>
      <div className="acct-metric-body">
        <div className="acct-metric-value">{value}</div>
        <div className="acct-metric-label">{label}</div>
        {sub && <div className="acct-metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

function UsageBar({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <div className="acct-usage-bars">
      {data.map((v, i) => (
        <div key={i} className="acct-usage-bar-col">
          <div
            className="acct-usage-bar"
            style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function Accounts({ onBack }: { onBack: () => void }) {
  const { auth, accountData, accountLoading, signIn, signOut, refreshAccount } = useDesktopAuth();

  useEffect(() => { if (auth.loggedIn) void refreshAccount(); }, [auth.loggedIn]);

  const profile = accountData?.profile ?? auth.user;
  const sub = accountData?.subscription;
  const usage = accountData?.usage ?? [];

  const totalCostCents = usage.reduce((s, e) => s + (e.cost_cents ?? 0), 0);
  const totalTokensIn = usage.reduce((s, e) => s + (e.tokens_in ?? 0), 0);
  const totalTokensOut = usage.reduce((s, e) => s + (e.tokens_out ?? 0), 0);
  const totalRuns = usage.filter(e => e.event_type === "agent_run").length;

  const barData = (() => {
    const days: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    usage.forEach(e => { const day = e.created_at.slice(0, 10); if (day in days) days[day]++; });
    return Object.values(days);
  })();

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const fmtNum = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const renew = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const topModel = (() => {
    const counts: Record<string, number> = {};
    usage.forEach(e => { if (e.model) counts[e.model] = (counts[e.model] ?? 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) return "—";
    const m = top[0];
    return m.length > 18 ? m.slice(m.lastIndexOf("/") + 1) : m;
  })();

  const openBilling = () => {
    (window as any).codegrey?.windowControls?.openExternal?.(BILLING_URL)
      ?? window.open(BILLING_URL, "_blank");
  };

  return (
    <section className="settings-page account-page" aria-label="Account">
      <header className="settings-header">
        <div>
          <h1>Account</h1>
          <p>{auth.loggedIn ? (profile?.email ?? "Signed in") : "Not signed in"}</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {auth.loggedIn && (
            <button type="button" className="icon-btn" title="Refresh" onClick={() => void refreshAccount()} disabled={accountLoading}>
              <RefreshCw size={14} className={accountLoading ? "spin" : ""} />
            </button>
          )}
          <button className="settings-close-btn" type="button" onClick={onBack}><ArrowLeft size={16} /></button>
        </div>
      </header>

      <div className="settings-content account-content">
        {!auth.loggedIn ? (
          /* ── Signed-out state ──────────────────────────────────────── */
          <div className="acct-signed-out">
            <div className="acct-signed-out-glow" />
            <CodegreyLogo size={48} />
            <p className="acct-signed-out-title">Sign in to Codegrey</p>
            <p className="acct-signed-out-sub">
              Access your plan, sync usage across devices, and manage billing.
            </p>
            <button type="button" className="acct-signin-btn" onClick={() => void signIn()}>
              Sign in
            </button>
          </div>
        ) : accountLoading && !accountData ? (
          <div className="account-loading"><Loader size={18} className="spin" /></div>
        ) : (
          /* ── Signed-in state ──────────────────────────────────────── */
          <div className="acct-inner">
            {/* Identity card */}
            <div className="acct-identity-card">
              <Avatar name={profile?.full_name ?? null} email={profile?.email ?? null} />
              <div className="acct-identity-info">
                <div className="acct-identity-name">{profile?.full_name || profile?.email || "—"}</div>
                <div className="acct-identity-email">{profile?.email}</div>
              </div>
              <PlanBadge plan={profile?.plan ?? "free"} />
            </div>

            {/* Subscription */}
            <div className="acct-section">
              <div className="acct-section-head">
                <span className="acct-section-label">Subscription</span>
              </div>
              <div className="acct-sub-card">
                <div className="acct-sub-row">
                  <CreditCard size={13} strokeWidth={1.8} />
                  <span>{sub ? `${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)} — ${fmt(sub.monthly_price_cents)}/mo` : "Free plan"}</span>
                </div>
                {renew && (
                  <div className="acct-sub-renew">
                    {sub?.cancel_at_period_end ? "Cancels" : "Renews"} {renew}
                  </div>
                )}
                <button type="button" className="acct-billing-link" onClick={openBilling}>
                  Manage billing <ArrowUpRight size={10} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Usage */}
            <div className="acct-section">
              <div className="acct-section-head">
                <span className="acct-section-label">Usage — 14 days</span>
              </div>

              <UsageBar data={barData} />

              <div className="acct-metrics-grid">
                <MetricTile icon={<Zap size={12} />} label="Agent runs" value={fmtNum(totalRuns)} />
                <MetricTile icon={<Activity size={12} />} label="Events" value={fmtNum(usage.length)} />
                <MetricTile icon={<BarChart3 size={12} />} label="Tokens in" value={fmtNum(totalTokensIn)} />
                <MetricTile icon={<BarChart3 size={12} />} label="Tokens out" value={fmtNum(totalTokensOut)} />
                <MetricTile icon={<CreditCard size={12} />} label="Est. cost" value={fmt(totalCostCents)} />
                <MetricTile icon={<Cpu size={12} />} label="Top model" value={topModel} />
              </div>
            </div>

            {/* Sign out */}
            <div className="acct-section acct-section-last">
              <button type="button" className="acct-signout-btn" onClick={() => void signOut()}>
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
