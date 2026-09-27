import { FileText, Download } from "lucide-react";
import type { ZaliProject } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  project: ZaliProject | null;
}

const ZaliSpecsPanel = ({ project }: Props) => {
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-extralight text-muted-foreground/40">No active project</p>
      </div>
    );
  }

  const specs = project.specifications as Record<string, unknown>;
  const cost = project.costAnalysis as Record<string, unknown>;
  const mfg = project.manufacturing as Record<string, unknown>;
  const sims = project.simulationResults as Record<string, unknown>;

  const hasSpecs = Object.keys(specs).length > 0;
  const hasCost = Object.keys(cost).length > 0;
  const hasMfg = Object.keys(mfg).length > 0;
  const hasSims = Object.keys(sims).length > 0;

  const renderJson = (data: Record<string, unknown>, label: string) => {
    if (Object.keys(data).length === 0) {
      return (
        <div className="rounded-xl border border-border/10 bg-card/20 p-3 sm:p-4">
          <p className="text-[10px] text-muted-foreground/40">{label} will populate as ZANOEM processes your design</p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-border/10 bg-card/20 p-3 sm:p-4">
        <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Project Specifications</h3>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
            <Download className="h-3 w-3" />
            Export
          </button>
        </div>

        <div className="grid gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-accent" />
              <span className="text-[11px] font-light text-foreground">Technical Specifications</span>
              {!hasSpecs && <span className="text-[9px] text-muted-foreground/30">Pending</span>}
            </div>
            {renderJson(specs, "Specifications")}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-[11px] font-light text-foreground">Cost Analysis</span>
              {!hasCost && <span className="text-[9px] text-muted-foreground/30">Pending</span>}
            </div>
            {renderJson(cost, "Cost analysis")}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-light text-foreground">Manufacturing Plan</span>
              {!hasMfg && <span className="text-[9px] text-muted-foreground/30">Pending</span>}
            </div>
            {renderJson(mfg, "Manufacturing plan")}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-light text-foreground">Simulation Results</span>
              {!hasSims && <span className="text-[9px] text-muted-foreground/30">Pending</span>}
            </div>
            {renderJson(sims, "Simulation results")}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};

export default ZaliSpecsPanel;