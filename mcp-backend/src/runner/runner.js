/**
 * MCP SERVER RUNNER
 *
 * Manages live connections to MCP servers.
 * Handles two transports:
 *   - stdio: spawns a child process, speaks JSON-RPC over stdin/stdout
 *   - sse:   connects to an HTTP SSE endpoint
 *
 * Public API:
 *   runner.start(serverConfig)       → connects/spawns, returns McpConnection
 *   runner.stop(serverId)            → kills/disconnects
 *   runner.get(serverId)             → returns live McpConnection or null
 *   runner.listConnections()         → all live connections with their status
 *   runner.callTool(serverId, name, input) → invoke a tool on a connected server
 *   runner.listTools(serverId)       → get the tool manifest from a server
 *   runner.listAllTools()            → merged tool manifest across all connected servers
 */

const { spawn } = require("child_process");
const fetch = require("node-fetch");
const crypto = require("crypto");

// ─── JSON-RPC HELPERS ─────────────────────────────────────────────────────────

function makeRequest(method, params = {}) {
  return {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method,
    params,
  };
}

function makeNotification(method, params = {}) {
  return { jsonrpc: "2.0", method, params };
}

// ─── STDIO TRANSPORT ──────────────────────────────────────────────────────────

class StdioConnection {
  constructor({ id, label, command, args, env }) {
    this.id = id;
    this.label = label;
    this.transport = "stdio";
    this.status = "connecting";
    this.tools = [];
    this.error = null;

    this._pendingRequests = new Map(); // requestId → { resolve, reject }
    this._buffer = "";
    this._process = null;
  }

  async connect({ command, args, env }) {
    return new Promise((resolve, reject) => {
      const mergedEnv = { ...process.env, ...(env || {}) };

      this._process = spawn(command, args || [], {
        env: mergedEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this._process.stderr.on("data", (chunk) => {
        // MCP servers write logs to stderr — collect for diagnostics
        const text = chunk.toString();
        process.stderr.write(`[MCP:${this.id}] ${text}`);
      });

      this._process.stdout.on("data", (chunk) => {
        this._buffer += chunk.toString();
        this._processBuffer();
      });

      this._process.on("error", (err) => {
        this.status = "error";
        this.error = err.message;
        // Reject all pending requests
        for (const [, pending] of this._pendingRequests) {
          pending.reject(err);
        }
        this._pendingRequests.clear();
        reject(err);
      });

      this._process.on("exit", (code) => {
        this.status = "disconnected";
        // Reject all pending requests
        for (const [, pending] of this._pendingRequests) {
          pending.reject(new Error(`MCP server "${this.id}" exited with code ${code}`));
        }
        this._pendingRequests.clear();
      });

      // Initialize: send initialize request
      this._sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { roots: {}, sampling: {} },
        clientInfo: { name: "codegrey", version: "0.1.0" },
      })
        .then((result) => {
          // Send initialized notification
          this._sendNotification("notifications/initialized");
          this.serverInfo = result.serverInfo;
          this.capabilities = result.capabilities;
          this.status = "connected";
          resolve(this);
        })
        .catch((err) => {
          this.status = "error";
          this.error = err.message;
          reject(err);
        });
    });
  }

  _processBuffer() {
    const lines = this._buffer.split("\n");
    this._buffer = lines.pop(); // keep incomplete last line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this._handleMessage(msg);
      } catch {
        // Not JSON — could be a log line from a misconfigured server
      }
    }
  }

  _handleMessage(msg) {
    if (msg.id && this._pendingRequests.has(msg.id)) {
      const { resolve, reject } = this._pendingRequests.get(msg.id);
      this._pendingRequests.delete(msg.id);

      if (msg.error) {
        reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // Notifications from server (tools/list_changed, etc.)
    if (!msg.id && msg.method) {
      this._handleNotification(msg);
    }
  }

  _handleNotification(msg) {
    if (msg.method === "notifications/tools/list_changed") {
      // Refresh tool list
      this.listTools().catch(() => {});
    }
  }

  _sendRequest(method, params) {
    const req = makeRequest(method, params);
    return new Promise((resolve, reject) => {
      this._pendingRequests.set(req.id, { resolve, reject });
      const line = JSON.stringify(req) + "\n";
      this._process.stdin.write(line, (err) => {
        if (err) {
          this._pendingRequests.delete(req.id);
          reject(err);
        }
      });

      // Request timeout — 30 seconds
      setTimeout(() => {
        if (this._pendingRequests.has(req.id)) {
          this._pendingRequests.delete(req.id);
          reject(new Error(`Request "${method}" timed out after 30s`));
        }
      }, 30000);
    });
  }

  _sendNotification(method, params) {
    const notif = makeNotification(method, params);
    const line = JSON.stringify(notif) + "\n";
    this._process?.stdin?.write(line, () => {});
  }

  async listTools() {
    const result = await this._sendRequest("tools/list");
    this.tools = result.tools || [];
    return this.tools;
  }

  async callTool(name, input) {
    return this._sendRequest("tools/call", { name, arguments: input });
  }

  async listResources() {
    try {
      const result = await this._sendRequest("resources/list");
      return result.resources || [];
    } catch {
      return [];
    }
  }

  async readResource(uri) {
    return this._sendRequest("resources/read", { uri });
  }

  async listPrompts() {
    try {
      const result = await this._sendRequest("prompts/list");
      return result.prompts || [];
    } catch {
      return [];
    }
  }

  async getPrompt(name, args) {
    return this._sendRequest("prompts/get", { name, arguments: args });
  }

  disconnect() {
    this.status = "disconnected";
    try {
      this._process?.kill();
    } catch {
      // ignore
    }
  }
}

// ─── SSE TRANSPORT ────────────────────────────────────────────────────────────

class SseConnection {
  constructor({ id, label }) {
    this.id = id;
    this.label = label;
    this.transport = "sse";
    this.status = "connecting";
    this.tools = [];
    this.error = null;
    this._pendingRequests = new Map();
    this._postEndpoint = null;
    this._eventSource = null;
  }

  async connect({ url, headers }) {
    // MCP SSE: GET establishes the SSE stream, POST sends requests
    // The server sends an "endpoint" event with the POST URL
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("SSE connection timed out after 15s"));
      }, 15000);

      // Use EventSource-like polling via node-fetch
      this._connectStream(url, headers, resolve, reject, timeout);
    });
  }

  async _connectStream(url, headers, resolve, reject, timeout) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(headers || {}),
        },
      });

      if (!res.ok) {
        throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`);
      }

      this._baseUrl = new URL(url).origin;

      let eventBuffer = "";
      let eventType = "";

      const onData = async (chunk) => {
        eventBuffer += chunk.toString();
        const lines = eventBuffer.split("\n");
        eventBuffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            await this._handleSseEvent(eventType, data, resolve, reject, timeout);
            eventType = "";
          }
        }
      };

      res.body.on("data", onData);
      res.body.on("end", () => {
        this.status = "disconnected";
      });
      res.body.on("error", (err) => {
        this.status = "error";
        this.error = err.message;
        reject(err);
      });
    } catch (err) {
      clearTimeout(timeout);
      this.status = "error";
      this.error = err.message;
      reject(err);
    }
  }

  async _handleSseEvent(eventType, data, resolve, reject, timeout) {
    if (eventType === "endpoint") {
      // Server tells us where to POST requests
      this._postEndpoint = data.startsWith("http") ? data : this._baseUrl + data;

      // Initialize
      try {
        const result = await this._post(makeRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "codegrey", version: "0.1.0" },
        }));
        await this._post(makeNotification("notifications/initialized"));
        this.serverInfo = result.serverInfo;
        this.capabilities = result.capabilities;
        this.status = "connected";
        clearTimeout(timeout);
        resolve(this);
      } catch (err) {
        clearTimeout(timeout);
        this.status = "error";
        this.error = err.message;
        reject(err);
      }
      return;
    }

    if (eventType === "message") {
      try {
        const msg = JSON.parse(data);
        if (msg.id && this._pendingRequests.has(msg.id)) {
          const { resolve, reject } = this._pendingRequests.get(msg.id);
          this._pendingRequests.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  async _post(payload) {
    if (!this._postEndpoint) throw new Error("SSE endpoint not established");

    // If it's a notification, fire and forget
    if (!payload.id) {
      fetch(this._postEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
      return;
    }

    return new Promise((resolve, reject) => {
      this._pendingRequests.set(payload.id, { resolve, reject });
      fetch(this._postEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        this._pendingRequests.delete(payload.id);
        reject(err);
      });

      setTimeout(() => {
        if (this._pendingRequests.has(payload.id)) {
          this._pendingRequests.delete(payload.id);
          reject(new Error(`Request timed out`));
        }
      }, 30000);
    });
  }

  async listTools() {
    const result = await this._post(makeRequest("tools/list"));
    this.tools = result?.tools || [];
    return this.tools;
  }

  async callTool(name, input) {
    return this._post(makeRequest("tools/call", { name, arguments: input }));
  }

  async listResources() {
    try {
      const result = await this._post(makeRequest("resources/list"));
      return result?.resources || [];
    } catch {
      return [];
    }
  }

  async readResource(uri) {
    return this._post(makeRequest("resources/read", { uri }));
  }

  async listPrompts() {
    try {
      const result = await this._post(makeRequest("prompts/list"));
      return result?.prompts || [];
    } catch {
      return [];
    }
  }

  async getPrompt(name, args) {
    return this._post(makeRequest("prompts/get", { name, arguments: args }));
  }

  disconnect() {
    this.status = "disconnected";
    this._eventSource = null;
  }
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────

class McpRunner {
  constructor() {
    this._connections = new Map(); // serverId → StdioConnection | SseConnection
  }

  async start(serverConfig) {
    const { id, transport, command, args, env, url, headers } = serverConfig;

    // If already connected, return existing
    const existing = this._connections.get(id);
    if (existing && existing.status === "connected") {
      return existing;
    }

    // Kill stale connection if any
    if (existing) {
      existing.disconnect();
      this._connections.delete(id);
    }

    let conn;

    if (transport === "sse") {
      conn = new SseConnection({ id, label: serverConfig.label });
      await conn.connect({ url, headers });
    } else {
      // Default: stdio
      conn = new StdioConnection({ id, label: serverConfig.label });
      await conn.connect({ command, args, env });
    }

    // Fetch tools immediately after connecting
    try {
      await conn.listTools();
    } catch (err) {
      console.warn(`[McpRunner] Could not fetch tools from "${id}":`, err.message);
    }

    this._connections.set(id, conn);
    return conn;
  }

  async stop(serverId) {
    const conn = this._connections.get(serverId);
    if (!conn) return false;
    conn.disconnect();
    this._connections.delete(serverId);
    return true;
  }

  get(serverId) {
    return this._connections.get(serverId) ?? null;
  }

  listConnections() {
    return [...this._connections.values()].map((c) => ({
      id: c.id,
      label: c.label,
      transport: c.transport,
      status: c.status,
      toolCount: c.tools.length,
      error: c.error || null,
    }));
  }

  async callTool(serverId, toolName, input) {
    const conn = this._connections.get(serverId);
    if (!conn) throw new Error(`MCP server "${serverId}" is not connected`);
    if (conn.status !== "connected") throw new Error(`MCP server "${serverId}" status is "${conn.status}"`);
    return conn.callTool(toolName, input);
  }

  async listTools(serverId) {
    const conn = this._connections.get(serverId);
    if (!conn) throw new Error(`MCP server "${serverId}" is not connected`);
    return conn.listTools();
  }

  /**
   * Returns all tools from all connected servers, namespaced by server ID.
   * Format: [{ serverId, serverLabel, tool: { name, description, inputSchema } }]
   */
  listAllTools() {
    const result = [];
    for (const conn of this._connections.values()) {
      if (conn.status !== "connected") continue;
      for (const tool of conn.tools) {
        result.push({
          serverId: conn.id,
          serverLabel: conn.label,
          tool,
        });
      }
    }
    return result;
  }

  /**
   * Build Anthropic-compatible tool definitions from all connected MCP servers.
   * These can be passed directly into the agent loop's tool array.
   * Tool names are prefixed with "mcp__<serverId>__" to avoid collisions.
   */
  buildAnthropicToolDefs() {
    return this.listAllTools().map(({ serverId, tool }) => ({
      name: `mcp__${serverId}__${tool.name}`,
      description: `[${serverId}] ${tool.description || tool.name}`,
      input_schema: tool.inputSchema || { type: "object", properties: {}, required: [] },
    }));
  }

  /**
   * If the agent calls a tool named "mcp__<serverId>__<toolName>",
   * route it to the right MCP server.
   */
  isMcpTool(toolName) {
    return toolName.startsWith("mcp__");
  }

  parseMcpToolName(toolName) {
    // mcp__serverId__toolName  (toolName may contain __)
    const parts = toolName.slice(5).split("__"); // remove "mcp__"
    const serverId = parts[0];
    const actualName = parts.slice(1).join("__");
    return { serverId, actualName };
  }

  async dispatchMcpTool(toolName, input) {
    const { serverId, actualName } = this.parseMcpToolName(toolName);
    return this.callTool(serverId, actualName, input);
  }
}

module.exports = { McpRunner };
