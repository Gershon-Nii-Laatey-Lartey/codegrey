const Anthropic = require("@anthropic-ai/sdk");
const fetch = require("node-fetch");
const { TOOL_DEFINITIONS } = require("../tools/definitions");

const DEFAULTS = {
  providerId: "anthropic",
  baseUrl: "https://api.anthropic.com",
  model: "claude-opus-4-5",
  temperature: 0.5,
  maxTokens: 8096,
};

function normalizeSettings(settings = {}) {
  const providerId = settings.providerId || DEFAULTS.providerId;
  return {
    providerId,
    baseUrl: (settings.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, ""),
    apiKey:
      settings.apiKey ||
      (providerId === "google" ? process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY) ||
      "",
    model: settings.model || DEFAULTS.model,
    temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : DEFAULTS.temperature,
    maxTokens: Number.isFinite(Number(settings.maxTokens)) ? Number(settings.maxTokens) : DEFAULTS.maxTokens,
  };
}

function createProvider(settings) {
  const config = normalizeSettings(settings);
  if (config.providerId === "anthropic") return new AnthropicProvider(config);
  if (config.providerId === "google") return new GoogleProvider(config);
  return new OpenAICompatibleProvider(config);
}

class AnthropicProvider {
  constructor(config) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async call({ systemPrompt, messages, tools = TOOL_DEFINITIONS }) {
    return this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  async stream({ systemPrompt, messages, onStream, tools = TOOL_DEFINITIONS }) {
    const contentBlocks = [];
    let stopReason = null;
    const toolInputBuffers = new Map();

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      tools,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = { ...event.content_block, index: event.index };
        if (block.type === "text") block.text = "";
        if (block.type === "tool_use") {
          block.input = {};
          toolInputBuffers.set(event.index, "");
        }
        contentBlocks[event.index] = block;
      }

      if (event.type === "content_block_delta") {
        const block = contentBlocks[event.index];
        if (!block) continue;
        if (event.delta.type === "text_delta") {
          block.text = (block.text || "") + event.delta.text;
          onStream?.({ type: "text_delta", text: event.delta.text });
        }
        if (event.delta.type === "input_json_delta") {
          toolInputBuffers.set(event.index, (toolInputBuffers.get(event.index) || "") + event.delta.partial_json);
        }
      }

      if (event.type === "content_block_stop") {
        const block = contentBlocks[event.index];
        if (block?.type === "tool_use") {
          try {
            block.input = JSON.parse(toolInputBuffers.get(event.index) || "{}");
          } catch {
            block.input = {};
          }
        }
      }

      if (event.type === "message_delta") {
        stopReason = event.delta.stop_reason;
      }
    }

    const finalMessage = await stream.finalMessage();
    const content = contentBlocks.filter(Boolean).map(stripProviderFields);
    if (content.length) {
      return { content, stop_reason: stopReason || finalMessage.stop_reason };
    }
    return { content: finalMessage.content || [], stop_reason: finalMessage.stop_reason || stopReason };
  }
}

class OpenAICompatibleProvider {
  constructor(config) {
    this.config = config;
  }

  async call({ systemPrompt, messages, tools = TOOL_DEFINITIONS }) {
    const json = await this.request({
      systemPrompt,
      messages,
      tools,
      stream: false,
    });
    return openAiChoiceToResponse(json.choices?.[0]);
  }

  async stream({ systemPrompt, messages, onStream, tools = TOOL_DEFINITIONS }) {
    const response = await this.request({
      systemPrompt,
      messages,
      tools,
      stream: true,
      raw: true,
    });
    return readOpenAiStream(response, onStream);
  }

  async request({ systemPrompt, messages, tools, stream, raw = false }) {
    if (!this.config.apiKey && this.config.providerId !== "ollama") {
      throw new Error("Missing API key for selected provider.");
    }

    const url = `${this.config.baseUrl}/chat/completions`;
    const headers = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream,
        messages: toOpenAiMessages(systemPrompt, messages),
        tools: tools.map(toOpenAiTool),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 500)}`);
    }

    return raw ? response : response.json();
  }
}

class GoogleProvider {
  constructor(config) {
    this.config = config;
  }

  async call({ systemPrompt, messages, tools = TOOL_DEFINITIONS }) {
    const json = await this.request({ systemPrompt, messages, tools, stream: false });
    return googleResponseToResponse(json);
  }

  async stream({ systemPrompt, messages, onStream, tools = TOOL_DEFINITIONS }) {
    const response = await this.request({ systemPrompt, messages, tools, stream: true, raw: true });
    return readGoogleStream(response, onStream);
  }

  async request({ systemPrompt, messages, tools, stream, raw = false }) {
    if (!this.config.apiKey) throw new Error("Missing API key for Google provider.");
    const method = stream ? "streamGenerateContent" : "generateContent";
    const url = `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}:${method}?key=${encodeURIComponent(
      this.config.apiKey
    )}${stream ? "&alt=sse" : ""}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: toGoogleContents(messages),
        tools: [{ functionDeclarations: tools.map(toGoogleFunctionDeclaration) }],
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google request failed (${response.status}): ${text.slice(0, 500)}`);
    }

    return raw ? response : response.json();
  }
}

function toOpenAiTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

function toGoogleFunctionDeclaration(tool) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toGoogleSchema(tool.input_schema),
  };
}

function toGoogleSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(toGoogleSchema);
  const next = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      next[key] = value.toUpperCase();
    } else if (key === "properties" && value && typeof value === "object") {
      next[key] = Object.fromEntries(Object.entries(value).map(([prop, propSchema]) => [prop, toGoogleSchema(propSchema)]));
    } else if (key === "items") {
      next[key] = toGoogleSchema(value);
    } else {
      next[key] = toGoogleSchema(value);
    }
  }
  return next;
}

function toGoogleContents(messages) {
  const out = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] });
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      const parts = [];
      for (const block of message.content) {
        if (block.type === "text" && block.text) parts.push({ text: block.text });
        if (block.type === "tool_use") {
          parts.push({ functionCall: { name: block.name, args: block.input || {} } });
        }
      }
      if (parts.length) out.push({ role: "model", parts });
      continue;
    }

    if (message.role === "user" && Array.isArray(message.content)) {
      const parts = [];
      for (const block of message.content) {
        if (block.type === "tool_result") {
          parts.push({
            functionResponse: {
              name: findGoogleToolName(out, block.tool_use_id),
              response: safeJson(block.content),
            },
          });
        }
      }
      if (parts.length) out.push({ role: "user", parts });
    }
  }
  return out;
}

function findGoogleToolName(contents, toolUseId) {
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    for (const part of contents[i].parts || []) {
      if (
        part.functionCall?.name &&
        (!toolUseId || part.functionCall.name === toolUseId || String(toolUseId).startsWith(`${part.functionCall.name}-`))
      ) {
        return part.functionCall.name;
      }
    }
  }
  return "tool_result";
}

function toOpenAiMessages(systemPrompt, messages) {
  const out = [{ role: "system", content: systemPrompt }];
  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const toolCalls = message.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }));
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    if (message.role === "user" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
          });
        }
      }
    }
  }
  return out;
}

function openAiChoiceToResponse(choice) {
  const message = choice?.message || {};
  const content = [];
  if (message.content) content.push({ type: "text", text: message.content });
  for (const call of message.tool_calls || []) {
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.function?.name,
      input: safeJson(call.function?.arguments),
    });
  }
  return {
    content,
    stop_reason: message.tool_calls?.length || choice?.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
  };
}

function googleResponseToResponse(json) {
  return googlePartsToResponse({
    parts: json.candidates?.[0]?.content?.parts || [],
    finishReason: json.candidates?.[0]?.finishReason,
    promptFeedback: json.promptFeedback,
  });
}

function googlePartsToResponse({ parts, finishReason, promptFeedback }) {
  const content = [];
  parts.forEach((part, index) => {
    if (part.text) content.push({ type: "text", text: part.text });
    if (part.functionCall) {
      content.push({
        type: "tool_use",
        id: `${part.functionCall.name}-${index}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    }
  });
  if (content.length === 0) {
    content.push({
      type: "text",
      text: formatEmptyGoogleResponse({ finishReason, promptFeedback }),
    });
  }
  return {
    content,
    stop_reason: content.some((part) => part.type === "tool_use") || finishReason === "FUNCTION_CALL" ? "tool_use" : "end_turn",
  };
}

async function readOpenAiStream(response, onStream) {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason = null;
  const toolCalls = new Map();

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const json = JSON.parse(data);
      const choice = json.choices?.[0];
      if (!choice) continue;
      finishReason = choice.finish_reason || finishReason;
      const delta = choice.delta || {};
      if (delta.content) {
        text += delta.content;
        onStream?.({ type: "text_delta", text: delta.content });
      }
      for (const call of delta.tool_calls || []) {
        const key = call.index ?? call.id;
        const existing = toolCalls.get(key) || { id: call.id, name: "", args: "" };
        existing.id = call.id || existing.id;
        existing.name = call.function?.name || existing.name;
        existing.args += call.function?.arguments || "";
        toolCalls.set(key, existing);
      }
    }
  }

  const content = [];
  if (text) content.push({ type: "text", text });
  for (const call of toolCalls.values()) {
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: safeJson(call.args),
    });
  }
  return {
    content,
    stop_reason: toolCalls.size || finishReason === "tool_calls" ? "tool_use" : "end_turn",
  };
}

async function readGoogleStream(response, onStream) {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const toolCalls = [];
  let finishReason = null;
  let promptFeedback = null;

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      const json = JSON.parse(data);
      finishReason = json.candidates?.[0]?.finishReason || finishReason;
      promptFeedback = json.promptFeedback || promptFeedback;
      const parts = json.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          text += part.text;
          onStream?.({ type: "text_delta", text: part.text });
        }
        if (part.functionCall) toolCalls.push(part.functionCall);
      }
    }
  }

  const content = [];
  if (text) content.push({ type: "text", text });
  toolCalls.forEach((call, index) => {
    content.push({
      type: "tool_use",
      id: `${call.name}-${index}`,
      name: call.name,
      input: call.args || {},
    });
  });
  if (content.length === 0) {
    content.push({
      type: "text",
      text: formatEmptyGoogleResponse({ finishReason, promptFeedback }),
    });
  }
  return {
    content,
    stop_reason: toolCalls.length || finishReason === "FUNCTION_CALL" ? "tool_use" : "end_turn",
  };
}

function formatEmptyGoogleResponse({ finishReason, promptFeedback }) {
  const blockReason = promptFeedback?.blockReason;
  const safety = promptFeedback?.safetyRatings
    ?.map((rating) => `${rating.category}: ${rating.probability}`)
    .join(", ");
  if (blockReason) {
    return `Google returned no text because the prompt was blocked (${blockReason}${safety ? `; ${safety}` : ""}).`;
  }
  if (finishReason && finishReason !== "STOP") {
    return `Google returned no text. Finish reason: ${finishReason}.`;
  }
  return "Google returned an empty response with no text or tool calls.";
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function stripProviderFields(block) {
  if (!block || typeof block !== "object") return block;
  const { index, ...clean } = block;
  return clean;
}

module.exports = { createProvider, normalizeSettings, DEFAULTS };
