import { Terminal, Check, X, ChevronDown, ShieldCheck, Infinity as InfinityIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ApprovalScope = "once" | "always" | "session";

export function CommandApprovalCard({
  command,
  cwd,
  description,
  onApprove,
  onReject,
  className = "",
}: {
  command: string;
  cwd?: string;
  description?: string;
  onApprove?: (scope: ApprovalScope) => void;
  onReject?: () => void;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const pick = (scope: ApprovalScope) => {
    setMenuOpen(false);
    onApprove?.(scope);
  };

  return (
    <div className={`command-approval-card ${className}`}>
      {/* Header */}
      <div className="command-card-header">
        <div className="command-card-header-left">
          <Terminal size={12} className="muted-icon" />
          <span className="command-header-title">Run command</span>
        </div>
        {cwd && (
          <span className="command-header-cwd" title={cwd}>
            {cwd}
          </span>
        )}
      </div>

      {/* Command body */}
      <div className="command-card-body">
        <pre className="command-pre">
          <span className="command-prompt">$ </span>
          {command}
        </pre>
        {description && <p className="command-description">{description}</p>}
      </div>

      {/* Actions */}
      <div className="command-card-actions">
        <button onClick={onReject} className="command-btn-reject" type="button">
          <X size={12} />
          <span>Reject</span>
        </button>

        {/* Split Run button */}
        <div ref={menuRef} className="command-split-btn-group">
          <button onClick={() => pick("once")} className="command-btn-run" type="button">
            <Check size={12} />
            <span>Run</span>
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="command-btn-options"
            aria-label="Run options"
            type="button"
          >
            <ChevronDown size={12} className={menuOpen ? "rotate-180" : ""} />
          </button>

          {menuOpen && (
            <div className="command-options-menu">
              <MenuItem
                icon={<Check size={12} />}
                title="Run once"
                hint="Approve this single command"
                onClick={() => pick("once")}
              />
              <MenuItem
                icon={<ShieldCheck size={12} className="text-success" />}
                title="Always allow"
                hint="Auto-approve identical commands"
                onClick={() => pick("always")}
              />
              <MenuItem
                icon={<InfinityIcon size={12} className="text-primary" />}
                title="Allow all for session"
                hint="Skip approval until chat ends"
                onClick={() => pick("session")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="command-menu-item" type="button">
      <span className="menu-item-icon">{icon}</span>
      <span className="menu-item-text">
        <span className="menu-item-title">{title}</span>
        <span className="menu-item-hint">{hint}</span>
      </span>
    </button>
  );
}
