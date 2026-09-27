// asherin.analytics — the public record of who arrives here.
//
// Everything on this page is read from one server-side aggregate
// (`analytics_overview`) so the browser never handles per-visitor rows. The
// page is deliberately public and says so at the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SiteFooter from "@/components/SiteFooter";
import aerial from "@/assets/analytics-aerial-night.jpg";

/* ---------------------------------------------------------------- types -- */

interface Slice { label: string | null; views: number; visitors?: number; company?: string; last_seen?: string; avg_dwell_ms?: number | null; city?: string; country?: string }
interface Day { day: string; views: number; visitors: number; sessions: number; signups: number }
interface Candle { day: string; open: number; close: number; high: number; low: number; volume: number }

interface Overview {
  range_days: number;
  generated_at: string;
  first_event: string | null;
  lifetime_events: number;
  pageviews: number;
  visitors: number;
  sessions: number;
  new_visitors: number;
  returning_visitors: number;
  signups: number;
  avg_dwell_ms: number | null;
  median_dwell_ms: number | null;
  one_page_sessions: number;
  avg_load_ms: number | null;
  p75_load_ms: number | null;
  vpn_suspected_visitors: number;
  bot_hits: number;
  daily: Day[];
  candles: Candle[];
  hourly_shape: { hour: number; views: number }[];
  sources: Slice[];
  referrers: Slice[];
  pages: Slice[];
  countries: Slice[];
  regions: Slice[];
  devices: Slice[];
  browsers: Slice[];
  bots: Slice[];
  vpn_reasons: Slice[];
}

interface Live {
  window_minutes: number;
  generated_at: string;
  online: number;
  sessions: number;
  devices: { mobile: number; laptop: number; tablet: number; other: number };
  pages: Slice[];
  countries: Slice[];
}

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

/* ------------------------------------------------------------- helpers -- */

function ms(v: number | null | undefined): string {
  if (!v || v <= 0) return "—";
  if (v < 1000) return `${Math.round(v)}ms`;
  const s = v / 1000;
  if (s < 90) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Numbers arrive rather than appear. Respects reduced-motion. */
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || target === 0) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* -------------------------------------------------------------- pieces -- */

const Room = ({ title, note, children, wide }: { title: string; note?: string; children: React.ReactNode; wide?: boolean }) => (
  <section className={`group rounded-2xl border border-border/40 bg-card/40 p-6 backdrop-blur-[2px] transition-colors duration-500 hover:border-border ${wide ? "lg:col-span-2" : ""}`}>
    <header className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-[11px] font-extralight uppercase tracking-[0.32em] text-foreground/80">{title}</h2>
      {note && <p className="text-[10px] font-extralight tracking-wider text-muted-foreground">{note}</p>}
    </header>
    {children}
  </section>
);

const Metric = ({ label, value, sub, live }: { label: string; value: number; sub?: string; live?: boolean }) => {
  const shown = useCountUp(value);
  return (
    <div className="group relative rounded-2xl border border-border/40 bg-card/40 p-5 transition-all duration-500 hover:-translate-y-0.5 hover:border-border">
      <div className="flex items-center gap-2">
        {live && <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_10px_hsl(var(--signal-live))] animate-pulse" />}
        <p className="text-[10px] font-extralight uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-extralight tabular-nums text-foreground">{shown.toLocaleString()}</p>
      {sub && <p className="mt-1 text-[11px] font-extralight text-muted-foreground">{sub}</p>}
    </div>
  );
};

/** Daily clicks drawn as candles: open, high, low, close per day, built from
 *  that day's hourly counts. It is traffic, not a market — labelled as such. */
const CandleChart = ({ candles }: { candles: Candle[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (!candles.length) return <Empty note="no closed days yet" />;
  const w = 900, h = 260, pad = { l: 40, r: 12, t: 12, b: 26 };
  const inner = { w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  const max = Math.max(...candles.map((c) => c.high)) * 1.15 || 1;
  const step = inner.w / candles.length;
  const bw = Math.max(2, Math.min(14, step * 0.55));
  const y = (v: number) => pad.t + inner.h - (v / max) * inner.h;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="daily click candles">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="hsl(var(--border))" strokeOpacity={0.35} strokeDasharray="2 6" />
            <text x={pad.l - 8} y={y(max * f) + 3} textAnchor="end" fontSize={8} fill="hsl(var(--muted-foreground))">{Math.round(max * f)}</text>
          </g>
        ))}
        {candles.map((c, i) => {
          const cx = pad.l + i * step + step / 2;
          const up = c.close >= c.open;
          const top = y(Math.max(c.open, c.close));
          const bh = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));
          const active = hover === i;
          return (
            <g key={c.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-crosshair">
              <rect x={cx - step / 2} y={pad.t} width={step} height={inner.h} fill="transparent" />
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={up ? "hsl(var(--signal-live))" : "hsl(var(--muted-foreground))"} strokeOpacity={active ? 1 : 0.5} strokeWidth={1} />
              <rect
                x={cx - bw / 2} y={top} width={bw} height={bh} rx={1}
                fill={up ? "hsl(var(--signal-live))" : "hsl(var(--muted))"}
                stroke={up ? "hsl(var(--signal-live))" : "hsl(var(--muted-foreground))"}
                strokeOpacity={0.6}
                opacity={active ? 1 : 0.75}
                className="transition-opacity duration-200"
              />
            </g>
          );
        })}
        <text x={pad.l} y={h - 8} fontSize={8} fill="hsl(var(--muted-foreground))">{shortDay(candles[0].day)}</text>
        <text x={w - pad.r} y={h - 8} fontSize={8} textAnchor="end" fill="hsl(var(--muted-foreground))">{shortDay(candles[candles.length - 1].day)}</text>
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-border/60 bg-background/90 px-3 py-2 text-[10px] font-extralight tracking-wide text-foreground animate-fade-in">
          <p className="text-muted-foreground">{shortDay(candles[hover].day)}</p>
          <p>open {candles[hover].open} · high {candles[hover].high}</p>
          <p>low {candles[hover].low} · close {candles[hover].close}</p>
          <p className="text-muted-foreground">{candles[hover].volume} clicks that day</p>
        </div>
      )}
    </div>
  );
};

const AreaChart = ({ days }: { days: Day[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length < 2) return <Empty note="not enough days yet" />;
  const w = 900, h = 200, pad = { l: 36, r: 12, t: 12, b: 22 };
  const inner = { w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  const max = Math.max(...days.map((d) => Math.max(d.views, d.visitors))) * 1.2 || 1;
  const x = (i: number) => pad.l + (i / (days.length - 1)) * inner.w;
  const y = (v: number) => pad.t + inner.h - (v / max) * inner.h;
  const line = (key: "views" | "visitors") => days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`).join(" ");

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="visitors and views over time">
        <defs>
          <linearGradient id="an-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.14" />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line("views")} L${x(days.length - 1)},${pad.t + inner.h} L${pad.l},${pad.t + inner.h} Z`} fill="url(#an-fill)" />
        <path d={line("views")} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={1.2} />
        <path d={line("visitors")} fill="none" stroke="hsl(var(--signal-live))" strokeWidth={1.2} strokeDasharray="3 3" />
        {days.map((d, i) => (
          <rect key={d.day} x={x(i) - inner.w / days.length / 2} y={pad.t} width={inner.w / days.length} height={inner.h} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + inner.h} stroke="hsl(var(--border))" />
            <circle cx={x(hover)} cy={y(days[hover].views)} r={3} fill="hsl(var(--foreground))" />
            <circle cx={x(hover)} cy={y(days[hover].visitors)} r={3} fill="hsl(var(--signal-live))" />
          </g>
        )}
      </svg>
      <div className="mt-2 flex items-center gap-5 text-[10px] font-extralight tracking-wider text-muted-foreground">
        <span className="flex items-center gap-2"><span className="h-px w-5 bg-foreground/60" /> views</span>
        <span className="flex items-center gap-2"><span className="h-px w-5 bg-signal" /> people</span>
        {hover !== null && (
          <span className="ml-auto text-foreground animate-fade-in">
            {shortDay(days[hover].day)} — {days[hover].views} views · {days[hover].visitors} people · {days[hover].sessions} sessions
          </span>
        )}
      </div>
    </div>
  );
};

const HourBars = ({ hours }: { hours: { hour: number; views: number }[] }) => {
  const map = new Map(hours.map((h) => [h.hour, h.views]));
  const max = Math.max(1, ...hours.map((h) => h.views));
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 90 }}>
      {Array.from({ length: 24 }, (_, i) => {
        const v = map.get(i) ?? 0;
        return (
          <div key={i} className="group relative flex-1">
            <div
              className="w-full rounded-t-[2px] bg-foreground/25 transition-all duration-300 group-hover:bg-signal"
              style={{ height: `${Math.max(2, (v / max) * 88)}px` }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border/60 bg-background/95 px-1.5 py-0.5 text-[9px] font-extralight text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {String(i).padStart(2, "0")}:00 · {v}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const Donut = ({ a, b, aLabel, bLabel }: { a: number; b: number; aLabel: string; bLabel: string }) => {
  const total = a + b || 1;
  const r = 52, c = 2 * Math.PI * r;
  const aLen = (a / total) * c;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-32 w-32 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--signal-live))" strokeWidth="10" strokeLinecap="butt"
          strokeDasharray={`${aLen} ${c - aLen}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="space-y-3 text-xs font-extralight">
        <p className="flex items-center gap-2 text-foreground"><span className="h-2 w-2 rounded-full bg-signal" />{aLabel} <span className="tabular-nums text-muted-foreground">{a.toLocaleString()} · {pct(a, total)}</span></p>
        <p className="flex items-center gap-2 text-foreground"><span className="h-2 w-2 rounded-full bg-muted" />{bLabel} <span className="tabular-nums text-muted-foreground">{b.toLocaleString()} · {pct(b, total)}</span></p>
      </div>
    </div>
  );
};

const BarList = ({ rows, unit = "views" }: { rows: Slice[]; unit?: string }) => {
  if (!rows.length) return <Empty note="nothing recorded yet" />;
  const max = Math.max(...rows.map((r) => r.views)) || 1;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="group relative overflow-hidden rounded-lg px-3 py-2 transition-colors hover:bg-foreground/[0.04]">
          <div
            className="absolute inset-y-0 left-0 bg-foreground/[0.06] transition-all duration-700 group-hover:bg-signal-dim"
            style={{ width: `${(r.views / max) * 100}%` }}
          />
          <div className="relative flex items-baseline justify-between gap-4">
            <span className="truncate text-xs font-extralight text-foreground">{r.label || "unknown"}</span>
            <span className="shrink-0 text-[11px] font-extralight tabular-nums text-muted-foreground">
              {r.views.toLocaleString()} {unit}{typeof r.visitors === "number" ? ` · ${r.visitors} people` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
};

const Empty = ({ note }: { note: string }) => (
  <p className="py-8 text-center text-[11px] font-extralight tracking-wider text-muted-foreground">{note}</p>
);

const Skeleton = ({ h = 120 }: { h?: number }) => (
  <div className="overflow-hidden rounded-2xl border border-border/30 bg-card/30" style={{ height: h }}>
    <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
  </div>
);

/* ---------------------------------------------------------- who is here -- */

/** Reads the live window every 20s while the tab is visible. Polling stops when
 *  the tab is hidden so a backgrounded page never keeps the ledger busy. */
function useLive(windowMinutes = 5) {
  const [live, setLive] = useState<Live | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let id: number | null = null;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase.rpc("analytics_live", { window_minutes: windowMinutes });
      if (cancelled) return;
      if (error) { setFailed(true); return; }
      setFailed(false);
      setLive(data as unknown as Live);
    };

    void tick();
    id = window.setInterval(() => void tick(), 20000);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (id) window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [windowMinutes]);

  return { live, failed };
}

const DeviceTile = ({ label, value, total }: { label: string; value: number; total: number }) => (
  <div className="relative overflow-hidden rounded-xl border border-border/40 bg-background/30 p-4">
    <div
      className="absolute inset-x-0 bottom-0 bg-signal-dim/40 transition-all duration-700"
      style={{ height: `${total ? (value / total) * 100 : 0}%` }}
    />
    <div className="relative">
      <p className="text-2xl font-extralight tabular-nums text-foreground">{value.toLocaleString()}</p>
      <p className="mt-1 text-[10px] font-extralight uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
    </div>
  </div>
);

const LiveRoom = ({ windowMinutes = 5 }: { windowMinutes?: number }) => {
  const { live, failed } = useLive(windowMinutes);
  const d = live?.devices;
  const total = d ? d.mobile + d.laptop + d.tablet + d.other : 0;

  return (
    <Room
      title="here right now"
      note={live ? `active in the last ${live.window_minutes} minutes · refreshes every 20s` : "reading the live window"}
      wide
    >
      {failed && !live && <Empty note="the live window did not answer. nothing is being guessed in its place." />}
      {!failed && !live && <Skeleton h={140} />}
      {live && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
          <div className="flex items-center gap-4 rounded-2xl border border-border/40 bg-background/20 p-5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${live.online > 0 ? "bg-signal shadow-[0_0_12px_hsl(var(--signal-live))] animate-pulse" : "bg-muted-foreground/40"}`}
              aria-hidden="true"
            />
            <div>
              <p className="text-4xl font-extralight tabular-nums text-foreground">{live.online.toLocaleString()}</p>
              <p className="mt-1 text-[10px] font-extralight uppercase tracking-[0.3em] text-muted-foreground">
                {live.online === 1 ? "person online" : "people online"}
              </p>
              <p className="mt-1 text-[11px] font-extralight text-muted-foreground">
                {live.sessions.toLocaleString()} open {live.sessions === 1 ? "session" : "sessions"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DeviceTile label="mobile" value={d?.mobile ?? 0} total={total} />
            <DeviceTile label="laptop" value={d?.laptop ?? 0} total={total} />
            <DeviceTile label="tablet" value={d?.tablet ?? 0} total={total} />
            <DeviceTile label="other" value={d?.other ?? 0} total={total} />
          </div>

          <div className="lg:col-span-2 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-[10px] font-extralight uppercase tracking-[0.28em] text-muted-foreground">pages being read</p>
              {live.pages.length ? <BarList rows={live.pages} unit="here" /> : <Empty note="no one is on a page in this window." />}
            </div>
            <div>
              <p className="mb-3 text-[10px] font-extralight uppercase tracking-[0.28em] text-muted-foreground">where from</p>
              {live.countries.length ? <BarList rows={live.countries} unit="here" /> : <Empty note="no location signal in this window." />}
            </div>
          </div>
        </div>
      )}
    </Room>
  );
};


/* ---------------------------------------------------------------- page -- */

const AsherinAnalytics = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    setProgress(8);
    timer.current = window.setInterval(() => setProgress((p) => (p < 88 ? p + Math.max(1, (90 - p) / 12) : p)), 90);
    const { data: res, error: err } = await supabase.rpc("analytics_overview", { days: range });
    if (timer.current) window.clearInterval(timer.current);
    setProgress(100);
    if (err) {
      setError("the ledger did not answer. nothing is being invented in its place.");
      setData(null);
    } else {
      setData(res as unknown as Overview);
    }
    window.setTimeout(() => setLoading(false), 180);
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  useEffect(() => {
    document.title = "asherin.analytics — the public record of who arrives here";
    const desc = "a public, live analytics record for asherin: visitors, returning visitors, sources, pages, countries and regions, ai crawlers, suspected vpn exits, sign-ups and page speed.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", desc);
    let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canon) { canon = document.createElement("link"); canon.rel = "canonical"; document.head.appendChild(canon); }
    canon.href = "https://asherin.com/asherin.analytics";
  }, []);

  const engaged = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.sessions - data.one_page_sessions);
  }, [data]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* infrastructure running without anyone present */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <img src={aerial} alt="" aria-hidden="true" width={1920} height={1088} className="h-full w-full object-cover opacity-[0.32]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/85 to-background" />
      </div>

      {loading && (
        <div className="fixed inset-x-0 top-0 z-50 h-px bg-transparent">
          <div className="h-px bg-signal transition-[width] duration-200 ease-out shadow-[0_0_8px_hsl(var(--signal-live))]" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-4 pt-24">
        <header className="mb-16 max-w-2xl">
          <Link to="/" className="text-[10px] font-extralight uppercase tracking-[0.4em] text-muted-foreground transition-colors hover:text-foreground">asherin</Link>
          <h1 className="mt-8 text-4xl font-extralight tracking-tight text-foreground sm:text-5xl">asherin.analytics</h1>
          <p className="mt-6 text-sm font-extralight leading-relaxed text-muted-foreground">
            the record of who arrives here. it counts arrivals, not identities — no addresses are
            stored, no accounts are named, and nothing on this page is inferred where the data is
            silent. it is left open because a system that watches should be watchable.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                aria-pressed={days === r.days}
                className={`rounded-full border px-4 py-1.5 text-[10px] font-extralight uppercase tracking-[0.24em] transition-all duration-300 ${
                  days === r.days
                    ? "border-signal/60 bg-signal-dim/40 text-foreground"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
            {data?.first_event && (
              <span className="ml-2 text-[10px] font-extralight tracking-wider text-muted-foreground">
                records begin {new Date(data.first_event).toLocaleDateString()} · {data.lifetime_events.toLocaleString()} entries all time
              </span>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-10 rounded-2xl border border-border/50 bg-card/40 p-6">
            <p className="text-xs font-extralight text-foreground">{error}</p>
            <button onClick={() => void load(days)} className="mt-4 rounded-full border border-border/60 px-4 py-1.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground">
              try again
            </button>
          </div>
        )}

        {loading && !data && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={116} />)}
          </div>
        )}

        <div className="mb-6">
          <LiveRoom />
        </div>

        {data && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="people" value={data.visitors} sub={`${data.pageviews.toLocaleString()} page views`} live />
              <Metric label="new" value={data.new_visitors} sub={`${pct(data.new_visitors, data.visitors || 1)} of everyone`} />
              <Metric label="returning" value={data.returning_visitors} sub={`${pct(data.returning_visitors, data.visitors || 1)} came back`} />
              <Metric label="sign-ups" value={data.signups} sub={`${pct(data.signups, data.sessions || 1)} of sessions`} />
              <Metric label="sessions" value={data.sessions} sub={`${engaged.toLocaleString()} went past one page`} />
              <Metric label="left after one page" value={data.one_page_sessions} sub={`${pct(data.one_page_sessions, data.sessions || 1)} looked once and went`} />
              <Metric label="ai + search crawlers" value={data.bot_hits} sub="counted separately, never mixed in" />
              <Metric label="suspected vpn" value={data.vpn_suspected_visitors} sub="clock and exit country disagree" />
            </div>

            <Room title="daily clicks" note="open · high · low · close, built from each day's hourly counts — traffic, not a market" wide>
              <CandleChart candles={data.candles} />
            </Room>

            <div className="grid gap-6 lg:grid-cols-2">
              <Room title="arrivals over time" note={`last ${data.range_days} days`} wide>
                <AreaChart days={data.daily} />
              </Room>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Room title="hour of day" note="all local server hours, utc">
                <HourBars hours={data.hourly_shape} />
              </Room>
              <Room title="new against returning">
                <Donut a={data.new_visitors} b={data.returning_visitors} aLabel="first time" bLabel="came back" />
              </Room>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Room title="where they came from"><BarList rows={data.sources} /></Room>
              <Room title="referring sites"><BarList rows={data.referrers} /></Room>
              <Room title="pages" wide>
                <ul className="space-y-1.5">
                  {data.pages.length === 0 && <Empty note="nothing recorded yet" />}
                  {data.pages.map((p) => (
                    <li key={p.label} className="group flex items-baseline justify-between gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-foreground/[0.04]">
                      <span className="truncate text-xs font-extralight text-foreground">{p.label}</span>
                      <span className="shrink-0 text-[11px] font-extralight tabular-nums text-muted-foreground">
                        {p.views.toLocaleString()} views · {p.visitors} people · {ms(p.avg_dwell_ms)} on page
                      </span>
                    </li>
                  ))}
                </ul>
              </Room>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Room title="nations" note="country as the connection exits it">
                <BarList rows={data.countries} />
              </Room>
              <Room title="regions and cities" note="only as precise as the network says">
                <ul className="space-y-1.5">
                  {data.regions.length === 0 && <Empty note="nothing recorded yet" />}
                  {data.regions.map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-foreground/[0.04]">
                      <span className="truncate text-xs font-extralight text-foreground">
                        {r.country} · {r.label} · {r.city}
                      </span>
                      <span className="shrink-0 text-[11px] font-extralight tabular-nums text-muted-foreground">{r.views}</span>
                    </li>
                  ))}
                </ul>
              </Room>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Room title="devices"><BarList rows={data.devices} /></Room>
              <Room title="browsers"><BarList rows={data.browsers} /></Room>
            </div>

            <Room title="ai and search crawlers" note="which machines read this site, and who runs them" wide>
              {data.bots.length === 0 ? <Empty note="no crawlers in this window" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-extralight">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                        <th className="pb-3 pr-4">agent</th>
                        <th className="pb-3 pr-4">operator</th>
                        <th className="pb-3 pr-4 text-right">reads</th>
                        <th className="pb-3 text-right">last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bots.map((b, i) => (
                        <tr key={i} className="border-t border-border/30 transition-colors hover:bg-foreground/[0.04]">
                          <td className="py-2.5 pr-4 text-foreground">{b.label}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{b.company}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{b.views.toLocaleString()}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{b.last_seen ? new Date(b.last_seen).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Room>

            <div className="grid gap-6 lg:grid-cols-2">
              <Room title="suspected vpn exits" note="a heuristic, stated as one">
                <p className="mb-4 text-[11px] font-extralight leading-relaxed text-muted-foreground">
                  a visit is marked when the device clock points at one country and the connection
                  leaves in another, or when the same device exits two countries within a day. this
                  is a signal, not proof; some people simply travel.
                </p>
                <BarList rows={data.vpn_reasons} unit="visits" />
              </Room>
              <Room title="how fast the pages arrive">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">typical load</p>
                    <p className="mt-2 text-2xl font-extralight tabular-nums">{ms(data.avg_load_ms)}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">slow quarter</p>
                    <p className="mt-2 text-2xl font-extralight tabular-nums">{ms(data.p75_load_ms)}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">average time on page</p>
                    <p className="mt-2 text-2xl font-extralight tabular-nums">{ms(data.avg_dwell_ms)}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">middle time on page</p>
                    <p className="mt-2 text-2xl font-extralight tabular-nums">{ms(data.median_dwell_ms)}</p>
                  </div>
                </div>
              </Room>
            </div>

            <section className="rounded-2xl border border-signal/25 bg-signal-dim/10 p-6">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_10px_hsl(var(--signal-live))]" />
                <p className="text-[10px] font-extralight uppercase tracking-[0.3em] text-foreground/80">disclosure</p>
              </div>
              <p className="mt-4 max-w-3xl text-xs font-extralight leading-relaxed text-muted-foreground">
                this data is publicly accessible. anyone can open this page and read every figure on
                it. what is counted: the page visited, an anonymous one-way marker for the device,
                where the visit came from, the country and region the connection exits in, device
                and browser family, load time, time on page, and whether the visit ended in a
                sign-up. what is never stored: ip addresses, names, email addresses, account
                identifiers, or anything typed into the site. dashboard pages are not counted here.
                figures update as visits arrive; last read {new Date(data.generated_at).toLocaleString()}.
              </p>
            </section>
          </div>
        )}
      </div>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
};

export default AsherinAnalytics;
