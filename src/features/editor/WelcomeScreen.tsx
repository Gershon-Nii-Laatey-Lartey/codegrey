import React from "react";
import { Plus } from "lucide-react";

export type WelcomeScreenProps = {
  workspaceRoot: string | null;
  onCreateFile?: () => void;
};

export function WelcomeScreen(props: WelcomeScreenProps) {
  const { workspaceRoot, onCreateFile } = props;
  
  return (
    <div className="workspace-centered">
      <div className="workspace-hero">
        <img
          src="/logos/no_card_white.svg"
          alt="Codegrey"
          className="workspace-logo"
        />
        <h1 className="workspace-title">Codegrey</h1>

        <div className="shortcuts-list">
          <div className="shortcut-item">
            <span>Switch to Agent Manager</span>
            <div className="shortcut-keys">
              <kbd className="kbd">Ctrl</kbd>
              <span>+</span>
              <kbd className="kbd">E</kbd>
            </div>
          </div>
          <div className="shortcut-item">
            <span>Code with Agent</span>
            <div className="shortcut-keys">
              <kbd className="kbd">Ctrl</kbd>
              <span>+</span>
              <kbd className="kbd">L</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
