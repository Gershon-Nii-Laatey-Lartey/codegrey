import {
  Copy,
  Minus,
  Square,
  X,
  ChevronDown,
  ChevronRight,
  User,
  Settings,
  Files,
  Search,
  GitBranch,
  Blocks,
  FolderOpen,
  Globe,
  Terminal,
  Columns,
  Play
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Onboarding, type WorkspaceMode } from "./pages/Onboarding";
import { Workspace } from "./pages/Workspace";
import { Browser } from "./pages/Browser";

const getFileIcon = (fileName: string, isDir?: boolean) => {
  if (isDir) return { char: '\uE024', color: '#d4d7d6' };
  
  const lower = fileName.toLowerCase();
  
  // Specific File Names
  if (lower === "package.json") return { char: '\uE067', color: '#cc3e44' }; // npm icon
  if (lower === "package-lock.json") return { char: '\uE067', color: '#7fae42' }; // npm icon (green)
  if (lower === "tsconfig.json") return { char: '\uE097', color: '#519aba' };
  if (lower === "vite.config.ts" || lower === "vite.config.js") return { char: '\uE09C', color: '#cbcb41' };
  if (lower === ".gitignore" || lower === ".gitconfig") return { char: '\uE034', color: '#41535b' };
  if (lower.includes("license")) return { char: '\uE05A', color: '#cbcb41' };

  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case "js": case "mjs": case "cjs": return { char: '\uE051', color: '#cbcb41' };
    case "ts": case "mts": case "cts": return { char: '\uE099', color: '#519aba' };
    case "tsx": return { char: '\uE07D', color: '#519aba' };
    case "jsx": return { char: '\uE07D', color: '#cbcb41' };
    case "css": return { char: '\uE01D', color: '#519aba' };
    case "scss": return { char: '\uE084', color: '#f55385' };
    case "html": return { char: '\uE048', color: '#519aba' };
    case "json": return { char: '\uE055', color: '#cbcb41' };
    case "md": return { char: '\uE060', color: '#519aba' };
    case "py": return { char: '\uE07B', color: '#cbcb41' };
    case "rs": return { char: '\uE082', color: '#d4d7d6' };
    case "go": return { char: '\uE039', color: '#519aba' };
    case "php": return { char: '\uE070', color: '#a074c4' };
    case "svg": return { char: '\uE091', color: '#cbcb41' };
    default: return { char: '\uE023', color: '#d4d7d6' };
  }
};

const McpIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    width={size}
    style={{ flex: "none", lineHeight: 1 }}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>ModelContextProtocol</title>
    <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"></path>
    <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"></path>
  </svg>
);

export function App() {
  const [view, setView] = useState<"onboarding" | "workspace">("onboarding");
  const [browserTabRequest, setBrowserTabRequest] = useState(0);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<"agent" | "split">("agent");
  const [windowMaximized, setWindowMaximized] = useState(false);

  const toggleTerminal = () => setTerminalOpen(!terminalOpen);
  const toggleWorkspaceViewMode = () => setWorkspaceViewMode((mode) => (mode === "agent" ? "split" : "agent"));
  const toggleWindowMaximize = async () => {
    const isMaximized = await window.codegrey?.windowControls?.toggleMaximize?.();
    if (typeof isMaximized === "boolean") setWindowMaximized(isMaximized);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const root = await window.codegrey?.workspace?.getRoot?.();
      if (cancelled) return;
      setWorkspaceRoot(root ?? null);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.codegrey?.windowControls?.isMaximized?.().then((isMaximized) => {
      if (!cancelled) setWindowMaximized(isMaximized);
    });

    const unsubscribe = window.codegrey?.windowControls?.onMaximizedChange?.((isMaximized) => {
      setWindowMaximized(isMaximized);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const openFolder = async () => {
    const root = await window.codegrey?.workspace?.openFolder?.();
    if (!root) return;
    setWorkspaceRoot(root);
    setSelectedFile(null);
  };

  const startOnboardingWorkspace = async (mode: WorkspaceMode) => {
    if (mode === "local") {
      const root = await window.codegrey?.workspace?.openFolder?.();
      if (!root) return;
      setWorkspaceRoot(root);
      setSelectedFile(null);
      setView("workspace");
      return;
    }

    if (mode === "blank") {
      await window.codegrey?.workspace?.clearRoot?.();
      setWorkspaceRoot(null);
      setSelectedFile(null);
      setView("workspace");
      return;
    }

    setView("workspace");
  };

  useEffect(() => {
    const tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    document.body.appendChild(tooltip);

    let showTimeout: any;
    let currentEl: HTMLElement | null = null;

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const el = target.closest('[data-tooltip]') as HTMLElement | null;
      
      if (el) {
        if (el === currentEl) {
          tooltip.style.left = `${e.clientX + 20}px`;
          tooltip.style.top = `${e.clientY + 20}px`;
          return;
        }

        // New element found: stop everything and hide
        clearTimeout(showTimeout);
        currentEl = el;
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
        
        const text = el.getAttribute('data-tooltip');
        if (text) {
          showTimeout = setTimeout(() => {
            tooltip.textContent = text;
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
            tooltip.style.left = `${e.clientX + 20}px`;
            tooltip.style.top = `${e.clientY + 20}px`;
          }, 400); 
          return;
        }
      }
      
      clearTimeout(showTimeout);
      currentEl = null;
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      tooltip.remove();
    };
  }, []);

  return (
    <div className="app-frame" data-view={view}>
      {view === "workspace" && (
        <aside className="global-sidebar">
          <div className="sidebar-brand">
            <span>Codegrey</span>
          </div>
          
          <div className="sidebar-activity-bar">
            <button className="activity-icon active" data-tooltip="Files">
              <Files size={18} />
            </button>
            <button className="activity-icon" data-tooltip="Search">
              <Search size={18} />
            </button>
            <button className="activity-icon" data-tooltip="Source Control">
              <GitBranch size={18} />
            </button>
            <button className="activity-icon" data-tooltip="MCP">
              <McpIcon size={18} />
            </button>
            <button className="activity-icon" data-tooltip="Extensions">
              <Blocks size={18} />
            </button>
          </div>
          
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <ChevronDown size={14} />
              <span>{workspaceRoot ? "EXPLORER" : "NO FOLDER OPENED"}</span>
            </div>
            <div className="sidebar-section-content">
              {workspaceRoot ? (
                <ExplorerTree
                  root={workspaceRoot}
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                />
              ) : (
                <>
                  <p className="sidebar-message">You have not yet opened a folder.</p>
                  <button className="sidebar-btn sidebar-btn-primary" onClick={openFolder}>
                    Open Folder
                  </button>
                  <button className="sidebar-btn sidebar-btn-secondary">Clone Repository</button>
                </>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <ChevronDown size={14} />
              <span>WORKSPACES</span>
            </div>
            <div className="sidebar-list">
              <div className="sidebar-list-item active">
                <span className="item-name">codegrey</span>
                <div className="item-stats">
                  <span className="stat-add">+1,204</span>
                  <span className="stat-del">-432</span>
                </div>
              </div>
              <div className="sidebar-list-item">
                <span className="item-name">pluto_desktop</span>
                <div className="item-stats">
                  <span className="stat-add">+45</span>
                  <span className="stat-del">-12</span>
                </div>
              </div>
              <div className="sidebar-list-item">
                <span className="item-name">design-buddy</span>
                <div className="item-stats">
                  <span className="stat-add">+892</span>
                  <span className="stat-del">-104</span>
                </div>
              </div>
            </div>
          </div>

          <div className="sidebar-footer">
            <button className="footer-action-btn">
              <User size={16} />
              <span>Accounts</span>
            </button>
            <button className="footer-action-btn">
              <Settings size={16} />
              <span>Settings</span>
            </button>
          </div>
        </aside>
      )}

      <div
        className="main-content-card"
        data-view-mode={view === "workspace" ? workspaceViewMode : undefined}
      >
        <header className="title-bar">
          {view === "workspace" && (
            <div className="title-bar-actions">
              <button 
                className="title-action-btn" 
                type="button" 
                data-tooltip="Open Browser"
                onClick={() => setBrowserTabRequest(c => c + 1)}
              >
                <Globe size={15} />
              </button>
              <button 
                className="title-action-btn" 
                type="button" 
                data-tooltip={terminalOpen ? "Close Terminal" : "Open Terminal"}
                onClick={toggleTerminal}
              >
                <Terminal size={15} />
              </button>
              <button
                className="title-action-btn"
                type="button"
                data-active={workspaceViewMode === "split" ? "true" : "false"}
                data-tooltip={workspaceViewMode === "agent" ? "Switch to Split View" : "Switch to Agent View"}
                onClick={toggleWorkspaceViewMode}
              >
                <Columns size={15} />
              </button>
              <button className="title-action-btn" type="button" data-tooltip="Run Code">
                <Play size={15} fill="currentColor" />
              </button>
            </div>
          )}

          <div className="window-controls" aria-label="Window controls">
            <button
              type="button"
              aria-label="Minimize"
              onClick={() => (window as any).codegrey?.windowControls?.minimize()}
            >
              <Minus size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={windowMaximized ? "Restore" : "Maximize"}
              onClick={toggleWindowMaximize}
            >
              {windowMaximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
            </button>
            <button
              className="close-control"
              type="button"
              aria-label="Close"
              onClick={() => (window as any).codegrey?.windowControls?.close()}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main 
          className="app-shell" 
          style={view === "workspace" 
            ? { padding: 0, alignItems: 'stretch', overflow: 'hidden' } 
            : { justifyContent: 'center', alignItems: 'center' }
          }
        >
          {view === "onboarding" ? (
            <Onboarding onComplete={startOnboardingWorkspace} />
          ) : (
            <Workspace
              workspaceRoot={workspaceRoot}
              selectedFile={selectedFile}
              getFileIcon={getFileIcon}
              onRequestOpenFolder={openFolder}
              terminalOpen={terminalOpen}
              setTerminalOpen={setTerminalOpen}
              viewMode={workspaceViewMode}
              browserTabRequest={browserTabRequest}
            />
          )}
        </main>
      </div>
    </div>
  );
}

type Entry = { name: string; path: string; isDir: boolean };

function ExplorerTree({
  root,
  selectedFile,
  onSelectFile,
}: {
  root: string;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({ [root]: true }));
  const [children, setChildren] = useState<Record<string, Entry[]>>({});

  useEffect(() => {
    setExpanded({ [root]: true });
    setChildren({});
  }, [root]);

  useEffect(() => {
    let cancelled = false;
    const loadRoot = async () => {
      const items = await window.codegrey?.workspace?.listDir?.(root);
      if (cancelled) return;
      setChildren((prev) => ({ ...prev, [root]: items ?? [] }));
    };
    loadRoot();
    return () => {
      cancelled = true;
    };
  }, [root]);

  const toggleDir = async (dirPath: string) => {
    const willOpen = !expanded[dirPath];
    setExpanded((prev) => ({ ...prev, [dirPath]: willOpen }));
    if (willOpen && !children[dirPath]) {
      const items = await window.codegrey?.workspace?.listDir?.(dirPath);
      setChildren((prev) => ({ ...prev, [dirPath]: items ?? [] }));
    }
  };

  const renderEntry = (entry: Entry, depth: number) => {
    const isOpen = Boolean(expanded[entry.path]);
    const isSelected = selectedFile === entry.path;
    const kids = children[entry.path] ?? [];
    const indent = 16 + depth * 16;

    return (
      <div key={entry.path}>
        <button
          type="button"
          className="explorer-row"
          data-selected={isSelected}
          style={{ paddingLeft: `${indent}px` }}
          onClick={() => {
            if (entry.isDir) {
              void toggleDir(entry.path);
            } else {
              onSelectFile(entry.path);
            }
          }}
          data-tooltip={entry.path}
        >
          <span className="explorer-caret" aria-hidden="true">
            {entry.isDir ? (
              isOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : null}
          </span>
          {!entry.isDir && (() => {
            const icon = getFileIcon(entry.name, entry.isDir);
            return (
              <span 
                className="seti-icon" 
                style={{ color: icon.color, marginRight: 8 }}
              >
                {icon.char}
              </span>
            );
          })()}
          <span className="explorer-name">{entry.name}</span>
        </button>
        {entry.isDir && isOpen ? kids.map((k) => renderEntry(k, depth + 1)) : null}
      </div>
    );
  };

  const rootEntries = useMemo(() => children[root] ?? [], [children, root]);
  return <div className="explorer-tree">{rootEntries.map((e) => renderEntry(e, 0))}</div>;
}
