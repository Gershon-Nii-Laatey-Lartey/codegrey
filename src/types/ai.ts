export type ProviderId = "anthropic" | "google" | "openai" | "openrouter" | "ollama" | "custom";

export type AiSettings = {
  providerId: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  autoApply: boolean;
  preferPlanModels: boolean;
};

export type AiMode = "plan" | "byok";

export type PlanTier = "free" | "pro" | "team" | "enterprise";

export type ModelCapability = "chat" | "tools" | "vision" | "fast" | "reasoning";

export type ModelCatalogItem = {
  id: string;
  displayName: string;
  provider: string;
  providerModel: string;
  mode: "plan" | "byok";
  description?: string;
  capabilities: ModelCapability[];
  planTiers: PlanTier[];
  contextWindow?: number;
  maxOutputTokens?: number;
  enabled: boolean;
  isDefault?: boolean;
  sortOrder: number;
};

export type AiRequestConfig = {
  mode: AiMode;
  modelId: string;
  temperature: number;
  maxTokens: number;
  byok?: AiSettings;
};

export type ToolStatus = "pending" | "running" | "done" | "error";
export type ProposalStatus = "pending" | "accepted" | "rejected";

export type ChatMessagePart =
  | { type: "text"; content: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: unknown;
      status: ToolStatus;
      result?: unknown;
      isError?: boolean;
    }
  | {
      type: "file_proposal";
      id: string;
      filePath: string;
      oldContent: string;
      newContent: string;
      status: ProposalStatus;
      error?: string;
      autoApplied?: boolean;
    };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatMessagePart[];
  timestamp: string;
  contextFile?: string | null;
  streaming?: boolean;
};

export type AiStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string; iteration: number }
  | { type: "tool_result"; name: string; id: string; result: unknown; isError: boolean; iteration: number }
  | {
      type: "file_change_proposed";
      filePath: string;
      oldContent: string;
      newContent: string;
      autoApplied?: boolean;
      toolName?: string;
      toolId?: string;
      iteration?: number;
    }
  | {
      type: "done";
      finalMessage: string;
      iterations: number;
      toolsUsed: string[];
      usage?: { tokensIn: number; tokensOut: number; lines: number; model: string | null; keySource?: AiMode };
    }
  | { type: "error"; message: string };

export const PROVIDER_PRESETS: Record<
  ProviderId,
  { label: string; baseUrl: string; placeholder: string }
> = {
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    placeholder: "claude-opus-4-5",
  },
  google: {
    label: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    placeholder: "gemini-2.5-pro",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    placeholder: "gpt-4.1",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    placeholder: "anthropic/claude-3.5-sonnet",
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    placeholder: "llama3.1",
  },
  custom: {
    label: "Custom",
    baseUrl: "",
    placeholder: "provider-model-name",
  },
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerId: "anthropic",
  baseUrl: PROVIDER_PRESETS.anthropic.baseUrl,
  apiKey: "",
  model: "claude-opus-4-5",
  temperature: 0.5,
  maxTokens: 8096,
  autoApply: false,
  preferPlanModels: true,
};

export const DEFAULT_PLAN_MODEL_ID = "codegrey-claude-sonnet";

export const DEFAULT_AI_REQUEST: AiRequestConfig = {
  mode: "plan",
  modelId: DEFAULT_PLAN_MODEL_ID,
  temperature: DEFAULT_AI_SETTINGS.temperature,
  maxTokens: DEFAULT_AI_SETTINGS.maxTokens,
  byok: DEFAULT_AI_SETTINGS,
};
