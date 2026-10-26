import { useState, useEffect } from "react";
import { Atom, Box, Activity, RotateCw, Package, Puzzle } from "lucide-react";
import type { ZaliPhase, ZaliProject } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import ModelDetailsPanel from "./ModelDetailsPanel";
import Zali3DModel, { type ViewMode } from "./Zali3DModel";
import ZaliMaterialsView from "./ZaliMaterialsView";
import ZaliCodeOutputPanel from "./ZaliCodeOutputPanel";
import { hasDesignData, isSoftwareProject } from "./zaliPrompt";

const PHASE_CONFIG: Record<ZaliPhase, { label: string; color: string; description: string }> = {
  understanding: { label: "understanding", color: "text-blue-400", description: "questions before answers" },
  research: { label: "research", color: "text-emerald-400", description: "domain findings gathered" },
  design: { label: "design", color: "text-accent", description: "the spec is taking shape" },
  simulation: { label: "simulation", color: "text-amber-400", description: "estimates and checks" },
  iteration: { label: "iteration", color: "text-cyan-400", description: "refining against trade-offs" },
  documentation: { label: "documentation", color: "text-pink-400", description: "ready to export" },
};

interface Props {
  project: ZaliProject | null;
  autoBuild?: boolean;
  codeFiles?: Array<{ filename: string; language: string; content: string }>;
}

const ZaliWorkspace = ({ project, autoBuild, codeFiles = [] }: Props) => {
  const [viewMode, setViewMode] = useState<ViewMode>("assembled");
  const [designTab, setDesignTab] = useState<"product" | "materials">("product");
  const [showModel, setShowModel] = useState(false);

  const phase = project?.phase ?? "understanding";
  const phaseConfig = PHASE_CONFIG[phase] ?? PHASE_CONFIG.understanding;
  const ready = hasDesignData(project);

  // A spec arriving from chat (or an item attached from a library tab) opens the viewport.
  useEffect(() => {
    if (autoBuild && ready) setShowModel(true);
  }, [autoBuild, ready]);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
        <div className="relative">
          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-border/20 flex items-center justify-center">
            <Atom className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/20 motion-safe:animate-spin" style={{ animationDuration: "8s" }} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-extralight text-muted-foreground">design workspace</p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">create a project to open the viewport</p>
        </div>
      </div>
    );
  }

  if (isSoftwareProject(project)) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <ZaliCodeOutputPanel codeFiles={codeFiles} projectType={project.designType} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Phase + view mode */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-2 w-2 rounded-full ${phaseConfig.color} bg-current flex-shrink-0`} aria-hidden="true" />
          <div className="min-w-0">
            <span className={`text-[10px] font-light tracking-[0.2em] ${phaseConfig.color}`}>{phaseConfig.label}</span>
            <p className="text-[9px] text-muted-foreground/50 hidden sm:block truncate">{phaseConfig.description}</p>
          </div>
        </div>
        {ready && designTab === "product" && showModel && (
          <div className="flex items-center gap-0.5 sm:gap-1" role="group" aria-label="viewport layout">
            {(["assembled", "exploded"] as const).map((vm) => (
              <button
                key={vm}
                onClick={() => setViewMode(vm)}
                aria-pressed={viewMode === vm}
                className={`px-2 py-1 rounded text-[9px] whitespace-nowrap transition-colors active:scale-95 ${
                  viewMode === vm ? "bg-foreground/10 text-foreground" : "text-muted-foreground/40 hover:text-foreground"
                }`}
              >
                {vm}
              </button>
            ))}
          </div>
        )}
      </div>

      {ready && (
        <div className="flex-shrink-0 px-3 sm:px-4 py-1.5 border-b border-border/15 flex items-center gap-1" role="tablist" aria-label="workspace view">
          <button
            role="tab"
            aria-selected={designTab === "product"}
            onClick={() => setDesignTab("product")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] transition-colors active:scale-95 ${
              designTab === "product" ? "bg-accent/15 text-accent border border-accent/20" : "text-muted-foreground/40 hover:text-foreground hover:bg-foreground/5 border border-transparent"
            }`}
          >
            <Package className="h-3 w-3" /> product
          </button>
          <button
            role="tab"
            aria-selected={designTab === "materials"}
            onClick={() => setDesignTab("materials")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] transition-colors active:scale-95 ${
              designTab === "materials" ? "bg-accent/15 text-accent border border-accent/20" : "text-muted-foreground/40 hover:text-foreground hover:bg-foreground/5 border border-transparent"
            }`}
          >
            <Puzzle className="h-3 w-3" /> materials
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="relative min-h-[280px] sm:min-h-[400px]">
          <div className="absolute inset-0 opacity-5 pointer-events-none" aria-hidden="true">
            <svg width="100%" height="100%">
              <defs>
                <pattern id="zali-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#zali-grid)" />
            </svg>
          </div>

          {!ready ? (
            <div className="flex items-center justify-center min-h-[280px] sm:min-h-[400px] px-6">
              <div className="text-center max-w-sm">
                <Atom className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-[11px] sm:text-xs font-light text-foreground/85 mt-3 tracking-[0.2em]">no spec yet</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground/55 mt-1.5 leading-relaxed">
                  answer shepherd's questions in the conversation, or add a material or component from its tab. whatever is recorded appears here.
                </p>
              </div>
            </div>
          ) : designTab === "materials" ? (
            <div className="relative z-10 min-h-[280px] sm:min-h-[400px]">
              <ZaliMaterialsView project={project} />
            </div>
          ) : !showModel ? (
            <div className="relative z-10 flex flex-col items-center justify-center min-h-[280px] sm:min-h-[350px] gap-4 p-4 sm:p-6">
              <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full border border-accent/20 flex items-center justify-center bg-accent/5">
                <Box className="h-7 w-7 sm:h-10 sm:w-10 text-accent/50" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-xs sm:text-sm font-light text-foreground">spec on record</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground/50 mt-1">
                  the viewport lays out materials, components and key features around the core.
                </p>
              </div>
              <button
                onClick={() => setShowModel(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-foreground text-[11px] sm:text-xs font-light hover:bg-accent/90 transition-all active:scale-95"
              >
                <Box className="h-4 w-4" /> open viewport
              </button>
            </div>
          ) : (
            <div className="relative z-10">
              <div className="relative h-[300px] sm:h-[400px] lg:h-[450px]">
                <Zali3DModel project={project} viewMode={viewMode} />
                <div className="absolute top-2 sm:top-3 left-2 sm:left-3">
                  <div className="px-2 py-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/20">
                    <p className="text-[8px] sm:text-[9px] text-muted-foreground/60">
                      <span className="text-accent" aria-hidden="true">●</span> {project.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModel(false)}
                  className="absolute top-2 sm:top-3 right-2 sm:right-3 p-1.5 rounded-md bg-background/70 backdrop-blur-sm border border-border/20 text-muted-foreground/50 hover:text-foreground transition-colors active:scale-95"
                  title="close viewport"
                  aria-label="close viewport"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="px-3 sm:px-4 pb-4 pt-3 border-t border-border/10">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[10px] sm:text-[11px] font-light tracking-wider text-foreground">on record</span>
                </div>
                <ModelDetailsPanel project={project} />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ZaliWorkspace;
