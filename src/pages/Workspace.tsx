import {
  ArrowUp,
  Component,
  FileText,
  Github,
  Mic,
  Monitor,
  Plus,
  Plug,
  MessageSquare,
  Search,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export function Workspace({
  workspaceRoot,
  selectedFile,
  getFileIcon,
  onRequestOpenFolder,
  terminalOpen,
  setTerminalOpen,
}: {
  workspaceRoot: string | null;
  selectedFile: string | null;
  getFileIcon: (fileName: string, isDir?: boolean) => { char: string; color: string };
  onRequestOpenFolder: () => void;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
}) {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [monacoLanguage, setMonacoLanguage] = useState<string>("plaintext");
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [terminalHeight, setTerminalHeight] = useState(260);
  const terminalIdRef = useRef<string | null>(null);
  const terminalIdState = useRef<string | null>(null);
  const terminalWrapRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const isResizingRef = useRef(false);
  const terminalCreatingRef = useRef(false);

  useEffect(() => {
    if (!selectedFile) return;
    setOpenTabs((prev) => (prev.includes(selectedFile) ? prev : [...prev, selectedFile]));
    setActiveTab(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeTab) {
        setFileText("");
        setMonacoLanguage("plaintext");
        return;
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
      fitRef.current?.fit();
    };

    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        // Notify backend of final resize
        const id = terminalIdRef.current;
        const term = xtermRef.current;
        if (id && term) {
          void window.codegrey?.terminal?.resize({ id, cols: term.cols, rows: term.rows });
        }
      }
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

  const send = () => {
    if (!value.trim()) return;
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

  const ensureTerminal = async () => {
    if (terminalIdRef.current || terminalCreatingRef.current) return terminalIdRef.current;
    
    const wrap = terminalWrapRef.current;
    if (!wrap) return null;

    terminalCreatingRef.current = true;
    try {
      // Clear previous instance just in case
      wrap.innerHTML = "";

      const term = new XTerm({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        theme: {
          background: "#151515",
          foreground: "#f4f4f1",
          cursor: "#74a8ff",
          selectionBackground: "#2b355f",
          black: "#151515",
          red: "#cc3e44",
          green: "#8dc149",
          yellow: "#cbcb41",
          blue: "#519aba",
          magenta: "#a074c4",
          cyan: "#85a7a5",
          white: "#d4d7d6",
          brightBlack: "#4d5a5e",
          brightRed: "#cc3e44",
          brightGreen: "#8dc149",
          brightYellow: "#cbcb41",
          brightBlue: "#519aba",
          brightMagenta: "#a074c4",
          brightCyan: "#85a7a5",
          brightWhite: "#e3e4e2",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(wrap);
      fit.fit();

      xtermRef.current = term;
      fitRef.current = fit;

      const created = await window.codegrey?.terminal?.create({
        cols: term.cols || 80,
        rows: term.rows || 24,
        cwd: workspaceRoot ?? undefined,
      });

      if (!created?.id) {
        term.dispose();
        return null;
      }

      terminalIdRef.current = created.id;
      terminalIdState.current = created.id;

      // Handle Input
      const dataListener = term.onData((data) => {
        const id = terminalIdRef.current;
        if (id) void window.codegrey?.terminal?.write({ id, data });
      });

      // Handle Backend Data
      const disposeIPCData = window.codegrey?.terminal?.onData((msg) => {
        if (msg.id === terminalIdRef.current) {
          xtermRef.current?.write(msg.data);
        }
      });

      const disposeIPCExit = window.codegrey?.terminal?.onExit((msg) => {
        if (msg.id === terminalIdRef.current) {
          terminalIdRef.current = null;
          terminalIdState.current = null;
        }
      });

      (term as any).__codegreyDispose = () => {
        dataListener.dispose();
        disposeIPCData?.();
        disposeIPCExit?.();
        term.dispose();
      };

      return created.id;
    } finally {
      terminalCreatingRef.current = false;
    }
  };

  const openTerminal = async () => {
    const id = await ensureTerminal();
    if (!id) return;
    fitRef.current?.fit();
    const term = xtermRef.current;
    if (!term) return;
    void window.codegrey?.terminal?.resize({ id, cols: term.cols, rows: term.rows });
  };

  const closeTerminal = async () => {
    const id = terminalIdRef.current;
    if (id) {
      terminalIdRef.current = null;
      await window.codegrey?.terminal?.kill({ id });
    }
    const term = xtermRef.current as any;
    if (term?.__codegreyDispose) {
      term.__codegreyDispose();
    }
    xtermRef.current = null;
    fitRef.current = null;
    
    // Clear the DOM to prevent ghost cursors
    if (terminalWrapRef.current) {
      terminalWrapRef.current.innerHTML = "";
    }
  };

  useEffect(() => {
    if (terminalOpen) {
      // Small delay to ensure the panel has expanded and DOM is ready
      const timer = setTimeout(() => {
        void openTerminal();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      void closeTerminal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalOpen]);

  useEffect(() => {
    return () => {
      void closeTerminal();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ide-shell">
      <div className="ide-editor">
        <div className="editor-tabs">
          {openTabs.map((tab) => {
            const parts = tab.split(/[/\\]/);
            const name = parts[parts.length - 1] ?? tab;
            const icon = getFileIcon(name);
            return (
              <button
                key={tab}
                type="button"
                className="editor-tab"
                data-active={tab === activeTab}
                onClick={() => setActiveTab(tab)}
                data-tooltip={tab}
              >
                <span 
                  className="seti-icon" 
                  style={{ color: icon.color, marginRight: 8 }}
                >
                  {icon.char}
                </span>
                <span>{name}</span>
                <X 
                  size={14} 
                  className="tab-close" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenTabs((prev) => {
                      const next = prev.filter(t => t !== tab);
                      if (tab === activeTab) {
                        setActiveTab(next[next.length - 1] || null);
                      }
                      return next;
                    });
                  }} 
                />
              </button>
            );
          })}
          <button className="tabs-plus-btn" type="button" data-tooltip="New File">
            <Plus size={16} />
          </button>

        </div>

        <div className="editor-surface">
          {!workspaceRoot ? (
            <div className="editor-empty">
              <p>Open a folder to start.</p>
              <button className="sidebar-btn sidebar-btn-primary" type="button" onClick={onRequestOpenFolder}>
                Open Folder
              </button>
            </div>
          ) : activeTab ? (
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
          ) : (
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
          )}

          <div className="ide-composer-float" style={{ bottom: terminalOpen ? terminalHeight : 0 }}>
            <div className="chat-input-wrapper">
              <div className="chat-input-card">
                <div className="chat-input-top">
                  <textarea
                    ref={taRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Tasks are independent for focus. Use project instructions and files for shared context."
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
                      <Plus size={16} />
                    </button>
                    <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                      <Github size={16} />
                    </button>
                    <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                      <Monitor size={16} />
                    </button>
                  </div>
                  <div className="action-group">
                    <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                      <MessageSquare size={16} />
                    </button>
                    <button className="icon-btn" data-tooltip="Coming Soon" type="button">
                      <Mic size={16} />
                    </button>
                    <button className="submit-btn" disabled={!value.trim()} type="button" onClick={send}>
                      <ArrowUp size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="chat-tray">
                <button className="tray-btn" type="button">
                  <Plug size={14} />
                  <span>Connect your tools</span>
                </button>

                <div className="tray-right">
                  <div className="mcp-icons">
                    <div className="mcp-icon" style={{ zIndex: 5 }}>
                      <Component size={14} />
                    </div>
                    <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 4 }}>
                      <Component size={14} />
                    </div>
                    <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 3 }}>
                      <Component size={14} />
                    </div>
                  </div>
                  <button className="dismiss-btn" type="button">
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
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
              <span>Terminal</span>
              <button type="button" onClick={() => void closeTerminal()} aria-label="Close terminal">
                <X size={14} />
              </button>
            </div>
            <div className="terminal-body">
              <div ref={terminalWrapRef} className="terminal-xterm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
