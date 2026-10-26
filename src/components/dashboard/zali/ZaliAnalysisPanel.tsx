import { useCallback, useEffect, useState } from "react";
import { Activity, Factory, Dna, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Loader2, Sparkles, Play, Sliders, Trophy, Clock, DollarSign } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ZaliProject } from "./types";
import {
  ESTIMATE_TYPES, runAnalysis,
  type EstimateResult, type EstimateType, type ManufacturingResult, type ProposalsResult,
} from "./zaliAnalysis";

// One tab for everything shepherd estimates about the record: engineering
// estimates, manufacturability, and design proposals. Results persist per
// project in `zali_analyses` on this device and reload when the tab opens.

type Section = "estimates" | "manufacturing" | "proposals";

const SECTIONS: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "estimates", label: "estimates", icon: Activity },
  { id: "manufacturing", label: "manufacturing", icon: Factory },
  { id: "proposals", label: "proposals", icon: Dna },
];

const OBJECTIVES = [
  { id: "cost", label: "cost", default: 40 },
  { id: "performance", label: "performance", default: 30 },
  { id: "weight", label: "weight", default: 20 },
  { id: "buildTime", label: "build time", default: 10 },
];

interface Props { project: ZaliProject | null }

interface StoredRow { kind: string; sub_kind: string | null; result: unknown; created_at: string }

const ZaliAnalysisPanel = ({ project }: Props) => {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("estimates");
  const [estimateType, setEstimateType] = useState<EstimateType>("structural");
  const [estimates, setEstimates] = useState<Partial<Record<EstimateType, EstimateResult>>>({});
  const [manufacturing, setManufacturing] = useState<ManufacturingResult | null>(null);
  const [mfgTab, setMfgTab] = useState<"dfm" | "certifications" | "timeline" | "sourcing">("dfm");
  const [proposals, setProposals] = useState<ProposalsResult | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<number | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>(Object.fromEntries(OBJECTIVES.map((o) => [o.id, o.default])));
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Last stored result per kind for this project.
  useEffect(() => {
    setEstimates({}); setManufacturing(null); setProposals(null); setError(null);
    if (!project || !user) return;
    let cancelled = false;
    supabase.from("zali_analyses").select("kind, sub_kind, result, created_at").eq("project_id", project.id).order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const est: Partial<Record<EstimateType, EstimateResult>> = {};
        let mfg: ManufacturingResult | null = null;
        let prop: ProposalsResult | null = null;
        for (const row of data as StoredRow[]) {
          if (row.kind === "estimate" && row.sub_kind && !est[row.sub_kind as EstimateType]) est[row.sub_kind as EstimateType] = row.result as EstimateResult;
          else if (row.kind === "manufacturing" && !mfg) mfg = row.result as ManufacturingResult;
          else if (row.kind === "proposals" && !prop) prop = row.result as ProposalsResult;
        }
        setEstimates(est); setManufacturing(mfg); setProposals(prop);
      });
    return () => { cancelled = true; };
  }, [project?.id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (kind: string, subKind: string | null, result: unknown) => {
    if (!project || !user) return;
    await supabase.from("zali_analyses").insert({ project_id: project.id, user_id: user.id, kind, sub_kind: subKind, result });
  }, [project, user]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const runEstimate = async (t: EstimateType) => {
    if (!project) return;
    setEstimateType(t); setRunning(`estimate:${t}`); setError(null);
    try {
      const r = await runAnalysis({ kind: "estimate", project, estimateType: t });
      setEstimates((prev) => ({ ...prev, [t]: r }));
      await persist("estimate", t, r);
    } catch (e) { fail(e); } finally { setRunning(null); }
  };

  const runManufacturing = async () => {
    if (!project) return;
    setRunning("manufacturing"); setError(null);
    try {
      const r = await runAnalysis({ kind: "manufacturing", project });
      setManufacturing(r);
      await persist("manufacturing", null, r);
    } catch (e) { fail(e); } finally { setRunning(null); }
  };

  const runProposals = async () => {
    if (!project) return;
    setRunning("proposals"); setError(null);
    try {
      const r = await runAnalysis({ kind: "proposals", project, weights });
      setProposals(r); setSelectedProposal(null);
      await persist("proposals", null, r);
    } catch (e) { fail(e); } finally { setRunning(null); }
  };

  const handleWeight = (id: string, val: number) => {
    const total = Object.values(weights).reduce((s, v) => s + v, 0) - weights[id] + val;
    if (total <= 100) setWeights((prev) => ({ ...prev, [id]: val }));
  };

  const Assumptions = ({ items }: { items: string[] }) => items.length ? (
    <div className="rounded-lg border border-border/15 bg-card/20 p-3">
      <p className="text-[9px] text-muted-foreground/50 tracking-wider mb-1.5">assumptions shepherd made</p>
      <ul className="list-disc pl-4 space-y-0.5">{items.map((a, i) => <li key={i} className="text-[10px] text-muted-foreground/70">{a}</li>)}</ul>
    </div>
  ) : null;

  const current = estimates[estimateType];
  const weightTotal = Object.values(weights).reduce((s, v) => s + v, 0);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground">analysis</h2>
          <p className="text-[9px] text-muted-foreground/50 mt-0.5 leading-relaxed">
            shepherd reasons about the project record. it does not run a solver or query a supplier: every figure is an estimate, with its assumptions listed. results stay on this device.
          </p>
        </div>

        <div className="flex gap-1 overflow-x-auto scrollbar-none" role="tablist" aria-label="analysis sections">
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-light whitespace-nowrap transition-colors ${section === s.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}>
              <s.icon className="h-3 w-3" /> {s.label}
            </button>
          ))}
        </div>

        {!project ? (
          <div className="text-center py-12 space-y-3">
            <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto" />
            <p className="text-sm font-extralight text-muted-foreground/40">create a project first</p>
          </div>
        ) : (
          <>
            {error && <p className="text-[10px] text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2" role="alert">{error}</p>}

            {section === "estimates" && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ESTIMATE_TYPES.map((t) => {
                    const done = !!estimates[t.id];
                    const active = running === `estimate:${t.id}`;
                    return (
                      <button key={t.id} onClick={() => runEstimate(t.id)} disabled={!!running}
                        className={`rounded-xl border p-3 text-left transition-all disabled:opacity-60 ${
                          active ? "border-amber-500/40 bg-amber-500/10" : done ? "border-emerald-500/20 bg-emerald-500/5" : estimateType === t.id ? "border-border/30 bg-card/30" : "border-border/15 bg-card/20 hover:border-border/30"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <Activity className={`h-4 w-4 ${done ? "text-emerald-400" : active ? "text-amber-400" : "text-muted-foreground/50"}`} />
                          {done && !active && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                          {active && <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />}
                        </div>
                        <p className="text-[10px] font-light text-foreground">{t.label}</p>
                        <p className="text-[8px] text-muted-foreground/40">{t.description}</p>
                      </button>
                    );
                  })}
                </div>

                {running?.startsWith("estimate:") && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3" role="status">
                    <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                    <span className="text-[10px] text-amber-400">asking shepherd for a {ESTIMATE_TYPES.find((s) => s.id === estimateType)?.label} estimate…</span>
                  </div>
                )}

                {current && !running && (
                  <div className={`rounded-xl border p-4 ${current.status === "pass" ? "border-emerald-500/20 bg-emerald-500/5" : current.status === "fail" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {current.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : current.status === "fail" ? <XCircle className="h-4 w-4 text-red-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                      <h3 className="text-xs font-light text-foreground">
                        {ESTIMATE_TYPES.find((s) => s.id === estimateType)?.label} · {current.status === "pass" ? "looks sound" : current.status === "fail" ? "does not hold" : "issue to resolve"} · estimate
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {Object.entries(current.metrics).map(([key, val]) => (
                        <div key={key} className="rounded-lg bg-card/30 border border-border/10 p-2.5">
                          <p className="text-[8px] tracking-wider text-muted-foreground/40">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().trim()}</p>
                          <p className="text-[11px] font-light text-foreground">{val}</p>
                        </div>
                      ))}
                    </div>
                    {current.recommendations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/10 space-y-1.5">
                        <p className="text-[10px] font-light text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> recommendations</p>
                        {current.recommendations.map((rec, i) => <p key={i} className="text-[10px] text-muted-foreground/70 pl-4">• {rec}</p>)}
                      </div>
                    )}
                    <div className="mt-3"><Assumptions items={current.assumptions} /></div>
                  </div>
                )}

                {!running && !current && (
                  <p className="text-[10px] text-muted-foreground/40 text-center py-4">pick a type above to ask shepherd for an estimate</p>
                )}
              </>
            )}

            {section === "manufacturing" && (
              !manufacturing ? (
                <div className="text-center py-10 space-y-4">
                  <Factory className="h-10 w-10 text-emerald-400/30 mx-auto" />
                  <p className="text-sm font-extralight text-muted-foreground/40">ask shepherd to review manufacturability</p>
                  <p className="text-[10px] text-muted-foreground/30">design-for-manufacture checks, likely certifications, a rough timeline and where parts like these are sourced</p>
                  <button onClick={runManufacturing} disabled={!!running}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-3 text-xs font-light text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                    {running === "manufacturing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {running === "manufacturing" ? "asking shepherd…" : "review manufacturability"}
                  </button>
                </div>
              ) : (
                <>
                  {(() => {
                    const clean = !manufacturing.dfmChecks.some((c) => c.status !== "pass");
                    return (
                      <div className={`rounded-xl border p-4 ${clean ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                        <div className="flex items-center gap-3">
                          {clean ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                          <div>
                            <p className="text-sm font-light text-foreground">{clean ? "no blocking issues found" : "issues to resolve"} · estimate</p>
                            <p className="text-[10px] text-muted-foreground/60">
                              {manufacturing.totalCost ? `cost ${manufacturing.totalCost}` : "cost not estimated"} · {manufacturing.maxLeadDays != null ? `lead ~${manufacturing.maxLeadDays} days` : "lead time not estimated"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex gap-1 overflow-x-auto scrollbar-none" role="tablist" aria-label="manufacturing sections">
                    {(["dfm", "certifications", "timeline", "sourcing"] as const).map((t) => (
                      <button key={t} role="tab" aria-selected={mfgTab === t} onClick={() => setMfgTab(t)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-light whitespace-nowrap transition-colors ${mfgTab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
                      >{t === "dfm" ? "dfm checks" : t}</button>
                    ))}
                  </div>

                  {mfgTab === "dfm" && (
                    manufacturing.dfmChecks.length === 0 ? <p className="text-[10px] text-muted-foreground/40 py-4 text-center">no checks returned</p> : (
                      <div className="space-y-2.5">
                        {manufacturing.dfmChecks.map((check, i) => (
                          <div key={i} className="rounded-xl border border-border/15 bg-card/20 p-3.5">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                {check.status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" /> : check.status === "fail" ? <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />}
                                <span className="text-[11px] font-light text-foreground truncate">{check.label}</span>
                              </div>
                              <span className={`text-[9px] px-2 py-0.5 rounded-md flex-shrink-0 ${check.status === "pass" ? "bg-emerald-500/10 text-emerald-400" : check.status === "fail" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>{check.status}</span>
                            </div>
                            {check.detail && <p className="text-[9px] text-muted-foreground/50 mb-2">{check.detail}</p>}
                            {(check.cost || check.lead) && (
                              <div className="flex items-center gap-4 text-[9px] text-muted-foreground/40">
                                {check.cost && <span className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" /> {check.cost}</span>}
                                {check.lead && <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {check.lead}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {mfgTab === "certifications" && (
                    manufacturing.certifications.length === 0 ? <p className="text-[10px] text-muted-foreground/40 py-4 text-center">none suggested</p> : (
                      <div className="space-y-2.5">
                        {manufacturing.certifications.map((cert, i) => (
                          <div key={i} className="rounded-xl border border-border/15 bg-card/20 p-3.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ShieldCheck className={`h-3.5 w-3.5 flex-shrink-0 ${cert.status === "pass" ? "text-emerald-400" : cert.status === "needs-review" ? "text-amber-400" : "text-muted-foreground/30"}`} />
                              <span className="text-[11px] font-light text-foreground truncate">{cert.name}</span>
                              {cert.required && <span className="text-[8px] text-red-400/60">required</span>}
                            </div>
                            <span className={`text-[9px] px-2 py-0.5 rounded-md flex-shrink-0 ${cert.status === "pass" ? "bg-emerald-500/10 text-emerald-400" : cert.status === "needs-review" ? "bg-amber-500/10 text-amber-400" : "bg-foreground/5 text-muted-foreground/40"}`}>
                              {cert.status === "pass" ? "likely met" : cert.status === "needs-review" ? "review" : "optional"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {mfgTab === "timeline" && (
                    manufacturing.timeline.length === 0 ? <p className="text-[10px] text-muted-foreground/40 py-4 text-center">no timeline returned</p> : (
                      <div className="rounded-xl border border-border/15 bg-card/20 p-4">
                        <h3 className="text-[11px] font-light text-foreground mb-4">rough production timeline</h3>
                        <div className="space-y-3">
                          {manufacturing.timeline.map((step, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`h-3 w-3 rounded-full ${step.status === "ready" ? "bg-emerald-400" : "bg-muted-foreground/20"}`} />
                                {i < manufacturing.timeline.length - 1 && <div className="w-0.5 h-4 bg-border/20" />}
                              </div>
                              <div>
                                <p className="text-[10px] font-light text-foreground">{step.week}</p>
                                <p className="text-[9px] text-muted-foreground/50">{step.task}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {mfgTab === "sourcing" && (
                    manufacturing.sourcing.length === 0 ? <p className="text-[10px] text-muted-foreground/40 py-4 text-center">no sourcing notes returned</p> : (
                      <ul className="space-y-2 list-none m-0 p-0">
                        {manufacturing.sourcing.map((s, i) => <li key={i} className="rounded-xl border border-border/15 bg-card/20 p-3 text-[10px] text-foreground/80">{s}</li>)}
                      </ul>
                    )
                  )}

                  <Assumptions items={manufacturing.assumptions} />

                  <button onClick={runManufacturing} disabled={!!running}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/20 py-2.5 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50">
                    {running === "manufacturing" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    ask again
                  </button>
                </>
              )
            )}

            {section === "proposals" && (
              <>
                <div className="rounded-xl border border-border/15 bg-card/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sliders className="h-3.5 w-3.5 text-accent/60" />
                    <h3 className="text-[11px] font-light text-foreground">priorities</h3>
                    <span className="ml-auto text-[9px] text-muted-foreground/40">total {weightTotal}%</span>
                  </div>
                  <div className="space-y-3">
                    {OBJECTIVES.map((obj) => (
                      <label key={obj.id} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground/60 w-20">{obj.label}</span>
                        <input type="range" min={0} max={100} value={weights[obj.id]}
                          onChange={(e) => handleWeight(obj.id, parseInt(e.target.value, 10))}
                          aria-label={`${obj.label} weight`}
                          className="flex-1 h-1 accent-accent" />
                        <span className="text-[10px] text-foreground w-8 text-right">{weights[obj.id]}%</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button onClick={runProposals} disabled={!!running}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 py-3 text-xs font-light text-purple-400 transition-all disabled:opacity-50">
                  {running === "proposals" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> asking shepherd…</> : <><Play className="h-3.5 w-3.5" /> {proposals ? "propose again with these weights" : "ask shepherd for three variants"}</>}
                </button>

                {proposals && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="h-4 w-4 text-amber-400" />
                      <h3 className="text-xs font-light text-foreground">proposed variants · estimates</h3>
                    </div>
                    {proposals.designs.map((design, i) => (
                      <button key={i} onClick={() => setSelectedProposal(selectedProposal === i ? null : i)} aria-expanded={selectedProposal === i}
                        className={`w-full text-left rounded-xl border p-4 transition-all ${selectedProposal === i ? "border-accent/40 bg-accent/10" : "border-border/15 bg-card/20 hover:border-border/30"}`}>
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-light text-foreground truncate">{design.name}</span>
                            {design.badge && <span className="text-[9px] text-amber-400 flex-shrink-0">{design.badge}</span>}
                          </div>
                          <span className="text-sm font-light text-accent flex-shrink-0">{design.score}/100</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                          {(["cost", "performance", "weight", "buildTime"] as const).map((key) => {
                            const m = design.metrics[key];
                            if (!m) return null;
                            return (
                              <div key={key}>
                                <p className="text-[8px] tracking-wider text-muted-foreground/40">{key === "buildTime" ? "build" : key}</p>
                                <p className="text-[11px] text-foreground">{m.value}</p>
                                <p className={`text-[9px] ${m.delta.startsWith("-") ? "text-emerald-400" : m.delta === "0%" || !m.delta ? "text-muted-foreground/40" : "text-amber-400"}`}>{m.delta}</p>
                              </div>
                            );
                          })}
                        </div>
                        {selectedProposal === i && (
                          <div className="space-y-2 pt-2 border-t border-border/10 animate-fade-in">
                            {design.changes.length > 0 && (
                              <div>
                                <p className="text-[9px] text-muted-foreground/50 mb-1">changes</p>
                                {design.changes.map((c, j) => (
                                  <p key={j} className="text-[10px] text-foreground flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /> {c}</p>
                                ))}
                              </div>
                            )}
                            {design.tradeoffs.length > 0 && (
                              <div>
                                <p className="text-[9px] text-muted-foreground/50 mb-1">trade-offs</p>
                                {design.tradeoffs.map((t, j) => <p key={j} className="text-[10px] text-muted-foreground/60">• {t}</p>)}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                    <Assumptions items={proposals.assumptions} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
};

export default ZaliAnalysisPanel;
