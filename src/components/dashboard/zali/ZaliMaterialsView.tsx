import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ExternalLink, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ZaliProject } from "./types";
import { specList } from "./zaliPrompt";

// The materials view inside the workspace: every material the spec names,
// joined to the operator's own materials library when the names match.
// Nothing here is invented — no prices, no properties the operator did not
// enter. Supplier links open a search, they do not claim stock.

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

interface LibraryRow { id: string; name: string; category: string; avg_cost: number; top_use: string; failure_mode: string }

function supplierSearches(label: string) {
  const q = encodeURIComponent(label);
  return [
    { name: "McMaster-Carr", url: `https://www.mcmaster.com/#${q}` },
    { name: "Digi-Key", url: `https://www.digikey.com/en/products/result?keywords=${q}` },
    { name: "Mouser", url: `https://www.mouser.com/Search/Refine?Keyword=${q}` },
    { name: "RS", url: `https://www.rs-online.com/web/c/?searchTerm=${q}` },
  ];
}

interface Props { project: ZaliProject }

const ZaliMaterialsView = ({ project }: Props) => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [library, setLibrary] = useState<LibraryRow[]>([]);

  const names = useMemo(() => specList(project.specifications, "materials"), [project.specifications]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase.from("zali_materials").select("*").eq("user_id", user.id).then(({ data }) => {
      if (!cancelled && data) setLibrary(data as LibraryRow[]);
    });
    return () => { cancelled = true; };
  }, [user]);

  const matchFor = (label: string) => library.find((m) => m.name.trim().toLowerCase() === label.trim().toLowerCase()) ?? null;

  if (names.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[280px] px-6">
        <p className="text-[10px] text-muted-foreground/50 text-center max-w-xs leading-relaxed">
          the spec names no materials yet. ask shepherd to settle them, or add one from the materials tab.
        </p>
      </div>
    );
  }

  if (selected !== null && names[selected]) {
    const label = names[selected];
    const color = COLORS[selected % COLORS.length];
    const row = matchFor(label);
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/15 flex items-center gap-2">
          <button onClick={() => setSelected(null)} aria-label="back to materials" className="p-1 rounded-md hover:bg-foreground/5 text-muted-foreground/50 hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="text-[11px] font-light text-foreground">{label}</span>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="rounded-lg border border-border/15 bg-card/20 p-3">
            <p className="text-[9px] text-muted-foreground/50 tracking-wider mb-2">from your materials library</p>
            {row ? (
              <dl className="grid grid-cols-2 gap-2 text-[10px]">
                <div><dt className="text-muted-foreground/40">category</dt><dd className="text-foreground">{row.category || "—"}</dd></div>
                <div><dt className="text-muted-foreground/40">avg cost</dt><dd className="text-foreground">{row.avg_cost ? `$${row.avg_cost}/kg` : "—"}</dd></div>
                <div><dt className="text-muted-foreground/40">primary use</dt><dd className="text-foreground">{row.top_use || "—"}</dd></div>
                <div><dt className="text-muted-foreground/40">known failure</dt><dd className="text-foreground">{row.failure_mode || "—"}</dd></div>
              </dl>
            ) : (
              <p className="text-[10px] text-muted-foreground/60">not in your library yet — add it from the materials tab to keep cost and failure notes beside it.</p>
            )}
          </div>
          <div className="rounded-lg border border-border/15 bg-card/20 p-3">
            <p className="text-[9px] text-muted-foreground/50 tracking-wider mb-2">search suppliers (opens a new tab)</p>
            <div className="space-y-1.5">
              {supplierSearches(label).map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-2.5 py-2 rounded-md border border-border/10 bg-background/30 hover:bg-accent/5 hover:border-accent/20 transition-colors group">
                  <span className="text-[11px] text-foreground/70 group-hover:text-foreground transition-colors">{s.name}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-accent transition-colors" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Layers className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] text-foreground font-light">{names.length} material{names.length === 1 ? "" : "s"} in the spec</span>
        <span className="ml-auto text-[9px] text-muted-foreground/40">{names.filter((n) => matchFor(n)).length} in your library</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 list-none m-0 p-0">
        {names.map((label, i) => {
          const row = matchFor(label);
          const color = COLORS[i % COLORS.length];
          return (
            <li key={`${label}-${i}`}>
              <button
                onClick={() => setSelected(i)}
                className="w-full text-left rounded-xl border border-border/20 bg-card/20 hover:border-border/40 transition-colors p-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color + "99", boxShadow: `0 0 10px ${color}30` }} aria-hidden="true" />
                  <p className="text-[11px] font-light text-foreground truncate">{label}</p>
                </div>
                <p className="text-[9px] text-muted-foreground/50 mt-1.5">
                  {row ? `${row.category}${row.avg_cost ? ` · $${row.avg_cost}/kg` : ""}` : "not in your library"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ZaliMaterialsView;
