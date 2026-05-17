import {
  ArrowUp,
  AtSign,
  CornerDownRight,
  Mic,
  Paperclip,
  Plug,
  Search,
  Square,
  X,
} from "lucide-react";
import { useRef, useEffect } from "react";
import { ModelSelector } from "./ModelSelector";
import "./chat.css";
import type { AiMode, AiSettings, ModelCatalogItem } from "../../types/ai";

export type ComposerProps = {
  value: string;
  setValue: (val: string) => void;
  placeholder?: string;
  agentRunning: boolean;
  onSend: () => void;
  onAbort: () => void;
  placement: "float" | "panel";
  continuePromptVisible?: boolean;
  openChatTab: () => void;
  
  // Attachments
  attachedImages: Array<{ name: string; dataUrl: string; base64: string; mimeType: string }>;
  onRemoveImage: (index: number) => void;
  onAttachImage: () => void;
  
  // Context
  workspaceRoot: string | null;
  attachedContextFiles: string[];
  onRemoveContext: (path: string) => void;
  onAddContextFile: (path: string) => void;
  contextPickerOpen: boolean;
  setContextPickerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  contextPickerRef: any;
  contextQuery: string;
  setContextQuery: (q: string) => void;
  contextSearching: boolean;
  contextSuggestions: Array<{ filePath: string; isDir?: boolean }>;
  contextActiveFile: string | null;
  contextOpenTabs: string[];
  
  // Model Selector
  aiMode: AiMode;
  setAiMode: (mode: AiMode) => void;
  isDragOver?: boolean;
  setIsDragOver?: (over: boolean) => void;
  handleComposerDrop?: (e: React.DragEvent) => void;
  activePlanModelId: string;
  setPlanModelId: (id: string) => void;
  availablePlanModels: ModelCatalogItem[];
  aiSettings: AiSettings;
  onOpenAccounts?: () => void;
  
  // Helpers
  getFileIcon: (name: string, isDir?: boolean) => { svg?: string; char?: string; color?: string };
  shortName: (path: string) => string;
  relativeToWorkspace: (root: string | null, path: string) => string;

  // Pending Changes & Tray
  pendingProposals: any[];
  onReviewProposal: (id: string, filePath: string) => void;
  onAcceptAllProposals?: () => void;
  onOpenMcpSettings?: () => void;
  logoBase: string;
};

export function Composer(props: ComposerProps) {
  const {
    value,
    setValue,
    agentRunning,
    onSend,
    onAbort,
    placement,
    continuePromptVisible,
    openChatTab,
    attachedImages,
    onRemoveImage,
    onAttachImage,
    workspaceRoot,
    attachedContextFiles,
    onRemoveContext,
    onAddContextFile,
    contextPickerOpen,
    setContextPickerOpen,
    contextPickerRef,
    contextQuery,
    setContextQuery,
    contextSearching,
    contextSuggestions,
    contextActiveFile,
    contextOpenTabs,
    aiMode,
    setAiMode,
    isDragOver,
    setIsDragOver,
    handleComposerDrop,
    activePlanModelId,
    setPlanModelId,
    availablePlanModels,
    aiSettings,
    onOpenAccounts,
    getFileIcon,
    shortName,
    relativeToWorkspace,
    pendingProposals,
    onReviewProposal,
    onAcceptAllProposals,
    onOpenMcpSettings,
    logoBase,
  } = props;

  const taRef = useRef<HTMLTextAreaElement>(null);
  const s = placement === "panel" ? 14 : 16;
  const ts = placement === "panel" ? 12 : 14;

  const placeholder = agentRunning
    ? "Agent is working..."
    : placement === "panel"
      ? "Ask anything..."
      : "Ask me to build a feature, debug a problem, or explain your code...";

  // Auto-resize textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      const height = Math.min(taRef.current.scrollHeight, 240);
      taRef.current.style.height = `${height}px`;
    }
  }, [value]);

  return (
    <div
      className="chat-input-wrapper"
      data-placement={placement}
      data-drag-over={isDragOver}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver?.(true);
      }}
      onDragLeave={() => setIsDragOver?.(false)}
      onDrop={handleComposerDrop}
    >
      {placement === "float" && continuePromptVisible && (
        <div className="chat-input-header-pill">
          <button
            className="continue-chat-pill-attached"
            type="button"
            onClick={openChatTab}
          >
            <CornerDownRight size={12} />
            <span>Continue in Chat</span>
          </button>
        </div>
      )}
      
      <div className="chat-input-card">
        <div className="chat-input-main">
          {(attachedImages.length > 0 || attachedContextFiles.length > 0) && (
            <div className="attach-preview-strip">
              {attachedImages.map((img, i) => (
                <div key={i} className="attach-preview-chip attach-preview-image">
                  <img src={img.dataUrl} alt={img.name} className="attach-thumb" />
                  <button type="button" className="attach-chip-remove" onClick={() => onRemoveImage(i)}>
                    <X size={10} />
                  </button>
                </div>
              ))}
              {attachedContextFiles.map((p) => {
                const name = shortName(p);
                const icon = getFileIcon(name);
                return (
                  <div key={p} className="attach-preview-chip attach-preview-file">
                    <div className="attach-chip-icon">
                      {icon.svg ? (
                        <img src={icon.svg} alt="" />
                      ) : (
                        <span className="seti-icon" style={{ color: icon.color }}>
                          {icon.char}
                        </span>
                      )}
                    </div>
                    <span className="attach-chip-name">{name}</span>
                    <button type="button" className="attach-chip-remove" onClick={() => onRemoveContext(p)} aria-label={`Remove ${name}`}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="chat-input-top">
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              rows={1}
              className="chat-textarea"
              disabled={agentRunning}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!agentRunning) onSend();
                }
              }}
            />
          </div>
          
          <div className="chat-input-actions-row">
            <div className="action-group">
              <button className="icon-btn" data-tooltip="Attach Image" type="button" onClick={onAttachImage}>
                <Paperclip size={s} />
              </button>
              
              <div className="context-attach-control" ref={contextPickerRef}>
                <button
                  className="icon-btn"
                  data-tooltip="Attach Context"
                  type="button"
                  onClick={() => setContextPickerOpen((open) => !open)}
                  disabled={!workspaceRoot}
                >
                  <AtSign size={s} />
                </button>
                
                {contextPickerOpen && (
                  <div className="context-picker" role="dialog" aria-label="Attach context">
                    <div className="context-picker-search">
                      <Search size={14} />
                      <input
                        autoFocus
                        value={contextQuery}
                        placeholder="Search files..."
                        onChange={(event) => setContextQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setContextPickerOpen(false);
                        }}
                      />
                    </div>
                    <div className="context-picker-list">
                      {!contextQuery.trim() && contextActiveFile && (
                        <div className="context-picker-group-label">Active file</div>
                      )}
                      {!contextQuery.trim() && contextActiveFile && (
                        <button
                          type="button"
                          className="context-picker-item"
                          onClick={() => onAddContextFile(contextActiveFile!)}
                          disabled={attachedContextFiles.includes(contextActiveFile)}
                        >
                          <div className="context-picker-item-icon">
                            {getFileIcon(shortName(contextActiveFile)).svg ? (
                              <img src={getFileIcon(shortName(contextActiveFile)).svg} alt="" />
                            ) : (
                              <span className="seti-icon" style={{ color: getFileIcon(shortName(contextActiveFile)).color }}>
                                {getFileIcon(shortName(contextActiveFile)).char}
                              </span>
                            )}
                          </div>
                          <div className="context-picker-item-content">
                            <strong>{shortName(contextActiveFile)}</strong>
                            <small>{relativeToWorkspace(workspaceRoot, contextActiveFile)}</small>
                          </div>
                        </button>
                      )}

                      {!contextQuery.trim() && contextOpenTabs.length > 0 && (
                        <div className="context-picker-group-label">Open tabs</div>
                      )}
                      {!contextQuery.trim() && contextOpenTabs
                        .filter((filePath) => filePath !== contextActiveFile)
                        .map((filePath) => (
                          <button
                            type="button"
                            key={filePath}
                            className="context-picker-item"
                            onClick={() => onAddContextFile(filePath)}
                            disabled={attachedContextFiles.includes(filePath)}
                          >
                            <div className="context-picker-item-icon">
                              {getFileIcon(shortName(filePath)).svg ? (
                                <img src={getFileIcon(shortName(filePath)).svg} alt="" />
                              ) : (
                                <span className="seti-icon" style={{ color: getFileIcon(shortName(filePath)).color }}>
                                  {getFileIcon(shortName(filePath)).char}
                                </span>
                              )}
                            </div>
                            <div className="context-picker-item-content">
                              <strong>{shortName(filePath)}</strong>
                              <small>{relativeToWorkspace(workspaceRoot, filePath)}</small>
                            </div>
                          </button>
                        ))}

                      {contextQuery.trim() && (
                        <div className="context-picker-group-label">{contextSearching ? "Searching..." : "Search results"}</div>
                      )}
                      {contextQuery.trim() && !contextSearching && contextSuggestions.length === 0 && (
                        <div className="context-picker-empty">No matching files</div>
                      )}
                      {contextQuery.trim() && contextSuggestions.map((item) => (
                        <button
                          type="button"
                          key={item.filePath}
                          className="context-picker-item"
                          onClick={() => onAddContextFile(item.filePath)}
                          disabled={attachedContextFiles.includes(item.filePath)}
                        >
                          <div className="context-picker-item-icon">
                            {getFileIcon(shortName(item.filePath), item.isDir).svg ? (
                              <img src={getFileIcon(shortName(item.filePath), item.isDir).svg} alt="" />
                            ) : (
                              <span className="seti-icon" style={{ color: getFileIcon(shortName(item.filePath), item.isDir).color }}>
                                {getFileIcon(shortName(item.filePath), item.isDir).char}
                              </span>
                            )}
                          </div>
                          <div className="context-picker-item-content">
                            <strong>{shortName(item.filePath)}</strong>
                            <small>{relativeToWorkspace(workspaceRoot, item.filePath)}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <ModelSelector
                mode={aiMode}
                planModelId={activePlanModelId}
                byokLabel={`${aiSettings.providerId} / ${aiSettings.model || "model"}`}
                models={availablePlanModels}
                disabled={agentRunning}
                onModeChange={setAiMode}
                onPlanModelChange={setPlanModelId}
                onOpenSettings={onOpenAccounts}
              />
            </div>
            
            <div className="action-group">
              <button className="icon-btn" data-tooltip="Voice Input" type="button">
                <Mic size={s} />
              </button>
              <button
                className="submit-btn"
                data-running={agentRunning ? "true" : "false"}
                disabled={!agentRunning && !value.trim()}
                type="button"
                aria-label={agentRunning ? "Stop agent" : "Send message"}
                onClick={() => (agentRunning ? onAbort() : onSend())}
              >
                {agentRunning ? <Square size={Math.max(10, s - 4)} fill="currentColor" /> : <ArrowUp size={s} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pendingProposals.length > 0 ? (
        <div className="chat-tray pending-changes-tray">
          <div className="pending-file-chips">
            {pendingProposals.map((proposal) => (
              <button
                key={proposal.id}
                className="pending-file-chip"
                type="button"
                onClick={() => onReviewProposal(proposal.id, proposal.filePath)}
              >
                <span className="pending-file-name">{shortName(proposal.filePath)}</span>
                {proposal.stats && (
                  <span className="pending-file-stats">
                    <span className="stat-add">+{proposal.stats.added}</span>
                    <span className="stat-del">-{proposal.stats.removed}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          {onAcceptAllProposals && (
            <button className="accept-all-btn" type="button" onClick={onAcceptAllProposals}>
              Accept all
            </button>
          )}
        </div>
      ) : (
        <div className="chat-tray">
          <button className="tray-btn" type="button" onClick={onOpenMcpSettings}>
            <Plug size={ts} />
            <span>Connect your tools</span>
          </button>

          <div className="tray-right">
            <div className="mcp-icons" onClick={onOpenMcpSettings} style={{ cursor: "pointer" }}>
              <div className="mcp-icon" style={{ zIndex: 5 }}>
                <img src={`${logoBase}/supabase.svg`} alt="Supabase" style={{ width: ts, height: ts }} />
              </div>
              <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 4 }}>
                <img src={`${logoBase}/slack.svg`} alt="Slack" style={{ width: ts, height: ts }} />
              </div>
              <div className="mcp-icon" style={{ marginLeft: "-6px", zIndex: 3 }}>
                <img src={`${logoBase}/cloudflare.svg`} alt="Cloudflare" style={{ width: ts, height: ts }} />
              </div>
            </div>
            <button className="tray-icon-btn" type="button" aria-label="Dismiss">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
