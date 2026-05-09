import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  Globe,
  Loader,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { McpServer } from "../components/sidebar/McpPanel";

const MCP_BASE = "http://localhost:3173/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${MCP_BASE}${path}`, opts);
  return res.json();
}

type McpPreset = {
  id: string;
  name: string;
  description: string;
  logo: string;
  category: "Infrastructure" | "Database" | "Platform" | "AI/ML" | "Tools" | "Communication";
  command: string;
  args: string[];
  env?: string[];
  docs?: string;
};

const LOGO_BASE = "https://id-preview--04de67e2-e451-4c83-88ee-80059e54f053.lovable.app/api/logo";

const MCP_PRESETS: McpPreset[] = [
  { id: "github", name: "GitHub", description: "Manage repositories, issues, and pull requests.", logo: "github", category: "Tools", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: ["GITHUB_PERSONAL_ACCESS_TOKEN"], docs: "https://github.com/settings/tokens" },
  { id: "supabase", name: "Supabase", description: "Query your Postgres database and manage storage.", logo: "supabase", category: "Database", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgres://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"] },
  { id: "vercel", name: "Vercel", description: "Manage deployments and projects on Vercel.", logo: "vercel", category: "Platform", command: "npx", args: ["-y", "mcp-server-vercel"], env: ["VERCEL_TOKEN"] },
  { id: "cloudflare", name: "Cloudflare", description: "Interact with Cloudflare Workers and KV.", logo: "cloudflare", category: "Infrastructure", command: "npx", args: ["-y", "@cloudflare/mcp-server-cloudflare"], env: ["CLOUDFLARE_API_TOKEN"] },
  { id: "neon", name: "Neon", description: "Serverless Postgres database management.", logo: "neon", category: "Database", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgres://[USER]:[PASSWORD]@[HOST]/neondb"] },
  { id: "notion", name: "Notion", description: "Search and read Notion pages and databases.", logo: "notion", category: "Tools", command: "npx", args: ["-y", "@modelcontextprotocol/server-notion"], env: ["NOTION_TOKEN"] },
  { id: "slack", name: "Slack", description: "Read and send messages to Slack channels.", logo: "slack", category: "Communication", command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"], env: ["SLACK_BOT_TOKEN"] },
  { id: "linear", name: "Linear", description: "Manage Linear issues and projects.", logo: "linear", category: "Tools", command: "npx", args: ["-y", "@modelcontextprotocol/server-linear"], env: ["LINEAR_API_KEY"] },
  { id: "stripe", name: "Stripe", description: "View customers, charges, and subscriptions.", logo: "stripe", category: "Platform", command: "npx", args: ["-y", "mcp-server-stripe"], env: ["STRIPE_API_KEY"] },
  { id: "sentry", name: "Sentry", description: "Retrieve error reports and project data.", logo: "sentry", category: "Tools", command: "npx", args: ["-y", "@modelcontextprotocol/server-sentry"], env: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG"] },
  { id: "posthog", name: "PostHog", description: "Analyze product analytics and features.", logo: "posthog", category: "Platform", command: "npx", args: ["-y", "mcp-server-posthog"], env: ["POSTHOG_API_KEY"] },
  { id: "clerk", name: "Clerk", description: "Manage users and authentication with Clerk.", logo: "clerk", category: "Platform", command: "npx", args: ["-y", "mcp-server-clerk"], env: ["CLERK_SECRET_KEY"] },
  { id: "auth0", name: "Auth0", description: "Identity management and user data.", logo: "auth0", category: "Platform", command: "npx", args: ["-y", "mcp-server-auth0"], env: ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET"] },
  { id: "workos", name: "WorkOS", description: "Enterprise SSO and identity management.", logo: "workos", category: "Platform", command: "npx", args: ["-y", "mcp-server-workos"], env: ["WORKOS_API_KEY"] },
  { id: "qdrant", name: "Qdrant", description: "Vector database for semantic search.", logo: "qdrant", category: "AI/ML", command: "npx", args: ["-y", "mcp-server-qdrant"], env: ["QDRANT_URL", "QDRANT_API_KEY"] },
  { id: "pinecone", name: "Pinecone", description: "Managed vector database for AI apps.", logo: "pinecone", category: "AI/ML", command: "npx", args: ["-y", "mcp-server-pinecone"], env: ["PINECONE_API_KEY"] },
  { id: "weaviate", name: "Weaviate", description: "Open source vector search engine.", logo: "weaviate", category: "AI/ML", command: "npx", args: ["-y", "mcp-server-weaviate"], env: ["WEAVIATE_URL", "WEAVIATE_API_KEY"] },
  { id: "planetscale", name: "PlanetScale", description: "MySQL database management.", logo: "planetscale", category: "Database", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "mysql://[USER]:[PASSWORD]@[HOST]/db"] },
  { id: "upstash", name: "Upstash", description: "Serverless Redis and Kafka.", logo: "upstash", category: "Database", command: "npx", args: ["-y", "mcp-server-upstash"], env: ["UPSTASH_REDIS_URL", "UPSTASH_REDIS_TOKEN"] },
  { id: "resend", name: "Resend", description: "Transactional email for developers.", logo: "resend", category: "Platform", command: "npx", args: ["-y", "mcp-server-resend"], env: ["RESEND_API_KEY"] },
  { id: "trigger.dev", name: "Trigger.dev", description: "Background jobs and workflow automation.", logo: "trigger.dev", category: "Infrastructure", command: "npx", args: ["-y", "mcp-server-triggerdotdev"], env: ["TRIGGER_API_KEY"] },
  { id: "langfuse", name: "Langfuse", description: "LLM observability and analytics.", logo: "langfuse", category: "AI/ML", command: "npx", args: ["-y", "mcp-server-langfuse"], env: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"] },
  { id: "openrouter", name: "OpenRouter", description: "Unified API for multiple LLM providers.", logo: "openrouter", category: "AI/ML", command: "npx", args: ["-y", "mcp-server-openrouter"], env: ["OPENROUTER_API_KEY"] },
  { id: "replicate", name: "Replicate", description: "Run machine learning models in the cloud.", logo: "replicate", category: "AI/ML", command: "npx", args: ["-y", "mcp-server-replicate"], env: ["REPLICATE_API_TOKEN"] },
  { id: "render", name: "Render", description: "Cloud platform for hosting apps and sites.", logo: "render", category: "Platform", command: "npx", args: ["-y", "mcp-server-render"], env: ["RENDER_API_KEY"] },
  { id: "netlify", name: "Netlify", description: "Deploy and manage web projects.", logo: "netlify", category: "Platform", command: "npx", args: ["-y", "mcp-server-netlify"], env: ["NETLIFY_AUTH_TOKEN"] },
  { id: "railway", name: "Railway", description: "Deploy infrastructure in seconds.", logo: "railway", category: "Infrastructure", command: "npx", args: ["-y", "mcp-server-railway"], env: ["RAILWAY_API_KEY"] },
  { id: "modal", name: "Modal", description: "Run serverless functions and compute.", logo: "modal", category: "Infrastructure", command: "npx", args: ["-y", "mcp-server-modal"], env: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"] },
  { id: "browser-runtime", name: "DevTools / Browser", description: "Remote control browser and debug.", logo: "browser-runtime", category: "Tools", command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"] },
  { id: "rag-docs", name: "Documentation / RAG", description: "Contextual documentation search.", logo: "rag-docs", category: "Tools", command: "npx", args: ["-y", "@modelcontextprotocol/server-rag-docs"], env: ["RAG_API_KEY"] },
];

const EMPTY_FORM = {
  label: "",
  transport: "stdio" as "stdio" | "sse",
  command: "",
  args: "",
  url: "",
  env: {} as Record<string, string>,
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

  const preset = MCP_PRESETS.find(p => server.label.toLowerCase().includes(p.id.toLowerCase()));

  return (
    <div className={`mcp-settings-row`} data-status={server.status}>
      <div className="mcp-settings-row-main">
        <div className="mcp-settings-row-info">
          <div className="mcp-server-identity">
            {preset ? (
              <img src={`${LOGO_BASE}/${preset.logo}.svg`} className="mcp-server-logo-mini" alt="" />
            ) : (
              <Server size={14} className="mcp-server-logo-mini-fallback" />
            )}
            <span className="mcp-settings-row-label">{server.label}</span>
          </div>
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

function AddServerForm({ onAdded, initialValues }: { onAdded: () => void, initialValues?: typeof EMPTY_FORM }) {
  const [form, setForm] = useState(initialValues || EMPTY_FORM);
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
        env: form.env,
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
      {!initialValues && (
        <div className="mcp-add-form-title">
          <Plus size={13} />
          Add MCP Server
        </div>
      )}

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

        {form.transport === "stdio" && Object.keys(form.env).length > 0 && (
          <div className="mcp-form-env-grid">
            <label className="mcp-form-section-label">Environment Variables</label>
            {Object.keys(form.env).map((key) => (
              <div key={key} className="mcp-form-field">
                <label>{key}</label>
                <input
                  type="password"
                  placeholder={`Value for ${key.toLowerCase().replace(/_/g, ' ')}`}
                  value={form.env[key]}
                  onChange={(e) => {
                    const newEnv = { ...form.env, [key]: e.target.value };
                    set("env", newEnv);
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mcp-form-row mcp-form-toggle-row">
          <label className="mcp-toggle-label">
            <span style={{ fontSize: '10px' }}>Connect on startup</span>
            <div className="mcp-toggle-wrap">
              <input
                type="checkbox"
                checked={form.autoStart}
                onChange={(e) => set("autoStart", e.target.checked)}
              />
              <div className="mcp-toggle-slider"></div>
            </div>
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
          {saving ? <Loader size={13} className="spin" /> : <Check size={14} />}
          {initialValues ? "Confirm Setup" : "Add Server"}
        </button>
      </div>
    </div>
  );
}

function PresetGrid({ onSelect }: { onSelect: (preset: McpPreset) => void }) {
  const [search, setSearch] = useState("");
  const categories = ["All", "Infrastructure", "Database", "Platform", "AI/ML", "Tools", "Communication"];
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = useMemo(() => {
    return MCP_PRESETS.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = activeCategory === "All" || p.category === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [search, activeCategory]);

  return (
    <div className="mcp-marketplace">
      <div className="mcp-marketplace-header">
        <div className="mcp-search-bar">
          <Search size={16} />
          <input 
            placeholder="Search MCP servers..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mcp-categories">
          {categories.map(c => (
            <button 
              key={c} 
              className={`mcp-cat-btn ${activeCategory === c ? 'active' : ''}`}
              onClick={() => setActiveCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mcp-preset-grid">
        {filtered.map(p => (
          <button key={p.id} className="mcp-preset-card" onClick={() => onSelect(p)}>
            <div className="mcp-preset-logo-wrap">
              <img src={`${LOGO_BASE}/${p.logo}.svg`} alt="" onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement?.querySelector('.mcp-fallback-icon')?.setAttribute('style', 'display: grid');
              }} />
              <div className="mcp-fallback-icon" style={{ display: 'none' }}>
                <Globe size={24} />
              </div>
            </div>
            <div className="mcp-preset-info">
              <h3>{p.name}</h3>
              <p>{p.description}</p>
            </div>
            <div className="mcp-preset-footer">
              <span className="mcp-category-tag">{p.category}</span>
              <Plus size={14} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function McpSettings({ onBack }: { onBack: () => void }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<"marketplace" | "configured">("marketplace");
  const [selectedPreset, setSelectedPreset] = useState<McpPreset | null>(null);

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

  const handleAddPreset = (preset: McpPreset) => {
    setSelectedPreset(preset);
  };

  return (
    <div className="mcp-settings-page">
      <div className="settings-header">
        <button type="button" className="settings-back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div className="mcp-header-main">
          <div className="mcp-title-wrap">
            <h2 className="settings-title">MCP Registry</h2>
            <div className="mcp-view-tabs">
              <button 
                className={view === "marketplace" ? "active" : ""} 
                onClick={() => setView("marketplace")}
              >
                Marketplace
              </button>
              <button 
                className={view === "configured" ? "active" : ""} 
                onClick={() => setView("configured")}
              >
                Configured {servers.length > 0 && `(${servers.length})`}
              </button>
            </div>
          </div>
          <p className="settings-subtitle">
            {offline
              ? "MCP backend offline"
              : loading
              ? "Syncing servers..."
              : `${connected} of ${servers.length} connected`}
          </p>
        </div>
      </div>

      <div className="mcp-settings-scroll">
        {offline ? (
          <div className="mcp-settings-offline">
            <AlertCircle size={32} />
            <p>MCP backend is not running</p>
            <small>Ensure the MCP backend process is active to manage servers.</small>
          </div>
        ) : (
          <>
            {view === "marketplace" && (
              <PresetGrid onSelect={setSelectedPreset} />
            )}

            {view === "configured" && (
              <div className="mcp-configured-view">
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
                    <div className="mcp-empty-illustration">
                      <Server size={48} opacity={0.1} />
                    </div>
                    <p>No servers configured yet.</p>
                    <button className="mcp-link-btn" onClick={() => setView("marketplace")}>
                      Browse the marketplace
                    </button>
                  </div>
                )}
              </div>
            )}
            {selectedPreset && (
              <div className="mcp-preset-config-overlay" onClick={() => setSelectedPreset(null)}>
                <div className="mcp-config-card" onClick={(e) => e.stopPropagation()}>
                  <button className="mcp-config-close" onClick={() => setSelectedPreset(null)}>
                    <X size={16} />
                  </button>
                  <div className="mcp-config-left">
                    <div className="mcp-config-header">
                      <img src={`${LOGO_BASE}/${selectedPreset.logo}.svg`} alt="" />
                      <div>
                        <h3>{selectedPreset.name}</h3>
                        <p>{selectedPreset.description}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mcp-config-right">
                    <AddServerForm 
                      initialValues={{
                        label: selectedPreset.name,
                        transport: "stdio",
                        command: selectedPreset.command,
                        args: selectedPreset.args.join(" "),
                        url: "",
                        env: (selectedPreset.env || []).reduce((acc, key) => ({ ...acc, [key]: "" }), {}),
                        autoStart: true,
                        enabled: true,
                      }}
                      onAdded={() => {
                        setSelectedPreset(null);
                        setView("configured");
                        void load();
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
