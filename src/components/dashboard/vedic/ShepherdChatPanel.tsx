import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, Square, StickyNote, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { streamChat } from "@/lib/ai";
import { extractDates } from "@/lib/vedic/extractDates";
import { toast } from "sonner";

/**
 * shepherd, beside the chart.
 *
 * the model is called through streamChat with the key held in the device
 * vault — this panel never sees a key. the chart context is the only ground
 * the answer stands on; it goes out with the question and nowhere else.
 * notes live in the local chart_notes table, keyed by the chart they belong to.
 */

interface Note {
  id: string;
  note: string;
  chart_label: string;
  created_at: string;
}

interface Msg { id: string; role: "user" | "assistant"; content: string; failed?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  chartKey: string | null;
  chartLabel: string;
  chartContext: string;
  onDatesExtracted?: (dates: string[]) => void;
}

// the hosted build kept raw provider keys under this key. they do not belong
// in localStorage, so the first open of the new panel removes them.
const LEGACY_KEYS = ["asher_vedic_keys_v2", "asher_vedic_keys"];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function describeFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/key|vault|settings/i.test(msg)) return msg.toLowerCase();
  if (/abort/i.test(msg)) return "stopped.";
  if (/network|fetch|failed to/i.test(msg)) return "the model could not be reached from this device. check the connection and try again.";
  return "shepherd could not answer that one. try again in a moment.";
}

export default function ShepherdChatPanel({ open, onClose, chartKey, chartLabel, chartContext, onDatesExtracted }: Props) {
  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    for (const k of LEGACY_KEYS) {
      try { localStorage.removeItem(k); } catch { /* storage blocked */ }
    }
  }, []);

  // a new chart is a new conversation; an in-flight answer about the old one is dropped
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setStreaming(false);
  }, [chartKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadNotes = async (key: string | null) => {
    if (!key) { setNotes([]); return; }
    const { data, error } = await supabase
      .from("chart_notes")
      .select("id,note,chart_label,created_at")
      .eq("chart_key", key)
      .order("created_at", { ascending: false });
    if (error) { setNotesError("notes could not be read from this device."); return; }
    setNotesError(null);
    setNotes((data ?? []) as Note[]);
  };

  useEffect(() => { if (open) void loadNotes(chartKey); }, [chartKey, open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || !chartKey || streaming) return;

    const userMsg: Msg = { id: newId(), role: "user", content: text };
    const assistantId = newId();
    const history = messages.filter((m) => !m.failed);
    setMessages([...history, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    const ground = [
      `you are shepherd, reading one sidereal (Lahiri) vedic chart that was computed on this device. the chart is "${chartLabel}".`,
      "the placements and dasha path between the fences are the only ground for your answer. do not invent a placement, a date or a dasha that is not there. if the question needs something the chart does not hold, say so in one line.",
      "```chart\n" + chartContext + "\n```",
      "when you name a date, write it as YYYY-MM-DD so the room can mark it on the timeline. keep the answer short and specific. all prose lowercase except proper names.",
    ].join("\n\n");

    const apiMessages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: `${ground}\n\noperator: ${text}` },
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";
    try {
      await streamChat({
        messages: apiMessages,
        mode: "chat",
        depth: "standard",
        signal: controller.signal,
        onDelta: (t) => { full += t; patch((m) => ({ ...m, content: m.content + t })); },
        onReplace: (t) => { full = t; patch((m) => ({ ...m, content: t })); },
        onDone: () => { /* resolved below */ },
      });
      const dates = extractDates(full);
      if (dates.length > 0) onDatesExtracted?.(dates);
      if (!full.trim()) patch((m) => ({ ...m, content: "no answer came back.", failed: true }));
    } catch (e) {
      if (controller.signal.aborted && full.trim()) {
        // the operator stopped it; what arrived stays
      } else {
        patch((m) => ({ ...m, content: describeFailure(e), failed: true }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  const stop = () => { abortRef.current?.abort(); };

  const keepAsNote = async (content: string) => {
    if (!chartKey) return;
    const { error } = await supabase.from("chart_notes").insert({
      chart_key: chartKey, chart_label: chartLabel, note: content.trim(), source: "shepherd",
    });
    if (error) { toast.error("the note could not be saved on this device"); return; }
    toast.success("note kept");
    await loadNotes(chartKey);
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase.from("chart_notes").delete().eq("id", id);
    if (error) { toast.error("the note could not be removed"); return; }
    await loadNotes(chartKey);
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="shepherd, about this chart"
        aria-hidden={!open}
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] z-50 transform transition-transform duration-300 motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full pointer-events-none"} bg-background/95 backdrop-blur-xl border-l border-border/30 flex flex-col`}
      >
        <header className="px-4 py-3 border-b border-border/25 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full border border-border/30 bg-foreground/5 flex items-center justify-center">
              <MessageSquare className="h-3.5 w-3.5 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-light tracking-[0.2em] text-foreground">shepherd</div>
              <div className="text-[10px] font-light text-muted-foreground truncate">{chartLabel || "no chart loaded"}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" aria-label="close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-2 border-b border-border/20 text-[10px] tracking-[0.2em]">
          {(["chat", "notes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 transition ${tab === t ? "text-foreground bg-foreground/[0.04] border-b border-foreground/40" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "chat" ? "chat" : `notes (${notes.length})`}
            </button>
          ))}
        </div>

        {tab === "chat" ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {!chartKey && (
                <div className="text-xs text-muted-foreground font-light">load or generate a chart to start asking.</div>
              )}
              {chartKey && messages.length === 0 && (
                <div className="text-xs text-muted-foreground font-light leading-relaxed">
                  ask about <span className="text-foreground/80">your dashas, houses, yogas, wealth indicators, marriage, career,</span> or any placement. the answer stands on this chart only.
                  <div className="mt-2 text-muted-foreground/60">any date shepherd names is marked on the Vimshottari timeline.</div>
                  <div className="mt-2 text-muted-foreground/60">the question and the chart placements go to the model provider you connected in settings → intelligence, straight from this device.</div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`text-xs leading-relaxed font-light ${m.role === "user" ? "text-foreground" : m.failed ? "text-destructive/90" : "text-muted-foreground"}`}>
                  <div className="text-[9px] tracking-[0.2em] text-muted-foreground/60 mb-1">{m.role === "user" ? "you" : "shepherd"}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.role === "assistant" && !m.failed && m.content.trim() && !(streaming && messages[messages.length - 1]?.id === m.id) && (
                    <button
                      onClick={() => void keepAsNote(m.content)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition"
                    >
                      <StickyNote className="h-3 w-3" /> keep as note
                    </button>
                  )}
                </div>
              ))}
              {streaming && (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> reading the chart…</div>
              )}
            </div>
            <div className="p-3 border-t border-border/25 flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder={chartKey ? "ask shepherd about this chart…" : "load a chart first"}
                disabled={!chartKey || streaming}
                rows={2}
                aria-label="your question"
                className="flex-1 resize-none rounded-md border border-border/30 bg-background/40 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground/40 disabled:opacity-50"
              />
              {streaming ? (
                <button onClick={stop} className="rounded-md border border-foreground/20 bg-foreground/5 px-3 text-foreground hover:bg-foreground/10" aria-label="stop">
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={!chartKey || !input.trim()}
                  className="rounded-md border border-foreground/20 bg-foreground/5 px-3 text-foreground hover:bg-foreground/10 disabled:opacity-40"
                  aria-label="send"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {notesError && <div className="text-xs text-destructive/90 font-light">{notesError}</div>}
            {!notesError && notes.length === 0 ? (
              <div className="text-xs text-muted-foreground font-light flex items-center gap-2">
                <StickyNote className="h-3.5 w-3.5" /> no notes yet for this chart. keep any answer as a note from the chat tab.
              </div>
            ) : notes.map((n) => (
              <div key={n.id} className="rounded-md border border-border/25 bg-background/30 p-3 text-xs font-light">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-foreground/85 leading-relaxed whitespace-pre-wrap">{n.note}</span>
                  <button onClick={() => void deleteNote(n.id)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="delete note">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1.5 text-[9px] tracking-[0.2em] text-muted-foreground/60">
                  {new Date(n.created_at).toLocaleString("en-US")}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
