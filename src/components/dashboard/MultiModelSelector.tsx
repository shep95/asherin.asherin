import { useState } from "react";
import { Layers, Check, ChevronDown, X } from "lucide-react";
import { AI_PROVIDERS } from "@/lib/aiProviders";

export interface SelectedModel {
  provider: string;
  model: string;
  label: string;
}

interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  selectedModels: SelectedModel[];
  onModelsChange: (models: SelectedModel[]) => void;
  storedProviders: string[]; // providers that have API keys stored
}

const MultiModelSelector = ({ enabled, onToggle, selectedModels, onModelsChange, storedProviders }: Props) => {
  const [open, setOpen] = useState(false);

  // BYOK-only: consensus runs across the user's connected providers.
  const availableProviders = AI_PROVIDERS
    .filter(p => storedProviders.includes(p.id))
    .flatMap(p => p.models.map(m => ({ provider: p.id, model: m.id, label: `${p.name} → ${m.name}` })));

  const toggleModel = (m: { provider: string; model: string; label: string }) => {
    const exists = selectedModels.find(s => s.provider === m.provider && s.model === m.model);
    if (exists) {
      onModelsChange(selectedModels.filter(s => !(s.provider === m.provider && s.model === m.model)));
    } else if (selectedModels.length < 4) {
      onModelsChange([...selectedModels, m]);
    }
  };

  const isSelected = (provider: string, model: string) =>
    selectedModels.some(s => s.provider === provider && s.model === model);

  return (
    <div className="relative">
      <button
        onClick={() => onToggle(!enabled)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-light transition-all ${
          enabled
            ? "bg-foreground/10 text-foreground border border-foreground/20"
            : "text-muted-foreground/50 hover:text-muted-foreground/70 border border-transparent"
        }`}
        title="Multi-Model Consensus"
      >
        <Layers className="h-3 w-3" />
        <span className="hidden sm:inline">Consensus</span>
        {enabled && selectedModels.length > 0 && (
          <span className="bg-foreground/15 rounded-full px-1.5 text-[9px]">{selectedModels.length}</span>
        )}
      </button>

      {enabled && (
        <button
          onClick={() => setOpen(!open)}
          className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground border border-border/15 hover:border-border/30 transition-colors"
        >
          Models
          <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && enabled && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-72 rounded-xl border border-border/20 bg-card/95 backdrop-blur-xl shadow-2xl p-3 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-light tracking-wider text-muted-foreground/50 uppercase">Select 2-4 Models</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground/40 hover:text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>

          {availableProviders.length < 2 && (
            <p className="text-[10px] text-muted-foreground/40 py-2">
              Add API keys in Settings → AI Model Keys to enable more models.
            </p>
          )}

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {availableProviders.map((m) => {
              const selected = isSelected(m.provider, m.model);
              const disabled = !selected && selectedModels.length >= 4;
              // Tradeoff hints
              const traits: Record<string, { speed: string; quality: string; cost: string }> = {
                "gemini-2.5-flash": { speed: "Fast", quality: "Good", cost: "Low" },
                "gemini-2.5-pro": { speed: "Slow", quality: "Best", cost: "High" },
                "gpt-5": { speed: "Slow", quality: "Best", cost: "High" },
                "gpt-5-mini": { speed: "Fast", quality: "Good", cost: "Medium" },
                "sonar-pro": { speed: "Fast", quality: "Best", cost: "Medium" },
                "sonar": { speed: "Fast", quality: "Good", cost: "Low" },
                "sonar-deep-research": { speed: "Slow", quality: "Best", cost: "High" },
              };
              const trait = traits[m.model];
              return (
                <button
                  key={`${m.provider}-${m.model}`}
                  onClick={() => !disabled && toggleModel(m)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all ${
                    selected
                      ? "bg-foreground/10 border border-foreground/20"
                      : disabled
                        ? "opacity-30 cursor-not-allowed border border-transparent"
                        : "border border-border/10 hover:bg-foreground/5"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    selected ? "border-foreground/40 bg-foreground/15" : "border-border/30"
                  }`}>
                    {selected && <Check className="h-2.5 w-2.5 text-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-light text-foreground truncate block">{m.label}</span>
                    {trait && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground/40">⚡ {trait.speed}</span>
                        <span className="text-[9px] text-muted-foreground/40">✦ {trait.quality}</span>
                        <span className="text-[9px] text-muted-foreground/40">$ {trait.cost}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedModels.length > 0 && selectedModels.length < 2 && (
            <p className="text-[9px] text-amber-400/60 pt-1">Select at least 2 models for consensus.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiModelSelector;
