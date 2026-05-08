import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader,
  Plus,
  RefreshCw,
  Settings,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const MCP_BASE = "http://localhost:3173/api";

export type McpServer = {
  id: string;
  label: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  autoStart?: boolean;
  enabled?: boolean;
  status: "connected" | "connecting" | "error" | "stopped" | "disconnected";
  toolCount?: number;
  tools?: { name: string; description?: string }[];
  error?: string;
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${MCP_BASE}${path}`, opts);
  return res.json();
}

function StatusDot({ status }: { status: McpServer["status"] }) {
  if (status === "connected")
    return <CheckCircle2 size={11} className="mcp-status-dot connected" />;
  if (status === "connecting" || status === "error" && false)
    return <Loader size={11} className="mcp-status-dot spin connecting" />;
  if (status === "error")
    return <AlertCircle size={11} className="mcp-status-dot error" />;
  return <Circle size={11} className="mcp-status-dot stopped" />;
}

function ServerCard({
  server,
  onRefresh,
}: {
  server: McpServer;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const doStart = async () => {
    setLoading(true);
    await apiFetch(`/mcp/servers/${server.id}/start`, { method: "POST" });
    onRefresh();
    setLoading(false);
  };

  const doStop = async () => {
    setLoading(true);
    await apiFetch(`/mcp/servers/${server.id}/stop`, { method: "POST" });
    onRefresh();
    setLoading(false);
  };

  const doRemove = async () => {
    setLoading(true);
    await apiFetch(`/mcp/servers/${server.id}`, { method: "DELETE" });
    onRefresh();
    setLoading(false);
  };

  const isConnected = server.status === "connected";
  const tools = server.tools ?? [];

  return (
    <div className={`mcp-server-card ${server.status}`} data-status={server.status}>
      <div className="mcp-server-header">
        <button
          type="button"
          className="mcp-server-expand"
          onClick={() => tools.length > 0 && setExpanded((v) => !v)}
          style={{ cursor: tools.length > 0 ? "pointer" : "default" }}
        >
          <StatusDot status={server.status} />
          <span className="mcp-server-label">{server.label}</span>
          {tools.length > 0 && (
            <span className="mcp-server-tool-count">{tools.length} tools</span>
          )}
          {tools.length > 0 &&
            (expanded ? <ChevronDown size={11} className="mcp-chevron" /> : <ChevronRight size={11} className="mcp-chevron" />)}
        </button>

        <div className="mcp-server-actions">
          {isConnected ? (
            <button
              type="button"
              className="mcp-action-btn"
              title="Stop"
              onClick={doStop}
              disabled={loading}
            >
              <Square size={11} />
            </button>
          ) : (
            <button
              type="button"
              className="mcp-action-btn start"
              title="Connect"
              onClick={doStart}
              disabled={loading}
            >
              {loading ? <Loader size={11} className="spin" /> : <RefreshCw size={11} />}
            </button>
          )}
          <button
            type="button"
            className="mcp-action-btn danger"
            title="Remove"
            onClick={doRemove}
            disabled={loading}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {server.error && (
        <div className="mcp-server-error">{server.error}</div>
      )}

      {expanded && tools.length > 0 && (
        <div className="mcp-tool-list">
          {tools.map((t) => (
            <div key={t.name} className="mcp-tool-item">
              <Wrench size={10} className="mcp-tool-icon" />
              <span className="mcp-tool-name">{t.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function McpPanel({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/mcp/servers");
      setServers(data.servers ?? []);
      setError(null);
    } catch {
      setError("MCP backend not reachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [load]);

  const connected = servers.filter((s) => s.status === "connected").length;

  return (
    <div className="mcp-panel">
      <div className="mcp-panel-toolbar">
        <span className="mcp-panel-stat">
          {loading ? "…" : error ? "offline" : `${connected}/${servers.length} connected`}
        </span>
        <div className="mcp-panel-actions">
          <button
            type="button"
            className="mcp-panel-icon-btn"
            title="Refresh"
            onClick={() => void load()}
          >
            <RefreshCw size={13} />
          </button>
          {onOpenSettings && (
            <button
              type="button"
              className="mcp-panel-icon-btn"
              title="Manage MCP Servers"
              onClick={onOpenSettings}
            >
              <Plus size={13} />
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mcp-panel-offline">
          <AlertCircle size={20} />
          <p>MCP backend offline</p>
          <small>Start the MCP server to manage connections</small>
        </div>
      ) : loading ? (
        <div className="mcp-panel-loading">
          <Loader size={16} className="spin" />
        </div>
      ) : servers.length === 0 ? (
        <div className="mcp-panel-empty">
          <p>No MCP servers configured</p>
          {onOpenSettings && (
            <button
              type="button"
              className="sidebar-btn sidebar-btn-primary"
              style={{ marginTop: 8 }}
              onClick={onOpenSettings}
            >
              Add Server
            </button>
          )}
        </div>
      ) : (
        <div className="mcp-server-list">
          {servers.map((s) => (
            <ServerCard key={s.id} server={s} onRefresh={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}
