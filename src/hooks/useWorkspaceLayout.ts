import { useEffect, useRef, useState } from "react";
import { readWorkspaceLayout, writeWorkspaceLayout } from "../lib/workspaceLayout";

export function useWorkspaceLayout(
  workspaceRoot: string | null,
  terminalOpen: boolean,
  setTerminalOpen: (open: boolean) => void,
  viewMode: string,
  CHAT_TAB_ID: string
) {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [chatPanelWidth, setChatPanelWidth] = useState(340);
  const [terminalHeight, setTerminalHeight] = useState(260);
  const layoutHydratedRootRef = useRef<string | null>(null);

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
      terminalOpen, // Store the actual active state instead of hardcoded true!
      viewMode: viewMode as any,
    });
  }, [workspaceRoot, openTabs, activeTab, chatPanelWidth, terminalHeight, viewMode, terminalOpen]);

  return {
    openTabs,
    setOpenTabs,
    activeTab,
    setActiveTab,
    chatPanelWidth,
    setChatPanelWidth,
    terminalHeight,
    setTerminalHeight,
  };
}
