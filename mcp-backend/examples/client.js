/**
 * MCP BACKEND CLIENT
 * How to talk to the MCP backend from your IDE frontend.
 * Mirrors the pattern in backend/examples/client.js exactly.
 *
 * Drop this into src/lib/mcpClient.ts (or .js) in your frontend.
 */

const MCP_BASE = "http://localhost:3173/api";

// ─── SERVER MANAGEMENT ────────────────────────────────────────────────────────

/** Get all registered MCP servers + their current connection status */
export async function listServers() {
  const res = await fetch(`${MCP_BASE}/mcp/servers`);
  return res.json(); // { servers: McpServerStatus[] }
}

/** Register a new MCP server */
export async function addServer(config) {
  const res = await fetch(`${MCP_BASE}/mcp/servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json(); // { server } or { server, warning }
}

/** Update a server's config (e.g. toggle enabled) */
export async function updateServer(id, patch) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.json();
}

/** Remove a server entirely */
export async function removeServer(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}`, { method: "DELETE" });
  return res.json();
}

/** Connect/spawn a server */
export async function startServer(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}/start`, { method: "POST" });
  return res.json(); // { status, id, toolCount, tools }
}

/** Kill/disconnect a server */
export async function stopServer(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}/stop`, { method: "POST" });
  return res.json();
}

/** Stop then start a server */
export async function restartServer(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}/restart`, { method: "POST" });
  return res.json();
}

// ─── TOOL BROWSING ────────────────────────────────────────────────────────────

/** Get tools from one server */
export async function getServerTools(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}/tools`);
  return res.json(); // { serverId, tools }
}

/** Get resources from one server */
export async function getServerResources(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}/resources`);
  return res.json();
}

/** Get prompts from one server */
export async function getServerPrompts(id) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${id}/prompts`);
  return res.json();
}

/** All tools from all connected servers (merged) */
export async function getAllTools() {
  const res = await fetch(`${MCP_BASE}/mcp/tools`);
  return res.json(); // { total, tools, anthropicDefs }
}

/** Call a specific tool on a specific server directly (useful for testing in the MCP settings UI) */
export async function callTool(serverId, toolName, input) {
  const res = await fetch(`${MCP_BASE}/mcp/servers/${serverId}/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

// ─── MCP-AWARE CHAT (streaming) ───────────────────────────────────────────────

/**
 * Send a message to the MCP-aware agent (same interface as the AI backend client,
 * but this one has all MCP tools available too).
 *
 * Extra event types beyond the base client:
 *   { type: "mcp_tools_available", count, tools }  — emitted at start of each chat
 */
export async function sendMessage({
  sessionId,
  message,
  workspaceRoot,
  editorContext = null,
  agentMode = "propose",   // "propose" | "auto"
  onText,
  onToolCall,
  onToolResult,
  onMcpToolsAvailable,
  onDone,
  onError,
}) {
  const response = await fetch(`${MCP_BASE}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, workspaceRoot, editorContext, agentMode }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        switch (event.type) {
          case "mcp_tools_available": onMcpToolsAvailable?.(event); break;
          case "text_delta":          onText?.(event.text); break;
          case "tool_call":           onToolCall?.(event); break;
          case "tool_result":         onToolResult?.(event); break;
          case "done":                onDone?.(event); break;
          case "error":               onError?.(new Error(event.message)); break;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function sendMessageSync({ sessionId, message, workspaceRoot, editorContext, agentMode }) {
  const res = await fetch(`${MCP_BASE}/agent/chat/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, workspaceRoot, editorContext, agentMode }),
  });
  return res.json();
}

export async function clearSession(sessionId) {
  await fetch(`${MCP_BASE}/agent/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

export async function initSession(sessionId, workspaceRoot, projectContext) {
  await fetch(`${MCP_BASE}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, workspaceRoot, projectContext }),
  });
}

export async function getMcpHealth() {
  const res = await fetch(`${MCP_BASE}/mcp/health`);
  return res.json();
}

// ─── USAGE EXAMPLE ────────────────────────────────────────────────────────────
/*
// On app startup:
await initSession(sessionId, workspaceRoot);

// To add the filesystem MCP server:
await addServer({
  label: "Filesystem",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", workspaceRoot],
  autoStart: true,
});

// To send a message that can use MCP tools:
await sendMessage({
  sessionId,
  message: "Search GitHub for issues tagged 'bug' in this repo",
  workspaceRoot,
  onText: (chunk) => appendToChat(chunk),
  onToolCall: ({ name }) => showBadge(name.startsWith("mcp__") ? `MCP: ${name}` : name),
  onMcpToolsAvailable: ({ count }) => setMcpToolCount(count),
  onDone: ({ iterations, toolsUsed }) => console.log(`Done in ${iterations} steps`),
});
*/
