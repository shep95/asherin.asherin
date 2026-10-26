import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, XCircle, HelpCircle, GitBranch, Scale } from "lucide-react";
import { useIntelAnalysis } from "./useIntelAnalysis";
import { SectionHeader, PanelLoading, PanelError } from "./TemporalPanel";
import type { SearchResult } from "../types";

type Verdict = "true" | "mostly_true" | "half_true" | "mostly_false" | "false" | "unverifiable";
interface Claim {
  claim: string;
  claimant: string;
  verdict: Verdict;
  confidence: number;
  supportingSources: string[];
  contradictingSources: string[];
  consensusView: string;
  agreementPercent: number;
}
interface Contradiction {
  claim1: string;
  claim2: string;
  level: "minor" | "moderate" | "severe" | "complete";
  explanation: string;
  possibleReason: string;
}
interface FactData { claims: Claim[]; contradictions: Contradiction[]; }

const VERDICT_STYLES: Record<Verdict, { color: string; bg: string; icon: LucideIcon; label: string }> = {
  true: { color: "text-emerald-300", bg: "border-emerald-500/30 bg-emerald-500/5", icon: CheckCircle2, label: "TRUE" },
  mostly_true: { color: "text-emerald-300/80", bg: "border-emerald-500/20 bg-emerald-500/5", icon: CheckCircle2, label: "MOSTLY TRUE" },
  half_true: { color: "text-amber-300", bg: "border-amber-500/30 bg-amber-500/5", icon: Scale, label: "HALF TRUE" },
  mostly_false: { color: "text-orange-300", bg: "border-orange-500/30 bg-orange-500/5", icon: XCircle, label: "MOSTLY FALSE" },
  false: { color: "text-rose-300", bg: "border-rose-500/40 bg-rose-500/10", icon: XCircle, label: "FALSE" },
  unverifiable: { color: "text-muted-foreground", bg: "border-border/30 bg-card/30", icon: HelpCircle, label: "UNVERIFIABLE" },
};

interface Props { query: string; results: SearchResult[]; }

export default function FactCheckPanel({ query, results }: Props) {
  const { data, loading, error, run } = useIntelAnalysis<FactData>("factcheck");
  useEffect(() => { if (query && results.length > 0) run(query, results); }, [query, results, run]);

  if (loading) return <PanelLoading label="shepherd is checking the claims…" />;
  if (error) return <PanelError msg={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <section>
        <SectionHeader icon={Scale} title="verified claims" count={data.claims.length} />
        <div className="space-y-3">
          {data.claims.map((c, i) => {
            const v = VERDICT_STYLES[c.verdict] || VERDICT_STYLES.unverifiable;
            const Icon = v.icon;
            return (
              <div key={i} className={`rounded-xl border ${v.bg} p-4`}>
                <div className="flex items-start gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${v.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground font-medium leading-relaxed mb-1">"{c.claim}"</p>
                    <p className="text-[10px] text-muted-foreground/60">— {c.claimant}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <span className={`text-[10px] font-medium tracking-wider ${v.color}`}>{v.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{Math.round(c.confidence)}% confidence</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] mb-3">
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
                    <div className="text-emerald-300 text-base font-light">{c.supportingSources.length}</div>
                    <div className="text-muted-foreground/60">supports</div>
                  </div>
                  <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2 text-center">
                    <div className="text-rose-300 text-base font-light">{c.contradictingSources.length}</div>
                    <div className="text-muted-foreground/60">contradicts</div>
                  </div>
                  <div className="rounded-md border border-border/20 bg-card/30 p-2 text-center">
                    <div className="text-foreground text-base font-light">{Math.round(c.agreementPercent)}%</div>
                    <div className="text-muted-foreground/60">agree</div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80 italic border-l-2 border-current/20 pl-2">
                  {c.consensusView}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {data.contradictions.length > 0 && (
        <section>
          <SectionHeader icon={GitBranch} title="contradictions detected" count={data.contradictions.length} />
          <div className="space-y-3">
            {data.contradictions.map((c, i) => (
              <div key={i} className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-rose-300 font-medium">{c.level} contradiction</span>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="rounded-md border border-border/20 bg-card/40 p-2">
                    <p className="text-[10px] text-muted-foreground/60 mb-1">version a</p>
                    <p className="text-xs text-foreground">"{c.claim1}"</p>
                  </div>
                  <div className="text-center text-rose-400 text-xs">⚡ vs ⚡</div>
                  <div className="rounded-md border border-border/20 bg-card/40 p-2">
                    <p className="text-[10px] text-muted-foreground/60 mb-1">version b</p>
                    <p className="text-xs text-foreground">"{c.claim2}"</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80 mb-1">{c.explanation}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  <span className="opacity-60">likely cause:</span> {c.possibleReason}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
