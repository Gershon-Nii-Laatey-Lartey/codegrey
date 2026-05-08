/**
 * SERVER ENTRY POINT
 * AI IDE Backend - Agentic Coding Engine
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const agentRoutes = require("./src/routes/agent");

const app = express();
const PORT = process.env.PORT || 3172;

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.use("/api", agentRoutes);

app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(
        [
          "",
          "Codegrey AI backend running",
          `Port: ${port}`,
          "Provider: BYOK adapters",
          "Health: /api/health",
          "",
        ].join("\n")
      );
      resolve(server);
    });

    server.on("error", reject);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("[Backend Startup Error]", err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
