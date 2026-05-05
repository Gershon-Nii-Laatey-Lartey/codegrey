/**
 * SMOKE TEST
 * Run with: node tests/smoke.js
 * Tests the agent loop without hitting the HTTP server.
 */

require("dotenv").config({ path: "../.env" });
const { runAgentLoop } = require("../src/loop/agentLoop");
const path = require("path");

const WORKSPACE = path.resolve(__dirname, "..");

async function run() {
  console.log("🔥 Running smoke test...\n");

  const { finalMessage, toolsUsed, iterations } = await runAgentLoop({
    userMessage:
      "List the files in this project, then tell me what this project does based on the code.",
    conversationHistory: [],
    workspaceRoot: WORKSPACE,
    onToolCall: ({ toolName, toolInput }) => {
      console.log(`  → Tool: ${toolName}`, JSON.stringify(toolInput).slice(0, 80));
    },
    onToolResult: ({ toolName, result }) => {
      console.log(`  ← ${toolName}: OK`);
    },
  });

  console.log("\n══════════════════════════════");
  console.log(`Iterations : ${iterations}`);
  console.log(`Tools used : ${toolsUsed.map((t) => t.name).join(", ")}`);
  console.log("\nFinal message:");
  console.log(finalMessage);
}

run().catch((err) => {
  console.error("Smoke test FAILED:", err);
  process.exit(1);
});
