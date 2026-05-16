import { useState } from "react";
import { useDesktopAuth } from "../lib/desktopAuth";
import { CodegreyLogo } from "../components/CodegreyLogo";
import { Loader } from "lucide-react";

export function AuthGate({ onSkip, showSkip = false }: { onSkip: () => void; showSkip?: boolean }) {
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
          <CodegreyLogo size={44} />
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

          {showSkip && (
            <button
              type="button"
              className="auth-gate-btn-ghost"
              onClick={onSkip}
              disabled={busy}
            >
              Continue without signing in
            </button>
          )}
        </div>

        <p className="auth-gate-note">
          Your code stays local. Sign-in is optional but required for plan features.
        </p>
      </div>
    </section>
  );
}
