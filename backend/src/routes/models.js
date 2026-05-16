const express = require("express");
const fetch = require("node-fetch");
const { getDefaultModelCatalog } = require("../models/catalog");
const { getAccessToken, getSupabaseConfig } = require("../usage/supabaseUsage");

const router = express.Router();

router.get("/models", async (req, res) => {
  const token = getAccessToken(req);
  if (!token) return res.json({ models: getDefaultModelCatalog() });

  try {
    const { url, anonKey } = getSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/model_catalog?select=id,display_name,provider_model,description,capabilities,plan_tiers,context_window,max_output_tokens,enabled,is_default,sort_order,provider:model_providers(label,provider_type)&enabled=eq.true&order=sort_order.asc`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!response.ok) throw new Error(`Supabase model catalog failed with ${response.status}`);
    const rows = await response.json();
    const models = rows.map(toClientModel).filter(Boolean);
    res.json({ models: models.length ? models : getDefaultModelCatalog() });
  } catch (err) {
    console.warn("[models] falling back to local catalog:", err.message);
    res.json({ models: getDefaultModelCatalog() });
  }
});

function toClientModel(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    provider: row.provider?.provider_type || row.provider?.label || "unknown",
    providerModel: row.provider_model,
    mode: "plan",
    description: row.description || "",
    capabilities: row.capabilities || ["chat", "tools"],
    planTiers: row.plan_tiers || ["free", "pro", "team", "enterprise"],
    contextWindow: row.context_window,
    maxOutputTokens: row.max_output_tokens,
    enabled: row.enabled !== false,
    isDefault: Boolean(row.is_default),
    sortOrder: row.sort_order ?? 100,
  };
}

module.exports = router;
