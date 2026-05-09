import { useState } from "react";
import { useDesktopAuth } from "../lib/desktopAuth";
import { Loader } from "lucide-react";

const McpIcon = ({ size = 28 }: { size?: number }) => (
  <svg fill="currentColor" fillRule="evenodd" height={size} width={size} viewBox="0 0 24 24">
    <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"/>
    <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"/>
  </svg>
);

export function AuthGate({ onSkip }: { onSkip: () => void }) {
  const { signIn } = useDesktopAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSignIn = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signIn();
    } catch (e: any) {
      setErr(e?.message === "login_timeout" ? "Sign-in timed out. Please try again." : (e?.message || "Sign-in failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-gate">
      <div className="auth-gate-card">
        <div className="auth-gate-logo">
          <McpIcon size={32} />
        </div>
        <h1 className="auth-gate-title">Codegrey</h1>
        <p className="auth-gate-sub">
          Sign in to sync your workspace, usage, and plan across devices.
        </p>

        {err && <div className="auth-gate-error">{err}</div>}

        <div className="auth-gate-actions">
          <button
            type="button"
            className="auth-gate-btn-primary"
            onClick={() => void handleSignIn()}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader size={14} className="spin" />
                Opening browser…
              </>
            ) : (
              "Sign in with Codegrey"
            )}
          </button>

          <button
            type="button"
            className="auth-gate-btn-ghost"
            onClick={onSkip}
            disabled={busy}
          >
            Continue without signing in
          </button>
        </div>

        <p className="auth-gate-note">
          Your code stays local. Sign-in is optional but required for plan features.
        </p>
      </div>
    </section>
  );
}
