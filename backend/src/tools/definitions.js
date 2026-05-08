/**
 * TOOL DEFINITIONS
 * These are passed to the Anthropic API as the `tools` array.
 * Every tool the agent can call is defined here.
 */

const TOOL_DEFINITIONS = [
  // ─── FILESYSTEM ───────────────────────────────────────────────
  {
    name: "read_file",
    description:
      "Read the full contents of a file at the given path. Use this before editing any file. " +
      "Always read a file before modifying it.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or workspace-relative path to the file",
        },
        start_line: {
          type: "number",
          description: "Optional: first line to read (1-indexed). Use for large files.",
        },
        end_line: {
          type: "number",
          description: "Optional: last line to read (1-indexed, inclusive).",
        },
      },
      required: ["path"],
    },
  },

  {
    name: "write_file",
    description:
      "Write (create or fully overwrite) a file. Use for new files or when replacing entire content. " +
      "For targeted edits to existing files, prefer patch_file instead.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to write to",
        },
        content: {
          type: "string",
          description: "Full file content to write",
        },
      },
      required: ["path", "content"],
    },
  },

  {
    name: "patch_file",
    description:
      "Apply a targeted edit to an existing file by replacing a specific block of text. " +
      "Preferred over write_file for modifying existing files — less risk of data loss. " +
      "The old_str must exactly match what's currently in the file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to patch",
        },
        old_str: {
          type: "string",
          description:
            "The exact string currently in the file to be replaced. Must match exactly including whitespace.",
        },
        new_str: {
          type: "string",
          description: "The new string to replace it with",
        },
      },
      required: ["path", "old_str", "new_str"],
    },
  },

  {
    name: "delete_file",
    description:
      "Delete a file or directory. Only use when explicitly asked by the user. " +
      "Confirm with the user before deleting anything important.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to delete",
        },
        recursive: {
          type: "boolean",
          description: "Whether to recursively delete a directory. Default false.",
        },
      },
      required: ["path"],
    },
  },

  {
    name: "rename_file",
    description: "Rename or move a file or directory from one path to another.",
    input_schema: {
      type: "object",
      properties: {
        old_path: { type: "string", description: "Current path" },
        new_path: { type: "string", description: "New path / new name" },
      },
      required: ["old_path", "new_path"],
    },
  },

  {
    name: "list_directory",
    description:
      "List files and subdirectories at a given path. Use to explore the project structure " +
      "before diving into specific files. Respects .gitignore by default.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list. Defaults to workspace root.",
        },
        depth: {
          type: "number",
          description: "How many levels deep to recurse. Default 2, max 5.",
        },
        show_hidden: {
          type: "boolean",
          description: "Include hidden files/dirs (dotfiles). Default false.",
        },
      },
      required: [],
    },
  },

  // ─── SEARCH ───────────────────────────────────────────────────
  {
    name: "search_codebase",
    description:
      "Search for a string or regex pattern across all files in the workspace. " +
      "Returns matching file paths and the lines containing the match. " +
      "Great for finding where a function is defined, where an import is used, finding TODO comments, etc.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "String or regex pattern to search for",
        },
        file_pattern: {
          type: "string",
          description: "Glob to filter which files to search. E.g. '**/*.ts' or 'src/**/*.js'",
        },
        case_sensitive: {
          type: "boolean",
          description: "Case sensitive search. Default false.",
        },
        max_results: {
          type: "number",
          description: "Max number of results to return. Default 50.",
        },
      },
      required: ["pattern"],
    },
  },

  {
    name: "find_files",
    description:
      "Find files by name or glob pattern in the workspace. " +
      "Use when you know the filename but not where it lives.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern or filename to find. E.g. '*.config.js', 'package.json'",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description: "Patterns to exclude. E.g. ['node_modules', '.git', 'dist']",
        },
      },
      required: ["pattern"],
    },
  },

  // ─── TERMINAL ─────────────────────────────────────────────────
  {
    name: "run_command",
    description:
      "Run a shell command in the workspace terminal and return stdout, stderr, and exit code. " +
      "Use for: running tests, installing packages, building, linting, git operations, " +
      "reading package.json scripts, checking node/npm versions, etc. " +
      "Commands run from the workspace root unless cwd is specified. " +
      "WARNING: Do not run destructive commands without user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run",
        },
        cwd: {
          type: "string",
          description: "Working directory for the command. Defaults to workspace root.",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds. Default 30000 (30s). Max 120000 (2min).",
        },
      },
      required: ["command"],
    },
  },

  // ─── WEB ──────────────────────────────────────────────────────
  {
    name: "web_search",
    description:
      "Search the web for documentation, package info, error messages, or technical solutions. " +
      "Use when you need: library docs, npm package info, Stack Overflow answers, " +
      "MDN references, GitHub issues, or to look up an error message you've not seen before.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query. Be specific — include library names, versions, error text.",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "fetch_url",
    description:
      "Fetch the content of a specific URL. Use to read documentation pages, " +
      "GitHub READMEs, npm package pages, or any URL found from web_search.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch",
        },
      },
      required: ["url"],
    },
  },

  // ─── CODE INTELLIGENCE ────────────────────────────────────────
  {
    name: "get_diagnostics",
    description:
      "Get current linting errors, TypeScript errors, or other diagnostics for a file or the whole workspace. " +
      "Use before and after editing to verify your changes fix (not introduce) issues.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File to get diagnostics for. Omit to get workspace-wide diagnostics.",
        },
      },
      required: [],
    },
  },

  {
    name: "get_symbol_info",
    description:
      "Look up where a symbol (function, class, variable) is defined and where it's used. " +
      "Equivalent to 'Go to Definition' and 'Find All References' in an IDE.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The symbol name to look up",
        },
        file: {
          type: "string",
          description: "File context — helps disambiguate symbols with same name",
        },
      },
      required: ["symbol"],
    },
  },

  // ─── GIT ──────────────────────────────────────────────────────
  {
    name: "git_diff",
    description:
      "Get the current git diff to see what has changed since the last commit. " +
      "Use to review changes before summarizing work done.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional: limit diff to a specific file or directory",
        },
        staged: {
          type: "boolean",
          description: "Show staged diff instead of unstaged. Default false.",
        },
      },
      required: [],
    },
  },

  {
    name: "git_log",
    description: "Get recent git commit history.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of commits to show. Default 10.",
        },
        path: {
          type: "string",
          description: "Optional: limit to commits touching this file/directory",
        },
      },
      required: [],
    },
  },

  // ─── MEMORY / CONTEXT ─────────────────────────────────────────
  {
    name: "remember",
    description:
      "Store a piece of information about the project to recall later in this session. " +
      "Use for: project conventions, user preferences, architectural decisions, " +
      "key file locations you've already explored.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Short identifier for this memory",
        },
        value: {
          type: "string",
          description: "What to remember",
        },
      },
      required: ["key", "value"],
    },
  },

  {
    name: "recall",
    description: "Retrieve something previously stored with remember.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The key to retrieve. Omit to list all stored keys.",
        },
      },
      required: [],
    },
  },
];

module.exports = { TOOL_DEFINITIONS };
