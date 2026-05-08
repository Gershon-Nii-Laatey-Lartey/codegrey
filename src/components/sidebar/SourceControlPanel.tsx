import { Check, Circle, GitBranch, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type GitFile = { path: string; index: string; workingTree: string };
type GitStatus = { ok: boolean; branch?: string; files: GitFile[]; error?: string };
type GitActionResult = { ok: boolean; error?: string };

export function SourceControlPanel({
  workspaceRoot,
  onOpenFile,
  onStatusChange,
}: {
  workspaceRoot: string | null;
  onOpenFile: (path: string) => void;
  onStatusChange?: (status: GitStatus) => void;
}) {
  const [status, setStatus] = useState<GitStatus>({ ok: true, files: [] });
  const [commitMessage, setCommitMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    if (!workspaceRoot) {
      setStatus({ ok: true, files: [] });
      return;
    }
    const next = await window.codegrey?.git?.status?.();
    const normalized = next ?? { ok: false, files: [], error: "Git is unavailable." };
    setStatus(normalized);
    onStatusChange?.(normalized);
  };

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("codegrey:explorer-refresh", onRefresh);
    return () => window.removeEventListener("codegrey:explorer-refresh", onRefresh);
  }, [workspaceRoot]);

  const stagedCount = useMemo(
    () => status.files.filter((file) => file.index.trim() && file.index !== "?").length,
    [status.files]
  );
  const unstagedCount = useMemo(
    () => status.files.filter((file) => file.workingTree.trim() || file.index === "?").length,
    [status.files]
  );
  const noRepo = Boolean(status.error && /not a git repository/i.test(status.error));
  const sourceReady = Boolean(workspaceRoot && status.ok);
  const branchLabel = formatBranch(status.branch);
  const stagedFiles = status.files.filter((file) => file.index.trim() && file.index !== "?");
  const changedFiles = status.files.filter((file) => file.workingTree.trim() || file.index === "?");

  const runGitAction = async (action: () => Promise<GitActionResult>) => {
    setBusy(true);
    setNotice("");
    const result = await action();
    if (result && !result.ok) setNotice(result.error || "Git action failed.");
    await refresh();
    setBusy(false);
  };

  const commit = async () => {
    const message = commitMessage.trim();
    if (!message) return;
    await runGitAction(async () => {
      const result = await window.codegrey?.git?.commit?.(message);
      if (result?.ok) setCommitMessage("");
      return result ?? { ok: false, error: "Git is unavailable." };
    });
  };

  const stage = (filePath?: string) =>
    window.codegrey?.git?.stage?.(filePath) ?? Promise.resolve({ ok: false, error: "Git is unavailable." });

  const unstage = (filePath?: string) =>
    window.codegrey?.git?.unstage?.(filePath) ?? Promise.resolve({ ok: false, error: "Git is unavailable." });

  const rootPrefix = workspaceRoot ? `${workspaceRoot}\\` : "";

  return (
    <div className="sidebar-tool-panel">
      <div className="source-header">
        <div>
          <span>{branchLabel}</span>
          <small>{workspaceRoot ? changeSummary(status.files.length, stagedCount) : "No workspace open"}</small>
        </div>
        <button type="button" data-tooltip="Refresh" disabled={!workspaceRoot || busy} onClick={() => void refresh()}>
          <RefreshCw size={14} />
        </button>
      </div>

      {!workspaceRoot ? (
        <div className="source-empty-state">
          <GitBranch size={18} />
          <span>Open a workspace to use source control.</span>
        </div>
      ) : noRepo ? (
        <div className="source-empty-state">
          <GitBranch size={18} />
          <span>No git repository found.</span>
          <small>Open a folder with a `.git` directory to review changes.</small>
        </div>
      ) : status.error ? (
        <div className="source-empty-state source-error">
          <span>{status.error}</span>
        </div>
      ) : null}

      {sourceReady ? (
        <>
          <textarea
            className="source-message"
            rows={3}
            value={commitMessage}
            placeholder="Commit message"
            disabled={busy}
            onChange={(event) => setCommitMessage(event.target.value)}
          />
          <button
            className="sidebar-primary-inline"
            type="button"
            disabled={busy || !commitMessage.trim() || stagedCount === 0}
            onClick={() => void commit()}
          >
            Commit
          </button>

          <div className="source-actions-row">
            <button
              type="button"
              disabled={busy || status.files.length === 0}
              onClick={() => void runGitAction(() => stage())}
            >
              <Check size={13} />
              <span>Stage all</span>
            </button>
            <button
              type="button"
              disabled={busy || stagedCount === 0}
              onClick={() => void runGitAction(() => unstage())}
            >
              <Undo2 size={13} />
              <span>Unstage all</span>
            </button>
          </div>
        </>
      ) : null}

      {notice ? <div className="sidebar-empty-note">{notice}</div> : null}

      {sourceReady ? <div className="source-file-list">
        {stagedFiles.length ? (
          <SourceGroup
            title="Staged Changes"
            files={stagedFiles}
            rootPrefix={rootPrefix}
            busy={busy}
            action="unstage"
            onOpenFile={onOpenFile}
            onAction={(path) => void runGitAction(() => unstage(path))}
          />
        ) : null}
        {changedFiles.length ? (
          <SourceGroup
            title="Changes"
            files={changedFiles}
            rootPrefix={rootPrefix}
            busy={busy}
            action="stage"
            onOpenFile={onOpenFile}
            onAction={(path) => void runGitAction(() => stage(path))}
          />
        ) : null}
        {workspaceRoot && status.ok && status.files.length === 0 ? (
          <div className="source-empty-state">
            <Check size={18} />
            <span>Working tree clean</span>
          </div>
        ) : null}
      </div> : null}
    </div>
  );
}

function SourceGroup({
  title,
  files,
  rootPrefix,
  busy,
  action,
  onOpenFile,
  onAction,
}: {
  title: string;
  files: GitFile[];
  rootPrefix: string;
  busy: boolean;
  action: "stage" | "unstage";
  onOpenFile: (path: string) => void;
  onAction: (path: string) => void;
}) {
  return (
    <div className="source-group">
      <div className="source-group-title">
        <span>{title}</span>
        <small>{files.length}</small>
      </div>
      {files.map((file) => {
        const fullPath = rootPrefix ? rootPrefix + file.path.replace(/\//g, "\\") : file.path;
        return (
          <div className="source-file-row" key={`${title}-${file.path}-${file.index}-${file.workingTree}`}>
            <button type="button" onClick={() => onOpenFile(fullPath)}>
              <Circle size={7} fill="currentColor" />
              <span>{file.path}</span>
              <strong data-kind={statusKind(file)}>{statusCode(file)}</strong>
            </button>
            <div className="source-file-actions">
              <button type="button" data-tooltip={action === "stage" ? "Stage" : "Unstage"} disabled={busy} onClick={() => onAction(file.path)}>
                {action === "stage" ? <Check size={12} /> : <Undo2 size={12} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusCode(file: GitFile) {
  if (file.index === "?") return "U";
  return (file.workingTree.trim() || file.index.trim() || "M").toUpperCase();
}

function statusKind(file: GitFile) {
  const code = statusCode(file);
  if (code === "A" || code === "U") return "add";
  if (code === "D") return "delete";
  return "modify";
}

function changeSummary(total: number, staged: number) {
  if (total === 0) return "No changes";
  return `${total} ${total === 1 ? "change" : "changes"}${staged ? `, ${staged} staged` : ""}`;
}

function formatBranch(branch?: string) {
  if (!branch) return "Source Control";
  return branch.replace(/^No commits yet on\s+/i, "");
}
