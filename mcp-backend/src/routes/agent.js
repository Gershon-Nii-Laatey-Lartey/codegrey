/**
 * MCP-AWARE AGENT ROUTES
 *
 * Mirrors backend/src/routes/agent.js exactly,
 * but uses runMcpAgentLoop instead of runAgentLoop
 * so MCP tools are automatically available alongside built-in tools.
 *
 * POST /api/agent/chat        — streaming SSE (with MCP tools)
 * POST /api/agent/chat/sync   — sync (with MCP tools)
 * POST /api/agent/confirm     — confirm a blocked destructive op
 * POST /api/agent/clear       — clear session history
 * POST /api/context           — set project context
 * GET  /api/agent/health      — health check
 */

const express = require("express");
const router = express.Router();
const { runMcpAgentLoop } = require("../loop/mcpAgentLoop");

// In-memory session store (swap for Redis in production)
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

function getMcpProxy(req) {
  return req.app.locals.mcpProxy || null;
}

// ─── STREAMING CHAT ───────────────────────────────────────────────────────────

router.post("/agent/chat", async (req, res) => {
  const { sessionId, message, workspaceRoot, editorContext, aiSettings, agentMode = "propose" } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId and message are required" });
  }
  if (!workspaceRoot) {
    return res.status(400).json({ error: "workspaceRoot is required" });
  }

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

  let enrichedMessage = message;
  if (editorContext) {
    const ctx = buildEditorContext(editorContext);
    if (ctx) enrichedMessage = `${ctx}\n\n${message}`;
  }

  const mcpProxy = getMcpProxy(req);
  if (mcpProxy) {
    const mcpTools = mcpProxy.getMcpToolDefs();
    if (mcpTools.length > 0) {
      send({
        type: "mcp_tools_available",
        count: mcpTools.length,
        tools: mcpTools.map((t) => t.name),
      });
    }
  }

  try {
    const { finalMessage, updatedHistory, toolsUsed, iterations } = await runMcpAgentLoop({
      userMessage: enrichedMessage,
      conversationHistory: session.history,
      workspaceRoot: session.workspaceRoot,
      projectContext: session.projectContext,
      mcpProxy,
      aiSettings,
      agentMode,
      abortSignal: abortController.signal,
      onStream: (event) => {
        if (event.type === "text_delta") send({ type: "text_delta", text: event.text });
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

    session.history = updatedHistory;

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

// ─── SYNC CHAT ────────────────────────────────────────────────────────────────

router.post("/agent/chat/sync", async (req, res) => {
  const { sessionId, message, workspaceRoot, editorContext, aiSettings, agentMode = "propose" } = req.body;

  if (!sessionId || !message || !workspaceRoot) {
    return res.status(400).json({ error: "sessionId, message, workspaceRoot required" });
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
    const { finalMessage, updatedHistory, toolsUsed, iterations } = await runMcpAgentLoop({
      userMessage: enrichedMessage,
      conversationHistory: session.history,
      workspaceRoot: session.workspaceRoot,
      projectContext: session.projectContext,
      mcpProxy: getMcpProxy(req),
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

// ─── CONFIRM DESTRUCTIVE ──────────────────────────────────────────────────────

router.post("/agent/confirm", async (req, res) => {
  const { sessionId, confirmed } = req.body;

  if (!confirmed) return res.json({ status: "cancelled" });

  const session = getOrCreateSession(sessionId);
  if (!session.pendingConfirmation) {
    return res.status(400).json({ error: "No pending operation to confirm" });
  }

  const { message, workspaceRoot } = session.pendingConfirmation;
  session.pendingConfirmation = null;

  try {
    const { finalMessage, updatedHistory, toolsUsed } = await runMcpAgentLoop({
      userMessage: message,
      conversationHistory: session.history,
      workspaceRoot,
      mcpProxy: getMcpProxy(req),
      allowDestructive: true,
    });
    session.history = updatedHistory;
    res.json({ message: finalMessage, toolsUsed: toolsUsed.map((t) => t.name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLEAR SESSION ────────────────────────────────────────────────────────────

router.post("/agent/clear", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.get(sessionId).history = [];
  }
  res.json({ cleared: true });
});

// ─── SET CONTEXT ──────────────────────────────────────────────────────────────

router.post("/context", (req, res) => {
  const { sessionId, workspaceRoot, projectContext } = req.body;
  const session = getOrCreateSession(sessionId);
  if (workspaceRoot) session.workspaceRoot = workspaceRoot;
  if (projectContext) {
    const ctx = projectContext;
    session.projectContext = [
      ctx.language && `Language: ${ctx.language}`,
      ctx.framework && `Framework: ${ctx.framework}`,
      ctx.packageManager && `Package manager: ${ctx.packageManager}`,
      ctx.description && `Description: ${ctx.description}`,
    ].filter(Boolean).join("\n");
  }
  res.json({ status: "ok" });
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────

router.get("/agent/health", (req, res) => {
  const mcpProxy = getMcpProxy(req);
  const mcpTools = mcpProxy ? mcpProxy.getMcpToolDefs() : [];
  res.json({
    status: "ok",
    model: MODEL,
    sessions: sessions.size,
    mcpToolsAvailable: mcpTools.length,
    timestamp: new Date().toISOString(),
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const MODEL = "claude-opus-4-5";

function buildEditorContext({ openFile, cursorLine, selection, visibleFiles }) {
  const parts = [];
  if (openFile) {
    parts.push("[Editor context]");
    parts.push(`Active file: ${openFile}`);
    if (cursorLine) parts.push(`Cursor: line ${cursorLine}`);
    if (selection) parts.push(`Selected text:\n\`\`\`\n${selection}\n\`\`\``);
  }
  if (visibleFiles?.length) parts.push(`Open tabs: ${visibleFiles.join(", ")}`);
  return parts.length ? parts.join("\n") : null;
}

function summarizeResult(result) {
  const str = JSON.stringify(result);
  if (str.length > 2000) {
    return { summary: str.slice(0, 2000) + `... (truncated, ${str.length} chars total)` };
  }
  return result;
}

module.exports = router;
