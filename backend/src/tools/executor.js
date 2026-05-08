/**
 * TOOL EXECUTOR
 * When the AI calls a tool, this module handles it.
 * Each function maps to a tool defined in definitions.js.
 */

const fs = require("fs").promises;
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const fetch = require("node-fetch");

const execAsync = promisify(exec);

// In-memory session store for the "remember" tool
const sessionMemory = new Map();

class ToolExecutor {
  constructor({ workspaceRoot, allowDestructive = false, agentMode = "propose" }) {
    this.workspaceRoot = workspaceRoot;
    this.allowDestructive = allowDestructive;
    this.agentMode = agentMode;
  }

  // Resolve path safely within workspace
  resolvePath(filePath) {
    const resolved = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(this.workspaceRoot, filePath);
    const root = path.resolve(this.workspaceRoot);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path outside workspace: ${filePath}`);
    }
    return resolved;
  }

  // ─── FILESYSTEM ────────────────────────────────────────────────

  async read_file({ path: filePath, start_line, end_line }) {
    const resolved = this.resolvePath(filePath);
    const content = await fs.readFile(resolved, "utf-8");
    const lines = content.split("\n");

    if (start_line || end_line) {
      const start = (start_line || 1) - 1;
      const end = end_line || lines.length;
      const slice = lines.slice(start, end);
      return {
        path: filePath,
        content: slice.join("\n"),
        total_lines: lines.length,
        shown_lines: `${start + 1}-${Math.min(end, lines.length)}`,
      };
    }

    return {
      path: filePath,
      content,
      total_lines: lines.length,
    };
  }

  async write_file({ path: filePath, content }) {
    const resolved = this.resolvePath(filePath);
    const oldContent = await readIfExists(resolved);
    if (this.agentMode === "propose") {
      return {
        __type: "file_change_proposed",
        filePath: resolved,
        oldContent,
        newContent: content,
      };
    }
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    const lines = content.split("\n").length;
    return {
      __type: "file_change_proposed",
      filePath: resolved,
      oldContent,
      newContent: content,
      autoApplied: true,
      success: true,
      path: filePath,
      lines_written: lines,
    };
  }

  async patch_file({ path: filePath, old_str, new_str }) {
    const resolved = this.resolvePath(filePath);
    const content = await fs.readFile(resolved, "utf-8");

    if (!content.includes(old_str)) {
      throw new Error(
        `patch_file failed: old_str not found in ${filePath}. ` +
        `Make sure it matches exactly (including whitespace and newlines). ` +
        `Re-read the file first if needed.`
      );
    }

    const count = (content.match(new RegExp(escapeRegex(old_str), "g")) || []).length;
    if (count > 1) {
      throw new Error(
        `patch_file failed: old_str matches ${count} times in ${filePath}. ` +
        `Make the search string more specific so it matches exactly once.`
      );
    }

    const patched = content.replace(old_str, new_str);
    if (this.agentMode === "propose") {
      return {
        __type: "file_change_proposed",
        filePath: resolved,
        oldContent: content,
        newContent: patched,
      };
    }
    await fs.writeFile(resolved, patched, "utf-8");

    return {
      __type: "file_change_proposed",
      filePath: resolved,
      oldContent: content,
      newContent: patched,
      autoApplied: true,
      success: true,
      path: filePath,
      replaced: true,
      lines_before: content.split("\n").length,
      lines_after: patched.split("\n").length,
    };
  }

  async delete_file({ path: filePath, recursive = false }) {
    const resolved = this.resolvePath(filePath);
    if (!this.allowDestructive) {
      return {
        blocked: true,
        message:
          "Delete operation requires explicit user confirmation. " +
          "Please confirm you want to delete: " + filePath,
      };
    }
    await fs.rm(resolved, { recursive, force: true });
    return { success: true, deleted: filePath };
  }

  async rename_file({ old_path, new_path }) {
    const resolvedOld = this.resolvePath(old_path);
    const resolvedNew = this.resolvePath(new_path);
    await fs.mkdir(path.dirname(resolvedNew), { recursive: true });
    await fs.rename(resolvedOld, resolvedNew);
    return { success: true, moved: `${old_path} → ${new_path}` };
  }

  async list_directory({ path: dirPath = ".", depth = 2, show_hidden = false }) {
    const resolved = this.resolvePath(dirPath);
    const tree = await buildTree(resolved, depth, show_hidden, this.workspaceRoot);
    return { path: dirPath, tree };
  }

  // ─── SEARCH ────────────────────────────────────────────────────

  async search_codebase({
    pattern,
    file_pattern = "**/*",
    case_sensitive = false,
    max_results = 50,
  }) {
    const flags = case_sensitive ? "" : "-i";
    const include = file_pattern !== "**/*" ? `--include="${file_pattern}"` : "";
    const excludes = '--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build';
    
    const cmd = `grep -rn ${flags} ${excludes} ${include} "${pattern.replace(/"/g, '\\"')}" "${this.workspaceRoot}" 2>/dev/null | head -${max_results}`;
    
    try {
      const { stdout } = await execAsync(cmd, { cwd: this.workspaceRoot });
      const lines = stdout.trim().split("\n").filter(Boolean);
      
      const results = lines.map((line) => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (!match) return { raw: line };
        const [, file, lineNum, text] = match;
        return {
          file: path.relative(this.workspaceRoot, file),
          line: parseInt(lineNum),
          text: text.trim(),
        };
      });

      return { pattern, total: results.length, results };
    } catch {
      return { pattern, total: 0, results: [] };
    }
  }

  async find_files({ pattern, exclude = ["node_modules", ".git", "dist", ".next", "build"] }) {
    const excludeArgs = exclude.map((e) => `--exclude-dir="${e}"`).join(" ");
    // Use find command
    const excludeFindArgs = exclude.map((e) => `-not -path "*/${e}/*"`).join(" ");
    const cmd = `find "${this.workspaceRoot}" ${excludeFindArgs} -name "${pattern}" 2>/dev/null | head -100`;
    
    try {
      const { stdout } = await execAsync(cmd);
      const files = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => path.relative(this.workspaceRoot, f));
      return { pattern, total: files.length, files };
    } catch {
      return { pattern, total: 0, files: [] };
    }
  }

  // ─── TERMINAL ──────────────────────────────────────────────────

  async run_command({ command, cwd, timeout = 30000 }) {
    // Safety checks
    const DESTRUCTIVE_PATTERNS = [
      /rm\s+-rf\s+[^.]/,
      /DROP\s+TABLE/i,
      /DROP\s+DATABASE/i,
      /:\s*>\s*\/dev/,
      /mkfs/,
      /dd\s+if=/,
      /chmod\s+777\s+\//,
    ];

    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command) && !this.allowDestructive) {
        return {
          blocked: true,
          command,
          message:
            "This command looks potentially destructive. " +
            "Please confirm you want to run: " + command,
        };
      }
    }

    const workDir = cwd ? this.resolvePath(cwd) : this.workspaceRoot;
    const effectiveTimeout = Math.min(timeout, 120000);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        timeout: effectiveTimeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      return {
        command,
        exit_code: 0,
        stdout: stdout || "",
        stderr: stderr || "",
        cwd: workDir,
      };
    } catch (err) {
      return {
        command,
        exit_code: err.code || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        cwd: workDir,
        error: err.message,
      };
    }
  }

  // ─── WEB ────────────────────────────────────────────────────────

  async web_search({ query }) {
    // Use DuckDuckGo instant answers API (or plug in SerpAPI/Brave/Tavily)
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_redirect=1&no_html=1`;
    
    try {
      const res = await fetch(url, { timeout: 10000 });
      const data = await res.json();
      
      return {
        query,
        abstract: data.AbstractText || null,
        abstract_source: data.AbstractSource || null,
        abstract_url: data.AbstractURL || null,
        results: (data.RelatedTopics || []).slice(0, 8).map((t) => ({
          title: t.Text || t.Name,
          url: t.FirstURL || t.Topics?.[0]?.FirstURL,
        })),
        note: "For full search results, use fetch_url on specific URLs or integrate a search API (Brave, SerpAPI, Tavily).",
      };
    } catch (err) {
      return { query, error: err.message, note: "Search failed. Try fetch_url directly." };
    }
  }

  async fetch_url({ url }) {
    try {
      const res = await fetch(url, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AI-IDE-Agent/1.0)",
        },
      });
      const contentType = res.headers.get("content-type") || "";
      let body;

      if (contentType.includes("json")) {
        body = JSON.stringify(await res.json(), null, 2);
      } else {
        body = await res.text();
        // Strip HTML tags for readability
        body = body
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim()
          .slice(0, 20000); // Limit to 20k chars
      }

      return { url, status: res.status, content_type: contentType, content: body };
    } catch (err) {
      return { url, error: err.message };
    }
  }

  // ─── CODE INTELLIGENCE ─────────────────────────────────────────

  async get_diagnostics({ path: filePath }) {
    // Try TypeScript compiler if tsconfig exists
    const hasTsConfig = await fileExists(path.join(this.workspaceRoot, "tsconfig.json"));
    
    if (hasTsConfig) {
      const target = filePath ? `"${this.resolvePath(filePath)}"` : "--noEmit";
      try {
        const { stdout, stderr } = await execAsync(
          `npx tsc --noEmit 2>&1 | head -50`,
          { cwd: this.workspaceRoot, timeout: 30000 }
        );
        return { type: "typescript", output: stdout || stderr };
      } catch (err) {
        return { type: "typescript", output: err.stdout || err.stderr };
      }
    }

    // Fall back to ESLint
    const hasEslint = await fileExists(path.join(this.workspaceRoot, ".eslintrc.js")) ||
                      await fileExists(path.join(this.workspaceRoot, ".eslintrc.json")) ||
                      await fileExists(path.join(this.workspaceRoot, "eslint.config.js"));

    if (hasEslint) {
      const target = filePath ? `"${this.resolvePath(filePath)}"` : ".";
      try {
        const { stdout, stderr } = await execAsync(
          `npx eslint ${target} --max-warnings=50 2>&1 | head -80`,
          { cwd: this.workspaceRoot, timeout: 20000 }
        );
        return { type: "eslint", output: stdout || stderr };
      } catch (err) {
        return { type: "eslint", output: err.stdout || err.stderr };
      }
    }

    return { type: "none", message: "No TypeScript or ESLint config found." };
  }

  async get_symbol_info({ symbol, file }) {
    // Search for definition
    const defResult = await this.search_codebase({
      pattern: `(function|const|let|var|class|def|type|interface)\\s+${symbol}\\b`,
      max_results: 10,
    });

    // Search for usages
    const useResult = await this.search_codebase({
      pattern: `\\b${symbol}\\b`,
      max_results: 30,
    });

    return {
      symbol,
      definitions: defResult.results,
      usages: useResult.results,
    };
  }

  // ─── GIT ────────────────────────────────────────────────────────

  async git_diff({ path: filePath, staged = false } = {}) {
    const stagedFlag = staged ? "--staged" : "";
    const target = filePath ? `-- "${this.resolvePath(filePath)}"` : "";
    const cmd = `git diff ${stagedFlag} ${target}`;
    
    try {
      const { stdout } = await execAsync(cmd, { cwd: this.workspaceRoot });
      return { diff: stdout || "(no changes)", staged };
    } catch (err) {
      return { error: err.message };
    }
  }

  async git_log({ limit = 10, path: filePath } = {}) {
    const target = filePath ? `-- "${this.resolvePath(filePath)}"` : "";
    const cmd = `git log --oneline -${limit} ${target}`;
    
    try {
      const { stdout } = await execAsync(cmd, { cwd: this.workspaceRoot });
      const commits = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, ...rest] = line.split(" ");
          return { hash, message: rest.join(" ") };
        });
      return { commits };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ─── MEMORY ─────────────────────────────────────────────────────

  async remember({ key, value }) {
    sessionMemory.set(key, value);
    return { stored: true, key, value };
  }

  async recall({ key } = {}) {
    if (!key) {
      const all = Object.fromEntries(sessionMemory);
      return { keys: [...sessionMemory.keys()], all };
    }
    const value = sessionMemory.get(key);
    return value !== undefined
      ? { key, value }
      : { key, found: false, available_keys: [...sessionMemory.keys()] };
  }

  // ─── DISPATCH ───────────────────────────────────────────────────

  async execute(toolName, toolInput) {
    if (!this[toolName]) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    return this[toolName](toolInput);
  }
}

// ─── HELPERS ────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(p) {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return "";
  }
}

async function buildTree(dir, maxDepth, showHidden, workspaceRoot, depth = 0) {
  if (depth >= maxDepth) return null;

  const SKIP = new Set(["node_modules", ".git", "dist", ".next", "build", "__pycache__", ".cache"]);

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const result = [];

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith(".")) continue;
    if (SKIP.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(workspaceRoot, fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, maxDepth, showHidden, workspaceRoot, depth + 1);
      result.push({ name: entry.name, type: "dir", path: relPath, children });
    } else {
      result.push({ name: entry.name, type: "file", path: relPath });
    }
  }

  return result;
}

module.exports = { ToolExecutor };
