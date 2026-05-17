import { useState, useEffect, useCallback, useRef } from "react";

export function useGitStatus(workspaces: any[], workspaceRoot: string | null) {
  const [workspaceStats, setWorkspaceStats] = useState<Record<string, { added: number, deleted: number }>>({});
  const statsIntervalRef = useRef<any>(null);

  const refreshWorkspaceStats = useCallback(async (wsList: any[]) => {
    const stats: Record<string, { added: number, deleted: number }> = {};
    for (const ws of wsList) {
      try {
        const res = await window.codegrey?.git?.getStatus?.(ws.path);
        if (res) stats[ws.id] = { added: res.added, deleted: res.deleted };
      } catch (e) {
        // Silently fail for individual workspace stats
      }
    }
    setWorkspaceStats(stats);
  }, []);

  const updateCurrentWorkspaceStats = useCallback(async (files?: Array<{ index: string; workingTree: string }>) => {
    if (!workspaceRoot) return;
    let targetFiles = files;
    if (!targetFiles) {
      const status = await window.codegrey?.git?.status?.();
      targetFiles = status?.ok ? status.files : [];
    }
    const stats = targetFiles.reduce(
      (acc, file) => {
        if (file.index === "?" || file.index === "A" || file.workingTree === "A") acc.added += 1;
        if (file.index === "D" || file.workingTree === "D") acc.deleted += 1;
        return acc;
      },
      { added: 0, deleted: 0 }
    );
    setWorkspaceStats((prev) => ({ ...prev, [workspaceRoot]: stats }));
  }, [workspaceRoot, setWorkspaceStats]);

  // Initial load and polling
  useEffect(() => {
    if (workspaces.length > 0) {
      refreshWorkspaceStats(workspaces);
    }
    
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    statsIntervalRef.current = setInterval(() => {
      if (workspaces.length > 0) refreshWorkspaceStats(workspaces);
    }, 30000); // Every 30s

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [workspaces, refreshWorkspaceStats]);

  return {
    workspaceStats,
    setWorkspaceStats,
    refreshWorkspaceStats,
    updateCurrentWorkspaceStats
  };
}
