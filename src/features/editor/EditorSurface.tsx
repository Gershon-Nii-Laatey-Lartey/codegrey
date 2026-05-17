import Editor, { DiffEditor } from "@monaco-editor/react";
import React from "react";
import "./editor.css";

export type EditorSurfaceProps = {
  activeTab: string | null;
  workspaceRoot: string | null;
  chatTabId: string;
  browserTabId: string;
  
  // Rendering
  renderChat: () => React.ReactNode;
  renderBrowser: () => React.ReactNode;
  renderWelcome: () => React.ReactNode;
  
  // Editor State
  fileText: string;
  monacoLanguage: string;
  onEditorChange: (value: string | undefined) => void;
  onEditorMount: (editor: any, monaco: any) => void;
  
  // Diff Review
  reviewProposal: any | null;
  onAcceptProposal: (id: string) => void;
  onRejectProposal: (id: string) => void;
  inferLanguage: (path: string) => string;
};

export function EditorSurface(props: EditorSurfaceProps) {
  const {
    activeTab,
    workspaceRoot,
    chatTabId,
    browserTabId,
    renderChat,
    renderBrowser,
    renderWelcome,
    fileText,
    monacoLanguage,
    onEditorChange,
    onEditorMount,
    reviewProposal,
    onAcceptProposal,
    onRejectProposal,
    inferLanguage,
  } = props;

  if (activeTab === chatTabId) return <>{renderChat()}</>;
  if (activeTab === browserTabId) return <>{renderBrowser()}</>;
  if (!workspaceRoot || !activeTab) return <>{renderWelcome()}</>;

  if (reviewProposal && activeTab === reviewProposal.filePath) {
    return (
      <div className="editor-pane diff-review-pane">
        <div className="monaco-wrap" aria-label="AI proposed diff">
          <DiffEditor
            original={reviewProposal.oldContent}
            modified={reviewProposal.newContent}
            language={inferLanguage(reviewProposal.filePath)}
            theme="codegrey-dark"
            options={{
              readOnly: true,
              renderSideBySide: false,
              hideUnchangedRegions: { enabled: false },
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontSize: 12,
              lineHeight: 18,
              renderIndicators: false,
            }}
            onMount={onEditorMount}
          />

          <div className="diff-floating-actions" role="group" aria-label="Review proposed file changes">
            <button type="button" className="diff-floating-btn danger" onClick={() => onRejectProposal(reviewProposal.id)}>
              Reject
            </button>
            <button type="button" className="diff-floating-btn primary" onClick={() => onAcceptProposal(reviewProposal.id)}>
              Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-pane">
      <div className="monaco-wrap" aria-label="File editor">
        <Editor
          value={fileText}
          language={monacoLanguage}
          theme="codegrey-dark"
          options={{
            readOnly: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineHeight: 18,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            lineNumbers: "on",
            glyphMargin: true,
            folding: true,
            renderLineHighlight: "line",
            roundedSelection: true,
            automaticLayout: true,
            tabSize: 2,
          }}
          onChange={onEditorChange}
          onMount={onEditorMount}
        />
      </div>
    </div>
  );
}
