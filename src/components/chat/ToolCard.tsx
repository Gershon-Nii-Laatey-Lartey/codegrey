import {
  Check,
  ChevronDown,
  FileText,
  Folder,
  GitBranch,
  LoaderCircle,
  Pencil,
  Search,
  SquareTerminal,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatMessagePart } from "../../types/ai";
import { getFileIcon, getBaseName } from "../../lib/utils";

type ToolPart = Extract<ChatMessagePart, { type: "tool_call" }>;

export function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => summarizeTool(part.name, part.input), [part.name, part.input]);
  const label = useMemo(() => labelTool(part.name, part.status), [part.name, part.status]);
  
  const iconData = useMemo(() => {
    if (part.name === "read_file" || part.name === "write_file" || part.name === "patch_file") {
      const filePath = (part.input as any)?.filePath || (part.input as any)?.path;
      if (filePath) {
        return getFileIcon(getBaseName(filePath));
      }
    }
    if (part.name === "list_directory") {
      return getFileIcon("folder", true);
    }
    return null;
  }, [part.name, part.input]) as { svg?: string; char?: string; color?: string } | null;

  const canExpand = !["read_file", "list_directory", "write_file", "patch_file"].includes(part.name);
  const Icon = iconForTool(part.name);

  return (
    <div className="tool-call-card" data-status={part.status} data-open={open ? "true" : "false"}>
      <button 
        className="tool-call-main" 
        type="button" 
        onClick={() => canExpand && setOpen((value) => !value)}
        style={{ cursor: canExpand ? 'pointer' : 'default' }}
      >
        <span className="tool-call-icon">
          {part.status === "running" ? (
            <LoaderCircle size={14} className="spin" />
          ) : part.name === "list_directory" ? (
            <Folder size={16} strokeWidth={1.5} style={{ color: iconData?.color || 'var(--muted)' }} />
          ) : iconData?.svg ? (
            <img src={iconData.svg} alt="" style={{ width: 16, height: 16 }} />
          ) : (iconData as any)?.char ? (
            <span className="seti-icon" style={{ color: (iconData as any).color || 'inherit', fontSize: '16px' }}>{(iconData as any).char}</span>
          ) : (
            <Icon size={14} />
          )}
        </span>
        <span className="tool-call-text">
          <strong>{label}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <span className="tool-call-status">
          {part.status === "done" ? <Check size={14} /> : part.status === "error" ? <X size={14} /> : null}
          {canExpand && <ChevronDown size={14} />}
        </span>
      </button>
      {canExpand && open ? (
        <div className="tool-call-details">
          <pre>{JSON.stringify({ input: part.input, result: part.result }, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}

function labelTool(name: string, status: ToolPart["status"]) {
  const running = status === "running";
  switch (name) {
    case "run_command":
      return running ? "Running command" : "Ran command";
    case "read_file":
      return running ? "Reading file" : "Read file";
    case "write_file":
      return running ? "Preparing edit" : "Prepared edit";
    case "patch_file":
      return running ? "Preparing patch" : "Prepared patch";
    case "list_directory":
      return running ? "Reading workspace" : "Read workspace";
    case "search_codebase":
      return running ? "Searching codebase" : "Searched codebase";
    case "find_files":
      return running ? "Finding files" : "Found files";
    case "git_diff":
      return running ? "Checking git diff" : "Checked git diff";
    case "git_log":
      return running ? "Reading git history" : "Read git history";
    case "get_diagnostics":
      return running ? "Checking diagnostics" : "Checked diagnostics";
    case "get_symbol_info":
      return running ? "Looking up symbol" : "Looked up symbol";
    case "web_search":
      return running ? "Searching web" : "Searched web";
    default:
      return running ? `Running ${name.replace(/_/g, " ")}` : `Used ${name.replace(/_/g, " ")}`;
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

function summarizeTool(name: string, input: unknown) {
  if (!input || typeof input !== "object") return "";
  const data = input as Record<string, unknown>;
  if (name === "run_command" && typeof data.command === "string") return data.command;
  if (typeof data.filePath === "string") return data.filePath;
  if (typeof data.path === "string") return data.path;
  if (typeof data.pattern === "string") return data.pattern;
  if (typeof data.query === "string") return data.query;
  if (typeof data.url === "string") return data.url;
  return "";
}
