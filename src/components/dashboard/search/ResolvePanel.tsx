/**
 * RESOLVE PANEL — the intelligence surface over an asherin.search result corpus.
 * ---------------------------------------------------------------------------
 * Renders the deterministic output of the on-device entity engine: hop rings
 * 0-3, typed selectors, resolved identities, a timeline and exposure
 * classification. Every element is source-linked; nothing here is narrated by a
 * model, so a click always lands on the document that produced the claim.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Loader2, RefreshCw, ExternalLink, Fingerprint, Users, Building2, Mail,
  Phone, AtSign, Globe, Server, MapPin, Coins, FileText, Hash, ShieldAlert,
  Clock, Layers, AlertTriangle,
} from "lucide-react";
import { buildSerpIntel, type SerpDoc } from "@/lib/local/search/serpEntityEngine";
import { mapLimit } from "@/lib/local/search/http";
import { readPage } from "@/lib/local/search/reader";
import { extractDomain } from "@/lib/local/search/tiering";
import type { SearchResult } from "./types";

type EntityKind =
  | "person" | "org" | "email" | "phone" | "handle" | "domain"
  | "ip" | "location" | "crypto" | "document" | "topic";

interface Entity {
  id: string; kind: EntityKind; label: string; mentions: number;
  domains: string[]; sources: string[]; ring: number; confidence: number;
}
interface GraphEdge {
  from: string; to: string; weight: number; domains: number;
  kind: "co-occurrence" | "identity" | "inferred"; sources: string[];
}
interface IdentityCluster {
  id: string; label: string;
  members: { id: string; kind: EntityKind; label: string }[];
  basis: string[]; confidence: number;
}
interface TimelineEvent { iso: string; label: string; source: string; domain: string }
interface ExposureSignal {
  kind: "breach" | "paste" | "darkweb" | "social" | "records" | "news" | "code" | "commercial" | "web";
  domain: string; url: string; title: string; evidence: string;
}
interface SerpIntel {
  seed: string;
  entities: Entity[];
  edges: GraphEdge[];
  identities: IdentityCluster[];
  timeline: TimelineEvent[];
  exposure: ExposureSignal[];
  coverage: {
    documents: number; bodiesParsed: number; snippetOnly: number;
    domains: number; ring1: number; ring2: number; ring3: number;
  };
}

interface ResolvePanelProps {
  query: string;
  results: SearchResult[];
  onClose: () => void;
}

const KIND_ICON: Record<EntityKind, typeof Users> = {
  person: Users, org: Building2, email: Mail, phone: Phone, handle: AtSign,
  domain: Globe, ip: Server, location: MapPin, crypto: Coins,
  document: FileText, topic: Hash,
};

const KIND_LABEL: Record<EntityKind, string> = {
  person: "People", org: "Organisations", email: "Email selectors",
  phone: "Phone selectors", handle: "Handles", domain: "Domains",
  ip: "Network", location: "Places", crypto: "Wallets",
  document: "Documents", topic: "Seed",
};

const KIND_ORDER: EntityKind[] = [
  "person", "org", "email", "phone", "handle", "domain", "ip", "crypto", "location", "document",
];

const EXPOSURE_TONE: Record<ExposureSignal["kind"], string> = {
  breach: "text-red-400/90 border-red-400/30 bg-red-400/10",
  paste: "text-orange-300/90 border-orange-300/30 bg-orange-300/10",
  darkweb: "text-purple-300/90 border-purple-300/30 bg-purple-300/10",
  records: "text-sky-300/90 border-sky-300/30 bg-sky-300/10",
  social: "text-emerald-300/90 border-emerald-300/30 bg-emerald-300/10",
  code: "text-amber-200/90 border-amber-200/30 bg-amber-200/10",
  news: "text-muted-foreground border-border/40 bg-card/40",
  commercial: "text-muted-foreground border-border/40 bg-card/40",
  web: "text-muted-foreground border-border/40 bg-card/40",
};

const RING_RADIUS = [0, 118, 212, 292];

const ResolvePanel = ({ query, results, onClose }: ResolvePanelProps) => {
  const [intel, setIntel] = useState<SerpIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [ringFilter, setRingFilter] = useState<number | "all">("all");
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const closeRef = useRef<HTMLButtonElement>(null);

  const corpus = useMemo(
    () => results.slice(0, 40).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
    [results],
  );

  const run = useCallback(async () => {
    const token = { cancelled: false };
    abortRef.current.cancelled = true; // supersede any in-flight run
    abortRef.current = token;
    setLoading(true);
    setError(null);
    try {
      // bounded body harvest: the strongest pages are read from the device,
      // the rest stay snippet-only and are weighted as such.
      const docs: SerpDoc[] = corpus.map((c) => ({ url: c.url, title: c.title, snippet: c.snippet, domain: extractDomain(c.url), snippetOnly: true }));
      const bodies = await mapLimit(docs.slice(0, 8), 3, async (d) => (await readPage(d.url, { timeoutMs: 7000 })).content);
      if (token.cancelled) return;
      bodies.forEach((b, i) => {
        if (b) {
          docs[i].body = b.slice(0, 120_000);
          docs[i].snippetOnly = false;
        }
      });
      const built = buildSerpIntel(query, docs);
      if (token.cancelled) return;
      setIntel(built as SerpIntel);
    } catch (e: unknown) {
      if (token.cancelled) return;
      setError(e instanceof Error ? e.message : "Intelligence layer failed");
    } finally {
      if (!token.cancelled) setLoading(false);
    }
  }, [query, corpus]);

  useEffect(() => {
    run();
    return () => { abortRef.current.cancelled = true; };
  }, [run]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const byKind = useMemo(() => {
    const map = new Map<EntityKind, Entity[]>();
    for (const e of intel?.entities ?? []) {
      if (e.kind === "topic") continue;
      if (ringFilter !== "all" && e.ring !== ringFilter) continue;
      if (!map.has(e.kind)) map.set(e.kind, []);
      map.get(e.kind)!.push(e);
    }
    return map;
  }, [intel, ringFilter]);

  /** Deterministic radial layout — same corpus always renders the same map. */
  const layout = useMemo(() => {
    if (!intel) return { nodes: [], links: [] as { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] };
    const positioned = new Map<string, { x: number; y: number; e: Entity }>();
    const cx = 0, cy = 0;
    for (let ring = 0; ring <= 3; ring++) {
      const members = intel.entities.filter((e) => e.ring === ring).slice(0, ring === 0 ? 1 : ring === 1 ? 18 : 26);
      members.forEach((e, i) => {
        if (ring === 0) { positioned.set(e.id, { x: cx, y: cy, e }); return; }
        const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2 + ring * 0.22;
        positioned.set(e.id, {
          x: cx + Math.cos(angle) * RING_RADIUS[ring],
          y: cy + Math.sin(angle) * RING_RADIUS[ring],
          e,
        });
      });
    }
    const links = intel.edges
      .filter((ed) => positioned.has(ed.from) && positioned.has(ed.to))
      .slice(0, 220)
      .map((ed) => {
        const a = positioned.get(ed.from)!;
        const b = positioned.get(ed.to)!;
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, dashed: ed.kind !== "co-occurrence" };
      });
    return { nodes: [...positioned.values()], links };
  }, [intel]);

  const ringCounts = intel
    ? [1, intel.coverage.ring1, intel.coverage.ring2, intel.coverage.ring3]
    : [0, 0, 0, 0];

  return (
    <div className="h-full flex flex-col bg-background/60 backdrop-blur-2xl border-l border-border/30">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/30 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-accent shrink-0" strokeWidth={1.5} />
            <h2 className="text-sm font-light tracking-wide truncate">resolve</h2>
          </div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 truncate mt-0.5">
            {query}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/30 bg-card/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> re-run
          </button>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="close intelligence panel"
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-card/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" aria-live="polite">
        {/* Loading — fixed-height skeletons so the panel does not shift */}
        {loading && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              reading the strongest pages and resolving selectors…
            </div>
            <div className="h-[300px] rounded-2xl border border-border/20 bg-card/20 animate-pulse" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl border border-border/20 bg-card/20 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="p-6 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-400/70" />
            <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
            <button
              onClick={run}
              className="rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-[11px] hover:border-accent/40 hover:text-accent transition-colors"
            >
              retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && intel && intel.entities.length <= 1 && (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              no selectors could be extracted from this corpus.
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              add a name, domain or handle to the query, or widen the result set, then re-run.
            </p>
          </div>
        )}

        {!loading && !error && intel && intel.entities.length > 1 && (
          <div className="p-4 space-y-5">
            {/* Coverage */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { k: "Docs", v: intel.coverage.documents },
                { k: "Bodies", v: intel.coverage.bodiesParsed },
                { k: "Domains", v: intel.coverage.domains },
                { k: "Nodes", v: intel.entities.length },
              ].map((c) => (
                <div key={c.k} className="rounded-xl border border-border/25 bg-card/30 px-2 py-2 text-center">
                  <div className="text-sm font-light">{c.v}</div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">{c.k}</div>
                </div>
              ))}
            </div>

            {/* Ring filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
              {(["all", 0, 1, 2, 3] as const).map((r) => (
                <button
                  key={String(r)}
                  onClick={() => setRingFilter(r)}
                  className={`rounded-lg border px-2 py-0.5 text-[10px] tracking-wide transition-colors ${
                    ringFilter === r
                      ? "border-accent/40 bg-accent/15 text-accent"
                      : "border-border/30 bg-card/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "all" ? "all" : r === 0 ? "seed" : `hop ${r} · ${ringCounts[r as number]}`}
                </button>
              ))}
            </div>

            {/* Ring map */}
            <div className="rounded-2xl border border-border/25 bg-card/20 p-2">
              <svg viewBox="-330 -330 660 660" className="w-full h-[320px]" role="img" aria-label="hop ring graph">
                {RING_RADIUS.slice(1).map((r) => (
                  <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.35} strokeDasharray="3 6" />
                ))}
                {layout.links.map((l, i) => (
                  <line
                    key={i}
                    x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                    stroke="hsl(var(--foreground))" strokeOpacity={l.dashed ? 0.35 : 0.12}
                    strokeWidth={l.dashed ? 1 : 0.7}
                    strokeDasharray={l.dashed ? "4 4" : undefined}
                  />
                ))}
                {layout.nodes.map(({ x, y, e }) => {
                  const active = selected?.id === e.id;
                  const dimmed = ringFilter !== "all" && e.ring !== ringFilter;
                  return (
                    <g
                      key={e.id}
                      transform={`translate(${x},${y})`}
                      opacity={dimmed ? 0.2 : 1}
                      className="cursor-pointer"
                      onClick={() => setSelected(e)}
                    >
                      <circle
                        r={e.ring === 0 ? 12 : 6 + e.confidence * 4}
                        fill={active ? "hsl(var(--accent))" : "hsl(var(--card))"}
                        stroke={active ? "hsl(var(--accent))" : "hsl(var(--foreground))"}
                        strokeOpacity={active ? 1 : 0.4}
                        strokeWidth={1}
                      />
                      <text
                        y={e.ring === 0 ? 26 : 18}
                        textAnchor="middle"
                        className="fill-current"
                        style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      >
                        {e.label.length > 22 ? `${e.label.slice(0, 21)}…` : e.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Selected node detail */}
            {selected && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-light truncate">{selected.label}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
                      {KIND_LABEL[selected.kind]} · hop {selected.ring < 0 ? "—" : selected.ring} · confidence {Math.round(selected.confidence * 100)}%
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {selected.mentions} document{selected.mentions === 1 ? "" : "s"} · {selected.domains.length} domain{selected.domains.length === 1 ? "" : "s"}
                </div>
                <div className="space-y-1">
                  {selected.sources.slice(0, 6).map((s) => (
                    <a
                      key={s} href={s} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-accent truncate"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Identities */}
            {intel.identities.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50">resolved identities</h3>
                {intel.identities.slice(0, 8).map((c) => (
                  <div key={c.id} className="rounded-xl border border-border/25 bg-card/30 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-light truncate">{c.label}</span>
                      <span className="text-[10px] text-muted-foreground/60">{Math.round(c.confidence * 100)}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.members.map((m) => {
                        const Icon = KIND_ICON[m.kind];
                        return (
                          <span key={m.id} className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Icon className="h-2.5 w-2.5" /> {m.label}
                          </span>
                        );
                      })}
                    </div>
                    {c.basis.slice(0, 3).map((b, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground/55">— {b}</p>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {/* Exposure */}
            {intel.exposure.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3" /> Exposure surface
                </h3>
                <div className="space-y-1.5">
                  {intel.exposure.slice(0, 12).map((s, i) => (
                    <a
                      key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noopener noreferrer"
                      className={`block rounded-lg border px-2.5 py-1.5 transition-opacity hover:opacity-80 ${EXPOSURE_TONE[s.kind]}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-[0.2em]">{s.kind}</span>
                        <span className="text-[10px] opacity-70 truncate max-w-[55%]">{s.domain}</span>
                      </div>
                      <p className="text-[11px] font-light truncate mt-0.5">{s.title || s.url}</p>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Selectors by kind */}
            {KIND_ORDER.filter((k) => byKind.get(k)?.length).map((kind) => {
              const Icon = KIND_ICON[kind];
              const list = byKind.get(kind)!;
              return (
                <section key={kind} className="space-y-1.5">
                  <h3 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 flex items-center gap-1.5">
                    <Icon className="h-3 w-3" /> {KIND_LABEL[kind]} · {list.length}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {list.slice(0, 40).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        title={`Hop ${e.ring < 0 ? "—" : e.ring} · ${e.domains.length} domains · ${Math.round(e.confidence * 100)}% confidence`}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-light transition-colors ${
                          selected?.id === e.id
                            ? "border-accent/50 bg-accent/15 text-accent"
                            : "border-border/30 bg-card/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                        }`}
                      >
                        {e.label.length > 34 ? `${e.label.slice(0, 33)}…` : e.label}
                        <span className="opacity-50">·{e.domains.length}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Timeline */}
            {intel.timeline.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Timeline
                </h3>
                <div className="space-y-1">
                  {intel.timeline.slice(0, 20).map((ev, i) => (
                    <a
                      key={`${ev.iso}-${i}`} href={ev.source} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border/20 bg-card/20 px-2.5 py-1.5 hover:border-border/50 transition-colors"
                    >
                      <span className="text-[11px] font-mono text-foreground/80 shrink-0">{ev.iso}</span>
                      <span className="text-[10px] text-muted-foreground/60 truncate">{ev.domain}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <p className="text-[10px] text-muted-foreground/40 pt-2 border-t border-border/20">
              Derived deterministically from {intel.coverage.documents} indexed documents
              ({intel.coverage.bodiesParsed} full bodies, {intel.coverage.snippetOnly} snippet-only).
              No inference beyond the corpus.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResolvePanel;
