/**
 * MCP API ROUTES
 *
 * GET    /api/mcp/servers                    — list all servers + status
 * POST   /api/mcp/servers                    — add a new server
 * PATCH  /api/mcp/servers/:id               — update a server config
 * DELETE /api/mcp/servers/:id               — remove a server
 * POST   /api/mcp/servers/:id/start         — connect/spawn a server
 * POST   /api/mcp/servers/:id/stop          — kill/disconnect a server
 * POST   /api/mcp/servers/:id/restart       — stop + start
 * GET    /api/mcp/servers/:id/tools         — list tools from a server
 * GET    /api/mcp/servers/:id/resources     — list resources from a server
 * GET    /api/mcp/servers/:id/prompts       — list prompts from a server
 * POST   /api/mcp/servers/:id/tools/:tool   — call a tool directly (testing)
 * GET    /api/mcp/tools                     — all tools from all connected servers
 * GET    /api/mcp/health                    — health check
 */

const express = require("express");
const router = express.Router();

// proxy and registry are attached to the app by server.js
function getProxy(req) { return req.app.locals.mcpProxy; }
function getRegistry(req) { return req.app.locals.mcpRegistry; }
function getRunner(req) { return req.app.locals.mcpRunner; }

// ─── SERVER LIST ─────────────────────────────────────────────────────────────

router.get("/servers", (req, res) => {
  try {
    const status = getProxy(req).getStatus();
    res.json({ servers: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADD SERVER ──────────────────────────────────────────────────────────────

router.post("/servers", async (req, res) => {
  const { label, transport, command, args, env, url, headers, autoStart, enabled } = req.body;

  if (!label) return res.status(400).json({ error: "label is required" });
  if (transport === "stdio" && !command) return res.status(400).json({ error: "command is required for stdio transport" });
  if (transport === "sse" && !url) return res.status(400).json({ error: "url is required for sse transport" });

  try {
    const server = getRegistry(req).add({ label, transport, command, args, env, url, headers, autoStart, enabled });

    // Auto-start immediately if requested
    if (server.autoStart && server.enabled) {
      try {
        await getRunner(req).start(server);
      } catch (err) {
        return res.status(201).json({
          server,
          warning: `Server registered but failed to start: ${err.message}`,
        });
      }
    }

    res.status(201).json({ server });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE SERVER ───────────────────────────────────────────────────────────

router.patch("/servers/:id", async (req, res) => {
  const { id } = req.params;
  const patch = req.body;

  try {
    const updated = getRegistry(req).update(id, patch);
    res.json({ server: updated });
  } catch (err) {
    res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// ─── REMOVE SERVER ───────────────────────────────────────────────────────────

router.delete("/servers/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Stop first if running
    await getRunner(req).stop(id);
    const removed = getRegistry(req).remove(id);
    if (!removed) return res.status(404).json({ error: `Server "${id}" not found` });
    res.json({ removed: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START ───────────────────────────────────────────────────────────────────

router.post("/servers/:id/start", async (req, res) => {
  const { id } = req.params;
  const registry = getRegistry(req);
  const server = registry.get(id);

  if (!server) return res.status(404).json({ error: `Server "${id}" not found` });

  try {
    const conn = await getRunner(req).start(server);
    res.json({
      status: conn.status,
      id: conn.id,
      label: conn.label,
      toolCount: conn.tools.length,
      tools: conn.tools.map((t) => t.name),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, id });
  }
});

// ─── STOP ────────────────────────────────────────────────────────────────────

router.post("/servers/:id/stop", async (req, res) => {
  const { id } = req.params;

  try {
    const stopped = await getRunner(req).stop(id);
    res.json({ stopped, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RESTART ─────────────────────────────────────────────────────────────────

router.post("/servers/:id/restart", async (req, res) => {
  const { id } = req.params;
  const registry = getRegistry(req);
  const server = registry.get(id);

  if (!server) return res.status(404).json({ error: `Server "${id}" not found` });

  try {
    await getRunner(req).stop(id);
    const conn = await getRunner(req).start(server);
    res.json({
      status: conn.status,
      id: conn.id,
      toolCount: conn.tools.length,
      tools: conn.tools.map((t) => t.name),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LIST TOOLS (single server) ──────────────────────────────────────────────

router.get("/servers/:id/tools", async (req, res) => {
  const { id } = req.params;
  const runner = getRunner(req);
  const conn = runner.get(id);

  if (!conn) return res.status(404).json({ error: `Server "${id}" is not running` });

  try {
    const tools = await conn.listTools();
    res.json({ serverId: id, tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LIST RESOURCES (single server) ──────────────────────────────────────────

router.get("/servers/:id/resources", async (req, res) => {
  const { id } = req.params;
  const conn = getRunner(req).get(id);

  if (!conn) return res.status(404).json({ error: `Server "${id}" is not running` });

  try {
    const resources = await conn.listResources();
    res.json({ serverId: id, resources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── READ RESOURCE ────────────────────────────────────────────────────────────

router.post("/servers/:id/resources/read", async (req, res) => {
  const { id } = req.params;
  const { uri } = req.body;

  if (!uri) return res.status(400).json({ error: "uri is required" });

  const conn = getRunner(req).get(id);
  if (!conn) return res.status(404).json({ error: `Server "${id}" is not running` });

  try {
    const result = await conn.readResource(uri);
    res.json({ serverId: id, uri, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LIST PROMPTS (single server) ────────────────────────────────────────────

router.get("/servers/:id/prompts", async (req, res) => {
  const { id } = req.params;
  const conn = getRunner(req).get(id);

  if (!conn) return res.status(404).json({ error: `Server "${id}" is not running` });

  try {
    const prompts = await conn.listPrompts();
    res.json({ serverId: id, prompts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET PROMPT ───────────────────────────────────────────────────────────────

router.post("/servers/:id/prompts/:name", async (req, res) => {
  const { id, name } = req.params;
  const { args } = req.body;

  const conn = getRunner(req).get(id);
  if (!conn) return res.status(404).json({ error: `Server "${id}" is not running` });

  try {
    const result = await conn.getPrompt(name, args || {});
    res.json({ serverId: id, prompt: name, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CALL TOOL DIRECTLY (for testing in the UI) ───────────────────────────────

router.post("/servers/:id/tools/:tool", async (req, res) => {
  const { id, tool } = req.params;
  const input = req.body;

  try {
    const result = await getProxy(req).dispatch(`mcp__${id}__${tool}`, input);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ALL TOOLS (merged, for the agent) ───────────────────────────────────────

router.get("/tools", (req, res) => {
  try {
    const all = getRunner(req).listAllTools();
    const anthropicDefs = getProxy(req).getMcpToolDefs();
    res.json({
      total: all.length,
      tools: all,
      anthropicDefs, // ready to pass directly to Claude
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────

router.get("/health", (req, res) => {
  const connections = getRunner(req).listConnections();
  res.json({
    status: "ok",
    servers: {
      total: connections.length,
      connected: connections.filter((c) => c.status === "connected").length,
      error: connections.filter((c) => c.status === "error").length,
    },
    connections,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
