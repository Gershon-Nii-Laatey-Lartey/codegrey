import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { McpServer } from "../components/sidebar/McpPanel";

const MCP_BASE = "http://localhost:3173/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${MCP_BASE}${path}`, opts);
  return res.json();
}

const EMPTY_FORM = {
  label: "",
  transport: "stdio" as "stdio" | "sse",
  command: "",
  args: "",
  url: "",
  autoStart: true,
  enabled: true,
};

function StatusBadge({ status }: { status: McpServer["status"] }) {
  const map: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting…",
    error: "Error",
    stopped: "Stopped",
    disconnected: "Disconnected",
  };
  return (
    <span className={`mcp-settings-badge ${status}`}>
      {status === "connected" && <CheckCircle2 size={10} />}
      {status === "error" && <AlertCircle size={10} />}
      {(status === "stopped" || status === "disconnected") && <Circle size={10} />}
      {status === "connecting" && <Loader size={10} className="spin" />}
      {map[status] ?? status}
    </span>
  );
}

function ServerRow({
  server,
  onRefresh,
}: {
  server: McpServer;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const tools = server.tools ?? [];
  const isConnected = server.status === "connected";

  const act = async (path: string, method = "POST") => {
    setBusy(true);
    await apiFetch(path, { method });
    onRefresh();
    setBusy(false);
  };

  return (
    <div className={`mcp-settings-row`} data-status={server.status}>
      <div className="mcp-settings-row-main">
        <div className="mcp-settings-row-info">
          <span className="mcp-settings-row-label">{server.label}</span>
          <span className="mcp-settings-row-sub">
            {server.transport === "stdio" ? server.command : server.url}
          </span>
        </div>

        <div className="mcp-settings-row-right">
          <StatusBadge status={server.status} />

          {tools.length > 0 && (
            <button
              type="button"
              className="mcp-settings-tools-btn"
              onClick={() => setExpanded((v) => !v)}
            >
              <Wrench size={11} />
              {tools.length}
              <ChevronDown size={10} style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
            </button>
          )}

          {isConnected ? (
            <button
              type="button"
              className="mcp-settings-action-btn"
              title="Stop"
              onClick={() => act(`/mcp/servers/${server.id}/stop`)}
              disabled={busy}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="mcp-settings-action-btn start"
              title="Connect"
              onClick={() => act(`/mcp/servers/${server.id}/start`)}
              disabled={busy}
            >
              {busy ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
            </button>
          )}

          <button
            type="button"
            className="mcp-settings-action-btn danger"
            title="Delete"
            onClick={() => act(`/mcp/servers/${server.id}`, "DELETE")}
            disabled={busy}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {server.error && (
        <div className="mcp-settings-error">{server.error}</div>
      )}

      {expanded && tools.length > 0 && (
        <div className="mcp-settings-tool-grid">
          {tools.map((t: { name: string; description?: string }) => (
            <div key={t.name} className="mcp-settings-tool-chip" title={t.description ?? t.name}>
              <Wrench size={9} />
              <span>{t.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddServerForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.label.trim()) { setErr("Label is required"); return; }
    if (form.transport === "stdio" && !form.command.trim()) { setErr("Command is required"); return; }
    if (form.transport === "sse" && !form.url.trim()) { setErr("URL is required"); return; }
    setSaving(true);
    setErr("");
    try {
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        transport: form.transport,
        autoStart: form.autoStart,
        enabled: form.enabled,
      };
      if (form.transport === "stdio") {
        body.command = form.command.trim();
        body.args = form.args.trim()
          ? form.args.trim().split(/\s+/)
          : [];
      } else {
        body.url = form.url.trim();
      }
      const res = await apiFetch("/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.error) { setErr(res.error); return; }
      setForm(EMPTY_FORM);
      onAdded();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mcp-add-form">
      <div className="mcp-add-form-title">
        <Plus size={13} />
        Add MCP Server
      </div>

      <div className="mcp-form-grid">
        <div className="mcp-form-field">
          <label>Label</label>
          <input
            type="text"
            placeholder="e.g. Filesystem, GitHub, Postgres"
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
          />
        </div>

        <div className="mcp-form-field">
          <label>Transport</label>
          <div className="mcp-transport-toggle">
            {(["stdio", "sse"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={form.transport === t ? "active" : ""}
                onClick={() => set("transport", t)}
              >
                {t === "stdio" ? "Stdio (local)" : "SSE (remote)"}
              </button>
            ))}
          </div>
        </div>

        {form.transport === "stdio" ? (
          <>
            <div className="mcp-form-field">
              <label>Command</label>
              <input
                type="text"
                placeholder="e.g. npx, node, python"
                value={form.command}
                onChange={(e) => set("command", e.target.value)}
              />
            </div>
            <div className="mcp-form-field">
              <label>Arguments <span className="mcp-form-optional">(space-separated)</span></label>
              <input
                type="text"
                placeholder='-y @modelcontextprotocol/server-filesystem /Users/me'
                value={form.args}
                onChange={(e) => set("args", e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="mcp-form-field">
            <label>URL</label>
            <input
              type="text"
              placeholder="https://my-mcp-server.example.com/sse"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
            />
          </div>
        )}

        <div className="mcp-form-row">
          <label className="mcp-checkbox-label">
            <input
              type="checkbox"
              checked={form.autoStart}
              onChange={(e) => set("autoStart", e.target.checked)}
            />
            Connect on startup
          </label>
        </div>
      </div>

      {err && <div className="mcp-form-error"><AlertCircle size={12} />{err}</div>}

      <div className="mcp-form-actions">
        <button
          type="button"
          className="mcp-btn-primary"
          onClick={submit}
          disabled={saving}
        >
          {saving ? <Loader size={13} className="spin" /> : <Plus size={13} />}
          Add Server
        </button>
      </div>
    </div>
  );
}

export function McpSettings({ onBack }: { onBack: () => void }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/mcp/servers");
      setServers(data.servers ?? []);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connected = servers.filter((s) => s.status === "connected").length;

  return (
    <div className="mcp-settings-page">
      <div className="settings-header">
        <button type="button" className="settings-back-btn" onClick={onBack}>
          <X size={16} />
        </button>
        <div>
          <h2 className="settings-title">MCP Servers</h2>
          <p className="settings-subtitle">
            {offline
              ? "MCP backend offline"
              : loading
              ? "Loading…"
              : `${connected} of ${servers.length} connected`}
          </p>
        </div>
      </div>

      {offline ? (
        <div className="mcp-settings-offline">
          <AlertCircle size={28} />
          <p>MCP backend is not running</p>
          <small>Start the MCP backend (port 3173) to manage servers</small>
        </div>
      ) : (
        <>
          <AddServerForm onAdded={() => void load()} />

          {!loading && servers.length > 0 && (
            <div className="mcp-settings-server-list">
              <div className="mcp-settings-list-header">
                <span>Configured Servers</span>
                <button
                  type="button"
                  className="mcp-settings-refresh-btn"
                  onClick={() => void load()}
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </div>
              {servers.map((s) => (
                <ServerRow key={s.id} server={s} onRefresh={() => void load()} />
              ))}
            </div>
          )}

          {!loading && servers.length === 0 && (
            <div className="mcp-settings-empty">
              <p>No servers configured yet. Add one above.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
