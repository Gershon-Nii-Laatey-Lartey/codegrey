import {
  Check,
  Copy,
  FileText,
  Folder,
  GitBranch,
  LoaderCircle,
  Pencil,
  Search,
  SquareTerminal,
  Terminal,
  Wrench,
  X,
  ChevronDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatMessagePart } from "../../types/ai";
import { getFileIcon, getBaseName } from "../../lib/utils";

const McpIcon = ({ size = 14 }: { size?: number }) => (
  <svg fill="currentColor" fillRule="evenodd" height={size} width={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z" />
    <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z" />
  </svg>
);

type ToolPart = Extract<ChatMessagePart, { type: "tool_call" }>;

function parseMcp(name: string): { isMcp: boolean; server: string; tool: string } {
  const m = name.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (m) return { isMcp: true, server: m[1], tool: m[2] };
  return { isMcp: false, server: "", tool: name };
}

export function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const mcp = useMemo(() => parseMcp(part.name), [part.name]);
  const summary = useMemo(() => summarizeTool(part.name, part.input, mcp), [part.name, part.input, mcp]);
  const label = useMemo(() => labelTool(part.name, part.status, mcp), [part.name, part.status, mcp]);

  const iconData = useMemo(() => {
    if (part.name === "read_file" || part.name === "write_file" || part.name === "patch_file") {
      const filePath = (part.input as any)?.filePath || (part.input as any)?.path;
      if (filePath) return getFileIcon(getBaseName(filePath));
    }
    if (part.name === "list_directory") return getFileIcon("folder", true);
    return null;
  }, [part.name, part.input]) as { svg?: string; char?: string; color?: string } | null;

  const canExpand = mcp.isMcp || !["read_file", "list_directory", "write_file", "patch_file"].includes(part.name);
  const Icon = mcp.isMcp ? null : iconForTool(part.name);

  let displayResult: React.ReactNode = null;
  if (canExpand && open) {
    if (part.name === "run_command" && part.result !== undefined && part.result !== null) {
      const res = part.result as any;
      let stdout = "";
      let stderr = "";
      let exitCode: number | undefined;

      if (typeof res === "string") {
        stdout = res;
      } else if (typeof res === "object") {
        stdout = typeof res.stdout === 'string' ? res.stdout : (res.stdout ? JSON.stringify(res.stdout, null, 2) : "");
        stderr = typeof res.stderr === 'string' ? res.stderr : (res.stderr ? JSON.stringify(res.stderr, null, 2) : "");
        exitCode = res.exit_code ?? res.exitCode;
        if (!stdout && !stderr && exitCode === undefined) {
          stdout = JSON.stringify(res, null, 2);
        }
      } else {
        stdout = String(res);
      }

      displayResult = (
        <div className="minimal-cmd-output">
          {stdout && <pre className="cmd-out">{stdout}</pre>}
          {stderr && <pre className="cmd-err">{stderr}</pre>}
          {exitCode !== undefined && <div className="cmd-exit">Exit {exitCode}</div>}
        </div>
      );
    } else {
      displayResult = (
        <pre className="generic-tool-output">
          {JSON.stringify({ input: part.input, result: part.result }, null, 2)}
        </pre>
      );
    }
  }

  return (
    <div className="tool-call-card minimal" data-status={part.status} data-open={open ? "true" : "false"} data-mcp={mcp.isMcp ? "true" : undefined}>
      <button
        className="tool-call-main"
        type="button"
        onClick={() => canExpand && setOpen((value) => !value)}
        style={{ cursor: canExpand ? "pointer" : "default" }}
      >
        <span className="tool-call-icon">
          {part.status === "running" ? (
            <LoaderCircle size={14} className="spin" />
          ) : mcp.isMcp ? (
            <McpIcon size={14} />
          ) : part.name === "list_directory" ? (
            <Folder size={14} strokeWidth={1.5} style={{ color: iconData?.color || "var(--muted)" }} />
          ) : iconData?.svg ? (
            <img src={iconData.svg} alt="" style={{ width: 14, height: 14 }} />
          ) : (iconData as any)?.char ? (
            <span className="seti-icon" style={{ color: (iconData as any).color || "inherit", fontSize: "14px" }}>{(iconData as any).char}</span>
          ) : Icon ? (
            <Icon size={14} />
          ) : (
            <Wrench size={14} />
          )}
        </span>
        <span className="tool-call-text">
          <strong>{label}</strong>
          {summary ? <small>{summary}</small> : null}
          {mcp.isMcp && (
            <span className="tool-call-mcp-tag">{mcp.server}</span>
          )}
        </span>
        <span className="tool-call-status">
          {part.status === "done" ? <Check size={14} /> : part.status === "error" ? <X size={14} /> : null}
          {canExpand && <ChevronDown size={14} className="tool-expand-chevron" />}
        </span>
      </button>
      {canExpand && open ? (
        <div className="tool-call-details">
          {displayResult}
        </div>
      ) : null}
    </div>
  );
}

function labelTool(name: string, status: ToolPart["status"], mcp: { isMcp: boolean; tool: string }) {
  const running = status === "running";
  if (mcp.isMcp) {
    const pretty = mcp.tool.replace(/_/g, " ");
    return running ? `Running ${pretty}` : pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }
  switch (name) {
    case "run_command": return running ? "Running command" : "Ran command";
    case "read_file": return running ? "Reading file" : "Read file";
    case "write_file": return running ? "Preparing edit" : "Prepared edit";
    case "patch_file": return running ? "Preparing patch" : "Prepared patch";
    case "list_directory": return running ? "Reading workspace" : "Read workspace";
    case "search_codebase": return running ? "Searching codebase" : "Searched codebase";
    case "find_files": return running ? "Finding files" : "Found files";
    case "git_diff": return running ? "Checking git diff" : "Checked git diff";
    case "git_log": return running ? "Reading git history" : "Read git history";
    case "get_diagnostics": return running ? "Checking diagnostics" : "Checked diagnostics";
    case "get_symbol_info": return running ? "Looking up symbol" : "Looked up symbol";
    case "web_search": return running ? "Searching web" : "Searched web";
    default: return running ? `Running ${name.replace(/_/g, " ")}` : `Used ${name.replace(/_/g, " ")}`;
  }
}

function iconForTool(name: string) {
  if (name === "run_command") return SquareTerminal;
  if (name === "read_file" || name === "list_directory" || name === "find_files") return FileText;
  if (name === "write_file" || name === "patch_file") return Pencil;
  if (name === "search_codebase" || name === "web_search" || name === "get_symbol_info") return Search;
  if (name === "git_diff" || name === "git_log") return GitBranch;
  return Wrench;
}

function summarizeTool(name: string, input: unknown, mcp: { isMcp: boolean; tool: string }) {
  if (!input || typeof input !== "object") return "";
  const data = input as Record<string, unknown>;
  if (name === "run_command" && typeof data.command === "string") return data.command;
  if (typeof data.filePath === "string") return data.filePath;
  if (typeof data.path === "string") return data.path;
  if (typeof data.pattern === "string") return data.pattern;
  if (typeof data.query === "string") return data.query;
  if (typeof data.url === "string") return data.url;
  if (mcp.isMcp) {
    const first = Object.values(data).find((v) => typeof v === "string") as string | undefined;
    return first ? (first.length > 60 ? first.slice(0, 57) + "…" : first) : "";
  }
  return "";
}
