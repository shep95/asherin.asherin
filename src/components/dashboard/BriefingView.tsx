/**
 * asherin.briefing — a written briefing from what you watch.
 *
 * Local edition. The setup conversation and the briefing itself are written by
 * shepherd (the model the operator connected, called from this device with the
 * vault key). Profiles and reports are rows in this device's IndexedDB. There
 * is no schedule: a closed tab writes nothing, so the room offers "write now".
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Newspaper, Send, Loader2, AlertTriangle, Trash2, Download, FileText, Pencil, MessageSquare, Square, KeyRound, ArrowLeft, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { VAULT_EVENT } from "@/lib/local/keys";
import { ScrollArea } from "@/components/ui/scroll-area";
import BriefingProfileEditor from "./briefing/BriefingProfileEditor";
import {
  EMPTY_PROFILE,
  REPORT_SECTIONS,
  SETUP_OPENING,
  buildBriefingSystemPrompt,
  buildBriefingUserPrompt,
  buildSetupSystemPrompt,
  describeProfile,
  mergeProfile,
  parseBriefingReport,
  parseSetupReply,
  profileIsUsable,
  relativeTime,
  reportFileName,
  sectionForTab,
  type BriefingProfile,
  type ChatTurn,
  type ReportSectionId,
} from "./briefing/briefingEngine";
import {
  askShepherd,
  deleteProfile as deleteProfileRow,
  deleteReport as deleteReportRow,
  insertReport,
  loadProfile,
  loadReports,
  resolveShepherd,
  saveProfile,
  SETTINGS_PATH,
  type ProfileRow,
  type ReportRow,
  type ShepherdState,
} from "./briefing/briefingStore";

type ReportTab = "full" | ReportSectionId;

const MAX_SETUP_TURNS = 40;
const SETUP_REPLY_TOKENS = 700;
const BRIEFING_TOKENS = 2200;

const PROSE =
  "prose prose-invert prose-sm max-w-none [&_h1]:text-lg [&_h1]:font-extralight [&_h1]:tracking-wide [&_h2]:text-sm [&_h2]:font-light [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-xs [&_h3]:font-light [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:text-xs [&_p]:font-extralight [&_p]:leading-relaxed [&_p]:text-foreground/80 [&_li]:text-xs [&_li]:font-extralight [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_hr]:border-border/20 [&_strong]:text-foreground [&_strong]:font-light";

const ICON_BTN = "rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors";
const PRIMARY_BTN =
  "inline-flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
const QUIET_BTN = "inline-flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-1.5 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors";

function openSettings() {
  try {
    window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: "settings" }));
  } catch {
    /* no window */
  }
}

/** The room's own name line; v.2's shell already names the room, so only a suffix shows there. */
const RoomTitle = ({ v2, suffix }: { v2: boolean; suffix?: string }) =>
  v2 && !suffix ? null : (
    <div className="flex min-w-0 items-center gap-2">
      {!v2 && <Newspaper className="h-4 w-4 shrink-0 text-accent" />}
      <h2 className="truncate text-sm font-light text-foreground">{v2 ? suffix : `asherin.briefing${suffix ? ` — ${suffix}` : ""}`}</h2>
    </div>
  );

/** What the room needs before shepherd can write, said in one card. */
const ShepherdNotice = ({ state }: { state: ShepherdState | null }) => {
  if (!state || state.ok === true) return null;
  return (
    <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-border/20 bg-card/20 p-4">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-light text-foreground">{state.reason}</p>
        <p className="text-[11px] font-extralight text-muted-foreground">
          shepherd writes from this device with the key you connect; nothing is sent anywhere else.
        </p>
      </div>
      <button onClick={openSettings} className={QUIET_BTN}>
        open settings
      </button>
    </div>
  );
};

const BriefingView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const v2 = useIsV2();

  // data
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);

  // shepherd readiness
  const [shepherd, setShepherd] = useState<ShepherdState | null>(null);

  // which surface
  const [showEditor, setShowEditor] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportRow | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>("full");

  // setup conversation
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [draft, setDraft] = useState<BriefingProfile>(EMPTY_PROFILE);
  const [draftComplete, setDraftComplete] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAbort = useRef<AbortController | null>(null);

  // generation
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const genAbort = useRef<AbortController | null>(null);
  const streamRef = useRef<HTMLPreElement>(null);

  // deletes
  const [confirmReportId, setConfirmReportId] = useState<string | null>(null);
  const [confirmProfile, setConfirmProfile] = useState(false);

  const userId = user?.id ?? null;

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setLoadError("this device has no identity yet — reload the page.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [p, r] = await Promise.all([loadProfile(userId), loadReports(userId)]);
      setProfile(p);
      setReports(r);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "could not read this device's briefing data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // the vault can change under us (key added, locked, unlocked) — re-read
  useEffect(() => {
    let alive = true;
    const check = () => {
      resolveShepherd().then((s) => {
        if (alive) setShepherd(s);
      });
    };
    check();
    window.addEventListener(VAULT_EVENT, check);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_EVENT, check);
    };
  }, []);

  // abort anything in flight when the room unmounts
  useEffect(() => {
    return () => {
      chatAbort.current?.abort();
      genAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatTurns, chatBusy]);

  // the live draft keeps its newest lines in view
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  const shepherdReady = !!shepherd?.ok;
  const profileUsable = !!profile && profileIsUsable(profile);
  const writeBlocked = !shepherdReady ? (shepherd && shepherd.ok === false ? shepherd.reason : "checking the vault…") : !profileUsable ? "the profile is empty — edit it and add at least one thing to watch." : null;

  /* ── setup conversation ────────────────────────────────────────────────── */

  const beginSetup = (seed: BriefingProfile) => {
    setDraft(seed);
    setDraftComplete(false);
    setChatTurns([{ role: "assistant", content: profileIsUsable(seed) ? `this profile currently watches:\n\n${describeProfile(seed)}\n\nwhat should change?` : SETUP_OPENING }]);
    setChatInput("");
    setChatError(null);
    setShowSetup(true);
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy || !shepherdReady) return;
    if (chatTurns.length >= MAX_SETUP_TURNS) {
      setChatError("this setup conversation is long enough. save the profile, or fill in the form.");
      return;
    }
    setChatInput("");
    setChatError(null);
    const turns: ChatTurn[] = [...chatTurns, { role: "user", content: text }];
    setChatTurns(turns);
    setChatBusy(true);
    chatAbort.current?.abort();
    const ac = new AbortController();
    chatAbort.current = ac;
    try {
      // providers want the transcript to open with the operator; the room's own
      // opening line is context the system prompt already carries.
      const firstUser = turns.findIndex((t) => t.role === "user");
      const { text: answer } = await askShepherd({
        system: buildSetupSystemPrompt(draft),
        messages: turns.slice(firstUser),
        maxTokens: SETUP_REPLY_TOKENS,
        signal: ac.signal,
      });
      const parsed = parseSetupReply(answer);
      const nextDraft = parsed.profile ? mergeProfile(draft, parsed.profile) : draft;
      setDraft(nextDraft);
      setDraftComplete(parsed.complete && profileIsUsable(nextDraft));
      setChatTurns((prev) => [...prev, { role: "assistant", content: parsed.reply || "noted." }]);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setChatError(e instanceof Error ? e.message : "shepherd did not answer");
    } finally {
      if (chatAbort.current === ac) chatAbort.current = null;
      setChatBusy(false);
    }
  };

  const saveDraftProfile = async () => {
    if (!userId || savingProfile) return;
    setSavingProfile(true);
    try {
      const row = await saveProfile(userId, draft);
      setProfile(row);
      setShowSetup(false);
      setChatTurns([]);
      toast({ title: "profile saved", description: "write a briefing whenever you want one." });
    } catch (e) {
      toast({ title: "could not save the profile", description: e instanceof Error ? e.message : "unknown error", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const leaveSetup = () => {
    chatAbort.current?.abort();
    setShowSetup(false);
    setChatTurns([]);
    setChatError(null);
  };

  /* ── generation ────────────────────────────────────────────────────────── */

  const generateBriefing = async () => {
    if (!userId || !profile || generating || writeBlocked) return;
    setGenerating(true);
    setGenError(null);
    setStreamText("");
    const ac = new AbortController();
    genAbort.current = ac;
    const started = performance.now();
    try {
      const { text, provider, model } = await askShepherd({
        system: buildBriefingSystemPrompt(),
        messages: [{ role: "user", content: buildBriefingUserPrompt(profile) }],
        maxTokens: BRIEFING_TOKENS,
        signal: ac.signal,
        onDelta: (t) => setStreamText((prev) => prev + t),
      });
      const parsed = parseBriefingReport(text);
      if (!parsed.content.trim()) throw new Error("shepherd returned an empty briefing. try again.");
      const row = await insertReport({ userId, title: parsed.title, content: parsed.content, counts: parsed.counts, provider, model });
      void emitPull({ organ: "briefings", capability: "generate", fromSurface: "briefings", status: "ok", latencyMs: performance.now() - started, quote: `${provider} wrote ${parsed.content.length} chars` });
      setReports((prev) => [row, ...prev]);
      setActiveReport(row);
      setReportTab("full");
      toast({
        title: "briefing saved",
        description: parsed.missing.length ? `shepherd skipped: ${parsed.missing.join(", ")}.` : `${parsed.counts.critical} critical · ${parsed.counts.significant} significant · ${parsed.counts.monitoring} monitoring`,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setGenError("stopped. nothing was saved.");
      } else {
        const msg = e instanceof Error ? e.message : "shepherd did not answer";
        setGenError(msg);
        void emitPull({ organ: "briefings", capability: "generate", fromSurface: "briefings", status: "fail", latencyMs: performance.now() - started, quote: msg });
      }
    } finally {
      if (genAbort.current === ac) genAbort.current = null;
      setGenerating(false);
      setStreamText("");
    }
  };

  const stopGenerating = () => genAbort.current?.abort();

  /* ── secondary paths ───────────────────────────────────────────────────── */

  const removeReport = async (id: string) => {
    try {
      await deleteReportRow(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (activeReport?.id === id) setActiveReport(null);
      toast({ title: "briefing deleted" });
    } catch (e) {
      toast({ title: "could not delete", description: e instanceof Error ? e.message : "unknown error", variant: "destructive" });
    } finally {
      setConfirmReportId(null);
    }
  };

  const removeProfile = async () => {
    if (!userId) return;
    try {
      await deleteProfileRow(userId);
      setProfile(null);
      setConfirmProfile(false);
      toast({ title: "profile deleted", description: "saved briefings stay until you delete them." });
    } catch (e) {
      toast({ title: "could not delete", description: e instanceof Error ? e.message : "unknown error", variant: "destructive" });
    }
  };

  const downloadBriefing = (report: ReportRow) => {
    const blob = new Blob([`# ${report.title}\n\n${report.content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFileName(report.title, report.created_at);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sendToNotebooks = async (report: ReportRow) => {
    if (!userId) return;
    try {
      const { data: nb, error } = await supabase
        .from("notebooks")
        .insert({ title: report.title, description: `from asherin.briefing, ${report.created_at.slice(0, 10)}`, owner_id: userId })
        .select()
        .single();
      if (error || !nb) throw new Error(error?.message ?? "no notebook row");
      const nbId = (nb as { id: string }).id;
      const { error: cellErr } = await supabase
        .from("notebook_cells")
        .insert({ notebook_id: nbId, cell_type: "text", position: 0, content: `# ${report.title}\n\n${report.content}` });
      if (cellErr) throw new Error(cellErr.message);
      toast({ title: "notebook created", description: `"${report.title}" is in notebooks.` });
    } catch (e) {
      toast({ title: "could not create the notebook", description: e instanceof Error ? e.message : "unknown error", variant: "destructive" });
    }
  };

  /* ── surfaces ──────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-6 text-xs font-extralight text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> reading this device's briefings…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="max-w-sm text-xs font-light text-foreground">{loadError}</p>
        <button onClick={loadData} className={QUIET_BTN}>
          try again
        </button>
      </div>
    );
  }

  if (showEditor) {
    return (
      <BriefingProfileEditor
        initial={profile ?? draft}
        onClose={() => setShowEditor(false)}
        onSaved={(row) => {
          setProfile(row);
          setShowEditor(false);
          setShowSetup(false);
          setChatTurns([]);
        }}
      />
    );
  }

  // ── a saved briefing, read by tab
  if (activeReport) {
    const tabs: { id: ReportTab; label: string }[] = [{ id: "full", label: "full" }, ...REPORT_SECTIONS.map((s) => ({ id: s.id, label: s.label }))];
    const when = activeReport.created_at ? new Date(activeReport.created_at) : null;
    return (
      <div className="flex h-full flex-1 flex-col">
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/20 p-3 sm:p-4">
          <button onClick={() => { setActiveReport(null); setReportTab("full"); }} className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> all briefings
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => downloadBriefing(activeReport)} className={QUIET_BTN} title="download as markdown">
              <Download className="h-3.5 w-3.5" /> download
            </button>
            <button onClick={() => sendToNotebooks(activeReport)} className={QUIET_BTN} title="copy into a new notebook">
              <FileText className="h-3.5 w-3.5" /> notebook
            </button>
            <button onClick={() => setConfirmReportId(activeReport.id)} className={`${QUIET_BTN} hover:text-destructive`} title="delete this briefing">
              <Trash2 className="h-3.5 w-3.5" /> delete
            </button>
          </div>
        </div>

        <div className="flex-shrink-0 border-b border-border/10 px-3 sm:px-4">
          <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="briefing sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={reportTab === tab.id}
                onClick={() => setReportTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[11px] font-light tracking-wide transition-colors ${
                  reportTab === tab.id ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl p-4 sm:p-6">
            <h1 className="text-lg font-extralight tracking-wide text-foreground">{activeReport.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-extralight text-muted-foreground">
              <span>written by shepherd{activeReport.provider ? ` via ${activeReport.provider}` : ""}</span>
              <span aria-hidden="true">·</span>
              <span>{when ? when.toLocaleString() : ""}</span>
              <span aria-hidden="true">·</span>
              <span>model knowledge, not live sources</span>
            </p>
            {confirmReportId === activeReport.id && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <span className="font-light text-foreground">delete this briefing from this device?</span>
                <button onClick={() => removeReport(activeReport.id)} className="rounded-lg bg-destructive px-3 py-1.5 text-destructive-foreground">delete</button>
                <button onClick={() => setConfirmReportId(null)} className={QUIET_BTN}>keep</button>
              </div>
            )}
            <div className={`${PROSE} mt-4`}>
              <ReactMarkdown>{sectionForTab(activeReport.content, reportTab)}</ReactMarkdown>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ── setup conversation (no profile yet, or reconfiguring)
  if (showSetup || !profile) {
    const turns = chatTurns.length ? chatTurns : [{ role: "assistant" as const, content: SETUP_OPENING }];
    const canSave = profileIsUsable(draft);
    return (
      <div className="flex h-full flex-1 flex-col">
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/20 p-3 sm:p-4">
          <RoomTitle v2={v2} suffix="setup" />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowEditor(true)} className={QUIET_BTN}>
              <Pencil className="h-3.5 w-3.5" /> fill in a form instead
            </button>
            {profile && (
              <button onClick={leaveSetup} className={ICON_BTN} title="leave setup" aria-label="leave setup">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
            <ShepherdNotice state={shepherd} />
            {turns.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs font-extralight leading-relaxed ${
                    msg.role === "user" ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md border border-border/20 bg-card/40 text-foreground"
                  }`}
                >
                  <div className={`${PROSE} [&_p]:text-inherit [&_p]:text-xs`}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="flex justify-start" role="status" aria-label="shepherd is writing">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border/20 bg-card/40 px-4 py-3 text-xs font-extralight text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> shepherd is writing…
                  <button onClick={() => chatAbort.current?.abort()} className="ml-2 underline-offset-2 hover:underline">stop</button>
                </div>
              </div>
            )}
            {chatError && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs font-light text-foreground">
                {chatError}
              </p>
            )}
            {canSave && (
              <div className="space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                <p className="text-xs font-light text-foreground">{draftComplete ? "shepherd has what it needs. this profile will watch:" : "enough to start with. this profile will watch:"}</p>
                <pre className="whitespace-pre-wrap font-sans text-[11px] font-extralight leading-relaxed text-muted-foreground">{describeProfile(draft)}</pre>
                <div className="flex flex-wrap gap-2">
                  <button onClick={saveDraftProfile} disabled={savingProfile} className={PRIMARY_BTN}>
                    {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    save profile
                  </button>
                  {!draftComplete && <span className="self-center text-[11px] font-extralight text-muted-foreground">or keep answering to add more.</span>}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        <div className="flex-shrink-0 border-t border-border/20 p-3 sm:p-4">
          <div className="mx-auto flex max-w-2xl items-center gap-2 sm:gap-3">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder={shepherdReady ? "tell shepherd what to watch…" : `connect a model key in ${SETTINGS_PATH}, or fill in the form`}
              aria-label="message to shepherd"
              className="min-w-0 flex-1 rounded-xl border border-border/20 bg-card/20 px-4 py-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-accent/30 disabled:opacity-60"
              disabled={chatBusy || !shepherdReady}
            />
            <button
              onClick={sendChatMessage}
              disabled={chatBusy || !chatInput.trim() || !shepherdReady}
              aria-label="send"
              className="rounded-xl bg-accent p-3 text-accent-foreground transition-all hover:bg-accent/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── the room: profile, write-now, saved briefings
  const last = reports[0];
  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/20 p-3 sm:p-4">
        <RoomTitle v2={v2} />
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <button onClick={() => setShowEditor(true)} className={ICON_BTN} title="edit what is watched" aria-label="edit what is watched">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => beginSetup(profile)} className={ICON_BTN} title="change the profile with shepherd" aria-label="change the profile with shepherd">
            <MessageSquare className="h-4 w-4" />
          </button>
          <button onClick={() => setConfirmProfile(true)} className={`${ICON_BTN} hover:text-destructive`} title="delete the profile" aria-label="delete the profile">
            <Trash2 className="h-4 w-4" />
          </button>
          {generating ? (
            <button onClick={stopGenerating} className={PRIMARY_BTN}>
              <Square className="h-3.5 w-3.5" /> stop
            </button>
          ) : (
            <button onClick={generateBriefing} disabled={!!writeBlocked} className={PRIMARY_BTN} title={writeBlocked ?? "shepherd writes a briefing now"}>
              <Newspaper className="h-3.5 w-3.5" /> write now
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
          <ShepherdNotice state={shepherd} />

          {confirmProfile && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <span className="font-light text-foreground">delete the profile? saved briefings stay.</span>
              <button onClick={removeProfile} className="rounded-lg bg-destructive px-3 py-1.5 text-destructive-foreground">delete</button>
              <button onClick={() => setConfirmProfile(false)} className={QUIET_BTN}>keep</button>
            </div>
          )}

          {/* what is watched, and the honest word on schedules */}
          <div className="space-y-3 rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-light text-foreground">watching</p>
              <button onClick={() => setShowEditor(true)} className="flex items-center gap-1 text-[11px] text-accent transition-colors hover:text-accent/80">
                <Pencil className="h-3 w-3" /> edit
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-[11px] font-extralight leading-relaxed text-muted-foreground">{describeProfile(profile) || "nothing yet — edit the profile and add at least one thing to watch."}</pre>
            {shepherdReady && !profileUsable && <p className="text-[11px] font-extralight text-muted-foreground/80">write now stays off until the profile names something to watch.</p>}
            <p className="border-t border-border/10 pt-3 text-[11px] font-extralight leading-relaxed text-muted-foreground/80">
              no daily delivery: asherin runs only while this tab is open, so nothing is written on a schedule.
              {last ? ` last briefing ${relativeTime(last.created_at)}.` : " nothing written yet."} press <span className="text-foreground/80">write now</span> for a fresh one.
            </p>
          </div>

          {/* live generation */}
          {generating && (
            <div className="space-y-2 rounded-xl border border-accent/20 bg-accent/5 p-4" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-xs font-light text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> shepherd is writing…
              </p>
              {streamText && (
                <pre ref={streamRef} className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] font-extralight leading-relaxed text-muted-foreground">{streamText}</pre>
              )}
            </div>
          )}
          {genError && !generating && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <span className="font-light text-foreground">{genError}</span>
              <button onClick={() => setGenError(null)} className={QUIET_BTN}>dismiss</button>
            </div>
          )}

          {/* saved briefings */}
          {reports.length === 0 ? (
            <div className="space-y-3 py-12 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-extralight text-muted-foreground">no briefings yet.</p>
              <p className="text-xs font-extralight text-muted-foreground/60">
                {shepherdReady ? "press write now and shepherd writes the first one from what you watch." : `connect a model key in ${SETTINGS_PATH} and shepherd can write the first one.`}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {reports.map((report) => (
                <li key={report.id} className="rounded-xl border border-border/20 bg-card/20 p-3 backdrop-blur-sm transition-colors hover:bg-foreground/5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => { setActiveReport(report); setReportTab("full"); }} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-xs font-light text-foreground">{report.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span>{relativeTime(report.created_at)}</span>
                        {report.provider && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{report.provider}</span>
                          </>
                        )}
                        {report.critical_items > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" /> {report.critical_items} critical
                            </span>
                          </>
                        )}
                        {report.significant_items > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{report.significant_items} significant</span>
                          </>
                        )}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => downloadBriefing(report)} className="rounded p-1.5 text-muted-foreground transition-colors hover:text-accent" title="download as markdown" aria-label="download as markdown">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setConfirmReportId(report.id)} className="rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive" title="delete" aria-label="delete this briefing">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {confirmReportId === report.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/10 pt-3 text-xs">
                      <span className="font-light text-foreground">delete this briefing from this device?</span>
                      <button onClick={() => removeReport(report.id)} className="rounded-lg bg-destructive px-3 py-1.5 text-destructive-foreground">delete</button>
                      <button onClick={() => setConfirmReportId(null)} className={QUIET_BTN}>keep</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default BriefingView;
