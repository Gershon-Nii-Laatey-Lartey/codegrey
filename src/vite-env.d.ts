/// <reference types="vite/client" />

interface Window {
  codegrey?: {
    platform: string;
    windowControls?: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
    };
    workspace?: {
      getRoot: () => Promise<string | null>;
      openFolder: () => Promise<string | null>;
      listDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDir: boolean }>>;
      readFile: (filePath: string) => Promise<string | null>;
    };
    terminal?: {
      create: (opts: { cols: number; rows: number; cwd?: string; shell?: string }) => Promise<{ id: string } | null>;
      write: (payload: { id: string; data: string }) => Promise<void>;
      resize: (payload: { id: string; cols: number; rows: number }) => Promise<void>;
      kill: (payload: { id: string }) => Promise<void>;
      onData: (handler: (msg: { id: string; data: string }) => void) => () => void;
      onExit: (handler: (msg: { id: string }) => void) => () => void;
    };
  };
}
