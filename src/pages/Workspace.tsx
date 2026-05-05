import {
  ArrowUp,
  Bot,
  Component,
  FileText,
  Github,
  Mic,
  Monitor,
  Plus,
  Plug,
  CornerDownRight,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Undo,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  Terminal,
  X,
  Search,
  Globe,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { Browser } from "./Browser";

type WorkspaceViewMode = "agent" | "split";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  contextFile?: string | null;
  toolCalls?: Array<{ id: string; label: string; detail: string; status: "done" | "pending" }>;
};

const CHAT_TAB_ID = "__codegrey_chat__";
const BROWSER_TAB_ID = "__codegrey_browser__";

export function Workspace({
  workspaceRoot,
  selectedFile,
  getFileIcon,
  onRequestOpenFolder,
  terminalOpen,
  setTerminalOpen,
  viewMode,
  browserTabRequest,
}: {
  workspaceRoot: string | null;
  selectedFile: string | null;
  getFileIcon: (fileName: string, isDir?: boolean) => { char: string; color: string };
  onRequestOpenFolder: () => void;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  viewMode: WorkspaceViewMode;
  browserTabRequest?: number;
}) {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [monacoLanguage, setMonacoLanguage] = useState<string>("plaintext");
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatTabVisible, setChatTabVisible] = useState(false);
  const [continuePromptVisible, setContinuePromptVisible] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [terminalHeight, setTerminalHeight] = useState(260);
  const [terminals, setTerminals] = useState<Array<{ id: string; title: string }>>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
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
  const terminalSeqRef = useRef(0);
  const pendingFitRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedFile) return;
    setOpenTabs((prev) => (prev.includes(selectedFile) ? prev : [...prev, selectedFile]));
    setActiveTab(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    if (browserTabRequest && browserTabRequest > 0) {
      setOpenTabs((prev) => (prev.includes(BROWSER_TAB_ID) ? prev : [...prev, BROWSER_TAB_ID]));
      setActiveTab(BROWSER_TAB_ID);
    }
  }, [browserTabRequest]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeTab) {
        setFileText("");
        setMonacoLanguage("plaintext");
        return;
      }
      if (activeTab === CHAT_TAB_ID || activeTab === BROWSER_TAB_ID) return;
      const text = await window.codegrey?.workspace?.readFile?.(activeTab);
      if (cancelled) return;
      setFileText(text ?? "");
      setMonacoLanguage(inferLanguage(activeTab));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

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

  const activeName = useMemo(() => {
    if (!activeTab) return "";
    const parts = activeTab.split(/[/\\]/);
    return parts[parts.length - 1] ?? activeTab;
  }, [activeTab]);

  const send = () => {
    const text = value.trim();
    if (!text) return;

    const sentFromFile = activeTab && activeTab !== CHAT_TAB_ID;
    const contextFile = sentFromFile ? activeTab : null;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: now,
      contextFile,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "I have this queued in the workspace thread. Real model streaming will plug into this panel next.",
      timestamp: now,
      toolCalls: contextFile
        ? [
            {
              id: crypto.randomUUID(),
              label: "Context attached",
              detail: shortName(contextFile),
              status: "done",
            },
          ]
        : undefined,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setChatTabVisible(true);
    if (sentFromFile) {
      setContinuePromptVisible(true);
    } else if (viewMode === "agent") {
      setActiveTab(CHAT_TAB_ID);
    }
    setValue("");
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
    if (!continuePromptVisible) return;
    const timer = window.setTimeout(() => setContinuePromptVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [continuePromptVisible]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const openChatTab = () => {
    setChatTabVisible(true);
    setActiveTab(CHAT_TAB_ID);
    setContinuePromptVisible(false);
  };

  const resetChat = () => {
    setMessages([]);
    setContinuePromptVisible(false);
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
            <article key={message.id} className="chat-message" data-role={message.role}>


              {message.role === "user" ? (
                <div className="user-message-card">
                  <div className="user-message-content">
                    {message.contextFile ? (
                      <div className="chat-context-chip">
                        <FileText size={12} />
                        <span>{shortName(message.contextFile)}</span>
                      </div>
                    ) : null}
                    <p>{message.content}</p>
                  </div>
                  <button type="button" className="user-undo-btn">
                    <Undo size={14} />
                  </button>
                </div>
              ) : (
                <div className="assistant-message-body">
                  <div className="assistant-status-line">
                    <span>Worked for 24s</span>
                    <ChevronRight size={14} />
                  </div>
                  <div className="assistant-content">
                    <p>{message.content}</p>
                    {message.toolCalls?.length ? (
                      <div className="chat-tool-list">
                        {message.toolCalls.map((tool) => (
                          <div key={tool.id} className="chat-tool-card">
                            <Component size={13} />
                            <span>{tool.label}</span>
                            <small>{tool.detail}</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {message.role === "assistant" && (
                    <div className="assistant-actions-bottom">
                      <button type="button" className="action-tiny-btn"><ExternalLink size={14} /></button>
                      <button type="button" className="action-tiny-btn"><Copy size={14} /></button>
                      <button type="button" className="action-tiny-btn"><ThumbsUp size={14} /></button>
                      <button type="button" className="action-tiny-btn"><ThumbsDown size={14} /></button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {placement === "panel" ? renderComposer("panel") : null}
    </section>
  );

  const renderComposer = (placement: "float" | "panel") => {
    const s = placement === "panel" ? 14 : 16;
    const ts = placement === "panel" ? 12 : 14;
    const placeholder = placement === "panel" 
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>
          <div className="chat-input-actions-row">
            <div className="action-group">
              <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                <Plus size={s} />
              </button>
              <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                <Github size={s} />
              </button>
              <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                <Monitor size={s} />
              </button>
            </div>
            <div className="action-group">
              <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                <MessageSquare size={s} />
              </button>
              <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                <Mic size={s} />
              </button>
              <button className="submit-btn" disabled={!value.trim()} type="button" onClick={send}>
                <ArrowUp size={s} />
              </button>
            </div>
          </div>
        </div>

        <div className="chat-tray">
          <button className="tray-btn" type="button">
            <Plug size={ts} />
            <span>Connect your tools</span>
          </button>

          <div className="tray-right">
            <div className="mcp-icons">
              <div className="mcp-icon" style={{ zIndex: 5 }}>
                <Component size={ts} />
              </div>
              <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 4 }}>
                <Component size={ts} />
              </div>
              <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 3 }}>
                <Component size={ts} />
              </div>
            </div>
            <button className="dismiss-btn" type="button">
              <X size={ts} />
            </button>
          </div>
        </div>
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
            onMount={handleEditorDidMount}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="ide-shell" data-view-mode={viewMode}>
      <div className="ide-workspace-body">
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
                  if (activeTab === CHAT_TAB_ID) setActiveTab(openTabs[openTabs.length - 1] ?? null);
                }}
              />
            </button>
          ) : null}
          <button className="tabs-plus-btn" type="button" data-tooltip="New File">
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
