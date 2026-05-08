import { Search } from "lucide-react";
import { useEffect, useState } from "react";

type SearchResult = { filePath: string; line: number; preview: string };

export function SearchPanel({
  workspaceRoot,
  onOpenFile,
}: {
  workspaceRoot: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const next = await window.codegrey?.workspace?.search?.(query, { include, maxResults: 500 });
    setResults(next ?? []);
    setSearching(false);
  };

  useEffect(() => {
    if (!workspaceRoot) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch();
    }, 220);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, include, workspaceRoot]);

  return (
    <div className="sidebar-tool-panel">
      <label className="sidebar-field">
        <span>Search</span>
        <div className="sidebar-input-with-icon">
          <Search size={14} />
          <input
            value={query}
            placeholder="Search files"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch();
            }}
            disabled={!workspaceRoot}
          />
        </div>
      </label>
      <label className="sidebar-field">
        <span>Files to include</span>
        <input
          value={include}
          placeholder="e.g. .tsx"
          onChange={(event) => setInclude(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
          disabled={!workspaceRoot}
        />
      </label>
      <div className="search-results">
        {searching ? <div className="sidebar-empty-note">Searching...</div> : null}
        {results.map((result, index) => (
          <button
            key={`${result.filePath}-${result.line}-${index}`}
            type="button"
            className="search-result"
            onClick={() => onOpenFile(result.filePath)}
            data-tooltip={result.filePath}
          >
            <strong>{relativeName(workspaceRoot, result.filePath)}</strong>
            <span>{result.line}: {result.preview}</span>
          </button>
        ))}
        {query && !searching && results.length === 0 ? <div className="sidebar-empty-note">No results</div> : null}
        {!query && !searching ? <div className="sidebar-empty-note">Start typing to search this workspace.</div> : null}
      </div>
    </div>
  );
}

function relativeName(root: string | null, filePath: string) {
  if (!root) return filePath;
  return filePath.replace(root, "").replace(/^[/\\]/, "");
}
