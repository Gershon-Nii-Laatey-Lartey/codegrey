/**
 * MCP PROXY
 *
 * The bridge between the agent loop and MCP servers.
 *
 * When the agent loop gets a tool call that starts with "mcp__",
 * this proxy routes it to the right MCP server and returns the result
 * in the same format the agent loop expects.
 *
 * Also merges MCP tool definitions into the agent's tool list so
 * Claude knows what MCP tools are available.
 */

const { McpRunner } = require("../runner/runner");
const { McpRegistry } = require("../registry/registry");

class McpProxy {
  constructor({ registry, runner }) {
    this.registry = registry;
    this.runner = runner;
  }

  /**
   * Start all autoStart-enabled servers from the registry.
   * Called on backend startup.
   */
  async startAutoServers() {
    const servers = this.registry.list().filter((s) => s.enabled && s.autoStart);
    const results = await Promise.allSettled(
      servers.map((s) => this.runner.start(s).catch((err) => {
        console.error(`[McpProxy] Auto-start failed for "${s.id}":`, err.message);
        throw err;
      }))
    );

    const started = [];
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") started.push(servers[i].id);
      else failed.push({ id: servers[i].id, error: r.reason?.message });
    });

    return { started, failed };
  }

  /**
   * Returns all Anthropic-format tool definitions from connected MCP servers.
   * Merge these with the base AI backend's TOOL_DEFINITIONS before passing to Claude.
   */
  getMcpToolDefs() {
    return this.runner.buildAnthropicToolDefs();
  }

  /**
   * Dispatch a tool call to the appropriate MCP server.
   * Returns in the same format as the AI backend's ToolExecutor.execute():
   * a plain JS object that gets JSON.stringified into the tool_result message.
   */
  async dispatch(toolName, toolInput) {
    if (!this.runner.isMcpTool(toolName)) {
      throw new Error(`"${toolName}" is not an MCP tool`);
    }

    const { serverId, actualName } = this.runner.parseMcpToolName(toolName);
    const conn = this.runner.get(serverId);

    if (!conn) {
      throw new Error(
        `MCP server "${serverId}" is not running. ` +
        `Start it first via POST /api/mcp/servers/${serverId}/start`
      );
    }

    if (conn.status !== "connected") {
      throw new Error(`MCP server "${serverId}" status is "${conn.status}" — not ready`);
    }

    const result = await conn.callTool(actualName, toolInput);

    // MCP tool results have a `content` array of { type, text } blocks
    // Flatten them to a readable string for the agent
    if (result?.content) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return {
        server: serverId,
        tool: actualName,
        isError: result.isError || false,
        output: text || JSON.stringify(result.content),
        raw: result,
      };
    }

    return {
      server: serverId,
      tool: actualName,
      isError: false,
      output: JSON.stringify(result),
      raw: result,
    };
  }

  /**
   * Get the status of all servers: registered + running state
   */
  getStatus() {
    const registered = this.registry.list();
    const connections = new Map(
      this.runner.listConnections().map((c) => [c.id, c])
    );

    return registered.map((server) => {
      const conn = connections.get(server.id);
      return {
        ...server,
        status: conn?.status ?? (server.enabled ? "stopped" : "disabled"),
        toolCount: conn?.toolCount ?? 0,
        error: conn?.error ?? null,
      };
    });
  }
}

module.exports = { McpProxy };
