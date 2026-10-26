// FusionPanel — the deterministic analysis layer, surfaced.
// Everything rendered here is computed from the retrieved corpus on the device
// by `src/lib/local/search/fusion.ts`; no model produced any of it, so every
// row can be traced to the URLs that justify it.
import { useMemo, useState } from "react";
import {
  Network, Layers, ScrollText, GitCompareArrows, Sigma, Gauge, ChevronDown,
} from "lucide-react";

export interface FusionPayload {
  centrality?: { id: string; label: string; kind: string; pagerank: number; degree: number }[];
  clusters?: { id: string; label: string; size: number; domains: string[]; independence: number; sharedTerms: string[] }[];
  claims?: {
    text: string; subject: string; value?: string; valueKind?: string;
    sources: string[]; domains: string[]; independence: number; bestTier: number; veracity: number;
  }[];
  contradictions?: {
    subject: string; valueKind: string; severity: "high" | "medium"; reason: string;
    sides: { value: string; text: string; sources: string[]; bestTier: number }[];
  }[];
  anomalies?: {
    benford: { sampleSize: number; chiSquare: number; conforms: boolean | null; note: string };
    outliers: { value: number; sources: string[]; zRobust: number; context: string }[];
    temporalAnomalies: { value: string; source: string; reason: string }[];
  };
  rankingQuality?: {
    engineHitRate: Record<string, number>;
    independenceClasses: Record<string, number>;
    dataTypeDistribution: Record<string, number>;
    avgRelevance: number;
    avgVeracity: number;
    onTargetRate: number;
  };
  prunedBelowFloor?: number;
}

type Tab = "quality" | "graph" | "clusters" | "claims" | "conflicts" | "anomalies";

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: "quality", label: "quality", icon: Gauge },
  { id: "graph", label: "graph", icon: Network },
  { id: "clusters", label: "stories", icon: Layers },
  { id: "claims", label: "claims", icon: ScrollText },
  { id: "conflicts", label: "conflicts", icon: GitCompareArrows },
  { id: "anomalies", label: "anomalies", icon: Sigma },
];

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
      <div className="h-full rounded-full bg-foreground/40 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Host({ url }: { url: string }) {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* raw */ }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener"
      className="text-[10px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2 truncate max-w-[160px]">
      {host}
    </a>
  );
}

export default function FusionPanel({ data }: { data: FusionPayload }) {
  const [tab, setTab] = useState<Tab>("quality");
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => ({
    graph: data.centrality?.length ?? 0,
    clusters: (data.clusters ?? []).filter((c) => c.size > 1).length,
    claims: data.claims?.length ?? 0,
    conflicts: data.contradictions?.length ?? 0,
    anomalies:
      (data.anomalies?.outliers?.length ?? 0) +
      (data.anomalies?.temporalAnomalies?.length ?? 0) +
      (data.anomalies?.benford?.conforms === false ? 1 : 0),
  }), [data]);

  const rq = data.rankingQuality;
  const hasAnything = counts.graph + counts.claims + counts.conflicts > 0 || !!rq;
  if (!hasAnything) return null;

  return (
    <section aria-label="corpus analysis" className="mb-4 rounded-xl border border-border/25 bg-card/25 backdrop-blur-md overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-foreground/[0.03] transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Network className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.4} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/80">corpus analysis</span>
          <span className="text-[10px] text-muted-foreground/60 truncate">
            {counts.claims} claims · {counts.conflicts} conflicts · {counts.clusters} stories
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/60 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border/20">
          <div className="flex gap-1 px-2 overflow-x-auto border-b border-border/15" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const n = t.id === "quality" ? undefined : (counts as Record<string, number>)[t.id];
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-[11px] font-light border-b-2 transition-colors ${
                    active ? "border-foreground/60 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" strokeWidth={1.5} />
                  {t.label}
                  {typeof n === "number" && n > 0 && (
                    <span className="text-[9px] text-muted-foreground/60">{n}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-3 py-3 max-h-[420px] overflow-y-auto">
            {/* ── QUALITY: the search's own report card ───────────────────── */}
            {tab === "quality" && (rq ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { k: "On-target", v: `${Math.round(rq.onTargetRate * 100)}%`, h: "Share of results clearing the relevance floor" },
                    { k: "Avg relevance", v: rq.avgRelevance.toFixed(2), h: "Mean lexical match against the query plan" },
                    { k: "Avg veracity", v: String(rq.avgVeracity), h: "Mean source credibility, 0–100" },
                  ].map((m) => (
                    <div key={m.k} title={m.h} className="rounded-lg border border-border/20 bg-background/30 px-2.5 py-2">
                      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">{m.k}</div>
                      <div className="text-sm font-light text-foreground">{m.v}</div>
                    </div>
                  ))}
                </div>
                {typeof data.prunedBelowFloor === "number" && data.prunedBelowFloor > 0 && (
                  <p className="text-[10px] text-muted-foreground/70">
                    {data.prunedBelowFloor} off-topic result{data.prunedBelowFloor === 1 ? "" : "s"} pruned below the relevance floor.
                  </p>
                )}
                {[
                  { title: "independence classes", rec: rq.independenceClasses },
                  { title: "source types", rec: rq.dataTypeDistribution },
                  { title: "engine hits", rec: rq.engineHitRate },
                ].map(({ title, rec }) => {
                  const rows = Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, 8);
                  const max = Math.max(1, ...rows.map((r) => r[1]));
                  return (
                    <div key={title}>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5">{title}</div>
                      <div className="space-y-1.5">
                        {rows.map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground/80 w-32 truncate">{k}</span>
                            <div className="flex-1"><Bar value={v} max={max} /></div>
                            <span className="text-[10px] text-muted-foreground/60 w-6 text-right">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-[11px] text-muted-foreground/60">no quality telemetry for this run.</p>)}

            {/* ── GRAPH: PageRank over the co-occurrence graph ────────────── */}
            {tab === "graph" && (
              (data.centrality?.length ?? 0) > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground/60 mb-2">
                    Ranked by PageRank over entity co-occurrence — who is load-bearing, not merely frequent.
                  </p>
                  {data.centrality!.slice(0, 20).map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="text-[11px] text-foreground/90 w-44 truncate" title={c.label}>{c.label}</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 w-16 truncate">{c.kind}</span>
                      <div className="flex-1"><Bar value={c.pagerank} max={data.centrality![0].pagerank || 1} /></div>
                      <span className="text-[10px] text-muted-foreground/60 w-12 text-right">{c.pagerank.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-muted-foreground/60">no entities resolved from this corpus.</p>
            )}

            {/* ── CLUSTERS: one story, many syndications ──────────────────── */}
            {tab === "clusters" && (
              (data.clusters?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {data.clusters!.filter((c) => c.size > 1).slice(0, 12).map((c) => (
                    <div key={c.id} className="rounded-lg border border-border/20 bg-background/30 px-2.5 py-2">
                      <div className="text-[11px] text-foreground/90 leading-snug">{c.label}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] text-muted-foreground/60">{c.size} sources</span>
                        <span className="text-[9px] text-muted-foreground/60">· {c.independence} independent class{c.independence === 1 ? "" : "es"}</span>
                        <span className="text-[9px] text-muted-foreground/50 truncate">· {c.domains.slice(0, 4).join(", ")}</span>
                      </div>
                    </div>
                  ))}
                  {data.clusters!.filter((c) => c.size > 1).length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60">every result tells a distinct story — no syndication detected.</p>
                  )}
                </div>
              ) : <p className="text-[11px] text-muted-foreground/60">nothing to cluster.</p>
            )}

            {/* ── CLAIMS: veracity per assertion, not per page ────────────── */}
            {tab === "claims" && (
              (data.claims?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {data.claims!.slice(0, 25).map((c, i) => (
                    <div key={i} className="rounded-lg border border-border/20 bg-background/30 px-2.5 py-2">
                      <div className="flex items-start gap-2">
                        <span
                          className={`shrink-0 mt-0.5 text-[9px] px-1.5 py-0.5 rounded border ${
                            c.veracity >= 60 ? "border-foreground/40 text-foreground/80"
                              : c.veracity >= 35 ? "border-border/40 text-muted-foreground"
                                : "border-border/25 text-muted-foreground/60"
                          }`}
                          title="corroboration × engine independence × best source tier"
                        >
                          {c.veracity}
                        </span>
                        <p className="text-[11px] text-foreground/85 leading-snug">{c.text}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] text-muted-foreground/50">
                          {c.domains.length} domain{c.domains.length === 1 ? "" : "s"} · {c.independence} class{c.independence === 1 ? "" : "es"} · tier {c.bestTier}
                        </span>
                        {c.sources.slice(0, 3).map((s) => <Host key={s} url={s} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-muted-foreground/60">no discrete claims extracted.</p>
            )}

            {/* ── CONFLICTS: disagreement is a finding, not an error ──────── */}
            {tab === "conflicts" && (
              (data.contradictions?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {data.contradictions!.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border/25 bg-background/30 px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          c.severity === "high" ? "border-foreground/50 text-foreground/90" : "border-border/35 text-muted-foreground"
                        }`}>{c.severity}</span>
                        <span className="text-[11px] text-foreground/90 truncate">{c.subject}</span>
                        <span className="text-[9px] text-muted-foreground/50">{c.valueKind}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{c.reason}</p>
                      <div className="mt-1.5 space-y-1">
                        {c.sides.map((s, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="text-[10px] text-foreground/80 w-16 shrink-0 truncate">{s.value}</span>
                            <p className="text-[10px] text-muted-foreground/70 leading-snug flex-1">{s.text}</p>
                            {s.sources[0] && <Host url={s.sources[0]} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-muted-foreground/60">sources agree on every comparable value in this corpus.</p>
            )}

            {/* ── ANOMALIES: numeric forensics ────────────────────────────── */}
            {tab === "anomalies" && (
              data.anomalies ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/20 bg-background/30 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">benford first-digit test</div>
                    <p className="text-[11px] text-foreground/85 mt-1 leading-snug">{data.anomalies.benford.note}</p>
                    <p className="text-[9px] text-muted-foreground/50 mt-1">
                      n={data.anomalies.benford.sampleSize} · χ²={data.anomalies.benford.chiSquare} · critical 15.51 (8 df, p=0.05)
                    </p>
                  </div>
                  {data.anomalies.outliers.length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5">value outliers (robust z &gt; 3.5)</div>
                      <div className="space-y-1.5">
                        {data.anomalies.outliers.map((o, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[10px] text-foreground/85 w-20 shrink-0 truncate">{o.value}</span>
                            <p className="text-[10px] text-muted-foreground/70 flex-1 leading-snug">{o.context}</p>
                            <span className="text-[9px] text-muted-foreground/50 shrink-0">z{o.zRobust}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.anomalies.temporalAnomalies.length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5">temporal impossibilities</div>
                      {data.anomalies.temporalAnomalies.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-foreground/85 w-20 truncate">{t.value}</span>
                          <p className="text-[10px] text-muted-foreground/70 flex-1">{t.reason}</p>
                          <Host url={t.source} />
                        </div>
                      ))}
                    </div>
                  )}
                  {data.anomalies.outliers.length === 0 && data.anomalies.temporalAnomalies.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60">no numeric or temporal anomalies in the corpus.</p>
                  )}
                </div>
              ) : <p className="text-[11px] text-muted-foreground/60">no forensic pass ran for this query.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
