import { Plus } from "lucide-react";
import React, { useEffect, useState } from "react";
import { MessageRenderer } from "../../components/chat/MessageRenderer";
import { ChatMessage } from "../../types/ai";

export type ChatTimelineProps = {
  messages: ChatMessage[];
  agentRunning: boolean;
  onAcceptProposal: (id: string) => void;
  onRejectProposal: (id: string) => void;
  onReviewProposal: (id: string) => void;
  onResetChat: () => void;
  scrollRef: any;
  placement: "tab" | "panel";
  workspaceRoot: string | null;
  renderComposer?: () => React.ReactNode;
};

export function ChatTimeline(props: ChatTimelineProps) {
  const {
    messages,
    agentRunning,
    onAcceptProposal,
    onRejectProposal,
    onReviewProposal,
    onResetChat,
    scrollRef,
    placement,
    workspaceRoot,
    renderComposer,
  } = props;

  return (
    <section className="workspace-chat" data-placement={placement} aria-label="Workspace chat">
      {placement === "panel" && (
        <div className="workspace-chat-header">
          <div>
            <span>Agent</span>
            <small>{messages.length ? `${messages.length} messages` : "No messages yet"}</small>
          </div>
          <button className="chat-header-btn" type="button" data-tooltip="New chat" onClick={onResetChat}>
            <Plus size={14} />
          </button>
        </div>
      )}

      <div className="workspace-chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span>Start a thread from any file.</span>
            <small>Messages, tool calls, and approvals will appear here.</small>
          </div>
        ) : (
          messages.map((message) => (
            <MessageRenderer
              key={message.id}
              message={message}
              workspaceRoot={workspaceRoot}
              onAcceptProposal={onAcceptProposal}
              onRejectProposal={onRejectProposal}
              onReviewProposal={onReviewProposal}
            />
          ))
        )}
        {agentRunning && <ThinkingStatus />}
      </div>

      {placement === "panel" && renderComposer ? renderComposer() : null}
    </section>
  );
}

function ThinkingStatus() {
  const [index, setIndex] = useState(0);
  const statuses = ["generating...", "loading...", "working..."];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % statuses.length);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="thinking-status">
      <span className="thinking-status-text">{statuses[index]}</span>
    </div>
  );
}
