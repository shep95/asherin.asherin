import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useAureonThinking } from "@/hooks/useAureonThinking";

/**
 * asherin — one live process panel per assistant turn.
 *
 * Pure display. It subscribes to the thinking store and renders exactly what
 * the stream produced: reasoning tokens and real tool/kernel step rows. It
 * never fabricates a step, never invents a duration, and shows a quiet caret
 * while the first token is still in flight.
 */
const ThinkingPanel = ({
  messageId,
  autoExpand = true,
}: {
  messageId: string;
  autoExpand?: boolean;
}) => {
  const { text, steps, phase, durationMs } = useAureonThinking(messageId);
  const [open, setOpen] = useState(autoExpand);
  const [userToggled, setUserToggled] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const live = phase === "thinking";

  // Collapse automatically once the answer takes over — unless the user has
  // taken manual control of the panel.
  useEffect(() => {
    if (userToggled) return;
    if (phase === "answering" || phase === "done") setOpen(false);
    if (phase === "thinking") setOpen(true);
  }, [phase, userToggled]);

  // Follow the stream without hijacking the page scroll.
  useEffect(() => {
    if (!live || !open) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, steps.length, live, open]);

  if (!text && !live && steps.length === 0) return null;

  const secs = durationMs ? (durationMs / 1000).toFixed(1) : null;

  return (
    <div className="mb-2 rounded-2xl border border-border/25 bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={() => { setUserToggled(true); setOpen((o) => !o); }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground/50 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        <span className="text-[11px] font-light tracking-wide text-muted-foreground/75">
          asherin
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">
          {live ? (
            <span className="inline-block h-3 w-[3px] align-text-bottom bg-muted-foreground/50 animate-pulse motion-reduce:animate-none" />
          ) : secs ? `${secs}s` : ""}
        </span>
      </button>

      {open && (
        <div
          ref={bodyRef}
          aria-live={live ? "polite" : "off"}
          className="max-h-56 overflow-y-auto border-t border-border/20 px-3 py-2"
        >
          {steps.length > 0 && (
            <div className="mb-1.5 space-y-0.5">
              {steps.map((s, i) => (
                <div
                  key={`${s.at}-${i}`}
                  className="flex items-center gap-2 text-[11px] font-light animate-fade-in motion-reduce:animate-none"
                >
                  <span
                    className={`h-1 w-1 rounded-full shrink-0 ${
                      s.state === "error"
                        ? "bg-destructive/70"
                        : s.state === "running"
                          ? "bg-accent/70 animate-pulse motion-reduce:animate-none"
                          : "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="text-muted-foreground/80">{s.label}</span>
                  {s.detail && (
                    <span className="truncate font-mono text-[10px] text-muted-foreground/50">{s.detail}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="font-mono text-[11px] leading-relaxed text-muted-foreground/65 whitespace-pre-wrap break-words">
            {text}
            {live && (
              <span className="ml-0.5 inline-block h-3 w-[3px] align-text-bottom bg-muted-foreground/50 animate-pulse motion-reduce:animate-none" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Pre-token state: a quiet caret until the stream emits its first reasoning
 * token or tool row. No fabricated status copy.
 */
export const ThinkingPanelOrDots = ({ messageId }: { messageId: string }) => {
  const { text, steps, phase } = useAureonThinking(messageId);
  if (!text && steps.length === 0) {
    return (
      <span
        aria-label="asherin is working"
        className="inline-block h-4 w-0.5 bg-foreground/50 animate-pulse motion-reduce:animate-none align-text-bottom"
      />
    );
  }
  void phase;
  return <ThinkingPanel messageId={messageId} />;
};

export default ThinkingPanel;
