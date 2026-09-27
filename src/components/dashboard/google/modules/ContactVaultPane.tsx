import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, Play, ChevronRight, Trash2, Download,
  Link2, ShieldQuestion, Users, Power,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * CONTACT VAULT — automated correspondent intelligence.
 *
 * Hop 1  people who actually write to you (metadata-derived, machine senders removed)
 * Hop 2  people the hop-1 sweep exposed, held as dormant stubs until promoted
 * Hop 3  nodes reachable from two different hop-1 subjects — closed triangles
 *
 * The sweep is resumable: enqueue writes the queue, process drains it in
 * time-bounded batches, and both are idempotent, so a lost tab never
 * duplicates or loses work.
 */

type Row = {
  id: string;
  subject_name: string;
  subject_email: string | null;
  hop: number;
  via: string | null;
  channel: string | null;
  status: string;
  relationship: any;
  summary: string | null;
  confidence: number;
  priority: number;
  error_message: string | null;
  built_at: string | null;
  updated_at: string;
};

type CrossLink = { label: string; kind: string; viaA: string; viaB: string; extraVia: string[]; strength: number };

async function callVault<T = any>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in first.");
  const { data, error } = await supabase.functions.invoke("mesh-vault", { body: { action, ...extra } });
  if (error) {
    let detail = error.message;
    try { detail = (await (error as any).context?.text?.()) ?? detail; } catch { /* keep */ }
    throw new Error(detail);
  }
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return data as T;
}

const STATUS_TONE: Record<string, string> = {
  ready: "border-foreground/30 text-foreground",
  queued: "border-border/30 text-muted-foreground/70",
  building: "border-foreground/20 text-foreground/70",
  linked: "border-border/20 text-muted-foreground/60",
  failed: "border-destructive/40 text-destructive",
  skipped: "border-border/20 text-muted-foreground/40",
};

const Badge = ({ children, tone = "" }: { children: React.ReactNode; tone?: string }) => (
  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extralight ${tone || "border-border/25 text-muted-foreground/70"}`}>
    {children}
  </span>
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border/30 bg-card/20 p-5 space-y-4">{children}</div>
);

/** Plain-text intelligence artifact, House of Asher house style. */
function renderReport(row: Row, doc: any): string {
  const W = 78;
  const rule = (c = "─") => c.repeat(W);
  const L: string[] = [];
  L.push(rule("═"));
  L.push("HOUSE OF ASHER — MESH CONTACT DOSSIER".padStart(Math.floor((W + 37) / 2)));
  L.push(rule("═"));
  L.push(`SUBJECT      : ${row.subject_name}`);
  if (row.subject_email) L.push(`ADDRESS      : ${row.subject_email}`);
  L.push(`HOP          : ${row.hop}${row.via ? ` (via ${row.via})` : ""}`);
  L.push(`CHANNEL      : ${CHANNEL_LABEL[row.channel ?? ""] ?? "address book"}`);
  const ids: string[] = Array.isArray(row.relationship?.identifiers) ? row.relationship.identifiers : [];
  if (ids.length) L.push(`IDENTIFIERS  : ${ids.join(", ")}`);
  L.push(`CONFIDENCE   : ${row.confidence}/100`);
  L.push(`BUILT        : ${row.built_at ?? "—"}`);
  if (doc?.jurisdiction) L.push(`JURISDICTION : ${doc.jurisdiction}`);
  L.push(rule());

  const rel = row.relationship ?? {};
  if (rel.email) {
    L.push("SECTION 1 — RELATIONSHIP TO YOU");
    L.push(`  Tier              : ${rel.tier}`);
    L.push(`  Messages          : ${(rel.received ?? 0) + (rel.sent ?? 0)} (in ${rel.received ?? 0} / out ${rel.sent ?? 0})`);
    L.push(`  Reciprocity       : ${rel.reciprocity}`);
    L.push(`  Median reply      : ${rel.medianReplyMinutes ?? "—"} min`);
    L.push(`  First / last seen : ${(rel.firstSeen ?? "").slice(0, 10)} → ${(rel.lastSeen ?? "").slice(0, 10)}`);
    L.push(`  Dormant           : ${rel.dormantDays ?? "—"} days`);
    L.push(rule());
  }

  L.push("SECTION 2 — RESOLVED IDENTITY");
  const identity = doc?.identity ?? {};
  if (!Object.keys(identity).length) L.push("  No fields resolved above the identity threshold.");
  for (const [label, facts] of Object.entries(identity) as Array<[string, any[]]>) {
    L.push(`  ${label}:`);
    for (const f of facts) {
      L.push(`    - ${f.value}  [${f.confidence}, ${f.independentDomains} domain(s)${f.authoritative ? ", authoritative" : ""}]`);
      for (const s of (f.sources ?? []).slice(0, 2)) L.push(`        ${s.url}`);
    }
  }
  L.push(rule());

  L.push("SECTION 3 — HOP 1 (DIRECT ASSOCIATES)");
  if (!doc?.hop1?.length) L.push("  none");
  for (const n of doc?.hop1 ?? []) L.push(`  - [${n.kind}] ${n.label}  (${n.confidence}, ${n.independentDomains} domain(s))`);
  L.push(rule());

  L.push("SECTION 4 — HOP 2 (ASSOCIATES OF ASSOCIATES)");
  if (!doc?.hop2?.length) L.push("  none");
  for (const n of doc?.hop2 ?? []) L.push(`  - [${n.kind}] ${n.label}${n.via ? `  via ${n.via}` : ""}  (${n.confidence})`);
  L.push(rule());

  L.push("SECTION 5 — HOP 3 (CLOSED TRIANGLES)");
  if (!doc?.hop3?.length) L.push("  n/a — no node was reachable by two independent paths.");
  for (const c of doc?.hop3 ?? []) L.push(`  - ${c.node}  ← ${c.viaA} + ${c.viaB}  (strength ${c.strength})`);
  L.push(rule());

  L.push("SECTION 6 — COLLECTION METRICS");
  const m = doc?.metrics ?? {};
  L.push(`  Documents parsed  : ${m.documentsParsed ?? 0}`);
  L.push(`  Hits / queries    : ${m.totalHits ?? 0} / ${m.queriesRun ?? 0}`);
  L.push(`  Independent domains: ${m.independentDomains ?? 0} (authoritative ${m.authoritativeSources ?? 0})`);
  L.push(`  Identity rejects  : ${m.rejectedIdentityHits ?? 0}`);
  L.push(`  Sweep time        : ${Math.round((m.elapsedMs ?? 0) / 1000)}s`);
  L.push(rule());

  if (doc?.reverse) {
    L.push("SECTION 6b — REVERSE-IDENTIFIER PASS");
    L.push(`  Seed              : ${doc.reverse.identifier}`);
    L.push(`  Facts recovered   : ${doc.reverse.factsAdded}`);
    L.push(`  Hits              : ${doc.reverse.hits}`);
    if (doc.reverse.timedOut) L.push("  Note              : pass hit its time budget");
    if (doc.reverse.error) L.push(`  Note              : ${doc.reverse.error}`);
    L.push(rule());
  }

  L.push("SECTION 7 — NAMED GAPS");
  if (!doc?.gaps?.length) L.push("  none declared");
  for (const g of doc?.gaps ?? []) L.push(`  - ${g}`);
  L.push(rule());

  L.push("SECTION 8 — SOURCES");
  (doc?.sources ?? []).forEach((s: any, i: number) => L.push(`  [${i + 1}] (${s.bucket}) ${s.domain} — ${s.url}`));
  L.push(rule("═"));
  L.push("#houseofasher #zia");
  L.push("Derived from open sources and your own mail metadata. Verify before acting.");
  L.push(rule("═"));
  return L.join("\n");
}

const AUTOPILOT_KEY = "hoa.vault.autopilot";
/** How often the sentinel re-checks every inbound channel while the pane is open. */
const SENTINEL_INTERVAL_MS = 10 * 60_000;

const CHANNEL_LABEL: Record<string, string> = {
  inbound_mail: "inbound mail",
  calendar: "calendar",
  phone_book: "phone",
  address_book: "address book",
};

const ContactVaultPane = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [crossLinks, setCrossLinks] = useState<CrossLink[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<{ row: Row; doc: any } | null>(null);
  const [hint, setHint] = useState("");
  const [autoDrain, setAutoDrain] = useState(false);
  const [autopilot, setAutopilot] = useState(
    () => (typeof localStorage === "undefined" ? true : localStorage.getItem(AUTOPILOT_KEY) !== "off"),
  );
  const [autoNote, setAutoNote] = useState<string | null>(null);
  /** Fires the first sweep once per mount — never once per render. */
  const kicked = useRef(false);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const [list, st] = await Promise.all([
        callVault<{ dossiers: Row[]; crossLinks: CrossLink[] }>("vault_list"),
        callVault("vault_status"),
      ]);
      setRows(list.dossiers ?? []);
      setCrossLinks(list.crossLinks ?? []);
      setStatus(st);
      return st as any;
    } catch (e) {
      setErr((e as Error).message);
      setRows([]);
      return null;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    localStorage.setItem(AUTOPILOT_KEY, autopilot ? "on" : "off");
  }, [autopilot]);

  /**
   * Autopilot: the moment a Google grant exists, harvest mail + address book
   * and start building dossiers one entity at a time. Guarded three ways —
   * a mount-scoped ref, a persisted opt-out, and the server's own idempotent
   * upsert — so a re-render, a second tab, or a refresh never double-sweeps.
   */
  useEffect(() => {
    if (!autopilot || kicked.current || status === null || err) return;
    kicked.current = true;
    let cancelled = false;

    (async () => {
      let st = status;
      const neverRun = !st?.lastRun;
      if (neverRun) {
        setAutoNote("Reading correspondence and contacts…");
        try {
          const r = await callVault<any>("vault_enqueue", { days: 365, max: 25, contacts_max: 40 });
          if (cancelled) return;
          setAutoNote(
            `${r.queued} subject(s) queued — ${r.messagesAnalyzed} messages, ${r.contactsRead} contacts.`,
          );
          st = await load();
        } catch (e) {
          if (cancelled) return;
          const msg = (e as Error).message;
          // No grant yet is the normal cold-start state, not a failure.
          setAutoNote(
            /tier_required|Tier 2|Sign in/i.test(msg)
              ? "Connect a Google account with Read access to start the automatic sweep."
              : msg.slice(0, 180),
          );
          return;
        }
      }
      if (cancelled) return;

      // Sentinel: watermark-driven watch over mail, calendar and phone cards.
      // Runs on every mount, cold start or not — a contact that arrived while
      // the tab was closed must not wait for a manual scan.
      try {
        const sent = await callVault<any>("vault_sentinel", { max: 40 });
        if (cancelled) return;
        lastSweepRef.current = Date.now();
        if (sent?.degraded) {
          setAutoNote("Sentinel ran degraded — a channel did not respond; the window stays open.");
        }
        if (sent.queued > 0) {
          setAutoNote(`Sentinel found ${sent.queued} new contact(s) — building dossiers…`);
          st = await load();
        }
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message;
        if (!/tier_required/i.test(msg)) setAutoNote(msg.slice(0, 180));
      }

      if (cancelled) return;
      if ((st?.census?.queued ?? 0) > 0) setAutoDrain(true);
      else setAutoNote((n) => n ?? null);
    })();

    return () => { cancelled = true; };
  }, [autopilot, status, err, load]);

  // Resumable drain: one subject per tick, stops on empty queue or on error.
  useEffect(() => {
    if (!autoDrain) return;
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        try {
          const r = await callVault<{ done: boolean; remaining: number; built: number; processed: any[] }>(
            "vault_process",
            { batch: 1, location_hint: hint },
          );
          if (cancelled) return;
          const name = r.processed?.[0]?.name;
          if (name) setAutoNote(`Built ${name} · ${r.remaining} remaining`);
          await load();
          if (r.done || r.remaining === 0) {
            setAutoNote("Vault sweep complete.");
            toast.success("Vault sweep complete.");
            break;
          }
        } catch (e) {
          if (!cancelled) {
            const msg = (e as Error).message.slice(0, 200);
            setAutoNote(msg);
            toast.error(msg);
          }
          break;
        }
      }
      if (!cancelled) setAutoDrain(false);
    })();
    return () => { cancelled = true; };
  }, [autoDrain, hint, load]);

  /**
   * Standing watch. The interval itself must not depend on `autoDrain`, or
   * every drain toggle tears the timer down and restarts the ten minutes —
   * a long drain would then postpone the watch indefinitely. State the tick
   * needs is read through refs, so the timer is installed once per autopilot
   * toggle and never rebuilt by unrelated renders. A hidden tab is skipped,
   * and the elapsed time is checked on return so a backgrounded tab catches
   * up immediately instead of waiting out a fresh interval.
   */
  const drainRef = useRef(autoDrain);
  const lastSweepRef = useRef(Date.now());
  useEffect(() => { drainRef.current = autoDrain; }, [autoDrain]);

  useEffect(() => {
    if (!autopilot) return;
    let cancelled = false;

    const sweep = async () => {
      if (cancelled || drainRef.current || document.hidden) return;
      if (Date.now() - lastSweepRef.current < SENTINEL_INTERVAL_MS) return;
      lastSweepRef.current = Date.now();
      try {
        const sent = await callVault<any>("vault_sentinel", { max: 40 });
        if (cancelled) return;
        if (sent?.degraded) {
          // The watermark was held, so nothing is lost — say so rather than
          // reporting a clean sweep that did not happen.
          setAutoNote("Sentinel ran degraded — a channel did not respond; the window stays open.");
        }
        if (!sent?.queued) return;
        setAutoNote(`Sentinel found ${sent.queued} new contact(s) — building dossiers…`);
        await load();
        setAutoDrain(true);
      } catch { /* transient — the next tick retries */ }
    };

    const id = window.setInterval(() => { void sweep(); }, 60_000);
    const onVisible = () => { if (!document.hidden) void sweep(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autopilot, load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (e) { toast.error((e as Error).message.slice(0, 220)); }
    finally { setBusy(null); }
  };

  // QUERYABLE CONFIDENCE MATRIX.
  // The index used to be a fixed list in insertion order, so the two questions
  // an analyst actually asks it — "which subjects are weakly established?" and
  // "which of these hundreds is the one I mean?" — could only be answered by
  // scrolling. Query, floor and sort are applied before grouping so both hop
  // bands stay consistent with the same filter.
  const [q, setQ] = useState("");
  const [minConf, setMinConf] = useState(0);
  const [sortBy, setSortBy] = useState<"confidence" | "name" | "status">("confidence");

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pass = (r: Row) => {
      // A queued row has no confidence yet; excluding it on a floor would hide
      // work in flight rather than filter weak evidence, so only ready rows
      // are subject to the floor.
      if (minConf > 0 && r.status === "ready" && Number(r.confidence ?? 0) < minConf) return false;
      if (minConf > 0 && r.status !== "ready") return false;
      if (!needle) return true;
      return (
        r.subject_name.toLowerCase().includes(needle) ||
        (r.subject_email ?? "").toLowerCase().includes(needle) ||
        (r.summary ?? "").toLowerCase().includes(needle)
      );
    };
    const order = (a: Row, b: Row) => {
      if (sortBy === "name") return a.subject_name.localeCompare(b.subject_name);
      if (sortBy === "status") return String(a.status).localeCompare(String(b.status));
      return Number(b.confidence ?? 0) - Number(a.confidence ?? 0);
    };
    const all = (rows ?? []).filter(pass);
    return {
      hop1: all.filter((r) => r.hop === 1).sort(order),
      hop2: all.filter((r) => r.hop === 2).sort(order),
      matched: all.length,
      total: (rows ?? []).length,
    };
  }, [rows, q, minConf, sortBy]);


  const openDossier = (row: Row) =>
    run(`open:${row.id}`, async () => {
      const r = await callVault<{ dossier: any }>("vault_get", { id: row.id });
      setOpen({ row: r.dossier, doc: r.dossier.dossier ?? {} });
    });

  const download = (row: Row, doc: any) => {
    const text = renderReport(row, doc);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HOA_DOSSIER_${row.subject_name.replace(/\s+/g, "_").toUpperCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const queued = status?.census?.queued ?? 0;

  return (
    <div className="space-y-4">
      <Shell>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-xs font-light tracking-wide text-foreground">Contact Vault</h4>
            <p className="text-[11px] font-extralight text-muted-foreground/70 mt-1 max-w-xl">
              The moment a Google account is connected, every correspondent and every card in
              your address book — names, addresses, phone numbers — becomes a standing dossier,
              built one entity at a time and expanded along three bounded hops. Metadata in,
              sourced intelligence out; no message bodies are stored.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              className={`text-xs font-extralight ${autopilot ? "text-foreground" : "text-muted-foreground/60"}`}
              aria-pressed={autopilot}
              onClick={() => setAutopilot((v) => !v)}
            >
              <Power className="h-3.5 w-3.5 mr-1.5" /> Autopilot {autopilot ? "on" : "off"}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs font-extralight" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-extralight text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> {err}
          </div>
        )}

        {autoNote && !err && (
          <div
            className="flex items-center gap-2 rounded-xl border border-border/25 bg-background/30 px-3 py-2 text-[11px] font-extralight text-muted-foreground/80"
            aria-live="polite"
          >
            {autoDrain && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
            {autoNote}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ["Hop 1", status?.hops?.["1"] ?? 0],
            ["Hop 2", status?.hops?.["2"] ?? 0],
            ["Ready", status?.census?.ready ?? 0],
            ["Queued", queued],
            ["Failed", status?.census?.failed ?? 0],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">{l}</div>
              <div className="text-sm font-light text-foreground mt-0.5">{String(v)}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={hint} onChange={(e) => setHint(e.target.value)}
            placeholder="Jurisdiction hint (optional) — e.g. Cape Coral Florida"
            className="h-8 max-w-xs text-xs font-extralight"
          />
          <Button
            size="sm" variant="outline" className="text-xs font-extralight"
            disabled={busy === "enq" || autoDrain}
            onClick={() => run("enq", async () => {
              const r = await callVault<any>("vault_enqueue", { days: 365, max: 25, contacts_max: 40 });
              toast.success(
                `${r.queued} subject(s) queued — ${r.messagesAnalyzed} messages, ${r.contactsRead ?? 0} contacts.`,
              );
              await load();
            })}
          >
            {busy === "enq" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Users className="h-3.5 w-3.5 mr-1.5" />}
            Scan mail + contacts
          </Button>
          <Button
            size="sm" variant="outline" className="text-xs font-extralight"
            disabled={autoDrain || queued === 0}
            onClick={() => setAutoDrain(true)}
          >
            {autoDrain ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            {autoDrain ? "Sweeping…" : `Build dossiers (${queued})`}
          </Button>
          {autoDrain && (
            <Button size="sm" variant="ghost" className="text-xs font-extralight" onClick={() => setAutoDrain(false)}>
              Stop
            </Button>
          )}
        </div>
      </Shell>

      {/* Hop-3 cross-links across the whole vault */}
      {crossLinks.length > 0 && (
        <Shell>
          <h4 className="text-xs font-light tracking-wide text-foreground flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Hop 3 — closed triangles in your network
          </h4>
          <div className="space-y-1.5">
            {crossLinks.slice(0, 12).map((c) => (
              <div key={c.label} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2 text-xs font-extralight">
                <span className="text-foreground">{c.label}</span>
                <span className="text-muted-foreground/60"> — reachable via {c.viaA} + {c.viaB}
                  {c.extraVia.length ? ` +${c.extraVia.length} more` : ""} · strength {c.strength}</span>
              </div>
            ))}
          </div>
        </Shell>
      )}

      {/* Index */}
      <Shell>
        {rows === null && <div className="h-24 rounded-xl bg-foreground/[0.03] animate-pulse" aria-live="polite" />}
        {rows !== null && rows.length === 0 && !err && (
          <div className="text-xs font-extralight text-muted-foreground/70">
            The vault is empty. Run <span className="text-foreground">Scan mail + contacts</span> to
            rank the humans in your mail and address book, then build their dossiers.
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="vault-q">Filter subjects</label>
            <input
              id="vault-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by name, address or summary"
              className="h-8 min-w-[13rem] flex-1 rounded-lg border border-border/25 bg-background/40 px-3 text-[11px] font-extralight text-foreground placeholder:text-muted-foreground/40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
            />
            <label className="sr-only" htmlFor="vault-floor">Minimum confidence</label>
            <select
              id="vault-floor"
              value={minConf}
              onChange={(e) => setMinConf(Number(e.target.value))}
              className="h-8 rounded-lg border border-border/25 bg-background/40 px-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80"
            >
              <option value={0}>All confidence</option>
              <option value={40}>≥ 40 established</option>
              <option value={70}>≥ 70 corroborated</option>
              <option value={85}>≥ 85 authoritative</option>
            </select>
            <label className="sr-only" htmlFor="vault-sort">Sort order</label>
            <select
              id="vault-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-8 rounded-lg border border-border/25 bg-background/40 px-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80"
            >
              <option value="confidence">Sort: confidence</option>
              <option value="name">Sort: name</option>
              <option value="status">Sort: status</option>
            </select>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50" aria-live="polite">
              {grouped.matched}/{grouped.total}
            </span>
          </div>
        )}

        {rows !== null && rows.length > 0 && grouped.matched === 0 && (
          <div className="text-xs font-extralight text-muted-foreground/70">
            No subject in the vault meets this query. Lower the confidence floor or clear the filter —
            an empty result here is a filter outcome, not an absence of intelligence.
          </div>
        )}


        {(["hop1", "hop2"] as const).map((k) =>
          grouped[k].length ? (
            <div key={k} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">
                {k === "hop1" ? "Hop 1 — your correspondents" : "Hop 2 — surfaced by the sweep"}
              </div>
              {grouped[k].map((r) => (
                <div key={r.id} className="rounded-xl border border-border/20 bg-background/30 px-3 py-2 flex items-center gap-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => (r.status === "ready" ? void openDossier(r) : toast.info(
                      r.status === "linked" ? "Promote this node to sweep it." : `Status: ${r.status}`,
                    ))}
                  >
                    <div className="text-xs font-light text-foreground truncate">
                      {r.subject_name}
                      {r.subject_email && <span className="text-muted-foreground/50"> · {r.subject_email}</span>}
                    </div>
                    <div className="text-[10px] font-extralight text-muted-foreground/60 truncate">
                      {r.summary ?? (r.via ? `via ${r.via}` : r.error_message ?? "awaiting sweep")}
                    </div>
                  </button>
                  {r.channel && r.channel !== "address_book" && (
                    <Badge>{CHANNEL_LABEL[r.channel] ?? r.channel}</Badge>
                  )}
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  {r.status === "ready" && <Badge>{r.confidence}/100</Badge>}
                  {r.status === "linked" && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-[10px] font-extralight"
                      onClick={() => run(`pr:${r.id}`, async () => { await callVault("vault_promote", { id: r.id }); await load(); })}
                    >
                      <ShieldQuestion className="h-3 w-3 mr-1" /> Sweep
                    </Button>
                  )}
                  {r.status === "failed" && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-[10px] font-extralight"
                      onClick={() => run(`rf:${r.id}`, async () => { await callVault("vault_refresh", { id: r.id }); await load(); })}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                    aria-label={`Remove ${r.subject_name}`}
                    onClick={() => run(`rm:${r.id}`, async () => { await callVault("vault_remove", { id: r.id }); await load(); })}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground/50" />
                  </Button>
                  {r.status === "ready" && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </div>
              ))}
            </div>
          ) : null,
        )}
      </Shell>

      {/* Detail */}
      {open && (
        <Shell>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-light text-foreground">{open.row.subject_name}</h4>
              <div className="text-[10px] font-extralight text-muted-foreground/60">
                Hop {open.row.hop} · confidence {open.row.confidence}/100 · {open.doc?.jurisdiction || "jurisdiction unresolved"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-xs font-extralight" onClick={() => download(open.row, open.doc)}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> .txt report
              </Button>
              <Button size="sm" variant="ghost" className="text-xs font-extralight" onClick={() => setOpen(null)}>Close</Button>
            </div>
          </div>

          {Object.entries(open.doc?.identity ?? {}).map(([label, facts]: [string, any]) => (
            <div key={label} className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">{label}</div>
              {facts.map((f: any, i: number) => (
                <div key={i} className="rounded-xl border border-border/20 bg-background/30 px-3 py-1.5 text-xs font-extralight">
                  <span className="text-foreground">{f.value}</span>
                  <span className="text-muted-foreground/50"> · {f.confidence} · {f.independentDomains} domain(s){f.authoritative ? " · authoritative" : ""}</span>
                </div>
              ))}
            </div>
          ))}

          {(["hop1", "hop2"] as const).map((k) => (
            (open.doc?.[k]?.length ?? 0) > 0 && (
              <div key={k} className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">
                  {k === "hop1" ? "Hop 1 associates" : "Hop 2 associates"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {open.doc[k].map((n: any, i: number) => (
                    <Badge key={i}>{n.label} · {n.kind}{n.via ? ` · via ${n.via}` : ""}</Badge>
                  ))}
                </div>
              </div>
            )
          ))}

          {(open.doc?.gaps?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">Named gaps</div>
              {open.doc.gaps.map((g: string, i: number) => (
                <div key={i} className="text-[11px] font-extralight text-muted-foreground/70">— {g}</div>
              ))}
            </div>
          )}

          {(open.doc?.sources?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight">
                Sources ({open.doc.sources.length})
              </div>
              <div className="max-h-48 overflow-auto space-y-1 pr-1">
                {open.doc.sources.map((s: any, i: number) => (
                  <a
                    key={i} href={s.url} target="_blank" rel="noreferrer noopener"
                    className="block text-[11px] font-extralight text-muted-foreground/70 hover:text-foreground truncate"
                  >
                    [{i + 1}] ({s.bucket}) {s.domain} — {s.title || s.url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </Shell>
      )}
    </div>
  );
};

export default ContactVaultPane;
