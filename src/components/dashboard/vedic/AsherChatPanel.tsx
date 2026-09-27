import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, Settings, StickyNote, Trash2, X, Plus, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isOwnerEmail } from "@/lib/adminEmail";

interface Note {
  id: string;
  note: string;
  chart_label: string;
  created_at: string;
}

interface Msg { role: "user" | "assistant"; content: string }

type Provider = "gemini" | "openai" | "anthropic";

interface ApiKey {
  provider: Provider;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = "asher_vedic_keys_v2";
// Latest available models per provider (Feb 2026 lineup)
const MODELS: Record<Provider, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (best)" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast)" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro" },
  ],
  openai: [
    { value: "gpt-5", label: "GPT-5 (best)" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano (fast)" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { value: "claude-opus-4-5-20250929", label: "Claude Opus 4.5 (best)" },
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-3-7-sonnet-20250219", label: "Claude Sonnet 3.7" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude Sonnet 3.5" },
    { value: "claude-3-5-haiku-20241022", label: "Claude Haiku 3.5 (fast)" },
  ],
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
};

interface Props {
  open: boolean;
  onClose: () => void;
  chartKey: string | null;
  chartLabel: string;
  chartContext: string;
  onDatesExtracted?: (dates: string[]) => void;
}

interface CrossResult { provider: Provider; model: string; reply: string }

export default function AsherChatPanel({ open, onClose, chartKey, chartLabel, chartContext, onDatesExtracted }: Props) {
  const { user } = useAuth();
  const isAdmin = isOwnerEmail(user?.email);

  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [crossOutputs, setCrossOutputs] = useState<Record<number, CrossResult[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const [keys, setKeys] = useState<ApiKey[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as ApiKey[];
    } catch { /* noop */ }
    return [];
  });
  const [primaryIdx, setPrimaryIdx] = useState<number>(0);
  const [crossCheckEnabled, setCrossCheckEnabled] = useState<boolean>(false);
  const [usePlatformAdmin, setUsePlatformAdmin] = useState<boolean>(isAdmin);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMessages([]); setCrossOutputs({}); setInput(""); }, [chartKey]);

  const persistKeys = (next: ApiKey[]) => {
    setKeys(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
    if (primaryIdx >= next.length) setPrimaryIdx(0);
  };

  const addKey = () => persistKeys([...keys, { provider: "gemini", model: MODELS.gemini[0].value, apiKey: "" }]);
  const updateKey = (i: number, patch: Partial<ApiKey>) => {
    const next = keys.map((k, idx) => {
      if (idx !== i) return k;
      const merged = { ...k, ...patch };
      // when provider changes, reset model to provider default
      if (patch.provider && patch.provider !== k.provider) merged.model = MODELS[patch.provider][0].value;
      return merged;
    });
    persistKeys(next);
  };
  const removeKey = (i: number) => persistKeys(keys.filter((_, idx) => idx !== i));

  const loadNotes = async () => {
    if (!chartKey) { setNotes([]); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setNotes([]); return; }
    const { data } = await supabase
      .from("chart_notes")
      .select("id,note,chart_label,created_at")
      .eq("user_id", auth.user.id)
      .eq("chart_key", chartKey)
      .order("created_at", { ascending: false });
    setNotes((data ?? []) as Note[]);
  };

  useEffect(() => { void loadNotes(); }, [chartKey, open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const validKeys = keys.filter((k) => k.apiKey.trim().length > 0);

  const send = async () => {
    const text = input.trim();
    if (!text || !chartKey || loading) return;

    // Build payload: primary BYOK + optional cross-check list
    const primaryKey = validKeys[primaryIdx] ?? validKeys[0] ?? null;
    if (!primaryKey && !(isAdmin && usePlatformAdmin)) {
      toast.error("Add an API key in Settings (Gemini, OpenAI, or Claude)");
      setShowSettings(true);
      return;
    }
    const byokPayload = primaryKey
      ? { provider: primaryKey.provider, model: primaryKey.model, apiKey: primaryKey.apiKey.trim() }
      : null;
    const crossCheckPayload = crossCheckEnabled
      ? validKeys
          .filter((_, i) => i !== primaryIdx)
          .map((k) => ({ provider: k.provider, model: k.model, apiKey: k.apiKey.trim() }))
      : [];

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vedic-asher-chat", {
        body: { messages: next, chartContext, chartLabel, byok: byokPayload, crossCheck: crossCheckPayload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply = (data?.reply as string) ?? "(no reply)";
      const note = data?.note as string | null;
      const dates = (data?.dates as string[] | undefined) ?? [];
      const cross = (data?.crossCheck as CrossResult[] | undefined) ?? [];

      setMessages((m) => {
        const newMsgs = [...m, { role: "assistant" as const, content: reply }];
        const idx = newMsgs.length - 1;
        if (cross.length > 0) setCrossOutputs((c) => ({ ...c, [idx]: cross }));
        return newMsgs;
      });
      if (dates.length > 0) onDatesExtracted?.(dates);
      if (note) {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          await supabase.from("chart_notes").insert({
            user_id: auth.user.id, chart_key: chartKey, chart_label: chartLabel, note, source: "ai",
          });
          await loadNotes();
          toast.success("Note saved");
        }
      }
    } catch (e) {
      toast.error((e as Error).message || "Chat failed");
      setMessages((m) => [...m, { role: "assistant", content: "_Error reaching ASHER. Open settings to verify your API key._" }]);
    } finally {
      setLoading(false);
    }
  };

  const deleteNote = async (id: string) => {
    await supabase.from("chart_notes").delete().eq("id", id);
    await loadNotes();
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] z-50 transform transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"} bg-background/95 backdrop-blur-xl border-l border-border/30 flex flex-col`}
      >
        <header className="px-4 py-3 border-b border-border/25 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full border border-border/30 bg-foreground/5 flex items-center justify-center">
              <MessageSquare className="h-3.5 w-3.5 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-light tracking-[0.2em] text-foreground uppercase">Asher AI</div>
              <div className="text-[10px] font-light text-muted-foreground truncate">{chartLabel || "No chart loaded"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`p-1.5 rounded-md transition ${showSettings ? "text-foreground bg-foreground/10" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="AI provider settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" aria-label="Close chat">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {showSettings && (
          <div className="px-4 py-3 border-b border-border/20 bg-foreground/[0.02] space-y-3 max-h-[55vh] overflow-y-auto">
            {isAdmin && (
              <div className="rounded-md border border-foreground/20 bg-foreground/[0.04] px-3 py-2 flex items-center gap-2">
                <Shield className="h-3 w-3 text-foreground/70" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/80 flex-1">Admin · Platform Gemini</span>
                <input
                  type="checkbox"
                  checked={usePlatformAdmin}
                  onChange={(e) => setUsePlatformAdmin(e.target.checked)}
                  className="accent-foreground"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Your API Keys ({keys.length})</div>
              <button
                onClick={addKey}
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Add Key
              </button>
            </div>

            {keys.length === 0 && (
              <div className="text-[10px] text-muted-foreground/70 leading-relaxed">
                {isAdmin
                  ? "No personal keys. Admin platform Gemini will be used."
                  : "Add at least one API key from Gemini, OpenAI, or Anthropic to use Asher."}
              </div>
            )}

            {keys.map((k, i) => (
              <div key={i} className="rounded-md border border-border/25 bg-background/40 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="primary-key"
                    checked={primaryIdx === i}
                    onChange={() => setPrimaryIdx(i)}
                    className="accent-foreground"
                    title="Primary provider"
                  />
                  <select
                    value={k.provider}
                    onChange={(e) => updateKey(i, { provider: e.target.value as Provider })}
                    className="flex-1 rounded border border-border/30 bg-background/60 px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-foreground/40"
                  >
                    {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                    ))}
                  </select>
                  <button onClick={() => removeKey(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove key">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <select
                  value={k.model}
                  onChange={(e) => updateKey(i, { model: e.target.value })}
                  className="w-full rounded border border-border/30 bg-background/60 px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-foreground/40"
                >
                  {MODELS[k.provider].map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <input
                  type="password"
                  value={k.apiKey}
                  onChange={(e) => updateKey(i, { apiKey: e.target.value })}
                  placeholder={`${PROVIDER_LABEL[k.provider]} API key`}
                  className="w-full rounded border border-border/30 bg-background/60 px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-foreground/40"
                />
              </div>
            ))}

            {validKeys.length >= 2 && (
              <label className="flex items-center gap-2 px-1">
                <input
                  type="checkbox"
                  checked={crossCheckEnabled}
                  onChange={(e) => setCrossCheckEnabled(e.target.checked)}
                  className="accent-foreground"
                />
                <span className="text-[10px] text-foreground/80">Cross-domain check with all other keys</span>
              </label>
            )}

            <div className="text-[9px] text-muted-foreground/60 leading-relaxed">
              Keys are stored locally in your browser only. The selected primary key answers; other keys verify when cross-check is on.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 border-b border-border/20 text-[10px] uppercase tracking-[0.2em]">
          {(["chat", "notes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 transition ${tab === t ? "text-foreground bg-foreground/[0.04] border-b border-foreground/40" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "chat" ? "Chat" : `Notes (${notes.length})`}
            </button>
          ))}
        </div>

        {tab === "chat" ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {!chartKey && (
                <div className="text-xs text-muted-foreground font-light">Load or generate a chart to start asking questions.</div>
              )}
              {chartKey && messages.length === 0 && (
                <div className="text-xs text-muted-foreground font-light leading-relaxed">
                  Ask about <span className="text-foreground/80">your dashas, houses, yogas, wealth indicators, marriage, career,</span> or any planet placement.
                  <div className="mt-2 text-muted-foreground/60">Tip: any dates ASHER mentions get auto-marked on the Vimshottari Timeline.</div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`text-xs leading-relaxed font-light ${m.role === "user" ? "text-foreground" : "text-muted-foreground"}`}>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">{m.role === "user" ? "You" : "Asher"}</div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {crossOutputs[i] && crossOutputs[i].length > 0 && (
                    <div className="mt-3 rounded-md border border-border/25 bg-background/30 p-2.5 space-y-2">
                      <div className="text-[9px] uppercase tracking-[0.2em] text-foreground/70 flex items-center gap-1">
                        <Shield className="h-2.5 w-2.5" /> Cross-Domain Verification
                      </div>
                      {crossOutputs[i].map((c, j) => (
                        <div key={j} className="border-t border-border/15 pt-2 first:border-t-0 first:pt-0">
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">{PROVIDER_LABEL[c.provider]} · {c.model}</div>
                          <div className="whitespace-pre-wrap text-muted-foreground/85">{c.reply}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>
              )}
            </div>
            <div className="p-3 border-t border-border/25 flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder={chartKey ? "Ask ASHER about this chart…" : "Load a chart first"}
                disabled={!chartKey || loading}
                rows={2}
                className="flex-1 resize-none rounded-md border border-border/30 bg-background/40 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground/40 disabled:opacity-50"
              />
              <button
                onClick={() => void send()}
                disabled={!chartKey || loading || !input.trim()}
                className="rounded-md border border-foreground/20 bg-foreground/5 px-3 text-foreground hover:bg-foreground/10 disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {notes.length === 0 ? (
              <div className="text-xs text-muted-foreground font-light flex items-center gap-2">
                <StickyNote className="h-3.5 w-3.5" /> No notes yet for this chart.
              </div>
            ) : notes.map((n) => (
              <div key={n.id} className="rounded-md border border-border/25 bg-background/30 p-3 text-xs font-light">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-foreground/85 leading-relaxed">{n.note}</span>
                  <button onClick={() => void deleteNote(n.id)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Delete note">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
