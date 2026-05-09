import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { createPatch } from "diff";
import { useState } from "react";
import type { ChatMessagePart } from "../../types/ai";
import { getFileIcon, getRelativePath, getBaseName } from "../../lib/utils";

type ProposalPart = Extract<ChatMessagePart, { type: "file_proposal" }>;

export function DiffCard({
  part,
  workspaceRoot,
  onAccept,
  onReject,
  onReview,
}: {
  part: ProposalPart;
  workspaceRoot: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onReview: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"collapsed" | "peek" | "expanded">("peek");

  const patch = createPatch(part.filePath, part.oldContent, part.newContent, "", "");
  const lines = patch.split("\n")
    .filter((line) => !line.startsWith("\\ No newline") && !line.startsWith("Index:"));

  // Calculate stats
  let added = 0;
  let removed = 0;
  lines.forEach(line => {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  });

  const relativePath = workspaceRoot ? getRelativePath(workspaceRoot, part.filePath) : part.filePath;
  const fileName = getBaseName(part.filePath);
  const icon = getFileIcon(fileName) as { svg?: string; char?: string; color?: string };

  const toggleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMode === "collapsed") setViewMode("peek");
    else if (viewMode === "peek") setViewMode("expanded");
    else setViewMode("collapsed");
  };

  return (
    <div className="diff-card" data-status={part.status} data-view={viewMode}>
      <div className="diff-card-header" onClick={() => onReview(part.id)}>
        <div className="diff-card-header-left">
          {icon.svg ? (
            <img src={icon.svg} alt="" style={{ width: 14, height: 14, marginRight: '4px' }} />
          ) : (
            <span
              className="seti-icon"
              style={{ color: icon.color || 'inherit', fontSize: '14px', marginRight: '4px' }}
            >
              {icon.char}
            </span>
          )}
          <span className="diff-file-path">{relativePath}</span>
        </div>
        <div className="diff-card-header-right">
          {viewMode === "collapsed" && part.status === "pending" && (
            <div className="diff-header-actions">
              <button type="button" className="diff-btn-apply-tiny" onClick={(e) => { e.stopPropagation(); onAccept(part.id); }}>
                Apply
              </button>
            </div>
          )}
          <div className="diff-stats">
            <span className="diff-stat-add">+{added}</span>
            <span className="diff-stat-del">-{removed}</span>
          </div>
          <button className="diff-view-toggle" onClick={toggleView}>
            {viewMode === "collapsed" ? <ChevronDown size={14} /> : 
             viewMode === "peek" ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
        </div>
      </div>
      
      {viewMode !== "collapsed" && (
        <>
          <div className="diff-content-wrapper" style={{ maxHeight: viewMode === "peek" ? '120px' : 'none' }}>
            <pre className="diff-lines">
              {(() => {
                let oldLine = 0;
                let newLine = 0;
                
                return lines.slice(4).map((line, index) => {
                  const isAdded = line.startsWith("+");
                  const isRemoved = line.startsWith("-");
                  const isHunk = line.startsWith("@@");
                  
                  if (isHunk) {
                    const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
                    if (match) {
                      oldLine = parseInt(match[1], 10);
                      newLine = parseInt(match[2], 10);
                    }
                    return (
                      <div key={index} className="diff-line-row hunk">
                        <span className="diff-line-number hunk"></span>
                        <span className="diff-line-prefix">{line[0]}</span>
                        <span className="diff-line-text">{line.slice(1)}</span>
                      </div>
                    );
                  }

                  const displayOld = isAdded ? "" : oldLine++;
                  const displayNew = isRemoved ? "" : newLine++;

                  return (
                    <div
                      key={index}
                      className={`diff-line-row ${isAdded ? "added" : isRemoved ? "removed" : ""}`}
                    >
                      <span className="diff-line-number">{displayOld}</span>
                      <span className="diff-line-number">{displayNew}</span>
                      <span className="diff-line-prefix">{line[0] || " "}</span>
                      <span className="diff-line-text">{line.slice(1) || " "}</span>
                    </div>
                  );
                });
              })()}
            </pre>
          </div>

          {part.error ? <div className="diff-error-box">{part.error}</div> : null}
          
          {part.status === "pending" && (
            <div className="diff-card-actions">
              <button type="button" className="diff-btn-reject" onClick={() => onReject(part.id)}>
                Reject
              </button>
              <button type="button" className="diff-btn-apply" onClick={() => onAccept(part.id)}>
                Apply
              </button>
            </div>
          )}
          
          {part.status !== "pending" && (
            <div className="diff-status-banner" data-status={part.status}>
              {part.status === "accepted" ? "Changes Applied" : "Changes Rejected"}
            </div>
          )}
        </>
      )}
    </div>
  );
}
