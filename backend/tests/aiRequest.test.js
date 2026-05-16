const assert = require("node:assert/strict");
const { resolveAiRequest } = require("../src/models/aiRequest");

const byokSettings = {
  providerId: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "local-key",
  model: "claude-opus-4-5",
  temperature: 0.2,
  maxTokens: 1024,
};

{
  const resolved = resolveAiRequest({ aiSettings: byokSettings });
  assert.equal(resolved.keySource, "byok");
  assert.equal(resolved.settings.apiKey, "local-key");
}

{
  const resolved = resolveAiRequest({
    accessToken: "jwt",
    aiRequest: {
      mode: "plan",
      modelId: "codegrey-claude-sonnet",
      temperature: 0.5,
      maxTokens: 4096,
    },
  });
  assert.equal(resolved.keySource, "plan");
  assert.equal(resolved.settings.providerId, "plan");
  assert.equal(resolved.settings.accessToken, "jwt");
  assert.equal(resolved.modelId, "codegrey-claude-sonnet");
}

{
  assert.throws(
    () =>
      resolveAiRequest({
        accessToken: "jwt",
        aiRequest: {
          mode: "plan",
          modelId: "disabled-or-missing",
          temperature: 0.5,
          maxTokens: 4096,
        },
      }),
    /unavailable/
  );
}

console.log("aiRequest policy tests passed");
