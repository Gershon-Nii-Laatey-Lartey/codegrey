/// <reference types="vite/client" />

interface Window {
  codegrey?: {
    platform: string;
    windowControls?: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (handler: (isMaximized: boolean) => void) => () => void;
      close: () => Promise<void>;
      newWindow?: () => Promise<void>;
      newEmptyWindow?: () => Promise<void>;
    };
    workspace?: {
      getRoot: () => Promise<string | null>;
      clearRoot: () => Promise<null>;
      openFolder: () => Promise<string | null>;
      openFile?: () => Promise<{ root: string; filePath: string } | null>;
      openFolderByPath: (targetPath: string) => Promise<string | null>;
      listDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDir: boolean }>>;
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
      deleteFile: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      createEntry?: (parentDir: string, name: string, isDir: boolean) => Promise<{ ok: boolean; path?: string; error?: string }>;
      renameEntry?: (entryPath: string, newName: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
      deleteEntry?: (entryPath: string) => Promise<{ ok: boolean; error?: string }>;
      search?: (query: string, opts?: { include?: string; maxResults?: number }) => Promise<Array<{ filePath: string; line: number; preview: string }>>;
      cloneRepo?: (repoUrl: string, parentDir?: string | null) => Promise<{ ok: boolean; path?: string; error?: string }>;
    };
    git?: {
      status: () => Promise<{ ok: boolean; branch?: string; files: Array<{ path: string; index: string; workingTree: string }>; error?: string }>;
      statusForPath?: (targetPath: string) => Promise<{ ok: boolean; branch?: string; files: Array<{ path: string; index: string; workingTree: string }>; error?: string }>;
      diff: (filePath?: string, staged?: boolean) => Promise<{ ok: boolean; diff: string; error?: string }>;
      stage: (filePath?: string) => Promise<{ ok: boolean; error?: string }>;
      unstage: (filePath?: string) => Promise<{ ok: boolean; error?: string }>;
      commit: (message: string) => Promise<{ ok: boolean; stdout?: string; error?: string }>;
    };
    brain?: {
      getWorkspaces: () => Promise<Array<{ id: string; path: string; name: string; added: number; deleted: number }>>;
      trackWorkspace: (wsPath: string, name?: string) => Promise<Array<any>>;
      updateWorkspaceStats: (wsPath: string, added: number, deleted: number) => Promise<void>;
      getConversations: (workspaceId: string) => Promise<Array<{ id: string; workspaceId: string; name: string; createdAt: number; updatedAt: number }>>;
      createConversation: (workspaceId: string, name?: string) => Promise<{ id: string; workspaceId: string; name: string; createdAt: number; updatedAt: number }>;
      getConversationMessages?: (workspaceId: string, conversationId: string) => Promise<any[]>;
      saveConversationMessages?: (workspaceId: string, conversationId: string, messages: any[]) => Promise<void>;
      renameConversation?: (workspaceId: string, conversationId: string, newName: string) => Promise<any>;
      deleteConversation?: (workspaceId: string, conversationId: string) => Promise<boolean>;
    };
    settings?: {
      get: () => Promise<import("./types/ai").AiSettings>;
      set: (partial: Partial<import("./types/ai").AiSettings>) => Promise<import("./types/ai").AiSettings>;
      testConnection: (config: import("./types/ai").AiSettings) => Promise<{ ok: boolean; error?: string }>;
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
