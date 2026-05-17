import { useState, useEffect, useCallback, useMemo } from "react";

export function useWorkspaces(
  workspaceRoot: string | null, 
  setWorkspaceRoot: (root: string | null) => void,
  setView: (view: any) => void
) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [conversations, setConversations] = useState<Record<string, any[]>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationRequest, setActiveConversationRequest] = useState(0);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [cloneDialog, setCloneDialog] = useState<{ open: boolean; url: string; busy: boolean; error: string; progress: string[] }>({
    open: false, url: "", busy: false, error: "", progress: [],
  });
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");

  const activeWorkspaceId = useMemo(() => {
    const normalize = (path: string) => (path || "").replace(/[\\/]+$/, "").toLowerCase();
    if (!workspaceRoot) return null;
    return workspaces.find(w => normalize(w.path) === normalize(workspaceRoot))?.id || null;
  }, [workspaceRoot, workspaces]);

  const reloadWorkspaces = useCallback(async () => {
    const list = await window.codegrey?.brain?.getWorkspaces?.() || [];
    setWorkspaces(list);
    return list;
  }, []);

  const requestWorkspaceSwitch = useCallback((path: string, name: string, action: () => void) => {
    const normalize = (p: string) => (p || "").replace(/[\\/]+$/, "").toLowerCase();
    if (workspaceRoot && normalize(workspaceRoot) === normalize(path)) {
      action();
      setView("workspace");
    } else {
      setPendingAction({
        title: "Switch Workspace?",
        description: `Open ${name}? Your current terminal and tabs will be cleared.`,
        confirmLabel: "Switch",
        action: () => {
          action();
          setView("workspace");
        },
      });
    }
  }, [workspaceRoot, setView]);

  const toggleWorkspace = useCallback(async (ws: any) => {
    const willOpen = !expandedWorkspaces[ws.id];
    setExpandedWorkspaces(prev => ({ ...prev, [ws.id]: willOpen }));

    if (willOpen && !conversations[ws.id]) {
      const convs = await window.codegrey?.brain?.getConversations?.(ws.id) || [];
      setConversations(prev => ({ ...prev, [ws.id]: convs }));
    }
  }, [expandedWorkspaces, conversations]);

  const openConversation = useCallback((ws: any, convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    requestWorkspaceSwitch(ws.path, ws.name, async () => {
      const newRoot = await window.codegrey?.workspace?.openFolderByPath?.(ws.path);
      if (newRoot) setWorkspaceRoot(newRoot);
      setActiveConversationId(convId);
      setActiveConversationRequest((request) => request + 1);
      setExpandedWorkspaces(prev => ({ ...prev, [ws.id]: true }));
    });
  }, [requestWorkspaceSwitch, setWorkspaceRoot]);

  const createChat = useCallback((ws: any, e: React.MouseEvent) => {
    e.stopPropagation();
    requestWorkspaceSwitch(ws.path, ws.name, async () => {
      const newRoot = await window.codegrey?.workspace?.openFolderByPath?.(ws.path);
      if (newRoot) setWorkspaceRoot(newRoot);

      const newConv = await window.codegrey?.brain?.createConversation?.(ws.id, "New Chat");
      if (newConv) {
        const updated = await window.codegrey?.brain?.getConversations?.(ws.id) || [];
        setConversations(prev => ({ ...prev, [ws.id]: updated }));
        setActiveConversationId(newConv.id);
        setActiveConversationRequest(r => r + 1);
        setExpandedWorkspaces(prev => ({ ...prev, [ws.id]: true }));
      }
    });
  }, [requestWorkspaceSwitch, setWorkspaceRoot]);

  const doClone = useCallback(async (url: string) => {
    if (!url.trim()) return null;
    setCloneDialog(d => ({ ...d, busy: true, error: "", progress: ["Initializing clone..."] }));
    try {
      const result = await (window as any).codegrey?.workspace?.cloneRepo?.(url, (line: string) => {
        setCloneDialog(d => ({ ...d, progress: [...d.progress, line] }));
      });
      if (result.success || (result as any).ok) {
        setCloneDialog(d => ({ ...d, open: false, url: "", busy: false, progress: [] }));
        await reloadWorkspaces();
        if (result.path) {
          const newRoot = await window.codegrey?.workspace?.openFolderByPath?.(result.path);
          if (newRoot) setWorkspaceRoot(newRoot);
          setView("workspace");
          return result.path;
        }
      } else {
        setCloneDialog(d => ({ ...d, busy: false, error: (result as any).error || "Clone failed" }));
      }
    } catch (e: any) {
      setCloneDialog(d => ({ ...d, busy: false, error: e.message || "An unexpected error occurred" }));
    }
    return null;
  }, [reloadWorkspaces, setWorkspaceRoot, setView]);

  const startOnboardingWorkspace = useCallback(async (mode: "local" | "git" | "blank", options?: { repoUrl?: string }) => {
    if (mode === "local") {
      const path = await window.codegrey?.workspace?.openFolder?.();
      if (path) {
        setWorkspaceRoot(path);
        setView("workspace");
        await reloadWorkspaces();
        return path;
      }
    } else if (mode === "git") {
      if (options?.repoUrl) {
        return await doClone(options.repoUrl);
      } else {
        setCloneDialog(d => ({ ...d, open: true }));
      }
    } else if (mode === "blank") {
      await window.codegrey?.workspace?.clearRoot?.();
      setWorkspaceRoot(null);
      setView("workspace");
    }
    return null;
  }, [reloadWorkspaces, setWorkspaceRoot, setView, doClone]);

  // Initial load
  useEffect(() => {
    reloadWorkspaces();
  }, [reloadWorkspaces]);

  const openFolder = useCallback(async () => {
    const root = await window.codegrey?.workspace?.openFolder?.();
    if (!root) return;
    setWorkspaceRoot(root);
    setView("workspace");
    await reloadWorkspaces();
  }, [reloadWorkspaces, setWorkspaceRoot, setView]);

  const openFile = useCallback(async () => {
    const result = await window.codegrey?.workspace?.openFile?.();
    if (!result) return;
    setWorkspaceRoot(result.root);
    setView("workspace");
    await reloadWorkspaces();
    return result.filePath;
  }, [reloadWorkspaces, setWorkspaceRoot, setView]);

  const newEmptyWorkspace = useCallback(async () => {
    await window.codegrey?.workspace?.clearRoot?.();
    setWorkspaceRoot(null);
    setView("workspace");
  }, [setWorkspaceRoot, setView]);

  const createEditorFile = useCallback(async () => {
    if (!workspaceRoot) return;
    const entries = await window.codegrey?.workspace?.listDir?.(workspaceRoot) || [];
    const names = new Set(entries.map((entry: any) => entry.name.toLowerCase()));
    let name = "New File";
    for (let index = 2; names.has(name.toLowerCase()); index += 1) {
      name = `New File ${index}`;
    }
    const result = await window.codegrey?.workspace?.createEntry?.(workspaceRoot, name, false);
    if (!result?.ok || !result.path) return null;
    window.dispatchEvent(new CustomEvent("codegrey:explorer-refresh"));
    return result.path;
  }, [workspaceRoot]);

  return {
    workspaces,
    setWorkspaces,
    expandedWorkspaces,
    setExpandedWorkspaces,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversationRequest,
    setActiveConversationRequest,
    pendingAction,
    setPendingAction,
    cloneDialog,
    setCloneDialog,
    editingChatId,
    setEditingChatId,
    editingChatName,
    setEditingChatName,
    activeWorkspaceId,
    reloadWorkspaces,
    requestWorkspaceSwitch,
    toggleWorkspace,
    openConversation,
    createChat,
    doClone,
    startOnboardingWorkspace,
    openFolder,
    openFile,
    newEmptyWorkspace,
    createEditorFile
  };
}
