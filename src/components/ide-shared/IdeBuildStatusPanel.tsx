// ============================================================
// IdeBuildStatusPanel — surfaces the ZAHTEN-style build loop
// state inside both IDEs. Renders pass N/cap, the last STATUS
// sentinel, and the live MISSING PIECES checklist parsed from
// the assistant's most recent response.
// ============================================================

import { Loader2, CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import { extractMissingPieces, extractStatusReason, parseIdeBuildStatus, type IdeBuildStatus } from "@/lib/ide/completionLoop";

interface Props {
  lastAssistantText: string;
  round: number;
  maxRounds: number;
  busy: boolean;
}

export default function IdeBuildStatusPanel({ lastAssistantText, round, maxRounds, busy }: Props) {
  if (!lastAssistantText && !busy) return null;
  const status: IdeBuildStatus = parseIdeBuildStatus(lastAssistantText);
  const missing = extractMissingPieces(lastAssistantText);
  const reason = extractStatusReason(lastAssistantText);

  const Icon =
    status === "complete" ? CheckCircle2 :
    status === "refining" ? Loader2 :
    busy ? Loader2 : AlertTriangle;

  return (
    <div className="rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm p-3 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-light tracking-[0.2em] uppercase text-muted-foreground/90">
          <Icon className={`h-3 w-3 ${busy || status === "refining" ? "animate-spin" : ""} ${status === "complete" ? "text-emerald-400/90" : "text-foreground/80"}`} />
          Build Status · pass {round}/{maxRounds}
        </div>
        <span className={`text-[9px] font-mono uppercase tracking-[0.18em] ${
          status === "complete" ? "text-emerald-400/90" :
          status === "refining" ? "text-foreground/80" :
          "text-muted-foreground/70"
        }`}>
          {status === "complete" ? "MISSION_COMPLETE" : status === "refining" ? "REFINING" : busy ? "WORKING" : "UNKNOWN"}
        </span>
      </div>

      {reason && (
        <p className="text-[10.5px] font-light text-foreground/80 leading-snug">{reason}</p>
      )}

      {missing.length > 0 && (
        <div className="pt-1 border-t border-border/15">
          <div className="text-[9px] font-light tracking-[0.2em] uppercase text-muted-foreground/80 mb-1">
            ◈ Missing pieces ({missing.length})
          </div>
          <ul className="space-y-0.5">
            {missing.slice(0, 8).map((m, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10.5px] font-light text-foreground/85 leading-tight">
                <Circle className="h-2 w-2 mt-1 shrink-0 text-muted-foreground/60" />
                <span>{m}</span>
              </li>
            ))}
            {missing.length > 8 && (
              <li className="text-[9.5px] text-muted-foreground/60 pl-3.5">…+{missing.length - 8} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
