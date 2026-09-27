import { useCallback, useMemo, useState } from "react";
import { Loader2, Search, User, Radio, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Mode = "discover" | "identity" | "paste";
type IdentifierKind = "email" | "phone" | "username" | "name";

interface Hit {
  id: string;
  source: string;
  url: string | null;
  kind: string;
  exposure_class: string | null;
  sensitivity: number;
  live: boolean | null;
  http_status: number | null;
  content_type: string | null;
  first_seen_at: string | null;
  last_probed_at: string;
  evidence_excerpt: string | null;
  meta: Record<string, unknown>;
}

interface PivotRow { id: string; node_id: string; parent_node: string | null; identifier: string; kind: string; depth: number }
interface RunMeta {
  sources: Record<string, { available: boolean; reason?: string; count?: number; index?: string | null; note?: string; present?: string[]; absent?: number; unmeasured?: Array<{ platform: string; reason: string }> }>;
  storage?: { stored: number; errors: string[] };
  coverage?: { measured: number; refused: number; nodes: number; elapsed_ms: number; budget_hit: boolean };
  node_errors?: Array<{ node: string; error: string }>;
}

function classDot(score: number) {
  if (score >= 85) return "bg-red-500";
  if (score >= 65) return "bg-orange-400";
  if (score >= 40) return "bg-amber-300";
  return "bg-emerald-400";
}

function tierBadge(source: string): string {
  const s = source.toLowerCase();
  if (["crt.sh", "sec.edgar", "keys.openpgp.org", "commoncrawl"].some((x) => s.includes(x))) return "t1";
  if (["wayback", "wikidata", "gravatar", "github"].some((x) => s.includes(x))) return "t2";
  if (["xposedornot", "url-probe", "dns"].some((x) => s.includes(x))) return "t3";
  return "t4";
}

const AsherinSearchView = () => {
  const [mode, setMode] = useState<Mode>("discover");
  const [seed, setSeed] = useState("");
  const [idKind, setIdKind] = useState<IdentifierKind>("email");
  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [pivots, setPivots] = useState<PivotRow[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const grouped = useMemo(() => {
    const buckets = new Map<string, Hit[]>();
    for (const h of hits) {
      const key = filter === "all" ? h.source : h.source;
      if (filter !== "all" && h.source !== filter) continue;
      const list = buckets.get(key) ?? [];
      list.push(h); buckets.set(key, list);
    }
    for (const [, list] of buckets) list.sort((a, b) => b.sensitivity - a.sensitivity);
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [hits, filter]);

  const loadRun = useCallback(async (rid: string) => {
    const [{ data: h }, { data: p }] = await Promise.all([
      supabase.from("search_hits").select("*").eq("run_id", rid).order("sensitivity", { ascending: false }).limit(1000),
      supabase.from("search_identity_pivots").select("*").eq("run_id", rid).order("depth"),
    ]);
    setHits((h ?? []) as Hit[]);
    setPivots((p ?? []) as PivotRow[]);
  }, []);

  // an edge failure carries its json body on error.context — reading it turns
  // "edge function error" into the actual sentence the backend wrote.
  const readEdgeError = useCallback(async (error: unknown): Promise<{ message: string; route?: { mode: Mode; kind: IdentifierKind } }> => {
    const ctx = (error as { context?: Response })?.context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const body = JSON.parse(await ctx.clone().text()) as { error?: string; route_to?: { mode: Mode; kind: IdentifierKind } };
        if (body?.error) return { message: body.error, route: body.route_to ?? undefined };
      } catch { /* body was not json — fall through to the generic message */ }
    }
    return { message: error instanceof Error ? error.message : "request failed" };
  }, []);

  const runIdentityWith = useCallback(async (kind: IdentifierKind) => {
    setRunning(true); setHits([]); setPivots([]); setMeta(null);
    try {
      const { data, error } = await supabase.functions.invoke("asherin-search-identity", { body: { identifier: seed.trim(), kind } });
      if (error) throw error;
      const rid = (data as { run_id?: string })?.run_id ?? null;
      setRunId(rid);
      setMeta((data as { meta?: RunMeta })?.meta ?? null);
      if (rid) await loadRun(rid);
    } catch (e) {
      toast.error((await readEdgeError(e)).message);
    } finally { setRunning(false); }
  }, [seed, loadRun, readEdgeError]);

  const runDiscover = useCallback(async () => {
    if (!seed.trim()) { toast.error("enter a seed domain"); return; }
    setRunning(true); setHits([]); setPivots([]); setMeta(null);
    try {
      const { data, error } = await supabase.functions.invoke("asherin-search-discover", { body: { seed: seed.trim() } });
      if (error) throw error;
      const rid = (data as { run_id?: string })?.run_id ?? null;
      setRunId(rid);
      setMeta((data as { meta?: RunMeta })?.meta ?? null);
      if (rid) await loadRun(rid);
    } catch (e) {
      const { message, route } = await readEdgeError(e);
      if (route?.mode === "identity") {
        // the seed was a person, not a host. move the run instead of failing it.
        setMode("identity"); setIdKind(route.kind);
        toast.message(message);
        setRunning(false);
        await runIdentityWith(route.kind);
        return;
      }
      toast.error(message);
    } finally { setRunning(false); }
  }, [seed, loadRun, readEdgeError, runIdentityWith]);

  const runIdentity = useCallback(async () => {
    if (!seed.trim()) { toast.error("enter an identifier"); return; }
    await runIdentityWith(idKind);
  }, [seed, idKind, runIdentityWith]);

  const recheck = useCallback(async (hit: Hit) => {
    try {
      const { data } = await supabase.functions.invoke("asherin-search-probe", { body: { hit_id: hit.id } });
      const j = data as { live?: boolean; status?: number | null };
      setHits((prev) => prev.map((h) => h.id === hit.id ? { ...h, live: j?.live ?? null, http_status: j?.status ?? null, last_probed_at: new Date().toISOString() } : h));
    } catch { toast.error("recheck failed"); }
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-light tracking-wide text-foreground">◈ asherin.search</h1>
          <p className="mt-1 max-w-2xl text-xs font-light leading-relaxed text-muted-foreground/70">
            discovery-first: cert transparency, dns probes, orphan paths, archived captures, code leaks, identity pivots. no link-graph crawl, no seo priority filter. sources that need a paid key surface as unmeasured with the reason.
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 backdrop-blur">
          {(["discover","identity","paste"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-light transition ${mode === m ? "bg-white/10 text-foreground" : "text-muted-foreground/70 hover:text-foreground"}`}
            >
              {m === "discover" ? <Search className="h-3.5 w-3.5" /> : m === "identity" ? <User className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
              {m}
            </button>
          ))}
        </div>
      </header>

      {mode === "discover" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="seed domain (example.com)" className="h-9 flex-1 min-w-[220px] bg-black/30 text-xs font-light" />
            <Button onClick={runDiscover} disabled={running} className="h-9 gap-1.5 bg-white/10 text-xs font-light hover:bg-white/15">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} run discover
            </Button>
          </div>
        </div>
      )}

      {mode === "identity" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-white/10 bg-black/20 p-0.5">
              {(["email","name","username","phone"] as IdentifierKind[]).map((k) => (
                <button key={k} onClick={() => setIdKind(k)} className={`rounded-md px-2 py-1 text-[10px] font-light ${idKind === k ? "bg-white/10 text-foreground" : "text-muted-foreground/60 hover:text-foreground"}`}>{k}</button>
              ))}
            </div>
            <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={`enter ${idKind}`} className="h-9 flex-1 min-w-[220px] bg-black/30 text-xs font-light" />
            <Button onClick={runIdentity} disabled={running} className="h-9 gap-1.5 bg-white/10 text-xs font-light hover:bg-white/15">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <User className="h-3.5 w-3.5" />} run pivot
            </Button>
          </div>
        </div>
      )}

      {mode === "paste" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur text-xs font-light leading-relaxed text-muted-foreground/80">
          <div className="mb-2 flex items-center gap-2 text-foreground"><Radio className="h-3.5 w-3.5" /> live paste tail</div>
          <ul className="space-y-1">
            <li>pastebin scraping api — unmeasured — vendor closed the free feed in 2024, no replacement</li>
            <li>ghostbin — unmeasured — no public listing endpoint</li>
            <li>rentry.co — unmeasured — public list not exposed; only known-slug retrieval</li>
            <li>gist recent — unmeasured — requires GITHUB_TOKEN to poll the events stream</li>
          </ul>
          <p className="mt-3 text-[10px] text-muted-foreground/60">nothing here fabricates a feed. add the keys above and this tab starts reading.</p>
        </div>
      )}

      {meta && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            <span>sources read</span>
            {meta.coverage && (
              <span className="normal-case tracking-normal text-muted-foreground/50">
                {meta.coverage.measured} answered · {meta.coverage.refused} unmeasured · {meta.coverage.nodes} identifiers · {(meta.coverage.elapsed_ms / 1000).toFixed(1)}s
                {meta.coverage.budget_hit ? " · stopped at the time budget, results are partial" : ""}
              </span>
            )}
            {meta.storage?.errors?.length ? (
              <span className="normal-case tracking-normal text-amber-300/80">storage error: {meta.storage.errors[0]}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(meta.sources).map(([name, s]) => (
              <button key={name} onClick={() => setFilter(filter === name ? "all" : name)} className={`rounded-lg border px-2 py-1 text-[10px] font-light transition ${filter === name ? "border-white/30 bg-white/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}>
                <span className="text-foreground/80">{name}</span>
                <span className="ml-1 text-muted-foreground/60">·</span>
                {s.available
                  ? <span className="ml-1 text-emerald-300/80">{s.count ?? 0}</span>
                  : <span className="ml-1 text-amber-300/80">unmeasured</span>}
                {!s.available && s.reason ? <span className="ml-1 text-muted-foreground/60">— {s.reason}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "identity" && pivots.length > 0 && (
        <PivotGraph pivots={pivots} />
      )}

      <div className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur">
        {hits.length === 0 && !running && (
          <div className="flex h-full items-center justify-center p-8 text-center text-xs font-light text-muted-foreground/60">
            {runId ? (meta?.coverage ? `no hits — ${meta.coverage.measured} sources answered and none carried this identifier; ${meta.coverage.refused} could not be read.` : "no hits — the sources ran but nothing surfaced.") : "results appear here after a run."}
          </div>
        )}
        {grouped.map(([source, list]) => (
          <section key={source} className="border-b border-white/5 last:border-b-0">
            <header className="sticky top-0 z-10 flex items-center justify-between bg-black/60 px-3 py-2 backdrop-blur">
              <div className="flex items-center gap-2 text-[11px] font-light text-foreground">
                <span className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">{tierBadge(source)}</span>
                {source}
              </div>
              <div className="text-[10px] text-muted-foreground/60">{list.length} hits</div>
            </header>
            <ul>
              {list.slice(0, 200).map((h) => (
                <li key={h.id} className="flex flex-col gap-1 border-t border-white/5 px-3 py-2 text-xs font-light">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${classDot(h.sensitivity)}`} title={`sensitivity ${h.sensitivity}`} />
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">{h.exposure_class ?? h.kind}</span>
                    {h.live === true && <Badge variant="outline" className="border-emerald-400/40 text-[9px] text-emerald-300/80">live</Badge>}
                    {h.live === false && <Badge variant="outline" className="border-red-400/40 text-[9px] text-red-300/80">dead</Badge>}
                    {h.http_status ? <span className="text-[10px] text-muted-foreground/60">{h.http_status}</span> : null}
                    {h.first_seen_at ? <span className="text-[10px] text-muted-foreground/50">first seen {new Date(h.first_seen_at).toISOString().slice(0,10)}</span> : null}
                    <div className="ml-auto flex items-center gap-1">
                      {h.url && (
                        <button onClick={() => recheck(h)} title="re-check live" className="rounded p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {h.url ? (
                    <a href={h.url} target="_blank" rel="noreferrer" className="truncate text-[11px] text-foreground/80 hover:text-foreground">{h.url}</a>
                  ) : null}
                  {h.evidence_excerpt ? (
                    <pre className="max-h-24 overflow-hidden whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] leading-snug text-muted-foreground/80">{h.evidence_excerpt}</pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="flex items-center gap-2 text-[10px] font-light text-muted-foreground/50">
        <ShieldAlert className="h-3 w-3" />
        <span>every finding is stamped with its source. empty is empty. sources that need a paid key stay unmeasured until one is added.</span>
      </footer>
    </div>
  );
};

// tiny svg graph — no external libs.
const PivotGraph = ({ pivots }: { pivots: PivotRow[] }) => {
  const byId = new Map(pivots.map((p) => [p.node_id, p]));
  const children = new Map<string | null, PivotRow[]>();
  for (const p of pivots) {
    const list = children.get(p.parent_node) ?? [];
    list.push(p); children.set(p.parent_node, list);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const rowSpacing = 60; const colSpacing = 180;
  function walk(nodeId: string, depth: number, index: number, siblings: number) {
    positions.set(nodeId, { x: 20 + depth * colSpacing, y: 20 + index * rowSpacing });
    const kids = children.get(nodeId) ?? [];
    kids.forEach((k, i) => walk(k.node_id, depth + 1, index + (i - kids.length / 2) * 1.2, kids.length));
  }
  const root = (children.get(null) ?? [])[0];
  if (root) walk(root.node_id, 0, 4, 1);
  const maxX = Math.max(400, ...[...positions.values()].map((p) => p.x + 140));
  const maxY = Math.max(120, ...[...positions.values()].map((p) => p.y + 40));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">pivot chain</div>
      <div className="max-h-64 overflow-auto">
        <svg width={maxX} height={maxY}>
          {pivots.map((p) => {
            if (!p.parent_node) return null;
            const a = positions.get(p.parent_node); const b = positions.get(p.node_id);
            if (!a || !b) return null;
            return <line key={`e-${p.node_id}`} x1={a.x + 120} y1={a.y + 12} x2={b.x} y2={b.y + 12} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />;
          })}
          {[...positions.entries()].map(([id, pos]) => {
            const node = byId.get(id); if (!node) return null;
            return (
              <g key={id} transform={`translate(${pos.x} ${pos.y})`}>
                <rect width={130} height={26} rx={6} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" />
                <text x={8} y={11} fill="rgba(255,255,255,0.55)" fontSize={8} fontFamily="ui-sans-serif">{node.kind}</text>
                <text x={8} y={22} fill="rgba(255,255,255,0.85)" fontSize={10} fontFamily="ui-sans-serif">{node.identifier.slice(0, 20)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default AsherinSearchView;
