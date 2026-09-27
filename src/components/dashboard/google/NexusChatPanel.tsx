import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Brain, Lock, X, Maximize2, Minimize2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { streamChat } from "@/lib/ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { planStationCall } from "./stationTools";

interface ToolRow {
  label: string;
  status: "running" | "ok" | "fail" | "skip";
  latencyMs?: number;
  detail?: string;
}

interface NexusMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool?: ToolRow;
}

interface NexusChatPanelProps {
  activeModule: string;
  moduleLabel: string;
}

// What each tab is looking at, in one sentence. Descriptions state the read
// the surface actually performs — no accuracy percentages, no claim that a
// model can predict a decision it has never observed.
const moduleContextMap: Record<string, string> = {
  overview: "station overview — which accounts the operator connected, at what scope, and when each was last read.",
  twin: "voice and rhythm — writing style learned from the operator's own sent mail, plus the day's digest.",
  location: "location signals — recurring LOCATION strings the operator typed into their own calendar, and google fit points when that dataset exists. device locating is a gap: find hub has no supported third-party api, and the unofficial scrape is refused.",
  email: "mail search over the operator's own connected mailboxes.",
  gmail: "mail headers from the operator's own mailboxes — senders, threads, cadence.",
  subscriptions: "recurring-charge confirmations found in the operator's own mail.",
  health: "google fit — steps, heart rate, sleep, workouts, when the operator granted fitness scope.",
  fit: "google fit biometric series from the operator's own account.",
  calendar: "attention ledger — meeting occupancy and open focus windows from the operator's calendar.",
  contacts: "relationship graph — correspondence cadence across the operator's own mail and calendar.",
  career: "recruiter and role-change signals present in the operator's own mail.",
  drive: "drive metadata, including meet recordings when they exist in drive.",
  photos: "google photos metadata the operator granted access to.",
  youtube: "youtube activity from the operator's own account.",
  search: "search activity from the operator's own account.",
  chrome: "chrome activity from the operator's own account.",
  connected: "oauth scope audit and the asherin audit log for this operator.",
};

const NexusChatPanel = ({ activeModule, moduleLabel }: NexusChatPanelProps) => {
  const [messages, setMessages] = useState<NexusMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: NexusMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const assistantMsg: NexusMessage = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const patchAssistant = (patch: Partial<NexusMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

    // ── organ first ──────────────────────────────────────────────────────
    // The analyst does not describe what the mesh would say. It calls the
    // mesh, and whatever comes back — including an empty read or a refusal —
    // is the only ground the answer stands on.
    const call = planStationCall(trimmed, activeModule);
    let evidence = "";
    if (call) {
      patchAssistant({ tool: { label: call.label, status: "running" } });
      const started = performance.now();
      try {
        const { data, error } = await supabase.functions.invoke("google-mesh", {
          body: { action: call.action, ...call.payload },
        });
        const latencyMs = Math.round(performance.now() - started);
        if (error) throw error;
        const noAccount = (data as any)?.error === "no_account";
        evidence = JSON.stringify(data).slice(0, 6000);
        patchAssistant({
          tool: {
            label: call.label,
            status: noAccount ? "skip" : "ok",
            latencyMs,
            detail: noAccount ? "no google account connected" : undefined,
          },
        });
        void emitPull({
          organ: "google",
          capability: call.action,
          fromSurface: "google-station",
          status: noAccount ? "skip" : "ok",
          latencyMs,
          quote: noAccount ? "no google account connected" : `${evidence.length} chars returned`,
        });
      } catch (e: any) {
        const latencyMs = Math.round(performance.now() - started);
        patchAssistant({ tool: { label: call.label, status: "fail", latencyMs, detail: String(e?.message ?? "call failed").slice(0, 120) } });
        void emitPull({
          organ: "google",
          capability: call.action,
          fromSurface: "google-station",
          status: "fail",
          latencyMs,
          quote: String(e?.message ?? "call failed").slice(0, 160),
        });
        evidence = `THE CALL FAILED: ${String(e?.message ?? "unknown").slice(0, 200)}`;
      }
    }

    const moduleContext = moduleContextMap[activeModule] || "asherin cloud intelligence station";

    const systemContext = [
      `you are asherin, the station analyst on the "${moduleLabel}" surface.`,
      `what this surface reads: ${moduleContext}`,
      call
        ? `the tool \`google-mesh:${call.action}\` was just run against the operator's own connected account(s). its raw payload follows between the fences. answer only from it.`
        : "no mesh tool ran for this turn. answer from the conversation only, and say plainly that you did not read their account for this answer.",
      call ? "```json\n" + evidence + "\n```" : "",
      "rules: never invent a message, event, contact, file or position that is not in the payload. never attach an accuracy percentage to a location — calendar strings are a rhythm, not a measurement. if the operator asks you to find a phone, say device locating is a gap: find hub exposes no supported third-party api and asherin refuses the unofficial scrape. if the payload says no account is connected, tell them to connect google at read tier and stop.",
      "keep the answer short and specific. all prose lowercase.",
    ].filter(Boolean).join("\n\n");

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: `${systemContext}\n\noperator: ${trimmed}` },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        messages: apiMessages,
        mode: "research",
        depth: "standard",
        signal: controller.signal,
        onDelta: (text) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m)));
        },
        onReplace: (fullText) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m)));
        },
        onDone: () => setIsStreaming(false),
      });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        patchAssistant({ content: "the station could not reach the model. the tool result above still stands." });
      }
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, activeModule, moduleLabel]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={`rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md overflow-hidden flex flex-col transition-all ${
        expanded ? "fixed inset-4 z-50 shadow-2xl" : "h-[420px]"
      }`}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-card/20 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground/50" />
          <span className="text-xs font-light text-foreground">
            Asherin · {moduleLabel}
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setIsStreaming(false); abortRef.current?.abort(); }}
              className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Brain className="h-8 w-8 text-muted-foreground/15" />
              <p className="text-xs font-extralight text-muted-foreground/40 text-center max-w-[200px]">
                Ask Asherin about your {moduleLabel} intelligence
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px]">
                {[
                  activeModule === "overview" ? "Summarize my collection" : `Analyze my ${moduleLabel} data`,
                  activeModule === "health" ? "Am I getting sick?" : "What patterns do you see?",
                  "What should I do next?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-lg bg-foreground/5 px-2.5 py-1.5 text-[10px] font-light text-muted-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] space-y-1.5`}>
                {msg.tool && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/10 bg-foreground/[0.03] px-2.5 py-1.5 text-[10px] font-extralight text-muted-foreground/60">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        msg.tool.status === "ok"
                          ? "bg-emerald-500/70"
                          : msg.tool.status === "fail"
                            ? "bg-red-500/70"
                            : msg.tool.status === "skip"
                              ? "bg-amber-500/70"
                              : "bg-foreground/40 animate-pulse"
                      }`}
                    />
                    <span>{msg.tool.label}</span>
                    {msg.tool.latencyMs !== undefined && <span className="text-muted-foreground/35">{msg.tool.latencyMs}ms</span>}
                    {msg.tool.detail && <span className="truncate text-muted-foreground/45">· {msg.tool.detail}</span>}
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-xs font-light leading-relaxed ${
                    msg.role === "user"
                      ? "bg-foreground/15 text-foreground border border-border/20"
                      : "bg-foreground/5 text-foreground border border-border/10"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_code]:text-accent [&_code]:bg-secondary/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-secondary/50 [&_pre]:rounded-lg [&_pre]:p-2">
                      {msg.content ? (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      ) : isStreaming ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" style={{ animationDelay: "300ms" }} />
                        </div>
                      ) : null}
                      {isStreaming && msg.content && (
                        <span className="inline-block w-0.5 h-3.5 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t border-border/20 bg-card/20 px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${moduleLabel}…`}
            rows={1}
            className="flex-1 resize-none bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/30 focus:outline-none leading-relaxed min-h-[32px] max-h-[120px] py-1.5"
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="shrink-0 rounded-lg bg-foreground/10 p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 rounded-lg bg-foreground/10 p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Lock className="h-2.5 w-2.5 text-emerald-500/40" />
          <span className="text-[9px] font-extralight text-muted-foreground/30">Encrypted · Context-aware of {moduleLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default NexusChatPanel;
