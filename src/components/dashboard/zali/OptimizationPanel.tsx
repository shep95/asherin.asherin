import { useState } from "react";
import { Dna, Sparkles, Trophy, Sliders, Play, CheckCircle2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ZaliProject } from "./types";

const OBJECTIVES = [
  { id: "cost", label: "Cost", default: 40 },
  { id: "performance", label: "Performance", default: 30 },
  { id: "weight", label: "Weight", default: 20 },
  { id: "buildTime", label: "Build Time", default: 10 },
];

interface Props { project: ZaliProject | null; }

const OptimizationPanel = ({ project }: Props) => {
  const { user } = useAuth();
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(OBJECTIVES.map(o => [o.id, o.default]))
  );
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const runOptimization = async () => {
    if (!project || !user) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("zali-analyze", {
        body: {
          analysisType: "optimization",
          projectData: {
            name: project.name,
            description: project.description || "",
            specs: project.specs || {},
            materials: project.materials || [],
          },
          weights,
        },
      });
      if (error) throw error;
      setResults(data.result);

      await supabase.from("zali_optimization_results").insert({
        user_id: user.id,
        project_name: project.name,
        weights,
        results: data.result,
      });
    } catch {
      toast.error("Optimization failed");
    }
    setRunning(false);
  };

  const handleWeight = (id: string, val: number) => {
    const total = Object.values(weights).reduce((s, v) => s + v, 0) - weights[id] + val;
    if (total <= 100) setWeights(prev => ({ ...prev, [id]: val }));
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dna className="h-4 w-4 text-purple-400" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Multi-Objective Optimization</h2>
          </div>
          <span className="text-[9px] text-muted-foreground/50">AI-Powered</span>
        </div>

        {!project ? (
          <div className="text-center py-12 space-y-3">
            <Dna className="h-8 w-8 text-muted-foreground/20 mx-auto" />
            <p className="text-sm font-extralight text-muted-foreground/40">Create a design to optimize</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/15 bg-card/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sliders className="h-3.5 w-3.5 text-accent/60" />
                <h3 className="text-[11px] font-light text-foreground">Optimization Priorities</h3>
                <span className="ml-auto text-[9px] text-muted-foreground/40">Total: {Object.values(weights).reduce((s, v) => s + v, 0)}%</span>
              </div>
              <div className="space-y-3">
                {OBJECTIVES.map(obj => (
                  <div key={obj.id} className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground/60 w-20">{obj.label}</span>
                    <input type="range" min={0} max={100} value={weights[obj.id]}
                      onChange={(e) => handleWeight(obj.id, parseInt(e.target.value))}
                      className="flex-1 h-1 accent-accent" />
                    <span className="text-[10px] text-foreground w-8 text-right">{weights[obj.id]}%</span>
                  </div>
                ))}
              </div>
            </div>

            {!results && (
              <button onClick={runOptimization} disabled={running}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 py-3 text-xs font-light text-purple-400 transition-all disabled:opacity-50">
                {running ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running AI Optimization...</>
                ) : (
                  <><Play className="h-3.5 w-3.5" /> Run Optimization</>
                )}
              </button>
            )}

            {results?.designs && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <h3 className="text-xs font-light text-foreground">Optimized Designs</h3>
                </div>
                {results.designs.map((design: any, i: number) => (
                  <button key={i} onClick={() => setSelected(selected === i ? null : i)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${selected === i ? "border-accent/40 bg-accent/10" : "border-border/15 bg-card/20 hover:border-border/30"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-light text-foreground">{design.name}</span>
                        {design.badge && <span className="text-[9px] text-amber-400">{design.badge}</span>}
                      </div>
                      <span className="text-sm font-light text-accent">{design.score}/100</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {["cost", "performance", "weight", "buildTime"].map(key => {
                        const m = design[key];
                        if (!m) return null;
                        return (
                          <div key={key}>
                            <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">{key === "buildTime" ? "Build" : key}</p>
                            <p className="text-[11px] text-foreground">{m.value}</p>
                            <p className={`text-[9px] ${String(m.delta).startsWith("-") ? "text-emerald-400" : m.delta === "0%" ? "text-muted-foreground/40" : "text-amber-400"}`}>{m.delta}</p>
                          </div>
                        );
                      })}
                    </div>
                    {selected === i && (
                      <div className="space-y-2 pt-2 border-t border-border/10 animate-fade-in">
                        {design.changes && (
                          <div>
                            <p className="text-[9px] text-muted-foreground/50 mb-1">Key Changes:</p>
                            {design.changes.map((c: string, j: number) => (
                              <p key={j} className="text-[10px] text-foreground flex items-start gap-1.5">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /> {c}
                              </p>
                            ))}
                          </div>
                        )}
                        {design.tradeoffs && (
                          <div>
                            <p className="text-[9px] text-muted-foreground/50 mb-1">Trade-offs:</p>
                            {design.tradeoffs.map((t: string, j: number) => (
                              <p key={j} className="text-[10px] text-muted-foreground/60">• {t}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                ))}

                <button onClick={() => { setResults(null); setSelected(null); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/20 py-2.5 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors">
                  <Sparkles className="h-3 w-3" /> Re-optimize with new weights
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
};

export default OptimizationPanel;
