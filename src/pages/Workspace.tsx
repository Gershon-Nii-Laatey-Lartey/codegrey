import {
  ArrowUp,
  Component,
  AtSign,
  Mic,
  Monitor,
  Plus,
  Paperclip,
  Plug,
  CornerDownRight,
  Terminal,
  X,
  Globe,
  Square,
  MessageSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { Browser } from "./Browser";
import { MessageRenderer } from "../components/chat/MessageRenderer";
import { getSessionId, initSession, streamChat } from "../lib/aiClient";
import { readWorkspaceLayout, writeWorkspaceLayout } from "../lib/workspaceLayout";
import { DEFAULT_AI_SETTINGS, type AiSettings, type ChatMessage, type ChatMessagePart } from "../types/ai";
import { createPatch } from "diff";

type WorkspaceViewMode = "agent" | "split";
const CHAT_TAB_ID = "__codegrey_chat__";
const BROWSER_TAB_ID = "__codegrey_browser__";
const LOGO_BASE = "https://id-preview--04de67e2-e451-4c83-88ee-80059e54f053.lovable.app/api/logo";



export function Workspace({
  workspaceRoot,
  selectedFile,
  selectedFileRequest,
  getFileIcon,
  onRequestOpenFolder,
  onCreateFile,
  terminalOpen,
  setTerminalOpen,
  viewMode,
  browserTabRequest,
  activeWorkspaceId,
  activeConversationId,
  activeConversationRequest,
  onConversationCreated,
  onCloseConversation,
  onClearSelectedFile,
  onOpenMcpSettings,
}: {
  workspaceRoot: string | null;
  selectedFile: string | null;
  selectedFileRequest?: number;
  getFileIcon: (fileName: string, isDir?: boolean) => { svg?: string; char?: string; color?: string };
  onRequestOpenFolder: () => void;
  onCreateFile?: () => void | Promise<void>;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  viewMode: WorkspaceViewMode;
  browserTabRequest?: number;
  activeWorkspaceId?: string | null;
  activeConversationId?: string | null;
  activeConversationRequest?: number;
  onConversationCreated?: (id: string) => void;
  onCloseConversation?: () => void;
  onClearSelectedFile?: () => void;
  onOpenMcpSettings?: () => void;
}) {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [monacoLanguage, setMonacoLanguage] = useState<string>("plaintext");
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatTabVisible, setChatTabVisible] = useState(false);
  const [continuePromptVisible, setContinuePromptVisible] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [reviewProposalId, setReviewProposalId] = useState<string | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(getSessionId());
  const streamAbortRef = useRef<AbortController | null>(null);
  const layoutHydratedRootRef = useRef<string | null>(null);
  const editorSaveTimerRef = useRef<number | null>(null);

  const [terminalHeight, setTerminalHeight] = useState(260);
  const [chatPanelWidth, setChatPanelWidth] = useState(340);
  const [terminals, setTerminals] = useState<Array<{ id: string; title: string }>>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const workspaceBodyRef = useRef<HTMLDivElement | null>(null);
  const terminalViewportRef = useRef<HTMLDivElement | null>(null);
  const terminalInstancesRef = useRef(
    new Map<
      string,
      {
        term: XTerm;
        fit: FitAddon;
        wrap: HTMLDivElement;
        title: string;
      }
    >()
  );
  const isResizingRef = useRef(false);
  const isChatResizingRef = useRef(false);
  const terminalSeqRef = useRef(0);
  const pendingFitRef = useRef<number | null>(null);
  const loadedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceRoot) return;
    const layout = readWorkspaceLayout(workspaceRoot);
    layoutHydratedRootRef.current = workspaceRoot;
    setOpenTabs(layout.openTabs);
    setActiveTab(layout.activeTab);
    setChatPanelWidth(layout.chatPanelWidth);
    setTerminalHeight(layout.terminalHeight);
    setTerminalOpen(layout.terminalOpen);
  }, [workspaceRoot, setTerminalOpen]);

  useEffect(() => {
    if (!workspaceRoot || layoutHydratedRootRef.current !== workspaceRoot) return;
    writeWorkspaceLayout(workspaceRoot, {
      openTabs,
      activeTab: activeTab === CHAT_TAB_ID ? null : activeTab,
      chatPanelWidth,
      terminalHeight,
      terminalOpen,
      viewMode,
    });
  }, [workspaceRoot, openTabs, activeTab, chatPanelWidth, terminalHeight, terminalOpen, viewMode]);

  // Load chat when active conversation changes
  useEffect(() => {
    let cancelled = false;
    const loadChat = async () => {
      if (activeWorkspaceId && activeConversationId) {
        // IMPORTANT: If we already have this conversation loaded in memory (e.g. we just created it),
        // don't reload from disk, as the disk version might be behind the current stream.
        if (activeConversationId === loadedConversationIdRef.current) return;

        const msgs = await window.codegrey?.brain?.getConversationMessages?.(activeWorkspaceId, activeConversationId) || [];
        if (!cancelled) {
          loadedConversationIdRef.current = activeConversationId;
          setMessages(msgs);
        }
      } else {
        if (!cancelled) {
          loadedConversationIdRef.current = null;
          setMessages([]);
        }
      }
    };
    loadChat();
    return () => { cancelled = true; };
  }, [activeWorkspaceId, activeConversationId]);

  // Open chat tab when conversation is selected
  useEffect(() => {
    if (activeConversationId) {
      setChatTabVisible(true);
      if (viewMode === "agent") {
        setActiveTab(CHAT_TAB_ID);
      }
    } else {
      setChatTabVisible(false);
      setActiveTab((current) => (current === CHAT_TAB_ID ? openTabs[openTabs.length - 1] ?? null : current));
    }
  }, [activeConversationId, viewMode, activeConversationRequest]);

  // Save chat when messages update
  useEffect(() => {
    if (activeWorkspaceId && activeConversationId && messages.length > 0) {
      if (loadedConversationIdRef.current === activeConversationId) {
        void window.codegrey?.brain?.saveConversationMessages?.(activeWorkspaceId, activeConversationId, messages);
      }
    }
  }, [messages, activeWorkspaceId, activeConversationId]);

  const pendingProposals = useMemo(
    () =>
      messages.flatMap((message) =>
        message.parts.filter((part) => part.type === "file_proposal" && part.status === "pending")
      ) as Array<Extract<ChatMessagePart, { type: "file_proposal" }>>,
    [messages]
  );

  const allProposals = useMemo(
    () =>
      messages.flatMap((message) =>
        message.parts.filter((part) => part.type === "file_proposal")
      ) as Array<Extract<ChatMessagePart, { type: "file_proposal" }>>,
    [messages]
  );

  useEffect(() => {
    if (!selectedFile) return;
    const proposal = pendingProposals.find((item) => item.filePath === selectedFile);
    setReviewProposalId(proposal?.id ?? null);
    setOpenTabs((prev) => (prev.includes(selectedFile) ? prev : [...prev, selectedFile]));
    setActiveTab(selectedFile);
  }, [selectedFile, selectedFileRequest, pendingProposals]);

  useEffect(() => {
    if (browserTabRequest && browserTabRequest > 0) {
      setOpenTabs((prev) => (prev.includes(BROWSER_TAB_ID) ? prev : [...prev, BROWSER_TAB_ID]));
      setActiveTab(BROWSER_TAB_ID);
    }
  }, [browserTabRequest]);

  useEffect(() => {
    let cancelled = false;
    void window.codegrey?.settings?.get().then((settings) => {
      if (!cancelled && settings) setAiSettings({ ...DEFAULT_AI_SETTINGS, ...settings });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceRoot) return;
    const packagePath = `${workspaceRoot}\\package.json`;
    void window.codegrey?.workspace?.readFile?.(packagePath).then((raw) => {
      let description = "";
      try {
        const pkg = raw ? JSON.parse(raw) : null;
        description = [pkg?.name, pkg?.description].filter(Boolean).join(": ");
      } catch {
        description = "";
      }
      void initSession({
        sessionId: activeConversationId || sessionIdRef.current,
        workspaceRoot,
        projectContext: { description },
      }).catch(() => undefined);
    });
  }, [workspaceRoot, activeConversationId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeTab) {
        setFileText("");
        setMonacoLanguage("plaintext");
        return;
      }
      if (activeTab === CHAT_TAB_ID || activeTab === BROWSER_TAB_ID) return;

      // Auto-trigger review mode if the file has a pending proposal
      const proposal = pendingProposals.find(p => p.filePath === activeTab);
      if (proposal && reviewProposalId !== proposal.id) {
        setReviewProposalId(proposal.id);
      } else if (!proposal && reviewProposalId) {
        const reviewing = allProposals.find((item) => item.id === reviewProposalId);
        if (reviewing?.filePath === activeTab) setReviewProposalId(null);
      }

      const text = await window.codegrey?.workspace?.readFile?.(activeTab);
      if (cancelled) return;
      setFileText(text ?? "");
      setMonacoLanguage(inferLanguage(activeTab));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, pendingProposals, allProposals, reviewProposalId]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [value]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const height = window.innerHeight - e.clientY;
      const newHeight = Math.min(Math.max(120, height), window.innerHeight * 0.8);
      setTerminalHeight(newHeight);
      if (activeTerminalId) {
        terminalInstancesRef.current.get(activeTerminalId)?.fit.fit();
      }
    };

    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        void resizeActiveTerminal();
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [activeTerminalId]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isChatResizingRef.current) return;
      const body = workspaceBodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const maxWidth = Math.min(620, Math.max(280, rect.width - 360));
      const nextWidth = Math.min(Math.max(rect.right - e.clientX, 280), maxWidth);
      setChatPanelWidth(nextWidth);
    };

    const onMouseUp = () => {
      if (!isChatResizingRef.current) return;
      isChatResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const activeName = useMemo(() => {
    if (!activeTab) return "";
    const parts = activeTab.split(/[/\\]/);
    return parts[parts.length - 1] ?? activeTab;
  }, [activeTab]);

  const updateAssistantParts = (assistantId: string, updater: (parts: ChatMessagePart[]) => ChatMessagePart[]) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, parts: updater(message.parts) } : message
      )
    );
  };

  const send = async () => {
    const text = value.trim();
    if (!text || !workspaceRoot || agentRunning) return;

    const sentFromFile = activeTab && activeTab !== CHAT_TAB_ID && activeTab !== BROWSER_TAB_ID;
    const contextFile = sentFromFile ? activeTab : null;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const assistantId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", content: text }],
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

    try {
      await streamChat({
        sessionId: activeConversationId || sessionIdRef.current,
        message: text,
        workspaceRoot,
        aiSettings,
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
              {
                type: "tool_call",
                id: event.id,
                name: event.name,
                input: event.input,
                status: "running",
              },
            ]);
          }

          if (event.type === "tool_result") {
            updateAssistantParts(assistantId, (parts) =>
              parts.map((part) =>
                part.type === "tool_call" && part.id === event.id
                  ? {
                    ...part,
                    status: event.isError ? "error" : "done",
                    result: event.result,
                    isError: event.isError,
                  }
                  : part
              )
            );
          }

          if (event.type === "file_change_proposed") {
            const proposalId = crypto.randomUUID();
            // Automatically write to disk so it appears in the explorer immediately
            void window.codegrey?.workspace?.writeFile?.(event.filePath, event.newContent).then(() => {
              window.dispatchEvent(new CustomEvent('codegrey:explorer-refresh'));
            });

            updateAssistantParts(assistantId, (parts) => [
              ...parts,
              {
                type: "file_proposal",
                id: proposalId,
                filePath: event.filePath,
                oldContent: event.oldContent,
                newContent: event.newContent,
                status: event.autoApplied ? "accepted" : "pending",
                autoApplied: event.autoApplied,
              },
            ]);
          }

          if (event.type === "error") {
            updateAssistantParts(assistantId, (parts) => [
              ...parts,
              { type: "text", content: `\n\n**Error:** ${event.message}` },
            ]);
            setMessages((prev) =>
              prev.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message))
            );
            setAgentRunning(false);
            streamAbortRef.current = null;
          }

          if (event.type === "done") {
            if (event.finalMessage) {
              updateAssistantParts(assistantId, (parts) => {
                const hasText = parts.some((part) => part.type === "text" && part.content.trim());
                return hasText ? parts : [...parts, { type: "text", content: event.finalMessage }];
              });
            }
            setMessages((prev) =>
              prev.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message))
            );
            setAgentRunning(false);
            streamAbortRef.current = null;
          }
        },
      });

      if (isFirstMessage && activeWorkspaceId && targetConvId) {
        try {
          const res = await fetch("http://localhost:3172/api/agent/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, aiSettings }),
          });
          const data = await res.json();
          if (data.title) {
            await window.codegrey?.brain?.renameConversation?.(activeWorkspaceId, targetConvId, data.title);
            onConversationCreated?.(targetConvId);
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      updateAssistantParts(assistantId, (parts) => [
        ...parts,
        {
          type: "text",
          content: aborted ? "**Stopped.**" : `**Error:** ${err instanceof Error ? err.message : "AI request failed."}`,
        },
      ]);
      setMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? { ...message, streaming: false } : message))
      );
      setAgentRunning(false);
      streamAbortRef.current = null;
    }
  };

  const abortAgent = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setAgentRunning(false);
    setMessages((prev) =>
      prev.map((message) => (message.streaming ? { ...message, streaming: false } : message))
    );
  };

  useEffect(() => {
    return () => {
      if (editorSaveTimerRef.current) window.clearTimeout(editorSaveTimerRef.current);
    };
  }, []);

  const handleEditorChange = (nextValue?: string) => {
    const nextText = nextValue ?? "";
    setFileText(nextText);
    if (!activeTab || activeTab === CHAT_TAB_ID || activeTab === BROWSER_TAB_ID) return;
    if (editorSaveTimerRef.current) window.clearTimeout(editorSaveTimerRef.current);
    editorSaveTimerRef.current = window.setTimeout(() => {
      void window.codegrey?.workspace?.writeFile?.(activeTab, nextText);
    }, 350);
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    monaco.editor.defineTheme("codegrey-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#151515",
        "editor.foreground": "#f4f4f1",
        "editorLineNumber.foreground": "#6a6a66",
        "editorLineNumber.activeForeground": "#c8c8c2",
        "editorCursor.foreground": "#74a8ff",
        "editor.selectionBackground": "#2b355f",
        "editor.inactiveSelectionBackground": "#232a44",
        "editor.findMatchBackground": "#3a3a3a",
        "editor.lineHighlightBackground": "#1b1b1b",
        "editorIndentGuide.background": "#2a2a2a",
        "editorIndentGuide.activeBackground": "#3a3a3a",
        "diffEditor.insertedTextBackground": "#9bb95533",
        "diffEditor.removedTextBackground": "#ff000033",
        "diffEditor.insertedLineBackground": "#9bb95522",
        "diffEditor.removedLineBackground": "#ff000022",
        "editorGutter.addedBackground": "#487e02",
        "editorGutter.deletedBackground": "#f14c4c",
      },
    });
    monaco.editor.setTheme("codegrey-dark");
  };

  const requestFitActive = () => {
    if (pendingFitRef.current) window.cancelAnimationFrame(pendingFitRef.current);
    pendingFitRef.current = window.requestAnimationFrame(() => {
      pendingFitRef.current = null;
      if (!terminalOpen) return;
      const active = activeTerminalId;
      if (!active) return;
      const inst = terminalInstancesRef.current.get(active);
      if (!inst) return;
      inst.fit.fit();
      void window.codegrey?.terminal?.resize({ id: active, cols: inst.term.cols, rows: inst.term.rows });
    });
  };

  const resizeActiveTerminal = async () => {
    const active = activeTerminalId;
    if (!active) return;
    const inst = terminalInstancesRef.current.get(active);
    if (!inst) return;
    inst.fit.fit();
    await window.codegrey?.terminal?.resize({ id: active, cols: inst.term.cols, rows: inst.term.rows });
  };

  const createTerminal = async () => {
    const viewport = terminalViewportRef.current;
    if (!viewport) return null;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      drawBoldTextInBrightColors: true,
      theme: {
        // VS Code Dark+ style ANSI palette (matches typical integrated terminal colors)
        background: "#151515",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    const wrap = document.createElement("div");
    wrap.className = "terminal-instance";
    viewport.appendChild(wrap);

    term.open(wrap);
    fit.fit();

    const created = await window.codegrey?.terminal?.create({
      cols: term.cols || 80,
      rows: term.rows || 24,
      cwd: workspaceRoot ?? undefined,
    });

    if (!created?.id) {
      wrap.remove();
      term.dispose();
      return null;
    }

    terminalSeqRef.current += 1;
    const title = `Terminal ${terminalSeqRef.current}`;

    terminalInstancesRef.current.set(created.id, { term, fit, wrap, title });
    setTerminals((prev) => [...prev, { id: created.id, title }]);
    setActiveTerminalId(created.id);

    term.onData((data) => {
      void window.codegrey?.terminal?.write({ id: created.id, data });
    });

    requestFitActive();
    return created.id;
  };

  const closeTerminalInstance = async (id: string) => {
    const inst = terminalInstancesRef.current.get(id);
    terminalInstancesRef.current.delete(id);
    if (inst) {
      try {
        inst.term.dispose();
      } catch {
        // ignore
      }
      try {
        inst.wrap.remove();
      } catch {
        // ignore
      }
    }

    await window.codegrey?.terminal?.kill({ id });

    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveTerminalId((current) => (current === id ? next[next.length - 1]?.id ?? null : current));
      return next;
    });
  };

  useEffect(() => {
    if (!terminalOpen) return;
    const timer = window.setTimeout(() => {
      if (!activeTerminalId) {
        void createTerminal();
        return;
      }
      requestFitActive();
    }, 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalOpen, terminalHeight, activeTerminalId]);

  useEffect(() => {
    const disposeData = window.codegrey?.terminal?.onData?.((msg) => {
      const inst = terminalInstancesRef.current.get(String(msg.id));
      if (!inst) return;
      inst.term.write(msg.data);
    });
    const disposeExit = window.codegrey?.terminal?.onExit?.((msg) => {
      const sid = String(msg.id);
      const inst = terminalInstancesRef.current.get(sid);
      terminalInstancesRef.current.delete(sid);
      if (inst) {
        try {
          inst.term.dispose();
        } catch {
          // ignore
        }
        try {
          inst.wrap.remove();
        } catch {
          // ignore
        }
      }
      setTerminals((prev) => prev.filter((t) => t.id !== sid));
      setActiveTerminalId((prev) => (prev === sid ? null : prev));
    });

    return () => {
      try {
        disposeData?.();
        disposeExit?.();
      } catch {
        // ignore
      }

      const ids = Array.from(terminalInstancesRef.current.keys());
      terminalInstancesRef.current.forEach((inst) => {
        try {
          inst.term.dispose();
        } catch {
          // ignore
        }
        try {
          inst.wrap.remove();
        } catch {
          // ignore
        }
      });
      terminalInstancesRef.current.clear();
      ids.forEach((id) => void window.codegrey?.terminal?.kill({ id }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    terminalInstancesRef.current.forEach((inst, id) => {
      inst.wrap.dataset.active = id === activeTerminalId ? "true" : "false";
    });
    if (terminalOpen) requestFitActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerminalId, terminalOpen]);

  useEffect(() => {
    const viewport = terminalViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (terminalOpen) requestFitActive();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalOpen]);

  useEffect(() => {
    if (viewMode === "split" && activeTab === CHAT_TAB_ID) {
      setActiveTab(openTabs[openTabs.length - 1] ?? null);
    }
  }, [activeTab, openTabs, viewMode]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const openChatTab = () => {
    setChatTabVisible(true);
    setActiveTab(CHAT_TAB_ID);
    setContinuePromptVisible(false);
    setReviewProposalId(null);
  };

  const resetChat = () => {
    setMessages([]);
    setContinuePromptVisible(false);
    setReviewProposalId(null);
  };



  const reviewProposal = allProposals.find((proposal) => proposal.id === reviewProposalId) ?? null;

  const updateProposal = (
    id: string,
    updater: (part: Extract<ChatMessagePart, { type: "file_proposal" }>) => ChatMessagePart
  ) => {
    setMessages((prev) =>
      prev.map((message) => ({
        ...message,
        parts: message.parts.map((part) =>
          part.type === "file_proposal" && part.id === id ? updater(part) : part
        ),
      }))
    );
  };

  const acceptProposal = async (id: string) => {
    const proposal = allProposals.find((item) => item.id === id);
    if (!proposal || proposal.status !== "pending") return;
    // File is already on disk, just finalize status
    updateProposal(id, (part) => ({ ...part, status: "accepted", error: undefined }));
    window.dispatchEvent(new CustomEvent('codegrey:explorer-refresh'));
    window.dispatchEvent(new CustomEvent('codegrey:stats-refresh'));
    if (activeTab === proposal.filePath) setFileText(proposal.newContent);
    if (reviewProposalId === id) setReviewProposalId(null);
  };

  const rejectProposal = async (id: string) => {
    const proposal = allProposals.find((item) => item.id === id);
    if (!proposal) return;

    // Revert file on disk
    if (proposal.oldContent === "") {
      // It was a new file, delete it
      await window.codegrey?.workspace?.deleteFile?.(proposal.filePath);
    } else {
      await window.codegrey?.workspace?.writeFile?.(proposal.filePath, proposal.oldContent);
    }
    window.dispatchEvent(new CustomEvent('codegrey:explorer-refresh'));
    window.dispatchEvent(new CustomEvent('codegrey:stats-refresh'));

    updateProposal(id, (part) => ({ ...part, status: "rejected" }));
    if (activeTab === proposal.filePath) setFileText(proposal.oldContent);
    if (reviewProposalId === id) setReviewProposalId(null);
  };

  const acceptAllProposals = async () => {
    for (const proposal of pendingProposals) {
      await acceptProposal(proposal.id);
    }
  };

  const renderWelcome = () => (
    <div className="workspace-centered">
      <div className="workspace-hero">
        <img
          src="/logos/no_card_white.svg"
          alt="Codegrey"
          className="workspace-logo"
        />
        <h1 className="workspace-title">Codegrey</h1>

        <div className="shortcuts-list">
          <div className="shortcut-item">
            <span>Switch to Agent Manager</span>
            <div className="shortcut-keys">
              <kbd className="kbd">Ctrl</kbd>
              <span>+</span>
              <kbd className="kbd">E</kbd>
            </div>
          </div>
          <div className="shortcut-item">
            <span>Code with Agent</span>
            <div className="shortcut-keys">
              <kbd className="kbd">Ctrl</kbd>
              <span>+</span>
              <kbd className="kbd">L</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const reviewProposalInEditor = (id: string) => {
    const proposal = allProposals.find(p => p.id === id);
    if (proposal) {
      setReviewProposalId(id);
      setChatTabVisible(false);
      setOpenTabs(prev => prev.includes(proposal.filePath) ? prev : [...prev, proposal.filePath]);
      setActiveTab(proposal.filePath);
    }
  };

  const renderChatTimeline = (placement: "tab" | "panel") => (
    <section className="workspace-chat" data-placement={placement} aria-label="Workspace chat">
      {placement === "panel" && (
        <div className="workspace-chat-header">
          <div>
            <span>Agent</span>
            <small>{messages.length ? `${messages.length} messages` : "No messages yet"}</small>
          </div>
          <button className="chat-header-btn" type="button" data-tooltip="New chat" onClick={resetChat}>
            <Plus size={14} />
          </button>
        </div>
      )}

      <div className="workspace-chat-messages" ref={chatScrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span>Start a thread from any file.</span>
            <small>Messages, tool calls, and approvals will appear here.</small>
          </div>
        ) : (
          messages.map((message) => (
            <MessageRenderer
              key={message.id}
              message={message}
              workspaceRoot={workspaceRoot}
              onAcceptProposal={(id) => void acceptProposal(id)}
              onRejectProposal={rejectProposal}
              onReviewProposal={reviewProposalInEditor}
            />
          ))
        )}
        {agentRunning && <ThinkingStatus />}
      </div>

      {placement === "panel" ? renderComposer("panel") : null}
    </section>
  );

  const renderComposer = (placement: "float" | "panel") => {
    const s = placement === "panel" ? 14 : 16;
    const ts = placement === "panel" ? 12 : 14;
    const placeholder = agentRunning
      ? "Agent is working..."
      : placement === "panel"
        ? "Ask anything..."
        : "Ask me to build a feature, debug a problem, or explain your code...";

    return (
      <div className="chat-input-wrapper" data-placement={placement}>
        {placement === "float" && continuePromptVisible && (
          <div className="chat-input-header-pill">
            <button
              className="continue-chat-pill-attached"
              type="button"
              onClick={openChatTab}
            >
              <CornerDownRight size={12} />
              <span>Continue in Chat</span>
            </button>
          </div>
        )}
        <div className="chat-input-card">
          <div className="chat-input-top">
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              rows={1}
              className="chat-textarea"
              disabled={agentRunning}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!agentRunning) void send();
                }
              }}
            />
          </div>
          <div className="chat-input-actions-row">
            <div className="action-group">
              <button className="icon-btn" data-tooltip="Attach Image" type="button">
                <Paperclip size={s} />
              </button>
              <button className="icon-btn" data-tooltip="Attach Context" type="button">
                <AtSign size={s} />
              </button>
              <button className="icon-btn" data-tooltip="Terminal Context" type="button">
                <Monitor size={s} />
              </button>
            </div>
            <div className="action-group">
              <button className="icon-btn" data-tooltip="Voice Input" type="button">
                <Mic size={s} />
              </button>
              <button
                className="submit-btn"
                data-running={agentRunning ? "true" : "false"}
                disabled={!agentRunning && !value.trim()}
                type="button"
                aria-label={agentRunning ? "Stop agent" : "Send message"}
                onClick={() => (agentRunning ? abortAgent() : void send())}
              >
                {agentRunning ? <Square size={Math.max(10, s - 4)} fill="currentColor" /> : <ArrowUp size={s} />}
              </button>
            </div>
          </div>
        </div>

        {pendingProposals.length ? (
          <div className="chat-tray pending-changes-tray">
            <div className="pending-file-chips">
              {pendingProposals.map((proposal) => {
                const patch = createPatch(proposal.filePath, proposal.oldContent, proposal.newContent, "", "");
                const lines = patch.split("\n");
                let added = 0;
                let removed = 0;
                lines.forEach(line => {
                  if (line.startsWith("+") && !line.startsWith("+++")) added++;
                  if (line.startsWith("-") && !line.startsWith("---")) removed++;
                });

                return (
                  <button
                    key={proposal.id}
                    className="pending-file-chip"
                    type="button"
                    onClick={() => {
                      setReviewProposalId(proposal.id);
                      setOpenTabs(prev => prev.includes(proposal.filePath) ? prev : [...prev, proposal.filePath]);
                      setActiveTab(proposal.filePath);
                    }}
                  >
                    <span className="pending-file-name">{shortName(proposal.filePath)}</span>
                    <span className="pending-file-stats">
                      <span className="stat-add">+{added}</span>
                      <span className="stat-del">-{removed}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="accept-all-btn" type="button" onClick={() => void acceptAllProposals()}>
              Accept all
            </button>
          </div>
        ) : (
          <div className="chat-tray">
            <button className="tray-btn" type="button" onClick={() => onOpenMcpSettings?.()}>
              <Plug size={ts} />
              <span>Connect your tools</span>
            </button>

            <div className="tray-right">
              <div className="mcp-icons" onClick={() => onOpenMcpSettings?.()} style={{ cursor: "pointer" }}>
                <div className="mcp-icon" style={{ zIndex: 5 }}>
                  <img src={`${LOGO_BASE}/supabase.svg`} alt="Supabase" style={{ width: ts, height: ts }} />
                </div>
                <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 4 }}>
                  <img src={`${LOGO_BASE}/slack.svg`} alt="Slack" style={{ width: ts, height: ts }} />
                </div>
                <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 3 }}>
                  <img src={`${LOGO_BASE}/cloudflare.svg`} alt="Cloudflare" style={{ width: ts, height: ts }} />
                </div>
              </div>
              <button className="dismiss-btn" type="button">
                <X size={ts} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEditorContent = () => {
    if (activeTab === CHAT_TAB_ID) return renderChatTimeline("tab");
    if (activeTab === BROWSER_TAB_ID) {
      return (
        <Browser
          onClose={() => {
            setOpenTabs(prev => prev.filter(t => t !== BROWSER_TAB_ID));
            if (activeTab === BROWSER_TAB_ID) setActiveTab(openTabs[openTabs.length - 1] ?? null);
          }}
        />
      );
    }
    if (!workspaceRoot) return renderWelcome();
    if (!activeTab) return renderWelcome();

    if (reviewProposal && activeTab === reviewProposal.filePath) {
      return (
        <div className="editor-pane diff-review-pane">
          <div className="monaco-wrap" aria-label="AI proposed diff">
            <DiffEditor
              original={reviewProposal.oldContent}
              modified={reviewProposal.newContent}
              language={inferLanguage(reviewProposal.filePath)}
              theme="codegrey-dark"
              options={{
                readOnly: true,
                renderSideBySide: false,
                hideUnchangedRegions: { enabled: false },
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontSize: 12,
                lineHeight: 18,
                renderIndicators: false,
              }}
              onMount={handleEditorDidMount}
            />

            <div className="diff-floating-actions" role="group" aria-label="Review proposed file changes">
              <button type="button" className="diff-floating-btn danger" onClick={() => rejectProposal(reviewProposal.id)}>
                Reject
              </button>
              <button type="button" className="diff-floating-btn primary" onClick={() => void acceptProposal(reviewProposal.id)}>
                Accept
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="editor-pane">
        <div className="monaco-wrap" aria-label="File editor">
          <Editor
            value={fileText}
            language={monacoLanguage}
            theme="codegrey-dark"
            options={{
              readOnly: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineHeight: 18,
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              lineNumbers: "on",
              glyphMargin: true,
              folding: true,
              renderLineHighlight: "line",
              roundedSelection: true,
              automaticLayout: true,
              tabSize: 2,
            }}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="ide-shell" data-view-mode={viewMode}>
      <div
        ref={workspaceBodyRef}
        className="ide-workspace-body"
        style={viewMode === "split" ? { gridTemplateColumns: `minmax(0, 1fr) ${chatPanelWidth}px` } : undefined}
      >
        <div className="ide-editor">
          <div className="editor-tabs">
            {openTabs.map((tab) => {
              const isBrowser = tab === BROWSER_TAB_ID;
              const parts = tab.split(/[/\\]/);
              const name = isBrowser ? "Browser" : (parts[parts.length - 1] ?? tab);
              const icon = isBrowser ? null : getFileIcon(name);

              return (
                <button
                  key={tab}
                  type="button"
                  className="editor-tab"
                  data-active={tab === activeTab}
                  onClick={() => setActiveTab(tab)}
                  data-tooltip={tab}
                >
                  {isBrowser ? (
                    <Globe size={14} style={{ marginRight: 8, color: 'var(--muted-strong)' }} />
                  ) : icon?.svg ? (
                    <img
                      src={icon.svg}
                      alt=""
                      style={{ width: 14, height: 14, marginRight: 8, flexShrink: 0 }}
                    />
                  ) : (
                    <span
                      className="seti-icon"
                      style={{ color: icon?.color, marginRight: 8 }}
                    >
                      {icon?.char}
                    </span>
                  )}
                  <span>{name}</span>
                  <X
                    size={14}
                    className="tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tab === selectedFile) onClearSelectedFile?.();
                      setOpenTabs((prev) => {
                        const next = prev.filter(t => t !== tab);
                        if (tab === activeTab) {
                          const lastIndex = prev.indexOf(tab);
                          const nextTab = next[lastIndex] || next[lastIndex - 1] || null;
                          setActiveTab(nextTab);
                        }
                        return next;
                      });
                    }}
                  />
                </button>
              );
            })}
            {viewMode === "agent" && chatTabVisible ? (
              <button
                type="button"
                className="editor-tab"
                data-active={activeTab === CHAT_TAB_ID}
                onClick={openChatTab}
                data-tooltip="Workspace chat"
              >
                <MessageSquare size={14} />
                <span>Chat</span>
                <X
                  size={14}
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChatTabVisible(false);
                    onCloseConversation?.();
                    if (activeTab === CHAT_TAB_ID) {
                      const nextTab = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
                      setActiveTab(nextTab);
                    }
                  }}
                />
              </button>
            ) : null}
            <button
              className="tabs-plus-btn"
              type="button"
              data-tooltip="New File"
              onClick={() => void onCreateFile?.()}
              disabled={!workspaceRoot}
            >
              <Plus size={16} />
            </button>

          </div>

          <div className="editor-surface">
            {renderEditorContent()}

            {viewMode === "agent" ? (
              <div className="ide-composer-float" style={{ bottom: terminalOpen ? terminalHeight : 0 }}>
                {renderComposer("float")}
              </div>
            ) : null}
          </div>

          <div
            className="terminal-panel"
            data-open={terminalOpen ? "true" : "false"}
            style={{ height: terminalOpen ? terminalHeight : 0 }}
          >
            <div
              className="terminal-resizer"
              role="separator"
              aria-orientation="horizontal"
              onMouseDown={(e) => {
                e.preventDefault();
                isResizingRef.current = true;
              }}
            />
            <div className="terminal-header">
              <div className="terminal-header-left">
                <span>Terminal</span>
              </div>
              <div className="terminal-header-right">
                <button
                  type="button"
                  onClick={() => void createTerminal()}
                  aria-label="New terminal"
                  data-tooltip="New terminal"
                >
                  <Plus size={14} />
                </button>
                <button type="button" onClick={() => setTerminalOpen(false)} aria-label="Hide terminal">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="terminal-body">
              <div className="terminal-surface">
                <div ref={terminalViewportRef} className="terminal-xterm" />
                <div className="terminal-list" aria-label="Terminal instances">
                  <div className="terminal-list-header">Terminals</div>
                  {terminals.map((t) => (
                    <div
                      key={t.id}
                      className="terminal-list-item"
                      data-active={t.id === activeTerminalId ? "true" : "false"}
                    >
                      <button
                        type="button"
                        className="terminal-list-main"
                        onClick={() => setActiveTerminalId(t.id)}
                        title={t.title}
                      >
                        <div className="terminal-icon-wrap">
                          <Terminal size={12} />
                        </div>
                        <span>{t.title}</span>
                      </button>
                      <button
                        type="button"
                        className="terminal-list-close"
                        onClick={() => void closeTerminalInstance(t.id)}
                        aria-label={`Close ${t.title}`}
                        title="Close"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {viewMode === "split" ? (
          <aside className="workspace-chat-panel">
            <div
              className="chat-panel-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat panel"
              onMouseDown={(e) => {
                e.preventDefault();
                isChatResizingRef.current = true;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
            />
            {renderChatTimeline("panel")}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function shortName(filePath: string) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function inferLanguage(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".toml")) return "toml";
  return "plaintext";
}

function ThinkingStatus() {
  const [index, setIndex] = useState(0);
  const statuses = ["generating...", "loading...", "working..."];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % statuses.length);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="thinking-status">
      <span className="thinking-status-text">{statuses[index]}</span>
    </div>
  );
}
