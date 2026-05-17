import { useRef, useState, useEffect } from "react";
import { ChatMessage, ChatMessagePart, AiSettings, AiRequestConfig } from "../types/ai";
import { getSessionId, streamChat } from "../lib/aiClient";

export function useAgent(
  activeWorkspaceId: string | null | undefined,
  activeConversationId: string | null | undefined,
  workspaceRoot: string | null,
  aiSettings: AiSettings,
  aiRequest: AiRequestConfig,
  openTabs: string[],
  activeTab: string | null,
  CHAT_TAB_ID: string,
  BROWSER_TAB_ID: string,
  viewMode: string,
  onConversationCreated?: (id: string) => void,
  onCloseConversation?: () => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [chatTabVisible, setChatTabVisible] = useState(false);
  const [continuePromptVisible, setContinuePromptVisible] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(getSessionId());
  const loadedConversationIdRef = useRef<string | null>(null);

  const updateAssistantParts = (assistantId: string, updater: (parts: ChatMessagePart[]) => ChatMessagePart[]) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, parts: updater(message.parts) } : message
      )
    );
  };

  const send = async (value: string, attachedImages: any[], attachedContextFiles: string[], setValue: (v: string) => void, setAttachedImages: (i: any[]) => void, setAttachedContextFiles: (c: string[]) => void, setActiveTab: (t: string | null) => void) => {
    const text = value.trim();
    if (!text || !workspaceRoot || agentRunning) return;

    const sentFromFile = activeTab && activeTab !== CHAT_TAB_ID && activeTab !== BROWSER_TAB_ID;
    const contextFile = sentFromFile ? activeTab : null;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const assistantId = crypto.randomUUID();
    
    const userParts: ChatMessagePart[] = [];
    for (const img of attachedImages) {
      userParts.push({ type: "image", dataUrl: img.dataUrl, mimeType: img.mimeType, name: img.name } as any);
    }
    userParts.push({ type: "text", content: text });

    const contextNote = attachedContextFiles.length > 0
      ? `\n\n[Context files: ${attachedContextFiles.join(", ")}]`
      : "";
    if (contextNote && userParts[userParts.length - 1].type === "text") {
      (userParts[userParts.length - 1] as any).content += contextNote;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: userParts,
      timestamp: now,
      contextFile,
    };
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      parts: [],
      timestamp: now,
      streaming: true,
    };

    let targetConvId = activeConversationId;
    let isFirstMessage = false;
    let pendingOnCreated: string | null = null;

    if (!targetConvId && activeWorkspaceId) {
      const newConv = await window.codegrey?.brain?.createConversation?.(activeWorkspaceId, "New Chat");
      if (newConv) {
        targetConvId = newConv.id;
        loadedConversationIdRef.current = newConv.id;
        pendingOnCreated = newConv.id;
        isFirstMessage = true;
      }
    } else if (messages.length === 0) {
      isFirstMessage = true;
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setAgentRunning(true);

    if (pendingOnCreated) {
      onConversationCreated?.(pendingOnCreated);
    }
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    setChatTabVisible(true);
    if (sentFromFile) {
      setContinuePromptVisible(true);
    } else if (viewMode === "agent") {
      setActiveTab(CHAT_TAB_ID);
    }
    setValue("");
    setAttachedImages([]);
    setAttachedContextFiles([]);

    try {
      await streamChat({
        sessionId: activeConversationId || sessionIdRef.current,
        message: attachedContextFiles.length > 0
          ? `${text}\n\n[Attached context files: ${attachedContextFiles.join(", ")}]`
          : text,
        images: attachedImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType })),
        workspaceRoot,
        aiSettings,
        aiRequest,
        agentMode: aiSettings.autoApply ? "auto" : "propose",
        signal: abortController.signal,
        editorContext: {
          openFile: contextFile || undefined,
          visibleFiles: openTabs.filter((tab) => tab !== CHAT_TAB_ID && tab !== BROWSER_TAB_ID),
        },
        onEvent: (event) => {
          if (event.type === "text_delta") {
            updateAssistantParts(assistantId, (parts) => {
              const next = [...parts];
              const last = next[next.length - 1];
              if (last?.type === "text") {
                next[next.length - 1] = { ...last, content: last.content + event.text };
              } else {
                next.push({ type: "text", content: event.text });
              }
              return next;
            });
          }
          if (event.type === "tool_call") {
            updateAssistantParts(assistantId, (parts) => [
              ...parts,
              { type: "tool_call", id: event.id, name: event.name, input: event.input, status: "running" },
            ]);
          }
          if (event.type === "tool_result") {
            updateAssistantParts(assistantId, (parts) =>
              parts.map((part) =>
                part.type === "tool_call" && part.id === event.id
                  ? { ...part, status: event.isError ? "error" : "done", result: event.result, isError: event.isError }
                  : part
              )
            );
          }
          if (event.type === "file_change_proposed") {
            const proposalId = crypto.randomUUID();
            void window.codegrey?.workspace?.writeFile?.(event.filePath, event.newContent).then(() => {
              window.dispatchEvent(new CustomEvent('codegrey:explorer-refresh'));
            });
            updateAssistantParts(assistantId, (parts) => [
              ...parts,
              { type: "file_proposal", id: proposalId, filePath: event.filePath, oldContent: event.oldContent, newContent: event.newContent, status: event.autoApplied ? "accepted" : "pending", autoApplied: event.autoApplied },
            ]);
          }
          if (event.type === "error") {
            updateAssistantParts(assistantId, (parts) => [...parts, { type: "text", content: `\n\n**Error:** ${event.message}` }]);
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
            setAgentRunning(false);
            streamAbortRef.current = null;
          }
          if (event.type === "done") {
            if (event.finalMessage) {
              updateAssistantParts(assistantId, (parts) => {
                const hasText = parts.some((p) => p.type === "text" && p.content.trim());
                return hasText ? parts : [...parts, { type: "text", content: event.finalMessage }];
              });
            }
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
            setAgentRunning(false);
            streamAbortRef.current = null;
          }
        },
      });

      if (isFirstMessage && activeWorkspaceId && targetConvId) {
        try {
          const tokens = await window.codegrey?.auth?.loadTokens?.();
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (tokens?.access_token) headers.Authorization = `Bearer ${tokens.access_token}`;
          const res = await fetch("http://localhost:3172/api/agent/title", {
            method: "POST",
            headers,
            body: JSON.stringify({ message: text, aiSettings, aiRequest }),
          });
          const data = await res.json();
          if (data.title) {
            await window.codegrey?.brain?.renameConversation?.(activeWorkspaceId, targetConvId, data.title);
            onConversationCreated?.(targetConvId);
          }
        } catch (e) {}
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      updateAssistantParts(assistantId, (parts) => [
        ...parts,
        { type: "text", content: aborted ? "**Stopped.**" : `**Error:** ${err instanceof Error ? err.message : "AI request failed."}` },
      ]);
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
      setAgentRunning(false);
      streamAbortRef.current = null;
    }
  };

  const abortAgent = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setAgentRunning(false);
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
  };

  const resetChat = () => {
    setMessages([]);
    setContinuePromptVisible(false);
  };

  return {
    messages,
    setMessages,
    agentRunning,
    chatTabVisible,
    setChatTabVisible,
    continuePromptVisible,
    setContinuePromptVisible,
    send,
    abortAgent,
    resetChat,
    loadedConversationIdRef,
  };
}
