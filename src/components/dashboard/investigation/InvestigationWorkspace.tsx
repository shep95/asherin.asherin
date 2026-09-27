/**
 * Investigation workspace.
 *
 * One durable research state, seen seven ways. Nothing here renders a value
 * the database does not hold: an empty panel says it is empty, an unavailable
 * adapter says why, and a claim shows the reasoning behind its status rather
 * than a bare score.
 */

import { useMemo, useState } from "react";
import { safeHref } from "@/lib/safeUrl";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  GitBranch,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldQuestion,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TIER_LABEL } from "@/lib/investigation/authority";
import { assessClaim } from "@/lib/investigation/confidence";
import { adapterLabel, RESEARCH_ADAPTERS } from "@/lib/investigation/coordinator";
import { useInvestigation } from "@/lib/investigation/useInvestigation";
import type { Claim, InvestigationSnapshot } from "@/lib/investigation/types";
import { cn } from "@/lib/utils";

interface Props {
  investigationId?: string | null;
  onSelect?: (id: string | null) => void;
}

const STATUS_STYLE: Record<string, string> = {
  resolved: "border-emerald-500/40 text-emerald-300",
  unresolved: "border-amber-500/40 text-amber-300",
  contradicted: "border-rose-500/40 text-rose-300",
  weak: "border-zinc-600 text-zinc-400",
  retracted: "border-zinc-700 text-zinc-500 line-through",
};

function Empty({ icon: Icon, children }: { icon: typeof Search; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Icon className="h-5 w-5 opacity-50" />
      <p className="max-w-sm">{children}</p>
    </div>
  );
}

function ProviderStrip({ snapshot }: { snapshot: InvestigationSnapshot }) {
  const state = snapshot.investigation.providerState || {};
  return (
    <div className="flex flex-wrap gap-2">
      {RESEARCH_ADAPTERS.map((a) => {
        const s = state[a.id];
        const status = s?.status ?? "unknown";
        return (
          <Badge
            key={a.id}
            variant="outline"
            title={s?.detail || a.description}
            className={cn(
              "text-[11px]",
              status === "live" && "border-emerald-500/40 text-emerald-300",
              status === "unavailable" && "border-amber-500/40 text-amber-300",
              status === "not_configured" && "border-zinc-600 text-zinc-400",
              status === "error" && "border-rose-500/40 text-rose-300",
            )}
          >
            {a.label}: {status === "unknown" ? "not run yet" : status.replace("_", " ")}
          </Badge>
        );
      })}
    </div>
  );
}

function ClaimRow({ claim, snapshot }: { claim: Claim; snapshot: InvestigationSnapshot }) {
  const [open, setOpen] = useState(false);
  const assessment = useMemo(
    () => assessClaim({ claim, evidence: snapshot.evidence, sources: snapshot.sources }),
    [claim, snapshot.evidence, snapshot.sources],
  );
  const rows = snapshot.evidence.filter((e) => e.claimId === claim.id);
  const sourceById = new Map(snapshot.sources.map((s) => [s.id, s]));

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-snug">{claim.statement}</p>
          <Badge variant="outline" className={cn("shrink-0 text-[11px]", STATUS_STYLE[assessment.status])}>
            {assessment.status}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {assessment.reason} · confidence {assessment.confidence.toFixed(2)} · {claim.claimKind}
          {assessment.stale ? " · stale" : ""}
        </p>
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
          {!rows.length && <p className="text-xs text-muted-foreground">no evidence row is attached to this claim.</p>}
          {(["supports", "contradicts", "context"] as const).map((stance) => {
            const group = rows.filter((r) => r.stance === stance);
            if (!group.length) return null;
            return (
              <div key={stance}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{stance}</p>
                {group.map((e) => {
                  const s = e.sourceId ? sourceById.get(e.sourceId) : null;
                  return (
                    <div key={e.id} className="mt-1 rounded border border-border/40 p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          tier {e.authorityTier} · {TIER_LABEL[e.authorityTier]}
                        </Badge>
                        {s?.url ? (
                          <a href={safeHref(s.url)} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                            {s.title}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{s?.title ?? "operator document"}</span>
                        )}
                      </div>
                      {e.excerpt && <p className="mt-1 text-muted-foreground">“{e.excerpt}”</p>}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        retrieved {new Date(e.retrievedAt).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InvestigationWorkspace({ investigationId = null, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(investigationId);
  const [question, setQuestion] = useState("");
  const state = useInvestigation(selected ?? investigationId);
  const snapshot = state.snapshot;

  const choose = (id: string | null) => {
    setSelected(id);
    onSelect?.(id);
  };

  const entityById = useMemo(
    () => new Map((snapshot?.entities ?? []).map((e) => [e.id, e])),
    [snapshot?.entities],
  );

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      {/* investigation list */}
      <aside className="hidden w-64 shrink-0 flex-col gap-3 md:flex">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!question.trim()) return;
            const inv = await state.start(question.trim());
            setQuestion("");
            if (inv) choose(inv.id);
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="research question"
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" disabled={state.running} className="h-9 shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 pr-2">
            {!state.list.length && <p className="p-2 text-xs text-muted-foreground">no investigations yet.</p>}
            {state.list.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => choose(inv.id)}
                className={cn(
                  "w-full rounded-md border border-transparent p-2 text-left text-sm hover:bg-muted/40",
                  selected === inv.id && "border-border bg-muted/50",
                )}
              >
                <span className="line-clamp-2">{inv.title}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{inv.status}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* workspace */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        {state.loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> loading investigation…
          </div>
        )}
        {state.error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-300">{state.error}</div>
        )}

        {!snapshot && !state.loading && (
          <Empty icon={Search}>
            select an investigation, or ask asherin to research something in chat — a research request opens one
            automatically.
          </Empty>
        )}

        {snapshot && (
          <>
            <header className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-medium lowercase">{snapshot.investigation.title}</h2>
                  <p className="text-xs text-muted-foreground">{snapshot.investigation.question}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => state.load(snapshot.investigation.id)} disabled={state.running}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> refresh
                  </Button>
                  <Button size="sm" onClick={state.advance} disabled={state.running}>
                    {state.running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="mr-1 h-3.5 w-3.5" />}
                    run next hop
                  </Button>
                </div>
              </div>
              <ProviderStrip snapshot={snapshot} />
              {state.lastResult && !state.lastResult.ok && (
                <p className="text-xs text-amber-300">
                  last hop returned nothing: {state.lastResult.reason || state.lastResult.error || "no source retrieved"}
                </p>
              )}
            </header>

            <Tabs defaultValue="findings" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="flex w-full flex-wrap justify-start">
                <TabsTrigger value="findings">findings</TabsTrigger>
                <TabsTrigger value="graph">entities</TabsTrigger>
                <TabsTrigger value="timeline">timeline</TabsTrigger>
                <TabsTrigger value="sources">sources</TabsTrigger>
                <TabsTrigger value="conflicts">
                  conflicts
                  {snapshot.contradictions.filter((c) => c.resolution === "unresolved").length > 0 && (
                    <span className="ml-1 text-amber-300">
                      {snapshot.contradictions.filter((c) => c.resolution === "unresolved").length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="gaps">gaps</TabsTrigger>
                <TabsTrigger value="hops">hops</TabsTrigger>
              </TabsList>

              <ScrollArea className="mt-3 min-h-0 flex-1">
                <TabsContent value="findings" className="m-0 space-y-2 pr-3">
                  {!snapshot.claims.length ? (
                    <Empty icon={ShieldQuestion}>
                      no claim has been stored yet. a claim is only written when a retrieved source backs it.
                    </Empty>
                  ) : (
                    snapshot.claims
                      .map((claim) => ({ claim, a: assessClaim({ claim, evidence: snapshot.evidence, sources: snapshot.sources }) }))
                      .sort((x, y) => y.a.confidence - x.a.confidence)
                      .map(({ claim }) => <ClaimRow key={claim.id} claim={claim} snapshot={snapshot} />)
                  )}
                </TabsContent>

                <TabsContent value="graph" className="m-0 space-y-2 pr-3">
                  {!snapshot.entities.length ? (
                    <Empty icon={GitBranch}>no entity has been extracted yet.</Empty>
                  ) : (
                    snapshot.entities.map((e) => {
                      const edges = snapshot.relationships.filter((r) => r.fromEntityId === e.id || r.toEntityId === e.id);
                      const ids = snapshot.identifiers.filter((i) => i.entityId === e.id);
                      return (
                        <div key={e.id} className="rounded-lg border border-border/60 p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{e.label}</span>
                            <Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", e.resolutionState === "resolved" ? "border-emerald-500/40 text-emerald-300" : "border-zinc-600 text-zinc-400")}
                            >
                              {e.resolutionState === "candidate" ? "candidate — not confirmed as one entity" : e.resolutionState}
                            </Badge>
                          </div>
                          {ids.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {ids.map((i) => `${i.kind}: ${i.value}`).join(" · ")}
                            </p>
                          )}
                          {edges.length ? (
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {edges.map((r) => (
                                <li key={r.id} className="flex items-center gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {entityById.get(r.fromEntityId)?.label ?? "?"} <span className="text-primary">{r.relationType}</span>{" "}
                                  {entityById.get(r.toEntityId)?.label ?? "?"}
                                  {r.validFrom ? ` (from ${r.validFrom.slice(0, 10)})` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">no relationship recorded for this entity yet.</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="timeline" className="m-0 space-y-2 pr-3">
                  {!snapshot.timeline.length ? (
                    <Empty icon={Clock}>no dated event has been extracted from the stored sources.</Empty>
                  ) : (
                    snapshot.timeline.map((t) => (
                      <div key={t.id} className="flex gap-3 rounded-lg border border-border/60 p-3">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">
                          {t.occurredAt ? t.occurredAt.slice(0, 10) : "date unknown"}
                        </span>
                        <div>
                          <p className="text-sm">{t.label}</p>
                          <p className="text-xs text-muted-foreground">
                            precision {t.datePrecision} · origin {t.origin.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="sources" className="m-0 space-y-2 pr-3">
                  {!snapshot.sources.length && !snapshot.documents.length ? (
                    <Empty icon={FileText}>no source has been retrieved for this investigation.</Empty>
                  ) : (
                    <>
                      {snapshot.sources.map((s) => (
                        <div key={s.id} className="rounded-lg border border-border/60 p-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              tier {s.authorityTier} · {TIER_LABEL[s.authorityTier]}
                            </Badge>
                            {s.url ? (
                              <a href={safeHref(s.url)} target="_blank" rel="noreferrer" className="truncate text-sm text-primary hover:underline">
                                {s.title}
                              </a>
                            ) : (
                              <span className="truncate text-sm">{s.title}</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {s.authorityReason} · retrieved {new Date(s.retrievedAt).toLocaleDateString()}
                            {s.searchRank ? ` · search rank ${s.searchRank} (rank never sets authority)` : ""}
                          </p>
                        </div>
                      ))}
                      {snapshot.documents.map((d) => (
                        <div key={d.id} className="rounded-lg border border-border/60 p-3">
                          <p className="text-sm">{d.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.parseStatus === "parsed"
                              ? "parsed"
                              : `${d.parseStatus}${d.parseError ? ` — ${d.parseError}` : " — no text extracted, nothing inferred from it"}`}
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="conflicts" className="m-0 space-y-2 pr-3">
                  {!snapshot.contradictions.length ? (
                    <Empty icon={AlertTriangle}>no contradiction between stored claims.</Empty>
                  ) : (
                    snapshot.contradictions.map((c) => {
                      const a = snapshot.claims.find((x) => x.id === c.claimA);
                      const b = snapshot.claims.find((x) => x.id === c.claimB);
                      return (
                        <div key={c.id} className="rounded-lg border border-border/60 p-3">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", c.resolution === "unresolved" ? "border-amber-500/40 text-amber-300" : "border-emerald-500/40 text-emerald-300")}
                          >
                            {c.resolution.replace(/_/g, " ")}
                          </Badge>
                          <p className={cn("mt-2 text-sm", c.resolution === "favored_a" && "text-emerald-300")}>{a?.statement}</p>
                          <p className={cn("text-sm", c.resolution === "favored_b" && "text-emerald-300")}>{b?.statement}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{c.resolutionReason}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">both claims stay on record; nothing was deleted.</p>
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="gaps" className="m-0 space-y-2 pr-3">
                  {!snapshot.gaps.filter((g) => g.status === "open").length ? (
                    <Empty icon={ShieldQuestion}>no open gap recorded.</Empty>
                  ) : (
                    snapshot.gaps
                      .filter((g) => g.status === "open")
                      .map((g) => (
                        <div key={g.id} className="rounded-lg border border-border/60 p-3 text-sm">
                          {g.description}
                          <span className="ml-2 text-xs text-muted-foreground">({g.gapType.replace(/_/g, " ")})</span>
                        </div>
                      ))
                  )}
                </TabsContent>

                <TabsContent value="hops" className="m-0 space-y-2 pr-3">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">next best hops</p>
                    {!state.nextHops.length && <p className="text-sm text-muted-foreground">nothing concrete left to fetch.</p>}
                    {state.nextHops.map((h) => (
                      <div key={h.objective} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                        <div>
                          <p className="text-sm">
                            <Badge variant="outline" className="mr-2 text-[10px]">{h.phase}</Badge>
                            {h.objective}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{h.rationale}</p>
                        </div>
                        <Button size="sm" variant="outline" disabled={state.running} onClick={() => state.runSpecific(h)}>
                          run
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">completed hops</p>
                    {!snapshot.hops.length && <p className="text-sm text-muted-foreground">no hop has run yet.</p>}
                    {snapshot.hops.map((h) => (
                      <div key={h.id} className="rounded-lg border border-border/60 p-3">
                        <p className="text-sm">
                          <Badge variant="outline" className="mr-2 text-[10px]">
                            {h.hopNumber} · {h.phase}
                          </Badge>
                          {h.objective}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {h.status}
                          {h.stats && Object.keys(h.stats).length
                            ? ` · ${Object.entries(h.stats).map(([k, v]) => `${k} ${String(v)}`).join(", ")}`
                            : ""}
                        </p>
                        {Object.entries(h.providerState || {})
                          .filter(([, v]) => v && v.status !== "live")
                          .map(([id, v]) => (
                            <p key={id} className="text-[11px] text-amber-300">
                              {adapterLabel(id)}: {v!.status.replace("_", " ")}
                              {v!.detail ? ` — ${v!.detail}` : ""}
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        )}
      </section>
    </div>
  );
}
