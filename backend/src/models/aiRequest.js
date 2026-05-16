const { DEFAULTS } = require("../providers");
const { findModelById } = require("./catalog");

function resolveAiRequest({ aiRequest, aiSettings, accessToken }) {
  if (!aiRequest) {
    return {
      mode: "byok",
      settings: aiSettings,
      keySource: "byok",
      modelId: aiSettings?.model || null,
    };
  }

  if (aiRequest.mode === "byok") {
    const byok = aiRequest.byok || aiSettings || {};
    return {
      mode: "byok",
      settings: {
        ...byok,
        temperature: aiRequest.temperature ?? byok.temperature,
        maxTokens: aiRequest.maxTokens ?? byok.maxTokens,
      },
      keySource: "byok",
      modelId: byok.model || aiRequest.modelId || null,
    };
  }

  const catalogModel = findModelById(aiRequest.modelId);
  if (!catalogModel) {
    const err = new Error("Selected plan model is unavailable.");
    err.status = 400;
    err.code = "model_unavailable";
    throw err;
  }

  return {
    mode: "plan",
    keySource: "plan",
    modelId: catalogModel.id,
    settings: {
      providerId: "plan",
      baseUrl: "",
      apiKey: "",
      model: catalogModel.providerModel,
      modelId: catalogModel.id,
      provider: catalogModel.provider,
      temperature: Number.isFinite(Number(aiRequest.temperature)) ? Number(aiRequest.temperature) : DEFAULTS.temperature,
      maxTokens: Number.isFinite(Number(aiRequest.maxTokens)) ? Number(aiRequest.maxTokens) : catalogModel.maxOutputTokens || DEFAULTS.maxTokens,
      accessToken,
    },
  };
}

module.exports = {
  resolveAiRequest,
};
