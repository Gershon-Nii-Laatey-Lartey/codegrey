/**
 * FRONTEND CLIENT EXAMPLE
 * How to call the AI backend from your IDE's frontend.
 * Copy/adapt this into your IDE's codebase.
 */

const BASE_URL = "http://localhost:3172/api";

// ─── Initialize a session on startup ──────────────────────────────────────────

export async function initAISession({ sessionId, workspaceRoot, projectInfo }) {
  await fetch(`${BASE_URL}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      workspaceRoot,
      projectContext: projectInfo, // { language, framework, packageManager, description }
    }),
  });
}

// ─── STREAMING chat (recommended) ─────────────────────────────────────────────

/**
 * Send a message and stream the response.
 *
 * @param {object} options
 * @param {string} options.sessionId
 * @param {string} options.message
 * @param {string} options.workspaceRoot
 * @param {object} options.editorContext   — { openFile, cursorLine, selection, visibleFiles }
 * @param {Function} options.onText        — Called with each streamed text chunk
 * @param {Function} options.onToolCall    — Called when a tool is invoked
 * @param {Function} options.onToolResult  — Called when a tool completes
 * @param {Function} options.onDone        — Called when the full response is complete
 * @param {Function} options.onError       — Called on error
 */
export async function sendMessage({
  sessionId,
  message,
  workspaceRoot,
  editorContext = null,
  onText,
  onToolCall,
  onToolResult,
  onDone,
  onError,
}) {
  const response = await fetch(`${BASE_URL}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, workspaceRoot, editorContext }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));

        switch (event.type) {
          case "text_delta":
            onText?.(event.text);
            break;
          case "tool_call":
            onToolCall?.(event);
            break;
          case "tool_result":
            onToolResult?.(event);
            break;
          case "done":
            onDone?.(event);
            break;
          case "error":
            onError?.(new Error(event.message));
            break;
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  }
}

// ─── Sync chat (simpler, no streaming) ────────────────────────────────────────

export async function sendMessageSync({ sessionId, message, workspaceRoot, editorContext }) {
  const res = await fetch(`${BASE_URL}/agent/chat/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, workspaceRoot, editorContext }),
  });
  return res.json(); // { message, toolsUsed, toolLog, iterations }
}

// ─── Clear session history ─────────────────────────────────────────────────────

export async function clearSession(sessionId) {
  await fetch(`${BASE_URL}/agent/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

// ─── Usage example ────────────────────────────────────────────────────────────

/*
// In your IDE's chat panel component:

const sessionId = crypto.randomUUID(); // One per workspace

await initAISession({
  sessionId,
  workspaceRoot: "/Users/me/my-project",
  projectInfo: { language: "TypeScript", framework: "Next.js", packageManager: "npm" }
});

await sendMessage({
  sessionId,
  message: "Fix the TypeScript errors in src/api/users.ts",
  workspaceRoot: "/Users/me/my-project",
  editorContext: {
    openFile: "src/api/users.ts",
    cursorLine: 42,
  },
  onText: (chunk) => appendToChat(chunk),
  onToolCall: ({ name, input }) => showToolBadge(`Using: ${name}`),
  onToolResult: ({ name, isError }) => updateToolBadge(name, isError),
  onDone: ({ iterations, toolsUsed }) => {
    console.log(`Done in ${iterations} steps, used: ${toolsUsed.join(", ")}`);
  },
  onError: (err) => showError(err.message),
});
*/
