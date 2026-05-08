export const getFileIcon = (fileName: string, isDir?: boolean) => {
  if (isDir) return { svg: "/seti-icons/folder.svg", color: "#d4d7d6" };

  const lower = fileName.toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase();

  // Mapping based on files in public/seti-icons
  if (lower === "package.json" || lower === "package-lock.json") return { svg: "/seti-icons/npm.svg", color: "#cc3e44" };
  if (lower === "tsconfig.json") return { svg: "/seti-icons/tsconfig.svg", color: "#519aba" };
  if (lower === "vite.config.ts" || lower === "vite.config.js") return { svg: "/seti-icons/vite.svg", color: "#cbcb41" };
  if (lower === ".gitignore" || lower === ".gitconfig") return { svg: "/seti-icons/git_ignore.svg", color: "#41535b" };
  if (lower.includes("license")) return { svg: "/seti-icons/license.svg", color: "#cbcb41" };

  switch (ext) {
    case "js": case "mjs": case "cjs": return { svg: "/seti-icons/javascript.svg", color: "#cbcb41" };
    case "ts": case "mts": case "cts": return { svg: "/seti-icons/typescript.svg", color: "#519aba" };
    case "tsx": return { svg: "/seti-icons/react.svg", color: "#519aba" };
    case "jsx": return { svg: "/seti-icons/react.svg", color: "#cbcb41" };
    case "css": return { svg: "/seti-icons/css.svg", color: "#519aba" };
    case "scss": return { svg: "/seti-icons/sass.svg", color: "#f55385" };
    case "html": return { svg: "/seti-icons/html.svg", color: "#519aba" };
    case "json": return { svg: "/seti-icons/json.svg", color: "#cbcb41" };
    case "md": return { svg: "/seti-icons/markdown.svg", color: "#519aba" };
    case "py": return { svg: "/seti-icons/python.svg", color: "#cbcb41" };
    case "rs": return { svg: "/seti-icons/rust.svg", color: "#d4d7d6" };
    case "go": return { svg: "/seti-icons/go.svg", color: "#519aba" };
    case "php": return { svg: "/seti-icons/php.svg", color: "#a074c4" };
    case "svg": return { svg: "/seti-icons/svg.svg", color: "#cbcb41" };
    default: return { svg: "/seti-icons/default.svg", color: "#d4d7d6" };
  }
};

export function getRelativePath(root: string, fullPath: string) {
  if (!root) return fullPath;
  const r = root.replace(/[/\\]+$/, '');
  if (fullPath.startsWith(r)) {
    let rel = fullPath.slice(r.length);
    if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.slice(1);
    return rel;
  }
}

export function getBaseName(filePath: string) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}
