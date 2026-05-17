import { Plus, Terminal, X } from "lucide-react";
import React from "react";
import "./terminal.css";

export type TerminalInfo = {
  id: string;
  title: string;
};

export type TerminalPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  height: number;
  onResizeStart: (e: React.MouseEvent) => void;
  terminals: TerminalInfo[];
  activeTerminalId: string | null;
  onSelectTerminal: (id: string) => void;
  onCloseTerminal: (id: string) => void;
  onCreateTerminal: () => void;
  viewportRef: any;
};

export function TerminalPanel(props: TerminalPanelProps) {
  const {
    isOpen,
    onClose,
    height,
    onResizeStart,
    terminals,
    activeTerminalId,
    onSelectTerminal,
    onCloseTerminal,
    onCreateTerminal,
    viewportRef,
  } = props;

  return (
    <div
      className="terminal-panel"
      data-open={isOpen ? "true" : "false"}
      style={{ height: isOpen ? height : 0 }}
    >
      <div
        className="terminal-resizer"
        role="separator"
        aria-orientation="horizontal"
        onMouseDown={onResizeStart}
      />
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span>Terminal</span>
        </div>
        <div className="terminal-header-right">
          <button
            type="button"
            onClick={onCreateTerminal}
            aria-label="New terminal"
            data-tooltip="New terminal"
          >
            <Plus size={14} />
          </button>
          <button type="button" onClick={onClose} aria-label="Hide terminal">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        <div className="terminal-surface">
          <div className="terminal-list" aria-label="Terminal instances">
            {terminals.map((t) => (
              <div
                key={t.id}
                className="terminal-list-item"
                data-active={t.id === activeTerminalId ? "true" : "false"}
              >
                <button
                  type="button"
                  className="terminal-list-main"
                  onClick={() => onSelectTerminal(t.id)}
                  title={t.title}
                >
                  <div className="terminal-icon-wrap">
                    <Terminal size={12} />
                  </div>
                  <span>{t.title}</span>
                </button>
                <button
                  type="button"
                  className="terminal-list-close"
                  onClick={() => onCloseTerminal(t.id)}
                  aria-label={`Close ${t.title}`}
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div ref={viewportRef} className="terminal-xterm" />
        </div>
      </div>
    </div>
  );
}
