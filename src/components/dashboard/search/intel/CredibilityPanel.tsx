import { useEffect } from "react";
import { Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useIntelAnalysis } from "./useIntelAnalysis";
import { SectionHeader, PanelLoading, PanelError } from "./TemporalPanel";
import type { SearchResult } from "../types";

interface SourceCred {
  source: string;
  credibilityScore: number;
  politicalBias: number;
  biasConfidence: number;
  accuracyRate: number;
  ownership: string;
  fundingType: string;
  hasFactChecking: boolean;
  warnings: string[];
  strengths: string[];
}
interface CredData { sources: SourceCred[]; }

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-300";
  if (s >= 60) return "text-amber-300";
  if (s >= 40) return "text-orange-300";
  return "text-rose-300";
}
function scoreBg(s: number) {
  if (s >= 80) return "bg-emerald-500";
  if (s >= 60) return "bg-amber-500";
  if (s >= 40) return "bg-orange-500";
  return "bg-rose-500";
}

interface Props { query: string; results: SearchResult[]; }

export default function CredibilityPanel({ query, results }: Props) {
  const { data, loading, error, run } = useIntelAnalysis<CredData>("credibility");
  useEffect(() => { if (query && results.length > 0) run(query, results); }, [query, results, run]);

  if (loading) return <PanelLoading label="shepherd is profiling the sources…" />;
  if (error) return <PanelError msg={error} />;
  if (!data) return null;

  const sorted = [...data.sources].sort((a, b) => b.credibilityScore - a.credibilityScore);

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader icon={Shield} title="source credibility" count={sorted.length} />
      <div className="space-y-3">
        {sorted.map((s, i) => (
          <div key={i} className="rounded-xl border border-border/20 bg-card/40 backdrop-blur-sm p-4">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-foreground truncate">{s.source}</h4>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{s.ownership} · {s.fundingType}</p>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-2xl font-extralight ${scoreColor(s.credibilityScore)}`}>{Math.round(s.credibilityScore)}</div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">credibility</div>
              </div>
            </div>

            {/* Credibility bar */}
            <div className="h-1 rounded-full bg-foreground/5 overflow-hidden mb-3">
              <div className={`h-full ${scoreBg(s.credibilityScore)} transition-all`} style={{ width: `${Math.max(2, s.credibilityScore)}%` }} />
            </div>

            {/* Bias */}
            <div className="mb-3">
              <div className="flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">
                <span>far left</span><span>center</span><span>far right</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-gradient-to-r from-blue-500/30 via-foreground/10 to-rose-500/30">
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-foreground border-2 border-background"
                  style={{ left: `calc(${(s.politicalBias + 100) / 2}% - 6px)` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Bias: {s.politicalBias > 0 ? "+" : ""}{Math.round(s.politicalBias)} · Confidence {Math.round(s.biasConfidence)}%
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 text-[11px] mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/60">accuracy:</span>
                <span className={scoreColor(s.accuracyRate)}>{Math.round(s.accuracyRate)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                {s.hasFactChecking ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                )}
                <span className="text-muted-foreground/80">{s.hasFactChecking ? "Fact-checked" : "No fact-check"}</span>
              </div>
            </div>

            {/* Strengths & Warnings */}
            {s.strengths.length > 0 && (
              <div className="mb-2">
                {s.strengths.map((w, j) => (
                  <p key={j} className="text-[10px] text-emerald-300/80 flex items-start gap-1.5 mb-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
            {s.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
                {s.warnings.map((w, j) => (
                  <p key={j} className="text-[10px] text-amber-300/90 flex items-start gap-1.5 mb-0.5 last:mb-0">
                    <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
