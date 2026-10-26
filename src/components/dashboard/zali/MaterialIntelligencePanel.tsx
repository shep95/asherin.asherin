import { useState, useEffect, useCallback, useMemo } from "react";
import { Database, AlertTriangle, Search, ArrowUpDown, CheckCircle2, Sparkles, Plus, Trash2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ZaliProject } from "./types";
import { specList } from "./zaliPrompt";
import { runAnalysis, type MaterialsResult } from "./zaliAnalysis";

interface Material {
  id: string;
  name: string;
  category: string;
  avg_cost: number;
  top_use: string;
  failure_mode: string;
  created_at?: string;
}

interface Props {
  project: ZaliProject | null;
  projects: ZaliProject[];
  onAttach: (name: string) => Promise<boolean>;
}

const CATEGORIES = ["metal", "plastic", "composite", "ceramic", "nanomaterial", "bioplastic", "other"];

const MaterialIntelligencePanel = ({ project, projects, onAttach }: Props) => {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "cost">("newest");
  const [tab, setTab] = useState<"library" | "review">("library");
  const [showAdd, setShowAdd] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<MaterialsResult | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [newMat, setNewMat] = useState({ name: "", category: "metal", avg_cost: 0, top_use: "", failure_mode: "" });

  const fetchMaterials = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("zali_materials")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("could not read the materials library");
    if (data) setMaterials(data as Material[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const addMaterial = async () => {
    if (!user) return;
    const name = newMat.name.trim();
    if (!name) { toast.error("a name is required"); return; }
    if (materials.some((m) => m.name.trim().toLowerCase() === name.toLowerCase())) { toast.error("already in the library"); return; }
    const { error } = await supabase.from("zali_materials").insert({
      user_id: user.id,
      name,
      category: newMat.category,
      avg_cost: newMat.avg_cost,
      top_use: newMat.top_use.trim(),
      failure_mode: newMat.failure_mode.trim(),
    });
    if (error) { toast.error("could not add the material"); return; }
    toast.success("material added");
    setShowAdd(false);
    setNewMat({ name: "", category: "metal", avg_cost: 0, top_use: "", failure_mode: "" });
    fetchMaterials();
  };

  const deleteMaterial = async (id: string) => {
    const { error } = await supabase.from("zali_materials").delete().eq("id", id);
    if (error) { toast.error("could not remove the material"); return; }
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    toast.success("material removed");
  };

  const attach = async (name: string) => {
    setAttaching(name);
    try { await onAttach(name); } finally { setAttaching(null); }
  };

  const review = async () => {
    if (!materials.length) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await runAnalysis({ kind: "materials", materials });
      setAiResults(r);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  };

  // Real usage: how many projects on this device name the material in their spec.
  const usedIn = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      for (const m of specList(p.specifications, "materials")) {
        const k = m.toLowerCase();
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }, [projects]);

  const inActiveSpec = useMemo(() => new Set(specList(project?.specifications, "materials").map((m) => m.toLowerCase())), [project]);

  const filtered = materials
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || (m.category || "").includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "cost") return (a.avg_cost || 0) - (b.avg_cost || 0);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="h-4 w-4 text-accent flex-shrink-0" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground truncate">materials library</h2>
          </div>
          <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">{materials.length} on this device</span>
        </div>

        <div className="flex gap-1" role="tablist" aria-label="materials sections">
          {(["library", "review"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-colors ${tab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
            >{t === "review" ? "shepherd's review" : t}</button>
          ))}
        </div>

        {tab === "library" && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-3 py-2 min-w-0">
                <Search className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search materials…" aria-label="search materials" className="flex-1 min-w-0 bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none" />
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="sort" className="rounded-lg border border-border/20 bg-card/30 px-2 py-2 text-[10px] text-foreground font-light outline-none max-w-[7rem]">
                <option value="newest">newest</option>
                <option value="name">name</option>
                <option value="cost">lowest cost</option>
              </select>
              <button onClick={() => setShowAdd(!showAdd)} aria-label="add material" aria-expanded={showAdd} className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-2 text-[10px] text-accent hover:bg-accent/20 transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {showAdd && (
              <div className="rounded-xl border border-accent/20 bg-card/30 p-4 space-y-3">
                <h3 className="text-[11px] font-light text-foreground">add a material</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={newMat.name} onChange={(e) => setNewMat((p) => ({ ...p, name: e.target.value }))} placeholder="material name" aria-label="material name" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <select value={newMat.category} onChange={(e) => setNewMat((p) => ({ ...p, category: e.target.value }))} aria-label="category" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" min={0} step="0.01" value={newMat.avg_cost || ""} onChange={(e) => setNewMat((p) => ({ ...p, avg_cost: parseFloat(e.target.value) || 0 }))} placeholder="avg cost ($/kg)" aria-label="average cost per kg" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <input value={newMat.top_use} onChange={(e) => setNewMat((p) => ({ ...p, top_use: e.target.value }))} placeholder="primary use" aria-label="primary use" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                </div>
                <input value={newMat.failure_mode} onChange={(e) => setNewMat((p) => ({ ...p, failure_mode: e.target.value }))} placeholder="known failure mode" aria-label="known failure mode" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                <button onClick={addMaterial} className="rounded-lg bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-colors">add material</button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12" role="status"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" /><span className="sr-only">loading</span></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Database className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                <p className="text-sm font-extralight text-muted-foreground/40">{materials.length ? "nothing matches" : "no materials yet"}</p>
                {!materials.length && <p className="text-[10px] text-muted-foreground/30">add the materials you work with; shepherd sees them when it designs</p>}
              </div>
            ) : (
              <ul className="grid gap-2.5 list-none m-0 p-0">
                {filtered.map((mat) => {
                  const uses = usedIn.get(mat.name.toLowerCase()) ?? 0;
                  const inSpec = inActiveSpec.has(mat.name.toLowerCase());
                  return (
                    <li key={mat.id} className="rounded-xl border border-border/15 bg-card/20 backdrop-blur-sm p-4 hover:border-border/30 transition-all">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h3 className="text-[11px] font-light text-foreground truncate">{mat.name}</h3>
                          <span className="text-[9px] text-muted-foreground/50">{mat.category}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {project && (
                            <button
                              onClick={() => attach(mat.name)}
                              disabled={inSpec || attaching === mat.name}
                              className="text-[9px] px-2 py-1 rounded-md border border-accent/25 bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                              title={inSpec ? `already in ${project.name}` : `add to ${project.name}`}
                            >
                              {inSpec ? "in spec" : attaching === mat.name ? "adding…" : `add to ${project.name.length > 14 ? "project" : project.name}`}
                            </button>
                          )}
                          <button onClick={() => deleteMaterial(mat.id)} aria-label={`remove ${mat.name}`} className="p-1 text-muted-foreground/30 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div>
                          <p className="text-[8px] tracking-wider text-muted-foreground/40">used in</p>
                          <p className="text-[11px] text-foreground">{uses} project{uses === 1 ? "" : "s"}</p>
                        </div>
                        <div>
                          <p className="text-[8px] tracking-wider text-muted-foreground/40">avg cost</p>
                          <p className="text-[11px] text-foreground">{mat.avg_cost ? `$${mat.avg_cost}/kg` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[8px] tracking-wider text-muted-foreground/40">primary use</p>
                          <p className="text-[11px] text-foreground truncate">{mat.top_use || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[8px] tracking-wider text-muted-foreground/40">known failure</p>
                          <p className="text-[11px] text-foreground truncate">{mat.failure_mode || "—"}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === "review" && (
          <div className="space-y-4">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              shepherd reads your library and lists failure modes worth checking and credible substitutions. it reasons from what you entered; it has no live prices or test data, and says what it assumed.
            </p>
            {!materials.length ? (
              <p className="text-[10px] text-muted-foreground/40 text-center py-8">add materials first</p>
            ) : !aiResults ? (
              <div className="text-center py-8 space-y-4">
                <Sparkles className="h-8 w-8 text-accent/30 mx-auto" />
                <button onClick={review} disabled={aiLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-6 py-3 text-xs font-light text-accent hover:bg-accent/20 transition-all disabled:opacity-50">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {aiLoading ? "asking shepherd…" : "ask shepherd to review the library"}
                </button>
                {aiError && <p className="text-[10px] text-destructive" role="alert">{aiError}</p>}
              </div>
            ) : (
              <>
                {aiResults.failureAlerts.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <h3 className="text-xs font-light text-foreground">failure modes to check</h3>
                    </div>
                    <div className="space-y-3">
                      {aiResults.failureAlerts.map((f, i) => (
                        <div key={i} className="rounded-lg border border-red-500/15 bg-card/30 p-3.5">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-light text-foreground">{f.material}</span>
                            {f.failRate && <span className="text-[10px] text-red-400">{f.failRate}</span>}
                          </div>
                          {f.context && <p className="text-[9px] text-muted-foreground/50 mb-2">{f.context}</p>}
                          {f.recommendation && (
                            <div className="flex items-start gap-1.5 text-[9px] text-emerald-400/80">
                              <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>{f.recommendation}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiResults.substitutions.length > 0 && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowUpDown className="h-4 w-4 text-cyan-400" />
                      <h3 className="text-xs font-light text-foreground">substitutions</h3>
                    </div>
                    <div className="space-y-2">
                      {aiResults.substitutions.map((s, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-background/30 border border-border/10">
                          <div className="min-w-0">
                            <p className="text-[11px] font-light text-foreground">{s.original} → {s.alternative}</p>
                            <p className="text-[9px] text-muted-foreground/50">{[s.costDelta && `${s.costDelta} cost`, s.strengthDelta && `${s.strengthDelta} strength`].filter(Boolean).join(" · ")}</p>
                          </div>
                          {s.risk && <span className="text-[10px] text-amber-400 flex-shrink-0">{s.risk}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiResults.assumptions.length > 0 && (
                  <div className="rounded-lg border border-border/15 bg-card/20 p-3">
                    <p className="text-[9px] text-muted-foreground/50 tracking-wider mb-1.5">assumptions shepherd made</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {aiResults.assumptions.map((a, i) => <li key={i} className="text-[10px] text-muted-foreground/70">{a}</li>)}
                    </ul>
                  </div>
                )}

                {aiError && <p className="text-[10px] text-destructive" role="alert">{aiError}</p>}
                <button onClick={review} disabled={aiLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/20 py-2.5 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50">
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  ask again
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
