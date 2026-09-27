// ═══════════════════════════════════════════════════════════════════════════
// POSTMARK — Email Metadata Forensics (operator surface)
// ---------------------------------------------------------------------------
// Reads the envelope, never the letter. Every figure on this screen is derived
// from RFC 5322 headers the receiving MTA already stamped, so each claim can
// be traced back to the exact header line that produced it.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldAlert, ShieldCheck, Server, Globe2, Clock, Fingerprint, RefreshCw,
  ChevronDown, ChevronRight, Lock, Unlock, AlertTriangle, Search, Route,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { runDriftAlarm, type DriftResult, type DriftBreak } from "@/lib/cloudIntel/driftAlarm";
import { toast } from "sonner";

type Verdict = "clean" | "watch" | "suspect" | "hostile";

interface Flag { code: string; severity: "critical" | "high" | "medium" | "low" | "info"; title: string; detail: string; evidence: string }
interface Geo { ip: string; country: string | null; countryCode: string | null; city: string | null; asn: string | null; org: string | null; isProxy: boolean | null }
interface Hop { index: number; from: string | null; by: string | null; ip: string | null; proto: string | null; tls: boolean; at: string | null; delaySec: number | null; geo?: Geo | null }
interface Report {
  id: string; subject: string; date: string | null; internalDate: number | null;
  fromName: string | null; fromAddress: string | null; fromDomain: string | null;
  replyTo: string | null; returnPath: string | null;
  messageIdDomain: string | null; dkimDomain: string | null; dkimSelector: string | null;
  spf: string; dkim: string; dmarc: string; arcPresent: boolean;
  aligned: { returnPath: boolean | null; dkim: boolean | null; messageId: boolean | null };
  hops: Hop[]; hopCount: number; originIp: string | null; originGeo: Geo | null; transitSeconds: number | null;
  mailer: string | null; mailerFamily: string | null; esp: string | null;
  senderUtcOffsetMin: number | null; clockSkewSec: number | null;
  isBulk: boolean; isAutomated: boolean; listId: string | null;
  flags: Flag[]; riskScore: number; verdict: Verdict;
  _account?: string;
}
interface Aggregate {
  analyzed: number;
  auth: { spfPass: number; dkimPass: number; dmarcPass: number; fullyAuthenticated: number; unauthenticated: number };
  verdicts: Record<Verdict, number>;
  topFlags: Array<{ code: string; title: string; count: number; severity: Flag["severity"] }>;
  senderDomains: Array<{ domain: string; count: number; authPassRate: number; worstVerdict: Verdict }>;
  countries: Array<{ code: string; country: string; count: number }>;
  networks: Array<{ asn: string; org: string; count: number }>;
  mailers: Array<{ family: string; count: number }>;
  platforms: Array<{ esp: string; count: number }>;
  timezones: Array<{ offsetMin: number; label: string; count: number }>;
  encryption: { tlsAllHops: number; anyPlaintext: number; noChain: number };
  medianTransitSec: number | null;
}

const SCOPES = [
  { id: "recent", label: "Recent inbound", q: "in:anywhere -in:chats", depth: 60 },
  { id: "unauth", label: "Authentication failures", q: "-in:chats (dmarc=fail OR spf=fail OR is:spam)", depth: 60 },
  { id: "money", label: "Financial pressure", q: "-in:chats (invoice OR payment OR wire OR payroll OR bank OR refund)", depth: 60 },
  { id: "security", label: "Account & security mail", q: "-in:chats (password OR \"security alert\" OR verify OR unauthorized OR sign-in)", depth: 60 },
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

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const dur = (s: number | null) => (s == null ? "—" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);

const EmailForensics = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<typeof SCOPES[number]["id"]>("recent");
  const [reports, setReports] = useState<Report[]>([]);
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [ranAt, setRanAt] = useState<number | null>(null);
  const [drift, setDrift] = useState<DriftResult | null>(null);
  const [driftBusy, setDriftBusy] = useState(false);

  const run = useCallback(async (scopeId: string) => {
    const s = SCOPES.find((x) => x.id === scopeId) ?? SCOPES[0];
    setLoading(true);
    try {
      const data = await fetchGoogleData("gmail_forensics", { maxResults: s.depth, q: s.q, geo: true });
      const msgs: Report[] = data?.messages || [];
      setReports(msgs);
      setAgg(data?.aggregate || null);
      setRanAt(Date.now());
      if (!msgs.length) toast.info("No messages matched this scope.");

      // Baseline comparison runs after the sweep lands and never blocks it:
      // a drift-store failure must not cost the operator their forensics.
      if (msgs.length) {
        setDriftBusy(true);
        void runDriftAlarm(msgs)
          .then((res) => {
            setDrift(res);
            const critical = res.breaks.filter((b) => b.severity === "critical").length;
            if (critical) toast.warning(`${critical} sender baseline break${critical === 1 ? "" : "s"} detected.`);
          })
          .finally(() => setDriftBusy(false));
      }
    } catch (e: unknown) {
      console.error("gmail_forensics failed:", e);
      toast.error(e instanceof Error ? e.message : "Header sweep failed.");
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => { if (isConnected) run(scope); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isConnected, scope]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return reports.filter((r) => {
      if (onlyFlagged && r.verdict === "clean") return false;
      if (!needle) return true;
      return [r.fromAddress, r.fromDomain, r.subject, r.originIp, r.esp, r.originGeo?.country]
        .some((v) => (v || "").toLowerCase().includes(needle));
    });
  }, [reports, filter, onlyFlagged]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-8 text-center">
        <Fingerprint className="mx-auto mb-3 h-8 w-8 text-foreground/40" />
        <p className="text-sm text-foreground/70">Connect a mailbox to read message envelopes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Control strip ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
              <Fingerprint className="h-5 w-5 text-foreground/70" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-wide">POSTMARK · Envelope Forensics</h3>
              <p className="text-xs text-foreground/55 max-w-xl leading-relaxed">
                Relay chain, authentication verdicts, origin network and composing client — read from headers only.
                Message bodies are never fetched.
              </p>
            </div>
          </div>
          <button
            onClick={() => run(scope)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border/30 px-3 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Reading envelopes…" : "Re-sweep"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                scope === s.id ? "border-foreground/60 bg-foreground/10" : "border-border/30 hover:bg-foreground/5"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by sender, domain, IP, country…"
              aria-label="Filter forensic results"
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

      {/* ── Loading skeleton (never a bare spinner over an empty screen) ── */}
      {loading && !reports.length && (
        <div className="space-y-2" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border/15 bg-foreground/[0.03]" />
          ))}
        </div>
      )}

      {/* ── Drift alarm ───────────────────────────────────────────────────
          Per-message grading cannot see a compromised-but-legitimate sender.
          This panel is the only place that answers "has this domain ever
          behaved this way before?" — and it pushes to the device when not. */}
      {(driftBusy || drift) && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5" aria-live="polite">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-foreground/70" />
              <h4 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">Sender baseline drift</h4>
            </div>
            {drift && (
              <span className="text-[11px] text-foreground/45">
                {drift.domainsTracked} domain{drift.domainsTracked === 1 ? "" : "s"} compared ·{" "}
                {drift.domainsInObservation} still establishing ·{" "}
                {drift.notified} alert{drift.notified === 1 ? "" : "s"} pushed
              </span>
            )}
          </div>

          {driftBusy && !drift && (
            <div className="h-14 animate-pulse rounded-xl border border-border/15 bg-foreground/[0.03]" />
          )}

          {drift?.error && (
            <p className="text-xs text-foreground/60">
              Baselines unavailable this run ({drift.error}). Forensics above are unaffected.
            </p>
          )}

          {drift && !drift.error && drift.breaks.length === 0 && (
            <p className="text-xs text-foreground/55 leading-relaxed">
              No sender broke its established pattern. Networks, countries, platforms and authentication rates all match
              prior history for every domain with enough recorded traffic to judge.
            </p>
          )}

          <div className="space-y-2">
            {drift?.breaks.map((b: DriftBreak, i: number) => (
              <div
                key={`${b.domain}-${b.kind}-${b.observed}-${i}`}
                className={`rounded-xl border p-3 ${
                  b.severity === "critical"
                    ? "border-foreground/60 bg-foreground/10"
                    : b.severity === "notable"
                      ? "border-foreground/35"
                      : "border-border/25"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-foreground/70" />
                  <span className="text-xs font-semibold">{b.domain}</span>
                  <span className="rounded border border-border/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-foreground/60">
                    {b.kind.replace(/-/g, " ")}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-foreground/50">{b.severity}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-foreground/70">{b.statement}</p>
                <p className="mt-1.5 text-[10px] text-foreground/45">
                  Baseline: {b.baseline} · Observed: {b.observed} · {b.messageIds.length} message
                  {b.messageIds.length === 1 ? "" : "s"} in this sweep
                </p>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* ── Aggregate posture ─────────────────────────────────────────── */}
      {agg && agg.analyzed > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card icon={ShieldCheck} label="Fully authenticated" value={`${pct(agg.auth.fullyAuthenticated, agg.analyzed)}%`}
            note={`${agg.auth.fullyAuthenticated} of ${agg.analyzed} passed SPF, DKIM and DMARC`} />
          <Card icon={ShieldAlert} label="Unauthenticated" value={String(agg.auth.unauthenticated)}
            note="No passing SPF and no passing DKIM — nothing binds these to their claimed domain" />
          <Card icon={agg.encryption.anyPlaintext ? Unlock : Lock} label="Plaintext delivery" value={String(agg.encryption.anyPlaintext)}
            note={`${agg.encryption.tlsAllHops} encrypted end-to-end across every hop`} />
          <Card icon={Clock} label="Median transit" value={dur(agg.medianTransitSec)}
            note="Time from the origin relay to your mailbox" />
        </div>
      )}

      {agg && agg.analyzed > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Origin geography" icon={Globe2} empty="No relay IP could be located.">
            {agg.countries.map((c) => (
              <Row key={c.code} left={`${c.country}`} right={String(c.count)} />
            ))}
          </Panel>
          <Panel title="Origin networks" icon={Server} empty="No autonomous system resolved.">
            {agg.networks.map((n) => (
              <Row key={n.asn} left={n.org} right={n.asn} />
            ))}
          </Panel>
          <Panel title="Sender local time" icon={Clock} empty="No Date header offsets present.">
            {agg.timezones.map((t) => (
              <Row key={t.offsetMin} left={t.label} right={`${t.count}`} />
            ))}
          </Panel>
          <Panel title="Sending platforms" icon={Route} empty="No platform fingerprint matched.">
            {agg.platforms.map((p) => <Row key={p.esp} left={p.esp} right={String(p.count)} />)}
          </Panel>
          <Panel title="Composing clients" icon={Fingerprint} empty="No mailer headers exposed.">
            {agg.mailers.map((m) => <Row key={m.family} left={m.family} right={String(m.count)} />)}
          </Panel>
          <Panel title="Recurring findings" icon={AlertTriangle} empty="No findings across this sweep.">
            {agg.topFlags.map((f) => (
              <Row key={f.code} left={`${SEV_MARK[f.severity]} ${f.title}`} right={String(f.count)} />
            ))}
          </Panel>
        </div>
      )}

      {/* ── Sender domain reputation ──────────────────────────────────── */}
      {agg && agg.senderDomains.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/60">Sender domains</h4>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {agg.senderDomains.map((d) => (
              <div key={d.domain} className="flex items-center justify-between rounded-lg border border-border/15 px-3 py-2 text-xs">
                <span className="truncate">{d.domain}</span>
                <span className="flex items-center gap-2 text-foreground/60">
                  <span>{d.count} msg</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${VERDICT_STYLE[d.worstVerdict]}`}>
                    {Math.round(d.authPassRate * 100)}% auth
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Message ledger ────────────────────────────────────────────── */}
      {!loading && !reports.length && (
        <div className="rounded-2xl border border-border/20 bg-card/30 p-8 text-center text-sm text-foreground/60">
          Nothing matched this scope. Try a different scope or re-sweep.
        </div>
      )}

      <div className="space-y-2">
        {visible.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-md">
              <button
                onClick={() => setOpen(isOpen ? null : r.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.03]"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-foreground/50" /> : <ChevronRight className="h-4 w-4 shrink-0 text-foreground/50" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{r.fromName || r.fromAddress || "unknown sender"}</span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${VERDICT_STYLE[r.verdict]}`}>
                      {r.verdict} · {r.riskScore}
                    </span>
                  </div>
                  <p className="truncate text-xs text-foreground/55">{r.subject}</p>
                </div>
                <div className="hidden shrink-0 items-center gap-3 text-[11px] text-foreground/50 sm:flex">
                  <span>{r.originGeo?.countryCode || "—"}</span>
                  <span>{r.hopCount} hops</span>
                  <span>{r.spf}/{r.dkim}/{r.dmarc}</span>
                </div>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border/15 px-4 py-4 text-xs">
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    <Fact k="From" v={r.fromAddress} />
                    <Fact k="Return-Path" v={r.returnPath} bad={r.aligned.returnPath === false} />
                    <Fact k="Reply-To" v={r.replyTo} />
                    <Fact k="Message-ID domain" v={r.messageIdDomain} bad={r.aligned.messageId === false} />
                    <Fact k="DKIM d=" v={r.dkimDomain ? `${r.dkimDomain}${r.dkimSelector ? ` (s=${r.dkimSelector})` : ""}` : null} bad={r.aligned.dkim === false} />
                    <Fact k="Auth" v={`SPF ${r.spf} · DKIM ${r.dkim} · DMARC ${r.dmarc}${r.arcPresent ? " · ARC sealed" : ""}`} />
                    <Fact k="Origin" v={r.originIp ? `${r.originIp}${r.originGeo ? ` — ${[r.originGeo.city, r.originGeo.country].filter(Boolean).join(", ")}` : ""}` : null} />
                    <Fact k="Network" v={r.originGeo?.org ? `${r.originGeo.org}${r.originGeo.asn ? ` (${r.originGeo.asn})` : ""}` : null} />
                    <Fact k="Platform" v={r.esp} />
                    <Fact k="Composed with" v={r.mailerFamily ? `${r.mailerFamily}${r.mailer && r.mailer !== r.mailerFamily ? ` — ${r.mailer}` : ""}` : r.mailer} />
                    <Fact k="Sender clock" v={r.senderUtcOffsetMin != null ? `${r.senderUtcOffsetMin >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(r.senderUtcOffsetMin) / 60)).padStart(2, "0")}:${String(Math.abs(r.senderUtcOffsetMin) % 60).padStart(2, "0")}${r.clockSkewSec != null ? ` · skew ${r.clockSkewSec}s` : ""}` : null} />
                    <Fact k="Class" v={[r.isBulk ? "bulk" : "person-to-person", r.isAutomated ? "automated" : null, r.listId ? `list ${r.listId}` : null].filter(Boolean).join(" · ")} />
                  </div>

                  {/* Relay chain */}
                  <div>
                    <p className="mb-1.5 font-semibold uppercase tracking-wider text-foreground/55">Relay chain ({r.hopCount})</p>
                    {r.hopCount === 0 ? (
                      <p className="text-foreground/45">No Received headers — internally generated or API-injected.</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {r.hops.map((h) => (
                          <li key={h.index} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-border/15 px-2.5 py-1.5">
                            <span className="text-foreground/40">{h.index === 0 ? "origin" : `hop ${h.index}`}</span>
                            <span className="font-mono text-[11px]">{h.from || "?"}</span>
                            {h.ip && <span className="font-mono text-[11px] text-foreground/60">[{h.ip}]</span>}
                            {h.geo && <span className="text-foreground/55">{[h.geo.city, h.geo.countryCode].filter(Boolean).join(", ")}{h.geo.org ? ` · ${h.geo.org}` : ""}</span>}
                            <span className="text-foreground/40">→ {h.by || "?"}</span>
                            <span className={h.tls ? "text-foreground/60" : "text-foreground"}>{h.tls ? "TLS" : "cleartext"}</span>
                            {h.delaySec != null && <span className="text-foreground/40">+{dur(h.delaySec)}</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  {/* Findings with evidence */}
                  {r.flags.length > 0 && (
                    <div>
                      <p className="mb-1.5 font-semibold uppercase tracking-wider text-foreground/55">Findings</p>
                      <div className="space-y-1.5">
                        {r.flags.map((f) => (
                          <div key={f.code} className="rounded-lg border border-border/15 px-2.5 py-2">
                            <p className="font-medium">{SEV_MARK[f.severity]} {f.title}</p>
                            <p className="text-foreground/65 leading-relaxed">{f.detail}</p>
                            <p className="mt-1 truncate font-mono text-[10px] text-foreground/40">{f.evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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

const Panel = ({ title, icon: Icon, children, empty }: { title: string; icon: React.ElementType; children: React.ReactNode; empty: string }) => {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4">
      <div className="mb-2 flex items-center gap-2 text-foreground/60">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
      </div>
      {has ? <div className="space-y-1">{children}</div> : <p className="text-xs text-foreground/45">{empty}</p>}
    </div>
  );
};

const Row = ({ left, right }: { left: string; right: string }) => (
  <div className="flex items-center justify-between gap-2 text-xs">
    <span className="truncate text-foreground/75">{left}</span>
    <span className="shrink-0 tabular-nums text-foreground/50">{right}</span>
  </div>
);

const Fact = ({ k, v, bad }: { k: string; v: string | null | undefined; bad?: boolean }) => (
  <div className="flex gap-2">
    <span className="shrink-0 text-foreground/45">{k}</span>
    <span className={`min-w-0 truncate font-mono text-[11px] ${bad ? "text-foreground underline decoration-dotted underline-offset-2" : "text-foreground/75"}`}>
      {v || "—"}
    </span>
  </div>
);

export default EmailForensics;
