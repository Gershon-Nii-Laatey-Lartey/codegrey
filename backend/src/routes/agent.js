/**
 * API ROUTES
 *
 * POST /api/agent/chat        — Main agentic chat (streaming SSE)
 * POST /api/agent/chat/sync   — Same but non-streaming (simpler to integrate)
 * POST /api/agent/confirm     — Confirm a blocked destructive operation
 * GET  /api/agent/health      — Health check
 * POST /api/context           — Send editor context (open file, cursor, selection)
 */

const express = require("express");
const router = express.Router();
const { runAgentLoop } = require("../loop/agentLoop");
const { createProvider } = require("../providers");

function extractText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return typeof contentBlocks === 'string' ? contentBlocks : '';
  return contentBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// In-memory session store (replace with Redis for production)
const sessions = new Map();

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      history: [],
      workspaceRoot: null,
      projectContext: null,
      pendingConfirmation: null,
    });
  }
  return sessions.get(sessionId);
}

// ─── STREAMING CHAT (SSE) ────────────────────────────────────────────────────
/**
 * POST /api/agent/chat
 *
 * Body:
 * {
 *   sessionId: string,         // Unique session per workspace/tab
 *   message: string,           // User's message
 *   workspaceRoot: string,     // Absolute path to project root
 *   editorContext?: {          // What's open in the editor right now
 *     openFile?: string,
 *     cursorLine?: number,
 *     selection?: string,
 *     visibleFiles?: string[]
 *   }
 * }
 *
 * Response: text/event-stream (SSE)
 * Events:
 *   data: {"type": "text_delta", "text": "..."}        — Streaming text
 *   data: {"type": "tool_call", "name": "...", ...}    — Tool being invoked
 *   data: {"type": "tool_result", "name": "...", ...}  — Tool result
 *   data: {"type": "done", "iterations": N, "tools": [...]}  — Complete
 *   data: {"type": "error", "message": "..."}          — Error
 */
router.post("/agent/chat", async (req, res) => {
  const { sessionId, message, workspaceRoot, editorContext, aiSettings, agentMode = "propose", workspaceId } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId and message are required" });
  }

  if (!workspaceRoot) {
    return res.status(400).json({ error: "workspaceRoot is required" });
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const abortController = new AbortController();
  let clientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientClosed = true;
      abortController.abort();
    }
  });

  const send = (data) => {
    if (clientClosed || res.destroyed) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const session = getOrCreateSession(sessionId);
  session.workspaceRoot = workspaceRoot;

  // Build enriched message with editor context
  let enrichedMessage = message;
  if (editorContext) {
    const ctx = buildEditorContext(editorContext);
    if (ctx) enrichedMessage = `${ctx}\n\n${message}`;
  }

  try {
    const { finalMessage, updatedHistory, toolsUsed, iterations } = await runAgentLoop({
      userMessage: enrichedMessage,
      conversationHistory: session.history,
      workspaceRoot: session.workspaceRoot,
      workspaceId: workspaceId || null,
      projectContext: session.projectContext,
      aiSettings,
      agentMode,
      abortSignal: abortController.signal,
      onStream: (event) => {
        if (event.type === "text_delta") {
          send({ type: "text_delta", text: event.text });
        }
      },
      onToolCall: ({ toolName, toolInput, toolId, iteration }) => {
        send({ type: "tool_call", name: toolName, input: toolInput, id: toolId, iteration });
      },
      onToolResult: ({ toolName, toolId, result, isError, iteration }) => {
        send({
          type: "tool_result",
          name: toolName,
          id: toolId,
          result: summarizeResult(result),
          isError,
          iteration,
        });
      },
      onFileChange: ({ filePath, oldContent, newContent, autoApplied, toolName, toolId, iteration }) => {
        send({
          type: "file_change_proposed",
          filePath,
          oldContent,
          newContent,
          autoApplied,
          toolName,
          toolId,
          iteration,
        });
      },
    });

    // Save updated history
    session.history = updatedHistory;

    // Send completion event
    if (!clientClosed) {
      send({
        type: "done",
        finalMessage,
        iterations,
        toolsUsed: toolsUsed.map((t) => t.name),
      });
    }

    if (!clientClosed) res.end();
  } catch (err) {
    if (clientClosed || abortController.signal.aborted) return;
    console.error("[AgentLoop Error]", err);
    send({ type: "error", message: err.message });
    res.end();
  }
});

// ─── SYNC CHAT (non-streaming) ────────────────────────────────────────────────
/**
 * POST /api/agent/chat/sync
 * Same as above but waits for the full response. Simpler to integrate.
 */
router.post("/agent/chat/sync", async (req, res) => {
  const { sessionId, message, workspaceRoot, editorContext, aiSettings, agentMode = "propose" } = req.body;

  if (!sessionId || !message || !workspaceRoot) {
    return res.status(400).json({ error: "sessionId, message, and workspaceRoot are required" });
  }

  const session = getOrCreateSession(sessionId);
  session.workspaceRoot = workspaceRoot;

  let enrichedMessage = message;
  if (editorContext) {
    const ctx = buildEditorContext(editorContext);
    if (ctx) enrichedMessage = `${ctx}\n\n${message}`;
  }

  const toolCallLog = [];

  try {
    const { finalMessage, updatedHistory, toolsUsed, iterations } = await runAgentLoop({
      userMessage: enrichedMessage,
      conversationHistory: session.history,
      workspaceRoot: session.workspaceRoot,
      projectContext: session.projectContext,
      aiSettings,
      agentMode,
      onToolCall: ({ toolName, toolInput }) => {
        toolCallLog.push({ tool: toolName, input: toolInput });
      },
    });

    session.history = updatedHistory;

    res.json({
      message: finalMessage,
      toolsUsed: toolsUsed.map((t) => ({ name: t.name, iteration: t.iteration })),
      toolLog: toolCallLog,
      iterations,
    });
  } catch (err) {
    console.error("[AgentLoop Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CONFIRM DESTRUCTIVE OPERATION ───────────────────────────────────────────
/**
 * POST /api/agent/confirm
 * When the agent blocks a destructive command, the UI shows a confirm dialog.
 * Call this to re-run with allowDestructive = true.
 */
router.post("/agent/confirm", async (req, res) => {
  const { sessionId, confirmed } = req.body;

  if (!confirmed) {
    return res.json({ status: "cancelled" });
  }

  const session = getOrCreateSession(sessionId);
  if (!session.pendingConfirmation) {
    return res.status(400).json({ error: "No pending operation to confirm" });
  }

  const { message, workspaceRoot } = session.pendingConfirmation;
  session.pendingConfirmation = null;

  try {
    const { finalMessage, updatedHistory, toolsUsed } = await runAgentLoop({
      userMessage: message,
      conversationHistory: session.history,
      workspaceRoot,
      allowDestructive: true,
    });

    session.history = updatedHistory;
    res.json({ message: finalMessage, toolsUsed: toolsUsed.map((t) => t.name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLEAR SESSION HISTORY ────────────────────────────────────────────────────
router.post("/agent/clear", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.get(sessionId).history = [];
  }
  res.json({ cleared: true });
});

router.post("/agent/title", async (req, res) => {
  const { message, aiSettings } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  try {
    const provider = createProvider(aiSettings);
    const systemPrompt = "You are a conversation analyzer. Generate a short, 2-to-4 word title for a chat based on the user's first message. Respond ONLY with the title wrapped in <title>...</title> tags. Do not include any other text.";
    const response = await provider.call({
      systemPrompt,
      messages: [{ role: "user", content: message }],
    });
    let raw = extractText(response.content) || "New Chat";
    const match = raw.match(/<title>(.*?)<\/title>/i);
    let title = match ? match[1].trim() : raw.split('\n')[0].split(' ').slice(0, 5).join(' ').trim();
    title = title.replace(/^["']|["']$/g, "").trim();
    if (title.length > 50) title = title.slice(0, 47) + "...";
    res.json({ title: title || "New Chat" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SET PROJECT CONTEXT ─────────────────────────────────────────────────────
/**
 * POST /api/context
 * Let the IDE send project metadata on startup.
 * {
 *   sessionId, workspaceRoot,
 *   projectContext: { language, framework, packageManager, description }
 * }
 */
router.post("/context", (req, res) => {
  const { sessionId, workspaceRoot, projectContext } = req.body;

  const session = getOrCreateSession(sessionId);
  if (workspaceRoot) session.workspaceRoot = workspaceRoot;
  if (projectContext) session.projectContext = formatProjectContext(projectContext);

  res.json({ status: "ok" });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    sessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function buildEditorContext({ openFile, cursorLine, selection, visibleFiles }) {
  const parts = [];

  if (openFile) {
    parts.push(`[Editor context]`);
    parts.push(`Active file: ${openFile}`);
    if (cursorLine) parts.push(`Cursor: line ${cursorLine}`);
    if (selection) parts.push(`Selected text:\n\`\`\`\n${selection}\n\`\`\``);
  }

  if (visibleFiles?.length) {
    parts.push(`Open tabs: ${visibleFiles.join(", ")}`);
  }

  return parts.length ? parts.join("\n") : null;
}

function formatProjectContext({ language, framework, packageManager, description }) {
  const parts = [];
  if (language) parts.push(`Language: ${language}`);
  if (framework) parts.push(`Framework: ${framework}`);
  if (packageManager) parts.push(`Package manager: ${packageManager}`);
  if (description) parts.push(`Description: ${description}`);
  return parts.join("\n");
}

function summarizeResult(result) {
  // Truncate large tool results so SSE messages stay manageable
  const str = JSON.stringify(result);
  if (str.length > 2000) {
    return {
      summary: str.slice(0, 2000) + `... (truncated, ${str.length} chars total)`,
    };
  }
  return result;
}

module.exports = router;
