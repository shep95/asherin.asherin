import { useState } from "react";
import { Activity, Thermometer, Zap, Wind, Waves, FlaskConical, Timer, CheckCircle2, XCircle, Shield, Play, Loader2, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ZaliProject } from "./types";

const SIMULATION_TYPES = [
  { id: "mechanical", label: "Structural / FEA", icon: Activity, description: "Stress, strain, deformation analysis" },
  { id: "thermal", label: "Thermal", icon: Thermometer, description: "Heat transfer, hotspot detection" },
  { id: "electrical", label: "Circuit / SPICE", icon: Zap, description: "Voltage, current, signal integrity" },
  { id: "fluids", label: "CFD / Fluids", icon: Wind, description: "Airflow, pressure drop, turbulence" },
  { id: "vibration", label: "Vibration", icon: Waves, description: "Resonance, damping, fatigue" },
  { id: "chemical", label: "Chemical", icon: FlaskConical, description: "Reaction rates, stability, corrosion" },
];

interface Props { project: ZaliProject | null; }

const SimulationEnginePanel = ({ project }: Props) => {
  const { user } = useAuth();
  const [selectedSim, setSelectedSim] = useState("mechanical");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});

  const runSimulation = async (simId: string) => {
    if (!project || !user) return;
    setRunning(true);
    setSelectedSim(simId);

    try {
      const { data, error } = await supabase.functions.invoke("zali-analyze", {
        body: {
          analysisType: `simulation_${simId}`,
          projectData: {
            name: project.name,
            description: project.description || "",
            specs: project.specs || {},
            materials: project.materials || [],
          },
        },
      });
      if (error) throw error;
      setResults(prev => ({ ...prev, [simId]: data.result }));
      
      // Save to DB
      await supabase.from("zali_simulation_results").insert({
        user_id: user.id,
        project_name: project.name,
        sim_type: simId,
        status: data.result?.status || "complete",
        results: data.result,
      });
    } catch (err) {
      toast.error("Simulation failed — check project data");
    }
    setRunning(false);
  };

  const result = results[selectedSim];
  const completedSims = Object.keys(results);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-400" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Simulation Engine</h2>
          </div>
          <span className="text-[9px] text-muted-foreground/50">AI-Powered Analysis</span>
        </div>

        {!project ? (
          <div className="text-center py-12 space-y-3">
            <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto" />
            <p className="text-sm font-extralight text-muted-foreground/40">Create a project with design data to run simulations</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SIMULATION_TYPES.map(sim => {
                const isCompleted = completedSims.includes(sim.id);
                const isActive = running && selectedSim === sim.id;
                return (
                  <button key={sim.id} onClick={() => !running && runSimulation(sim.id)} disabled={running}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      isActive ? "border-amber-500/40 bg-amber-500/10" :
                      isCompleted ? "border-emerald-500/20 bg-emerald-500/5" :
                      selectedSim === sim.id ? "border-border/30 bg-card/30" :
                      "border-border/15 bg-card/20 hover:border-border/30"
                    } disabled:opacity-60`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <sim.icon className={`h-4 w-4 ${isCompleted ? "text-emerald-400" : isActive ? "text-amber-400 animate-pulse" : "text-muted-foreground/50"}`} />
                      {isCompleted && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                      {isActive && <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />}
                    </div>
                    <p className="text-[10px] font-light text-foreground">{sim.label}</p>
                    <p className="text-[8px] text-muted-foreground/40">{sim.description}</p>
                  </button>
                );
              })}
            </div>

            {running && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
                <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                <span className="text-[10px] text-amber-400">Running AI-powered {SIMULATION_TYPES.find(s => s.id === selectedSim)?.label} analysis...</span>
              </div>
            )}

            {result && !running && (
              <div className={`rounded-xl border p-4 ${result.status === "pass" ? "border-emerald-500/20 bg-emerald-500/5" : result.status === "fail" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                <div className="flex items-center gap-2 mb-3">
                  {result.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-amber-400" />}
                  <h3 className="text-xs font-light text-foreground">
                    {result.status === "pass" ? "SIMULATION PASSED" : result.status === "fail" ? "SIMULATION FAILED" : "◇ ISSUE DETECTED"}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {Object.entries(result).filter(([k]) => !["status", "recommendations"].includes(k)).map(([key, val]) => (
                    <div key={key} className="rounded-lg bg-card/30 border border-border/10 p-2.5">
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                      <p className="text-[11px] font-light text-foreground">{String(val)}</p>
                    </div>
                  ))}
                </div>
                {result.recommendations && (
                  <div className="mt-3 pt-3 border-t border-border/10 space-y-1.5">
                    <p className="text-[10px] font-light text-emerald-400 flex items-center gap-1.5"><Shield className="h-3 w-3" /> Recommendations</p>
                    {result.recommendations.map((rec: string, i: number) => (
                      <p key={i} className="text-[10px] text-muted-foreground/70 pl-4">• {rec}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!running && completedSims.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[10px] text-muted-foreground/40">Click a simulation type above to run AI-powered analysis on your design</p>
              </div>
            )}

            {!running && completedSims.length > 0 && completedSims.length < SIMULATION_TYPES.length && (
              <button onClick={() => {
                const next = SIMULATION_TYPES.find(s => !completedSims.includes(s.id));
                if (next) runSimulation(next.id);
              }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 hover:bg-accent/20 py-3 text-xs font-light text-accent transition-all">
                <Play className="h-3.5 w-3.5" /> Run Next Simulation
              </button>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
};

export default SimulationEnginePanel;
