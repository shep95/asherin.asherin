// ─────────────────────────────────────────────────────────────────────────────
// asherinx.eng — walking hub journal + public-index search.
// The laptop collects. This page never asks location, camera, or any permission.
// Place = IP/city from the box. Radios = what this box already hears. Sees ≠ joins.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Loader2, ExternalLink, Search, Activity, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { emitPull } from "@/lib/connect/emitPull";

type Action = "query" | "classify" | "extract" | "origin" | "identifier" | "fold" | "buffer";

interface Hit {
  site: string;
  title: string;
  url: string;
  snippet?: string;
  genesis?: string[];
}

interface SiteOutcome {
  site: string;
  status: "ok" | "empty" | "skip" | "fail";
  reason?: string;
  hits: Hit[];
  took_ms: number;
}

interface QueryPayload {
  query: string;
  classification: { selector: string; domain: string; kind: string };
  hits: Hit[];
  sites: SiteOutcome[];
  unsure: string[];
  took_ms: number;
  grouped: Record<string, Hit[]>;
  depth: "basic" | "full";
}

interface Emission {
  kind?: string;
  seen?: boolean;
  asherinx_joined?: boolean;
  label?: string;
  ssid?: string;
  channel?: string;
  band?: string;
  freq_mhz?: number;
  radio?: string;
  auth?: string;
  signal?: string;
  relation?: string;
  ip?: string;
  rssi?: number;
}

interface Place {
  ip?: string;
  city?: string;
  region?: string;
  zip?: string;
  country?: string;
  lat?: number;
  lon?: number;
  address?: string;
  local_ipv4s?: string[];
  isp?: string;
}

interface LogRow {
  ts: string;
  source: "box" | "browser";
  place: Place;
  counts?: { wifi?: number; arp?: number; ssdp?: number; ble?: number };
  emissions?: Emission[];
}

const LOG_KEY = "asherinx.eng.area-log";
const BOX = "http://127.0.0.1:8768";
// The walking hub is a plain-http loopback service. A page served over https
// cannot reach it — the browser blocks it as mixed content before the request
// leaves. Say so instead of throwing a network error every pulse.
const BOX_REACHABLE = typeof window !== "undefined" && window.location.protocol === "http:";

const ACTIONS: { id: Action; label: string; hint: string; pro?: boolean }[] = [
  { id: "query", label: "query", hint: "ask the public indexes" },
  { id: "classify", label: "classify", hint: "which pack this lands in" },
  { id: "extract", label: "extract", hint: "read one public url" },
  { id: "fold", label: "fold", hint: "compact the answer into a digest" },
  { id: "origin", label: "origin", hint: "provenance of one artefact", pro: true },
  { id: "identifier", label: "identifier", hint: "sweep one selector", pro: true },
  { id: "buffer", label: "buffer", hint: "your short retention shelf", pro: true },
];

const SITE_LABEL: Record<string, string> = {
  wayback: "wayback machine",
  wikipedia: "wikipedia",
  ddg_instant: "duckduckgo",
  hn: "hacker news",
  github: "github",
  nvd: "nvd",
  cisa_kev: "cisa kev",
  openalex: "openalex",
  arxiv: "arxiv",
  crossref: "crossref",
  gdelt: "gdelt",
  urlscan: "urlscan",
  wikidata: "wikidata",
  courtlistener: "courtlistener",
  sec_efts: "sec edgar",
  pypi: "pypi",
  npm: "npm",
  pubmed: "pubmed",
};

const PLACEHOLDER: Record<Action, string> = {
  query: "ask the public record",
  classify: "type a query to see which pack it lands in",
  extract: "https://…",
  fold: "a query to fold",
  origin: "https://… link to an artefact",
  identifier: "an email, handle, phone or domain",
  buffer: "press run to list your shelf",
};

function loadLog(): LogRow[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveLog(rows: LogRow[]) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(0, 400)));
  } catch {
    /* ignore */
  }
}

async function ipPlace(): Promise<Place> {
  const r = await fetch("https://ip-api.com/json/?fields=status,query,city,regionName,country,zip,lat,lon,isp");
  const d = await r.json();
  const city = d.city || "";
  const region = d.regionName || "";
  const zip = d.zip || "";
  const country = d.country || "";
  return {
    ip: d.query,
    city,
    region,
    zip,
    country,
    lat: d.lat,
    lon: d.lon,
    isp: d.isp,
    address: [city, region, zip, country].filter(Boolean).join(", ") || undefined,
  };
}

const AsherinxEngView = () => {
  const isV2 = useIsV2();
  const { toast } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [action, setAction] = useState<Action>("query");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryPayload | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSites, setOpenSites] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [logging, setLogging] = useState("starting");
  const [boxLive, setBoxLive] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    setRows(loadLog());
    let stop = false;

    const pulse = async () => {
      if (stop) return;
      let place: Place = {};
      try {
        place = await ipPlace();
      } catch {
        place = {};
      }
      let companion: { ok?: boolean; rows?: Array<Record<string, unknown>> } | null = null;
      try {
        if (!BOX_REACHABLE) throw new Error("blocked over https");
        const r = await fetch(`${BOX}/log?n=12`, { mode: "cors", signal: AbortSignal.timeout(1500) });
        if (r.ok) companion = await r.json();
      } catch {
        companion = null;
      }
      const boxOn = !!(companion && companion.ok !== false && Array.isArray(companion.rows));
      setBoxLive(boxOn);
      setLogging(boxOn ? "this box · walking hub" : "place/IP · wifi when this box hub is up");
      const latest = boxOn ? (companion?.rows?.[0] as Record<string, unknown> | undefined) : undefined;
      const row: LogRow = {
        ts: (latest?.ts as string) || new Date().toISOString(),
        source: boxOn ? "box" : "browser",
        place: (latest?.place as Place) || place,
        counts: (latest?.counts as LogRow["counts"]) || undefined,
        emissions: (latest?.emissions as Emission[]) || [],
      };
      setRows((prev) => {
        const head = prev[0];
        if (head && head.ts === row.ts && head.source === row.source) return prev;
        const next = [row, ...prev].slice(0, 400);
        saveLog(next);
        return next;
      });
      void emitPull({
        organ: "ghost",
        capability: "asherinx.area-log",
        fromSurface: "asherinx-eng",
        status: "ok",
        quote: boxOn ? "area log tick · this box" : "area log tick · browser place",
      });
    };

    void pulse();
    const id = window.setInterval(() => void pulse(), 20000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  const run = useCallback(async () => {
    const text = q.trim();
    if (action !== "buffer" && !text) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setBusy(true);
    setError(null);
    if (action === "query" || action === "fold") setResult(null);
    setRaw(null);

    const started = Date.now();
    try {
      const { data, error: fnError } = await supabase.functions.invoke("asherinx-engine", {
        body: {
          action,
          query: text,
          url: action === "extract" || action === "origin" ? text : undefined,
        },
      });
      if (ctrl.signal.aborted) return;
      if (fnError) throw new Error(fnError.message || "the engine did not answer.");
      if ((data as { error?: string })?.error) throw new Error(String((data as { error: string }).error));

      if (action === "query") {
        const payload = data as QueryPayload;
        setResult(payload);
        setOpenSites(Object.fromEntries(Object.keys(payload.grouped || {}).map((s) => [s, true])));
      } else {
        setRaw(data);
        if (action === "fold" && (data as { result?: QueryPayload })?.result) {
          setResult((data as { result: QueryPayload }).result);
        }
      }

      void emitPull({
        organ: "ghost",
        capability: `asherinx.${action}`,
        fromSurface: "asherinx-eng",
        status: "ok",
        latencyMs: Date.now() - started,
        quote: text || action,
      });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "the engine did not answer.";
      setError(msg);
      void emitPull({
        organ: "ghost",
        capability: `asherinx.${action}`,
        fromSurface: "asherinx-eng",
        status: "fail",
        latencyMs: Date.now() - started,
        quote: msg,
      });
      toast({ title: "asherinx.eng", description: msg, variant: "destructive" });
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }, [action, q, toast]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void run();
    }
  };

  const siteOrder = useMemo(() => (result ? Object.keys(result.grouped || {}) : []), [result]);
  const skipped = useMemo(() => (result?.sites ?? []).filter((s) => s.status !== "ok"), [result]);

  const nowPlace = rows[0]?.place;

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      {!isV2 && (
        <header className="mb-5 flex flex-col gap-4 border-b border-border/20 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">asherin / investigate</p>
            <h1 className="text-2xl font-extralight tracking-tight text-foreground">asherinx.eng</h1>
            <p className="mt-1 text-xs font-extralight text-muted-foreground/70">public-index research with a local area journal</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-extralight text-muted-foreground/70" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${logging === "on" ? "bg-foreground" : "bg-muted-foreground/40"}`} />
            {logging === "on" ? "journal recording" : "journal paused"}
          </div>
        </header>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/20 bg-card/30 p-4">
          <Activity className="mb-3 h-4 w-4 text-foreground/60" aria-hidden="true" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">journal</p>
          <p className="mt-1 text-xl font-extralight text-foreground">{rows.length}</p>
          <p className="text-[11px] text-muted-foreground/60">local observations</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-4">
          <Database className="mb-3 h-4 w-4 text-foreground/60" aria-hidden="true" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">source</p>
          <p className="mt-1 truncate text-sm font-light text-foreground">{nowPlace?.address || "locating…"}</p>
          <p className="text-[11px] text-muted-foreground/60">{boxLive ? "companion connected" : "browser context only"}</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-4">
          <Search className="mb-3 h-4 w-4 text-foreground/60" aria-hidden="true" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">research</p>
          <p className="mt-1 text-sm font-light text-foreground">{result ? `${result.hits.length} results` : "ready"}</p>
          <p className="text-[11px] text-muted-foreground/60">public indexes only</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border/20 bg-card/30 px-4 py-3">
        <p className="text-[11px] font-extralight lowercase tracking-wide text-muted-foreground/70">current area context</p>
        <p className="mt-1 text-sm font-light text-foreground">{nowPlace?.address || "locating…"}</p>
        <p className="mt-0.5 text-[11px] font-extralight text-muted-foreground/55">
          {nowPlace?.ip ? `ip ${nowPlace.ip}` : "ip …"}
          {nowPlace?.local_ipv4s?.length ? ` · lan ${nowPlace.local_ipv4s.join(", ")}` : ""}
          {boxLive ? " · this box radios" : " · wifi from this box hub"}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {rows.length === 0 && (
          <p className="py-8 text-center text-[11px] font-extralight text-muted-foreground/40">
            writing the first area row…
          </p>
        )}
        {rows.map((row, i) => (
          <article key={`${row.ts}-${i}`} className="mb-3 rounded-xl border border-border/15 bg-card/20 px-4 py-3">
            <p className="text-[11px] font-extralight text-muted-foreground/50">
              {row.ts} · {row.source}
            </p>
            <p className="mt-1 text-xs font-light text-foreground">{row.place?.address || "place unsure"}</p>
            <p className="text-[11px] font-extralight text-muted-foreground/55">
              {row.place?.ip ? `ip ${row.place.ip}` : ""}
              {row.counts
                ? ` · wifi ${row.counts.wifi ?? 0} · arp ${row.counts.arp ?? 0} · ssdp ${row.counts.ssdp ?? 0} · ble ${row.counts.ble ?? 0}`
                : " · browser place only"}
            </p>
            {!!row.emissions?.length && (
              <ul className="mt-2 space-y-1">
                {row.emissions.slice(0, 24).map((e, j) => (
                  <li key={j} className="text-[11px] font-extralight text-muted-foreground/70">
                    <span className="text-muted-foreground/40">{e.kind}</span>
                    {" · "}
                    {e.label || e.ssid || e.ip || "seen"}
                    {e.channel ? ` · ch ${e.channel}` : ""}
                    {e.freq_mhz ? ` · ${Math.round(e.freq_mhz)} MHz` : ""}
                    {e.band ? ` · ${e.band}` : ""}
                    {e.auth ? ` · ${e.auth}` : ""}
                    {e.signal ? ` · ${e.signal}` : ""}
                    {e.relation === "seen_not_connected" ? " · seen, not joined" : ""}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-border/20 bg-card/30 p-2">
        <textarea
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          aria-label="public-index query"
          placeholder={PLACEHOLDER[action]}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm font-extralight text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <p className="truncate text-[11px] font-extralight text-muted-foreground/50">{ACTIONS.find((a) => a.id === action)?.hint}</p>
          <Button
            onClick={() => void run()}
            disabled={busy || (action !== "buffer" && !q.trim())}
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs font-light"
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            run
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="research action">
        {ACTIONS.map((a) => (
          <Button
            key={a.id}
            onClick={() => setAction(a.id)}
            title={a.hint}
            aria-pressed={action === a.id}
            size="sm"
            variant={action === a.id ? "secondary" : "ghost"}
            className="h-8 rounded-full px-3 text-[11px] font-extralight lowercase"
          >
            {a.label}{a.pro ? " ·" : ""}
          </Button>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-border/20 bg-card/20 px-4 py-3 text-xs font-extralight text-muted-foreground">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 min-h-0 flex-1 overflow-auto pb-8">
          <p className="mb-3 text-[11px] font-extralight text-muted-foreground/50">
            {result.classification?.domain} pack · {result.hits.length} results from {siteOrder.length} of{" "}
            {result.sites.length} indexes · {Math.round(result.took_ms / 100) / 10}s
            {result.depth === "basic" ? " · basic depth" : ""}
          </p>

          {siteOrder.map((site) => {
            const hits = result.grouped[site] ?? [];
            const open = openSites[site] !== false;
            return (
              <section key={site} className="mb-4 rounded-xl border border-border/15 bg-card/20">
                <button
                  onClick={() => setOpenSites((s) => ({ ...s, [site]: !open }))}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${open ? "" : "-rotate-90"}`}
                  />
                  <span className="text-xs font-light lowercase text-foreground">{SITE_LABEL[site] ?? site}</span>
                  <span className="text-[11px] font-extralight text-muted-foreground/40">{hits.length}</span>
                </button>
                {open && (
                  <ul className="space-y-1 px-4 pb-3">
                    {hits.map((h, i) => (
                      <li key={`${site}-${i}`} className="rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5">
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-start gap-1.5 text-xs font-light text-foreground hover:underline"
                        >
                          <span className="min-w-0">{h.title}</span>
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />
                        </a>
                        {h.snippet && (
                          <p className="mt-0.5 text-[11px] font-extralight leading-relaxed text-muted-foreground/60">
                            {h.snippet}
                          </p>
                        )}
                        {!!h.genesis?.length && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {h.genesis.map((g) => (
                              <span
                                key={g}
                                className="rounded border border-border/15 px-1.5 py-0.5 text-[10px] font-extralight text-muted-foreground/50"
                              >
                                {g}
                              </span>
                            ))}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {!!skipped.length && (
            <div className="mt-2 rounded-xl border border-dashed border-border/15 px-4 py-3">
              <p className="mb-1.5 text-[11px] font-extralight text-muted-foreground/50">not answered</p>
              <ul className="space-y-0.5">
                {skipped.map((s) => (
                  <li key={s.site} className="text-[11px] font-extralight text-muted-foreground/40">
                    {SITE_LABEL[s.site] ?? s.site} — {s.reason ?? s.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {raw !== null && action !== "query" && (
        <pre className="mt-6 max-h-[60vh] overflow-auto rounded-xl border border-border/15 bg-card/20 p-4 text-[11px] font-extralight leading-relaxed text-muted-foreground">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default AsherinxEngView;
