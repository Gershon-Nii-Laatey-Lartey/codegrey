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
import "../features/chat/chat.css";
import "../features/terminal/terminal.css";
import "../features/editor/editor.css";
import "./browser.css";
import { Browser } from "./Browser";
import { MessageRenderer } from "../components/chat/MessageRenderer";
import { ModelSelector } from "../features/chat/ModelSelector";
import { Composer } from "../features/chat/Composer";
import { getSessionId, initSession, streamChat } from "../lib/aiClient";
import { readWorkspaceLayout, writeWorkspaceLayout } from "../lib/workspaceLayout";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { EditorTabs } from "../features/editor/EditorTabs";
import { EditorSurface } from "../features/editor/EditorSurface";
import { ChatTimeline } from "../features/chat/ChatTimeline";
import { WelcomeScreen } from "../features/editor/WelcomeScreen";
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
import { useTerminal } from "../hooks/useTerminal";
import { useAgent } from "../hooks/useAgent";
import { useModelCatalog } from "../hooks/useModelCatalog";
import { useWorkspaceLayout } from "../hooks/useWorkspaceLayout";
import { useFileEditor } from "../hooks/useFileEditor";
import { useFileProposals } from "../hooks/useFileProposals";
import { useFileAttachments } from "../hooks/useFileAttachments";
import { createPatch } from "diff";

type WorkspaceViewMode = "agent" | "split";
const CHAT_TAB_ID = "__codegrey_chat__";
const BROWSER_TAB_ID = "__codegrey_browser__";
const LOGO_BASE = "https://id-preview--04de67e2-e451-4c83-88ee-80059e54f053.lovable.app/api/logo";



export function Workspace(props: {
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
  const {
    workspaceRoot, selectedFile, selectedFileRequest, getFileIcon, onRequestOpenFolder, onCreateFile,
    terminalOpen, setTerminalOpen, viewMode, browserTabRequest, homeRequest, activeWorkspaceId,
    activeConversationId, activeConversationRequest, onConversationCreated, onCloseConversation,
    onClearSelectedFile, onOpenMcpSettings, onOpenAccounts, isLoggedIn, userPlan
  } = props;

  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [value, setValue] = useState("");
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const [contextResults, setContextResults] = useState<Array<{ filePath: string; line?: number; preview?: string }>>([]);
  const [contextSearching, setContextSearching] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const contextPickerRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const workspaceBodyRef = useRef<HTMLDivElement>(null);

  // ── Modular Hooks (Order Matters!) ──────────────────────────────────────
  
  // 1. Layout & Core UI State
  const {
    openTabs, setOpenTabs, activeTab, setActiveTab,
    chatPanelWidth, setChatPanelWidth, terminalHeight, setTerminalHeight
  } = useWorkspaceLayout(workspaceRoot, terminalOpen, setTerminalOpen, viewMode, CHAT_TAB_ID);

  // 2. Model Catalog & AI Config
  const {
    modelCatalog, aiMode, setAiMode, planModelId, setPlanModelId,
    availablePlanModels, activePlanModelId, aiRequest
  } = useModelCatalog(isLoggedIn, userPlan, aiSettings);

  // 3. Agent & Chat Orchestration
  const {
    messages, setMessages, agentRunning, chatTabVisible, setChatTabVisible,
    continuePromptVisible, setContinuePromptVisible, send, abortAgent, resetChat: resetChatInternal,
    loadedConversationIdRef
  } = useAgent(
    activeWorkspaceId, activeConversationId, workspaceRoot, aiSettings, aiRequest,
    openTabs, activeTab, CHAT_TAB_ID, BROWSER_TAB_ID, viewMode,
    onConversationCreated, onCloseConversation
  );

  // 4. Terminals
  const {
    terminals, activeTerminalId, setActiveTerminalId, terminalViewportRef,
    isResizingRef, createTerminal, closeTerminalInstance, resizeActiveTerminal,
    requestFitActive, terminalInstancesRef
  } = useTerminal(workspaceRoot, terminalOpen, terminalHeight, activeTab, CHAT_TAB_ID, viewMode);

  // 5. File Editing & Persistence
  const {
    fileText, setFileText, monacoLanguage, handleEditorChange, inferLanguage
  } = useFileEditor(activeTab, CHAT_TAB_ID, BROWSER_TAB_ID);

  // 6. File Proposals (Needs messages & setMessages)
  const {
    reviewProposalId, setReviewProposalId, acceptProposal, rejectProposal, acceptAllProposals
  } = useFileProposals(messages, setMessages, activeTab, setFileText);

  // 7. File Attachments
  const {
    attachedImages, setAttachedImages, attachedContextFiles, setAttachedContextFiles,
    isDragOver, setIsDragOver, processImageFiles, handleComposerDrop,
    removeImage, removeContext
  } = useFileAttachments();

  const handleAttachImage = () => imageInputRef.current?.click();
  const addContextFile = (filePath: string) => {
    setAttachedContextFiles((prev) => prev.includes(filePath) ? prev : [...prev, filePath]);
    setContextPickerOpen(false);
    setContextQuery("");
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processImageFiles(e.target.files);
    e.target.value = "";
  };

  const isChatResizingRef = useRef(false);

  // ── Derived State ─────────────────────────────────────────────────────
  const contextOpenTabs = useMemo(
    () => openTabs.filter((tab) => tab !== CHAT_TAB_ID && tab !== BROWSER_TAB_ID),
    [openTabs]
  );
  const contextActiveFile = activeTab && activeTab !== CHAT_TAB_ID && activeTab !== BROWSER_TAB_ID ? activeTab : null;

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

  // ── Proposal Logic ───────────────────────────────────────────────────
  const pendingProposals = useMemo(
    () => messages.flatMap(m => m.parts.filter(p => p.type === "file_proposal" && p.status === "pending")) as any[],
    [messages]
  );

  const allProposals = useMemo(
    () => messages.flatMap(m => m.parts.filter(p => p.type === "file_proposal")) as any[],
    [messages]
  );

  useEffect(() => {
    if (!selectedFile) return;
    const proposal = pendingProposals.find(item => item.filePath === selectedFile);
    setReviewProposalId(proposal?.id ?? null);
    setOpenTabs(prev => prev.includes(selectedFile) ? prev : [...prev, selectedFile]);
    setActiveTab(selectedFile);
  }, [selectedFile, selectedFileRequest, pendingProposals]);

  useEffect(() => {
    if (browserTabRequest && browserTabRequest > 0) {
      setOpenTabs(prev => prev.includes(BROWSER_TAB_ID) ? prev : [...prev, BROWSER_TAB_ID]);
      setActiveTab(BROWSER_TAB_ID);
    }
  }, [browserTabRequest]);

  useEffect(() => {
    if (!contextPickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!contextPickerRef.current?.contains(event.target as Node)) setContextPickerOpen(false);
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
        (results ?? []).forEach(result => { if (!byFile.has(result.filePath)) byFile.set(result.filePath, { filePath: result.filePath, isDir: result.isDir }); });
        setContextResults([...byFile.values()]);
        setContextSearching(false);
      });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [contextPickerOpen, contextQuery, workspaceRoot]);

  useEffect(() => {
    if (!homeRequest) return;
    setActiveTab(null);
    setChatTabVisible(false);
    setContinuePromptVisible(false);
    setReviewProposalId(null);
    setOpenTabs(prev => prev.filter(tab => tab !== CHAT_TAB_ID && tab !== BROWSER_TAB_ID));
  }, [homeRequest]);

  useEffect(() => {
    let cancelled = false;
    void window.codegrey?.settings?.get().then(settings => { if (!cancelled && settings) setAiSettings({ ...DEFAULT_AI_SETTINGS, ...settings }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workspaceRoot) return;
    const packagePath = `${workspaceRoot}\\package.json`;
    void window.codegrey?.workspace?.readFile?.(packagePath).then(raw => {
      let description = "";
      try { const pkg = raw ? JSON.parse(raw) : null; description = [pkg?.name, pkg?.description].filter(Boolean).join(": "); } catch { description = ""; }
      void initSession({ sessionId: activeConversationId || "__default__", workspaceRoot, projectContext: { description } }).catch(() => undefined);
    });
  }, [workspaceRoot, activeConversationId]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!activeTab || activeTab === CHAT_TAB_ID || activeTab === BROWSER_TAB_ID) return;
    const proposal = pendingProposals.find(p => p.filePath === activeTab);
    if (proposal && reviewProposalId !== proposal.id) setReviewProposalId(proposal.id);
    else if (!proposal && reviewProposalId) {
      const reviewing = allProposals.find(item => item.id === reviewProposalId);
      if (reviewing?.filePath === activeTab) setReviewProposalId(null);
    }
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
    resetChatInternal();
    setReviewProposalId(null);
  };





  const reviewProposalInEditor = (id: string) => {
    const proposal = allProposals.find(p => p.id === id);
    if (proposal) {
      setReviewProposalId(id);
      setChatTabVisible(false);
      setOpenTabs(prev => prev.includes(proposal.filePath) ? prev : [...prev, proposal.filePath]);
      setActiveTab(proposal.filePath);
    }
  };

  const renderComposer = (placement: "float" | "panel") => {
    // Process proposals with stats for the Composer
    const processedProposals = pendingProposals.map((proposal) => {
      const patch = createPatch(proposal.filePath, proposal.oldContent, proposal.newContent, "", "");
      const lines = patch.split("\n");
      let added = 0;
      let removed = 0;
      lines.forEach((line) => {
        if (line.startsWith("+") && !line.startsWith("+++")) added++;
        if (line.startsWith("-") && !line.startsWith("---")) removed++;
      });
      return { ...proposal, stats: { added, removed } };
    });

    return (
      <>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden-input"
          style={{ display: "none" }}
          onChange={handleImageInputChange}
        />
        <Composer
          value={value}
          setValue={setValue}
          agentRunning={agentRunning}
          onSend={() => void send(value, attachedImages, attachedContextFiles, setValue, setAttachedImages, setAttachedContextFiles, setActiveTab)}
          onAbort={abortAgent}
          placement={placement}
          continuePromptVisible={continuePromptVisible}
          openChatTab={openChatTab}
          attachedImages={attachedImages}
          onRemoveImage={removeImage}
          onAttachImage={handleAttachImage}
          workspaceRoot={workspaceRoot}
          attachedContextFiles={attachedContextFiles}
          onRemoveContext={removeContext}
          onAddContextFile={addContextFile}
          contextPickerOpen={contextPickerOpen}
          setContextPickerOpen={setContextPickerOpen}
          contextPickerRef={contextPickerRef}
          contextQuery={contextQuery}
          setContextQuery={setContextQuery}
          contextSearching={contextSearching}
          contextSuggestions={contextSuggestions}
          contextActiveFile={contextActiveFile}
          contextOpenTabs={contextOpenTabs}
          aiMode={aiMode}
          setAiMode={setAiMode}
          isDragOver={isDragOver}
          setIsDragOver={setIsDragOver}
          handleComposerDrop={handleComposerDrop}
          activePlanModelId={activePlanModelId}
          setPlanModelId={setPlanModelId}
          availablePlanModels={availablePlanModels}
          aiSettings={aiSettings}
          onOpenAccounts={onOpenAccounts}
          getFileIcon={getFileIcon}
          shortName={shortName}
          relativeToWorkspace={relativeToWorkspace}
          pendingProposals={processedProposals}
          onReviewProposal={(id, filePath) => reviewProposalInEditor(id)}
          onAcceptAllProposals={() => void acceptAllProposals(pendingProposals, allProposals)}
          onOpenMcpSettings={onOpenMcpSettings}
          logoBase={LOGO_BASE}
        />
      </>
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
          <EditorTabs
            openTabs={openTabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onCloseTab={(tab) => {
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
            onCreateFile={() => void onCreateFile?.()}
            getFileIcon={getFileIcon}
            viewMode={viewMode}
            chatTabVisible={chatTabVisible}
            onOpenChat={openChatTab}
            onCloseChat={() => {
              setChatTabVisible(false);
              onCloseConversation?.();
              if (activeTab === CHAT_TAB_ID) {
                const nextTab = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
                setActiveTab(nextTab);
              }
            }}
            workspaceRoot={workspaceRoot}
          />

          <div className="editor-surface">
            <EditorSurface
              activeTab={activeTab}
              workspaceRoot={workspaceRoot}
              chatTabId={CHAT_TAB_ID}
              browserTabId={BROWSER_TAB_ID}
              renderChat={() => (
                <ChatTimeline
                  messages={messages}
                  agentRunning={agentRunning}
                  onAcceptProposal={(id) => void acceptProposal(id, allProposals)}
                  onRejectProposal={(id) => void rejectProposal(id, allProposals)}
                  onReviewProposal={reviewProposalInEditor}
                  onResetChat={resetChat}
                  scrollRef={chatScrollRef}
                  placement="tab"
                  workspaceRoot={workspaceRoot}
                />
              )}
              renderBrowser={() => (
                <Browser
                  onClose={() => {
                    setOpenTabs(prev => prev.filter(t => t !== BROWSER_TAB_ID));
                    if (activeTab === BROWSER_TAB_ID) setActiveTab(openTabs[openTabs.length - 1] ?? null);
                  }}
                />
              )}
              renderWelcome={() => <WelcomeScreen workspaceRoot={workspaceRoot} />}
              fileText={fileText}
              monacoLanguage={monacoLanguage}
              onEditorChange={handleEditorChange}
              onEditorMount={handleEditorDidMount}
              reviewProposal={allProposals.find(p => p.id === reviewProposalId) ?? null}
              onAcceptProposal={(id) => void acceptProposal(id, allProposals)}
              onRejectProposal={(id) => void rejectProposal(id, allProposals)}
              inferLanguage={inferLanguage}
            />

            {viewMode === "agent" ? (
              <div className="ide-composer-float" style={{ bottom: terminalOpen ? terminalHeight : 0 }}>
                {renderComposer("float")}
              </div>
            ) : null}
          </div>

          <TerminalPanel
            isOpen={terminalOpen}
            onClose={() => setTerminalOpen(false)}
            height={terminalHeight}
            onResizeStart={(e) => {
              e.preventDefault();
              isResizingRef.current = true;
            }}
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            onSelectTerminal={(id) => setActiveTerminalId(id)}
            onCloseTerminal={(id) => void closeTerminalInstance(id)}
            onCreateTerminal={() => void createTerminal()}
            viewportRef={terminalViewportRef}
          />
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
            <ChatTimeline
              messages={messages}
              agentRunning={agentRunning}
              onAcceptProposal={(id) => void acceptProposal(id, allProposals)}
              onRejectProposal={(id) => void rejectProposal(id, allProposals)}
              onReviewProposal={reviewProposalInEditor}
              onResetChat={resetChat}
              scrollRef={chatScrollRef}
              placement="panel"
              workspaceRoot={workspaceRoot}
              renderComposer={() => renderComposer("panel")}
            />
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

