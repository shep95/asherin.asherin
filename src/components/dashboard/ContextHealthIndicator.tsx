import { useState } from "react";
import { Activity, Pin, PinOff, ChevronDown, ChevronUp, X } from "lucide-react";

interface ContextItem {
  id: string;
  label: string;
  type: "message" | "file" | "brain" | "memory";
  tokens: number;
  pinned: boolean;
}

interface ContextHealthIndicatorProps {
  messageCount: number;
  maxMessages?: number;
}

const ContextHealthIndicator = ({ messageCount, maxMessages = 50 }: ContextHealthIndicatorProps) => {
  const [expanded, setExpanded] = useState(false);

  // Estimate context usage
  const usage = Math.min((messageCount / maxMessages) * 100, 100);
  const isWarning = usage >= 75;
  const isCritical = usage >= 90;

  const barColor = isCritical
    ? "bg-destructive"
    : isWarning
    ? "bg-amber-500"
    : "bg-accent";

  const label = isCritical
    ? "Context almost full"
    : isWarning
    ? "Context filling up"
    : "Context healthy";

  // Simulated context items for display
  const estimatedTokens = messageCount * 150;
  const maxTokens = maxMessages * 150;
  const droppedCount = Math.max(0, messageCount - maxMessages);

  return (
    <div className="flex items-center gap-2 group relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2"
      >
        <Activity className={`h-3.5 w-3.5 ${isCritical ? "text-destructive" : isWarning ? "text-amber-500" : "text-muted-foreground/50"}`} />
        <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${usage}%` }}
          />
        </div>
        <span className="text-[10px] font-light text-muted-foreground/50">
          {Math.round(usage)}%
        </span>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/30" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/30" />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-64">
          <div className="rounded-xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-xl overflow-hidden animate-scale-in">
            <div className="px-3 py-2 border-b border-border/20">
              <p className="text-[10px] font-light text-foreground">{label}</p>
              <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                ~{estimatedTokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens • {messageCount} messages
              </p>
            </div>

            <div className="px-3 py-2 space-y-1.5">
              {/* Context breakdown */}
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/50">Messages</span>
                <span className="text-foreground font-light">{messageCount}</span>
              </div>
              {droppedCount > 0 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-destructive/60">Dropped (oldest)</span>
                  <span className="text-destructive/60 font-light">{droppedCount}</span>
                </div>
              )}
            </div>

            {isWarning && (
              <div className="px-3 py-2 border-t border-border/20 bg-amber-500/5">
                <p className="text-[10px] font-light text-amber-500">
                  Consider starting a new thread or pinning important messages.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextHealthIndicator;
