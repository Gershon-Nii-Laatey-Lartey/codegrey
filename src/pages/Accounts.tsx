import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  Loader,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { CodegreyLogo } from "../components/CodegreyLogo";
import { useEffect } from "react";
import { useDesktopAuth, BILLING_URL } from "../lib/desktopAuth";

const PLAN_COLORS: Record<string, string> = {
  free: "#888",
  pro: "#a78bfa",
  team: "#38bdf8",
  enterprise: "#fb923c",
};

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className="account-plan-badge" style={{ "--badge-color": PLAN_COLORS[plan] ?? "#888" } as React.CSSProperties}>
      {plan}
    </span>
  );
}

function Avatar({ name, email }: { name: string | null; email: string | null }) {
  const letter = (name || email || "?").charAt(0).toUpperCase();
  return <div className="account-avatar">{letter}</div>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="account-stat-card">
      <div className="account-stat-label">{label}</div>
      <div className="account-stat-value">{value}</div>
      {sub && <div className="account-stat-sub">{sub}</div>}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 120; const h = 28;
  const step = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="account-sparkline">
      <polyline points={pts} fill="none" stroke="var(--accent, #a78bfa)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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

  const sparkData = (() => {
    const days: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    usage.forEach(e => { const day = e.created_at.slice(0, 10); if (day in days) days[day]++; });
    return Object.values(days);
  })();

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const renew = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

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
          <div className="account-signed-out">
            <CodegreyLogo size={52} />
            <p className="account-signed-out-title">Not signed in</p>
            <p className="account-signed-out-sub">Sign in to sync usage, view your plan, and manage billing.</p>
            <button type="button" className="account-signin-btn" onClick={() => void signIn()}>Sign in with Codegrey</button>
          </div>
        ) : accountLoading && !accountData ? (
          <div className="account-loading"><Loader size={20} className="spin" /></div>
        ) : (
          <>
            <div className="account-identity">
              <Avatar name={profile?.full_name ?? null} email={profile?.email ?? null} />
              <div className="account-identity-info">
                <div className="account-identity-name">{profile?.full_name || profile?.email || "—"}</div>
                <div className="account-identity-email">{profile?.email}</div>
              </div>
              <PlanBadge plan={profile?.plan ?? "free"} />
            </div>

            <div className="account-section">
              <div className="account-section-label">Subscription</div>
              <div className="account-card">
                <div className="account-card-row">
                  <CreditCard size={14} />
                  <span>{sub ? `${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)} — ${fmt(sub.monthly_price_cents)}/mo` : "Free plan"}</span>
                </div>
                {renew && (
                  <div className="account-card-row account-muted">
                    <span>{sub?.cancel_at_period_end ? "Cancels" : "Renews"} {renew}</span>
                  </div>
                )}
                <button type="button" className="account-billing-btn" onClick={openBilling}>
                  Manage billing <ExternalLink size={11} />
                </button>
              </div>
            </div>

            <div className="account-section">
              <div className="account-section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Usage — last 30 days</span>
                <Sparkline data={sparkData} />
              </div>
              <div className="account-stats-grid">
                <StatCard label="Agent runs" value={fmtNum(totalRuns)} />
                <StatCard label="Total events" value={fmtNum(usage.length)} />
                <StatCard label="Tokens in" value={fmtNum(totalTokensIn)} />
                <StatCard label="Tokens out" value={fmtNum(totalTokensOut)} />
                <StatCard label="Cost" value={fmt(totalCostCents)} sub="estimated" />
                <StatCard label="Top model" value={(() => {
                  const counts: Record<string, number> = {};
                  usage.forEach(e => { if (e.model) counts[e.model] = (counts[e.model] ?? 0) + 1; });
                  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                  if (!top) return "—";
                  const m = top[0];
                  return m.length > 16 ? m.slice(m.lastIndexOf("/") + 1) : m;
                })()} />
              </div>
            </div>

            <div className="account-section">
              <button type="button" className="account-signout-btn" onClick={() => void signOut()}>
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
