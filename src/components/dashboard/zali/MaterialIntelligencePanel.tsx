import { useState, useEffect } from "react";
import { Database, TrendingUp, AlertTriangle, Search, ArrowUpDown, CheckCircle2, Sparkles, Plus, Trash2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Material {
  id: string;
  name: string;
  category: string;
  success_rate: number;
  times_used: number;
  avg_cost: number;
  trend: string;
  top_use: string;
  failure_mode: string;
}

const MaterialIntelligencePanel = () => {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"success" | "usage" | "cost">("success");
  const [tab, setTab] = useState<"library" | "trends" | "failures" | "substitutions">("library");
  const [showAdd, setShowAdd] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any>(null);

  // Form state
  const [newMat, setNewMat] = useState({ name: "", category: "metal", avg_cost: 0, top_use: "", failure_mode: "" });

  useEffect(() => {
    if (user) fetchMaterials();
  }, [user]);

  const fetchMaterials = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("zali_materials")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (!error && data) setMaterials(data as Material[]);
    setLoading(false);
  };

  const addMaterial = async () => {
    if (!newMat.name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("zali_materials").insert({
      user_id: user!.id,
      name: newMat.name,
      category: newMat.category,
      avg_cost: newMat.avg_cost,
      top_use: newMat.top_use,
      failure_mode: newMat.failure_mode,
    });
    if (error) return toast.error("Failed to add material");
    toast.success("Material added");
    setShowAdd(false);
    setNewMat({ name: "", category: "metal", avg_cost: 0, top_use: "", failure_mode: "" });
    fetchMaterials();
  };

  const deleteMaterial = async (id: string) => {
    await supabase.from("zali_materials").delete().eq("id", id);
    setMaterials(prev => prev.filter(m => m.id !== id));
    toast.success("Material removed");
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("zali-analyze", {
        body: {
          analysisType: "material_trends",
          projectData: { name: "Material Library", materials: materials.map(m => m.name) },
        },
      });
      if (error) throw error;
      setAiResults(data.result);
    } catch (err) {
      toast.error("AI analysis failed");
    }
    setAiLoading(false);
  };

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.category.includes(search.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === "success") return (b.success_rate || 0) - (a.success_rate || 0);
    if (sortBy === "usage") return (b.times_used || 0) - (a.times_used || 0);
    if (sortBy === "cost") return (a.avg_cost || 0) - (b.avg_cost || 0);
    return 0;
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Material Intelligence Database</h2>
          </div>
          <span className="text-[9px] text-muted-foreground/50">{materials.length} materials tracked</span>
        </div>

        <div className="flex gap-1">
          {(["library", "trends", "failures", "substitutions"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-colors capitalize ${tab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
            >{t}</button>
          ))}
        </div>

        {tab === "library" && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground/40" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials..." className="flex-1 bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none" />
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-lg border border-border/20 bg-card/30 px-2.5 py-2 text-[10px] text-foreground font-light outline-none">
                <option value="success">Sort: Success Rate</option>
                <option value="usage">Sort: Most Used</option>
                <option value="cost">Sort: Lowest Cost</option>
              </select>
              <button onClick={() => setShowAdd(!showAdd)} className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-2 text-[10px] text-accent hover:bg-accent/20 transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {showAdd && (
              <div className="rounded-xl border border-accent/20 bg-card/30 p-4 space-y-3">
                <h3 className="text-[11px] font-light text-foreground">Add Material</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newMat.name} onChange={e => setNewMat(p => ({ ...p, name: e.target.value }))} placeholder="Material name" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <select value={newMat.category} onChange={e => setNewMat(p => ({ ...p, category: e.target.value }))} className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none">
                    {["metal", "plastic", "composite", "ceramic", "nanomaterial", "bioplastic", "other"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" value={newMat.avg_cost || ""} onChange={e => setNewMat(p => ({ ...p, avg_cost: parseFloat(e.target.value) || 0 }))} placeholder="Avg cost ($/kg)" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <input value={newMat.top_use} onChange={e => setNewMat(p => ({ ...p, top_use: e.target.value }))} placeholder="Primary use case" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                </div>
                <input value={newMat.failure_mode} onChange={e => setNewMat(p => ({ ...p, failure_mode: e.target.value }))} placeholder="Known failure mode" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                <button onClick={addMaterial} className="rounded-lg bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-colors">Add Material</button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Database className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                <p className="text-sm font-extralight text-muted-foreground/40">No materials yet</p>
                <p className="text-[10px] text-muted-foreground/30">Add materials to build your intelligence database</p>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {filtered.map(mat => (
                  <div key={mat.id} className="rounded-xl border border-border/15 bg-card/20 backdrop-blur-sm p-4 hover:border-border/30 transition-all group">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-[11px] font-light text-foreground">{mat.name}</h3>
                        <span className="text-[9px] text-muted-foreground/50 capitalize">{mat.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {mat.success_rate > 0 && (
                          <span className={`text-[10px] font-light ${mat.success_rate >= 90 ? "text-emerald-400" : mat.success_rate >= 80 ? "text-amber-400" : "text-red-400"}`}>
                            {mat.success_rate}% success
                          </span>
                        )}
                        <button onClick={() => deleteMaterial(mat.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/30 hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Used</p>
                        <p className="text-[11px] text-foreground">{mat.times_used || 0}x</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Avg Cost</p>
                        <p className="text-[11px] text-foreground">${mat.avg_cost || 0}/kg</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Top Use</p>
                        <p className="text-[11px] text-foreground truncate">{mat.top_use || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Failure</p>
                        <p className="text-[11px] text-foreground truncate">{mat.failure_mode || "—"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(tab === "trends" || tab === "failures" || tab === "substitutions") && (
          <div className="space-y-4">
            {!aiResults ? (
              <div className="text-center py-12 space-y-4">
                <Sparkles className="h-8 w-8 text-accent/30 mx-auto" />
                <p className="text-sm font-extralight text-muted-foreground/40">
                  {tab === "trends" ? "Run AI analysis to discover material trends" :
                   tab === "failures" ? "Run AI analysis to detect failure patterns" :
                   "Run AI analysis to find material substitutions"}
                </p>
                <button onClick={runAiAnalysis} disabled={aiLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-6 py-3 text-xs font-light text-accent hover:bg-accent/20 transition-all disabled:opacity-50">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {aiLoading ? "Analyzing..." : "Run AI Material Analysis"}
                </button>
              </div>
            ) : (
              <>
                {tab === "trends" && aiResults.trends && (
                  <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-accent" />
                      <h3 className="text-xs font-light text-foreground">Trending Materials</h3>
                    </div>
                    <div className="space-y-3">
                      {aiResults.trends.map((t: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-card/30 border border-border/10">
                          <div>
                            <p className="text-[11px] font-light text-foreground">{t.name}</p>
                            <p className="text-[9px] text-muted-foreground/50">{t.reason}</p>
                          </div>
                          <span className="text-xs font-light text-emerald-400">{t.growth}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "failures" && aiResults.failureAlerts && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <h3 className="text-xs font-light text-foreground">Known Failure Patterns</h3>
                    </div>
                    <div className="space-y-3">
                      {aiResults.failureAlerts.map((f: any, i: number) => (
                        <div key={i} className="rounded-lg border border-red-500/15 bg-card/30 p-3.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-light text-foreground">{f.material}</span>
                            <span className="text-[10px] text-red-400">{f.failRate} failure rate</span>
                          </div>
                          <p className="text-[9px] text-muted-foreground/50 mb-2">Context: {f.context}</p>
                          <div className="flex items-center gap-1.5 text-[9px] text-emerald-400/80">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{f.recommendation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "substitutions" && aiResults.substitutions && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowUpDown className="h-4 w-4 text-cyan-400" />
                      <h3 className="text-xs font-light text-foreground">Material Substitutions</h3>
                    </div>
                    <div className="space-y-2">
                      {aiResults.substitutions.map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background/30 border border-border/10">
                          <div>
                            <p className="text-[11px] font-light text-foreground">{s.original} → {s.alternative}</p>
                            <p className="text-[9px] text-muted-foreground/50">{s.costDelta} cost · {s.strengthDelta} strength</p>
                          </div>
                          <span className="text-[10px] text-amber-400">{s.risk}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={runAiAnalysis} disabled={aiLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/20 py-2.5 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50">
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Re-analyze
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default MaterialIntelligencePanel;
