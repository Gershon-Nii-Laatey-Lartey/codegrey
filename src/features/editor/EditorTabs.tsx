import { Globe, MessageSquare, Plus, X } from "lucide-react";
import React from "react";
import "./editor.css";

const CHAT_TAB_ID = "__codegrey_chat__";
const BROWSER_TAB_ID = "__codegrey_browser__";

export type EditorTabsProps = {
  openTabs: string[];
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
  onCloseTab: (tab: string) => void;
  onCreateFile: () => void;
  getFileIcon: (name: string) => { svg?: string; char?: string; color?: string };
  viewMode: "agent" | "split";
  chatTabVisible: boolean;
  onOpenChat: () => void;
  onCloseChat: () => void;
  workspaceRoot: string | null;
};

export function EditorTabs(props: EditorTabsProps) {
  const {
    openTabs,
    activeTab,
    setActiveTab,
    onCloseTab,
    onCreateFile,
    getFileIcon,
    viewMode,
    chatTabVisible,
    onOpenChat,
    onCloseChat,
    workspaceRoot,
  } = props;

  return (
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
            ) : icon?.svg ? (
              <img
                src={icon.svg}
                alt=""
                style={{ width: 14, height: 14, marginRight: 8, flexShrink: 0 }}
              />
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
                onCloseTab(tab);
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
          onClick={onOpenChat}
          data-tooltip="Workspace chat"
        >
          <MessageSquare size={14} />
          <span>Chat</span>
          <X
            size={14}
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseChat();
            }}
          />
        </button>
      ) : null}
      
      <button
        className="tabs-plus-btn"
        type="button"
        data-tooltip="New File"
        onClick={onCreateFile}
        disabled={!workspaceRoot}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
