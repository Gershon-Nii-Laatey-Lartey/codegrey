import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { AiMode, ModelCatalogItem } from "../../types/ai";

export function ModelSelector({
  mode,
  planModelId,
  byokLabel,
  models,
  disabled,
  onModeChange,
  onPlanModelChange,
  onOpenSettings,
}: {
  mode: AiMode;
  planModelId: string;
  byokLabel: string;
  models: ModelCatalogItem[];
  disabled?: boolean;
  onModeChange: (mode: AiMode) => void;
  onPlanModelChange: (modelId: string) => void;
  onOpenSettings?: () => void;
}) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const activeModel = models.find((model) => model.id === planModelId) ?? models[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(event.target as Node)) {
        setModeMenuOpen(false);
      }
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="model-selector-minimal">
      {/* Mode Dropdown */}
      <div className="minimal-dropdown" ref={modeRef}>
        <button
          type="button"
          className="minimal-dropdown-trigger"
          onClick={() => !disabled && setModeMenuOpen(!modeMenuOpen)}
          disabled={disabled}
        >
          <span>{mode === "plan" ? "Plan" : "BYOK"}</span>
          <ChevronDown size={12} />
        </button>
        {modeMenuOpen && (
          <div className="minimal-dropdown-menu">
            <button
              type="button"
              className={mode === "plan" ? "active" : ""}
              onClick={() => {
                onModeChange("plan");
                setModeMenuOpen(false);
              }}
            >
              <div className="menu-item-content-stack">
                <span className="menu-item-name">Plan</span>
                <span className="menu-item-description">Use included models</span>
              </div>
            </button>
            <button
              type="button"
              className={mode === "byok" ? "active" : ""}
              onClick={() => {
                onModeChange("byok");
                setModeMenuOpen(false);
              }}
            >
              <div className="menu-item-content-stack">
                <span className="menu-item-name">BYOK</span>
                <span className="menu-item-description">Use your own keys</span>
              </div>
            </button>
          </div>
        )}
      </div>

      <div className="minimal-divider">/</div>

      {/* Model Dropdown */}
      <div className="minimal-dropdown" ref={modelRef}>
        <button
          type="button"
          className="minimal-dropdown-trigger"
          onClick={() => !disabled && setModelMenuOpen(!modelMenuOpen)}
          disabled={disabled || (mode === "plan" && models.length === 0)}
        >
          <span className="model-name-text">
            {mode === "plan" ? activeModel?.displayName || "Select Model" : byokLabel}
          </span>
          <ChevronDown size={12} />
        </button>
        {modelMenuOpen && mode === "plan" && (
          <div className="minimal-dropdown-menu">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                className={model.id === planModelId ? "active" : ""}
                onClick={() => {
                  onPlanModelChange(model.id);
                  setModelMenuOpen(false);
                }}
              >
                <div className="menu-item-content-stack">
                  <span className="menu-item-name">{model.displayName}</span>
                  {model.description && (
                    <span className="menu-item-description">{model.description}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        {modelMenuOpen && mode === "byok" && (
          <div className="minimal-dropdown-menu">
            <div className="menu-info-item">
              <div className="menu-item-content-stack">
                <span className="menu-item-name">BYOK Mode</span>
                <span className="menu-item-description">{byokLabel}</span>
              </div>
            </div>
            <button
              type="button"
              className="menu-hint-btn"
              onClick={() => {
                onOpenSettings?.();
                setModelMenuOpen(false);
              }}
            >
              Configure keys in settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
