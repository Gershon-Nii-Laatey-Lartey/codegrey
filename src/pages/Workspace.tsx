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
  FileText,
  ImageIcon,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { Browser } from "./Browser";
import { MessageRenderer } from "../components/chat/MessageRenderer";
import { ModelSelector } from "../features/chat/ModelSelector";
import { getSessionId, initSession, streamChat } from "../lib/aiClient";
import { readWorkspaceLayout, writeWorkspaceLayout } from "../lib/workspaceLayout";
import {
  DEFAULT_AI_REQUEST,
  DEFAULT_AI_SETTINGS,
  type AiMode,
  type AiRequestConfig,
  type AiSettings,
  type ChatMessage,
  type ChatMessagePart,
  type ModelCatalogItem,
} from "../types/ai";
import {
  fetchModelCatalog,
  filterModelsForPlan,
  loadModelSelection,
  saveModelSelection,
} from "../services/modelCatalog";
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
  homeRequest,
  activeWorkspaceId,
  activeConversationId,
  activeConversationRequest,
  onConversationCreated,
  onCloseConversation,
  onClearSelectedFile,
  onOpenMcpSettings,
  onOpenAccounts,
  isLoggedIn,
  userPlan,
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
  homeRequest?: number;
  activeWorkspaceId?: string | null;
  activeConversationId?: string | null;
  activeConversationRequest?: number;
  onConversationCreated?: (id: string) => void;
  onCloseConversation?: () => void;
  onClearSelectedFile?: () => void;
  onOpenMcpSettings?: () => void;
  onOpenAccounts?: () => void;
  isLoggedIn?: boolean;
  userPlan?: string | null;
}) {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [monacoLanguage, setMonacoLanguage] = useState<string>("plaintext");
  const [value, setValue] = useState("");
  const [attachedImages, setAttachedImages] = useState<Array<{ name: string; dataUrl: string; base64: string; mimeType: string }>>([]);
  const [attachedContextFiles, setAttachedContextFiles] = useState<string[]>([]);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const [contextResults, setContextResults] = useState<Array<{ filePath: string; line?: number; preview?: string }>>([]);
  const [contextSearching, setContextSearching] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const contextPickerRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatTabVisible, setChatTabVisible] = useState(false);
  const [continuePromptVisible, setContinuePromptVisible] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>([]);
  const [aiMode, setAiMode] = useState<AiMode>(isLoggedIn ? "plan" : "byok");
  const [planModelId, setPlanModelId] = useState(DEFAULT_AI_REQUEST.modelId);
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

  const contextOpenTabs = useMemo(
    () => openTabs.filter((tab) => tab !== CHAT_TAB_ID && tab !== BROWSER_TAB_ID),
    [openTabs]
  );
  const contextActiveFile = activeTab && activeTab !== CHAT_TAB_ID && activeTab !== BROWSER_TAB_ID ? activeTab : null;
  const availablePlanModels = useMemo(
    () => filterModelsForPlan(modelCatalog, userPlan),
    [modelCatalog, userPlan]
  );
  const activePlanModelId = useMemo(() => {
    if (availablePlanModels.some((model) => model.id === planModelId)) return planModelId;
    return availablePlanModels.find((model) => model.isDefault)?.id ?? availablePlanModels[0]?.id ?? DEFAULT_AI_REQUEST.modelId;
  }, [availablePlanModels, planModelId]);
  const aiRequest = useMemo<AiRequestConfig>(() => ({
    mode: aiMode,
    modelId: aiMode === "plan" ? activePlanModelId : "byok-local",
    temperature: aiSettings.temperature,
    maxTokens: aiSettings.maxTokens,
    byok: aiSettings,
  }), [activePlanModelId, aiMode, aiSettings]);
  const contextSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const next: Array<{ filePath: string; source: "active" | "tab" | "search"; line?: number; preview?: string; isDir?: boolean }> = [];
    const query = contextQuery.trim().toLowerCase();
    const matchesQuery = (filePath: string) => !query || shortName(filePath).toLowerCase().includes(query);
    if (contextActiveFile && matchesQuery(contextActiveFile)) {
      seen.add(contextActiveFile);
      next.push({ filePath: contextActiveFile, source: "active" });
    }
    contextOpenTabs.forEach((filePath) => {
      if (seen.has(filePath) || !matchesQuery(filePath)) return;
      seen.add(filePath);
      next.push({ filePath, source: "tab" });
    });
    contextResults.forEach((result) => {
      if (seen.has(result.filePath)) return;
      seen.add(result.filePath);
      next.push({ ...result, source: "search" });
    });
    return next;
  }, [contextActiveFile, contextOpenTabs, contextQuery, contextResults, workspaceRoot]);

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
    if (!contextPickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!contextPickerRef.current?.contains(event.target as Node)) {
        setContextPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [contextPickerOpen]);

  useEffect(() => {
    if (!contextPickerOpen || !workspaceRoot || !contextQuery.trim()) {
      setContextResults([]);
      setContextSearching(false);
      return;
    }

    let cancelled = false;
    setContextSearching(true);
    const timer = window.setTimeout(() => {
      void window.codegrey?.workspace?.search?.(contextQuery.trim(), { maxResults: 40, mode: "filename" }).then((results) => {
        if (cancelled) return;
        const byFile = new Map<string, { filePath: string; isDir?: boolean }>();
        (results ?? []).forEach((result) => {
          if (!byFile.has(result.filePath)) {
            byFile.set(result.filePath, {
              filePath: result.filePath,
              isDir: result.isDir
            });
          }
        });
        setContextResults([...byFile.values()]);
        setContextSearching(false);
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contextPickerOpen, contextQuery, workspaceRoot]);

  useEffect(() => {
    if (!homeRequest) return;
    setActiveTab(null);
    setChatTabVisible(false);
    setContinuePromptVisible(false);
    setReviewProposalId(null);
    setOpenTabs((prev) => prev.filter((tab) => tab !== CHAT_TAB_ID && tab !== BROWSER_TAB_ID));
  }, [homeRequest]);

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
    const stored = loadModelSelection();
    // Use plan models if logged in AND (either the user chose it or the global setting prefers it)
    const shouldDefaultToPlan = isLoggedIn && (aiSettings.preferPlanModels || stored.mode === "plan");
    setAiMode(shouldDefaultToPlan ? "plan" : "byok");
    setPlanModelId(stored.planModelId);
  }, [isLoggedIn, aiSettings.preferPlanModels]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tokens = await window.codegrey?.auth?.loadTokens?.();
      const models = await fetchModelCatalog(tokens?.access_token);
      if (!cancelled) setModelCatalog(models);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    saveModelSelection({
      mode: aiMode,
      planModelId: activePlanModelId,
      byokModelId: "byok-local",
    });
  }, [activePlanModelId, aiMode]);

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

  // ── Attachment helpers ─────────────────────────────────────────────────
  const processImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        setAttachedImages((prev) => [
          ...prev,
          { name: file.name, dataUrl, base64, mimeType: file.type },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const processDroppedPaths = async (paths: string[]) => {
    for (const p of paths) {
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
      if (imageExts.includes(ext)) {
        // Read image via Electron IPC
        const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
        const mimeType = mimeMap[ext] || "image/png";
        try {
          const result = await (window as any).codegrey?.workspace?.readFileBinary?.(p);
          if (result?.base64) {
            const dataUrl = `data:${mimeType};base64,${result.base64}`;
            setAttachedImages((prev) => [
              ...prev,
              { name: p.split(/[\/]/).pop() || p, dataUrl, base64: result.base64, mimeType },
            ]);
          }
        } catch (_) {}
      } else {
        // Treat as context file
        setAttachedContextFiles((prev) => prev.includes(p) ? prev : [...prev, p]);
      }
    }
  };

  const handleComposerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleComposerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleComposerDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Handle image files dragged from outside the app
    if (e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }

    // Handle paths dragged from inside the app (sidebar)
    const pathData = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/x-codegrey-path");
    if (pathData) {
      await processDroppedPaths(pathData.split("\n").map((p) => p.trim()).filter(Boolean));
    }
  };

  const handleAttachImage = () => {
    imageInputRef.current?.click();
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processImageFiles(e.target.files);
    e.target.value = "";
  };

  const addContextFile = (filePath: string) => {
    setAttachedContextFiles((prev) => prev.includes(filePath) ? prev : [...prev, filePath]);
    setContextPickerOpen(false);
    setContextQuery("");
  };

  const removeImage = (idx: number) => setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  const removeContext = (path: string) => setAttachedContextFiles((prev) => prev.filter((p) => p !== path));

  // ── End attachment helpers ──────────────────────────────────────────────

  const send = async () => {
    const text = value.trim();
    if (!text || !workspaceRoot || agentRunning) return;

    const sentFromFile = activeTab && activeTab !== CHAT_TAB_ID && activeTab !== BROWSER_TAB_ID;
    const contextFile = sentFromFile ? activeTab : null;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const assistantId = crypto.randomUUID();
    // Build user message parts (text + images)
    const userParts: ChatMessagePart[] = [];
    for (const img of attachedImages) {
      userParts.push({ type: "image", dataUrl: img.dataUrl, mimeType: img.mimeType, name: img.name } as any);
    }
    userParts.push({ type: "text", content: text });

    // Build context annotation for attached files
    const contextNote = attachedContextFiles.length > 0
      ? `

[Context files: ${attachedContextFiles.join(", ")}]`
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
      <div
        className="chat-input-wrapper"
        data-placement={placement}
        data-dragover={isDragOver ? "true" : undefined}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleImageInputChange}
        />
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
          {(attachedImages.length > 0 || attachedContextFiles.length > 0) && (
            <div className="attach-preview-strip">
              {attachedImages.map((img, i) => (
                <div key={i} className="attach-preview-chip attach-preview-image">
                  <img src={img.dataUrl} alt={img.name} className="attach-thumb" />
                  <button type="button" className="attach-chip-remove" onClick={() => removeImage(i)}><X size={10} /></button>
                </div>
              ))}
              {attachedContextFiles.map((p) => {
                const name = shortName(p);
                const icon = getFileIcon(name);
                return (
                  <div key={p} className="attach-preview-chip attach-preview-file">
                    <div className="attach-chip-icon">
                      {icon.svg ? (
                        <img src={icon.svg} alt="" />
                      ) : (
                        <span className="seti-icon" style={{ color: icon.color }}>
                          {icon.char}
                        </span>
                      )}
                    </div>
                    <span className="attach-chip-name">{name}</span>
                    <button type="button" className="attach-chip-remove" onClick={() => removeContext(p)} aria-label={`Remove ${name}`}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="chat-input-main">
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
              <button className="icon-btn" data-tooltip="Attach Image" type="button" onClick={handleAttachImage}>
                <Paperclip size={s} />
              </button>
              <div className="context-attach-control" ref={contextPickerRef}>
                <button
                  className="icon-btn"
                  data-tooltip="Attach Context"
                  type="button"
                  onClick={() => setContextPickerOpen((open) => !open)}
                  disabled={!workspaceRoot}
                >
                  <AtSign size={s} />
                </button>
                {contextPickerOpen ? (
                  <div className="context-picker" role="dialog" aria-label="Attach context">
                    <div className="context-picker-search">
                      <Search size={14} />
                      <input
                        autoFocus
                        value={contextQuery}
                        placeholder="Search files..."
                        onChange={(event) => setContextQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setContextPickerOpen(false);
                        }}
                      />
                    </div>
                    <div className="context-picker-list">
                      {!contextQuery.trim() && contextActiveFile ? (
                        <div className="context-picker-group-label">Active file</div>
                      ) : null}
                      {!contextQuery.trim() && contextActiveFile ? (
                        <button
                          type="button"
                          className="context-picker-item"
                          onClick={() => addContextFile(contextActiveFile)}
                          disabled={attachedContextFiles.includes(contextActiveFile)}
                        >
                          <div className="context-picker-item-icon">
                            {getFileIcon(shortName(contextActiveFile)).svg ? (
                              <img src={getFileIcon(shortName(contextActiveFile)).svg} alt="" />
                            ) : (
                              <span className="seti-icon" style={{ color: getFileIcon(shortName(contextActiveFile)).color }}>
                                {getFileIcon(shortName(contextActiveFile)).char}
                              </span>
                            )}
                          </div>
                          <div className="context-picker-item-content">
                            <strong>{shortName(contextActiveFile)}</strong>
                            <small>{relativeToWorkspace(workspaceRoot, contextActiveFile)}</small>
                          </div>
                        </button>
                      ) : null}

                      {!contextQuery.trim() && contextOpenTabs.length > 0 ? (
                        <div className="context-picker-group-label">Open tabs</div>
                      ) : null}
                      {!contextQuery.trim() ? contextOpenTabs
                        .filter((filePath) => filePath !== contextActiveFile)
                        .map((filePath) => (
                          <button
                            type="button"
                            key={filePath}
                            className="context-picker-item"
                            onClick={() => addContextFile(filePath)}
                            disabled={attachedContextFiles.includes(filePath)}
                          >
                            <div className="context-picker-item-icon">
                              {getFileIcon(shortName(filePath)).svg ? (
                                <img src={getFileIcon(shortName(filePath)).svg} alt="" />
                              ) : (
                                <span className="seti-icon" style={{ color: getFileIcon(shortName(filePath)).color }}>
                                  {getFileIcon(shortName(filePath)).char}
                                </span>
                              )}
                            </div>
                            <div className="context-picker-item-content">
                              <strong>{shortName(filePath)}</strong>
                              <small>{relativeToWorkspace(workspaceRoot, filePath)}</small>
                            </div>
                          </button>
                        )) : null}

                      {contextQuery.trim() ? (
                        <div className="context-picker-group-label">{contextSearching ? "Searching..." : "Search results"}</div>
                      ) : null}
                      {contextQuery.trim() && !contextSearching && contextSuggestions.length === 0 ? (
                        <div className="context-picker-empty">No matching files</div>
                      ) : null}
                      {contextQuery.trim() ? contextSuggestions.map((item) => (
                        <button
                          type="button"
                          key={item.filePath}
                          className="context-picker-item"
                          onClick={() => addContextFile(item.filePath)}
                          disabled={attachedContextFiles.includes(item.filePath)}
                        >
                          <div className="context-picker-item-icon">
                            {getFileIcon(shortName(item.filePath), item.isDir).svg ? (
                              <img src={getFileIcon(shortName(item.filePath), item.isDir).svg} alt="" />
                            ) : (
                              <span className="seti-icon" style={{ color: getFileIcon(shortName(item.filePath), item.isDir).color }}>
                                {getFileIcon(shortName(item.filePath), item.isDir).char}
                              </span>
                            )}
                          </div>
                          <div className="context-picker-item-content">
                            <strong>{shortName(item.filePath)}</strong>
                            <small>{relativeToWorkspace(workspaceRoot, item.filePath)}</small>
                          </div>
                        </button>
                      )) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <ModelSelector
                mode={aiMode}
                planModelId={activePlanModelId}
                byokLabel={`${aiSettings.providerId} / ${aiSettings.model || "model"}`}
                models={availablePlanModels}
                disabled={agentRunning}
                onModeChange={setAiMode}
                onPlanModelChange={setPlanModelId}
                onOpenSettings={onOpenAccounts}
              />
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
        style={viewMode === "split" ? { gridTemplateColumns: `minmax(200px, 1fr) minmax(280px, ${chatPanelWidth}px)` } : undefined}
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
                <div className="terminal-list" aria-label="Terminal instances">
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
                <div ref={terminalViewportRef} className="terminal-xterm" />
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

function relativeToWorkspace(root: string | null, filePath: string) {
  if (!root) return filePath;
  return filePath.replace(root, "").replace(/^[/\\]/, "") || shortName(filePath);
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
