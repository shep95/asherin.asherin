// ═══════════════════════════════════════════════════════════════════════════
// VOICEPRINT — Google Voice envelope forensics (operator surface)
// ---------------------------------------------------------------------------
// Reads the Voice notification envelope, never the message body. Two layers are
// on screen at once: whether the notification itself is genuine (SPF/DKIM/DMARC
// aligned to google.com, relay chain, mirror latency), and what the Voice
// addressing says about the correspondent (line class, NANP attribution,
// cadence, reciprocity).
//
// Two honesty rules are enforced visually, because the underlying channel is
// partially blind:
//   1. Hours are stated in the OPERATOR'S timezone, resolved from their own
//      Voice line — and the basis for that resolution is printed on screen.
//      Google stamps these mirrors in UTC; an uncorrected hour would libel
//      ordinary afternoon traffic as a 3am contact.
//   2. Google only mirrors a reply into the mailbox when the operator answered
//      by email. Replies typed in the Voice app never appear. When the sweep
//      sees no outbound at all, reciprocity is shown as "not observable" rather
//      than 0% — and "never answered" findings are suppressed upstream.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PhoneCall, Voicemail, MessageSquare, PhoneMissed, ShieldCheck, ShieldAlert,
  Clock, RefreshCw, ChevronDown, ChevronRight, Search, Radio, Globe2, AlertTriangle,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { toast } from "sonner";

type Verdict = "clean" | "watch" | "suspect" | "hostile";
type Kind = "text" | "voicemail" | "missed" | "call" | "other";
type LineClass = "mobile" | "landline" | "shortcode" | "tollfree" | "premium" | "international" | "unknown";

interface Flag { code: string; severity: "critical" | "high" | "medium" | "low" | "info"; title: string; detail: string; evidence: string }
interface PeerLine { key: string; e164: string | null; display: string | null; name: string | null; lineClass: LineClass; region: string | null; tzLabel: string | null; countryCode: string | null }
interface Envelope {
  id: string; subject: string; at: string | null; internalDate: number | null;
  kind: Kind; direction: "in" | "out";
  operatorLine: string | null; peer: PeerLine;
  spf: string; dkim: string; dmarc: string; alignedToGoogle: boolean;
  localHour: number | null; transitSeconds: number | null;
  sizeEstimate: number | null; hasAttachment: boolean;
  flags: Flag[]; riskScore: number; verdict: Verdict;
  _account?: string;
}
interface Peer {
  key: string; e164: string | null; name: string | null; lineClass: LineClass;
  region: string | null; tzLabel: string | null;
  total: number; inbound: number; outbound: number; kinds: Record<Kind, number>;
  firstSeen: string | null; lastSeen: string | null; spanDays: number | null;
  medianGapSec: number | null; maxBurst: number; nightShare: number;
  reciprocity: number | null; attachmentCount: number; totalBytes: number;
  flags: Flag[]; riskScore: number; verdict: Verdict;
}
interface Aggregate {
  analyzed: number;
  window: { first: string | null; last: string | null };
  kinds: Record<Kind, number>;
  directions: { inbound: number; outbound: number };
  peers: number;
  lineClasses: Array<{ lineClass: LineClass; count: number; peers: number }>;
  regions: Array<{ region: string; count: number; peers: number }>;
  hours: number[];
  clockFrame: { zone: string | null; basis: string; evidence: string };
  outboundVisible: boolean;
  operatorLines: Array<{ line: string; count: number }>;
  auth: { authentic: number; unauthenticated: number; forged: number };
  medianTransitSec: number | null;
  churnClusters: Array<{ prefix: string; region: string | null; numbers: string[]; messages: number }>;
  topFlags: Array<{ code: string; title: string; severity: Flag["severity"]; count: number }>;
}

const WINDOWS = [
  { id: 30, label: "30 days", depth: 120 },
  { id: 90, label: "90 days", depth: 160 },
  { id: 180, label: "6 months", depth: 200 },
] as const;

const VERDICT_STYLE: Record<Verdict, string> = {
  clean: "border-foreground/15 text-foreground/60",
  watch: "border-foreground/30 text-foreground/80",
  suspect: "border-foreground/50 text-foreground",
  hostile: "border-foreground text-foreground bg-foreground/10",
};
const SEV_MARK: Record<Flag["severity"], string> = {
  critical: "◆◆◆", high: "◆◆", medium: "◆", low: "◇", info: "·",
};
const KIND_ICON: Record<Kind, React.ElementType> = {
  text: MessageSquare, voicemail: Voicemail, missed: PhoneMissed, call: PhoneCall, other: Radio,
};
const BASIS_TEXT: Record<string, string> = {
  operator_line: "your own Voice line",
  peer_majority: "the majority of your correspondents",
  utc_fallback: "no local frame — shown in UTC",
};

const dur = (s: number | null) => (s == null ? "—" : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86400).toFixed(1)}d`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const bytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

const VoiceForensics = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<number>(90);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<Envelope[]>([]);
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [ranAt, setRanAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards state writes after unmount — a 6-month sweep outlives a tab change.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async (windowDays: number) => {
    const w = WINDOWS.find((x) => x.id === windowDays) ?? WINDOWS[1];
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoogleData("voice_forensics", { days: w.id, maxResults: w.depth });
      if (!alive.current) return;
      setPeers(data?.peers || []);
      setMessages(data?.messages || []);
      setAgg(data?.aggregate || null);
      setRanAt(Date.now());
      if (!(data?.messages || []).length) toast.info("No Google Voice traffic in this window.");
    } catch (e: unknown) {
      if (!alive.current) return;
      console.error("voice_forensics failed:", e);
      const msg = e instanceof Error ? e.message : "Voice sweep failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => { if (isConnected) run(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isConnected, days]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return peers.filter((p) => {
      if (onlyFlagged && p.verdict === "clean") return false;
      if (!needle) return true;
      return [p.e164, p.name, p.region, p.lineClass].some((v) => (v || "").toLowerCase().includes(needle));
    });
  }, [peers, filter, onlyFlagged]);

  const peakHour = useMemo(() => {
    if (!agg?.hours?.length) return null;
    const max = Math.max(...agg.hours);
    return max > 0 ? agg.hours.indexOf(max) : null;
  }, [agg]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-8 text-center">
        <Voicemail className="mx-auto mb-3 h-8 w-8 text-foreground/40" />
        <p className="text-sm text-foreground/70">Connect the mailbox that receives your Google Voice notifications to read the Voice envelope.</p>
      </div>
    );
  }

  const hourMax = agg?.hours?.length ? Math.max(1, ...agg.hours) : 1;

  return (
    <div className="space-y-6">
      {/* ── Control strip ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
              <Voicemail className="h-5 w-5 text-foreground/70" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-wide">VOICEPRINT · Voice Envelope Forensics</h3>
              <p className="text-xs text-foreground/55 max-w-xl leading-relaxed">
                Line attribution, authentication of the notification itself, contact cadence and burst behaviour —
                read from Voice envelopes only. Message content and voicemail audio are never fetched.
              </p>
            </div>
          </div>
          <button
            onClick={() => run(days)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border/30 px-3 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Reading envelopes…" : "Re-sweep"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setDays(w.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                days === w.id ? "border-foreground/60 bg-foreground/10" : "border-border/30 hover:bg-foreground/5"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by number, name, region, line class…"
              aria-label="Filter correspondents"
              className="w-full rounded-lg border border-border/30 bg-transparent py-1.5 pl-8 pr-3 text-xs outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
            />
          </div>
          <button
            onClick={() => setOnlyFlagged((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${onlyFlagged ? "border-foreground/60 bg-foreground/10" : "border-border/30 hover:bg-foreground/5"}`}
          >
            Flagged only
          </button>
          {ranAt && <span className="text-[11px] text-foreground/40">swept {new Date(ranAt).toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* ── Loading skeleton ──────────────────────────────────────────── */}
      {loading && !peers.length && (
        <div className="space-y-2" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border/15 bg-foreground/[0.03]" />
          ))}
        </div>
      )}

      {/* ── Error state with retry ────────────────────────────────────── */}
      {error && !loading && (
        <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-md p-5" role="alert">
          <div className="flex items-center gap-2 text-foreground/80">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Sweep failed</span>
          </div>
          <p className="mt-1.5 text-xs text-foreground/60">{error}</p>
          <button onClick={() => run(days)} className="mt-3 rounded-lg border border-border/30 px-3 py-1.5 text-xs hover:bg-foreground/5">
            Try again
          </button>
        </div>
      )}

      {/* DEPENDENCY, STATED. This desk reads Voice envelopes out of the
          mailbox mirror. When Voice notification forwarding is off, or the
          connected account is not the one Voice delivers to, the sweep returns
          clean and empty — which reads identically to "you have no call
          traffic". That silence was the single largest honesty gap in this
          module, so the dependency and the working fallback are now published
          on the surface rather than left to inference. */}
      {!loading && (error || (ranAt !== null && messages.length === 0)) && (
        <div className="rounded-2xl border border-border/25 bg-card/20 backdrop-blur-md p-5 space-y-2">
          <div className="flex items-center gap-2 text-foreground/80">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Mirror dependency — degraded collection
            </span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/60">
            {error
              ? "The envelope sweep did not complete, so this desk is reporting nothing rather than reporting a clean line. An empty VOICEPRINT is a collection state, not a finding."
              : "No Voice envelope reached the connected mailbox in this window. That is a mirror condition, not proof of no call traffic: Voice only lands here when notification forwarding is enabled on the account Voice delivers to."}
          </p>
          <ul className="ml-4 list-disc space-y-1 text-xs font-extralight text-foreground/55">
            <li>Verify Voice notification forwarding is enabled and pointed at a connected account.</li>
            <li>
              Fallback in place: <span className="text-foreground/80">SIGNAL — Phone Message Intelligence</span> reads
              on-device Android SMS/MMS independently of this mirror, and <span className="text-foreground/80">LATTICE</span>{" "}
              still carries per-correspondent cadence from mail traffic.
            </li>
            <li>Until one of those paths reports, treat this desk's silence as unmeasured, not as clean.</li>
          </ul>
        </div>
      )}



      {agg && agg.analyzed > 0 && (
        <>
          {/* ── Provenance banner: whose clock, and what we cannot see ──── */}
          <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4 space-y-2">
            <div className="flex items-center gap-2 text-foreground/60">
              <Clock className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Frame of reference</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/65">
              Hours on this screen are stated in{" "}
              <span className="text-foreground">{agg.clockFrame.zone ?? "UTC"}</span>, resolved from{" "}
              {BASIS_TEXT[agg.clockFrame.basis] ?? agg.clockFrame.basis}
              {agg.clockFrame.evidence ? ` (${agg.clockFrame.evidence})` : ""}. Google stamps Voice mirrors in UTC,
              so the raw envelope carries no local time of its own.
            </p>
            {!agg.outboundVisible && (
              <p className="text-xs leading-relaxed text-foreground/65">
                <span className="text-foreground">No outbound traffic is observable in this window.</span>{" "}
                Google mirrors a reply into the mailbox only when you answer by email — replies typed in the Voice app
                are invisible here. Reciprocity is therefore reported as not observable, and “never answered” findings
                are withheld rather than guessed.
              </p>
            )}
          </div>

          {/* ── Aggregate posture ──────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card icon={Radio} label="Envelopes read" value={String(agg.analyzed)}
              note={`${agg.peers} distinct correspondents · ${day(agg.window.first)} → ${day(agg.window.last)}`} />
            <Card icon={agg.auth.forged ? ShieldAlert : ShieldCheck} label="Notification authenticity"
              value={`${agg.analyzed ? Math.round((agg.auth.authentic / agg.analyzed) * 100) : 0}%`}
              note={`${agg.auth.authentic} aligned to google.com · ${agg.auth.unauthenticated} unauthenticated · ${agg.auth.forged} forged`} />
            <Card icon={Clock} label="Peak contact hour"
              value={peakHour == null ? "—" : `${String(peakHour).padStart(2, "0")}:00`}
              note={`Median mirror latency ${dur(agg.medianTransitSec)} from switch to mailbox`} />
            <Card icon={MessageSquare} label="Traffic mix"
              value={`${agg.kinds.text} / ${agg.kinds.voicemail + agg.kinds.missed + agg.kinds.call}`}
              note={`Texts vs. call events — ${agg.directions.inbound} inbound${agg.outboundVisible ? `, ${agg.directions.outbound} outbound` : ""}`} />
          </div>

          {/* ── Hour distribution in the operator's own clock ───────────── */}
          <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4">
            <div className="mb-3 flex items-center gap-2 text-foreground/60">
              <Clock className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Contact by hour · {agg.clockFrame.zone ?? "UTC"}
              </span>
            </div>
            <div className="flex h-24 items-end gap-[3px]" role="img"
              aria-label={`Contact volume by hour in ${agg.clockFrame.zone ?? "UTC"}`}>
              {agg.hours.map((n, h) => (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-sm ${h < 5 ? "bg-foreground/50" : "bg-foreground/20"}`}
                    style={{ height: `${Math.max(n ? 4 : 1, (n / hourMax) * 76)}px` }}
                    title={`${String(h).padStart(2, "0")}:00 — ${n} contact${n === 1 ? "" : "s"}`}
                  />
                  {h % 6 === 0 && <span className="text-[9px] tabular-nums text-foreground/35">{h}</span>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-foreground/45">
              Darker bars mark 00:00–05:00, the band that raises an overnight-contact finding.
            </p>
          </div>

          {/* ── Standing findings across the corpus ─────────────────────── */}
          {agg.topFlags.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground/60">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Recurring findings</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {agg.topFlags.map((f) => (
                  <span key={f.code} className="rounded-lg border border-border/30 px-2.5 py-1 text-[11px] text-foreground/70">
                    <span className="mr-1.5 text-foreground/50">{SEV_MARK[f.severity]}</span>
                    {f.title} · <span className="tabular-nums">{f.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Number-churn clusters ───────────────────────────────────── */}
          {agg.churnClusters.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground/60">
                <Globe2 className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Number churn</span>
              </div>
              <p className="mb-2 text-[11px] text-foreground/45">
                Several distinct numbers from one carrier prefix — the signature of a sender rotating lines.
              </p>
              <div className="space-y-1">
                {agg.churnClusters.map((c) => (
                  <div key={c.prefix} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-foreground/75">
                      {c.prefix}xxx {c.region ? <span className="text-foreground/45">· {c.region}</span> : null}
                    </span>
                    <span className="tabular-nums text-foreground/55">
                      {c.numbers.length} numbers · {c.messages} messages
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Correspondents ─────────────────────────────────────────────── */}
      {!loading && !error && peers.length === 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-8 text-center">
          <PhoneCall className="mx-auto mb-3 h-7 w-7 text-foreground/35" />
          <p className="text-sm text-foreground/65">No Google Voice envelopes in the last {days} days.</p>
          <p className="mt-1 text-xs text-foreground/45">Widen the window, or confirm Voice notifications are delivered to this mailbox.</p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((p) => {
            const isOpen = open === p.key;
            const worstKind = (Object.entries(p.kinds) as Array<[Kind, number]>)
              .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
            const KindIcon = KIND_ICON[worstKind] ?? Radio;
            return (
              <div key={p.key} className={`rounded-xl border bg-card/30 backdrop-blur-md ${VERDICT_STYLE[p.verdict]}`}>
                <button
                  onClick={() => setOpen(isOpen ? null : p.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-3 text-left focus-visible:ring-1 focus-visible:ring-foreground/40 rounded-xl"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-foreground/40" /> : <ChevronRight className="h-4 w-4 shrink-0 text-foreground/40" />}
                  <KindIcon className="h-4 w-4 shrink-0 text-foreground/50" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm text-foreground/90">{p.name || p.e164 || p.key}</span>
                      {p.name && p.e164 && <span className="text-[11px] tabular-nums text-foreground/45">{p.e164}</span>}
                      <span className="text-[11px] text-foreground/40">
                        {p.lineClass}{p.region ? ` · ${p.region}` : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-foreground/50">
                      {p.total} messages · {p.inbound} in{p.reciprocity == null ? "" : ` / ${p.outbound} out`} ·
                      {" "}last {day(p.lastSeen)}
                      {p.medianGapSec != null ? ` · every ${dur(p.medianGapSec)}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-foreground/60">{p.riskScore}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-border/15 px-3 pb-3 pt-2 space-y-3">
                    <div className="grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
                      <Row k="Line class" v={p.lineClass} />
                      <Row k="Attribution" v={[p.region, p.tzLabel].filter(Boolean).join(" · ") || "—"} />
                      <Row k="First seen" v={day(p.firstSeen)} />
                      <Row k="Relationship span" v={p.spanDays == null ? "—" : `${p.spanDays} days`} />
                      <Row k="Median gap" v={dur(p.medianGapSec)} />
                      <Row k="Largest burst" v={`${p.maxBurst} in 10 min`} />
                      <Row k="Overnight share" v={`${Math.round(p.nightShare * 100)}%`} />
                      <Row k="Reciprocity" v={p.reciprocity == null ? "not observable on this channel" : `${Math.round(p.reciprocity * 100)}%`} />
                      <Row k="Attachments" v={`${p.attachmentCount} · ${bytes(p.totalBytes)}`} />
                      <Row k="Message kinds" v={(Object.entries(p.kinds) as Array<[Kind, number]>).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ") || "—"} />
                    </div>

                    {p.flags.length > 0 ? (
                      <div className="space-y-1.5">
                        {p.flags.map((f, i) => (
                          <div key={`${f.code}-${i}`} className="rounded-lg border border-border/20 p-2">
                            <div className="flex items-baseline gap-2">
                              <span className="text-foreground/50">{SEV_MARK[f.severity]}</span>
                              <span className="text-xs text-foreground/85">{f.title}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/55">{f.detail}</p>
                            {f.evidence && <p className="mt-0.5 truncate font-mono text-[10px] text-foreground/35">{f.evidence}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-foreground/45">No findings — ordinary contact pattern on an attributable line.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {peers.length > 0 && visible.length === 0 && (
        <p className="rounded-xl border border-border/20 bg-card/20 p-4 text-center text-xs text-foreground/50">
          No correspondent matches this filter. Clear the search or turn off “Flagged only”.
        </p>
      )}

      {messages.length > 0 && (
        <p className="text-[11px] text-foreground/35">
          {messages.length} envelopes analysed across {agg?.operatorLines.length ?? 0} Voice line
          {(agg?.operatorLines.length ?? 0) === 1 ? "" : "s"}
          {agg?.operatorLines.length ? ` (${agg.operatorLines.map((l) => l.line).join(", ")})` : ""}.
        </p>
      )}
    </div>
  );
};

const Card = ({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note: string }) => (
  <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4">
    <div className="flex items-center gap-2 text-foreground/60">
      <Icon className="h-4 w-4" />
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
    </div>
    <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 text-[11px] leading-relaxed text-foreground/50">{note}</p>
  </div>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-foreground/45">{k}</span>
    <span className="truncate text-right text-foreground/75">{v}</span>
  </div>
);

export default VoiceForensics;
