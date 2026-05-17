import { useState, useEffect, useRef } from "react";

export function useFileEditor(activeTab: string | null, CHAT_TAB_ID: string, BROWSER_TAB_ID: string) {
  const [fileText, setFileText] = useState<string>("");
  const [monacoLanguage, setMonacoLanguage] = useState<string>("plaintext");
  const editorSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeTab || activeTab === CHAT_TAB_ID || activeTab === BROWSER_TAB_ID) {
        setFileText("");
        setMonacoLanguage("plaintext");
        return;
      }

      const text = await window.codegrey?.workspace?.readFile?.(activeTab);
      if (cancelled) return;
      setFileText(text ?? "");
      setMonacoLanguage(inferLanguage(activeTab));
    };
    load();
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleEditorChange = (nextValue?: string) => {
    const nextText = nextValue ?? "";
    setFileText(nextText);
    if (!activeTab || activeTab === CHAT_TAB_ID || activeTab === BROWSER_TAB_ID) return;
    if (editorSaveTimerRef.current) window.clearTimeout(editorSaveTimerRef.current);
    editorSaveTimerRef.current = window.setTimeout(() => {
      void window.codegrey?.workspace?.writeFile?.(activeTab, nextText);
    }, 350);
  };

  return {
    fileText,
    setFileText,
    monacoLanguage,
    setMonacoLanguage,
    handleEditorChange,
    inferLanguage,
  };
}

function inferLanguage(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".toml")) return "toml";
  return "plaintext";
}
