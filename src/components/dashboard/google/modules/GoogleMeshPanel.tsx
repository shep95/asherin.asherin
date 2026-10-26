import { useCallback, useEffect, useState } from "react";
import {
  Brain, MapPin, Gauge, PenLine, ShieldCheck, Loader2,
  RefreshCw, CheckCircle2, Lock, Users, ListChecks, Sunrise, Send,
  Archive,
} from "lucide-react";
import ContactVaultPane from "./ContactVaultPane";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import OrganOffline from "../OrganOffline";
import { NO_ACCOUNT_PATH, describeFailure, isLocalOnlyError } from "../offline";

/**
 * GOOGLE MESH — the control surface for the inward-facing sensor array.
 *
 * Four panes, each backed by a deterministic server measurement:
 *   Voiceprint  · stylometry over your own sent mail
 *   Cartography · place nodes + rhythm anomalies
 *   Attention   · meeting vs protected-focus ledger
 *   Ghostwriter · drafts in your voice — never sends
 *
 * Every pane renders the full state quartet (idle / loading / empty / error).
 */

type Pane = "voice" | "places" | "attention" | "write" | "people" | "commit" | "digest" | "vault" | "audit";

interface MeshStatus {
  accounts: Array<{ id: string; email: string; tier: number; canRead: boolean; canCompose: boolean; canSend?: boolean; isPrimary?: boolean }>;
  voiceprints: Array<{ google_email: string; sample_count: number; built_at: string; stylometry: any }>;
  placesIndexed: number;
  attentionThrough: string | null;
}

const TIER_LABEL: Record<number, string> = {
  1: "Identity", 2: "Read", 3: "Comprehension", 4: "Agency", 5: "Delegated Send",
};

/** The consent ladder, in the user's language — not Google's scope strings. */
const TIERS: Array<{ tier: number; label: string; grants: string }> = [
  { tier: 1, label: "Identity", grants: "Who you are — name, email, profile." },
  { tier: 2, label: "Read", grants: "Mail and calendar, read-only." },
  { tier: 3, label: "Comprehension", grants: "Adds Drive, Photos and activity so Asherin can understand your patterns." },
  { tier: 4, label: "Agency", grants: "Adds drafting into Gmail Drafts. Sending is never granted." },
  { tier: 5, label: "Delegated Send", grants: "Lets you approve one specific draft for sending. Never autonomous." },
];

// the staged-consent authorize used to start here (google-oauth get_auth_url,
// then a top-level consent popup, then the exchange). the exchange ran on an
// edge function this edition does not have, so the tier buttons are shown as
// the ladder they describe and held — a button that fails on click teaches
// the operator nothing.

async function callMesh<T = any>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("no local identity on this device.");
  const started = performance.now();
  const { data, error } = await supabase.functions.invoke("google-mesh", { body: { action, ...extra } });
  // connect trace: one row per real mesh action. the shim's "no organ" is a
  // skip, not a failure — nothing was attempted against a network.
  void emitPull({
    organ: "google", capability: action, fromSurface: "google-mesh",
    status: error ? (isLocalOnlyError(error) ? "skip" : "fail") : (data as any)?.error ? "fail" : "ok",
    latencyMs: performance.now() - started,
    quote: error ? (isLocalOnlyError(error) ? "google organ offline on this device" : error.message) : null,
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return data as T;
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border/30 bg-card/20 p-5 space-y-4">{children}</div>
);

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl border border-border/20 bg-background/30 px-3 py-2">
    <div className="text-[10px] tracking-widest text-muted-foreground/60 font-extralight">{label}</div>
    <div className="text-sm font-light text-foreground mt-0.5">{value}</div>
  </div>
);

const GoogleMeshPanel = () => {
  const [pane, setPane] = useState<Pane>("voice");
  const [status, setStatus] = useState<MeshStatus | null>(null);
  const [statusErr, setStatusErr] = useState<unknown>(null);
  // every pane action writes to the mesh organ. when it has no device answer
  // the action buttons are held and the panel says so once.
  const offline = isLocalOnlyError(statusErr);
  const [busy, setBusy] = useState<string | null>(null);

  const [places, setPlaces] = useState<any[] | null>(null);
  const [attention, setAttention] = useState<any | null>(null);
  const [audit, setAudit] = useState<any[] | null>(null);
  const [people, setPeople] = useState<any | null>(null);
  const [commits, setCommits] = useState<any | null>(null);
  const [digest, setDigest] = useState<any | null>(null);
  const [sendConfirm, setSendConfirm] = useState("");

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [intent, setIntent] = useState("");
  const [draft, setDraft] = useState<{ subject: string; draft: string; created?: boolean; draftId?: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatusErr(null);
      setStatus(await callMesh<MeshStatus>("status"));
    } catch (e) {
      setStatusErr(e ?? new Error("the mesh organ did not answer"));
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (e) { toast.error(describeFailure(e, "mesh organ")); }
    finally { setBusy(null); }
  };

  const vp = status?.voiceprints?.[0];
  const sp = vp?.stylometry ?? null;
  const composeReady = !!status?.accounts?.some((a) => a.canCompose);
  const sendReady = !!status?.accounts?.some((a) => a.canSend);

  const panes: Array<{ id: Pane; label: string; icon: React.ElementType }> = [
    { id: "voice", label: "voiceprint", icon: Brain },
    { id: "places", label: "cartography", icon: MapPin },
    { id: "attention", label: "attention", icon: Gauge },
    { id: "write", label: "ghostwriter", icon: PenLine },
    { id: "people", label: "relationships", icon: Users },
    { id: "commit", label: "commitments", icon: ListChecks },
    { id: "digest", label: "daily digest", icon: Sunrise },
    { id: "vault", label: "contact vault", icon: Archive },
    { id: "audit", label: "agency trail", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5">
      {/* consent ladder */}
      <Shell>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-light tracking-wide text-foreground">account mesh</h3>
            <p className="text-xs font-extralight text-muted-foreground/70 mt-1 max-w-xl">
              your google accounts as a retrieval substrate. asherin reads to understand you and
              drafts in your voice — it never sends mail on its own.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void loadStatus()} className="text-xs font-extralight">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden /> read again
          </Button>
        </div>

        {statusErr !== null && (
          <OrganOffline error={statusErr} organ="mesh organ" onRetry={() => void loadStatus()} />
        )}

        {!status && statusErr === null && (
          <div className="h-16 rounded-xl bg-foreground/[0.03] animate-pulse motion-reduce:animate-none" aria-live="polite" />
        )}

        {(statusErr !== null || (status && status.accounts.length === 0)) && (
          <p className="text-xs font-extralight text-muted-foreground/60">{NO_ACCOUNT_PATH}</p>
        )}

        {/* the consent ladder, as a description of what each tier would grant.
            the authorize buttons are gone: the exchange has no device answer. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {TIERS.map((t) => {
            const granted = (status?.accounts[0]?.tier ?? 0) >= t.tier;
            return (
              <div key={t.tier} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-light text-foreground">
                    tier {t.tier} · {t.label.toLowerCase()}
                  </div>
                  <p className="text-[10px] font-extralight text-muted-foreground/60 mt-0.5">{t.grants}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border/25 px-2 py-0.5 font-mono text-[9px] text-muted-foreground/60">
                  {granted ? "granted" : "not granted"}
                </span>
              </div>
            );
          })}
        </div>


        {status && status.accounts.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {status.accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-light text-foreground truncate">{a.email}</div>
                  <div className="text-[10px] font-extralight text-muted-foreground/60">
                    tier {a.tier} · {(TIER_LABEL[a.tier] ?? "Identity").toLowerCase()}
                  </div>
                </div>
                {a.canCompose
                  ? <CheckCircle2 className="h-4 w-4 text-foreground/60 shrink-0" aria-label="agency granted" />
                  : <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0" aria-label="read only" />}
              </div>
            ))}
          </div>
        )}
      </Shell>

      {/* pane switcher */}
      <div className="flex flex-wrap gap-2">
        {panes.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPane(p.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-extralight border transition-colors ${
              pane === p.id
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-border/20 text-muted-foreground/70 hover:text-foreground"
            }`}
          >
            <p.icon className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" aria-hidden />{p.label}
          </button>
        ))}
      </div>

      {/* VOICEPRINT */}
      {pane === "voice" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">stylometric voiceprint</h4>
            <Button
              size="sm" variant="outline" className="text-xs font-extralight"
              disabled={busy === "voice" || offline}
              onClick={() => run("voice", async () => {
                const r = await callMesh("build_voiceprint", { limit: 60 });
                await loadStatus();
                const ok = (r.voiceprints ?? []).filter((v: any) => v.stylometry).length;
                toast.success(ok ? `Voiceprint built from ${ok} account(s).` : "No usable sent mail found.");
              })}
            >
              {busy === "voice" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <Brain className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              build from sent mail
            </Button>
          </div>

          {!sp && <p className="text-xs font-extralight text-muted-foreground/60">no voiceprint yet. one would be built from your own sent mail, with a connected account.</p>}

          {sp && (
            <>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                <Stat label="Register" value={sp.formality} />
                <Stat label="Words / msg" value={sp.avgWordsPerMessage} />
                <Stat label="Sentence len" value={`${sp.avgSentenceLength}w`} />
                <Stat label="Samples" value={vp?.sample_count ?? 0} />
                <Stat label="Contractions" value={`${sp.contractionRate}/100w`} />
                <Stat label="Hedging" value={`${sp.hedgeRate}/100w`} />
                <Stat label="Emoji" value={`${sp.emojiRate}/msg`} />
                <Stat label="Vocabulary" value={sp.vocabularyRichness} />
              </div>
              <div className="text-xs font-extralight text-muted-foreground/70 space-y-1">
                <div>Opens with: {sp.greetings?.length ? sp.greetings.map((g: any) => `"${g.phrase}"`).join(", ") : "— no habitual greeting"}</div>
                <div>Signs off: {sp.signoffs?.length ? sp.signoffs.map((g: any) => `"${g.phrase}"`).join(", ") : "— no habitual sign-off"}</div>
              </div>
            </>
          )}
        </Shell>
      )}

      {/* CARTOGRAPHY */}
      {pane === "places" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">pattern cartography</h4>
            <Button
              size="sm" variant="outline" className="text-xs font-extralight" disabled={busy === "places" || offline}
              onClick={() => run("places", async () => {
                const r = await callMesh("pattern_map", { days: 180 });
                setPlaces(r.nodes ?? []);
                toast.success(`${r.nodes?.length ?? 0} place nodes from ${r.observations} observations.`);
              })}
            >
              {busy === "places" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <MapPin className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              map last 180 days
            </Button>
          </div>
          {places === null && <p className="text-xs font-extralight text-muted-foreground/60">the map folds calendar locations into physical place nodes.</p>}
          {places?.length === 0 && <p className="text-xs font-extralight text-muted-foreground/60">no physical locations found — your calendar events carry no addresses.</p>}
          {!!places?.length && (
            <div className="space-y-1.5">
              {places.slice(0, 25).map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-background/30 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-light text-foreground truncate">{p.label}</div>
                    <div className="text-[10px] font-extralight text-muted-foreground/60">
                      {p.visits} visit{p.visits === 1 ? "" : "s"} · last {String(p.lastSeen).slice(0, 10)}
                      {p.cadenceDays ? ` · every ~${p.cadenceDays}d` : ""}
                    </div>
                  </div>
                  {p.anomaly && (
                    <span className="text-[10px] font-extralight text-muted-foreground/80 whitespace-nowrap">⚠ overdue</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Shell>
      )}

      {/* ATTENTION */}
      {pane === "attention" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">attention ledger</h4>
            <Button
              size="sm" variant="outline" className="text-xs font-extralight" disabled={busy === "attn" || offline}
              onClick={() => run("attn", async () => {
                setAttention(await callMesh("attention_ledger", { days: 28 }));
              })}
            >
              {busy === "attn" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <Gauge className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              compute 28 days
            </Button>
          </div>
          {!attention && <p className="text-xs font-extralight text-muted-foreground/60">measures meeting load against protected focus blocks (gaps ≥ 45 min).</p>}
          {attention && (
            <>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                <Stat label="Meetings" value={`${attention.summary.meetingHours}h`} />
                <Stat label="Focus" value={`${attention.summary.focusHours}h`} />
                <Stat label="Focus share" value={`${attention.summary.ratio}%`} />
                <Stat label="Heaviest day" value={attention.summary.busiestDay ?? "—"} />
              </div>
              {attention.days?.length === 0 && (
                <p className="text-xs font-extralight text-muted-foreground/60">No timed calendar events in the window.</p>
              )}
            </>
          )}
        </Shell>
      )}

      {/* GHOSTWRITER */}
      {pane === "write" && (
        <Shell>
          <h4 className="text-xs font-light tracking-wide text-foreground">ghostwriter</h4>
          <p className="text-[11px] font-extralight text-muted-foreground/60">
            writes in your measured voice and saves to gmail drafts. asherin never sends — you do.
          </p>
          {!composeReady && (
            <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-background/30 px-3 py-2 text-xs font-extralight text-muted-foreground/70">
              <Lock className="h-3.5 w-3.5" aria-hidden /> tier 4 (agency) not granted on any connected account.
            </div>
          )}
          <div className="grid gap-2">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient email" className="text-xs font-extralight" disabled={offline} />
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject (optional — will be proposed)" className="text-xs font-extralight" disabled={offline} />
            <Textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={4}
              placeholder="what should this email say?" className="text-xs font-extralight" disabled={offline} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" variant="outline" className="text-xs font-extralight"
              disabled={busy === "prev" || !sp || offline}
              onClick={() => run("prev", async () => {
                setDraft(await callMesh("ghostwrite", { to, subject, intent, preview: true }));
              })}
            >
              {busy === "prev" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <PenLine className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              preview
            </Button>
            <Button
              size="sm" className="text-xs font-extralight"
              disabled={busy === "save" || !sp || !composeReady || offline}
              onClick={() => run("save", async () => {
                const r = await callMesh("ghostwrite", { to, subject, intent });
                setDraft(r);
                toast.success("saved to gmail drafts.");
              })}
            >
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : null}
              save to drafts
            </Button>
          </div>
          {!sp && <p className="text-[11px] font-extralight text-muted-foreground/60">a voiceprint comes first — without it the draft would not sound like you.</p>}
          {draft && (
            <div className="rounded-xl border border-border/20 bg-background/30 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">
                {draft.created ? `Draft saved · ${draft.draftId}` : "Preview"}
              </div>
              <div className="text-xs font-light text-foreground">{draft.subject}</div>
              <pre className="whitespace-pre-wrap text-xs font-extralight text-muted-foreground/80 leading-relaxed">{draft.draft}</pre>

              {draft.created && draft.draftId && (
                <div className="pt-2 border-t border-border/20 space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">
                    Delegated send · two-phase
                  </div>
                  {!sendReady ? (
                    <p className="text-[11px] font-extralight text-muted-foreground/60 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Tier 5 not granted. Authorize Delegated Send above to enable this.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] font-extralight text-muted-foreground/60">
                        Type <span className="text-foreground">SEND</span> to release this exact draft. Nothing else is sent.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={sendConfirm}
                          onChange={(e) => setSendConfirm(e.target.value)}
                          placeholder="SEND"
                          aria-label="Type SEND to confirm"
                          className="text-xs font-extralight max-w-[140px]"
                        />
                        <Button
                          size="sm" variant="destructive" className="text-xs font-extralight"
                          disabled={busy === "send" || sendConfirm.trim().toUpperCase() !== "SEND"}
                          onClick={() => run("send", async () => {
                            const r = await callMesh("send_draft", {
                              draft_id: draft.draftId, confirm: sendConfirm.trim().toUpperCase(),
                            });
                            setSendConfirm("");
                            setDraft(null);
                            toast.success(`Sent · ${r.messageId ?? draft.draftId}`);
                          })}
                        >
                          {busy === "send"
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            : <Send className="h-3.5 w-3.5 mr-1.5" />}
                          Send now
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Shell>
      )}

      {/* RELATIONSHIPS — metadata only, never message bodies */}
      {pane === "people" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">relationship ledger</h4>
            <Button size="sm" variant="outline" className="text-xs font-extralight" disabled={busy === "people" || offline}
              onClick={() => run("people", async () => { setPeople(await callMesh("relationship_graph", { days: 180 })); })}>
              {busy === "people" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <Users className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              map 180 days
            </Button>
          </div>
          {!people && (
            <p className="text-xs font-extralight text-muted-foreground/60">
              headers only — who you exchange with, how often, how fast you answer. no message content is read.
            </p>
          )}
          {people && (
            <>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                <Stat label="Messages" value={people.messagesAnalyzed} />
                <Stat label="People" value={people.people?.length ?? 0} />
                <Stat label="Inner circle" value={people.inner ?? 0} />
                <Stat label="Going quiet" value={people.dormant?.length ?? 0} />
              </div>
              {people.people?.length === 0 && (
                <p className="text-xs font-extralight text-muted-foreground/60">No correspondence in the window.</p>
              )}
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {(people.people ?? []).map((p: any) => (
                  <div key={p.email} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-light text-foreground truncate">{p.name || p.email}</div>
                      <div className="text-[10px] font-extralight text-muted-foreground/60 truncate">
                        {p.sent}↑ / {p.received}↓ · reciprocity {p.reciprocity}
                        {p.medianReplyHours != null ? ` · replies ~${p.medianReplyHours}h` : ""}
                      </div>
                    </div>
                    <span className="text-[10px] font-extralight text-muted-foreground/70 whitespace-nowrap">
                      {p.dormant ? `quiet ${p.dormantDays}d` : p.tier}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Shell>
      )}

      {/* COMMITMENTS */}
      {pane === "commit" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">commitment engine</h4>
            <Button size="sm" variant="outline" className="text-xs font-extralight" disabled={busy === "commit" || offline}
              onClick={() => run("commit", async () => { setCommits(await callMesh("commitments", { days: 45 })); })}>
              {busy === "commit" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <ListChecks className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              scan 45 days
            </Button>
          </div>
          {!commits && (
            <p className="text-xs font-extralight text-muted-foreground/60">
              extracts promises you made in your own sent mail. deadlines resolve against when you wrote them, not today.
            </p>
          )}
          {commits && (
            <>
              <div className="grid gap-2 grid-cols-3">
                <Stat label="Found" value={commits.commitments?.length ?? 0} />
                <Stat label="Overdue" value={commits.overdue ?? 0} />
                <Stat label="Due ≤3d" value={commits.dueSoon ?? 0} />
              </div>
              {commits.commitments?.length === 0 && (
                <p className="text-xs font-extralight text-muted-foreground/60">No explicit promises detected in the window.</p>
              )}
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {(commits.commitments ?? []).map((c: any, i: number) => (
                  <div key={`${c.messageId}-${i}`} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2">
                    <div className="text-xs font-light text-foreground">{c.text}</div>
                    <div className="text-[10px] font-extralight text-muted-foreground/60 mt-0.5">
                      to {c.to || "—"} · {c.dueAt ? `due ${String(c.dueAt).slice(0, 10)}` : "no explicit date"}
                      {c.overdue ? " · ⚠ overdue" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Shell>
      )}

      {/* DAILY DIGEST */}
      {pane === "digest" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">daily digest</h4>
            <Button size="sm" variant="outline" className="text-xs font-extralight" disabled={busy === "digest" || offline}
              onClick={() => run("digest", async () => { setDigest(await callMesh("daily_digest", {})); })}>
              {busy === "digest" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <Sunrise className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              build briefing
            </Button>
          </div>
          {!digest && (
            <p className="text-xs font-extralight text-muted-foreground/60">
              fuses attention load, place rhythm, obligations and decaying relationships into one read.
            </p>
          )}
          {digest && (
            <div className="space-y-3">
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                <Stat label="Overdue" value={digest.obligations?.overdue?.length ?? 0} />
                <Stat label="Due next" value={digest.obligations?.upcoming?.length ?? 0} />
                <Stat label="Going quiet" value={digest.relationships?.decaying?.length ?? 0} />
                <Stat label="Focus share" value={digest.attention?.focusShare != null ? `${digest.attention.focusShare}%` : "—"} />
              </div>

              <div className="grid gap-2 grid-cols-3">
                <Stat label="Meetings (7d)" value={`${digest.attention?.meetingHours ?? 0}h`} />
                <Stat label="Focus (7d)" value={`${digest.attention?.focusHours ?? 0}h`} />
                <Stat label="Heaviest day" value={digest.attention?.heaviestDay ?? "—"} />
              </div>

              {[
                { title: "Overdue promises", rows: (digest.obligations?.overdue ?? []).map((c: any) => `${c.text} → ${c.to || "—"}`) },
                { title: "Coming due", rows: (digest.obligations?.upcoming ?? []).map((c: any) => `${c.text} · ${String(c.dueAt).slice(0, 10)}`) },
                { title: "Waiting on you", rows: (digest.relationships?.awaitingYourReply ?? []).map((p: any) => `${p.name || p.email} · quiet ${p.dormantDays}d`) },
                { title: "Relationships decaying", rows: (digest.relationships?.decaying ?? []).map((p: any) => `${p.name || p.email} · ${p.dormantDays}d silent`) },
                { title: "Place rhythm", rows: (digest.places ?? []).slice(0, 6).map((p: any) => `${p.label} · ${p.visits} visits · last ${String(p.lastSeen).slice(0, 10)}`) },
              ].map((block) => (
                <div key={block.title}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight mb-1.5">
                    {block.title}
                  </div>
                  {block.rows.length === 0 ? (
                    <p className="text-xs font-extralight text-muted-foreground/50">Nothing here.</p>
                  ) : (
                    <ul className="space-y-1.5" aria-live="polite">
                      {block.rows.map((l: string, i: number) => (
                        <li key={i} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2 text-xs font-extralight text-muted-foreground/80">
                          {l}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <p className="text-[10px] font-extralight text-muted-foreground/50">
                Generated {new Date(digest.generatedAt).toLocaleString()} across {(digest.accounts ?? []).length} account(s).
              </p>
            </div>
          )}
        </Shell>
      )}

      {/* AUDIT */}
      {pane === "vault" && <ContactVaultPane />}

      {pane === "audit" && (
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-light tracking-wide text-foreground">agency trail</h4>
            <Button size="sm" variant="outline" className="text-xs font-extralight" disabled={busy === "audit" || offline}
              onClick={() => run("audit", async () => { setAudit((await callMesh("audit_log")).entries ?? []); })}>
              {busy === "audit" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" aria-hidden />}
              load
            </Button>
          </div>
          {audit === null && <p className="text-xs font-extralight text-muted-foreground/60">append-only record of every action taken on your behalf.</p>}
          {audit?.length === 0 && <p className="text-xs font-extralight text-muted-foreground/60">nothing has been done on your behalf yet.</p>}
          {!!audit?.length && (
            <div className="space-y-1.5">
              {audit.map((a) => (
                <div key={a.id} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2">
                  <div className="text-xs font-light text-foreground">{a.action}{a.target ? ` → ${a.target}` : ""}</div>
                  <div className="text-[10px] font-extralight text-muted-foreground/60">
                    {new Date(a.created_at).toLocaleString()} · {a.google_email ?? "—"} · {a.confirmed ? "executed" : "requested"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Shell>
      )}
    </div>
  );
};

export default GoogleMeshPanel;
