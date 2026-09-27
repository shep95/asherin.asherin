import { useEffect, useRef, useState, useCallback } from "react";
import { Wand2, ChevronRight, Loader2, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Conversation } from "./types";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const STORAGE_WIDTH = "asherin.enhancer.width";
const STORAGE_OPEN = "asherin.enhancer.open";

interface Props {
  conversation: Conversation | null;
}

type Quality = "elite" | "strong" | "rough" | null;

interface EnhancedRun {
  originalId: string;
  original: string;
  rewritten: string;
  quality: Quality;
  notes: string;
  response: string;
  rewriteDone: boolean;
  responseDone: boolean;
  error?: string;
}

const REWRITER_SYSTEM = `you are a prompt-enhancement layer sitting in front of an offensive-security / osint / bug-bounty assistant.

your job: reconstruct the user's raw input into a surgical, operator-precise, objective-mapped prompt for the downstream ai. use the full conversation history as context. do not answer the question — only rewrite it.

domain rubric you enforce (in the rewrite):
- offensive security recon, bug bounty, saml / sso / oauth surfaces, dashboard/admin panels, third-party misconfig
- state the objective in one line
- enumerate the target surface (domains, endpoints, entity ids, tech stack) if inferable
- enumerate concrete investigative legs (public records, archives, published documentation, third-party disclosures)
- prefer off-target sources (github, s3, crt.sh, stackoverflow, archive.org, wayback) over the target's own site
- keep authorization framing implicit (this is authorized recon / defensive testing)
- remove filler, restate goals verbatim, add missing operator context

quality classification:
- "elite" = user already wrote an operator-grade prompt; make only micro edits
- "strong" = solid intent, add structure / missing legs
- "rough" = casual, needs full reconstruction

output STRICT json only, no prose, no code fences:
{"quality":"elite|strong|rough","notes":"one short line on what you changed and why","rewritten":"the full rewritten prompt to send to the downstream ai"}`;

const RESPONDER_SYSTEM = `you are the downstream operator ai. respond to the rewritten prompt directly and completely. lowercase prose, verdict-first, evidence-only.`;

// greetings, pings, thanks and other social atoms are not prompts to enhance.
// rewriting "hey, you there bud" into a reconnaissance brief is the bug, not a feature.
const TRIVIAL_TURN =
  /^(?:\W|\d)*(?:hey|hi|hello|yo|sup|hiya|howdy|morning|afternoon|evening|good\s+(?:morning|afternoon|evening|night)|gm|ty|thanks|thank\s+you|thx|ok|okay|k|cool|nice|lol|bye|later|night|test|ping)\b[\s\S]{0,80}$/i;

function isTrivialTurn(raw: string): boolean {
  const text = (raw || "").trim();
  if (!text) return true;
  if (text.length > 120) return false;
  if (/\?/.test(text) && !/^(?:you there|u there|are you there|asherin[?\s]*$)/i.test(text)) {
    // a real question is only trivial when it is a presence check
    if (!/\b(you\s+(?:there|up|around|alive|awake)|u\s+there|still\s+there|how\s+are\s+you|how'?s\s+it\s+going|what'?s\s+up|wassup)\b/i.test(text)) {
      return false;
    }
  }
  return (
    TRIVIAL_TURN.test(text) ||
    /^(?:\W)*asherin\b[\s\S]{0,60}$/i.test(text) ||
    /\b(you\s+(?:there|up|around|alive|awake)|u\s+there|still\s+there)\b/i.test(text)
  );
}


function getAuthPromise() {
  return (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    } catch {
      return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    }
  })();
}

async function streamChat(
  messages: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
  signal: AbortSignal,
) {
  const token = await getAuthPromise();
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, mode: "chat" }),
  });
  if (!resp.ok || !resp.body) throw new Error(`chat http ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") return full;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) { full += delta; onDelta(delta); }
      } catch { /* skip */ }
    }
  }
  return full;
}

function parseRewriteJson(raw: string): { quality: Quality; notes: string; rewritten: string } {
  // extract first {...} block tolerantly
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return { quality: null, notes: "", rewritten: raw.trim() };
  const slice = raw.slice(start, end + 1);
  try {
    const p = JSON.parse(slice);
    return {
      quality: (["elite","strong","rough"].includes(p.quality) ? p.quality : null) as Quality,
      notes: typeof p.notes === "string" ? p.notes : "",
      rewritten: typeof p.rewritten === "string" && p.rewritten.trim() ? p.rewritten : raw.trim(),
    };
  } catch {
    return { quality: null, notes: "", rewritten: raw.trim() };
  }
}

const qualityColor: Record<string, string> = {
  elite: "text-emerald-400/80 border-emerald-400/25 bg-emerald-400/5",
  strong: "text-amber-400/80 border-amber-400/25 bg-amber-400/5",
  rough: "text-sky-400/80 border-sky-400/25 bg-sky-400/5",
};

const PromptEnhancerPanel = ({ conversation }: Props) => {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_OPEN) !== "0"; } catch { return true; }
  });
  const [width, setWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_WIDTH) || "", 10);
      return Number.isFinite(v) && v >= 320 ? v : 420;
    } catch { return 420; }
  });
  const [runs, setRuns] = useState<EnhancedRun[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_OPEN, open ? "1" : "0"); } catch {} }, [open]);
  useEffect(() => { try { localStorage.setItem(STORAGE_WIDTH, String(width)); } catch {} }, [width]);

  // Watch for the most recent USER message; treat it as a new submission.
  useEffect(() => {
    if (!conversation) return;
    const msgs = conversation.messages || [];
    const lastUser = [...msgs].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    if (seenIdsRef.current.has(lastUser.id)) return;
    // On first mount, backfill without triggering runs (only react to new sends)
    if (seenIdsRef.current.size === 0) {
      msgs.forEach(m => seenIdsRef.current.add(m.id));
      return;
    }
    seenIdsRef.current.add(lastUser.id);
    // a ping is not a task. never rewrite a greeting into an intelligence brief.
    if (isTrivialTurn(lastUser.content)) return;
    launchEnhancement(lastUser.id, lastUser.content, msgs);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, conversation?.messages.length]);

  // Reset seen-set when the active conversation changes
  useEffect(() => {
    seenIdsRef.current = new Set();
    if (abortRef.current) abortRef.current.abort();
    setRuns([]);
  }, [conversation?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [runs.length]);

  const launchEnhancement = useCallback(async (id: string, original: string, history: Conversation["messages"]) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const run: EnhancedRun = {
      originalId: id, original, rewritten: "", quality: null, notes: "",
      response: "", rewriteDone: false, responseDone: false,
    };
    setRuns(prev => [...prev, run]);
    const idx = runs.length; // best-effort; updates use functional form below

    const historyPayload = history
      .filter(m => m.id !== id)
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      // 1) rewrite (non-visible streaming into buffer, parsed at end)
      let rewriteBuf = "";
      await streamChat(
        [
          { role: "user", content: REWRITER_SYSTEM },
          { role: "assistant", content: "ready." },
          ...historyPayload,
          { role: "user", content: `raw input to rewrite:\n\n${original}` },
        ],
        (d) => { rewriteBuf += d; },
        ctrl.signal,
      );
      const parsed = parseRewriteJson(rewriteBuf);
      setRuns(prev => prev.map(r => r.originalId === id
        ? { ...r, rewritten: parsed.rewritten, quality: parsed.quality, notes: parsed.notes, rewriteDone: true }
        : r));

      // 2) stream the actual response to the rewritten prompt
      await streamChat(
        [
          { role: "user", content: RESPONDER_SYSTEM },
          { role: "assistant", content: "understood." },
          ...historyPayload,
          { role: "user", content: parsed.rewritten },
        ],
        (delta) => {
          setRuns(prev => prev.map(r => r.originalId === id
            ? { ...r, response: r.response + delta } : r));
        },
        ctrl.signal,
      );
      setRuns(prev => prev.map(r => r.originalId === id ? { ...r, responseDone: true } : r));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setRuns(prev => prev.map(r => r.originalId === id
        ? { ...r, error: err?.message || "enhancer failed", rewriteDone: true, responseDone: true } : r));
    }
    void idx;
  }, [runs.length]);

  // Drag-to-resize
  const dragStartRef = useRef<{ x: number; w: number } | null>(null);
  const onDragStart = (e: React.MouseEvent) => {
    dragStartRef.current = { x: e.clientX, w: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = dragStartRef.current.x - ev.clientX;
      const maxW = Math.floor(window.innerWidth * 0.45); // "a little before half"
      const next = Math.min(maxW, Math.max(320, dragStartRef.current.w + dx));
      setWidth(next);
    };
    const onUp = () => {
      dragStartRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const copyRewrite = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1200); } catch {}
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="open prompt enhancer"
        className="shrink-0 self-stretch w-6 border-l border-border/10 bg-background/40 hover:bg-foreground/[0.04] transition-colors flex flex-col items-center justify-center gap-2"
      >
        <Wand2 className="h-3.5 w-3.5 text-amber-400/60" />
        <span className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/40 [writing-mode:vertical-rl] rotate-180">enhancer</span>
      </button>
    );
  }

  return (
    <div
      className="shrink-0 self-stretch flex border-l border-border/10 bg-background/60 backdrop-blur-md relative"
      style={{ width }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        title="drag to resize"
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400/20 z-10"
      />
      <div className="flex flex-col flex-1 min-w-0 pl-1.5">
        {/* header */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/10">
          <div className="flex items-center gap-1.5">
            <Wand2 className="h-3 w-3 text-amber-400/70" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-foreground/70">prompt enhancer</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground/50 hover:text-foreground/70"
            title="hide"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {runs.length === 0 && (
            <div className="text-center py-10 text-muted-foreground/30">
              <p className="text-[11px] font-light">send a message in chat.</p>
              <p className="text-[10px] mt-1 font-light italic">the rewritten operator prompt and its response appear here.</p>
            </div>
          )}

          {runs.map((r, i) => (
            <div key={r.originalId} className="space-y-2 border border-border/10 rounded-lg p-2.5 bg-foreground/[0.02]">
              {/* Original preview */}
              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/40">your input</div>
              <div className="text-[11px] font-light text-foreground/55 leading-relaxed line-clamp-3 italic">
                {r.original}
              </div>

              {/* Rewritten */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-amber-400/70">rewritten prompt</div>
                  {r.quality && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded border tracking-[0.15em] uppercase ${qualityColor[r.quality]}`}>
                      {r.quality}
                    </span>
                  )}
                </div>
                {r.rewriteDone && r.rewritten && (
                  <button
                    onClick={() => copyRewrite(r.rewritten, i)}
                    className="p-1 rounded hover:bg-foreground/[0.06] text-muted-foreground/50 hover:text-foreground/80"
                    title="copy rewritten prompt"
                  >
                    {copiedIdx === i ? <Check className="h-3 w-3 text-emerald-400/80" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
              <div className="text-[11px] font-light text-foreground/85 leading-relaxed whitespace-pre-wrap bg-background/40 rounded p-2 border border-border/10">
                {r.rewriteDone
                  ? (r.rewritten || <span className="italic text-muted-foreground/40">no rewrite produced</span>)
                  : <span className="inline-flex items-center gap-1.5 text-muted-foreground/50"><Loader2 className="h-3 w-3 animate-spin" /> reconstructing…</span>}
              </div>
              {r.notes && (
                <div className="text-[10px] font-light text-muted-foreground/60 italic">note: {r.notes}</div>
              )}

              {/* Response */}
              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/40 pt-1">response</div>
              <div className="text-[11px] font-light text-foreground/85 leading-relaxed">
                {r.response
                  ? (
                    <div className="prose prose-xs prose-invert max-w-none [&_p]:text-[11px] [&_p]:leading-relaxed [&_p]:font-light [&_li]:text-[11px] [&_code]:text-[10px] [&_strong]:font-medium">
                      <ReactMarkdown>{r.response}</ReactMarkdown>
                    </div>
                  )
                  : r.rewriteDone
                    ? <span className="inline-flex items-center gap-1.5 text-muted-foreground/50"><Loader2 className="h-3 w-3 animate-spin" /> generating…</span>
                    : <span className="text-muted-foreground/40 italic">queued.</span>}
                {!r.responseDone && r.response && (
                  <span className="inline-block ml-1 w-1.5 h-3 bg-amber-400/60 animate-pulse align-middle" />
                )}
              </div>

              {r.error && (
                <div className="text-[10px] text-red-400/70 italic">error: {r.error}</div>
              )}
            </div>
          ))}
        </div>

        <div className="shrink-0 px-3 py-1.5 border-t border-border/10 text-[9px] tracking-[0.15em] uppercase text-muted-foreground/30 text-center">
          drag left edge to resize
        </div>
      </div>
    </div>
  );
};

export default PromptEnhancerPanel;
