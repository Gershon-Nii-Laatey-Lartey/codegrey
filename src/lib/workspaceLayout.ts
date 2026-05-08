export type WorkspaceLayoutState = {
  openTabs: string[];
  activeTab: string | null;
  chatPanelWidth: number;
  terminalHeight: number;
  terminalOpen: boolean;
  viewMode: "agent" | "split";
};

const DEFAULT_LAYOUT: WorkspaceLayoutState = {
  openTabs: [],
  activeTab: null,
  chatPanelWidth: 340,
  terminalHeight: 260,
  terminalOpen: false,
  viewMode: "agent",
};

function layoutKey(workspaceRoot: string) {
  return `codegrey.workspaceLayout.${workspaceRoot}`;
}

export function readWorkspaceLayout(workspaceRoot: string | null): WorkspaceLayoutState {
  if (!workspaceRoot) return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(layoutKey(workspaceRoot));
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayoutState>;
    return {
      ...DEFAULT_LAYOUT,
      ...parsed,
      openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs.filter(Boolean) : [],
      activeTab: typeof parsed.activeTab === "string" ? parsed.activeTab : null,
      chatPanelWidth: clampNumber(parsed.chatPanelWidth, 280, 620, DEFAULT_LAYOUT.chatPanelWidth),
      terminalHeight: clampNumber(parsed.terminalHeight, 120, 900, DEFAULT_LAYOUT.terminalHeight),
      terminalOpen: Boolean(parsed.terminalOpen),
      viewMode: parsed.viewMode === "split" ? "split" : "agent",
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function writeWorkspaceLayout(workspaceRoot: string | null, layout: WorkspaceLayoutState) {
  if (!workspaceRoot) return;
  try {
    window.localStorage.setItem(layoutKey(workspaceRoot), JSON.stringify(layout));
  } catch {
    // Local storage can be unavailable in restricted shells.
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : fallback;
}
