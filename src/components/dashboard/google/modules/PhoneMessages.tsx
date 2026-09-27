import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MessageSquare, RefreshCw, Loader2, Search, Brain, ArrowLeft,
  ArrowDownLeft, ArrowUpRight, Phone, Voicemail, PhoneMissed, Smartphone,
} from "lucide-react";

/**
 * SIGNAL — phone-message intelligence.
 *
 * Every dossier this platform produced was built from mail alone, because mail
 * was the only channel the ledger could see. This desk adds the channel people
 * actually use: Google Voice SMS mirrored into Gmail, and on-device Android
 * SMS relayed by the companion. It reads threads as PEOPLE — the address book
 * is joined on phone number so a thread is a name, not a string of digits.
 *
 * Every number on screen is measured from the ledger. The model is asked only
 * for a written read of a thread, and it receives the message corpus fenced as
 * untrusted data — anyone who knows the operator's number can text an
 * instruction, and none of them get to steer the analyst.
 */

interface Thread {
  peerKey: string;
  peer: string;
  name: string | null;
  messages: number;
  inbound: number;
  outbound: number;
  firstAt: string | null;
  lastAt: string | null;
  reciprocity: number | null;
  medianReplyMinutes: number | null;
  nightMessages: number;
  unansweredInbound: number;
  channels: string[];
  kinds: Record<string, number>;
  moneyMentions: number;
  markers: { urgency: number; financial: number; credential: number; link: number; threat: number };
  lastText: string | null;
  identity?: { email: string | null; role: string | null; source: string } | null;
}

interface Totals {
  messages: number; correspondents: number; inbound: number; outbound: number;
  voice: number; device: number; unknownNumbers: number;
}

interface ThreadMessage {
  id: string; at: string | null; direction: string | null;
  kind: string; text: string | null; channel: string | null;
}

interface Assessment {
  who?: string; relationship?: string; confidence?: string; intent?: string;
  open_items?: string[]; commitments?: string[]; tone?: string;
  risk?: { level?: string; reasons?: string[] };
  notable_claims?: string[]; recommended_action?: string; raw?: string;
}

const KIND_ICON: Record<string, React.ElementType> = {
  text: MessageSquare, mms: MessageSquare, voicemail: Voicemail, missed_call: PhoneMissed,
};

/** Resolve the caller's own AI key when they have one; the server falls back safely otherwise. */
async function resolveByok(): Promise<Record<string, string> | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;
    const { data: pref } = await supabase
      .from("user_model_preferences" as any)
      .select("active_provider, active_model")
      .eq("user_id", user.id)
      .maybeSingle();
    const provider = (pref as any)?.active_provider;
    const model = (pref as any)?.active_model;
    if (!provider || provider === "default" || !model || model === "default") return undefined;
    const { data: keyRow } = await supabase
      .from("user_api_keys" as any)
      .select("api_key")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    const apiKey = (keyRow as any)?.api_key;
    return apiKey ? { provider, model, apiKey } : undefined;
  } catch {
    return undefined;
  }
}

const fmtWhen = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(0, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  if (mins < 43200) return `${Math.round(mins / 1440)}d ago`;
  return d.toLocaleDateString();
};

const fmtLatency = (m: number | null) => {
  if (m == null) return "—";
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
};

function markerBadges(t: Thread) {
  const out: Array<{ label: string; tone: "destructive" | "secondary" }> = [];
  if (t.markers.credential > 0) out.push({ label: `credential ×${t.markers.credential}`, tone: "destructive" });
  if (t.markers.threat > 0) out.push({ label: `pressure ×${t.markers.threat}`, tone: "destructive" });
  if (t.markers.financial > 0) out.push({ label: `financial ×${t.markers.financial}`, tone: "secondary" });
  if (t.markers.urgency > 0) out.push({ label: `urgency ×${t.markers.urgency}`, tone: "secondary" });
  if (t.markers.link > 0) out.push({ label: `links ×${t.markers.link}`, tone: "secondary" });
  return out;
}

const PhoneMessages = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(90);

  const [openPeer, setOpenPeer] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<{ summary: Thread | null; messages: ThreadMessage[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  const load = useCallback(async (windowDays = days) => {
    setLoading(true);
    try {
      const data = await invokeWithByokRetry<{ threads: Thread[]; totals: Totals }>("phone-messages", {
        body: { action: "threads", days: windowDays },
      });
      setThreads(data?.threads ?? []);
      setTotals(data?.totals ?? null);
    } catch (e) {
      toast.error("Could not read the message ledger", { description: String((e as Error).message).slice(0, 160) });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await invokeWithByokRetry<{ ingested: number; reports: Array<{ account: string; status: string; reason?: string }> }>(
        "phone-messages",
        { body: { action: "sync", days } },
      );
      const skipped = (data?.reports ?? []).filter((r) => r.status !== "ok");
      toast.success(`${data?.ingested ?? 0} messages ingested`, {
        description: skipped.length ? `${skipped.length} account(s) skipped — ${skipped[0]?.reason ?? "see mesh"}` : undefined,
      });
      await load(days);
    } catch (e) {
      toast.error("Sync failed", { description: String((e as Error).message).slice(0, 160) });
    } finally {
      setSyncing(false);
    }
  }, [days, load]);

  const openConversation = useCallback(async (peer: string) => {
    setOpenPeer(peer);
    setOpenThread(null);
    setAssessment(null);
    setThreadLoading(true);
    try {
      const data = await invokeWithByokRetry<{ summary: Thread | null; messages: ThreadMessage[] }>("phone-messages", {
        body: { action: "thread", peer, days },
      });
      setOpenThread({ summary: data?.summary ?? null, messages: data?.messages ?? [] });
    } catch (e) {
      toast.error("Could not open the thread", { description: String((e as Error).message).slice(0, 160) });
    } finally {
      setThreadLoading(false);
    }
  }, [days]);

  const analyze = useCallback(async () => {
    if (!openPeer) return;
    setAssessing(true);
    try {
      const byok = await resolveByok();
      const data = await invokeWithByokRetry<{ assessment: Assessment }>("phone-messages", {
        body: { action: "analyze", peer: openPeer, days, ...(byok ? { byok } : {}) },
      });
      setAssessment(data?.assessment ?? null);
    } catch (e) {
      toast.error("Analysis failed", { description: String((e as Error).message).slice(0, 160) });
    } finally {
      setAssessing(false);
    }
  }, [openPeer, days]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      (t.name ?? "").toLowerCase().includes(q) ||
      t.peer.toLowerCase().includes(q) ||
      (t.lastText ?? "").toLowerCase().includes(q));
  }, [threads, query]);

  // ── Conversation view ────────────────────────────────────────────────────
  if (openPeer) {
    const s = openThread?.summary;
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setOpenPeer(null); setOpenThread(null); setAssessment(null); }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> All threads
          </Button>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{s?.name || openPeer}</div>
            <div className="truncate text-xs text-muted-foreground">
              {openPeer} · {s?.messages ?? 0} messages · reply {fmtLatency(s?.medianReplyMinutes ?? null)}
            </div>
          </div>
          <Button className="ml-auto" size="sm" onClick={analyze} disabled={assessing}>
            {assessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Brain className="mr-1 h-4 w-4" />}
            Read this thread
          </Button>
        </div>

        {s && (
          <div className="flex flex-wrap gap-1.5">
            {markerBadges(s).map((b) => (
              <Badge key={b.label} variant={b.tone} className="text-[10px]">{b.label}</Badge>
            ))}
            {s.nightMessages > 0 && <Badge variant="outline" className="text-[10px]">{s.nightMessages} overnight</Badge>}
            {s.channels.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c.replace("_", " ")}</Badge>)}
          </div>
        )}

        {assessment && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
            <div className="mb-1 text-sm font-medium">{assessment.who ?? "Assessment"}</div>
            {assessment.relationship && <p className="text-muted-foreground">{assessment.relationship}</p>}
            {assessment.intent && <p className="mt-1"><span className="text-muted-foreground">Intent — </span>{assessment.intent}</p>}
            {assessment.risk?.level && (
              <p className="mt-1">
                <span className="text-muted-foreground">Risk — </span>
                <span className="uppercase">{assessment.risk.level}</span>
                {assessment.risk.reasons?.length ? `: ${assessment.risk.reasons.join("; ")}` : ""}
              </p>
            )}
            {!!assessment.open_items?.length && (
              <div className="mt-1">
                <span className="text-muted-foreground">Open — </span>{assessment.open_items.join(" · ")}
              </div>
            )}
            {assessment.recommended_action && (
              <p className="mt-1"><span className="text-muted-foreground">Action — </span>{assessment.recommended_action}</p>
            )}
            {assessment.confidence && (
              <div className="mt-1 text-[10px] uppercase text-muted-foreground">confidence {assessment.confidence}</div>
            )}
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60">
          <div className="space-y-2 p-3">
            {threadLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)}
            {!threadLoading && !openThread?.messages.length && (
              <p className="py-8 text-center text-xs text-muted-foreground">No messages in this window.</p>
            )}
            {(openThread?.messages ?? []).slice().reverse().map((m) => {
              const out = m.direction === "out";
              return (
                <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${out ? "bg-primary/10" : "bg-muted/40"}`}>
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {out ? "you" : "them"} · {m.kind} · {fmtWhen(m.at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ── Thread index ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, number or message text"
            className="h-9 pl-7 text-xs"
            aria-label="Search phone messages"
          />
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList className="h-9">
            <TabsTrigger value="30" className="text-xs">30d</TabsTrigger>
            <TabsTrigger value="90" className="text-xs">90d</TabsTrigger>
            <TabsTrigger value="365" className="text-xs">1y</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" variant="outline" onClick={() => void load(days)} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <Button size="sm" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Phone className="mr-1 h-4 w-4" />}
          Sync Voice &amp; SMS
        </Button>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Messages", value: totals.messages },
            { label: "Correspondents", value: totals.correspondents },
            { label: "Google Voice", value: totals.voice },
            { label: "Device SMS", value: totals.device },
          ].map((k) => (
            <div key={k.label} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <div className="text-lg font-semibold tabular-nums">{k.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60">
        <div className="divide-y divide-border/50">
          {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="m-3 h-12" />)}

          {!loading && !threads.length && (
            <div className="space-y-2 p-8 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="text-sm">No phone messages in the ledger yet.</p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                Google Voice mirrors every text, MMS and voicemail into the linked mailbox — run a sync
                to pull them in. Android device SMS arrives through the companion app.
              </p>
              <Button size="sm" onClick={sync} disabled={syncing} className="mt-1">
                {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Phone className="mr-1 h-4 w-4" />}
                Run first sync
              </Button>
            </div>
          )}

          {!loading && threads.length > 0 && !filtered.length && (
            <p className="p-8 text-center text-xs text-muted-foreground">No thread matches “{query}”.</p>
          )}

          {filtered.map((t) => {
            const Icon = KIND_ICON[Object.keys(t.kinds)[0] ?? "text"] ?? MessageSquare;
            return (
              <button
                key={t.peerKey}
                onClick={() => void openConversation(t.peer || t.peerKey)}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{t.name || t.peer}</span>
                    {!t.name && <Badge variant="outline" className="text-[10px]">unknown number</Badge>}
                    {t.channels.includes("device_sms") && <Smartphone className="h-3 w-3 text-muted-foreground" />}
                    {markerBadges(t).slice(0, 2).map((b) => (
                      <Badge key={b.label} variant={b.tone} className="text-[10px]">{b.label}</Badge>
                    ))}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.lastText ?? "—"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5"><ArrowDownLeft className="h-3 w-3" />{t.inbound}</span>
                    <span className="inline-flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" />{t.outbound}</span>
                    <span>reply {fmtLatency(t.medianReplyMinutes)}</span>
                    {t.unansweredInbound > 0 && <span className="text-amber-500">awaiting your reply</span>}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{fmtWhen(t.lastAt)}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PhoneMessages;
