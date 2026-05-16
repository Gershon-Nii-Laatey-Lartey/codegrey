import { useEffect } from "react";
import { BILLING_URL, useDesktopAuth } from "../lib/desktopAuth";
import { AuthGate } from "./AuthGate";

function PlanBadge({ plan }: { plan: string }) {
  const labels: Record<string, string> = {
    free: "Free",
    pro: "Pro",
    team: "Team",
    enterprise: "Enterprise",
  };

  return (
    <div className="acct-m-badge" data-plan={plan}>
      <span className="acct-m-badge-label">{labels[plan] ?? labels.free}</span>
    </div>
  );
}

function Avatar({ name, email, url }: { name: string | null; email: string | null; url?: string | null }) {
  const letter = (name || email || "?").charAt(0).toUpperCase();
  return (
    <div className="acct-m-avatar">
      {url ? <img src={url} alt={name || "User"} className="acct-m-avatar-img" /> : letter}
    </div>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="acct-m-tile">
      <div className="acct-m-tile-label">{label}</div>
      <div className="acct-m-tile-value">{value}</div>
      <div className="acct-m-tile-detail">{detail}</div>
    </div>
  );
}

export function Accounts({ onBack }: { onBack: () => void }) {
  const { auth, accountData, accountLoading, signIn, signOut, refreshAccount } = useDesktopAuth();

  useEffect(() => {
    if (auth.loggedIn) void refreshAccount();
  }, [auth.loggedIn, refreshAccount]);

  const profile = accountData?.profile ?? auth.user;
  const sub = accountData?.subscription;
  const usage = accountData?.usage ?? [];

  const totalTokensIn = usage.reduce((sum, event) => sum + (event.tokens_in ?? 0), 0);
  const totalTokensOut = usage.reduce((sum, event) => sum + (event.tokens_out ?? 0), 0);
  const totalRequests = usage.filter((event) => event.event_type === "request").length;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const requestsThisMonth = usage.filter((event) => event.event_type === "request" && new Date(event.created_at) >= monthStart).length;
  const totalLines = usage.reduce((sum, event) => sum + (event.lines ?? 0), 0);

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const fmtNum = (value: number) =>
    value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);

  const renewDate = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const latestActivity = usage[0]?.created_at
    ? new Date(usage[0].created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "No recent usage";

  const planName = sub?.plan ?? profile?.plan ?? "free";
  const planLabel = planName.charAt(0).toUpperCase() + planName.slice(1);
  const subscriptionStatus = sub?.status ? sub.status.replace(/_/g, " ") : "Active";
  const monthlyRequestLimit = planName === "free" ? 100 : null;
  const creditsRemaining = monthlyRequestLimit === null ? "Unlimited" : fmtNum(Math.max(monthlyRequestLimit - requestsThisMonth, 0));
  const creditDetail = monthlyRequestLimit === null
    ? "No monthly request cap"
    : `${fmtNum(requestsThisMonth)} / ${fmtNum(monthlyRequestLimit)} requests used`;

  const topModel = (() => {
    const counts: Record<string, number> = {};
    usage.forEach((event) => {
      if (event.model) counts[event.model] = (counts[event.model] ?? 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) return "None yet";
    const model = top[0].split("/").pop() ?? top[0];
    return model.length > 22 ? `${model.slice(0, 22)}...` : model;
  })();

  const openBilling = () => {
    (window as any).codegrey?.windowControls?.openExternal?.(BILLING_URL) ?? window.open(BILLING_URL, "_blank");
  };

  return (
    <section className="settings-page acct-m-page" aria-label="Account">
      <header className="settings-header">
        <div>
          <h1>Account</h1>
          <p>Profile, plan, and local usage.</p>
        </div>
        <div className="acct-m-header-actions">
          {auth.loggedIn ? (
            <button
              type="button"
              className="acct-m-action-btn"
              onClick={() => void refreshAccount()}
              disabled={accountLoading}
              aria-label="Refresh account"
              data-tooltip="Refresh account"
            >
              Refresh
            </button>
          ) : null}
          <button className="settings-close-btn" type="button" onClick={onBack} aria-label="Back">
            Back
          </button>
        </div>
      </header>

      <div className="settings-content">
        {!auth.loggedIn ? (
          <AuthGate onSkip={onBack} />
        ) : accountLoading && !accountData ? (
          <div className="acct-m-loading">
            <span>Syncing profile...</span>
          </div>
        ) : (
          <div className="acct-m-container">
            <section className="acct-m-hero">
              <div className="acct-m-profile">
                <Avatar name={profile?.full_name ?? null} email={profile?.email ?? null} url={profile?.avatar_url} />
                <div className="acct-m-info">
                  <div className="acct-m-name">
                    {profile?.full_name || profile?.email?.split("@")[0] || "User"}
                    <PlanBadge plan={profile?.plan ?? "free"} />
                  </div>
                  <div className="acct-m-email">{profile?.email}</div>
                </div>
              </div>

              <div className="acct-m-plan-panel">
                <div>
                  <div className="acct-m-plan-kicker">
                    <span>{subscriptionStatus}</span>
                  </div>
                  <div className="acct-m-plan-title">{planLabel} edition</div>
                  <div className="acct-m-plan-sub">
                    {sub ? `${fmt(sub.monthly_price_cents)}/mo` : "$0.00/mo"}
                    {renewDate ? ` - ${sub?.cancel_at_period_end ? "ends" : "renews"} ${renewDate}` : ""}
                  </div>
                </div>
                <button type="button" className="acct-m-card-btn" onClick={openBilling}>
                  Manage billing
                </button>
              </div>
            </section>

            <section className="acct-m-section">
              <div className="acct-m-section-title">
                <div>
                  <div className="acct-m-label">Usage</div>
                  <p>Recent account activity from synced runs.</p>
                </div>
                <div className="acct-m-last-sync">
                  <span>{latestActivity}</span>
                </div>
              </div>
              <div className="acct-m-grid">
                <MetricTile label="AI requests" value={fmtNum(totalRequests)} detail={`${usage.length} synced events`} />
                <MetricTile
                  label="Total tokens"
                  value={fmtNum(totalTokensIn + totalTokensOut)}
                  detail={`${fmtNum(totalTokensIn)} in / ${fmtNum(totalTokensOut)} out`}
                />
                <MetricTile
                  label="Credits"
                  value={creditsRemaining}
                  detail={creditDetail}
                />
                <MetricTile label="AI edits" value={fmtNum(totalLines)} detail={topModel === "None yet" ? "No model data yet" : `Top model: ${topModel}`} />
              </div>
            </section>

            <section className="acct-m-card-premium">
              <div className="acct-m-card-content">
                <div className="acct-m-card-title">Desktop access is linked</div>
                <div className="acct-m-card-subtext">
                  This device is signed in as {profile?.email || "your Codegrey account"}.
                </div>
              </div>
            </section>

            <div className="acct-m-footer">
              <button type="button" className="acct-m-signout" onClick={() => void signOut()}>
                Sign out
              </button>
              <div className="acct-m-version">Codegrey desktop 1.2.0</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
