/**
 * MCP SERVER REGISTRY
 *
 * Tracks every MCP server the user has configured.
 * Persisted to userData/mcp-servers.json on disk.
 * Hot-reloads when the file changes (for CLI-added servers).
 *
 * A "server entry" looks like:
 * {
 *   id: "github-mcp",              // unique slug, user-defined or auto-generated
 *   label: "GitHub",               // display name
 *   transport: "stdio" | "sse",    // how to talk to it
 *
 *   // stdio transport:
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-github"],
 *   env: { GITHUB_TOKEN: "ghp_..." },
 *
 *   // sse transport:
 *   url: "http://localhost:8080/sse",
 *   headers: { Authorization: "Bearer ..." },
 *
 *   enabled: true,
 *   autoStart: true,               // start when registry loads
 * }
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class McpRegistry {
  constructor({ storePath }) {
    this.storePath = storePath;
    this.servers = new Map(); // id → server config
    this._load();
  }

  // ─── PERSISTENCE ─────────────────────────────────────────────────────────

  _load() {
    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      const list = JSON.parse(raw);
      this.servers.clear();
      for (const entry of list) {
        if (entry.id) this.servers.set(entry.id, entry);
      }
    } catch {
      // File doesn't exist yet — start empty
      this.servers.clear();
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      fs.writeFileSync(
        this.storePath,
        JSON.stringify([...this.servers.values()], null, 2),
        "utf-8"
      );
    } catch (err) {
      console.error("[McpRegistry] Failed to save:", err.message);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  list() {
    return [...this.servers.values()];
  }

  get(id) {
    return this.servers.get(id) ?? null;
  }

  add(entry) {
    const id = entry.id || slugify(entry.label || "server") + "-" + crypto.randomBytes(3).toString("hex");
    const server = {
      id,
      label: entry.label || id,
      transport: entry.transport || "stdio",
      enabled: entry.enabled !== false,
      autoStart: entry.autoStart !== false,
      // stdio
      command: entry.command || null,
      args: entry.args || [],
      env: entry.env || {},
      // sse
      url: entry.url || null,
      headers: entry.headers || {},
    };
    this.servers.set(id, server);
    this._save();
    return server;
  }

  update(id, patch) {
    const existing = this.servers.get(id);
    if (!existing) throw new Error(`Server "${id}" not found`);
    const updated = { ...existing, ...patch, id }; // id is immutable
    this.servers.set(id, updated);
    this._save();
    return updated;
  }

  remove(id) {
    const had = this.servers.has(id);
    this.servers.delete(id);
    if (had) this._save();
    return had;
  }

  setEnabled(id, enabled) {
    return this.update(id, { enabled });
  }
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "server";
}

module.exports = { McpRegistry };
