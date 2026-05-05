const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codegrey", {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  workspace: {
    getRoot: () => ipcRenderer.invoke("workspace:getRoot"),
    openFolder: () => ipcRenderer.invoke("workspace:openFolder"),
    listDir: (dirPath) => ipcRenderer.invoke("workspace:listDir", dirPath),
    readFile: (filePath) => ipcRenderer.invoke("workspace:readFile", filePath),
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
