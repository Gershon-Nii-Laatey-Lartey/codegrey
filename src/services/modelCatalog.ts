import {
  DEFAULT_PLAN_MODEL_ID,
  type AiMode,
  type ModelCatalogItem,
  type PlanTier,
} from "../types/ai";

const API_BASE = "http://localhost:3172/api";
const STORAGE_KEY = "codegrey.ai.modelSelection.v1";

type StoredModelSelection = {
  mode: AiMode;
  planModelId: string;
  byokModelId: string;
};

export const FALLBACK_MODELS: ModelCatalogItem[] = [
  {
    id: DEFAULT_PLAN_MODEL_ID,
    displayName: "Codegrey Sonnet",
    provider: "anthropic",
    providerModel: "claude-3-5-sonnet-latest",
    mode: "plan",
    description: "Balanced for coding and tools.",
    capabilities: ["chat", "tools", "vision", "reasoning"],
    planTiers: ["free", "pro", "team", "enterprise"],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    enabled: true,
    isDefault: true,
    sortOrder: 10,
  },
  {
    id: "codegrey-fast",
    displayName: "Codegrey Fast",
    provider: "openai",
    providerModel: "gpt-4.1-mini",
    mode: "plan",
    description: "Fast for small edits and chats.",
    capabilities: ["chat", "tools", "fast"],
    planTiers: ["free", "pro", "team", "enterprise"],
    contextWindow: 128000,
    maxOutputTokens: 4096,
    enabled: true,
    sortOrder: 20,
  },
  {
    id: "codegrey-opus",
    displayName: "Codegrey Opus",
    provider: "anthropic",
    providerModel: "claude-opus-4-5",
    mode: "plan",
    description: "Highest quality for complex tasks.",
    capabilities: ["chat", "tools", "vision", "reasoning"],
    planTiers: ["pro", "team", "enterprise"],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    enabled: true,
    sortOrder: 30,
  },
];

export async function fetchModelCatalog(accessToken?: string | null): Promise<ModelCatalogItem[]> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${API_BASE}/models`, { headers });
    if (!response.ok) throw new Error(`Model catalog failed with ${response.status}`);
    const data = await response.json();
    return normalizeCatalog(data.models);
  } catch {
    return FALLBACK_MODELS;
  }
}

export function filterModelsForPlan(models: ModelCatalogItem[], plan: string | null | undefined) {
  const tier = normalizePlan(plan);
  return models
    .filter((model) => model.enabled && model.planTiers.includes(tier))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));
}

export function loadModelSelection(): StoredModelSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSelection(), ...JSON.parse(raw) };
  } catch {
    // Fall through to defaults.
  }
  return defaultSelection();
}

export function saveModelSelection(next: StoredModelSelection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function normalizeCatalog(value: unknown): ModelCatalogItem[] {
  if (!Array.isArray(value)) return FALLBACK_MODELS;
  const models = value
    .map((item) => {
      const raw = item as Partial<ModelCatalogItem>;
      return { ...raw, enabled: raw.enabled !== false };
    })
    .filter((item): item is ModelCatalogItem => Boolean(item?.id && item?.displayName && item?.providerModel));
  return models.length ? models : FALLBACK_MODELS;
}

function normalizePlan(plan: string | null | undefined): PlanTier {
  return plan === "pro" || plan === "team" || plan === "enterprise" ? plan : "free";
}

function defaultSelection(): StoredModelSelection {
  return {
    mode: "plan",
    planModelId: DEFAULT_PLAN_MODEL_ID,
    byokModelId: "byok-local",
  };
}
