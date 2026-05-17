import { useEffect, useMemo, useState } from "react";
import { AiSettings, AiMode, ModelCatalogItem, DEFAULT_AI_REQUEST, DEFAULT_AI_SETTINGS, AiRequestConfig } from "../types/ai";
import { fetchModelCatalog, filterModelsForPlan, loadModelSelection, saveModelSelection } from "../services/modelCatalog";

export function useModelCatalog(isLoggedIn: boolean | undefined, userPlan: string | null | undefined, aiSettings: AiSettings) {
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>([]);
  const [aiMode, setAiMode] = useState<AiMode>(isLoggedIn ? "plan" : "byok");
  const [planModelId, setPlanModelId] = useState(DEFAULT_AI_REQUEST.modelId);

  const availablePlanModels = useMemo(
    () => filterModelsForPlan(modelCatalog, userPlan),
    [modelCatalog, userPlan]
  );

  const activePlanModelId = useMemo(() => {
    if (availablePlanModels.some((model) => model.id === planModelId)) return planModelId;
    return availablePlanModels.find((model) => model.isDefault)?.id ?? availablePlanModels[0]?.id ?? DEFAULT_AI_REQUEST.modelId;
  }, [availablePlanModels, planModelId]);

  const aiRequest = useMemo<AiRequestConfig>(() => ({
    mode: aiMode,
    modelId: aiMode === "plan" ? activePlanModelId : "byok-local",
    temperature: aiSettings.temperature,
    maxTokens: aiSettings.maxTokens,
    byok: aiSettings,
  }), [activePlanModelId, aiMode, aiSettings]);

  useEffect(() => {
    const stored = loadModelSelection();
    const shouldDefaultToPlan = isLoggedIn && (aiSettings.preferPlanModels || stored.mode === "plan");
    setAiMode(shouldDefaultToPlan ? "plan" : "byok");
    setPlanModelId(stored.planModelId);
  }, [isLoggedIn, aiSettings.preferPlanModels]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tokens = await window.codegrey?.auth?.loadTokens?.();
      const models = await fetchModelCatalog(tokens?.access_token);
      if (!cancelled) setModelCatalog(models);
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    saveModelSelection({
      mode: aiMode,
      planModelId: activePlanModelId,
      byokModelId: "byok-local",
    });
  }, [activePlanModelId, aiMode]);

  return {
    modelCatalog,
    aiMode,
    setAiMode,
    planModelId,
    setPlanModelId,
    availablePlanModels,
    activePlanModelId,
    aiRequest,
  };
}
