import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { invokeWithByokRetry } from "@/lib/byokInvoke";

export interface AssistantTurn {
  id: string;
  role: "you" | "asherin";
  text: string;
  /** true when the room raised this itself off a record change rather than the person asking. */
  automatic?: boolean;
}

interface Props {
  /** compact, plain-text summary of the device-local record. never leaves without the person acting. */
  context: string;
  /** a line the room raises by itself when the record changes; null clears it. */
  trigger: string | null;
  onTriggerHandled: () => void;
  resolveByok: () => Promise<Record<string, string> | undefined>;
}

export default function HealthAssistant({ context, trigger, onTriggerHandled, resolveByok }: Props) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  const ask = async (question: string, automatic: boolean) => {
    setBusy(true);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTurns((t) => [...t, { id: `${id}-q`, role: "you", text: question, automatic }]);
    try {
      const byok = await resolveByok();
      const data = await invokeWithByokRetry<{ reply?: string; error?: string }>("asherin-health-ai", {
        body: { action: "assist", question, context: contextRef.current, ...(byok ? { byok } : {}) },
        tool: "asherin-health",
      });
      if (data?.error) throw new Error(data.error);
      setTurns((t) => [...t, { id: `${id}-a`, role: "asherin", text: data?.reply?.trim() || "no answer came back." }]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { id: `${id}-a`, role: "asherin", text: e instanceof Error ? e.message : "the assistant is unavailable right now." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  // record changes speak for themselves: a new pain point or a new reading raises
  // the assistant without the person having to ask what it means.
  useEffect(() => {
    if (!trigger) return;
    onTriggerHandled();
    void ask(trigger, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const submit = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void ask(q, false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#e78a2e]/25 bg-[#e78a2e]/[0.04]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <MessageCircle className="h-3.5 w-3.5 text-[#e78a2e]/80" />
        <p className="text-[11px] font-light tracking-wide text-foreground/75">asherin, in this room</p>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {turns.length === 0 && (
          <p className="text-[11px] font-light leading-relaxed text-foreground/45">
            everything you record here — a pain point, a reading, a body solve — comes through to me as it happens, and i answer
            about your own record only. i do not diagnose.
          </p>
        )}
        {turns.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-xl px-3 py-2 text-[11px] font-light leading-relaxed",
              t.role === "you"
                ? cn("ml-6 border border-white/[0.07] bg-white/[0.03] text-foreground/70", t.automatic && "border-[#e78a2e]/25 bg-[#e78a2e]/[0.07]")
                : "mr-2 border border-white/[0.07] bg-black/25 text-foreground/85",
            )}
          >
            {t.automatic && t.role === "you" && (
              <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-[#e78a2e]/70">raised from your record</p>
            )}
            <p className="whitespace-pre-wrap">{t.text}</p>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-[10px] font-light text-foreground/40">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking about your record
          </p>
        )}
      </div>

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
          className="min-h-[38px] resize-none rounded-xl border-white/[0.08] bg-white/[0.03] text-[11px]"
        />
        <Button size="icon" className="h-8 w-8 shrink-0" disabled={busy || !input.trim()} onClick={submit} aria-label="send">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
