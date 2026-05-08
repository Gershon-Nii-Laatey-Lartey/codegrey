/**
 * MCP BACKEND — SERVER ENTRY POINT
 *
 * Runs alongside the AI backend.
 * Port: 3173 (AI backend is on 3172)
 *
 * On startup:
 *  1. Loads the MCP server registry from disk
 *  2. Spawns/connects all autoStart servers
 *  3. Starts Express with MCP management + MCP-aware agent routes
 *
 * The frontend talks to this server for everything —
 * both chat (which now includes MCP tools) and MCP management.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const os = require("os");

const { McpRegistry } = require("./src/registry/registry");
const { McpRunner } = require("./src/runner/runner");
const { McpProxy } = require("./src/proxy/proxy");
const mcpRoutes = require("./src/routes/mcp");
const agentRoutes = require("./src/routes/agent");

const app = express();
const PORT = process.env.MCP_PORT || 3173;

// ─── STORAGE PATH ─────────────────────────────────────────────────────────────
// Where MCP server configs are saved.
// In Electron, this would be app.getPath("userData"). Here we use ~/.codegrey/
const storePath =
  process.env.MCP_STORE_PATH ||
  path.join(os.homedir(), ".codegrey", "mcp-servers.json");

// ─── INIT CORE SERVICES ───────────────────────────────────────────────────────

const registry = new McpRegistry({ storePath });
const runner = new McpRunner();
const proxy = new McpProxy({ registry, runner });

// Make them available to route handlers via app.locals
app.locals.mcpRegistry = registry;
app.locals.mcpRunner = runner;
app.locals.mcpProxy = proxy;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use("/api/mcp", mcpRoutes);   // MCP server management
app.use("/api", agentRoutes);     // Chat (with MCP tools injected)

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[MCP Server Error]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

/**
 * startServer
 * 
 * Programmatic entry point for starting the MCP backend.
 * Used by electron/main.cjs.
 */
async function startServer(port = PORT) {
  // Auto-start registered MCP servers
  console.log("[MCP] Starting auto-start servers...");
  const { started, failed } = await proxy.startAutoServers();

  if (started.length > 0) console.log(`[MCP] Started: ${started.join(", ")}`);
  if (failed.length > 0) {
    for (const f of failed) {
      console.warn(`[MCP] Failed to start "${f.id}": ${f.error}`);
    }
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const connectedTools = runner.listAllTools().length;
      console.log(`
╔══════════════════════════════════════╗
║      MCP Backend Running             ║
╟──────────────────────────────────────╢
║  Port      : ${port}                   ║
║  Config    : ~/.codegrey/            ║
║  MCP tools : ${String(connectedTools).padEnd(22)}║
╟──────────────────────────────────────╢
║  MCP Management:                     ║
║  GET  /api/mcp/servers               ║
║  POST /api/mcp/servers               ║
║  POST /api/mcp/servers/:id/start     ║
║  POST /api/mcp/servers/:id/stop      ║
║  GET  /api/mcp/tools                 ║
║  GET  /api/mcp/health                ║
╟──────────────────────────────────────╢
║  Agent (MCP-aware):                  ║
║  POST /api/agent/chat       (SSE)    ║
║  POST /api/agent/chat/sync           ║
║  POST /api/context                   ║
╚══════════════════════════════════════╝
      `);
      resolve(server);
    });

    server.on("error", reject);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("[MCP] Fatal startup error:", err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
