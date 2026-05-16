const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, safeStorage, net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const pty = require("node-pty");
const { startServer: startBackendServer } = require("../backend/server");
const { startServer: startMcpServer } = require("../mcp-backend/server");

const isDev = !app.isPackaged;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 1368;
const DEFAULT_HEIGHT = 1030;
const DEFAULT_WEBSITE_URL = "https://codegreyapp.vercel.app";
const DEFAULT_SUPABASE_URL = "https://fdizzpftrynhlaawsjpq.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_i6MMYWQLq8nAup-pUj4iGw_ls3VcguL";
let backendServer = null;
let mcpServer = null;
let workspaceRoot = null;

const BRAIN_DIR = path.join(__dirname, "..", "brain");

function getWebsiteUrl() {
  return (process.env.CODEGREY_WEBSITE_URL || process.env.VITE_WEBSITE_URL || DEFAULT_WEBSITE_URL).replace(/\/+$/, "");
}

function getSupabaseUrl() {
  return (process.env.CODEGREY_SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}

function getSupabaseAnonKey() {
  return (
    process.env.CODEGREY_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_ANON_KEY
  );
}

function initBrain() {
  if (!fs.existsSync(BRAIN_DIR)) {
    fs.mkdirSync(BRAIN_DIR, { recursive: true });
  }
}

function getWorkspaces() {
  const wsFile = path.join(BRAIN_DIR, "workspaces.json");
  if (!fs.existsSync(wsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(wsFile, "utf8"));
  } catch {
    return [];
  }
}

function saveWorkspaces(workspaces) {
  const wsFile = path.join(BRAIN_DIR, "workspaces.json");
  fs.writeFileSync(wsFile, JSON.stringify(workspaces, null, 2), "utf8");
}

function getAppStatePath() {
  return path.join(BRAIN_DIR, "app-state.json");
}

function readAppState() {
  initBrain();
  try {
    return JSON.parse(fs.readFileSync(getAppStatePath(), "utf8"));
  } catch {
    return {};
  }
}

function writeAppState(nextState) {
  initBrain();
  const current = readAppState();
  const next = { ...current, ...nextState, updatedAt: Date.now() };
  fs.writeFileSync(getAppStatePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function trackWorkspace(wsPath, name) {
  initBrain();
  const workspaces = getWorkspaces();
  const existing = workspaces.find((w) => w.path === wsPath);
  if (existing) {
    if (name) existing.name = name;
  } else {
    workspaces.push({
      id: Math.random().toString(36).substring(2, 9),
      path: wsPath,
      name: name || path.basename(wsPath),
      added: 0,
      deleted: 0
    });
  }
  saveWorkspaces(workspaces);
  return getWorkspaces();
}

function setWorkspaceRoot(nextRoot) {
  workspaceRoot = nextRoot || null;
  writeAppState({ root: workspaceRoot });
  writeWorkspaceState({ root: workspaceRoot });
}

function updateWorkspaceStats(wsPath, added, deleted) {
  initBrain();
  const workspaces = getWorkspaces();
  const existing = workspaces.find((w) => w.path === wsPath);
  if (existing) {
    existing.added = (existing.added || 0) + added;
    existing.deleted = (existing.deleted || 0) + deleted;
    saveWorkspaces(workspaces);
  }
}

function getConversations(workspaceId) {
  const convDir = path.join(BRAIN_DIR, workspaceId);
  if (!fs.existsSync(convDir)) return [];
  try {
    const dirs = fs.readdirSync(convDir, { withFileTypes: true });
    return dirs
      .filter((d) => d.isDirectory())
      .map((d) => {
        const metaPath = path.join(convDir, d.name, "meta.json");
        if (fs.existsSync(metaPath)) {
          try {
            return JSON.parse(fs.readFileSync(metaPath, "utf8"));
          } catch {
            return null;
          }
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function createConversation(workspaceId, name) {
  initBrain();
  const id = Math.random().toString(36).substring(2, 9);
  const convDir = path.join(BRAIN_DIR, workspaceId, id);
  fs.mkdirSync(convDir, { recursive: true });
  
  const meta = {
    id,
    workspaceId,
    name: name || "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  fs.writeFileSync(path.join(convDir, "meta.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(convDir, "messages.json"), JSON.stringify([]));
  return meta;
}

function getConversationMessages(workspaceId, conversationId) {
  const file = path.join(BRAIN_DIR, workspaceId, conversationId, "messages.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function saveConversationMessages(workspaceId, conversationId, messages) {
  initBrain();
  const file = path.join(BRAIN_DIR, workspaceId, conversationId, "messages.json");
  const metaFile = path.join(BRAIN_DIR, workspaceId, conversationId, "meta.json");
  
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(messages, null, 2));
    
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      meta.updatedAt = Date.now();
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    }
  } catch {
    // ignore
  }
}

function renameConversation(workspaceId, conversationId, newName) {
  const metaFile = path.join(BRAIN_DIR, workspaceId, conversationId, "meta.json");
  try {
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      meta.name = newName;
      meta.updatedAt = Date.now();
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
      return meta;
    }
  } catch {
    // ignore
  }
  return null;
}

function deleteConversation(workspaceId, conversationId) {
  const convDir = path.join(BRAIN_DIR, workspaceId, conversationId);
  try {
    if (fs.existsSync(convDir)) {
      fs.rmSync(convDir, { recursive: true, force: true });
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function getWorkspaceStatePath() {
  return path.join(app.getPath("userData"), "workspace-state.json");
}

function readWorkspaceState() {
  try {
    return JSON.parse(fs.readFileSync(getWorkspaceStatePath(), "utf8"));
  } catch {
    return null;
  }
}

function writeWorkspaceState(state) {
  try {
    fs.writeFileSync(getWorkspaceStatePath(), JSON.stringify(state, null, 2));
  } catch {
    // ignore
  }
}

const DEFAULT_SETTINGS = {
  providerId: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  model: "claude-opus-4-5",
  temperature: 0.5,
  maxTokens: 8096,
  autoApply: false,
};

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

// ── Auth token store (safeStorage encrypted) ─────────────────────────────
const AUTH_FILE_ENC  = () => path.join(app.getPath("userData"), "auth.enc");
const AUTH_FILE_PLAIN = () => path.join(app.getPath("userData"), "auth.json");

function saveAuthTokens(tokens) {
  try {
    if (!tokens) {
      [AUTH_FILE_ENC(), AUTH_FILE_PLAIN()].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
      return;
    }
    const json = JSON.stringify(tokens);
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(AUTH_FILE_ENC(), safeStorage.encryptString(json));
    } else {
      fs.writeFileSync(AUTH_FILE_PLAIN(), json, "utf8");
    }
  } catch (e) { console.warn("[auth] save:", e.message); }
}

function loadAuthTokens() {
  try {
    const enc = AUTH_FILE_ENC();
    if (safeStorage.isEncryptionAvailable() && fs.existsSync(enc)) {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(enc)));
    }
    const plain = AUTH_FILE_PLAIN();
    if (fs.existsSync(plain)) return JSON.parse(fs.readFileSync(plain, "utf8"));
  } catch (e) { console.warn("[auth] load:", e.message); }
  return null;
}

function readSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(getSettingsPath(), "utf8"));
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(next) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2));
}

async function testAiConnection(config) {
  const settings = { ...DEFAULT_SETTINGS, ...config };
  const baseUrl = String(settings.baseUrl || "").replace(/\/+$/, "");
  const model = String(settings.model || "").trim();
  const apiKey = String(settings.apiKey || "");
  if (!baseUrl || !model) return { ok: false, error: "Base URL and model are required." };
  if (settings.providerId !== "ollama" && !apiKey) return { ok: false, error: "API key is required." };
  if (typeof fetch !== "function") return { ok: false, error: "Fetch is unavailable in Electron main." };

  try {
    const isAnthropic = settings.providerId === "anthropic";
    const isGoogle = settings.providerId === "google";
    const url = isAnthropic
      ? `${baseUrl}/v1/messages`
      : isGoogle
        ? `${baseUrl}/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`
        : `${baseUrl}/chat/completions`;
    const headers = { "Content-Type": "application/json" };
    if (isAnthropic) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (!isGoogle && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const body = isAnthropic
      ? {
          model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }
      : isGoogle
        ? null
      : {
          model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        };
    const response = await fetch(url, {
      method: isGoogle ? "GET" : "POST",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text.slice(0, 500) || `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function safePathWithinRoot(root, candidate) {
  const rootResolved = path.resolve(root);
  const candResolved = path.resolve(candidate);
  return candResolved === rootResolved || candResolved.startsWith(rootResolved + path.sep);
}

function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? String(stderr || error.message) : undefined,
      });
    });
  });
}

function normalizeRepoInput(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return `https://github.com/${value}.git`;
  return value;
}

function isIgnoredDir(name) {
  return name === "node_modules" || name === ".git" || name === "dist" || name === ".next" || name === "build";
}

function parseGitStatus(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("## ")) || "";
  const files = lines
    .filter((line) => !line.startsWith("## "))
    .map((line) => ({
      path: line.slice(3).replace(/^"|"$/g, ""),
      index: line[0],
      workingTree: line[1],
    }));
  return { branch: branchLine.replace(/^##\s*/, ""), files };
}

function getStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(), "utf8"));
  } catch {
    return null;
  }
}

function writeWindowState(win) {
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  const state = {
    ...bounds,
    maximized: win.isMaximized(),
  };

  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
}

function getDefaultBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, workArea.width - 96));
  const height = Math.max(MIN_HEIGHT, Math.min(DEFAULT_HEIGHT, workArea.height - 48));

  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
  };
}

function intersectsDisplay(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const displayRight = workArea.x + workArea.width;
    const displayBottom = workArea.y + workArea.height;

    return (
      bounds.x < displayRight &&
      right > workArea.x &&
      bounds.y < displayBottom &&
      bottom > workArea.y
    );
  });
}

function getInitialWindowState() {
  const savedState = readWindowState();
  if (
    savedState &&
    Number.isFinite(savedState.x) &&
    Number.isFinite(savedState.y) &&
    Number.isFinite(savedState.width) &&
    Number.isFinite(savedState.height)
  ) {
    const bounds = {
      x: savedState.x,
      y: savedState.y,
      width: Math.max(MIN_WIDTH, savedState.width),
      height: Math.max(MIN_HEIGHT, savedState.height),
    };

    if (intersectsDisplay(bounds)) {
      return {
        bounds,
        maximized: Boolean(savedState.maximized),
      };
    }
  }

  return {
    bounds: getDefaultBounds(),
    maximized: false,
  };
}

function createWindow() {
  const initialState = getInitialWindowState();
  const win = new BrowserWindow({
    ...initialState.bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: "Codegrey",
    backgroundColor: "#151515",
    icon: path.join(__dirname, "../public/logos/icon.ico"),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  let saveTimer;
  const queueWindowStateSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeWindowState(win), 250);
  };
  const sendWindowMaximized = () => {
    win.webContents.send("window:maximized-changed", win.isMaximized());
  };

  win.on("move", queueWindowStateSave);
  win.on("resize", queueWindowStateSave);
  win.on("maximize", sendWindowMaximized);
  win.on("unmaximize", sendWindowMaximized);
  win.on("close", () => {
    clearTimeout(saveTimer);
    writeWindowState(win);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (initialState.maximized) {
    win.maximize();
  }

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  try {
    backendServer = await startBackendServer();
  } catch (err) {
    if (err?.code === "EADDRINUSE") {
      console.warn("[Codegrey] AI backend port is already in use; assuming an existing backend is running.");
    } else {
      console.error("[Codegrey] Failed to start AI backend:", err);
    }
  }

  try {
    mcpServer = await startMcpServer();
  } catch (err) {
    if (err?.code === "EADDRINUSE") {
      console.warn("[Codegrey] MCP backend port is already in use; assuming an existing backend is running.");
    } else {
      console.error("[Codegrey] Failed to start MCP backend:", err);
    }
  }

  workspaceRoot = (() => {
    const appState = readAppState();
    if (appState && typeof appState.root === "string" && appState.root.trim()) {
      return appState.root;
    }
    const saved = readWorkspaceState();
    if (saved && typeof saved.root === "string" && saved.root.trim()) {
      writeAppState({ root: saved.root });
      return saved.root;
    }
    return null;
  })();

  ipcMain.handle("workspace:getRoot", () => workspaceRoot);

  ipcMain.handle("brain:getWorkspaces", () => getWorkspaces());
  ipcMain.handle("brain:trackWorkspace", (event, wsPath, name) => trackWorkspace(wsPath, name));
  ipcMain.handle("brain:updateWorkspaceStats", (event, wsPath, added, deleted) => updateWorkspaceStats(wsPath, added, deleted));
  ipcMain.handle("brain:getConversations", (event, workspaceId) => getConversations(workspaceId));
  ipcMain.handle("brain:createConversation", (event, workspaceId, name) => createConversation(workspaceId, name));
  ipcMain.handle("brain:getConversationMessages", (event, workspaceId, conversationId) => getConversationMessages(workspaceId, conversationId));
  ipcMain.handle("brain:saveConversationMessages", (event, workspaceId, conversationId, messages) => saveConversationMessages(workspaceId, conversationId, messages));
  ipcMain.handle("brain:renameConversation", (event, workspaceId, conversationId, newName) => renameConversation(workspaceId, conversationId, newName));
  ipcMain.handle("brain:deleteConversation", (event, workspaceId, conversationId) => deleteConversation(workspaceId, conversationId));

  ipcMain.handle("workspace:clearRoot", () => {
    setWorkspaceRoot(null);
    return null;
  });

  ipcMain.handle("workspace:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open Project Folder",
      buttonLabel: "Open Folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;

    setWorkspaceRoot(result.filePaths[0]);
    trackWorkspace(workspaceRoot, path.basename(workspaceRoot));
    return workspaceRoot;
  });

  ipcMain.handle("workspace:openFile", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open File",
      buttonLabel: "Open File",
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    const filePath = result.filePaths[0];
    const root = path.dirname(filePath);
    setWorkspaceRoot(root);
    trackWorkspace(workspaceRoot, path.basename(workspaceRoot));
    return { root: workspaceRoot, filePath };
  });

  ipcMain.handle("workspace:openFolderByPath", (event, targetPath) => {
    if (typeof targetPath !== "string") return null;
    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) return null;
    } catch {
      return null; // Path doesn't exist or no permission
    }

    setWorkspaceRoot(targetPath);
    trackWorkspace(workspaceRoot, path.basename(workspaceRoot));
    return workspaceRoot;
  });

  ipcMain.handle("workspace:listDir", (event, dirPath) => {
    if (!workspaceRoot) return [];
    if (typeof dirPath !== "string") return [];
    if (!safePathWithinRoot(workspaceRoot, dirPath)) return [];

    try {
      return fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((d) => d.name !== "node_modules" && d.name !== ".git")
        .map((d) => ({
          name: d.name,
          path: path.join(dirPath, d.name),
          isDir: d.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  });

  ipcMain.handle("workspace:readFileBinary", (event, filePath) => {
    if (typeof filePath !== "string") return null;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return null;
      if (stat.size > 1024 * 1024 * 10) return null; // 10MB limit
      const buf = fs.readFileSync(filePath);
      return { base64: buf.toString("base64") };
    } catch {
      return null;
    }
  });

  ipcMain.handle("workspace:readFile", (event, filePath) => {
    if (!workspaceRoot) return null;
    if (typeof filePath !== "string") return null;
    if (!safePathWithinRoot(workspaceRoot, filePath)) return null;

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return null;
      // Keep it sane for now.
      if (stat.size > 1024 * 1024 * 2) return null;
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  });

  ipcMain.handle("workspace:writeFile", (event, filePath, content) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    if (typeof filePath !== "string") return { ok: false, error: "Invalid path" };
    if (!safePathWithinRoot(workspaceRoot, filePath)) return { ok: false, error: "Path outside workspace" };
    if (typeof content !== "string") return { ok: false, error: "Invalid content" };
    try {
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("workspace:deleteFile", (event, filePath) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    if (typeof filePath !== "string") return { ok: false, error: "Invalid path" };
    if (!safePathWithinRoot(workspaceRoot, filePath)) return { ok: false, error: "Path outside workspace" };
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("workspace:createEntry", (event, parentDir, name, isDir) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    if (typeof parentDir !== "string" || typeof name !== "string") return { ok: false, error: "Invalid path" };
    if (!safePathWithinRoot(workspaceRoot, parentDir)) return { ok: false, error: "Path outside workspace" };
    const cleanName = name.trim();
    if (!cleanName || cleanName.includes("/") || cleanName.includes("\\")) return { ok: false, error: "Use a simple name." };
    const target = path.join(parentDir, cleanName);
    if (!safePathWithinRoot(workspaceRoot, target)) return { ok: false, error: "Path outside workspace" };
    try {
      if (fs.existsSync(target)) return { ok: false, error: "Already exists" };
      if (isDir) fs.mkdirSync(target, { recursive: true });
      else fs.writeFileSync(target, "", "utf8");
      return { ok: true, path: target };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("workspace:renameEntry", (event, entryPath, newName) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    if (typeof entryPath !== "string" || typeof newName !== "string") return { ok: false, error: "Invalid path" };
    if (!safePathWithinRoot(workspaceRoot, entryPath)) return { ok: false, error: "Path outside workspace" };
    const cleanName = newName.trim();
    if (!cleanName || cleanName.includes("/") || cleanName.includes("\\")) return { ok: false, error: "Use a simple name." };
    const target = path.join(path.dirname(entryPath), cleanName);
    if (!safePathWithinRoot(workspaceRoot, target)) return { ok: false, error: "Path outside workspace" };
    try {
      if (fs.existsSync(target)) return { ok: false, error: "Already exists" };
      fs.renameSync(entryPath, target);
      return { ok: true, path: target };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("workspace:deleteEntry", (event, entryPath) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    if (typeof entryPath !== "string") return { ok: false, error: "Invalid path" };
    if (!safePathWithinRoot(workspaceRoot, entryPath)) return { ok: false, error: "Path outside workspace" };
    try {
      fs.rmSync(entryPath, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("workspace:search", (event, query, opts) => {
    if (!workspaceRoot) return [];
    const needle = String(query || "").trim();
    if (!needle) return [];
    const maxResults = Math.min(Number(opts?.maxResults) || 300, 1000);
    const include = String(opts?.include || "").trim().toLowerCase();
    const mode = opts?.mode || "content"; // "content" or "filename"
    const results = [];
    const lowerNeedle = needle.toLowerCase();

    function walk(dir) {
      if (results.length >= maxResults) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name.startsWith(".") && entry.name !== ".env") continue;
        const full = path.join(dir, entry.name);
        if (!safePathWithinRoot(workspaceRoot, full)) continue;

        if (mode === "filename") {
          if (entry.name.toLowerCase().includes(lowerNeedle)) {
            results.push({ filePath: full, isDir: entry.isDirectory() });
          }
        }

        if (entry.isDirectory()) {
          if (!isIgnoredDir(entry.name)) walk(full);
          continue;
        }

        if (mode === "content") {
          if (!entry.isFile()) continue;
          if (include && !entry.name.toLowerCase().includes(include)) continue;
          let stat;
          try {
            stat = fs.statSync(full);
            if (stat.size > 1024 * 1024) continue;
            const text = fs.readFileSync(full, "utf8");
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i += 1) {
              if (lines[i].toLowerCase().includes(lowerNeedle)) {
                results.push({ filePath: full, line: i + 1, preview: lines[i].trim().slice(0, 240) });
                if (results.length >= maxResults) break;
              }
            }
          } catch {
            // skip binary/unreadable files
          }
        }
      }
    }

    walk(workspaceRoot);
    return results;
  });

  ipcMain.handle("workspace:cloneRepo", async (event, repoInput, parentDir) => {
    const repo = normalizeRepoInput(repoInput);
    if (!repo) return { ok: false, error: "Repository URL is required." };
    let targetParent = typeof parentDir === "string" && parentDir.trim() ? parentDir : null;
    if (!targetParent) {
      const result = await dialog.showOpenDialog({
        title: "Choose a folder to clone into",
        buttonLabel: "Clone Here",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths?.[0]) return { ok: false, error: "No folder selected." };
      targetParent = result.filePaths[0];
    }
    try {
      fs.mkdirSync(targetParent, { recursive: true });

      // Stream git clone output back to renderer
      const result = await new Promise((resolve) => {
        const proc = spawn("git", ["clone", "--progress", repo], { cwd: targetParent, windowsHide: true });
        const lines = [];
        const send = (line) => {
          lines.push(line);
          event.sender.send("workspace:cloneProgress", { line: line.trim() });
        };
        proc.stdout.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(send));
        proc.stderr.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(send));
        proc.on("close", (code) => resolve({ ok: code === 0, stderr: lines.join("\n") }));
        proc.on("error", (e) => resolve({ ok: false, error: e.message }));
      });

      if (!result.ok) return { ok: false, error: result.stderr || "Clone failed." };
      const guessedName = repo.replace(/\/+$/, "").split(/[/:\\]/).pop()?.replace(/\.git$/i, "") || "";
      const clonedPath = path.join(targetParent, guessedName);
      const finalPath = fs.existsSync(clonedPath) ? clonedPath : targetParent;
      setWorkspaceRoot(finalPath);
      trackWorkspace(finalPath, path.basename(finalPath));
      return { ok: true, path: finalPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("git:status", async () => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open", files: [] };
    const result = await runGit(["status", "--porcelain=v1", "-b"], workspaceRoot);
    if (!result.ok) return { ...result, files: [] };
    return { ok: true, ...parseGitStatus(result.stdout) };
  });

  ipcMain.handle("git:statusForPath", async (event, targetPath) => {
    if (typeof targetPath !== "string") return { ok: false, error: "Invalid path", files: [] };
    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) return { ok: false, error: "Path is not a directory", files: [] };
    } catch (e) {
      return { ok: false, error: e.message, files: [] };
    }
    const result = await runGit(["status", "--porcelain=v1", "-b"], targetPath);
    if (!result.ok) return { ...result, files: [] };
    return { ok: true, ...parseGitStatus(result.stdout) };
  });

  ipcMain.handle("git:diff", async (event, filePath, staged) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open", diff: "" };
    const args = ["diff"];
    if (staged) args.push("--cached");
    if (filePath) args.push("--", filePath);
    const result = await runGit(args, workspaceRoot);
    return { ...result, diff: result.stdout };
  });

  ipcMain.handle("git:stage", async (event, filePath) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    return runGit(["add", "--", filePath || "."], workspaceRoot);
  });

  ipcMain.handle("git:unstage", async (event, filePath) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    return runGit(["restore", "--staged", "--", filePath || "."], workspaceRoot);
  });

  ipcMain.handle("git:commit", async (event, message) => {
    if (!workspaceRoot) return { ok: false, error: "No workspace open" };
    const msg = String(message || "").trim();
    if (!msg) return { ok: false, error: "Commit message is required." };
    return runGit(["commit", "-m", msg], workspaceRoot);
  });


  // ── Auth IPC ───────────────────────────────────────────────────────────────
  ipcMain.handle("auth:loadTokens", () => loadAuthTokens());

  ipcMain.handle("auth:saveTokens", (event, tokens) => {
    saveAuthTokens(tokens);
    return true;
  });

  ipcMain.handle("auth:signOut", () => {
    saveAuthTokens(null);
    return true;
  });

  ipcMain.handle("auth:startLogin", async (event) => {
    const http = require("http");
    const crypto = require("crypto");
    const state = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn) => { if (!settled) { settled = true; fn(); } };

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        const origin = req.headers.origin || "*";
        const corsHeaders = {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle CORS preflight
        if (req.method === "OPTIONS") {
          res.writeHead(204, corsHeaders);
          res.end();
          return;
        }

        // Ignore favicon and any non-callback paths
        if (url.pathname !== "/cb") {
          res.writeHead(204);
          res.end();
          return;
        }

        // Respond with CORS headers so the website success page fetch succeeds
        res.writeHead(200, { ...corsHeaders, "Content-Type": "text/plain" });
        res.end("ok");

        const code = url.searchParams.get("code");
        const retState = url.searchParams.get("state");

        server.close(() => {}); // stop accepting new connections

        if (!code || retState !== state) {
          settle(() => reject(new Error("state_mismatch or missing code")));
          return;
        }

        try {
          const supabaseUrl = getSupabaseUrl();
          const supabaseAnonKey = getSupabaseAnonKey();
          const resp = await fetch(`${supabaseUrl}/functions/v1/desktop-exchange`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseAnonKey,
              "Authorization": `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ code }),
          });
          const data = await resp.json();
          if (data.error) { settle(() => reject(new Error(data.error))); return; }
          saveAuthTokens({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user: data.user,
            roles: data.roles,
          });
          settle(() => resolve(data));
        } catch (e) {
          settle(() => reject(e));
        }
      });

      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        const callback = `http://127.0.0.1:${port}/cb`;
        const loginUrl = new URL(`${getWebsiteUrl()}/auth/login`);
        loginUrl.searchParams.set("callback", callback);
        loginUrl.searchParams.set("state", state);
        loginUrl.searchParams.set("client", "Codegrey Desktop");
        shell.openExternal(loginUrl.toString());
      });

      server.on("error", (err) => {
        settle(() => reject(new Error(`Loopback server error: ${err.message}`)));
      });

      // Timeout after 5 min
      setTimeout(() => {
        server.close(() => {});
        settle(() => reject(new Error("login_timeout")));
      }, 5 * 60 * 1000);
    });
  });

  ipcMain.handle("auth:fetchAccount", async (event, accessToken) => {
    const SUPABASE_URL = getSupabaseUrl();
    const SUPABASE_KEY = getSupabaseAnonKey();
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const usageSince = monthStart < thirtyDaysAgo ? monthStart : thirtyDaysAgo;
      const usageSinceParam = encodeURIComponent(usageSince.toISOString());
      const [profRes, subRes, usageRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,full_name,avatar_url,plan&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/subscriptions?select=plan,status,monthly_price_cents,current_period_end,cancel_at_period_end&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/usage_events?select=event_type,model,tokens_in,tokens_out,lines,cost_cents,created_at&created_at=gte.${usageSinceParam}&order=created_at.desc`, { headers }),
      ]);
      const [profiles, subscriptions, usage] = await Promise.all([profRes.json(), subRes.json(), usageRes.json()]);
      return { profile: profiles?.[0] ?? null, subscription: subscriptions?.[0] ?? null, usage: Array.isArray(usage) ? usage : [] };
    } catch (e) {
      console.warn("[auth] fetchAccount:", e.message);
      return null;
    }
  });

  ipcMain.handle("settings:get", () => readSettings());

  ipcMain.handle("settings:set", (event, partial) => {
    const current = readSettings();
    const next = { ...current, ...(partial && typeof partial === "object" ? partial : {}) };
    writeSettings(next);
    return next;
  });

  ipcMain.handle("settings:testConnection", (event, config) => testAiConnection(config));

  // Terminal (node-pty) - one or more terminals per window.
  const terminals = new Map();
  let terminalSeq = 0;

  function getDefaultShell() {
    if (process.platform === "win32") {
      // Prefer PowerShell 7 if installed; VS Code typically uses pwsh when available.
      // Fall back to Windows PowerShell.
      return "pwsh.exe";
    }
    return process.env.SHELL || "/bin/bash";
  }

  ipcMain.handle("terminal:create", (event, opts) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin) return null;

    terminalSeq += 1;
    const id = String(terminalSeq);

    const cols = Number(opts?.cols) > 0 ? Number(opts.cols) : 80;
    const rows = Number(opts?.rows) > 0 ? Number(opts.rows) : 24;
    const cwd = typeof opts?.cwd === "string" && opts.cwd.trim() ? opts.cwd : (workspaceRoot || app.getPath("home"));
    let shellPath = typeof opts?.shell === "string" && opts.shell.trim() ? opts.shell : getDefaultShell();
    let shellArgs = [];

    // Match VS Code-like interactive prompt coloring on Windows (PSReadLine syntax colors).
    // This is implemented by the shell, not xterm. We set it up defensively if PSReadLine exists.
    if (process.platform === "win32") {
      const lower = String(shellPath).toLowerCase();
      if (lower.endsWith("pwsh.exe") || lower.endsWith("powershell.exe")) {
        const psInit = [
          "Import-Module PSReadLine -ErrorAction SilentlyContinue;",
          "if (Get-Module PSReadLine) {",
          "  $cmd = Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue;",
          "  if ($cmd) {",
          "    $p = $cmd.Parameters;",
          "    $opts = @{ BellStyle = 'None'; HistoryNoDuplicates = $true };",
          "    if ($p -and $p.ContainsKey('PredictionSource')) { $opts.PredictionSource = 'History' }",
          "    try { Set-PSReadLineOption @opts } catch {}",
          "    try {",
          "      # Use VT yellow for commands without remapping the whole terminal blue palette.",
          "      Set-PSReadLineOption -Colors @{",
          "        Command = \"`e[93m\";",
          "        Parameter = 'DarkGray';",
          "        Operator = 'DarkGray';",
          "        String = 'Green';",
          "        Number = 'Magenta';",
          "        Variable = 'White';",
          "        Type = 'DarkGray';",
          "        Member = 'DarkGray';",
          "        Emphasis = 'White';",
          "        Error = 'Red'",
          "      }",
          "    } catch {}",
          "  }",
          "}",
        ].join(" ");
        shellArgs = [
          "-NoLogo",
          "-NoExit",
          "-Command",
          psInit,
        ];
      }
    }

    // If pwsh isn't available, node-pty will throw. Fall back to Windows PowerShell.
    if (process.platform === "win32" && String(shellPath).toLowerCase() === "pwsh.exe") {
      try {
        // Cheap existence check
        require("node:child_process").execFileSync("where", ["pwsh"], { stdio: "ignore" });
      } catch {
        shellPath = "powershell.exe";
        const psInitFallback = [
          "Import-Module PSReadLine -ErrorAction SilentlyContinue;",
          "if (Get-Module PSReadLine) {",
          "  $cmd = Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue;",
          "  if ($cmd) {",
          "    $p = $cmd.Parameters;",
          "    $opts = @{ BellStyle = 'None'; HistoryNoDuplicates = $true };",
          "    if ($p -and $p.ContainsKey('PredictionSource')) { $opts.PredictionSource = 'History' }",
          "    try { Set-PSReadLineOption @opts } catch {}",
          "    try { Set-PSReadLineOption -Colors @{ Command = \"`e[93m\"; Parameter = 'DarkGray'; Operator = 'DarkGray'; String = 'Green'; Number = 'Magenta'; Variable = 'White'; Type = 'DarkGray'; Member = 'DarkGray'; Emphasis = 'White'; Error = 'Red' } } catch {}",
          "  }",
          "}",
        ].join(" ");
        shellArgs = [
          "-NoLogo",
          "-NoExit",
          "-Command",
          psInitFallback,
        ];
      }
    }

    const p = pty.spawn(shellPath, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: process.env,
    });

    terminals.set(id, { pty: p, winId: senderWin.id });

    p.onData((data) => {
      // Drop if window is gone.
      const win = BrowserWindow.fromId(senderWin.id);
      if (!win) return;
      win.webContents.send("terminal:data", { id, data });
    });

    p.onExit(() => {
      terminals.delete(id);
      const win = BrowserWindow.fromId(senderWin.id);
      if (!win) return;
      win.webContents.send("terminal:exit", { id });
    });

    return { id };
  });

  ipcMain.handle("terminal:write", (event, { id, data }) => {
    const t = terminals.get(String(id));
    if (!t) return;
    if (typeof data !== "string") return;
    t.pty.write(data);
  });

  ipcMain.handle("terminal:resize", (event, { id, cols, rows }) => {
    const t = terminals.get(String(id));
    if (!t) return;
    const c = Number(cols);
    const r = Number(rows);
    if (!Number.isFinite(c) || !Number.isFinite(r)) return;
    if (c <= 0 || r <= 0) return;
    t.pty.resize(c, r);
  });

  ipcMain.handle("terminal:kill", (event, { id }) => {
    const t = terminals.get(String(id));
    if (!t) return;
    terminals.delete(String(id));
    try {
      t.pty.kill();
    } catch {
      // ignore
    }
  });

  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle("window:toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }

    return win.isMaximized();
  });

  ipcMain.handle("window:is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("window:new", () => {
    createWindow();
  });

  ipcMain.handle("window:openExternal", (event, url) => {
    if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle("window:new-empty", () => {
    setWorkspaceRoot(null);
    createWindow();
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendServer) {
    backendServer.close();
    backendServer = null;
  }
  if (mcpServer) {
    mcpServer.close();
    mcpServer = null;
  }
});
