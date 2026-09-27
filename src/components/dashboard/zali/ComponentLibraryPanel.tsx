import { useState, useEffect } from "react";
import { Puzzle, Search, CheckCircle2, AlertTriangle, Clock, Star, Layers, Package, Plus, Trash2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Component {
  id: string;
  name: string;
  type: string;
  description: string;
  reused: number;
  success_rate: number;
  cost: number;
  lead_days: number;
  supplier: string;
}

const COMPATIBILITY_ISSUES = [
  { compA: "High-freq PWM Motor Controller", compB: "Analog Sensor Array", issue: "PWM noise corrupts analog readings at 20kHz", fix: "Add ferrite bead filter ($4)", fixCost: 4 },
  { compA: "3.3V Logic MCU", compB: "5V Relay Module", issue: "Logic level mismatch", fix: "Add level shifter ($2)", fixCost: 2 },
];

const ComponentLibraryPanel = () => {
  const { user } = useAuth();
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"browse" | "compatibility" | "stats">("browse");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newComp, setNewComp] = useState({ name: "", type: "electrical", description: "", cost: 0, lead_days: 1, supplier: "" });

  useEffect(() => {
    if (user) fetchComponents();
  }, [user]);

  const fetchComponents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("zali_components")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (!error && data) setComponents(data as Component[]);
    setLoading(false);
  };

  const addComponent = async () => {
    if (!newComp.name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("zali_components").insert({
      user_id: user!.id,
      name: newComp.name,
      type: newComp.type,
      description: newComp.description,
      cost: newComp.cost,
      lead_days: newComp.lead_days,
      supplier: newComp.supplier,
    });
    if (error) return toast.error("Failed to add component");
    toast.success("Component added");
    setShowAdd(false);
    setNewComp({ name: "", type: "electrical", description: "", cost: 0, lead_days: 1, supplier: "" });
    fetchComponents();
  };

  const deleteComponent = async (id: string) => {
    await supabase.from("zali_components").delete().eq("id", id);
    setComponents(prev => prev.filter(c => c.id !== id));
    toast.success("Component removed");
  };

  const types = ["all", ...new Set(components.map(c => c.type))];
  const filtered = components.filter(c =>
    (typeFilter === "all" || c.type === typeFilter) &&
    (c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()))
  );

  const totalTimeSaved = components.reduce((s, c) => s + (c.reused || 0) * 4, 0);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-cyan-400" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Component Reuse Library</h2>
          </div>
          <span className="text-[9px] text-muted-foreground/50">{components.length} components{totalTimeSaved > 0 ? ` · ~${totalTimeSaved.toLocaleString()} hrs saved` : ""}</span>
        </div>

        <div className="flex gap-1">
          {(["browse", "compatibility", "stats"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-colors capitalize ${tab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
            >{t}</button>
          ))}
        </div>

        {tab === "browse" && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground/40" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search components..." className="flex-1 bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none" />
              </div>
              {types.length > 1 && (
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-border/20 bg-card/30 px-2.5 py-2 text-[10px] text-foreground font-light outline-none capitalize">
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <button onClick={() => setShowAdd(!showAdd)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-2 text-[10px] text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {showAdd && (
              <div className="rounded-xl border border-cyan-500/20 bg-card/30 p-4 space-y-3">
                <h3 className="text-[11px] font-light text-foreground">Add Component</h3>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newComp.name} onChange={e => setNewComp(p => ({ ...p, name: e.target.value }))} placeholder="Component name" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <select value={newComp.type} onChange={e => setNewComp(p => ({ ...p, type: e.target.value }))} className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none">
                    {["electrical", "mechanical", "sensor", "thermal", "microcontroller", "safety", "other"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" value={newComp.cost || ""} onChange={e => setNewComp(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))} placeholder="Cost ($)" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                  <input value={newComp.supplier} onChange={e => setNewComp(p => ({ ...p, supplier: e.target.value }))} placeholder="Supplier" className="rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                </div>
                <input value={newComp.description} onChange={e => setNewComp(p => ({ ...p, description: e.target.value }))} placeholder="Description" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none" />
                <button onClick={addComponent} className="rounded-lg bg-cyan-500 text-white px-4 py-2 text-xs font-light hover:bg-cyan-500/90 transition-colors">Add Component</button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Puzzle className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                <p className="text-sm font-extralight text-muted-foreground/40">No components yet</p>
                <p className="text-[10px] text-muted-foreground/30">Add proven components to build your reuse library</p>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {filtered.map(comp => (
                  <div key={comp.id} className="rounded-xl border border-border/15 bg-card/20 backdrop-blur-sm p-4 hover:border-border/30 transition-all group">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-[11px] font-light text-foreground">{comp.name}</h3>
                        <p className="text-[9px] text-muted-foreground/50">{comp.description || "No description"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {comp.success_rate > 0 && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-md border ${comp.success_rate >= 95 ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-amber-500/20 text-amber-400 bg-amber-500/5"}`}>
                            {comp.success_rate}% reliable
                          </span>
                        )}
                        <button onClick={() => deleteComponent(comp.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/30 hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Cost</p>
                        <p className="text-[11px] text-foreground">${comp.cost || 0}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Lead</p>
                        <p className="text-[11px] text-foreground">{comp.lead_days || 0}d</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Type</p>
                        <p className="text-[11px] text-foreground capitalize">{comp.type}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/40">Supplier</p>
                        <p className="text-[11px] text-foreground truncate">{comp.supplier || "—"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "compatibility" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-light text-foreground">Known Compatibility Issues</h3>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mb-4">ZANOEM automatically detects when selected components have known conflicts.</p>
              {components.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/30 text-center py-4">Add components to check compatibility</p>
              ) : (
                <div className="space-y-3">
                  {COMPATIBILITY_ISSUES.map((iss, i) => (
                    <div key={i} className="rounded-lg border border-amber-500/15 bg-card/30 p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-foreground">{iss.compA}</span>
                        <span className="text-[9px] text-muted-foreground/30">×</span>
                        <span className="text-[10px] text-foreground">{iss.compB}</span>
                      </div>
                      <p className="text-[9px] text-amber-400/80 mb-2">◇ {iss.issue}</p>
                      <div className="flex items-center gap-1.5 text-[9px] text-emerald-400/80">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{iss.fix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "stats" && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Total Components", value: components.length.toString(), icon: Package, color: "text-cyan-400" },
              { label: "Total Reuses", value: components.reduce((s, c) => s + (c.reused || 0), 0).toLocaleString(), icon: Layers, color: "text-accent" },
              { label: "Avg Reliability", value: components.length > 0 ? (components.reduce((s, c) => s + (c.success_rate || 0), 0) / components.length).toFixed(1) + "%" : "—", icon: Star, color: "text-emerald-400" },
              { label: "Hours Saved", value: totalTimeSaved > 0 ? "~" + totalTimeSaved.toLocaleString() : "0", icon: Clock, color: "text-amber-400" },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-border/15 bg-card/20 p-4">
                <stat.icon className={`h-4 w-4 ${stat.color} mb-2`} />
                <p className="text-lg font-extralight text-foreground">{stat.value}</p>
                <p className="text-[9px] text-muted-foreground/50">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default ComponentLibraryPanel;
