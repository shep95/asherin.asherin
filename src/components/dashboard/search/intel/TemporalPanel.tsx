import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { Clock, TrendingUp, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { useIntelAnalysis } from "./useIntelAnalysis";
import type { SearchResult } from "../types";

interface TimelineEvent {
  date: string;
  source: string;
  headline: string;
  type: string;
  keyFacts: string[];
  importance: number;
  sentiment: number;
}
interface NarrativeShift {
  date: string;
  fromNarrative: string;
  toNarrative: string;
  trigger: string;
  impact: "minor" | "moderate" | "major" | "paradigm_shift";
}
interface Prediction {
  prediction: string;
  confidence: number;
  timeframe: string;
}
interface TemporalData {
  timeline: TimelineEvent[];
  narrativeShifts: NarrativeShift[];
  predictedDevelopments: Prediction[];
}

const IMPACT_COLORS: Record<string, string> = {
  minor: "text-muted-foreground border-border/30",
  moderate: "text-amber-300 border-amber-500/30 bg-amber-500/5",
  major: "text-orange-300 border-orange-500/30 bg-orange-500/5",
  paradigm_shift: "text-rose-300 border-rose-500/40 bg-rose-500/10",
};

interface Props { query: string; results: SearchResult[]; }

export default function TemporalPanel({ query, results }: Props) {
  const { data, loading, error, run } = useIntelAnalysis<TemporalData>("temporal");
  useEffect(() => { if (query && results.length > 0) run(query, results); }, [query, results, run]);

  if (loading) return <PanelLoading label="shepherd is rebuilding the timeline…" />;
  if (error) return <PanelError msg={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Timeline */}
      <section>
        <SectionHeader icon={Clock} title="story timeline" count={data.timeline.length} />
        <div className="relative pl-4 border-l border-border/30 space-y-4">
          {data.timeline.map((e, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-accent/60 ring-4 ring-background" />
              <div className="rounded-lg border border-border/20 bg-card/40 backdrop-blur-sm p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-accent/80">{e.date}</span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-1.5 py-0.5 rounded border border-border/20">{e.type.replace(/_/g, " ")}</span>
                </div>
                <h4 className="text-xs font-medium text-foreground mb-1">{e.headline}</h4>
                <p className="text-[10px] text-muted-foreground/70 mb-2">{e.source}</p>
                {e.keyFacts.length > 0 && (
                  <ul className="space-y-0.5">
                    {e.keyFacts.slice(0, 3).map((f, j) => (
                      <li key={j} className="text-[11px] text-muted-foreground/80 pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-accent/40">{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Narrative Shifts */}
      {data.narrativeShifts.length > 0 && (
        <section>
          <SectionHeader icon={TrendingUp} title="narrative shifts detected" count={data.narrativeShifts.length} />
          <div className="space-y-2">
            {data.narrativeShifts.map((s, i) => (
              <div key={i} className={`rounded-lg border p-3 ${IMPACT_COLORS[s.impact] || IMPACT_COLORS.minor}`}>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground">{s.date}</span>
                  <span className="text-[9px] uppercase tracking-wider font-medium">{s.impact.replace(/_/g, " ")}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center text-[11px]">
                  <div className="text-muted-foreground line-through opacity-60">{s.fromNarrative}</div>
                  <div className="text-accent text-center hidden sm:block">→</div>
                  <div className="text-foreground font-medium">{s.toNarrative}</div>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-2 pt-2 border-t border-current/10">
                  <span className="opacity-60">trigger:</span> {s.trigger}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Predictions */}
      {data.predictedDevelopments.length > 0 && (
        <section>
          <SectionHeader icon={Sparkles} title="predicted developments" count={data.predictedDevelopments.length} />
          <div className="space-y-2">
            {data.predictedDevelopments.map((p, i) => (
              <div key={i} className="rounded-lg border border-border/20 bg-card/30 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-[12px] text-foreground font-light leading-relaxed flex-1">{p.prediction}</p>
                  <span className="text-[10px] font-mono text-accent shrink-0">{Math.round(p.confidence)}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60">{p.timeframe}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function SectionHeader({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <h3 className="text-[11px] font-medium tracking-[0.15em] uppercase text-foreground">{title}</h3>
      {count !== undefined && (
        <span className="text-[10px] font-mono text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/20">{count}</span>
      )}
      <div className="flex-1 h-px bg-border/20 ml-2" />
    </div>
  );
}
export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-accent" />
      <span className="text-xs font-light">{label}</span>
    </div>
  );
}
export function PanelError({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5" />
      <div>
        <p className="text-xs font-medium text-rose-300">analysis failed</p>
        <p className="text-[11px] text-muted-foreground mt-1">{msg}</p>
      </div>
    </div>
  );
}
