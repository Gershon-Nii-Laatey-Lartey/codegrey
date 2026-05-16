import { Check, Eye, EyeOff, KeyRound, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_AI_SETTINGS,
  PROVIDER_PRESETS,
  type AiSettings,
  type ProviderId,
} from "../types/ai";

export function Settings({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");

  const preset = useMemo(() => PROVIDER_PRESETS[settings.providerId], [settings.providerId]);
  const providerIds = Object.keys(PROVIDER_PRESETS) as ProviderId[];
  const temperatures = [0, 0.2, 0.5, 0.7, 1];

  useEffect(() => {
    let cancelled = false;
    void window.codegrey?.settings?.get().then((loaded) => {
      if (!cancelled && loaded) setSettings({ ...DEFAULT_AI_SETTINGS, ...loaded });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (partial: Partial<AiSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    setSaving(true);
    try {
      const saved = await window.codegrey?.settings?.set(next);
      if (saved) setSettings(saved);
    } finally {
      setSaving(false);
    }
  };

  const selectProvider = (providerId: ProviderId) => {
    const nextPreset = PROVIDER_PRESETS[providerId];
    void persist({
      providerId,
      baseUrl: providerId === "custom" ? settings.baseUrl : nextPreset.baseUrl,
      model: "",
    });
    setTestState("idle");
  };

  const testConnection = async () => {
    setTestState("testing");
    setTestError("");
    const result = await window.codegrey?.settings?.testConnection(settings);
    if (result?.ok) {
      setTestState("ok");
    } else {
      setTestState("error");
      setTestError(result?.error || "Connection failed.");
    }
  };

  return (
    <section className="settings-page" aria-label="Settings">
      <header className="settings-header">
        <div>
          <h1>Settings</h1>
          <p>Plan models are the default. BYOK remains available for power users.</p>
        </div>
        <button className="settings-close-btn" type="button" onClick={onBack} aria-label="Close settings">
          <X size={16} />
        </button>
      </header>

      <div className="settings-content">
        <section className="settings-section">
          <div className="settings-section-title">
            <h2>Plan Models</h2>
            <span>Default for signed-in users</span>
          </div>
          <button
            className="settings-toggle-row"
            type="button"
            data-enabled={settings.preferPlanModels}
            onClick={() => void persist({ preferPlanModels: !settings.preferPlanModels })}
          >
            <span className="settings-toggle-dot" />
            <span>
              <strong>Use Codegrey plan models by default</strong>
              <small>
                The composer model picker uses admin-enabled shared models first. Switch to BYOK from the composer when
                you want to use a local API key.
              </small>
            </span>
          </button>
        </section>

        <section className="settings-section" data-disabled={settings.preferPlanModels}>
          <div className="settings-section-title">
            <h2>BYOK Provider</h2>
            <span>{saving ? "Saving..." : "Saved locally"}</span>
          </div>
          <div className="settings-provider-grid" role="radiogroup" aria-label="AI provider">
            {providerIds.map((id) => (
              <button
                key={id}
                type="button"
                className="provider-choice"
                data-selected={settings.providerId === id}
                onClick={() => selectProvider(id)}
              >
                <span>{PROVIDER_PRESETS[id].label}</span>
              </button>
            ))}
          </div>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Base URL</span>
              <input
                value={settings.baseUrl}
                disabled={settings.providerId !== "custom"}
                onChange={(event) => setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))}
                onBlur={() => void persist({ baseUrl: settings.baseUrl })}
                placeholder={preset.baseUrl || "https://provider.example/v1"}
              />
            </label>
          </div>
        </section>

        <section className="settings-section" data-disabled={settings.preferPlanModels}>
          <div className="settings-section-title">
            <h2>API Key</h2>
          </div>
          <div className="api-key-row">
            <div className="settings-field settings-field-grow">
              <span>Key</span>
              <div className="secret-input">
                <KeyRound size={14} />
                <input
                  value={settings.apiKey}
                  type={showKey ? "text" : "password"}
                  onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))}
                  onBlur={() => void persist({ apiKey: settings.apiKey })}
                  placeholder={settings.providerId === "ollama" ? "Optional for local Ollama" : "Enter provider API key"}
                />
                <button type="button" onClick={() => setShowKey((shown) => !shown)} aria-label="Toggle API key visibility">
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button className="settings-icon-btn" type="button" onClick={() => void persist({ apiKey: settings.apiKey })} aria-label="Save API key">
              <Save size={14} />
            </button>
            <button className="settings-icon-btn" type="button" onClick={() => void persist({ apiKey: "" })} aria-label="Clear API key">
              <RotateCcw size={14} />
            </button>
            <button className="settings-primary-btn" type="button" onClick={testConnection} disabled={testState === "testing"}>
              {testState === "ok" ? <Check size={14} /> : null}
              {testState === "testing" ? "Testing" : "Test"}
            </button>
          </div>
          {testState === "error" ? <p className="settings-error">{testError}</p> : null}
          {testState === "ok" ? <p className="settings-ok">Connection succeeded.</p> : null}
        </section>

        <section className="settings-section" data-disabled={settings.preferPlanModels}>
          <div className="settings-section-title">
            <h2>Model</h2>
          </div>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Model name</span>
              <input
                value={settings.model}
                onChange={(event) => setSettings((prev) => ({ ...prev, model: event.target.value }))}
                onBlur={() => void persist({ model: settings.model })}
                placeholder={preset.placeholder}
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <h2>Generation</h2>
          </div>
          <div className="settings-grid">
            <div className="settings-field">
              <span>Temperature</span>
              <div className="temperature-control" role="radiogroup" aria-label="Temperature">
                {temperatures.map((temperature) => (
                  <button
                    key={temperature}
                    type="button"
                    data-selected={settings.temperature === temperature}
                    onClick={() => void persist({ temperature })}
                  >
                    {temperature.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="settings-field">
              <span>Max tokens</span>
              <input
                type="number"
                min="256"
                max="64000"
                value={settings.maxTokens}
                onChange={(event) => setSettings((prev) => ({ ...prev, maxTokens: Number(event.target.value) }))}
                onBlur={() => void persist({ maxTokens: settings.maxTokens })}
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <h2>Editor Behaviour</h2>
          </div>
          <button
            className="settings-toggle-row"
            type="button"
            data-enabled={settings.autoApply}
            onClick={() => void persist({ autoApply: !settings.autoApply })}
          >
            <span className="settings-toggle-dot" />
            <span>
              <strong>Auto-apply AI edits</strong>
              <small>
                AI-proposed file changes are written immediately without showing a diff approval card. The applied diff is
                still recorded in chat.
              </small>
            </span>
          </button>
        </section>
      </div>
    </section>
  );
}
