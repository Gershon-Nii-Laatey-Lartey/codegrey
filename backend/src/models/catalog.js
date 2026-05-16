const DEFAULT_MODELS = [
  {
    id: "codegrey-claude-sonnet",
    displayName: "Codegrey Sonnet",
    provider: "anthropic",
    providerModel: "claude-3-5-sonnet-latest",
    mode: "plan",
    description: "Balanced default for coding, planning, and tool use.",
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
    description: "Fast responses for small edits and explanations.",
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
    description: "Highest quality model for difficult multi-file work.",
    capabilities: ["chat", "tools", "vision", "reasoning"],
    planTiers: ["pro", "team", "enterprise"],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    enabled: true,
    sortOrder: 30,
  },
];

function getDefaultModelCatalog() {
  return DEFAULT_MODELS.map((model) => ({ ...model }));
}

function findModelById(modelId) {
  return getDefaultModelCatalog().find((model) => model.id === modelId && model.enabled);
}

module.exports = {
  getDefaultModelCatalog,
  findModelById,
};
