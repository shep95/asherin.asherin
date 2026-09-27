import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, FileCode, AlertTriangle, CheckCircle2, Package, Sparkles, X, ChevronRight } from "lucide-react";
import { useActiveScan, NarrativeEntry } from "./scanContext";

const sevColor = (sev: string) => {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "text-red-400 border-red-500/30 bg-red-500/10";
  if (s === "high") return "text-orange-400 border-orange-500/30 bg-orange-500/10";
  if (s === "medium") return "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
  if (s === "low") return "text-blue-400 border-blue-500/30 bg-blue-500/10";
  return "text-muted-foreground/60 border-border/20 bg-foreground/[0.04]";
};

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

interface Props {
  projectId: string;
  onSelectFinding?: (id: string) => void;
}

const NarrativeCard = ({ entry }: { entry: NarrativeEntry }) => {
  const f = entry.finding;
  return (
    <div className="rounded-xl border border-border/[0.08] bg-foreground/[0.02] p-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-start gap-3">
        <div className="text-[10px] text-muted-foreground/40 font-mono pt-0.5 shrink-0">#{String(entry.index).padStart(3, "0")}</div>
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] px-2 py-0.5 rounded-md border uppercase tracking-wider ${sevColor(f.severity)}`}>{f.severity}</span>
            {f.cwe_id && <span className="text-[9px] text-muted-foreground/40 font-mono">{f.cwe_id}</span>}
            {typeof f.cvss_score === "number" && <span className="text-[9px] text-muted-foreground/40">CVSS {f.cvss_score.toFixed(1)}</span>}
            {f.file_path && (
              <span className="text-[9px] text-muted-foreground/50 font-mono truncate">
                {f.file_path}{f.line_number ? `:${f.line_number}` : ""}
              </span>
            )}
          </div>

          <div className="text-[12px] text-foreground/85 font-light leading-snug">{f.title}</div>

          {/* CODE */}
          {f.code_snippet && (
            <div>
              <div className="text-[8px] text-muted-foreground/40 uppercase tracking-[0.15em] mb-1">Code</div>
              <pre className="text-[10px] text-foreground/70 font-mono bg-foreground/[0.04] border border-border/[0.06] rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-40">
{f.code_snippet}
              </pre>
            </div>
          )}

          {/* NARRATIVE STORY */}
          <div>
            <div className="text-[8px] text-muted-foreground/40 uppercase tracking-[0.15em] mb-1">Story</div>
            <p className="text-[11px] text-foreground/70 leading-relaxed">{entry.story}</p>
            {f.description && f.description !== entry.story && (
              <p className="text-[10px] text-muted-foreground/55 leading-relaxed mt-1">{f.description}</p>
            )}
          </div>

          {/* FIX */}
          {f.suggested_fix && (
            <div>
              <div className="text-[8px] text-emerald-400/70 uppercase tracking-[0.15em] mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" /> Fix
              </div>
              <pre className="text-[10px] text-emerald-300/80 font-mono bg-emerald-500/[0.05] border border-emerald-500/15 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-48">
{f.suggested_fix}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const LiveScanNarrative = ({ projectId, onSelectFinding }: Props) => {
  const { active, clear, cancelScan } = useActiveScan();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const isThisProject = active && active.projectId === projectId;

  // Auto-scroll on new finding
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.liveFindings.length, active?.progress?.percent, autoScroll]);

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    if (!isThisProject) return c;
    for (const e of active!.liveFindings) {
      const s = (e.finding.severity || "info").toLowerCase() as keyof typeof c;
      if (s in c) c[s]++;
    }
    return c;
  }, [active, isThisProject]);

  if (!isThisProject) return null;
  const a = active!;
  const total = a.liveFindings.length;
  const elapsed = Math.floor((Date.now() - a.startedAt) / 1000);
  const phaseLabel =
    a.status === "failed" ? "FAILED" :
    a.status === "complete" ? "COMPLETE" :
    a.progress?.phase ? a.progress.phase.toUpperCase() : "STARTING";

  return (
    <div className="rounded-2xl border border-border/[0.1] bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.01] overflow-hidden">
      {/* HEADER */}
      <div className="px-4 py-3 border-b border-border/[0.06] flex items-center justify-between bg-foreground/[0.02]">
        <div className="flex items-center gap-3 min-w-0">
          {a.status === "running" ? (
            <Loader2 className="h-4 w-4 text-foreground/60 animate-spin shrink-0" />
          ) : a.status === "complete" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[10px] text-foreground/80 tracking-[0.15em] uppercase truncate">
              Live Audit · {phaseLabel}
            </div>
            <div className="text-[9px] text-muted-foreground/40 truncate">
              {a.input.fileName} · {a.input.fileCount} file{a.input.fileCount === 1 ? "" : "s"} · {fmtBytes(a.input.totalBytes)} · {a.input.scanProfile}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-muted-foreground/40 font-mono">{elapsed}s</span>
          {a.status === "running" && (
            <button
              onClick={() => {
                if (confirm("Cancel this scan? Partial findings will be kept.")) cancelScan();
              }}
              className="text-[9px] px-2 py-1 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          )}
          {a.status !== "running" && (
            <button onClick={clear} className="p-1 rounded-md hover:bg-foreground/[0.06] text-muted-foreground/40 hover:text-foreground/60">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* PROGRESS BAR + COUNTS */}
      <div className="px-4 py-3 space-y-2 border-b border-border/[0.06]">
        <div className="h-1 w-full rounded-full bg-foreground/[0.06] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${a.status === "failed" ? "bg-red-400" : a.status === "complete" ? "bg-emerald-400" : "bg-foreground/50"}`}
            style={{ width: `${a.progress?.percent ?? 2}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground/60 truncate">{a.progress?.message || "Initializing scan engine…"}</span>
          <span className="text-muted-foreground/40 font-mono">{a.progress?.percent ?? 0}%</span>
        </div>

        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60">
            <Package className="h-2.5 w-2.5" /> {a.input.fileCount} files
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-foreground/70">
            <Sparkles className="h-2.5 w-2.5" /> <span className="font-mono">{total}</span> total issues
          </div>
          {(["critical", "high", "medium", "low", "info"] as const).map(s =>
            counts[s] > 0 ? (
              <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded-md border ${sevColor(s)}`}>
                {counts[s]} {s}
              </span>
            ) : null,
          )}
          {a.status === "complete" && typeof a.finalCount === "number" && a.finalCount !== total && (
            <span className="text-[9px] text-muted-foreground/40">final report: {a.finalCount}</span>
          )}
        </div>

        {a.error && (
          <div className="text-[9px] text-red-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> {a.error}
          </div>
        )}
      </div>

      {/* NARRATIVE STREAM */}
      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setAutoScroll(atBottom);
        }}
        className="max-h-[520px] overflow-y-auto p-4 space-y-3"
      >
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <FileCode className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground/50">
              {a.status === "complete"
                ? "Clean. No issues detected in this scan."
                : "Walking the codebase. First findings will appear here as soon as the engine identifies them…"}
            </p>
          </div>
        ) : (
          a.liveFindings.map(entry => (
            <NarrativeCard key={`${entry.index}-${entry.receivedAt}`} entry={entry} />
          ))
        )}
      </div>

      {a.status === "complete" && (
        <div className="px-4 py-2.5 border-t border-border/[0.06] bg-foreground/[0.02] flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground/50">Live audit finished — full sortable report below.</span>
          <button
            onClick={clear}
            className="text-[9px] text-foreground/60 hover:text-foreground/80 flex items-center gap-1"
          >
            Dismiss <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default LiveScanNarrative;
