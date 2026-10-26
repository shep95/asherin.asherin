import { useEffect } from "react";
import { Search, AlertOctagon, Target, FileQuestion, CheckCircle2 } from "lucide-react";
import { useIntelAnalysis } from "./useIntelAnalysis";
import { SectionHeader, PanelLoading, PanelError } from "./TemporalPanel";
import type { SearchResult } from "../types";

interface Gap {
  description: string;
  importance: number;
  urgency: "low" | "medium" | "high" | "critical";
  whyItMatters: string;
  likelyLocations: string[];
  difficulty: "easy" | "moderate" | "hard" | "very_hard";
  suggestedApproach: string;
  suggestedQueries: string[];
}
interface Phase {
  phase: string;
  steps: string[];
  expectedFindings: string;
  estimatedTime: string;
}
interface InvestData {
  confirmedFacts: string[];
  likelyFacts: string[];
  disputedFacts: string[];
  unansweredQuestions: string[];
  overallConfidence: number;
  gaps: Gap[];
  investigationPath: Phase[];
}

const URGENCY: Record<string, string> = {
  low: "text-muted-foreground border-border/30",
  medium: "text-amber-300 border-amber-500/30 bg-amber-500/5",
  high: "text-orange-300 border-orange-500/30 bg-orange-500/5",
  critical: "text-rose-300 border-rose-500/40 bg-rose-500/10",
};

interface Props {
  query: string;
  results: SearchResult[];
  onRunQuery?: (q: string) => void;
}

export default function InvestigativePanel({ query, results, onRunQuery }: Props) {
  const { data, loading, error, run } = useIntelAnalysis<InvestData>("investigative");
  useEffect(() => { if (query && results.length > 0) run(query, results); }, [query, results, run]);

  if (loading) return <PanelLoading label="shepherd is mapping the gaps…" />;
  if (error) return <PanelError msg={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Knowledge Status */}
      <section>
        <SectionHeader icon={Target} title="knowledge status" />
        <div className="rounded-xl border border-border/20 bg-card/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-muted-foreground">overall confidence</span>
            <span className="text-2xl font-extralight text-accent">{Math.round(data.overallConfidence)}%</span>
          </div>
          <div className="h-1 rounded-full bg-foreground/5 mb-4 overflow-hidden">
            <div className="h-full bg-accent/60" style={{ width: `${data.overallConfidence}%` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px]">
            <Stat label="Confirmed" value={data.confirmedFacts.length} color="text-emerald-300" />
            <Stat label="Likely" value={data.likelyFacts.length} color="text-amber-300" />
            <Stat label="Disputed" value={data.disputedFacts.length} color="text-orange-300" />
            <Stat label="Unknown" value={data.gaps.length} color="text-rose-300" />
          </div>
        </div>
      </section>

      {/* Confirmed facts */}
      {data.confirmedFacts.length > 0 && (
        <section>
          <SectionHeader icon={CheckCircle2} title="confirmed facts" count={data.confirmedFacts.length} />
          <ul className="space-y-1">
            {data.confirmedFacts.map((f, i) => (
              <li key={i} className="text-[11px] text-foreground/80 pl-4 relative before:content-['✓'] before:absolute before:left-0 before:text-emerald-400">{f}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Critical Gaps */}
      {data.gaps.length > 0 && (
        <section>
          <SectionHeader icon={AlertOctagon} title="critical information gaps" count={data.gaps.length} />
          <div className="space-y-3">
            {data.gaps.sort((a, b) => b.importance - a.importance).map((g, i) => (
              <div key={i} className={`rounded-xl border p-4 ${URGENCY[g.urgency]}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h4 className="text-xs font-medium text-foreground flex-1 min-w-0">{g.description}</h4>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono">imp {Math.round(g.importance)}</span>
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-current/30">{g.urgency}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80 mb-3 italic">Why it matters: {g.whyItMatters}</p>

                <div className="space-y-2 mb-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">likely locations</p>
                    <div className="flex flex-wrap gap-1">
                      {g.likelyLocations.map((l, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded border border-border/20 bg-card/40 text-muted-foreground">{l}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">Approach <span className="opacity-50">· {g.difficulty.replace(/_/g, " ")}</span></p>
                    <p className="text-[11px] text-foreground/80">{g.suggestedApproach}</p>
                  </div>
                </div>

                {g.suggestedQueries.length > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">run these queries</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.suggestedQueries.map((q, j) => (
                        <button
                          key={j}
                          onClick={() => onRunQuery?.(q)}
                          disabled={!onRunQuery}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                        >
                          <Search className="h-2.5 w-2.5" /> {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Investigation path */}
      {data.investigationPath.length > 0 && (
        <section>
          <SectionHeader icon={Target} title="investigation roadmap" count={data.investigationPath.length} />
          <div className="space-y-3">
            {data.investigationPath.map((p, i) => (
              <div key={i} className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <h4 className="text-xs font-medium text-accent">{p.phase}</h4>
                  <span className="text-[10px] text-muted-foreground">{p.estimatedTime}</span>
                </div>
                <ul className="space-y-1 mb-3">
                  {p.steps.map((s, j) => (
                    <li key={j} className="text-[11px] text-foreground/80 pl-4 relative before:content-[''] before:absolute before:left-1 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-accent">{s}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground/70 italic border-t border-current/10 pt-2">
                  Expected: {p.expectedFindings}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unanswered questions */}
      {data.unansweredQuestions.length > 0 && (
        <section>
          <SectionHeader icon={FileQuestion} title="unanswered questions" count={data.unansweredQuestions.length} />
          <ul className="space-y-1.5">
            {data.unansweredQuestions.map((q, i) => (
              <li key={i} className="text-[11px] text-muted-foreground/80 pl-4 relative before:content-['?'] before:absolute before:left-0 before:text-amber-400">{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-border/20 bg-card/30 p-2">
      <div className={`text-lg font-extralight ${color}`}>{value}</div>
      <div className="text-muted-foreground/60 uppercase tracking-wider text-[9px]">{label}</div>
    </div>
  );
}
