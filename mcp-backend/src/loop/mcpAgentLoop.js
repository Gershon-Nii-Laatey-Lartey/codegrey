/**
 * MCP-AWARE AGENT LOOP
 *
 * Extends the base AI backend's agent loop pattern with MCP tool support.
 *
 * Key difference from the base loop:
 *   - Tool definitions include both built-in tools AND all MCP tools
 *   - Tool dispatch checks if the tool is an MCP tool first (mcp__<server>__<name>)
 *   - MCP tools are routed to McpProxy.dispatch(); built-in tools go to ToolExecutor
 *
 * Everything else (streaming, iteration, history) is identical to the base loop.
 */

const { TOOL_DEFINITIONS } = require("../../backend/src/tools/definitions");
const { ToolExecutor } = require("../../backend/src/tools/executor");
const { buildSystemPrompt } = require("../../backend/src/prompts/system");
const { createProvider } = require("../../backend/src/providers/index");

const MAX_ITERATIONS = 50;

/**
 * runMcpAgentLoop
 *
 * @param {object}   options
 * @param {string}   options.userMessage
 * @param {Array}    options.conversationHistory
 * @param {string}   options.workspaceRoot
 * @param {object}   options.projectContext
 * @param {object}   options.mcpProxy           — McpProxy instance (from mcp-backend)
 * @param {object}   options.aiSettings         — Provider settings (apiKey, model, etc.)
 * @param {Function} options.onStream
 * @param {Function} options.onToolCall
 * @param {Function} options.onToolResult
 * @param {boolean}  options.allowDestructive
 * @param {string}   options.agentMode
 * @param {AbortSignal} options.abortSignal
 */
async function runMcpAgentLoop({
  userMessage,
  conversationHistory = [],
  workspaceRoot,
  projectContext = null,
  mcpProxy = null,
  aiSettings = null,
  onStream = null,
  onToolCall = null,
  onToolResult = null,
  onFileChange = null,
  allowDestructive = false,
  agentMode = "propose",
  abortSignal = null,
}) {
  const executor = new ToolExecutor({ workspaceRoot, allowDestructive, agentMode });
  const provider = createProvider(aiSettings);

  const os = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const shell = process.platform === "win32" ? "cmd/powershell" : "bash";

  // Build system prompt — include MCP tool summary if any are connected
  const mcpContext = mcpProxy ? buildMcpContext(mcpProxy) : null;
  const systemPrompt = buildSystemPrompt({
    workspaceRoot,
    os,
    shell,
    projectContext: [projectContext, mcpContext].filter(Boolean).join("\n\n") || null,
  });

  // Merge built-in tool defs with MCP tool defs
  const mcpToolDefs = mcpProxy ? mcpProxy.getMcpToolDefs() : [];
  const allToolDefs = [...TOOL_DEFINITIONS, ...mcpToolDefs];

  const messages = [
    ...conversationHistory.map(sanitizeMessageForProvider),
    { role: "user", content: userMessage },
  ];

  let iterations = 0;
  const toolsUsed = [];
  let finalMessage = null;

  while (iterations < MAX_ITERATIONS) {
    throwIfAborted(abortSignal);
    iterations++;

    if (onStream) onStream({ type: "iteration_start", iteration: iterations });

    const response = onStream
      ? await provider.stream({ systemPrompt, messages, tools: allToolDefs, onStream })
      : await provider.call({ systemPrompt, messages, tools: allToolDefs });

    throwIfAborted(abortSignal);
    response.content = sanitizeContentBlocks(response.content);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
      finalMessage = extractText(response.content) || formatEmptyProviderResponse(response);
      break;
    }

    if (response.stop_reason !== "tool_use") {
      finalMessage = extractText(response.content) || "(Task completed)";
      break;
    }

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      finalMessage = extractText(response.content) || formatEmptyProviderResponse(response);
      break;
    }

    const toolResults = [];

    for (const toolBlock of toolUseBlocks) {
      throwIfAborted(abortSignal);
      const { id, name, input } = toolBlock;

      if (onToolCall) {
        onToolCall({ toolName: name, toolInput: input, toolId: id, iteration: iterations });
      }

      toolsUsed.push({ name, input, iteration: iterations });

      let result;
      let isError = false;

      try {
        if (mcpProxy && mcpProxy.isMcpTool(name)) {
          // ── Route to MCP server ──────────────────────────────────────────
          result = await mcpProxy.dispatch(name, input);
        } else {
          // ── Route to built-in executor ───────────────────────────────────
          result = await executor.execute(name, input);
        }
      } catch (err) {
        result = {
          error: err.message,
          hint: `Tool "${name}" threw an exception. Check input and try again.`,
        };
        isError = true;
      }

      throwIfAborted(abortSignal);

      if (result?.__type === "file_change_proposed") {
        onFileChange?.({
          filePath: result.filePath,
          oldContent: result.oldContent,
          newContent: result.newContent,
          autoApplied: Boolean(result.autoApplied),
          toolName: name,
          toolId: id,
          iteration: iterations,
        });
        result = {
          success: true,
          path: result.filePath,
          proposed: !result.autoApplied,
          autoApplied: Boolean(result.autoApplied),
          message: result.autoApplied
            ? "File change applied and recorded in chat."
            : "File change proposed to the user for approval.",
        };
      }

      if (onToolResult) {
        onToolResult({ toolName: name, toolId: id, result, isError, iteration: iterations });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: id,
        content: JSON.stringify(result, null, 2),
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (!finalMessage && iterations >= MAX_ITERATIONS) {
    finalMessage =
      `Agent reached the maximum iteration limit (${MAX_ITERATIONS}). ` +
      `The task may be partially complete. Please review the changes made.`;
  }

  return { finalMessage, updatedHistory: messages, toolsUsed, iterations };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function buildMcpContext(mcpProxy) {
  const tools = mcpProxy.listAllTools();
  if (tools.length === 0) return null;

  const byServer = {};
  for (const { serverId, serverLabel, tool } of tools) {
    if (!byServer[serverId]) byServer[serverId] = { label: serverLabel, tools: [] };
    byServer[serverId].tools.push(tool.name);
  }

  const lines = ["Connected MCP servers (use mcp__<server>__<tool> to call):"];
  for (const [id, { label, tools }] of Object.entries(byServer)) {
    lines.push(`  ${label} (${id}): ${tools.join(", ")}`);
  }
  return lines.join("\n");
}

function extractText(contentBlocks) {
  return contentBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function formatEmptyProviderResponse(response) {
  const stopReason = response?.stop_reason ? ` Stop reason: ${response.stop_reason}.` : "";
  return `The model completed without returning visible text or tool calls.${stopReason}`;
}

function throwIfAborted(abortSignal) {
  if (!abortSignal?.aborted) return;
  const err = new Error("Agent request aborted.");
  err.name = "AbortError";
  throw err;
}

function sanitizeMessageForProvider(message) {
  if (!message || !Array.isArray(message.content)) return message;
  return { ...message, content: sanitizeContentBlocks(message.content) };
}

function sanitizeContentBlocks(content) {
  if (!Array.isArray(content)) return content;
  return content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const { index, ...clean } = block;
    return clean;
  });
}

module.exports = { runMcpAgentLoop };
