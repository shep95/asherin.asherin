import { Box, Weight, Ruler, Cpu, Layers, Zap, Shield, Factory } from "lucide-react";
import type { ZaliProject } from "./types";

interface Props {
  project: ZaliProject;
}

const ModelDetailsPanel = ({ project }: Props) => {
  const specs = project.specifications as Record<string, any>;
  const cost = project.costAnalysis as Record<string, any>;
  const mfg = project.manufacturing as Record<string, any>;
  const sims = project.simulationResults as Record<string, any>;

  const details = [
    { icon: Ruler, label: "Dimensions", value: specs?.dimensions },
    { icon: Weight, label: "Weight", value: specs?.weight },
    { icon: Zap, label: "Power", value: specs?.power },
    { icon: Factory, label: "Process", value: mfg?.primary_process },
    { icon: Cpu, label: "Lead Time", value: mfg?.estimated_lead_time },
    { icon: Shield, label: "Safety", value: sims?.safety_rating },
    { icon: Box, label: "Unit Cost", value: cost?.estimated_unit_cost },
    { icon: Layers, label: "MOQ", value: mfg?.minimum_order_quantity },
  ].filter(d => d.value);

  const materials = specs?.materials || [];
  const features = specs?.key_features || [];

  return (
    <div className="space-y-3">
      {/* Quick stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {details.map((d, i) => (
          <div key={i} className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <d.icon className="h-3 w-3 text-accent/70" />
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{d.label}</span>
            </div>
            <p className="text-[11px] font-light text-foreground truncate">{String(d.value)}</p>
          </div>
        ))}
      </div>

      {/* Materials */}
      {materials.length > 0 && (
        <div className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-2">Materials & Components</p>
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m: string, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/10">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Key features */}
      {features.length > 0 && (
        <div className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-2">Equipment & Features</p>
          <div className="space-y-1.5">
            {features.map((f: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-accent/60 mt-1.5 shrink-0" />
                <span className="text-[11px] font-light text-foreground">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance */}
      {specs?.performance_targets && (
        <div className="rounded-lg border border-border/15 bg-card/30 backdrop-blur-sm p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-2">Performance Targets</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(specs.performance_targets).map(([k, v]) => (
              <div key={k} className="text-[10px]">
                <span className="text-muted-foreground/50 capitalize">{k.replace(/_/g, " ")}: </span>
                <span className="text-foreground">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelDetailsPanel;
