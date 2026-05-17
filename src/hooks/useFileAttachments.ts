import { useState, useRef } from "react";

export function useFileAttachments() {
  const [attachedImages, setAttachedImages] = useState<Array<{ name: string; dataUrl: string; base64: string; mimeType: string }>>([]);
  const [attachedContextFiles, setAttachedContextFiles] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const processImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        setAttachedImages((prev) => [
          ...prev,
          { name: file.name, dataUrl, base64, mimeType: file.type },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const processDroppedPaths = async (paths: string[]) => {
    for (const p of paths) {
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
      if (imageExts.includes(ext)) {
        const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
        const mimeType = mimeMap[ext] || "image/png";
        try {
          const result = await (window as any).codegrey?.workspace?.readFileBinary?.(p);
          if (result?.base64) {
            const dataUrl = `data:${mimeType};base64,${result.base64}`;
            setAttachedImages((prev) => [
              ...prev,
              { name: p.split(/[\/]/).pop() || p, dataUrl, base64: result.base64, mimeType },
            ]);
          }
        } catch (_) {}
      } else {
        setAttachedContextFiles((prev) => prev.includes(p) ? prev : [...prev, p]);
      }
    }
  };

  const handleComposerDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }

    const pathData = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/x-codegrey-path");
    if (pathData) {
      await processDroppedPaths(pathData.split("\n").map((p) => p.trim()).filter(Boolean));
    }
  };

  const removeImage = (idx: number) => setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  const removeContext = (path: string) => setAttachedContextFiles((prev) => prev.filter((p) => p !== path));

  return {
    attachedImages,
    setAttachedImages,
    attachedContextFiles,
    setAttachedContextFiles,
    isDragOver,
    setIsDragOver,
    imageInputRef,
    processImageFiles,
    processDroppedPaths,
    handleComposerDrop,
    removeImage,
    removeContext,
  };
}
