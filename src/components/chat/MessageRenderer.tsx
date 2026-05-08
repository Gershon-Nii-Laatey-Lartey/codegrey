import { Copy, ExternalLink, FileText, ThumbsDown, ThumbsUp, Undo } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../../types/ai";
import { DiffCard } from "./DiffCard";
import { ToolCard } from "./ToolCard";

export function MessageRenderer({
  message,
  onAcceptProposal,
  onRejectProposal,
  onReviewProposal,
  workspaceRoot,
}: {
  message: ChatMessage;
  onAcceptProposal: (id: string) => void;
  onRejectProposal: (id: string) => void;
  onReviewProposal: (id: string) => void;
  workspaceRoot: string | null;
}) {
  if (message.role === "user") {
    const content = message.parts.find((part) => part.type === "text")?.content || "";
    return (
      <article className="chat-message" data-role="user">
        <div className="user-message-card">
          <div className="user-message-content">
            {message.contextFile ? (
              <div className="chat-context-chip">
                <FileText size={12} />
                <span>{shortName(message.contextFile)}</span>
              </div>
            ) : null}
            <p>{content}</p>
          </div>
          <button type="button" className="user-undo-btn">
            <Undo size={14} />
          </button>
        </div>
      </article>
    );
  }

  const activity = getAssistantActivity(message);

  return (
    <article className="chat-message" data-role="assistant">
      <div className="assistant-message-body">
        <div className="assistant-status-line" data-streaming={message.streaming ? "true" : "false"}>
          <span>{activity}</span>
        </div>
        <div className="assistant-content">
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <ReactMarkdown
                  key={`${message.id}-${index}`}
                  components={{
                    code(props) {
                      const { children, className } = props;
                      const language = /language-(\w+)/.exec(className || "")?.[1];
                      return (
                        <code className={className} data-language={language}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {part.content}
                </ReactMarkdown>
              );
            }
            if (part.type === "tool_call") return <ToolCard key={part.id} part={part} />;
            if (part.type === "file_proposal") {
              return (
                <DiffCard
                  key={part.id}
                  part={part}
                  workspaceRoot={workspaceRoot}
                  onAccept={onAcceptProposal}
                  onReject={onRejectProposal}
                  onReview={onReviewProposal}
                />
              );
            }
            return null;
          })}
          {message.streaming && message.parts.length === 0 ? (
            <div className="assistant-quiet-state">Thinking through the request...</div>
          ) : null}
        </div>
        {!message.streaming ? (
          <div className="assistant-actions-bottom">
            <button type="button" className="action-tiny-btn">
              <ExternalLink size={14} />
            </button>
            <button type="button" className="action-tiny-btn">
              <Copy size={14} />
            </button>
            <button type="button" className="action-tiny-btn">
              <ThumbsUp size={14} />
            </button>
            <button type="button" className="action-tiny-btn">
              <ThumbsDown size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function getAssistantActivity(message: ChatMessage) {
  if (!message.streaming) return "Completed";
  const toolCount = message.parts.filter((part) => part.type === "tool_call").length;
  const pendingTool = message.parts.find((part) => part.type === "tool_call" && part.status === "running");
  const fileCount = message.parts.filter((part) => part.type === "file_proposal").length;
  if (pendingTool?.type === "tool_call") return `Running ${formatToolName(pendingTool.name)}...`;
  if (fileCount && toolCount) return `Prepared ${fileCount} file change${fileCount === 1 ? "" : "s"}, ran ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
  if (fileCount) return `Prepared ${fileCount} file change${fileCount === 1 ? "" : "s"}`;
  if (toolCount) return `Ran ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
  const hasText = message.parts.some((part) => part.type === "text" && part.content.trim());
  return hasText ? "Writing..." : "Thinking...";
}

function formatToolName(name: string) {
  return name.replace(/_/g, " ");
}

function shortName(filePath: string) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}
