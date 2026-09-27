// IDE Pain Point #21: Multi-model routing badge. Shows which model will be used
// for the next AI request and lets the user manually override.
import { Cpu, ChevronDown } from "lucide-react";
import { TASK_LABELS, type IdeModelId, type RoutingDecision } from "@/lib/ide";
import { useState } from "react";

interface Props {
  decision: RoutingDecision;
  onOverride: (model: IdeModelId | null) => void;
  isOverridden: boolean;
}

const ALL_MODELS: { id: IdeModelId; label: string }[] = [
  { id: "google/gemini-2.5-flash",      label: "Gemini 2.5 Flash (default)" },
  { id: "google/gemini-2.5-pro",        label: "Gemini 2.5 Pro" },
  { id: "openai/gpt-5",                 label: "GPT-5" },
  { id: "openai/gpt-5-mini",            label: "GPT-5 Mini" },
  { id: "openai/gpt-5.2",               label: "GPT-5.2 (reasoning)" },
];

export default function IdeModelRouterBadge({ decision, onOverride, isOverridden }: Props) {
  const [open, setOpen] = useState(false);
  const label = ALL_MODELS.find(m => m.id === decision.model)?.label ?? decision.model;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/30 bg-card/40 text-[9px] font-light hover:bg-card/60"
        title={`Task: ${TASK_LABELS[decision.task]} — ${decision.reason}`}
      >
        <Cpu className="size-2.5 opacity-60" />
        <span className="opacity-90">{label}</span>
        {isOverridden && <span className="text-muted-foreground/70">·manual</span>}
        <ChevronDown className="size-2.5 opacity-50" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[220px] rounded-md border border-border/30 bg-popover/95 backdrop-blur-md shadow-2xl z-[100] py-1">
          <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 border-b border-border/20">
            Detected: {TASK_LABELS[decision.task]}
          </div>
          <button
            onClick={() => { onOverride(null); setOpen(false); }}
            className={`w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-card/60 flex items-center justify-between ${!isOverridden ? "text-foreground/90" : ""}`}
          >
            <span>Auto-route</span>
            {!isOverridden && <span className="text-[9px]">●</span>}
          </button>
          <div className="border-t border-border/20" />
          {ALL_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onOverride(m.id); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-card/60 flex items-center justify-between ${isOverridden && decision.model === m.id ? "text-foreground/90" : ""}`}
            >
              <span>{m.label}</span>
              {isOverridden && decision.model === m.id && <span className="text-[9px]">●</span>}
            </button>
          ))}
          <div className="border-t border-border/20 px-2.5 py-1.5 text-[9px] text-muted-foreground/60 leading-relaxed">{decision.reason}</div>
        </div>
      )}
    </div>
  );
}
