import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * TurnTraces — the tool rows a chat turn actually produced.
 *
 * These are not a re-render of the live thinking panel: they are read back
 * from `asherin_connect_pulls`, the same table Connect draws, filtered to the
 * assistant message that caused them. That is the whole point of the strip —
 * a row can only exist here if a real invoke wrote it server-side, so the
 * transcript and Connect can never disagree, and the rows survive a refresh
 * because they were never client state to begin with.
 *
 * Clicking a row opens Connect filtered to that organ.
 */
export interface TurnTraceRow {
  id: string;
  organ: string;
  capability: string;
  status: "ok" | "fail" | "skip" | "stale";
  latency_ms: number | null;
  quote_masked: string | null;
}

const DOT: Record<TurnTraceRow["status"], string> = {
  ok: "bg-emerald-500/70",
  fail: "bg-destructive/80",
  skip: "bg-muted-foreground/35",
  stale: "bg-amber-500/70",
};

const TurnTraces = ({
  messageId,
  onOpenOrgan,
}: {
  messageId: string;
  /** Opens Connect scoped to the organ. Omitted → the rows are read-only. */
  onOpenOrgan?: (organ: string) => void;
}) => {
  const [rows, setRows] = useState<TurnTraceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!messageId) return;

    // Two reads: one immediately (a reloaded transcript already has its rows)
    // and one short follow-up, because a trace written at the end of a live
    // turn lands a beat after the answer finishes streaming.
    const read = async () => {
      const { data, error } = await supabase
        .from("asherin_connect_pulls")
        .select("id, organ, capability, status, latency_ms, quote_masked")
        .eq("meta->>turn_id", messageId)
        .order("ts", { ascending: true })
        .limit(12);
      if (cancelled || error || !data) return;
      setRows(data as TurnTraceRow[]);
    };

    void read();
    const t = setTimeout(read, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [messageId]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
      {rows.map((r) => {
        const label = `${r.organ} · ${r.capability}`;
        const ms = typeof r.latency_ms === "number" ? `${(r.latency_ms / 1000).toFixed(1)}s` : null;
        const Row = onOpenOrgan ? "button" : "div";
        return (
          <Row
            key={r.id}
            {...(onOpenOrgan
              ? {
                  type: "button" as const,
                  onClick: () => onOpenOrgan(r.organ),
                  title: `Open Connect · ${r.organ}`,
                }
              : {})}
            className={`group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/25 bg-background/40 px-2 py-0.5 text-left text-[10px] font-light text-muted-foreground/70 ${
              onOpenOrgan ? "transition-colors hover:border-border/50 hover:text-foreground" : ""
            }`}
          >
            <span className={`h-1 w-1 shrink-0 rounded-full ${DOT[r.status]}`} />
            <span className="shrink-0">{label}</span>
            {ms && <span className="shrink-0 font-mono text-muted-foreground/40">{ms}</span>}
            {r.quote_masked && (
              <span className="truncate font-mono text-muted-foreground/40">{r.quote_masked}</span>
            )}
            {onOpenOrgan && (
              <ArrowUpRight className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
            )}
          </Row>
        );
      })}
    </div>
  );
};

export default TurnTraces;
