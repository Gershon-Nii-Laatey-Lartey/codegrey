import {
  Check,
  Code2,
  FolderOpen,
  GitBranch,
  Lock,
} from "lucide-react";
import { useMemo, useState } from "react";
import "./onboarding.css";

export type Intent = "build" | "fix" | "review" | "learn" | "explore";
export type WorkspaceMode = "local" | "git" | "blank";

const intents: Array<{ id: Intent; label: string }> = [
  { id: "build", label: "Build" },
  { id: "fix", label: "Fix" },
  { id: "review", label: "Review" },
  { id: "learn", label: "Learn" },
  { id: "explore", label: "Explore" },
];

const workspaceModes: Array<{
  id: WorkspaceMode;
  label: string;
  detail: string;
  icon: typeof FolderOpen;
}> = [
  {
    id: "local",
    label: "Open a folder",
    detail: "Use local files.",
    icon: FolderOpen,
  },
  {
    id: "git",
    label: "Clone a repo",
    detail: "From GitHub or URL.",
    icon: GitBranch,
  },
  {
    id: "blank",
    label: "New workspace",
    detail: "Start empty.",
    icon: Code2,
  },
];

export function Onboarding({
  onComplete,
}: {
  onComplete: (mode: WorkspaceMode, options?: { repoUrl?: string }) => void | Promise<void>;
}) {
  const [selectedIntent, setSelectedIntent] = useState<Intent>("build");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("local");
  const [indexingEnabled, setIndexingEnabled] = useState(true);
  const [repoUrl, setRepoUrl] = useState("");

  const selectedWorkspace = useMemo(
    () => workspaceModes.find((mode) => mode.id === workspaceMode)!,
    [workspaceMode]
  );

  return (
    <section className="onboarding-panel" aria-labelledby="onboarding-title">
      <div className="intro">
        <p className="eyebrow">Codegrey</p>
        <h1 id="onboarding-title">What are we doing first?</h1>
        <p className="subtitle">
          Pick a starting point. You can change this once your workspace opens.
        </p>
      </div>

      <div className="intent-grid" aria-label="First task">
        {intents.map((intent) => (
          <button
            className="choice-button"
            data-selected={selectedIntent === intent.id}
            key={intent.id}
            type="button"
            onClick={() => setSelectedIntent(intent.id)}
          >
            <span>{intent.label}</span>
            {selectedIntent === intent.id ? <Check size={16} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      <div className="workspace-options" aria-label="Workspace start options">
        {workspaceModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              className="workspace-option"
              data-selected={workspaceMode === mode.id}
              key={mode.id}
              type="button"
              onClick={() => setWorkspaceMode(mode.id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.detail}</small>
              </span>
            </button>
          );
        })}
      </div>

      {workspaceMode === "git" ? (
        <label className="repo-field">
          <span>Repository URL</span>
          <input
            type="url"
            value={repoUrl}
            placeholder="https://github.com/org/project"
            onChange={(event) => setRepoUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && repoUrl.trim()) {
                void onComplete("git", { repoUrl: repoUrl.trim() });
              }
            }}
          />
        </label>
      ) : null}

      <div className="preference-row">
        <button
          className="toggle"
          data-enabled={indexingEnabled}
          type="button"
          role="switch"
          aria-checked={indexingEnabled}
          onClick={() => setIndexingEnabled((enabled) => !enabled)}
        >
          <span />
        </button>
        <div>
          <span>Index workspace for better code answers</span>
          <small>Local-first context. You stay in control of what gets shared.</small>
        </div>
        <Lock size={15} aria-hidden="true" />
      </div>

      <button
        className="primary-action"
        disabled={workspaceMode === "git" && !repoUrl.trim()}
        onClick={() => void onComplete(workspaceMode, { repoUrl: repoUrl.trim() })}
      >
        Continue
      </button>
    </section>
  );
}
