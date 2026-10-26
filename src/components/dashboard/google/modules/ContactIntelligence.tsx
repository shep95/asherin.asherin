import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Clock, Network, Zap, AlertTriangle, RefreshCw, Search,
  HardDrive, Download, Brain, Activity, MessageSquare, Trash2, ChevronDown,
  ScrollText, MapPin,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { useAuth } from "@/contexts/AuthContext";
import { useAutoSync } from "@/hooks/useAutoSync";
import { toast } from "sonner";

import {
  buildContactIntel, type ContactDossier, type IntelSummary, type RawMessage,
} from "./contactIntel/messageIntel";
import {
  saveVault, loadVault, clearVault, vaultBytes, exportVaultText, downloadText,
  loadCorpus, saveCorpus, mergeCorpus,
  type VaultSnapshot,
} from "./contactIntel/localVault";
import { latticeFindings, correspondenceSeries } from "@/lib/cloudIntel/lattice";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// lattice — contact intelligence held in a vault on this device.
//
// the "device mesh" mirror and the "background sync" line are gone from this
// desk. the mirror wrote the snapshot into a local table and then read it back
// as if it had come from another device, and the background line polled a
// table no scheduler writes, so it read "arming…" forever. what remains is
// what is true: the vault on this device, and the foreground cadence while
// this tab is open.
import { median } from "@/lib/cloudIntel/logic";
import FindingCard from "../intel/FindingCard";
import { TrendStat } from "../intel/TrendStat";
import RelationGraph from "../intel/RelationGraph";
import ReportViewer from "./contactIntel/ReportViewer";
import { buildContactReport } from "@/lib/cloudIntel/contactReport";
import { renderContactReport } from "@/lib/cloudIntel/contactReportText";
import { collectContactOsint, emptyAnnex, type OsintAnnex } from "@/lib/cloudIntel/contactOsint";
import { setPendingContacts } from "@/lib/cloudIntel/mapBridge";
import { deriveOrgAnchors } from "@/lib/cloudIntel/orgAnchor";




// Depth of the sweep. The Gmail metadata read is the expensive leg, so the
// window is declared once here and honored end to end rather than being
// silently clipped downstream.
const MAIL_DEPTH = 100;
const CONTACT_DEPTH = 1000;

/**
 * Delta overlap. The cursor is rewound by this much before it is handed to
 * Gmail so mail that arrived while the previous sweep was mid-flight, or that
 * carries a skewed clock, is still caught. Re-fetching a two-day tail is cheap;
 * a permanently missed message is not, because nothing ever goes back for it.
 */
const DELTA_OVERLAP_MS = 2 * 86400000;

/** Mirrors the vault's retention cap; backfill stops once the corpus is full. */
const CORPUS_CEILING = 6000;

const TIER_LABEL: Record<ContactDossier["tier"], string> = {
  inner: "inner", active: "active", periphery: "periphery", dormant: "dormant", archive: "archive",
};

const fmtBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;

const fmtAgo = (ms: number | null) => {
  if (ms === null) return "—";
  const d = Math.round((Date.now() - ms) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
};

/** Minute-grain recency for sync stamps, where "3d ago" would hide the point. */
const fmtWhen = (ms: number | null) => {
  if (ms === null || !Number.isFinite(ms)) return "never";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/** Countdown to a scheduled attempt. */
const fmtIn = (ms: number | null) => {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const s = Math.round((ms - Date.now()) / 1000);
  if (s <= 0) return "due";
  if (s < 90) return `in ${s}s`;
  if (s < 5400) return `in ${Math.round(s / 60)}m`;
  return `in ${Math.round(s / 3600)}h`;
};


/** A metric that has no evidence prints an em dash, never a fabricated zero. */
const Metric = ({ label, value, suffix = "" }: { label: string; value: number | string | null; suffix?: string }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-light text-muted-foreground/50">{label}</p>
    <p className="text-xs font-light text-foreground truncate">
      {value === null || value === "" ? "—" : `${value}${suffix}`}
    </p>
  </div>
);

const Bar = ({ label, value }: { label: string; value: number | null }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px] font-light">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground/80">{value === null ? "—" : value}</span>
    </div>
    <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-foreground/50 transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${value ?? 0}%` }}
      />
    </div>
  </div>
);

const Sparkline = ({ data, labels }: { data: number[]; labels?: string[] }) => {
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-[2px] h-10" role="img" aria-label="Activity distribution">
      {data.map((v, i) => (
        <div key={i} className="flex-1 min-w-0" title={`${labels?.[i] ?? i}: ${v}`}>
          <div
            className="w-full rounded-sm bg-foreground/30"
            style={{ height: `${Math.max(2, (v / max) * 40)}px` }}
          />
        </div>
      ))}
    </div>
  );
};

const ContactIntelligence = () => {
  const { accounts, isConnected, fetchGoogleData } = useGoogleApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? "";

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<ContactDossier[]>([]);
  const [summary, setSummary] = useState<IntelSummary | null>(null);
  const [vaultMeta, setVaultMeta] = useState<{ savedAt: number; bytes: number } | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | ContactDossier["tier"]>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The deep report reads raw traffic, not the reduced dossier, so the sweep's
  // corpus is held for the session. A vault-restored page has dossiers but no
  // corpus; the report button says so rather than rendering a hollow report.
  const [corpus, setCorpus] = useState<{ messages: RawMessage[]; own: string[] } | null>(null);
  // Retention posture, surfaced so the operator can see the ledger accumulating
  // rather than having to trust that it does.
  const [retention, setRetention] = useState<{ held: number; cursor: number | null; added: number } | null>(null);
  const [reportKey, setReportKey] = useState<string | null>(null);
  const [limit, setLimit] = useState(40);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const applySnapshot = useCallback((snap: VaultSnapshot) => {
    setDossiers(snap.dossiers);
    setSummary(snap.summary);
    setVaultMeta({ savedAt: snap.savedAt, bytes: vaultBytes(snap) });
  }, []);

  // offline-first: the device vault paints immediately so the operator is
  // never staring at an empty roster while anything else is decided.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [local, storedCorpus] = await Promise.all([loadVault(userId), loadCorpus(userId)]);
      if (cancelled || !alive.current) return;
      if (local) applySnapshot(local);
      // the corpus is what makes a cold open resumable: deep reports work
      // immediately and the next sweep asks only for the delta.
      if (storedCorpus?.messages.length) {
        setCorpus({ messages: storedCorpus.messages, own: [] });
        setRetention({ held: storedCorpus.messages.length, cursor: storedCorpus.cursor, added: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [userId, applySnapshot]);


  const sweep = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      // ── Resume, do not restart. The retained corpus decides the shape of
      // this sweep: with history on disk we ask Gmail only for what landed
      // since the cursor; with an empty vault we take the full window once.
      const stored = await loadCorpus(userId);
      const held = stored?.messages ?? [];
      const resumable = held.length > 0 && stored?.cursor != null;
      const since = resumable ? Math.max(0, (stored!.cursor as number) - DELTA_OVERLAP_MS) : null;
      // Gmail's `after:` / `before:` take whole seconds of epoch time.
      const gate = since === null ? "" : ` after:${Math.floor(since / 1000)}`;

      // A forward-only cursor stops the ledger forgetting, but it can never
      // reach mail that predates the first sweep — Gmail returns the newest
      // page and nothing behind it. So each resumed sweep also walks one page
      // backwards from the oldest message already held, until either the cap
      // is reached or the mailbox is exhausted. Coverage then grows in both
      // directions instead of being permanently anchored to the first run.
      const oldestHeld = resumable
        ? held.reduce((min, m) => {
            const t = typeof m.internalDate === "number" ? m.internalDate : Date.parse(m.date || "");
            return Number.isFinite(t) && t > 0 && t < min ? t : min;
          }, Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const backfillable = resumable && held.length < CORPUS_CEILING && Number.isFinite(oldestHeld);
      const backGate = backfillable ? ` before:${Math.floor(oldestHeld / 1000)}` : null;

      setPhase(
        resumable
          ? `resuming from ${held.length.toLocaleString()} retained messages — fetching changes only…`
          : "reading address book and mail metadata…",
      );
      // allSettled, not all: a revoked Gmail scope must not void the roster.
      const [contactRes, inboxRes, sentRes, backInRes, backSentRes, calRes] = await Promise.allSettled([
        fetchGoogleData("contacts", { pageSize: CONTACT_DEPTH }),
        fetchGoogleData("gmail_inbox", { maxResults: MAIL_DEPTH, q: `-in:chats${gate}` }),
        fetchGoogleData("gmail_inbox", { maxResults: MAIL_DEPTH, q: `in:sent${gate}` }),
        backGate
          ? fetchGoogleData("gmail_inbox", { maxResults: MAIL_DEPTH, q: `-in:chats${backGate}` })
          : Promise.resolve(null),
        backGate
          ? fetchGoogleData("gmail_inbox", { maxResults: MAIL_DEPTH, q: `in:sent${backGate}` })
          : Promise.resolve(null),
        fetchGoogleData("calendar_events", {
          timeMin: new Date(Date.now() - 90 * 86400000).toISOString(),
          timeMax: new Date(Date.now() + 30 * 86400000).toISOString(),
          maxResults: 200,
        }),
      ]);

      const val = (r: PromiseSettledResult<any>) => (r.status === "fulfilled" ? r.value : null);
      const contactData = val(contactRes);
      const inbox = val(inboxRes);
      const sent = val(sentRes);
      const cal = val(calRes);

      const failed = [
        contactRes.status === "rejected" && "contacts",
        inboxRes.status === "rejected" && "inbox",
        sentRes.status === "rejected" && "sent mail",
        calRes.status === "rejected" && "calendar",
      ].filter(Boolean) as string[];

      // Fold this harvest into the retained corpus on Gmail's stable message
      // id. Merge, never replace: the previous behaviour rebuilt the ledger
      // from whatever window Gmail returned, so anything older silently fell
      // off the record on every open.
      const backIn = val(backInRes);
      const backSent = val(backSentRes);
      const harvested: RawMessage[] = [
        ...(inbox?.messages || []),
        ...(sent?.messages || []),
        ...(backIn?.messages || []),
        ...(backSent?.messages || []),
      ];
      const folded = mergeCorpus(held, harvested);
      const messages = folded.messages;

      // The cursor only advances when both mail legs actually succeeded. A
      // partial sweep that moved it would leave a permanent hole in coverage,
      // because no later sweep ever looks back past the cursor.
      const mailComplete = inboxRes.status === "fulfilled" && sentRes.status === "fulfilled";
      const nextCursor = mailComplete ? Date.now() : (stored?.cursor ?? null);

      setPhase("fusing identities and profiling language…");
      const ownAddresses = accounts.map((a) => a.google_email).filter(Boolean);
      const calendarAttendees = (cal?.events || []).flatMap((e: any) => e.attendeeEmails || []);

      const { dossiers: built, summary: sum } = buildContactIntel({
        contacts: contactData?.contacts || [],
        messages,
        ownAddresses,
        calendarAttendees,
      });

      if (!alive.current) return;
      setDossiers(built);
      setSummary(sum);
      setCorpus({ messages, own: ownAddresses });
      setRetention({ held: messages.length, cursor: nextCursor, added: folded.added });

      // Persist the corpus before the dossiers: the record must outlive the
      // projection, so a crash between the two writes loses the cheaper half.
      setPhase("committing corpus to device vault…");
      await saveCorpus(userId, messages, nextCursor, (stored?.evicted ?? 0) + folded.evicted);

      setPhase("writing to device vault…");
      const savedAt = Date.now();
      const snapshot: VaultSnapshot = { id: userId, savedAt, summary: sum, dossiers: built };
      const ok = await saveVault(userId, sum, built);
      if (alive.current) {
        setVaultMeta(ok ? { savedAt, bytes: vaultBytes(snapshot) } : null);
      }

      if (failed.length) {
        setError(`partial sweep — ${failed.join(", ")} unavailable. results below exclude those sources.`);
      }
      toast.success(
        resumable
          ? `${folded.added} new message${folded.added === 1 ? "" : "s"} merged — ${built.length} identities across ${messages.length} retained.`
          : `${built.length} identities profiled from ${messages.length} messages.`,
      );
    } catch (e: unknown) {
      if (alive.current) setError(describeFailure(e, "google data organ"));
      // rethrow so the scheduler widens its cadence instead of retrying a
      // dead organ every interval.
      throw e;
    } finally {
      if (alive.current) { setLoading(false); setPhase(""); }
    }
  }, [isConnected, fetchGoogleData, accounts, userId]);

  // foreground continuity: sweeps on open, keeps a cadence while the tab is
  // visible, catches up on refocus and reconnect, and yields to sibling tabs.
  // nothing runs while the tab is closed; the copy says so.
  const auto = useAutoSync({
    key: `contact-intel:${userId}`,
    enabled: Boolean(isConnected && accounts.length && userId),
    run: sweep,
    intervalMs: 10 * 60_000,
    minGapMs: 3 * 60_000,
  });


  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (tierFilter !== "all" && d.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.emails.some((e) => e.includes(q)) ||
        d.phones.some((p) => p.includes(q)) ||
        d.organization.toLowerCase().includes(q) ||
        d.patterns.topSubjectTokens.some((t) => t.token.includes(q))
      );
    });
  }, [dossiers, query, tierFilter]);

  useEffect(() => { setLimit(40); }, [query, tierFilter]);

  const alerts = useMemo(
    () => dossiers.flatMap((d) => d.signals.filter((s) => s.kind === "warn").map((s) => ({ name: d.name, ...s }))).slice(0, 12),
    [dossiers],
  );

  // Built lazily for one contact at a time: the full-corpus pass is O(n) in
  // messages and would be wasted work across a 1000-row roster.
  const baseReport = useMemo(() => {
    if (!reportKey || !corpus) return null;
    const d = dossiers.find((x) => x.key === reportKey);
    if (!d) return null;
    try {
      const own = corpus.own.length ? corpus.own : accounts.map((a) => a.google_email).filter(Boolean);
      // Everything the address book already knows is handed to the external
      // leg. Collecting on name+primary-address alone is what produced
      // candidate-only dossiers: a common name with no disambiguator cannot
      // resolve. Alternate addresses, every number, the employer and the
      // stated locality are all hard binding surface and are seeded here.
      const identifiers = Array.from(new Set([
        ...d.emails.map((e) => e.trim().toLowerCase()),
        ...d.phones.map((p) => p.trim()),
        ...d.urls.map((u) => u.trim()),
      ].filter((v) => v.length >= 5))).slice(0, 8);
      const locationHint = [d.location, d.organization, d.jobTitle]
        .map((v) => (v || "").trim())
        .filter(Boolean)
        .join(" · ") || null;
      // The organisational axis. A corporate address carries its employer
      // implicitly; a consumer mailbox does not, and that single asymmetry is
      // why one contact's report came back with their whole company footprint
      // and the rest read thin. The anchors are recovered from the record and
      // from the mail graph instead.
      const orgAnchors = deriveOrgAnchors({
        emails: d.emails,
        organization: d.organization,
        urls: d.urls,
        messages: corpus.messages,
        ownAddresses: own,
      }).map((a) => a.value);
      return {
        name: d.name,
        email: d.emails[0] ?? null,
        identifiers,
        locationHint,
        orgAnchors,
        r: buildContactReport({ dossier: d, messages: corpus.messages, ownAddresses: own, peers: dossiers }),
      };
    } catch (e) {
      console.error("[contact-intel] report build failed:", e);
      return null;
    }
  }, [reportKey, corpus, dossiers, accounts]);

  // The open-source leg runs against the network and can take a minute, so it
  // never blocks the metadata report from rendering. The report is shown
  // immediately with the annex marked in-flight, then re-rendered once
  // collection lands. Keyed by subject so a stale response from a previously
  // opened contact can never be painted onto the current one.
  const [annex, setAnnex] = useState<{ key: string; value: OsintAnnex | null }>({ key: "", value: null });
  const [annexLoading, setAnnexLoading] = useState(false);

  useEffect(() => {
    if (!reportKey || !baseReport) { setAnnexLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    setAnnexLoading(true);
    setAnnex({ key: reportKey, value: null });
    collectContactOsint({
      name: baseReport.name,
      email: baseReport.email,
      identifiers: baseReport.identifiers,
      locationHint: baseReport.locationHint,
      orgAnchors: baseReport.orgAnchors,
      signal: controller.signal,
    })
      .then((a) => { if (!cancelled) setAnnex({ key: reportKey, value: a }); })
      .finally(() => { if (!cancelled) setAnnexLoading(false); });
    return () => { cancelled = true; controller.abort(); };
    // baseReport identity changes with the corpus; the subject is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);


  const report = useMemo(() => {
    if (!reportKey) return null;
    if (!baseReport) {
      return corpus
        ? { name: "Unknown", text: "Report generation failed. The dossier is intact; the report layer is not." }
        : null;
    }
    const live = annex.key === reportKey ? annex.value : null;
    const pending: OsintAnnex | null = live
      ? live
      : annexLoading
        ? emptyAnnex("building", "Open-source sweep in progress — this section will fill in when collection returns.", baseReport.name, baseReport.email)
        : null;
    return {
      name: baseReport.name,
      text: renderContactReport(baseReport.r, baseReport.name, pending),
      // Only imagery from a completed sweep is offered to the viewer; the
      // placeholder annex used while collection runs carries none.
      images: live?.imagery ?? [],
    };
  }, [reportKey, baseReport, annex, annexLoading, corpus]);


  const onExport = () => {
    if (!summary) return;
    downloadText(
      `contact-intelligence-${new Date().toISOString().slice(0, 10)}.txt`,
      exportVaultText({ id: userId, savedAt: vaultMeta?.savedAt ?? Date.now(), summary, dossiers }),
    );
  };

  const onPurge = async () => {
    await clearVault(userId);
    setDossiers([]); setSummary(null); setVaultMeta(null);
    setCorpus(null); setRetention(null);
    toast.success("device vault purged.");
  };

  // A stat card that shows only a level is a photograph of a moving thing.
  // Each figure below carries its own recent series, its percentile inside the
  // subject's own population, or the baseline it is being judged against.
  const findings = useMemo(
    () => latticeFindings({ dossiers, summary, connected: isConnected }),
    [dossiers, summary, isConnected],
  );
  const volumeSeries = useMemo(() => correspondenceSeries(dossiers), [dossiers]);
  // Organisation is the only grouping the corpus can prove, so it is the only
  // one the lattice colours by.
  const orgClusters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dossiers) {
      if (d.total <= 0) continue;
      const org = d.organization || "unaffiliated";
      counts.set(org, (counts.get(org) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o]) => o);
  }, [dossiers]);

  const importancePop = useMemo(() => dossiers.map((d) => d.importance), [dossiers]);
  const cadencePop = useMemo(
    () => dossiers.map((d) => d.cadenceDays).filter((c): c is number => c != null),
    [dossiers],
  );
  const activeCount = useMemo(() => dossiers.filter((d) => d.total > 0).length, [dossiers]);


  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5 shrink-0">
            <Users className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">contact intelligence</h2>
              {isConnected && (
                <button
                  type="button"
                  onClick={() => void auto.syncNow()}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                  {loading ? "sweeping" : "sweep now"}
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "every identity in reach — address book, inbox, sent mail and calendar — fused into one ledger with message-pattern and language profiling, held on this device. sweeps on open and on a cadence while this tab is visible; nothing runs while it is closed."
                : `${CONNECT_UNAVAILABLE} a ledger swept earlier on this device, if any, is still shown below.`}
            </p>
            {loading && phase && (
              <p className="text-[10px] font-light text-muted-foreground/60" aria-live="polite">{phase}</p>
            )}
            {error && (
              <p className="text-[10px] font-light text-amber-400/90 flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {error}
              </p>
            )}

            {/* foreground cadence only: there is no closed-app sweep on this device. */}
            {isConnected && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1" aria-live="polite">
                <span className="flex items-center gap-1.5 text-[10px] font-light text-muted-foreground/60">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      loading || auto.syncing
                        ? "bg-foreground/70 animate-pulse motion-reduce:animate-none"
                        : auto.lastError
                          ? "bg-amber-400/80"
                          : "bg-emerald-400/70"
                    }`}
                    aria-hidden
                  />
                  {loading || auto.syncing
                    ? "sweep running"
                    : `this tab: ${fmtWhen(auto.lastRunAt)}${auto.nextRunAt ? ` · next ${fmtIn(auto.nextRunAt)}` : ""}`}
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Stat band — level, motion, and population context ──────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TrendStat
          label="identities"
          value={summary ? summary.contactCount : "—"}
          hint={summary ? `${summary.correspondentCount} carry live traffic · ${summary.bulkFiltered} bulk senders excluded` : "no sweep has run on this device"}
          loading={loading && !summary}
        />
        <TrendStat
          label="active roster"
          value={summary ? activeCount : "—"}
          series={volumeSeries}
          hint={summary ? `${Math.round((activeCount / Math.max(1, summary.contactCount)) * 100)}% of the address book is live` : undefined}
          loading={loading && !summary}
        />
        <TrendStat
          label="messages read"
          value={summary ? summary.messageCount : "—"}
          population={importancePop}
          hint={summary?.patterns.peakHour != null ? `peak transmission ${summary.patterns.peakHour}:00 local` : "no timed traffic yet"}
          loading={loading && !summary}
        />
        <TrendStat
          label="median cadence"
          value={cadencePop.length ? `${Math.round(median(cadencePop))}d` : "—"}
          population={cadencePop}
          hint={cadencePop.length ? `across ${cadencePop.length} relationships with a measurable rhythm` : "not enough repeat contact to establish rhythm"}
          loading={loading && !summary}
        />
      </div>

      {/* ── Synthesis ──────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">synthesis</h3>
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} defaultOpen={f.severity === "critical" || f.severity === "elevated"} />
        ))}
      </section>


      {/* ── Device vault ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 flex flex-wrap items-center gap-3">
        <HardDrive className="h-4 w-4 text-foreground/60 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-light text-foreground">device vault</p>
          <p className="text-[10px] font-light text-muted-foreground/60">
            {vaultMeta
              ? `${fmtBytes(vaultMeta.bytes)} held in this browser's indexeddb · last written ${new Date(vaultMeta.savedAt).toLocaleString()}`
              : "nothing stored on this device yet. the vault fills from a sweep, and a sweep needs a connected account."}
          </p>
          {retention && (
            <p className="text-[10px] font-extralight text-muted-foreground/50" aria-live="polite">
              {retention.held.toLocaleString()} messages retained
              {retention.added > 0 && ` · ${retention.added} merged this sweep`}
              {retention.cursor
                ? ` · resuming from ${new Date(retention.cursor).toLocaleString()} — sweeps fetch changes only`
                : " · next sweep takes a full baseline"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={!summary}
          className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-colors disabled:opacity-40"
        >
          <Download className="h-3 w-3" aria-hidden /> export ledger
        </button>
        <button
          type="button"
          onClick={onPurge}
          disabled={!vaultMeta}
          className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-3 py-1.5 text-[10px] font-light text-muted-foreground hover:bg-foreground/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" aria-hidden /> purge
        </button>
      </div>


      {/* ── Operator language baseline ─────────────────────────────── */}
      {summary && summary.psych.evidence !== "none" && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
              <Brain className="h-4 w-4" aria-hidden /> your correspondence baseline
            </h3>
            <span className="text-[10px] font-light text-muted-foreground/50">
              {summary.psych.evidence} evidence · {summary.psych.tokens} tokens
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2.5">
            <Bar label="warmth" value={summary.psych.composites.warmth} />
            <Bar label="assertiveness" value={summary.psych.composites.assertiveness} />
            <Bar label="formality" value={summary.psych.composites.formalityIndex} />
            <Bar label="pressure load" value={summary.psych.composites.stressLoad} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <div>
              <p className="text-[10px] font-light text-muted-foreground/50 mb-1.5">hour of day</p>
              <Sparkline data={summary.patterns.hourHistogram} />
              <p className="text-[10px] font-light text-muted-foreground/50 mt-1">
                Peak {summary.patterns.peakHour ?? "—"}:00 · {Math.round(summary.patterns.afterHoursShare * 100)}% after hours
              </p>
            </div>
            <div>
              <p className="text-[10px] font-light text-muted-foreground/50 mb-1.5">day of week</p>
              <Sparkline data={summary.patterns.dayHistogram} labels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]} />
              <p className="text-[10px] font-light text-muted-foreground/50 mt-1">
                {Math.round(summary.patterns.questionRate * 100)}% ask a question · {Math.round(summary.patterns.emojiRate * 100)}% carry emoji
              </p>
            </div>
          </div>
          {summary.psych.markers.length > 0 && (
            <ul className="space-y-1 pt-1">
              {summary.psych.markers.map((m, i) => (
                <li key={i} className="text-[10px] font-extralight text-muted-foreground/70 flex gap-2">
                  <span className="text-foreground/40">◈</span> {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Correspondence rhythm ──────────────────────────────────────
          Only the marginal distributions are rendered. The corpus carries an
          hour histogram and a day histogram, not their joint distribution —
          drawing a 7×24 grid from two marginals would invent structure that
          was never observed. */}
      {summary && summary.patterns.sampleSize > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" aria-hidden /> correspondence rhythm
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-[9px] tracking-[0.18em] text-muted-foreground/40 font-light mb-1.5">by hour (local)</p>
              <div className="flex items-end gap-[2px] h-12">
                {summary.patterns.hourHistogram.map((v, h) => {
                  const peak = Math.max(1, ...summary.patterns.hourHistogram);
                  const off = h < 8 || h >= 18;
                  return (
                    <div
                      key={h}
                      title={`${String(h).padStart(2, "0")}:00 — ${v} message${v === 1 ? "" : "s"}${off ? " (outside working hours)" : ""}`}
                      className={`flex-1 rounded-t-[2px] ${off ? "bg-foreground/25" : "bg-foreground/55"}`}
                      style={{ height: `${Math.max(2, (v / peak) * 100)}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                {[0, 6, 12, 18, 23].map((h) => (
                  <span key={h} className="text-[8px] text-muted-foreground/30 font-light">{String(h).padStart(2, "0")}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.18em] text-muted-foreground/40 font-light mb-1.5">by weekday</p>
              <div className="flex items-end gap-1 h-9">
                {summary.patterns.dayHistogram.map((v, d) => {
                  const peak = Math.max(1, ...summary.patterns.dayHistogram);
                  return (
                    <div key={d} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        title={`${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]} — ${v} messages`}
                        className="w-full rounded-t-[2px] bg-foreground/45"
                        style={{ height: `${Math.max(2, (v / peak) * 100)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1 mt-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span key={i} className="flex-1 text-center text-[8px] text-muted-foreground/30 font-light">{d}</span>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] font-extralight text-muted-foreground/55 leading-relaxed">
            {summary.patterns.sampleSize} timed messages. Peak hour {summary.patterns.peakHour ?? "—"}:00.
            {" "}{Math.round(summary.patterns.afterHoursShare * 100)}% of traffic lands outside 08:00–18:00 — darker bars mark
            those hours. Hours with no bar are structurally silent: a message arriving there would be off-pattern.
          </p>
        </div>
      )}

      {/* ── Relationship lattice ───────────────────────────────────── */}
      {dossiers.filter((d) => d.total > 0).length >= 3 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Network className="h-3.5 w-3.5" aria-hidden /> relationship lattice
          </h3>
          <RelationGraph
            nodes={[
              { id: "__ego__", label: "you", ring: 0, cluster: 0, weight: 40 },
              ...dossiers
                .filter((d) => d.total > 0)
                .slice(0, 42)
                .map((d) => ({
                  id: d.key,
                  label: d.name,
                  ring: d.tier === "inner" ? 1 : d.tier === "active" ? 2 : 3,
                  cluster: Math.max(0, orgClusters.indexOf(d.organization || "unaffiliated")),
                  weight: d.total,
                })),
            ]}
            edges={dossiers
              .filter((d) => d.total > 0)
              .slice(0, 42)
              .map((d) => ({ from: "__ego__", to: d.key, weight: d.total }))}
            clusterNames={orgClusters}
          />
          <p className="text-[10px] font-extralight text-muted-foreground/55 leading-relaxed">
            rings are relationship tiers — inner, active, periphery — placed by measured volume, latency and recency.
            edge thickness is exchanged message count. adjacency on a ring means shared organisation, the only grouping
            the corpus can prove; no co-occurrence is inferred where none was observed.
          </p>
        </div>
      )}


      {/* ── Alerts ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
        <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> relationship alerts
        </h3>
        <div className="space-y-1.5">
          {alerts.length > 0 ? (
            alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-foreground/5 px-3 py-2">
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-[10px] font-extralight text-muted-foreground/80">
                  <span className="text-foreground/80">{a.name}</span> — {a.label}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-foreground/5 px-3 py-2">
              <Zap className="h-3 w-3 text-muted-foreground/30 shrink-0 mt-0.5" />
              <span className="text-[10px] font-extralight text-muted-foreground/60">
                {dossiers.length
                  ? "no overdue, one-way, or unread-heavy relationships in the current window."
                  : "a sweep would surface drift, one-way threads and unanswered mail. none has run on this device."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Roster ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Network className="h-4 w-4" aria-hidden /> identity ledger
          </h3>
          <div className="flex items-center gap-2">
            {dossiers.filter((d) => d.location).length > 0 && (
              <button
                onClick={() => {
                  setPendingContacts(
                    dossiers
                      .filter((d) => d.location)
                      .map((d) => ({ name: d.name, email: d.emails[0], location: d.location, organization: d.organization, source: "contact_intelligence" }))
                  );
                  navigate("/dashboard/asherin-adam");
                }}
                className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all"
              >
                <MapPin className="h-3 w-3" aria-hidden /> plot contacts
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search name, address, org, theme…"
                aria-label="search contacts"
                className="w-48 sm:w-64 rounded-lg border border-border/20 bg-foreground/5 pl-7 pr-2 py-1.5 text-[11px] font-light text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/30"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", "inner", "active", "periphery", "dormant", "archive"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              aria-pressed={tierFilter === t}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-light transition-colors ${
                tierFilter === t ? "bg-foreground/20 text-foreground" : "bg-foreground/5 text-muted-foreground/60 hover:bg-foreground/10"
              }`}
            >
              {t === "all" ? `all (${dossiers.length})` : `${TIER_LABEL[t]} (${summary?.tiers[t] ?? 0})`}
            </button>
          ))}
        </div>

        {loading && !dossiers.length ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-foreground/5 animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] font-extralight text-muted-foreground/60 py-6 text-center">
            {dossiers.length ? "no identity matches this filter." : "no dossiers on this device. a sweep builds them, and a sweep needs a connected account."}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {filtered.slice(0, limit).map((d) => {
                const open = openKey === d.key;
                return (
                  <div key={d.key} className="rounded-xl border border-border/20 bg-foreground/5 overflow-hidden">
                    <button
                      onClick={() => setOpenKey(open ? null : d.key)}
                      aria-expanded={open}
                      className="w-full p-3 flex items-center gap-3 text-left hover:bg-foreground/5 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-light text-foreground shrink-0 overflow-hidden">
                        {d.photo ? (
                          <img src={d.photo} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                        ) : (
                          d.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-light text-foreground truncate">{d.name}</span>
                          <span className="text-[9px] font-light text-muted-foreground/50 rounded px-1.5 py-0.5 bg-foreground/10 shrink-0">
                            {TIER_LABEL[d.tier]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground/50">
                          {d.emails[0] && <span className="truncate max-w-[180px]">{d.emails[0]}</span>}
                          {d.organization && <span className="truncate max-w-[120px]">{d.organization}</span>}
                          {d.total > 0 && <span>{d.total} msgs</span>}
                          <span>{fmtAgo(d.lastSeen)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extralight text-foreground tabular-nums">{d.importance}</p>
                        <p className="text-[9px] font-light text-muted-foreground/40">score</p>
                      </div>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>

                    {open && (
                      <div className="border-t border-border/20 p-4 space-y-4 bg-background/20">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <Metric label="Inbound" value={d.inbound} />
                          <Metric label="Outbound" value={d.outbound} />
                          <Metric label="Threads" value={d.threads} />
                          <Metric label="Unread" value={d.unread} />
                          <Metric label="Cadence" value={d.cadenceDays} suffix="d" />
                          <Metric label="Silent" value={d.silenceDays} suffix="d" />
                          <Metric label="Your reply" value={d.myReplyLatencyHours} suffix="h" />
                          <Metric label="Their reply" value={d.theirReplyLatencyHours} suffix="h" />
                        </div>

                        {(d.emails.length > 1 || d.phones.length > 0 || d.location || d.birthday || d.urls.length > 0) && (
                          <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t border-border/10">
                            <Metric label="All addresses" value={d.emails.join(", ")} />
                            <Metric label="Phones" value={d.phones.join(", ")} />
                            <Metric label="Location" value={d.location} />
                            <Metric label="Birthday" value={d.birthday} />
                            {d.urls.length > 0 && <Metric label="Links" value={d.urls.join(", ")} />}
                            <Metric label="Channels" value={d.channels.join(" · ")} />
                          </div>
                        )}

                        {d.psych.evidence !== "none" ? (
                          <div className="space-y-2 pt-1 border-t border-border/10">
                            <p className="text-[10px] font-light text-muted-foreground/50 flex items-center gap-1.5">
                              <Brain className="h-3 w-3" /> Language profile · {d.psych.evidence} evidence ({d.psych.tokens} tokens)
                            </p>
                            <div className="grid sm:grid-cols-2 gap-x-5 gap-y-2">
                              <Bar label="Warmth" value={d.psych.composites.warmth} />
                              <Bar label="Assertiveness" value={d.psych.composites.assertiveness} />
                              <Bar label="Formality" value={d.psych.composites.formalityIndex} />
                              <Bar label="Pressure" value={d.psych.composites.stressLoad} />
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] font-extralight text-muted-foreground/50 pt-1 border-t border-border/10">
                            No message text in the current window — language profiling withheld rather than guessed.
                          </p>
                        )}

                        {d.patterns.sampleSize > 0 && (
                          <div className="grid sm:grid-cols-2 gap-4 pt-1 border-t border-border/10">
                            <div>
                              <p className="text-[10px] font-light text-muted-foreground/50 mb-1.5 flex items-center gap-1.5">
                                <Clock className="h-3 w-3" /> When they land
                              </p>
                              <Sparkline data={d.patterns.hourHistogram} />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-light text-muted-foreground/50 flex items-center gap-1.5">
                                <MessageSquare className="h-3 w-3" /> Text patterns
                              </p>
                              <p className="text-[10px] font-extralight text-muted-foreground/70">
                                {Math.round(d.patterns.questionRate * 100)}% questions ·{" "}
                                {Math.round(d.patterns.exclamationRate * 100)}% exclamation ·{" "}
                                {Math.round(d.patterns.emojiRate * 100)}% emoji ·{" "}
                                {Math.round(d.patterns.afterHoursShare * 100)}% after hours
                              </p>
                              {d.patterns.topSubjectTokens.length > 0 && (
                                <p className="text-[10px] font-extralight text-muted-foreground/60">
                                  Themes: {d.patterns.topSubjectTokens.map((t) => t.token).join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="pt-1 border-t border-border/10 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setReportKey(d.key)}
                            disabled={!corpus}
                            className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-colors disabled:opacity-40"
                          >
                            <ScrollText className="h-3 w-3" aria-hidden /> deep report
                          </button>
                          {d.location && (
                            <button
                              onClick={() => {
                                setPendingContacts([{ name: d.name, email: d.emails[0], location: d.location, organization: d.organization, source: "contact_intelligence" }]);
                                navigate("/dashboard/asherin-adam");
                              }}
                              className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-colors"
                            >
                              <MapPin className="h-3 w-3" aria-hidden /> plot on map
                            </button>
                          )}
                          {!corpus && (
                            <p className="text-[10px] font-extralight text-muted-foreground/50 mt-1.5 w-full">
                              the report reads raw traffic, which this session has not loaded. a sweep would load it.
                            </p>
                          )}
                        </div>

                        {d.signals.length > 0 && (
                          <ul className="space-y-1 pt-1 border-t border-border/10">
                            {d.signals.map((s, i) => (
                              <li key={i} className="text-[10px] font-extralight text-muted-foreground/70 flex gap-2">
                                <span className={s.kind === "warn" ? "text-amber-400" : s.kind === "ok" ? "text-emerald-400" : "text-foreground/40"}>◉</span>
                                {s.label}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {filtered.length > limit && (
              <button
                onClick={() => setLimit((l) => l + 60)}
                className="w-full rounded-lg bg-foreground/5 py-2 text-[10px] font-light text-muted-foreground hover:bg-foreground/10 transition-colors"
              >
                show more — {filtered.length - limit} remaining
              </button>
            )}
          </>
        )}
      </div>

      {report && (
        <ReportViewer name={report.name} text={report.text} images={report.images} onClose={() => setReportKey(null)} />
      )}

      <p className="text-[10px] font-extralight text-muted-foreground/40 flex items-start gap-1.5 px-1">
        <Activity className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
        derived from google people records and gmail metadata only. language markers are lexical counts over
        subjects and snippets, reported with their evidence weight — not clinical assessments. absent evidence
        prints as “—”, never as zero.
      </p>
    </div>
  );
};

export default ContactIntelligence;
