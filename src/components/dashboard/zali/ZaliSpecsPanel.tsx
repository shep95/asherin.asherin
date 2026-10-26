import { FileText, Download } from "lucide-react";
import type { ZaliMessage, ZaliProject } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildProjectExport, downloadText } from "./zaliPrompt";

interface Props {
  project: ZaliProject | null;
  messages: ZaliMessage[];
}

const SECTIONS: { key: "specifications" | "costAnalysis" | "manufacturing" | "simulationResults"; label: string; color: string }[] = [
  { key: "specifications", label: "specifications", color: "text-accent" },
  { key: "costAnalysis", label: "cost analysis", color: "text-cyan-400" },
  { key: "manufacturing", label: "manufacturing", color: "text-amber-400" },
  { key: "simulationResults", label: "simulation results", color: "text-emerald-400" },
];

const ZaliSpecsPanel = ({ project, messages }: Props) => {
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-extralight text-muted-foreground/40">no project selected</p>
      </div>
    );
  }

  const exportProject = () => {
    const { filename, markdown } = buildProjectExport(project, messages);
    downloadText(filename, markdown);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground">project record</h3>
            <p className="text-[9px] text-muted-foreground/40 mt-0.5">what shepherd recorded in ```design_output fences, as stored on this device</p>
          </div>
          <button
            onClick={exportProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 border border-border/20 transition-colors flex-shrink-0"
            title="download the record and the conversation as markdown"
          >
            <Download className="h-3 w-3" />
            export .md
          </button>
        </div>

        <div className="grid gap-3 sm:gap-4">
          {SECTIONS.map((s) => {
            const data = (project[s.key] ?? {}) as Record<string, unknown>;
            const has = Object.keys(data).length > 0;
            return (
              <div key={s.key}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className={`h-3.5 w-3.5 ${s.color}`} />
                  <span className="text-[11px] font-light text-foreground">{s.label}</span>
                  {!has && <span className="text-[9px] text-muted-foreground/30">pending</span>}
                </div>
                <div className="rounded-xl border border-border/10 bg-card/20 p-3 sm:p-4">
                  {has ? (
                    <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/40">{s.label} fills in when shepherd records it</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
};

export default ZaliSpecsPanel;
