import { ChevronDown, ChevronRight, FilePlus, FolderPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getFileIcon } from "../../lib/utils";

type Entry = { name: string; path: string; isDir: boolean };

export function ExplorerTree({
  root,
  selectedFile,
  onSelectFile,
  onChanged,
  onRequestDelete,
}: {
  root: string;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onChanged?: () => void;
  onRequestDelete?: (entry: Entry, onDeleted: () => void | Promise<void>) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({ [root]: true }));
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [activeFolder, setActiveFolder] = useState(root);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null);
  const [draftEntry, setDraftEntry] = useState<{ path: string; parent: string; isDir: boolean } | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const loadRoot = async () => {
    const items = await window.codegrey?.workspace?.listDir?.(root);
    setChildren((prev) => ({ ...prev, [root]: items ?? [] }));
  };

  useEffect(() => {
    setExpanded({ [root]: true });
    setChildren({});
    setActiveFolder(root);
    setEditingPath(null);
    setDraftEntry(null);
    setContextMenu(null);
  }, [root]);

  useEffect(() => {
    if (!editingPath) return;
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [editingPath]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  useEffect(() => {
    void loadRoot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadRoot();
      Object.keys(expanded).forEach((path) => {
        if (expanded[path] && path !== root) {
          void window.codegrey?.workspace?.listDir?.(path).then((items) => {
            setChildren((prev) => ({ ...prev, [path]: items ?? [] }));
          });
        }
      });
    };
    window.addEventListener("codegrey:explorer-refresh", handleRefresh);
    return () => window.removeEventListener("codegrey:explorer-refresh", handleRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, expanded]);

  const dirname = (filePath: string) => {
    const index = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
    return index > -1 ? filePath.slice(0, index) : root;
  };

  const isSameOrInside = (folderPath: string, candidate: string) => {
    const folder = folderPath.replace(/[\\/]+$/, "");
    const target = candidate.replace(/[\\/]+$/, "");
    return target === folder || target.startsWith(`${folder}\\`) || target.startsWith(`${folder}/`);
  };

  const visibleCreateTarget = (folderPath: string) => {
    let current = folderPath || root;
    while (current !== root && !expanded[current]) {
      current = dirname(current);
    }
    return current || root;
  };

  const toggleDir = async (dirPath: string) => {
    const willOpen = !expanded[dirPath];
    setExpanded((prev) => ({ ...prev, [dirPath]: willOpen }));
    if (!willOpen) {
      setActiveFolder((current) => (isSameOrInside(dirPath, current) ? dirname(dirPath) : current));
    }
    if (willOpen && !children[dirPath]) {
      const items = await window.codegrey?.workspace?.listDir?.(dirPath);
      setChildren((prev) => ({ ...prev, [dirPath]: items ?? [] }));
    }
  };

  const activateEntry = (entry: Entry) => {
    setActiveFolder(entry.isDir ? entry.path : dirname(entry.path));
  };

  const refreshDir = async (dirPath: string) => {
    const items = await window.codegrey?.workspace?.listDir?.(dirPath);
    setChildren((prev) => ({ ...prev, [dirPath]: items ?? [] }));
  };

  const beginRename = (entry: Entry) => {
    setContextMenu(null);
    activateEntry(entry);
    setEditingPath(entry.path);
    setEditingValue(entry.name);
  };

  const deleteEntry = async (entry: Entry) => {
    setContextMenu(null);
    const doDelete = async () => {
      const result = await window.codegrey?.workspace?.deleteEntry?.(entry.path);
      if (!result?.ok) return;
      await refreshAll();
      onChanged?.();
    };

    if (onRequestDelete) {
      onRequestDelete(entry, doDelete);
    } else {
      await doDelete();
    }
  };

  const cancelDraft = async () => {
    if (!draftEntry || editingPath !== draftEntry.path) {
      setEditingPath(null);
      return;
    }
    await window.codegrey?.workspace?.deleteEntry?.(draftEntry.path);
    await refreshDir(draftEntry.parent);
    setEditingPath(null);
    setDraftEntry(null);
  };

  const uniqueDraftName = (parent: string, isDir: boolean) => {
    const base = isDir ? "New Folder" : "New File";
    const siblings = new Set((children[parent] ?? []).map((entry) => entry.name.toLowerCase()));
    if (!siblings.has(base.toLowerCase())) return base;
    for (let index = 2; index < 1000; index += 1) {
      const next = `${base} ${index}`;
      if (!siblings.has(next.toLowerCase())) return next;
    }
    return `${base} ${Date.now()}`;
  };

  const renderEntry = (entry: Entry, depth: number) => {
    const isOpen = Boolean(expanded[entry.path]);
    const isSelected = selectedFile === entry.path;
    const kids = children[entry.path] ?? [];
    const indent = 16 + depth * 16;

    const commitRename = async () => {
      if (!editingValue.trim() || editingValue.trim() === entry.name) {
        setEditingPath(null);
        setDraftEntry(null);
        return;
      }
      const result = await window.codegrey?.workspace?.renameEntry?.(entry.path, editingValue.trim());
      setEditingPath(null);
      setDraftEntry(null);
      if (result?.ok) {
        if (result.path) {
          if (entry.isDir && activeFolder === entry.path) {
            setActiveFolder(result.path);
          }
          if (!entry.isDir && selectedFile === entry.path) {
            onSelectFile(result.path);
          }
        }
        await refreshAll();
        onChanged?.();
      }
    };

    return (
      <div key={entry.path}>
        <div className="explorer-row" data-selected={isSelected}>
          <button
            type="button"
            className="explorer-row-main"
            data-active-folder={entry.isDir && activeFolder === entry.path ? "true" : "false"}
            style={{ paddingLeft: `${indent}px` }}
            draggable={!entry.isDir}
            onDragStart={(e) => {
              if (entry.isDir) return;
              e.dataTransfer.setData("text/plain", entry.path);
              e.dataTransfer.setData("application/x-codegrey-path", entry.path);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              if (editingPath === entry.path) return;
              activateEntry(entry);
              if (entry.isDir) void toggleDir(entry.path);
              else onSelectFile(entry.path);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              activateEntry(entry);
              setContextMenu({ x: event.clientX, y: event.clientY, entry });
            }}
          >
            <span className="explorer-caret" aria-hidden="true">
              {entry.isDir ? isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
            </span>
            {!entry.isDir ? <ExplorerFileIcon name={entry.name} /> : null}
            {editingPath === entry.path ? (
              <input
                ref={renameInputRef}
                className="explorer-rename-input"
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={() => void commitRename()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void commitRename();
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    void cancelDraft();
                  }
                }}
              />
            ) : (
              <span className="explorer-name">{entry.name}</span>
            )}
          </button>
        </div>
        {entry.isDir && isOpen ? kids.map((kid) => renderEntry(kid, depth + 1)) : null}
      </div>
    );
  };

  const rootEntries = useMemo(() => children[root] ?? [], [children, root]);
  const refreshAll = async () => {
    await loadRoot();
    await Promise.all(
      Object.keys(expanded)
        .filter((item) => expanded[item] && item !== root)
        .map(async (item) => {
          const items = await window.codegrey?.workspace?.listDir?.(item);
          setChildren((prev) => ({ ...prev, [item]: items ?? [] }));
        })
    );
  };

  const createEntry = async (isDir: boolean, parentOverride?: string) => {
    const parent = parentOverride || visibleCreateTarget(activeFolder);
    const name = uniqueDraftName(parent, isDir);
    const result = await window.codegrey?.workspace?.createEntry?.(parent, name, isDir);
    if (result?.ok) {
      setExpanded((prev) => ({ ...prev, [parent]: true }));
      await refreshDir(parent);
      setActiveFolder(parent);
      if (result.path) {
        setDraftEntry({ path: result.path, parent, isDir });
        setEditingPath(result.path);
        setEditingValue(name);
      }
      onChanged?.();
      if (!isDir && result.path) onSelectFile(result.path);
    }
  };

  return (
    <div className="explorer-panel">
      <div className="explorer-toolbar">
        <button type="button" data-tooltip="New file" onClick={() => void createEntry(false)}>
          <FilePlus size={14} />
        </button>
        <button type="button" data-tooltip="New folder" onClick={() => void createEntry(true)}>
          <FolderPlus size={14} />
        </button>
      </div>
      <div
        className="explorer-tree"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setActiveFolder(root);
            renameInputRef.current?.blur();
          }
        }}
      >
        {rootEntries.map((entry) => renderEntry(entry, 0))}
      </div>
      {contextMenu ? (
        <div
          className="explorer-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextMenu.entry.isDir ? (
            <>
              <button type="button" onClick={() => {
                setActiveFolder(contextMenu.entry.path);
                setContextMenu(null);
                void createEntry(false, contextMenu.entry.path);
              }}>
                <span className="seti-icon" style={{ fontSize: '14px' }}>{'\uE064'}</span>
                <span>New File</span>
              </button>
              <button type="button" onClick={() => {
                setActiveFolder(contextMenu.entry.path);
                setContextMenu(null);
                void createEntry(true, contextMenu.entry.path);
              }}>
                <span className="seti-icon" style={{ fontSize: '14px' }}>{'\uE032'}</span>
                <span>New Folder</span>
              </button>
              <div className="explorer-context-separator" />
            </>
          ) : null}
          <button type="button" onClick={() => beginRename(contextMenu.entry)}>
            <span className="seti-icon" style={{ fontSize: '14px' }}>{'\uE088'}</span>
            <span>Rename</span>
          </button>
          <button type="button" onClick={() => void deleteEntry(contextMenu.entry)}>
            <span className="seti-icon" style={{ fontSize: '14px' }}>{'\uE02B'}</span>
            <span>Delete</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ExplorerFileIcon({ name }: { name: string }) {
  const icon = getFileIcon(name) as { svg?: string; char?: string; color?: string };
  if (icon.svg) {
    return (
      <img
        src={icon.svg}
        alt=""
        style={{
          width: 14,
          height: 14,
          marginRight: 8,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span className="seti-icon" style={{ color: icon.color, marginRight: 8 }}>
      {icon.char}
    </span>
  );
}
