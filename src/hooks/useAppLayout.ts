import { useState, useEffect, useCallback, useRef } from "react";
import { readWorkspaceLayout, writeWorkspaceLayout } from "../lib/workspaceLayout";

export type SidebarView = "files" | "search" | "source" | "mcp" | "knowledge";

export function useAppLayout(workspaceRoot: string | null) {
  const [view, setView] = useState<"onboarding" | "workspace" | "settings" | "mcp-settings" | "accounts" | "knowledge">("onboarding");
  const [sidebarView, setSidebarView] = useState<SidebarView>("files");
  const [sidebarSectionsOpen, setSidebarSectionsOpen] = useState({ primary: true, workspaces: true });
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<"agent" | "split">("agent");
  const [browserTabRequest, setBrowserTabRequest] = useState(0);
  const [workspaceHomeRequest, setWorkspaceHomeRequest] = useState(0);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileRequest, setSelectedFileRequest] = useState(0);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const hydratedLayoutRootRef = useRef<string | null>(null);

  const toggleTerminal = useCallback(() => setTerminalOpen(prev => !prev), []);
  const toggleWorkspaceViewMode = useCallback(() => setWorkspaceViewMode(prev => (prev === "agent" ? "split" : "agent")), []);

  const toggleWindowMaximize = useCallback(async () => {
    const isMaximized = await (window as any).codegrey?.windowControls?.toggleMaximize?.();
    if (typeof isMaximized === "boolean") setWindowMaximized(isMaximized);
  }, []);

  const goHome = useCallback(() => {
    setView("workspace");
    setWorkspaceHomeRequest(c => c + 1);
  }, [setView, setWorkspaceHomeRequest]);

  const openSelectedFile = useCallback((path: string) => {
    setSelectedFile(path);
    setSelectedFileRequest(prev => prev + 1);
    if (view !== "workspace" && view !== "onboarding") {
      setView("workspace");
    }
  }, [view, setView, setSelectedFile, setSelectedFileRequest]);

  const runMenuAction = useCallback((action: () => void | Promise<void>) => {
    setAppMenuOpen(false);
    void (action as any)();
  }, []);

  const openSidebarView = useCallback((nextView: SidebarView) => {
    setSidebarView(nextView);
    if (nextView === "mcp") {
      setView("mcp-settings");
      return;
    }
    if (nextView === "knowledge") {
      setView("knowledge");
      return;
    }
    if (view !== "workspace") {
      setView("workspace");
    }
  }, [view]);

  // Load layout on workspace switch
  useEffect(() => {
    if (!workspaceRoot) return;
    const layout = readWorkspaceLayout(workspaceRoot);
    hydratedLayoutRootRef.current = workspaceRoot;
    setWorkspaceViewMode(layout.viewMode);
    setTerminalOpen(layout.terminalOpen);
  }, [workspaceRoot]);

  // Save layout changes
  useEffect(() => {
    if (!workspaceRoot || hydratedLayoutRootRef.current !== workspaceRoot) return;
    const layout = readWorkspaceLayout(workspaceRoot);
    writeWorkspaceLayout(workspaceRoot, {
      ...layout,
      terminalOpen,
      viewMode: workspaceViewMode,
    });
  }, [workspaceRoot, terminalOpen, workspaceViewMode]);

  // Listen for native maximization changes
  useEffect(() => {
    let cancelled = false;
    void (window as any).codegrey?.windowControls?.isMaximized?.().then((isMaximized: boolean) => {
      if (!cancelled) setWindowMaximized(isMaximized);
    });

    const unsubscribe = (window as any).codegrey?.windowControls?.onMaximizedChange?.((isMaximized: boolean) => {
      setWindowMaximized(isMaximized);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Global Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarSectionsOpen(prev => ({ ...prev, primary: !prev.primary }));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        toggleTerminal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Home") {
        e.preventDefault();
        goHome();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTerminal, goHome]);

  return {
    view,
    setView,
    sidebarView,
    setSidebarView,
    sidebarSectionsOpen,
    setSidebarSectionsOpen,
    windowMaximized,
    setWindowMaximized,
    terminalOpen,
    setTerminalOpen,
    workspaceViewMode,
    setWorkspaceViewMode,
    browserTabRequest,
    setBrowserTabRequest,
    workspaceHomeRequest,
    setWorkspaceHomeRequest,
    selectedFile,
    setSelectedFile,
    selectedFileRequest,
    setSelectedFileRequest,
    toggleTerminal,
    toggleWorkspaceViewMode,
    toggleWindowMaximize,
    openSidebarView,
    goHome,
    openSelectedFile,
    appMenuOpen,
    setAppMenuOpen,
    runMenuAction
  };
}
