const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const pty = require("node-pty");

const isDev = !app.isPackaged;
const MIN_WIDTH = 920;
const MIN_HEIGHT = 680;
const DEFAULT_WIDTH = 1368;
const DEFAULT_HEIGHT = 1030;

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

function safePathWithinRoot(root, candidate) {
  const rootResolved = path.resolve(root);
  const candResolved = path.resolve(candidate);
  return candResolved === rootResolved || candResolved.startsWith(rootResolved + path.sep);
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  let workspaceRoot = (() => {
    const saved = readWorkspaceState();
    if (saved && typeof saved.root === "string" && saved.root.trim()) {
      return saved.root;
    }
    return null;
  })();

  ipcMain.handle("workspace:getRoot", () => workspaceRoot);

  ipcMain.handle("workspace:clearRoot", () => {
    workspaceRoot = null;
    writeWorkspaceState({ root: null });
    return null;
  });

  ipcMain.handle("workspace:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;

    workspaceRoot = result.filePaths[0];
    writeWorkspaceState({ root: workspaceRoot });
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
