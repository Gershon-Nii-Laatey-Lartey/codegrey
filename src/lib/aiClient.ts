import type { AiSettings, AiStreamEvent } from "../types/ai";

const API_BASE = "http://localhost:3172/api";

export function getSessionId() {
  const key = "codegrey.ai.sessionId";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function initSession(opts: {
  sessionId: string;
  workspaceRoot: string;
  projectContext?: { description?: string | null };
}) {
  await fetch(`${API_BASE}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
}

export async function clearSession(sessionId: string) {
  await fetch(`${API_BASE}/agent/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

export async function streamChat(opts: {
  sessionId: string;
  message: string;
  images?: Array<{ base64: string; mimeType: string }>;
  workspaceRoot: string;
  workspaceId?: string | null;
  aiSettings: AiSettings;
  agentMode: "propose" | "auto";
  editorContext?: { openFile?: string; cursorLine?: number; selection?: string; visibleFiles?: string[] };
  signal?: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: opts.sessionId,
      message: opts.message,
      images: opts.images ?? [],
      workspaceRoot: opts.workspaceRoot,
      workspaceId: opts.workspaceId ?? null,
      editorContext: opts.editorContext,
      aiSettings: opts.aiSettings,
      agentMode: opts.agentMode,
    }),
    signal: opts.signal,
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || `AI backend failed with HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const raw of events) {
      const line = raw
        .split(/\r?\n/)
        .find((entry) => entry.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      opts.onEvent(JSON.parse(payload) as AiStreamEvent);
    }
  }
}
