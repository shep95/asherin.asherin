import { useState } from "react";
import { Sparkles, Waves, Atom, Heart, Brain, Hexagon, Music, Eye, Zap, Sun, FlaskConical, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SOLFEGGIO_FREQUENCIES = [
  { freq: "396 Hz", label: "Liberation", color: "text-red-400", desc: "Releases guilt & fear" },
  { freq: "417 Hz", label: "Change", color: "text-orange-400", desc: "Facilitates transformation" },
  { freq: "528 Hz", label: "DNA Repair", color: "text-emerald-400", desc: "Healing & restoration" },
  { freq: "639 Hz", label: "Connection", color: "text-cyan-400", desc: "Relationships & harmony" },
  { freq: "741 Hz", label: "Awakening", color: "text-blue-400", desc: "Intuition & expression" },
  { freq: "852 Hz", label: "Intuition", color: "text-indigo-400", desc: "Inner awareness" },
  { freq: "963 Hz", label: "Crown", color: "text-violet-400", desc: "Divine consciousness" },
];

const SACRED_GEOMETRIES = [
  { name: "Flower of Life", use: "Healing, water structuring" },
  { name: "Metatron's Cube", use: "Energy channeling" },
  { name: "Sri Yantra", use: "Consciousness expansion" },
  { name: "Fibonacci Spiral", use: "Natural growth patterns" },
  { name: "Torus Field", use: "Energy containment" },
  { name: "Platonic Solids", use: "Elemental alignment" },
];

const CONSCIOUSNESS_FEATURES = [
  { icon: Waves, name: "Consciousness Field Simulator", desc: "Maps intentions to resonant frequencies" },
  { icon: Heart, name: "Biofield Optimizer", desc: "Aligns with human electromagnetic field" },
  { icon: Brain, name: "Brainwave Entrainment", desc: "Alpha, theta, delta wave targeting" },
  { icon: Atom, name: "Quantum Entanglement Engine", desc: "Non-local communication design" },
  { icon: Hexagon, name: "Sacred Geometry Generator", desc: "Auto-applies phi ratio & Fibonacci" },
  { icon: Music, name: "Cymatics Pattern Engine", desc: "Sound → geometric pattern mapping" },
  { icon: Eye, name: "Third Eye Resonator", desc: "Pineal gland frequency optimization" },
  { icon: Zap, name: "Zero-Point Energy Harvester", desc: "Casimir effect + consciousness amp" },
  { icon: Sun, name: "Schumann Resonance Harmonizer", desc: "Earth frequency alignment (7.83 Hz)" },
  { icon: FlaskConical, name: "Living Material Synthesizer", desc: "Consciousness-responsive mycelium" },
];

const GodModePanel = () => {
  const [tab, setTab] = useState<"consciousness" | "frequencies" | "geometry" | "quantum">("consciousness");
  const [selectedFreq, setSelectedFreq] = useState<string | null>(null);
  const [godModeActive, setGodModeActive] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, string>>({});
  const [quantumQuery, setQuantumQuery] = useState("");
  const [quantumResult, setQuantumResult] = useState("");
  const [quantumLoading, setQuantumLoading] = useState(false);

  const analyzeFeature = async (featureName: string) => {
    setAnalyzing(featureName);
    try {
      const { data, error } = await supabase.functions.invoke("zali-chat", {
        body: {
          messages: [{ role: "user", content: `Analyze and explain how "${featureName}" works in the context of consciousness-integrated design. Provide specific parameters, frequencies, or configurations that would be applied. Keep it concise (3-4 sentences) and technical.` }],
          mode: "research",
          depth: "deep",
        },
      });
      if (error) throw error;
      setAnalysisResults(prev => ({ ...prev, [featureName]: data.reply || data.response || "Analysis complete." }));
    } catch {
      toast.error("Analysis failed");
    }
    setAnalyzing(null);
  };

  const runQuantumAnalysis = async () => {
    if (!quantumQuery.trim()) return;
    setQuantumLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("zali-chat", {
        body: {
          messages: [{ role: "user", content: `Quantum Technology Research Query: "${quantumQuery}". Provide a detailed analysis of the current state of this quantum technology, including: theoretical basis, current research progress, practical challenges, and potential design applications. Be specific and technical.` }],
          mode: "research",
          depth: "expert",
        },
      });
      if (error) throw error;
      setQuantumResult(data.reply || data.response || "Analysis complete.");
    } catch {
      toast.error("Quantum analysis failed");
    }
    setQuantumLoading(false);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">God Mode</h2>
            <span className="text-[8px] px-2 py-0.5 rounded-full border border-violet-500/30 text-violet-400 bg-violet-500/10">EXPERIMENTAL</span>
          </div>
          <button onClick={() => setGodModeActive(!godModeActive)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-all ${godModeActive ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "bg-foreground/5 text-muted-foreground/50 border border-border/20 hover:text-foreground"}`}>
            {godModeActive ? "● Active" : "○ Inactive"}
          </button>
        </div>

        <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-indigo-500/5 to-purple-500/5 p-4">
          <p className="text-[11px] font-light text-foreground mb-1">Beyond Technology: Consciousness-Integrated Design</p>
          <p className="text-[9px] text-muted-foreground/60">
            God Mode integrates consciousness fields, sacred geometry, quantum mechanics, and biofield science into the design pipeline.
          </p>
        </div>

        <div className="flex gap-1">
          {(["consciousness", "frequencies", "geometry", "quantum"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-colors capitalize ${tab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
            >{t}</button>
          ))}
        </div>

        {tab === "consciousness" && (
          <div className="space-y-2.5">
            {CONSCIOUSNESS_FEATURES.map(feat => (
              <div key={feat.name} className={`rounded-xl border p-3.5 transition-all ${godModeActive ? "border-violet-500/20 bg-violet-500/5" : "border-border/15 bg-card/20"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <feat.icon className={`h-4 w-4 ${godModeActive ? "text-violet-400" : "text-muted-foreground/30"}`} />
                    <div>
                      <p className="text-[11px] font-light text-foreground">{feat.name}</p>
                      <p className="text-[9px] text-muted-foreground/50">{feat.desc}</p>
                    </div>
                  </div>
                  <button onClick={() => analyzeFeature(feat.name)} disabled={!!analyzing}
                    className="text-[8px] px-2 py-1 rounded-md bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50">
                    {analyzing === feat.name ? <Loader2 className="h-3 w-3 animate-spin" /> : "Analyze"}
                  </button>
                </div>
                {analysisResults[feat.name] && (
                  <div className="mt-2 pt-2 border-t border-border/10">
                    <p className="text-[9px] text-muted-foreground/70 leading-relaxed">{analysisResults[feat.name]}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "frequencies" && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground/60">
              Solfeggio frequencies mapped to design intent for consciousness-enhanced design.
            </p>
            <div className="grid gap-2">
              {SOLFEGGIO_FREQUENCIES.map(f => (
                <button key={f.freq} onClick={() => setSelectedFreq(selectedFreq === f.freq ? null : f.freq)}
                  className={`rounded-xl border p-3.5 text-left transition-all ${selectedFreq === f.freq ? "border-violet-500/30 bg-violet-500/10" : "border-border/15 bg-card/20 hover:border-border/30"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-extralight ${f.color}`}>{f.freq}</span>
                      <div>
                        <p className="text-[11px] font-light text-foreground">{f.label}</p>
                        <p className="text-[9px] text-muted-foreground/50">{f.desc}</p>
                      </div>
                    </div>
                    <Music className={`h-3.5 w-3.5 ${selectedFreq === f.freq ? "text-violet-400 animate-pulse" : "text-muted-foreground/20"}`} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "geometry" && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground/60">
              Sacred geometry patterns applied to optimize structural integrity and energy flow.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {SACRED_GEOMETRIES.map(geo => (
                <div key={geo.name} className="rounded-xl border border-border/15 bg-card/20 p-3.5">
                  <Hexagon className="h-5 w-5 text-violet-400/50 mb-2" />
                  <p className="text-[11px] font-light text-foreground">{geo.name}</p>
                  <p className="text-[9px] text-muted-foreground/50">{geo.use}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "quantum" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Atom className="h-4 w-4 text-blue-400" />
                <h3 className="text-xs font-light text-foreground">Quantum Technologies Research</h3>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mb-4">
                Query the AI about any quantum technology, consciousness integration, or advanced physics concept.
              </p>
              <div className="flex items-center gap-2">
                <input value={quantumQuery} onChange={e => setQuantumQuery(e.target.value)} placeholder="e.g. Quantum coherence in biological systems..."
                  onKeyDown={e => e.key === "Enter" && runQuantumAnalysis()}
                  className="flex-1 rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                <button onClick={runQuantumAnalysis} disabled={quantumLoading || !quantumQuery.trim()}
                  className="rounded-lg bg-blue-500/20 text-blue-400 px-4 py-2 text-xs hover:bg-blue-500/30 transition-colors disabled:opacity-50">
                  {quantumLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Research"}
                </button>
              </div>
              {quantumResult && (
                <div className="mt-4 rounded-lg border border-blue-500/10 bg-card/30 p-3.5">
                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{quantumResult}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default GodModePanel;
