import { useEffect, useRef, useState } from "react";
import { Brain, ExternalLink, Globe, Shield, ShieldAlert, ShieldCheck, AlertTriangle, Loader2, CheckCircle2, BookOpen } from "lucide-react";
import { runDeepSearch, type CrossValidation, type DeepSource } from "@/lib/local/search/deep";

type Phase = "searching" | "reading" | "validating" | "answering" | "done";

interface DeepSearchPanelProps {
  query: string;
  onClose: () => void;
}

const TIER_LABELS: Record<number, { label: string; color: string; mark: string }> = {
  1: { label: "primary", color: "text-emerald-400", mark: "■" },
  2: { label: "established", color: "text-blue-400", mark: "◆" },
  3: { label: "institutional", color: "text-amber-400", mark: "◉" },
  4: { label: "general", color: "text-muted-foreground/60", mark: "○" },
};

const CONSENSUS: Record<CrossValidation["consensusStrength"], { label: string; color: string; icon: typeof ShieldCheck }> = {
  strong: { label: "strong", color: "text-emerald-400", icon: ShieldCheck },
  moderate: { label: "moderate", color: "text-blue-400", icon: Shield },
  weak: { label: "weak", color: "text-amber-400", icon: ShieldAlert },
  insufficient: { label: "insufficient", color: "text-red-400", icon: AlertTriangle },
};

const DeepSearchPanel = ({ query, onClose }: DeepSearchPanelProps) => {
  const [sources, setSources] = useState<DeepSource[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [validation, setValidation] = useState<CrossValidation | null>(null);
  const [phase, setPhase] = useState<Phase>("searching");
  const [answer, setAnswer] = useState("");
  const [engines, setEngines] = useState<{ answered: string[]; failed: string[] }>({ answered: [], failed: [] });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setSources([]);
    setValidation(null);
    setAnswer("");
    setError(null);
    setPhase("searching");
    runDeepSearch(
      query,
      {
        onPhase: (p) => {
          if (!ctl.signal.aborted) setPhase(p);
        },
        onSources: (s, total, v) => {
          if (ctl.signal.aborted) return;
          setSources(s);
          setTotalFound(total);
          setValidation(v);
        },
        onDelta: (t) => {
          if (!ctl.signal.aborted) setAnswer((a) => a + t);
        },
        onEngines: (answered, failed) => {
          if (!ctl.signal.aborted) setEngines({ answered, failed });
        },
      },
      ctl.signal,
    ).catch((e: unknown) => {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "deep search failed");
      setPhase("done");
    });
    return () => ctl.abort();
  }, [query]);

  const consensus = validation ? CONSENSUS[validation.consensusStrength] : null;
  const steps: { id: Phase; label: string }[] = [
    { id: "searching", label: "gathering across engines" },
    { id: "reading", label: "reading the strongest pages" },
    { id: "validating", label: "cross-source validation" },
    { id: "answering", label: "shepherd writes the briefing" },
  ];
  const order: Phase[] = ["searching", "reading", "validating", "answering", "done"];
  const idx = order.indexOf(phase);

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex-shrink-0 border-b border-border/20 px-4 py-3 flex items-center gap-3">
        <Brain className="h-4 w-4 text-accent" />
        <span className="text-xs font-medium text-foreground tracking-wide">deep search</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">truth graph</span>
        <span className="text-[10px] text-muted-foreground/50 truncate flex-1">"{query}"</span>
        <button onClick={onClose} className="text-[10px] text-muted-foreground/60 hover:text-foreground">close</button>
      </div>

      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/10 bg-card/20">
        <div className="flex items-center gap-4 text-[10px] flex-wrap">
          {steps.map((s, i) => (
            <PhaseStep key={s.id} label={s.label} active={phase === s.id} done={idx > i} />
          ))}
          <PhaseStep label={`${sources.length} sources`} active={false} done={phase === "done"} />
        </div>
      </div>

      {validation && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-border/10 bg-card/10">
          <div className="flex items-center gap-3 text-[10px] flex-wrap">
            {consensus && (
              <div className={`flex items-center gap-1 ${consensus.color}`}>
                <consensus.icon className="h-3 w-3" />
                <span className="font-medium">consensus: {consensus.label}</span>
              </div>
            )}
            <span className="text-muted-foreground/30">|</span>
            <span className="text-muted-foreground/50">
              {validation.tier1Count} primary · {validation.tier2Count} established · {validation.readCount} pages read
              {validation.averageProvenance > 0 ? ` · ${Math.round(validation.averageProvenance * 100)}% avg provenance` : ""}
            </span>
            {validation.hostileCount > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span className="text-red-400/70 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {validation.hostileCount} hostile flagged
                </span>
              </>
            )}
            {totalFound > sources.length && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span className="text-muted-foreground/50">{totalFound} candidates</span>
              </>
            )}
            {engines.answered.length > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span className="text-muted-foreground/50">answered: {engines.answered.join(", ")}</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        {!error && sources.length === 0 && phase !== "done" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 animate-pulse">
            <Brain className="h-8 w-8 text-accent/40" />
            <p className="text-xs text-muted-foreground/50">
              {phase === "searching" ? "asking every engine that answers from this device…" : phase === "reading" ? "reading the pages that scored highest…" : "cross-referencing the sources…"}
            </p>
          </div>
        )}

        {!error && sources.length === 0 && phase === "done" && (
          <div className="text-center py-12 text-xs text-muted-foreground/50">
            no source answered this query. {engines.failed.length ? `engines that could not be reached: ${engines.failed.join(", ")}.` : ""}
          </div>
        )}

        {(answer || phase === "answering") && (
          <div className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.25em] text-accent/80">
              <BookOpen className="h-3 w-3" /> briefing by shepherd
              {phase === "answering" && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <pre className="whitespace-pre-wrap text-[12px] font-light text-foreground/90 leading-relaxed font-sans">{answer || "…"}</pre>
          </div>
        )}

        {sources.map((s, i) => {
          const tierInfo = TIER_LABELS[s.tier] ?? TIER_LABELS[4];
          return (
            <a
              key={s.url + i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block rounded-lg border px-3 py-2.5 transition-colors group ${
                s.hostile ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50" : "border-border/20 bg-card/30 hover:border-accent/40 hover:bg-card/50"
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mb-1 flex-wrap">
                <span className="font-mono text-muted-foreground/40">[source {i + 1}]</span>
                {s.hostile ? <AlertTriangle className="h-3 w-3 text-red-400" /> : <Globe className="h-3 w-3" />}
                <span className={`font-mono ${tierInfo.color}`}>{tierInfo.mark}</span>
                <span className={`font-mono ${tierInfo.color}`}>{tierInfo.label}</span>
                <span className="text-muted-foreground/30">·</span>
                <span className="truncate">{s.domain}</span>
                <span className="text-muted-foreground/30">·</span>
                <span>{Math.round(s.provenanceScore * 100)}% provenance</span>
                <span className="text-muted-foreground/30">·</span>
                <span>{s.read ? "page read" : "snippet only"}</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-40 ml-auto group-hover:opacity-100" />
              </div>
              <div className="text-[13px] font-medium text-foreground group-hover:text-accent transition-colors leading-snug">{s.title || s.url}</div>
              {s.snippet && <div className="text-[12px] text-muted-foreground/80 leading-relaxed mt-1.5 line-clamp-3">{s.snippet}</div>}
            </a>
          );
        })}
      </div>
    </div>
  );
};

const PhaseStep = ({ label, active, done }: { label: string; active: boolean; done: boolean }) => (
  <div className={`flex items-center gap-1 transition-all ${active ? "text-accent" : done ? "text-muted-foreground/40" : "text-muted-foreground/20"}`}>
    {active ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? <CheckCircle2 className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border border-current" />}
    <span className="whitespace-nowrap">{label}</span>
  </div>
);

export default DeepSearchPanel;
