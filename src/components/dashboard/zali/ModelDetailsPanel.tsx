import { Box, Weight, Ruler, Cpu, Layers, Zap, Shield, Factory } from "lucide-react";
import type { ZaliProject } from "./types";
import { specList } from "./zaliPrompt";

interface Props {
  project: ZaliProject;
}

const ModelDetailsPanel = ({ project }: Props) => {
  const specs = project.specifications as Record<string, unknown>;
  const cost = project.costAnalysis as Record<string, unknown>;
  const mfg = project.manufacturing as Record<string, unknown>;
  const sims = project.simulationResults as Record<string, unknown>;

  const details = [
    { icon: Ruler, label: "dimensions", value: specs?.dimensions },
    { icon: Weight, label: "weight", value: specs?.weight },
    { icon: Zap, label: "power", value: specs?.power },
    { icon: Factory, label: "process", value: mfg?.primary_process },
    { icon: Cpu, label: "lead time", value: mfg?.estimated_lead_time },
    { icon: Shield, label: "safety", value: sims?.safety_rating },
    { icon: Box, label: "unit cost", value: cost?.estimated_unit_cost },
    { icon: Layers, label: "moq", value: mfg?.minimum_order_quantity },
  ].filter((d) => d.value !== undefined && d.value !== null && d.value !== "");

  const materials = specList(specs, "materials");
  const components = specList(specs, "components");
  const features = specList(specs, "key_features");
  const targets = specs?.performance_targets && typeof specs.performance_targets === "object" && !Array.isArray(specs.performance_targets)
    ? (specs.performance_targets as Record<string, unknown>)
    : null;

  const Chips = ({ label, items, tone }: { label: string; items: string[]; tone: string }) => items.length ? (
    <div className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-3">
      <p className="text-[9px] tracking-wider text-muted-foreground/50 mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m, i) => <span key={i} className={`px-2 py-0.5 rounded-md text-[10px] border ${tone}`}>{m}</span>)}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {details.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {details.map((d, i) => (
            <div key={i} className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <d.icon className="h-3 w-3 text-accent/70" />
                <span className="text-[9px] tracking-wider text-muted-foreground/50">{d.label}</span>
              </div>
              <p className="text-[11px] font-light text-foreground truncate">{String(d.value)}</p>
            </div>
          ))}
        </div>
      )}

      <Chips label="materials" items={materials} tone="bg-blue-500/10 text-blue-400 border-blue-500/10" />
      <Chips label="components" items={components} tone="bg-violet-500/10 text-violet-400 border-violet-500/10" />
      <Chips label="key features" items={features} tone="bg-emerald-500/10 text-emerald-400 border-emerald-500/10" />

      {targets && Object.keys(targets).length > 0 && (
        <div className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-3">
          <p className="text-[9px] tracking-wider text-muted-foreground/50 mb-2">performance targets</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(targets).map(([k, v]) => (
              <div key={k} className="text-[10px]">
                <span className="text-muted-foreground/50">{k.replace(/_/g, " ")}: </span>
                <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {details.length === 0 && !materials.length && !components.length && !features.length && !targets && (
        <p className="text-[10px] text-muted-foreground/40">the record holds data, but none of the fields this panel knows how to show. see the specs tab for the raw record.</p>
      )}
    </div>
  );
};

export default ModelDetailsPanel;
