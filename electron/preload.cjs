const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codegrey", {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChange: (handler) => {
      const listener = (_event, isMaximized) => handler(isMaximized);
      ipcRenderer.on("window:maximized-changed", listener);
      return () => ipcRenderer.removeListener("window:maximized-changed", listener);
    },
    close: () => ipcRenderer.invoke("window:close"),
    newWindow: () => ipcRenderer.invoke("window:new"),
    newEmptyWindow: () => ipcRenderer.invoke("window:new-empty"),
    openExternal: (url) => ipcRenderer.invoke("window:openExternal", url),
  },
  workspace: {
    getRoot: () => ipcRenderer.invoke("workspace:getRoot"),
    clearRoot: () => ipcRenderer.invoke("workspace:clearRoot"),
    openFolder: () => ipcRenderer.invoke("workspace:openFolder"),
    openFile: () => ipcRenderer.invoke("workspace:openFile"),
    openFolderByPath: (targetPath) => ipcRenderer.invoke("workspace:openFolderByPath", targetPath),
    listDir: (dirPath) => ipcRenderer.invoke("workspace:listDir", dirPath),
    readFile: (filePath) => ipcRenderer.invoke("workspace:readFile", filePath),
    readFileBinary: (filePath) => ipcRenderer.invoke("workspace:readFileBinary", filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke("workspace:writeFile", filePath, content),
    deleteFile: (filePath) => ipcRenderer.invoke("workspace:deleteFile", filePath),
    createEntry: (parentDir, name, isDir) => ipcRenderer.invoke("workspace:createEntry", parentDir, name, isDir),
    renameEntry: (entryPath, newName) => ipcRenderer.invoke("workspace:renameEntry", entryPath, newName),
    deleteEntry: (entryPath) => ipcRenderer.invoke("workspace:deleteEntry", entryPath),
    search: (query, opts) => ipcRenderer.invoke("workspace:search", query, opts),
    cloneRepo: (repoUrl, parentDir) => ipcRenderer.invoke("workspace:cloneRepo", repoUrl, parentDir),
  },
  git: {
    status: () => ipcRenderer.invoke("git:status"),
    statusForPath: (targetPath) => ipcRenderer.invoke("git:statusForPath", targetPath),
    diff: (filePath, staged) => ipcRenderer.invoke("git:diff", filePath, staged),
    stage: (filePath) => ipcRenderer.invoke("git:stage", filePath),
    unstage: (filePath) => ipcRenderer.invoke("git:unstage", filePath),
    commit: (message) => ipcRenderer.invoke("git:commit", message),
  },
  brain: {
    getWorkspaces: () => ipcRenderer.invoke("brain:getWorkspaces"),
    trackWorkspace: (wsPath, name) => ipcRenderer.invoke("brain:trackWorkspace", wsPath, name),
    updateWorkspaceStats: (wsPath, added, deleted) => ipcRenderer.invoke("brain:updateWorkspaceStats", wsPath, added, deleted),
    getConversations: (workspaceId) => ipcRenderer.invoke("brain:getConversations", workspaceId),
    createConversation: (workspaceId, name) => ipcRenderer.invoke("brain:createConversation", workspaceId, name),
    getConversationMessages: (workspaceId, conversationId) => ipcRenderer.invoke("brain:getConversationMessages", workspaceId, conversationId),
    saveConversationMessages: (workspaceId, conversationId, messages) => ipcRenderer.invoke("brain:saveConversationMessages", workspaceId, conversationId, messages),
    renameConversation: (workspaceId, conversationId, newName) => ipcRenderer.invoke("brain:renameConversation", workspaceId, conversationId, newName),
    deleteConversation: (workspaceId, conversationId) => ipcRenderer.invoke("brain:deleteConversation", workspaceId, conversationId),
  },
  auth: {
    loadTokens: () => ipcRenderer.invoke("auth:loadTokens"),
    saveTokens: (tokens) => ipcRenderer.invoke("auth:saveTokens", tokens),
    signOut: () => ipcRenderer.invoke("auth:signOut"),
    startLogin: () => ipcRenderer.invoke("auth:startLogin"),
    fetchAccount: (accessToken) => ipcRenderer.invoke("auth:fetchAccount", accessToken),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (partial) => ipcRenderer.invoke("settings:set", partial),
    testConnection: (config) => ipcRenderer.invoke("settings:testConnection", config),
  },
  terminal: {
    create: (opts) => ipcRenderer.invoke("terminal:create", opts),
    write: (payload) => ipcRenderer.invoke("terminal:write", payload),
    resize: (payload) => ipcRenderer.invoke("terminal:resize", payload),
    kill: (payload) => ipcRenderer.invoke("terminal:kill", payload),
    onData: (handler) => {
      const listener = (_event, msg) => handler(msg);
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (handler) => {
      const listener = (_event, msg) => handler(msg);
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    },
  },
});
