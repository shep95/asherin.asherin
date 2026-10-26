import { useState, useEffect, useCallback, useMemo } from "react";
import { Puzzle, Search, Clock, Layers, Package, Plus, Trash2, Loader2, DollarSign } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ZaliProject } from "./types";
import { specList } from "./zaliPrompt";

interface Component {
  id: string;
  name: string;
  type: string;
  description: string;
  cost: number;
  lead_days: number;
  supplier: string;
  created_at?: string;
}

interface Props {
  project: ZaliProject | null;
  projects: ZaliProject[];
  onAttach: (name: string) => Promise<boolean>;
}

const TYPES = ["electrical", "mechanical", "sensor", "thermal", "microcontroller", "safety", "other"];

const ComponentLibraryPanel = ({ project, projects, onAttach }: Props) => {
  const { user } = useAuth();
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"browse" | "summary">("browse");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [newComp, setNewComp] = useState({ name: "", type: "electrical", description: "", cost: 0, lead_days: 1, supplier: "" });

  const fetchComponents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("zali_components")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("could not read the components library");
    if (data) setComponents(data as Component[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchComponents(); }, [fetchComponents]);

  const addComponent = async () => {
    if (!user) return;
    const name = newComp.name.trim();
    if (!name) { toast.error("a name is required"); return; }
    if (components.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) { toast.error("already in the library"); return; }
    const { error } = await supabase.from("zali_components").insert({
      user_id: user.id,
      name,
      type: newComp.type,
      description: newComp.description.trim(),
      cost: newComp.cost,
      lead_days: newComp.lead_days,
      supplier: newComp.supplier.trim(),
    });
    if (error) { toast.error("could not add the component"); return; }
    toast.success("component added");
    setShowAdd(false);
    setNewComp({ name: "", type: "electrical", description: "", cost: 0, lead_days: 1, supplier: "" });
    fetchComponents();
  };

  const deleteComponent = async (id: string) => {
    const { error } = await supabase.from("zali_components").delete().eq("id", id);
    if (error) { toast.error("could not remove the component"); return; }
    setComponents((prev) => prev.filter((c) => c.id !== id));
    toast.success("component removed");
  };

  const attach = async (name: string) => {
    setAttaching(name);
    try { await onAttach(name); } finally { setAttaching(null); }
  };

  const usedIn = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      for (const c of specList(p.specifications, "components")) {
        const k = c.toLowerCase();
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }, [projects]);
  const inActiveSpec = useMemo(() => new Set(specList(project?.specifications, "components").map((c) => c.toLowerCase())), [project]);

  const types = ["all", ...new Set(components.map((c) => c.type).filter(Boolean))];
  const q = search.toLowerCase();
  const filtered = components.filter((c) =>
    (typeFilter === "all" || c.type === typeFilter) &&
    (c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q) || (c.supplier || "").toLowerCase().includes(q)),
  );

  const totalCost = components.reduce((s, c) => s + (Number(c.cost) || 0), 0);
  const longestLead = components.reduce((m, c) => Math.max(m, Number(c.lead_days) || 0), 0);
  const byType = components.reduce<Record<string, number>>((acc, c) => { acc[c.type || "other"] = (acc[c.type || "other"] ?? 0) + 1; return acc; }, {});

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Puzzle className="h-4 w-4 text-cyan-400 flex-shrink-0" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground truncate">components library</h2>
          </div>
          <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">{components.length} on this device</span>
        </div>

        <div className="flex gap-1" role="tablist" aria-label="components sections">
          {(["browse", "summary"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-colors ${tab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
            >{t}</button>
          ))}
        </div>

        {tab === "browse" && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-3 py-2 min-w-0">
                <Search className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search components…" aria-label="search components" className="flex-1 min-w-0 bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none" />
              </div>
              {types.length > 1 && (
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="filter by type" className="rounded-lg border border-border/20 bg-card/30 px-2 py-2 text-[10px] text-foreground font-light outline-none max-w-[7rem]">
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <button onClick={() => setShowAdd(!showAdd)} aria-label="add component" aria-expanded={showAdd} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-2 text-[10px] text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {showAdd && (
              <div className="rounded-xl border border-cyan-500/20 bg-card/30 p-4 space-y-3">
                <h3 className="text-[11px] font-light text-foreground">add a component</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={newComp.name} onChange={(e) => setNewComp((p) => ({ ...p, name: e.target.value }))} placeholder="component name" aria-label="component name" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <select value={newComp.type} onChange={(e) => setNewComp((p) => ({ ...p, type: e.target.value }))} aria-label="type" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none">
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" min={0} step="0.01" value={newComp.cost || ""} onChange={(e) => setNewComp((p) => ({ ...p, cost: parseFloat(e.target.value) || 0 }))} placeholder="cost ($)" aria-label="cost" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <input type="number" min={0} step="1" value={newComp.lead_days || ""} onChange={(e) => setNewComp((p) => ({ ...p, lead_days: parseInt(e.target.value, 10) || 0 }))} placeholder="lead time (days)" aria-label="lead time in days" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <input value={newComp.supplier} onChange={(e) => setNewComp((p) => ({ ...p, supplier: e.target.value }))} placeholder="supplier" aria-label="supplier" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none sm:col-span-2" />
                </div>
                <input value={newComp.description} onChange={(e) => setNewComp((p) => ({ ...p, description: e.target.value }))} placeholder="description" aria-label="description" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                <button onClick={addComponent} className="rounded-lg bg-cyan-500 text-white px-4 py-2 text-xs font-light hover:bg-cyan-500/90 transition-colors">add component</button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12" role="status"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" /><span className="sr-only">loading</span></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Puzzle className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                <p className="text-sm font-extralight text-muted-foreground/40">{components.length ? "nothing matches" : "no components yet"}</p>
                {!components.length && <p className="text-[10px] text-muted-foreground/30">add the parts you already trust; shepherd sees them when it designs</p>}
              </div>
            ) : (
              <ul className="grid gap-2.5 list-none m-0 p-0">
                {filtered.map((comp) => {
                  const uses = usedIn.get(comp.name.toLowerCase()) ?? 0;
                  const inSpec = inActiveSpec.has(comp.name.toLowerCase());
                  return (
                    <li key={comp.id} className="rounded-xl border border-border/15 bg-card/20 backdrop-blur-sm p-4 hover:border-border/30 transition-all">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h3 className="text-[11px] font-light text-foreground truncate">{comp.name}</h3>
                          <p className="text-[9px] text-muted-foreground/50 truncate">{comp.description || "no description"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {project && (
                            <button
                              onClick={() => attach(comp.name)}
                              disabled={inSpec || attaching === comp.name}
                              className="text-[9px] px-2 py-1 rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                              title={inSpec ? `already in ${project.name}` : `add to ${project.name}`}
                            >
                              {inSpec ? "in spec" : attaching === comp.name ? "adding…" : `add to ${project.name.length > 14 ? "project" : project.name}`}
                            </button>
                          )}
                          <button onClick={() => deleteComponent(comp.id)} aria-label={`remove ${comp.name}`} className="p-1 text-muted-foreground/30 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                        <div><p className="text-[8px] tracking-wider text-muted-foreground/40">cost</p><p className="text-[11px] text-foreground">{comp.cost ? `$${comp.cost}` : "—"}</p></div>
                        <div><p className="text-[8px] tracking-wider text-muted-foreground/40">lead</p><p className="text-[11px] text-foreground">{comp.lead_days ? `${comp.lead_days}d` : "—"}</p></div>
                        <div><p className="text-[8px] tracking-wider text-muted-foreground/40">type</p><p className="text-[11px] text-foreground">{comp.type}</p></div>
                        <div><p className="text-[8px] tracking-wider text-muted-foreground/40">supplier</p><p className="text-[11px] text-foreground truncate">{comp.supplier || "—"}</p></div>
                        <div><p className="text-[8px] tracking-wider text-muted-foreground/40">used in</p><p className="text-[11px] text-foreground">{uses} project{uses === 1 ? "" : "s"}</p></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === "summary" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "components", value: String(components.length), icon: Package, color: "text-cyan-400" },
                { label: "library cost, one of each", value: totalCost ? `$${totalCost.toFixed(2)}` : "—", icon: DollarSign, color: "text-accent" },
                { label: "longest lead time", value: longestLead ? `${longestLead} days` : "—", icon: Clock, color: "text-amber-400" },
                { label: "types", value: String(Object.keys(byType).length), icon: Layers, color: "text-emerald-400" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border/15 bg-card/20 p-4">
                  <stat.icon className={`h-4 w-4 ${stat.color} mb-2`} />
                  <p className="text-lg font-extralight text-foreground">{stat.value}</p>
                  <p className="text-[9px] text-muted-foreground/50">{stat.label}</p>
                </div>
              ))}
            </div>
            {Object.keys(byType).length > 0 && (
              <div className="rounded-xl border border-border/15 bg-card/20 p-4">
                <p className="text-[9px] text-muted-foreground/50 tracking-wider mb-2">by type</p>
                <ul className="space-y-1 list-none m-0 p-0">
                  {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                    <li key={t} className="flex items-center justify-between text-[10px]"><span className="text-foreground/80">{t}</span><span className="text-muted-foreground/60">{n}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[9px] text-muted-foreground/40">figures come from what you entered. nothing here is measured or looked up.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default ComponentLibraryPanel;
