/**
 * SERVER ENTRY POINT
 * AI IDE Backend — Agentic Coding Engine
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const agentRoutes = require("./src/routes/agent");

const app = express();
const PORT = process.env.PORT || 3172;

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// ─── ROUTES ──────────────────────────────────────────────────────────────────

app.use("/api", agentRoutes);

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║       AI IDE Backend  Running        ║
╟──────────────────────────────────────╢
║  Port      : ${PORT}                   ║
║  Model     : claude-opus-4-5         ║
║  Health    : /api/health             ║
╟──────────────────────────────────────╢
║  Endpoints:                          ║
║  POST /api/agent/chat       (SSE)    ║
║  POST /api/agent/chat/sync           ║
║  POST /api/agent/confirm             ║
║  POST /api/agent/clear               ║
║  POST /api/context                   ║
╚══════════════════════════════════════╝
  `);
});

module.exports = app;
