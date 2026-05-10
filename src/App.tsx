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
  Brain,
  FolderOpen,
  Globe,
  Terminal,
  Columns,
  Play,
  Plus,
  Menu,
  File,
  PanelTopOpen,
  GitPullRequest,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { Onboarding, type WorkspaceMode } from "./pages/Onboarding";
import { Workspace } from "./pages/Workspace";
import { Settings as SettingsPage } from "./pages/Settings";
import { ExplorerTree } from "./components/sidebar/ExplorerTree";
import { SearchPanel } from "./components/sidebar/SearchPanel";
import { Accounts } from "./pages/Accounts";
import { KnowledgePage } from "./pages/KnowledgePage";
import { SourceControlPanel } from "./components/sidebar/SourceControlPanel";
import { McpPanel } from "./components/sidebar/McpPanel";
import { McpSettings } from "./pages/McpSettings";
import { AuthGate } from "./pages/AuthGate";
import { useDesktopAuth } from "./lib/desktopAuth";

import { readWorkspaceLayout, writeWorkspaceLayout } from "./lib/workspaceLayout";
import { getFileIcon } from "./lib/utils";

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

type SidebarView = "files" | "search" | "source" | "mcp" | "knowledge";
type WorkspaceStats = { added: number; deleted: number };

export function App() {
  const [view, setView] = useState<"onboarding" | "workspace" | "settings" | "mcp-settings" | "accounts" | "knowledge">("onboarding");
  const { auth } = useDesktopAuth();
  const [authSkipped, setAuthSkipped] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [browserTabRequest, setBrowserTabRequest] = useState(0);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileRequest, setSelectedFileRequest] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<"agent" | "split">("agent");
  const [sidebarView, setSidebarView] = useState<SidebarView>("files");
  const [sidebarSectionsOpen, setSidebarSectionsOpen] = useState({ primary: true, workspaces: true });
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [workspaceStats, setWorkspaceStats] = useState<Record<string, WorkspaceStats>>({});
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [conversations, setConversations] = useState<{ [workspaceId: string]: Array<{ id: string, name: string }> }>({});
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");
  const loadedWorkspaceData = useRef(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationRequest, setActiveConversationRequest] = useState(0);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const hydratedLayoutRootRef = useRef<string | null>(null);
  const appMenuRef = useRef<HTMLDivElement | null>(null);

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
      if (root) {
        // Automatically track any opened workspace
        const name = root.split(/[/\\]/).pop();
        await window.codegrey?.brain?.trackWorkspace?.(root, name);
        setView("workspace");
      } else {
        setView("onboarding");
      }
      setAppReady(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!appMenuRef.current?.contains(event.target as Node)) {
        setAppMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    const onRefresh = () => {
      void refreshCurrentWorkspaceStats();
      void reloadWorkspaces();
    };
    window.addEventListener('codegrey:stats-refresh' as any, onRefresh);
    return () => window.removeEventListener('codegrey:stats-refresh' as any, onRefresh);
  }, [workspaceRoot]);

  useEffect(() => {
    const loadBrain = async () => {
      const ws = await window.codegrey?.brain?.getWorkspaces?.() || [];
      setWorkspaces(ws);
      void refreshWorkspaceStats(ws);

      // Auto-expand current workspace
      if (workspaceRoot) {
        const currentWs = ws.find((w: any) => w.path === workspaceRoot);
        if (currentWs) {
          setExpandedWorkspaces(prev => ({ ...prev, [currentWs.id]: true }));
          const convs = await window.codegrey?.brain?.getConversations?.(currentWs.id) || [];
          setConversations(prev => ({ ...prev, [currentWs.id]: convs }));
        }
      }
    };
    loadBrain();
  }, [workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot) return;
    const layout = readWorkspaceLayout(workspaceRoot);
    hydratedLayoutRootRef.current = workspaceRoot;
    setWorkspaceViewMode(layout.viewMode);
    setTerminalOpen(layout.terminalOpen);
  }, [workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot || hydratedLayoutRootRef.current !== workspaceRoot) return;
    const layout = readWorkspaceLayout(workspaceRoot);
    writeWorkspaceLayout(workspaceRoot, {
      ...layout,
      terminalOpen,
      viewMode: workspaceViewMode,
    });
  }, [workspaceRoot, terminalOpen, workspaceViewMode]);

  const [pendingAction, setPendingAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);
  const [cloneDialog, setCloneDialog] = useState<{ open: boolean; url: string; busy: boolean; error: string; progress: string[] }>({
    open: false, url: "", busy: false, error: "", progress: [],
  });

  const requestWorkspaceSwitch = (path: string, name: string, action: () => void) => {
    if (workspaceRoot === path) {
      action();
    } else {
      setPendingAction({
        title: "Switch Workspace?",
        description: `Open ${name}? Your current terminal and tabs will be cleared.`,
        confirmLabel: "Switch",
        action,
      });
    }
  };

  const toggleWorkspace = async (ws: any) => {
    const willOpen = !expandedWorkspaces[ws.id];
    setExpandedWorkspaces(prev => ({ ...prev, [ws.id]: willOpen }));

    if (willOpen && !conversations[ws.id]) {
      const convs = await window.codegrey?.brain?.getConversations?.(ws.id) || [];
      setConversations(prev => ({ ...prev, [ws.id]: convs }));
    }
  };

  const openConversation = (ws: any, convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    requestWorkspaceSwitch(ws.path, ws.name, async () => {
      const newRoot = await window.codegrey?.workspace?.openFolderByPath?.(ws.path);
      if (newRoot) setWorkspaceRoot(newRoot);
      setSelectedFile(null);
      setActiveConversationId(convId);
      setActiveConversationRequest((request) => request + 1);
      setExpandedWorkspaces(prev => ({ ...prev, [ws.id]: true }));
    });
  };

  const createChat = (ws: any, e: React.MouseEvent) => {
    e.stopPropagation();
    requestWorkspaceSwitch(ws.path, ws.name, async () => {
      const newRoot = await window.codegrey?.workspace?.openFolderByPath?.(ws.path);
      if (newRoot) setWorkspaceRoot(newRoot);

      const newConv = await window.codegrey?.brain?.createConversation?.(ws.id, "New Chat");
      const convs = await window.codegrey?.brain?.getConversations?.(ws.id) || [];
      setConversations(prev => ({ ...prev, [ws.id]: convs }));
      setExpandedWorkspaces(prev => ({ ...prev, [ws.id]: true }));
      if (newConv) {
        setSelectedFile(null);
        setActiveConversationId(newConv.id);
        setActiveConversationRequest((request) => request + 1);
      }
    });
  };


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
    setActiveConversationId(null);
    setView("workspace");
    void reloadWorkspaces();
  };

  const openFile = async () => {
    const result = await window.codegrey?.workspace?.openFile?.();
    if (!result) return;
    setWorkspaceRoot(result.root);
    setSelectedFile(result.filePath);
    setSelectedFileRequest((request) => request + 1);
    setActiveConversationId(null);
    setView("workspace");
    void reloadWorkspaces();
  };

  const newEmptyWorkspace = async () => {
    await window.codegrey?.workspace?.clearRoot?.();
    setWorkspaceRoot(null);
    setSelectedFile(null);
    setActiveConversationId(null);
    setView("workspace");
  };

  const runMenuAction = (action: () => void | Promise<void>) => {
    setAppMenuOpen(false);
    void action();
  };

  const openSelectedFile = (path: string) => {
    setActiveConversationId(null);
    setSelectedFile(path);
    setSelectedFileRequest((request) => request + 1);
    // Close any overlay page so the file is immediately visible
    if (view !== "workspace" && view !== "onboarding") {
      setView("workspace");
    }
  };

  const basename = (filePath: string) => filePath.split(/[/\\]/).filter(Boolean).pop() || filePath;

  const createEditorFile = async () => {
    if (!workspaceRoot) return;
    const entries = await window.codegrey?.workspace?.listDir?.(workspaceRoot) || [];
    const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
    let name = "New File";
    for (let index = 2; names.has(name.toLowerCase()); index += 1) {
      name = `New File ${index}`;
    }
    const result = await window.codegrey?.workspace?.createEntry?.(workspaceRoot, name, false);
    if (!result?.ok || !result.path) return;
    window.dispatchEvent(new CustomEvent("codegrey:explorer-refresh"));
    openSelectedFile(result.path);
    await refreshCurrentWorkspaceStats();
  };

  const reloadWorkspaces = async () => {
    const ws = await window.codegrey?.brain?.getWorkspaces?.() || [];
    setWorkspaces(ws);
    void refreshWorkspaceStats(ws);
    return ws;
  };

  const updateCurrentWorkspaceStats = (files: Array<{ index: string; workingTree: string }>) => {
    if (!workspaceRoot) return;
    const stats = files.reduce(
      (acc, file) => {
        if (file.index === "?" || file.index === "A" || file.workingTree === "A") acc.added += 1;
        if (file.index === "D" || file.workingTree === "D") acc.deleted += 1;
        return acc;
      },
      { added: 0, deleted: 0 }
    );
    setWorkspaceStats((prev) => ({ ...prev, [workspaceRoot]: stats }));
  };

  const refreshCurrentWorkspaceStats = async () => {
    if (!workspaceRoot) return;
    const status = await window.codegrey?.git?.status?.();
    updateCurrentWorkspaceStats(status?.ok ? status.files : []);
  };

  const statsFromFiles = (files: Array<{ index: string; workingTree: string }>) =>
    files.reduce(
      (acc, file) => {
        if (file.index === "?" || file.index === "A" || file.workingTree === "A") acc.added += 1;
        if (file.index === "D" || file.workingTree === "D") acc.deleted += 1;
        return acc;
      },
      { added: 0, deleted: 0 }
    );

  const refreshWorkspaceStats = async (items = workspaces) => {
    if (!window.codegrey?.git?.statusForPath) return;
    const entries = await Promise.all(
      items.map(async (ws) => {
        const status = await window.codegrey?.git?.statusForPath?.(ws.path);
        return [ws.path, statsFromFiles(status?.ok ? status.files : [])] as const;
      })
    );
    setWorkspaceStats((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  };

  useEffect(() => {
    void refreshCurrentWorkspaceStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot]);

  const cloneRepository = async (repoUrl = "") => {
    if (repoUrl.trim()) {
      // Called with a URL directly (e.g. from onboarding) — skip dialog
      const result = await window.codegrey?.workspace?.cloneRepo?.(repoUrl.trim());
      if (!result?.ok || !result.path) {
        if (result?.error) {
          setPendingAction({ title: "Clone Failed", description: result.error, confirmLabel: "OK", action: () => undefined });
        }
        return null;
      }
      setWorkspaceRoot(result.path);
      setSelectedFile(null);
      setActiveConversationId(null);
      setSidebarView("files");
      setView("workspace");
      await reloadWorkspaces();
      return result.path;
    }
    // No URL supplied — open the custom clone dialog
    setCloneDialog({ open: true, url: "", busy: false, error: "", progress: [] });
    return null;
  };

  const doClone = async (url: string) => {
    if (!url.trim()) { setCloneDialog(d => ({ ...d, error: "Please enter a repository URL" })); return; }
    setCloneDialog(d => ({ ...d, busy: true, error: "", progress: [] }));
    // Subscribe to streaming progress
    const unsub = window.codegrey?.workspace?.onCloneProgress?.((msg: { line: string }) => {
      setCloneDialog(d => ({ ...d, progress: [...d.progress.slice(-30), msg.line] }));
    });
    const result = await window.codegrey?.workspace?.cloneRepo?.(url.trim());
    unsub?.();
    if (!result?.ok || !result.path) {
      setCloneDialog(d => ({ ...d, busy: false, error: result?.error || "Clone failed" }));
      return;
    }
    setCloneDialog({ open: false, url: "", busy: false, error: "", progress: [] });
    setWorkspaceRoot(result.path);
    setSelectedFile(null);
    setActiveConversationId(null);
    setSidebarView("files");
    setView("workspace");
    await reloadWorkspaces();
  };

  const startOnboardingWorkspace = async (mode: WorkspaceMode, options?: { repoUrl?: string }) => {
    if (mode === "local") {
      const root = await window.codegrey?.workspace?.openFolder?.();
      if (!root) return;
      setWorkspaceRoot(root);
      setSelectedFile(null);
      setActiveConversationId(null);
      setView("workspace");
      return;
    }

    if (mode === "blank") {
      await window.codegrey?.workspace?.clearRoot?.();
      setWorkspaceRoot(null);
      setSelectedFile(null);
      setActiveConversationId(null);
      setView("workspace");
      return;
    }

    if (mode === "git") {
      await cloneRepository(options?.repoUrl ?? "");
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
    const hideTooltip = () => {
      clearTimeout(showTimeout);
      currentEl = null;
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', hideTooltip);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', hideTooltip);
      tooltip.remove();
    };
  }, []);

  return (
    !appReady ? (
      <div className="app-frame app-boot" data-view="boot" />
    ) : (
    <div className="app-frame" data-view={view}>
      {view !== "onboarding" && (
        <aside className="global-sidebar">
          <div className="sidebar-brand">
            <div className="app-menu-wrap" ref={appMenuRef}>
              <button
                type="button"
                className="app-menu-button"
                aria-label="Main menu"
                data-tooltip="Main menu"
                onClick={() => setAppMenuOpen((open) => !open)}
              >
                <Menu size={16} />
              </button>
            </div>
            <span>Codegrey</span>
          </div>
          {appMenuOpen ? (
            <div className="app-menu app-menu-fixed" role="menu" ref={appMenuRef as any}>
              <button type="button" role="menuitem" onClick={() => runMenuAction(newEmptyWorkspace)}>
                <FilePlusIcon />
                <span>New Empty Workspace</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => window.codegrey?.windowControls?.newWindow?.())}>
                <PanelTopOpen size={15} />
                <span>New Window</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => window.codegrey?.windowControls?.newEmptyWindow?.())}>
                <PanelTopOpen size={15} />
                <span>New Empty Window</span>
              </button>
              <div className="app-menu-separator" />
              <button type="button" role="menuitem" onClick={() => runMenuAction(openFolder)}>
                <FolderOpen size={15} />
                <span>Open Folder...</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(openFile)}>
                <File size={15} />
                <span>Open File...</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(async () => { await cloneRepository(); })}>
                <GitPullRequest size={15} />
                <span>Clone Repository...</span>
              </button>
              <div className="app-menu-separator" />
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => setView("settings"))}>
                <Settings size={15} />
                <span>Settings</span>
              </button>
            </div>
          ) : null}

          <div className="sidebar-activity-bar">
            <button
              className={`activity-icon ${sidebarView === "files" ? "active" : ""}`}
              data-tooltip="Files"
              onClick={() => setSidebarView("files")}
            >
              <Files size={18} />
            </button>
            <button
              className={`activity-icon ${sidebarView === "search" ? "active" : ""}`}
              data-tooltip="Search"
              onClick={() => setSidebarView("search")}
            >
              <Search size={18} />
            </button>
            <button
              className={`activity-icon ${sidebarView === "source" ? "active" : ""}`}
              data-tooltip="Source Control"
              onClick={() => setSidebarView("source")}
            >
              <GitBranch size={18} />
            </button>
            <button
              className={`activity-icon ${sidebarView === "mcp" ? "active" : ""}`}
              data-tooltip="MCP"
              onClick={() => setSidebarView("mcp")}
            >
              <McpIcon size={18} />
            </button>
            <button
              className={`activity-icon ${sidebarView === "knowledge" ? "active" : ""}`}
              data-tooltip="Knowledge & Skills"
              onClick={() => setSidebarView("knowledge")}
            >
              <Brain size={18} />
            </button>
          </div>

          <div className="sidebar-section" data-open={sidebarSectionsOpen.primary}>
            <button
              type="button"
              className="sidebar-section-header"
              onClick={() => setSidebarSectionsOpen((state) => ({ ...state, primary: !state.primary }))}
            >
              {sidebarSectionsOpen.primary ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {sidebarView === "files"
                  ? workspaceRoot ? "EXPLORER" : "NO FOLDER OPENED"
                  : sidebarView === "search"
                    ? "SEARCH"
                    : sidebarView === "source"
                      ? "SOURCE CONTROL"
                      : sidebarView === "mcp"
                        ? "MCP"
                        : "KNOWLEDGE & SKILLS"}
              </span>
            </button>
            {sidebarSectionsOpen.primary ? <div className="sidebar-section-content">
              {sidebarView === "files" && workspaceRoot ? (
                <ExplorerTree
                  root={workspaceRoot}
                  selectedFile={selectedFile}
                  onSelectFile={openSelectedFile}
                  onChanged={() => {
                    void reloadWorkspaces();
                    void refreshCurrentWorkspaceStats();
                  }}
                  onRequestDelete={(entry, onDeleted) => {
                    setPendingAction({
                      title: `Delete ${entry.isDir ? "Folder" : "File"}?`,
                      description: `Are you sure you want to delete "${entry.name || basename(entry.path)}"? This cannot be undone.`,
                      confirmLabel: "Delete",
                      action: () => void onDeleted(),
                    });
                  }}
                />
              ) : sidebarView === "files" ? (
                <>
                  <p className="sidebar-message">You have not yet opened a folder.</p>
                  <button className="sidebar-btn sidebar-btn-primary" onClick={openFolder}>
                    Open a folder
                  </button>
                  <button className="sidebar-btn sidebar-btn-secondary" onClick={() => void cloneRepository()}>
                    Clone a Git repo
                  </button>
                </>
              ) : sidebarView === "search" ? (
                <SearchPanel workspaceRoot={workspaceRoot} onOpenFile={openSelectedFile} />
              ) : sidebarView === "source" ? (
                <SourceControlPanel
                  workspaceRoot={workspaceRoot}
                  onOpenFile={openSelectedFile}
                  onStatusChange={(status) => updateCurrentWorkspaceStats(status.ok ? status.files : [])}
                />
              ) : sidebarView === "mcp" ? (
                <McpPanel onOpenSettings={() => setView("mcp-settings")} />
              ) : (
                <div className="sidebar-knowledge-mini">
                  <Brain size={20} opacity={0.3} />
                  <p>Knowledge & Skills</p>
                  <button className="sidebar-btn sidebar-btn-primary" onClick={() => setView("knowledge")}>
                    Open Knowledge Base
                  </button>
                </div>
              )}
            </div> : null}
          </div>

          <div className="sidebar-section" data-open={sidebarSectionsOpen.workspaces}>
            <button
              type="button"
              className="sidebar-section-header"
              onClick={() => setSidebarSectionsOpen((state) => ({ ...state, workspaces: !state.workspaces }))}
            >
              {sidebarSectionsOpen.workspaces ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>WORKSPACES</span>
            </button>
            {sidebarSectionsOpen.workspaces ? <div className="sidebar-list">
              {workspaces.map((ws) => {
                const isExpanded = !!expandedWorkspaces[ws.id];
                const convs = conversations[ws.id] || [];
                const stats = workspaceStats[ws.path] ?? { added: ws.added || 0, deleted: ws.deleted || 0 };
                return (
                  <div key={ws.id} className="workspace-group">
                    <div 
                      className={`sidebar-list-item workspace-group-header ${workspaceRoot === ws.path && !activeConversationId ? 'active' : ''}`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}
                        onClick={() => requestWorkspaceSwitch(ws.path, ws.name, async () => {
                          const newRoot = await window.codegrey?.workspace?.openFolderByPath?.(ws.path);
                          if (newRoot) setWorkspaceRoot(newRoot);
                          setSelectedFile(null);
                          setActiveConversationId(null);
                        })}
                      >
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWorkspace(ws);
                          }}
                          style={{ display: 'flex', alignItems: 'center', padding: '2px' }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                        <span className="item-name">{ws.name}</span>
                      </div>
                      <div className="item-stats" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="stat-add">+{stats.added}</span>
                        <span className="stat-del">-{stats.deleted}</span>
                        <button 
                          className="workspace-add-chat-btn"
                          onClick={(e) => createChat(ws, e)}
                          style={{ background: 'none', border: 'none', color: '#a0a0a0', cursor: 'pointer', padding: 0 }}
                          data-tooltip="New Chat"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="workspace-conversations" style={{ paddingLeft: 16 }}>
                        {convs.length === 0 ? (
                          <div style={{ fontSize: 11, color: '#666', padding: '4px 8px' }}>No chats yet</div>
                        ) : (
                          convs.map(conv => (
                            <div
                              key={conv.id}
                              className={`sidebar-list-item sub-item chat-list-item ${activeConversationId === conv.id ? 'active' : ''}`}
                              style={{ fontSize: 12, paddingLeft: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              onClick={(e) => {
                                if (editingChatId !== conv.id) openConversation(ws, conv.id, e);
                              }}
                            >
                              {editingChatId === conv.id ? (
                                <input
                                  autoFocus
                                  value={editingChatName}
                                  onChange={(e) => setEditingChatName(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      e.stopPropagation();
                                      if (editingChatName.trim()) {
                                        await window.codegrey?.brain?.renameConversation?.(ws.id, conv.id, editingChatName.trim());
                                        const updatedConvs = await window.codegrey?.brain?.getConversations?.(ws.id) || [];
                                        setConversations(prev => ({ ...prev, [ws.id]: updatedConvs }));
                                      }
                                      setEditingChatId(null);
                                    } else if (e.key === 'Escape') {
                                      e.stopPropagation();
                                      setEditingChatId(null);
                                    }
                                  }}
                                  onBlur={() => setEditingChatId(null)}
                                  style={{
                                    background: 'var(--surface)', border: '1px solid var(--border-subtle)',
                                    color: '#fff', fontSize: '12px', padding: '2px 4px', width: '100%', borderRadius: '2px',
                                    outline: 'none'
                                  }}
                                />
                              ) : (
                                <>
                                  <span className="item-name" style={{ color: activeConversationId === conv.id ? '#fff' : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {conv.name}
                                  </span>
                                  <div className="chat-actions">
                                    <button
                                      className="chat-action-btn"
                                      data-tooltip="Rename"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingChatId(conv.id);
                                        setEditingChatName(conv.name);
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button
                                      className="chat-action-btn"
                                      data-tooltip="Delete"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPendingAction({
                                          title: "Delete Chat?",
                                          description: `Are you sure you want to delete "${conv.name}"? This cannot be undone.`,
                                          confirmLabel: "Delete",
                                          action: async () => {
                                            await window.codegrey?.brain?.deleteConversation?.(ws.id, conv.id);
                                            const updatedConvs = await window.codegrey?.brain?.getConversations?.(ws.id) || [];
                                            setConversations(prev => ({ ...prev, [ws.id]: updatedConvs }));
                                            if (activeConversationId === conv.id) {
                                              setActiveConversationId(null);
                                            }
                                          }
                                        });
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div> : null}
          </div>

          <div className="sidebar-footer">
            <button className="footer-action-btn" onClick={() => setView("accounts")}>
              <User size={16} />
              <span>Accounts</span>
            </button>
            <button className="footer-action-btn" onClick={() => setView("settings")}>
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
          {view !== "onboarding" && (
            <div className="title-bar-actions">
              <button
                className="title-action-btn"
                type="button"
                data-tooltip="Home"
                onClick={() => setView(workspaceRoot ? "workspace" : "onboarding")}
              >
                <FolderOpen size={15} />
              </button>
              <button
                className="title-action-btn"
                type="button"
                data-tooltip="Open Browser"
                onClick={() => {
                  if (view !== "workspace") setView("workspace");
                  setBrowserTabRequest(c => c + 1);
                }}
              >
                <Globe size={15} />
              </button>
              <button
                className="title-action-btn"
                type="button"
                data-tooltip={terminalOpen ? "Close Terminal" : "Open Terminal"}
                onClick={() => {
                  if (view !== "workspace") setView("workspace");
                  toggleTerminal();
                }}
              >
                <Terminal size={15} />
              </button>
              <button
                className="title-action-btn"
                type="button"
                data-active={workspaceViewMode === "split" ? "true" : "false"}
                data-tooltip={workspaceViewMode === "agent" ? "Switch to Split View" : "Switch to Agent View"}
                onClick={() => {
                  if (view !== "workspace") setView("workspace");
                  toggleWorkspaceViewMode();
                }}
              >
                <Columns size={15} />
              </button>
              <button 
                className="title-action-btn" 
                type="button" 
                data-tooltip="Run Code"
                onClick={() => {
                  if (view !== "workspace") setView("workspace");
                  // run logic here if any
                }}
              >
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
          style={view === "workspace" || view === "settings" || view === "mcp-settings" || view === "knowledge" || view === "accounts"
            ? { padding: 0, alignItems: 'stretch', overflow: 'hidden' }
            : { justifyContent: 'center', alignItems: 'center' }
          }
        >
          {!auth.ready ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)" }}>
              <div className="spin" style={{ width: 20, height: 20, border: "2px solid var(--muted)", borderTopColor: "var(--text)", borderRadius: "50%" }} />
            </div>
          ) : !auth.loggedIn && !authSkipped ? (
            <AuthGate onSkip={() => setAuthSkipped(true)} />
          ) : view === "onboarding" ? (
            <Onboarding onComplete={startOnboardingWorkspace} />
          ) : view === "settings" ? (
            <SettingsPage onBack={() => setView("workspace")} />
          ) : view === "accounts" ? (
            <Accounts onBack={() => setView("workspace")} />
          ) : view === "knowledge" ? (
            <KnowledgePage
              onBack={() => setView("workspace")}
              activeWorkspaceId={workspaces.find(w => w.path === workspaceRoot)?.id}
              workspaceRoot={workspaceRoot}
            />
          ) : view === "mcp-settings" ? (
            <McpSettings onBack={() => setView(workspaceRoot ? "workspace" : "onboarding")} />
          ) : (
            <Workspace
              workspaceRoot={workspaceRoot}
              selectedFile={selectedFile}
              selectedFileRequest={selectedFileRequest}
              getFileIcon={getFileIcon}
              onRequestOpenFolder={openFolder}
              onCreateFile={createEditorFile}
              terminalOpen={terminalOpen}
              setTerminalOpen={setTerminalOpen}
              viewMode={workspaceViewMode}
              browserTabRequest={browserTabRequest}
              activeWorkspaceId={workspaces.find(w => w.path === workspaceRoot)?.id}
              activeConversationId={activeConversationId}
              activeConversationRequest={activeConversationRequest}
              onConversationCreated={async (id) => {
                setSelectedFile(null);
                setActiveConversationId(id);
                setActiveConversationRequest((request) => request + 1);
                const wsId = workspaces.find(w => w.path === workspaceRoot)?.id;
                if (wsId) {
                  const convs = await window.codegrey?.brain?.getConversations?.(wsId) || [];
                  setConversations(prev => ({ ...prev, [wsId]: convs }));
                  setExpandedWorkspaces(prev => ({ ...prev, [wsId]: true }));
                }
              }}
              onCloseConversation={() => setActiveConversationId(null)}
              onClearSelectedFile={() => setSelectedFile(null)}
              onOpenMcpSettings={() => setView("mcp-settings")}
            />
          )}

          {cloneDialog.open && (
            <div className="clone-dialog-overlay">
              <div className="clone-dialog">
                <div className="clone-dialog-body">
                  <h3 className="clone-dialog-title">Clone Repository</h3>
                  <p className="clone-dialog-sub">
                    Enter a GitHub URL or <code>owner/repo</code> shorthand
                  </p>
                  <input
                    type="text"
                    autoFocus
                    className={`clone-dialog-input${cloneDialog.error ? " error" : ""}`}
                    placeholder="https://github.com/org/repo  or  org/repo"
                    value={cloneDialog.url}
                    disabled={cloneDialog.busy}
                    onChange={e => setCloneDialog(d => ({ ...d, url: e.target.value, error: "" }))}
                    onKeyDown={e => { if (e.key === "Enter") void doClone(cloneDialog.url); if (e.key === "Escape" && !cloneDialog.busy) setCloneDialog(d => ({ ...d, open: false })); }}
                  />
                  {cloneDialog.error && (
                    <p className="clone-dialog-error">{cloneDialog.error}</p>
                  )}
                  {cloneDialog.progress.length > 0 && (
                    <div className="clone-dialog-log">
                      {cloneDialog.progress.map((line, i) => (
                        <div key={i} className="clone-dialog-log-line">{line}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="clone-dialog-footer">
                  <button type="button" className="clone-dialog-btn-cancel" disabled={cloneDialog.busy} onClick={() => !cloneDialog.busy && setCloneDialog(d => ({ ...d, open: false }))}>
                    Cancel
                  </button>
                  <button type="button" className="clone-dialog-btn-primary" onClick={() => void doClone(cloneDialog.url)} disabled={cloneDialog.busy}>
                    {cloneDialog.busy ? (
                      <><span className="clone-spinner" />Cloning…</>
                    ) : "Clone"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {pendingAction && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
              backgroundColor: 'rgba(0, 0, 0, 0.2)'
            }}>
              <div style={{
                background: '#1e1e1e',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                width: '400px',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '16px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#e5e5e5' }}>
                    {pendingAction.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#999999', lineHeight: 1.5 }}>
                    {pendingAction.description}
                  </p>
                </div>
                <div style={{
                  padding: '12px 16px',
                  display: 'flex', gap: '8px', justifyContent: 'flex-end',
                  background: '#1e1e1e'
                }}>
                  <button type="button" onClick={() => setPendingAction(null)} style={{
                    padding: '6px 16px', fontSize: '13px', fontWeight: 500,
                    background: 'transparent', color: '#cccccc',
                    border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px',
                    cursor: 'pointer'
                  }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => {
                    pendingAction.action();
                    setPendingAction(null);
                  }} style={{
                    padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                    background: pendingAction.confirmLabel === 'Delete' ? '#d34a4a' : '#d34a4a',
                    color: '#ffffff',
                    border: 'none', borderRadius: '6px',
                    cursor: 'pointer'
                  }}>
                    {pendingAction.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
    )
  );
}

function FilePlusIcon() {
  return <Plus size={15} />;
}
