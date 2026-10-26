import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AssistantTurn {
  id: string;
  role: "you" | "shepherd";
  text: string;
  /** true when the room raised this itself off a record change rather than the person asking. */
  automatic?: boolean;
  /** true when the shepherd turn is an error written for the operator, not an answer. */
  failed?: boolean;
}

interface Props {
  /** the conversation so far. the room owns it, so the same thread shows wherever the panel is mounted. */
  turns: AssistantTurn[];
  busy: boolean;
  /** the person typed a question. */
  onAsk: (question: string) => void;
  /** when shepherd cannot answer on this device, the reason is shown here instead of a composer. */
  unavailable?: string | null;
}

/**
 * shepherd, in this room. a controlled view: the thread, the busy state and the
 * sending all live in AsherinHealthView, because every other panel can raise a
 * question and the answer must be readable on a phone as well as beside the
 * record on a wide screen.
 */
export default function HealthAssistant({ turns, busy, onAsk, unavailable }: Props) {
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const submit = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    onAsk(q);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#e78a2e]/25 bg-[#e78a2e]/[0.04]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <MessageCircle className="h-3.5 w-3.5 text-[#e78a2e]/80" />
        <p className="text-[11px] font-light tracking-wide text-foreground/75">shepherd, in this room</p>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {turns.length === 0 && (
          <p className="text-[11px] font-light leading-relaxed text-foreground/45">
            everything you record here — a pain point, a reading, a photograph — comes through to me as it happens, and i
            answer about your own record only. i do not diagnose. the answer is written by the model key held on this device;
            your record goes to that provider only when you ask or record something.
          </p>
        )}
        {turns.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-xl px-3 py-2 text-[11px] font-light leading-relaxed",
              t.role === "you"
                ? cn("ml-6 border border-white/[0.07] bg-white/[0.03] text-foreground/70", t.automatic && "border-[#e78a2e]/25 bg-[#e78a2e]/[0.07]")
                : cn("mr-2 border border-white/[0.07] bg-black/25 text-foreground/85", t.failed && "border-amber-300/25 text-amber-100/80"),
            )}
          >
            {t.automatic && t.role === "you" && (
              <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-[#e78a2e]/70">raised from your record</p>
            )}
            {t.failed && <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-amber-200/60">no answer</p>}
            <p className="whitespace-pre-wrap">{t.text}</p>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-[10px] font-light text-foreground/40">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking about your record
          </p>
        )}
      </div>

      {unavailable ? (
        <p className="border-t border-white/[0.06] p-3 text-[11px] font-light leading-relaxed text-amber-100/75">{unavailable}</p>
      ) : (
        <div className="flex items-end gap-2 border-t border-white/[0.06] p-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="ask about anything in your record"
            aria-label="ask shepherd about your record"
            className="min-h-[38px] resize-none rounded-xl border-white/[0.08] bg-white/[0.03] text-[11px]"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" disabled={busy || !input.trim()} onClick={submit} aria-label="send">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
