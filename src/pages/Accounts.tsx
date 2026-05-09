import { ArrowLeft } from "lucide-react";

export function Accounts({ onBack }: { onBack: () => void }) {
  return (
    <section className="settings-page" aria-label="Accounts">
      <header className="settings-header">
        <div>
          <h1>Accounts</h1>
          <p>Manage your connections</p>
        </div>
        <button className="settings-close-btn" type="button" onClick={onBack} aria-label="Close accounts">
          <ArrowLeft size={16} />
        </button>
      </header>

      <div className="settings-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
        accounts go here
      </div>
    </section>
  );
}
