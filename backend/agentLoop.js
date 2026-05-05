/**
 * AGENTIC LOOP
 * This is the heart of the system.
 *
 * Flow:
 *   User message → Claude → [tool calls] → execute tools → feed results back → Claude → repeat
 *   Loop exits when Claude returns a final text response with no tool calls.
 *
 * Mirrors how Cursor/Windsurf actually work under the hood.
 */

const Anthropic = require("@anthropic-ai/sdk");
const { TOOL_DEFINITIONS } = require("../tools/definitions");
const { ToolExecutor } = require("../tools/executor");
const { buildSystemPrompt } = require("../prompts/system");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-opus-4-5";
const MAX_TOKENS = 8096;
const MAX_ITERATIONS = 50; // Safety ceiling — prevents infinite loops

/**
 * runAgentLoop
 *
 * @param {object}   options
 * @param {string}   options.userMessage        - The user's latest message
 * @param {Array}    options.conversationHistory - Full prior message history [{role, content}]
 * @param {string}   options.workspaceRoot       - Absolute path to the user's project
 * @param {object}   options.projectContext      - Optional metadata about the project
 * @param {Function} options.onStream            - Called with each streamed event (for SSE/WebSocket)
 * @param {Function} options.onToolCall          - Called when a tool is invoked (for UI feedback)
 * @param {Function} options.onToolResult        - Called when a tool returns a result
 * @param {boolean}  options.allowDestructive    - Allow destructive operations (rm, etc.)
 *
 * @returns {object} { finalMessage, updatedHistory, toolsUsed, iterations }
 */
async function runAgentLoop({
  userMessage,
  conversationHistory = [],
  workspaceRoot,
  projectContext = null,
  onStream = null,
  onToolCall = null,
  onToolResult = null,
  allowDestructive = false,
}) {
  // Build executor for this session
  const executor = new ToolExecutor({ workspaceRoot, allowDestructive });

  // Detect OS and shell for the system prompt
  const os = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const shell = process.platform === "win32" ? "cmd/powershell" : "bash";

  const systemPrompt = buildSystemPrompt({ workspaceRoot, os, shell, projectContext });

  // Build message list: prior history + new user message
  const messages = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let iterations = 0;
  const toolsUsed = [];
  let finalMessage = null;

  // ─── MAIN LOOP ──────────────────────────────────────────────────────────────
  while (iterations < MAX_ITERATIONS) {
    iterations++;

    if (onStream) onStream({ type: "iteration_start", iteration: iterations });

    // ── Call Claude ─────────────────────────────────────────────────────────
    let response;

    if (onStream) {
      // Streaming mode — real-time tokens
      response = await callClaudeStreaming({ anthropic, systemPrompt, messages, onStream });
    } else {
      // Batch mode — wait for full response
      response = await callClaude({ anthropic, systemPrompt, messages });
    }

    // Add assistant response to message history
    messages.push({ role: "assistant", content: response.content });

    // ── Check stop reason ───────────────────────────────────────────────────
    if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
      // Claude is done — extract the final text
      finalMessage = extractText(response.content);
      break;
    }

    if (response.stop_reason !== "tool_use") {
      // Unexpected stop reason — treat as done
      finalMessage = extractText(response.content) || "(Task completed)";
      break;
    }

    // ── Execute tool calls ──────────────────────────────────────────────────
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      finalMessage = extractText(response.content);
      break;
    }

    // Build the tool_result message (all results bundled together)
    const toolResults = [];

    for (const toolBlock of toolUseBlocks) {
      const { id, name, input } = toolBlock;

      // Notify UI that a tool is being called
      if (onToolCall) {
        onToolCall({ toolName: name, toolInput: input, toolId: id, iteration: iterations });
      }

      toolsUsed.push({ name, input, iteration: iterations });

      let result;
      let isError = false;

      try {
        result = await executor.execute(name, input);
      } catch (err) {
        result = {
          error: err.message,
          hint: `Tool "${name}" threw an exception. Check the input and try again.`,
        };
        isError = true;
      }

      // Notify UI of the result
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

    // Feed tool results back to Claude
    messages.push({ role: "user", content: toolResults });
  }

  // Safety: if loop maxed out without a final message
  if (!finalMessage && iterations >= MAX_ITERATIONS) {
    finalMessage =
      `Agent reached the maximum iteration limit (${MAX_ITERATIONS}). ` +
      `The task may be partially complete. Please review the changes made.`;
  }

  // Return updated conversation history (without system prompt — managed separately)
  const updatedHistory = messages;

  return { finalMessage, updatedHistory, toolsUsed, iterations };
}

// ─── CLAUDE API CALLS ──────────────────────────────────────────────────────────

async function callClaude({ anthropic, systemPrompt, messages }) {
  return anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: TOOL_DEFINITIONS,
    messages,
  });
}

async function callClaudeStreaming({ anthropic, systemPrompt, messages, onStream }) {
  // Collect the full response while streaming
  const contentBlocks = [];
  let stopReason = null;

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: TOOL_DEFINITIONS,
    messages,
  });

  // Track current text block and tool block being built
  let currentBlock = null;

  stream.on("stream_event", (event) => {
    onStream({ type: "raw_event", event });

    if (event.type === "content_block_start") {
      currentBlock = { ...event.content_block, index: event.index };
      if (currentBlock.type === "text") currentBlock.text = "";
      if (currentBlock.type === "tool_use") currentBlock.input = "";
    }

    if (event.type === "content_block_delta" && currentBlock) {
      if (event.delta.type === "text_delta") {
        currentBlock.text = (currentBlock.text || "") + event.delta.text;
        onStream({ type: "text_delta", text: event.delta.text });
      }
      if (event.delta.type === "input_json_delta") {
        currentBlock.input = (currentBlock.input || "") + event.delta.partial_json;
      }
    }

    if (event.type === "content_block_stop" && currentBlock) {
      // Parse tool input JSON when block is complete
      if (currentBlock.type === "tool_use" && currentBlock.input) {
        try {
          currentBlock.input = JSON.parse(currentBlock.input);
        } catch {
          currentBlock.input = {};
        }
      }
      contentBlocks[currentBlock.index] = currentBlock;
      currentBlock = null;
    }

    if (event.type === "message_delta") {
      stopReason = event.delta.stop_reason;
    }
  });

  await stream.finalMessage();

  return {
    content: contentBlocks.filter(Boolean),
    stop_reason: stopReason,
  };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function extractText(contentBlocks) {
  return contentBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

module.exports = { runAgentLoop };
