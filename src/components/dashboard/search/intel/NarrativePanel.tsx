import { useEffect } from "react";
import { MessageSquare, Tag, Heart } from "lucide-react";
import { useIntelAnalysis } from "./useIntelAnalysis";
import { SectionHeader, PanelLoading, PanelError } from "./TemporalPanel";
import type { SearchResult } from "../types";

interface Frame {
  name: string;
  description: string;
  prevalence: number;
  sentiment: number;
  emphasizes: string[];
  downplays: string[];
  ideologicalLean: number;
  sources: string[];
  exampleHeadline: string;
}
interface LoadedTerm {
  term: string;
  count: number;
  connotation: "positive" | "negative" | "neutral";
  implication: string;
}
interface NarrativeData {
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  emotionalLanguage: { anger: number; fear: number; joy: number; sadness: number; neutral: number };
  frames: Frame[];
  loadedTerms: LoadedTerm[];
}

const CONN_COLORS = {
  positive: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5",
  negative: "text-rose-300 border-rose-500/30 bg-rose-500/5",
  neutral: "text-muted-foreground border-border/30 bg-card/30",
};

interface Props { query: string; results: SearchResult[]; }

export default function NarrativePanel({ query, results }: Props) {
  const { data, loading, error, run } = useIntelAnalysis<NarrativeData>("narrative");
  useEffect(() => { if (query && results.length > 0) run(query, results); }, [query, results, run]);

  if (loading) return <PanelLoading label="shepherd is reading the narratives…" />;
  if (error) return <PanelError msg={error} />;
  if (!data) return null;

  const sd = data.sentimentDistribution;
  const total = sd.positive + sd.neutral + sd.negative || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sentiment */}
      <section>
        <SectionHeader icon={Heart} title="sentiment distribution" />
        <div className="rounded-xl border border-border/20 bg-card/40 p-4">
          <div className="flex h-3 rounded-full overflow-hidden mb-3">
            <div className="bg-emerald-500/60" style={{ width: `${(sd.positive / total) * 100}%` }} />
            <div className="bg-foreground/20" style={{ width: `${(sd.neutral / total) * 100}%` }} />
            <div className="bg-rose-500/60" style={{ width: `${(sd.negative / total) * 100}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><span className="text-emerald-300">{Math.round((sd.positive / total) * 100)}%</span> positive</div>
            <div className="text-center"><span className="text-foreground">{Math.round((sd.neutral / total) * 100)}%</span> neutral</div>
            <div className="text-right"><span className="text-rose-300">{Math.round((sd.negative / total) * 100)}%</span> negative</div>
          </div>
        </div>
      </section>

      {/* Emotional Language */}
      <section>
        <SectionHeader icon={MessageSquare} title="emotional language" />
        <div className="space-y-2">
          {Object.entries(data.emotionalLanguage).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground capitalize w-16">{k}</span>
              <div className="flex-1 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                <div className="h-full bg-accent/60" style={{ width: `${Math.min(100, v)}%` }} />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/60 w-10 text-right">{Math.round(v)}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Frames */}
      {data.frames.length > 0 && (
        <section>
          <SectionHeader icon={Tag} title="narrative frames" count={data.frames.length} />
          <div className="space-y-3">
            {data.frames.sort((a, b) => b.prevalence - a.prevalence).map((f, i) => (
              <div key={i} className="rounded-xl border border-border/20 bg-card/40 p-4">
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <h4 className="text-sm font-medium text-foreground">{f.name}</h4>
                  <span className="text-[10px] font-mono text-accent">{Math.round(f.prevalence)}%</span>
                </div>
                <p className="text-[11px] text-muted-foreground/80 mb-3">{f.description}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-emerald-300/80 mb-1">emphasizes</p>
                    {f.emphasizes.slice(0, 3).map((e, j) => (
                      <p key={j} className="text-[10px] text-foreground/80">• {e}</p>
                    ))}
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-amber-300/80 mb-1">downplays</p>
                    {f.downplays.slice(0, 3).map((e, j) => (
                      <p key={j} className="text-[10px] text-foreground/80">• {e}</p>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground/60 italic mb-2">
                  Example: "{f.exampleHeadline}"
                </p>

                <div className="flex items-center gap-2 text-[10px] flex-wrap">
                  <span className="text-muted-foreground/60">sources:</span>
                  {f.sources.slice(0, 4).map((s, j) => (
                    <span key={j} className="px-1.5 py-0.5 rounded border border-border/20 text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Loaded terms */}
      {data.loadedTerms.length > 0 && (
        <section>
          <SectionHeader icon={Tag} title="loaded terms" count={data.loadedTerms.length} />
          <div className="space-y-2">
            {data.loadedTerms.map((t, i) => (
              <div key={i} className={`rounded-lg border p-2.5 ${CONN_COLORS[t.connotation]}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium">"{t.term}"</span>
                  <span className="text-[10px] font-mono opacity-70">{t.count}× used</span>
                </div>
                <p className="text-[10px] opacity-80">{t.implication}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
