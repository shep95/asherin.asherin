import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Orbit, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building2, User2, Gem, Activity, Crown, Megaphone, ScrollText, Trophy } from "lucide-react";
import { computeFutureIngresses, type SignIngress } from "@/lib/vedic/transits";
import { DOMAIN_META, type MoonEventDomain } from "@/lib/vedic/moonEvents";
import { calculateSweVedicChart, type SweVedicPlanet } from "@/lib/vedic/sweChart";
import { computeSensitivePoints, type SensitivePoints } from "@/lib/vedic/sensitivePoints";
import { detectWindows } from "@/lib/vedic/wealthSoulmateWindows";
import { computeLifeSequence, type LifeEvent } from "@/lib/vedic/lifeSequence";
import type { CompanyFoundation } from "@/data/vedic/companyCharts";
import type { CurrentDashaPath, DashaPeriod } from "@/lib/vedic/dasha";

interface Props {
  natalAscendant: number;
  natalPlanets?: SweVedicPlanet[];
  lat: number;
  lon: number;
  chartKey: string | null;
  userChartName?: string;
  companyCharts?: CompanyFoundation[];
  currentDasha?: CurrentDashaPath;
  dashaTimeline?: DashaPeriod[];
  /** Emits ingresses for the active natal ref so sibling panels can reuse them. */
  onIngresses?: (ingresses: SignIngress[] | null) => void;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
}
function monthLabel(d: Date) { return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; }
function midOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 15, 12, 0); }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0); }
function monthEnd(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59); }
function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
// ── Week helpers (Mon-anchored ISO-ish week) ──
function weekStart(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
  const day = x.getDay();              // 0..6, Sun=0
  const offset = (day + 6) % 7;        // days since Monday
  x.setDate(x.getDate() - offset);
  return x;
}
function weekEnd(d: Date) {
  const s = weekStart(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59);
}
function midOfWeek(d: Date) {
  const s = weekStart(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 3, 12, 0);
}
function weekLabel(d: Date) {
  const s = weekStart(d), e = weekEnd(d);
  const sameMonth = s.getMonth() === e.getMonth();
  const sFmt = `${MONTH_NAMES[s.getMonth()].slice(0,3)} ${s.getDate()}`;
  const eFmt = sameMonth ? `${e.getDate()}` : `${MONTH_NAMES[e.getMonth()].slice(0,3)} ${e.getDate()}`;
  return `Week of ${sFmt}–${eFmt}, ${e.getFullYear()}`;
}

interface NatalRef {
  ascendant: number;
  lat: number;
  lon: number;
  label: string;
  kind: "user" | "company";
  key: string;
  points: SensitivePoints | null;
  planets: Array<{ name: string; sid: number }> | null;
}

const TransitsPanel = ({ natalAscendant, natalPlanets, lat, lon, chartKey, userChartName, companyCharts, dashaTimeline, onIngresses }: Props) => {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<Date>(() => midOfMonth(new Date()));
  const [mode, setMode] = useState<"user" | string>("user"); // "user" or company symbol
  const [companyRef, setCompanyRef] = useState<NatalRef | null>(null);
  const [resolvingCompany, setResolvingCompany] = useState(false);

  const userRef: NatalRef = useMemo(() => ({
    ascendant: natalAscendant, lat, lon,
    label: userChartName || "Your Chart", kind: "user",
    key: `user:${chartKey ?? `${natalAscendant.toFixed(3)}:${lat}:${lon}`}`,
    points: natalPlanets ? computeSensitivePoints(natalPlanets, natalAscendant) : null,
    planets: natalPlanets ? natalPlanets.map((p) => ({ name: p.name, sid: p.sid })) : null,
  }), [natalAscendant, natalPlanets, lat, lon, chartKey, userChartName]);

  // Resolve company natal chart whenever mode changes to a company symbol
  useEffect(() => {
    if (mode === "user") { setCompanyRef(null); return; }
    const co = companyCharts?.find((c) => c.symbol === mode);
    if (!co) return;
    let cancelled = false;
    setResolvingCompany(true);
    (async () => {
      try {
        const c = await calculateSweVedicChart({
          birthDate: co.birthDate, birthTime: co.birthTime,
          tzOffset: co.tzOffset, lat: co.lat, lon: co.lon,
        });
        if (cancelled) return;
        setCompanyRef({
          ascendant: c.ascendant, lat: co.lat, lon: co.lon,
          label: `${co.name} (${co.symbol})`, kind: "company",
          key: `co:${co.symbol}`,
          points: computeSensitivePoints(c.planets, c.ascendant),
          planets: c.planets.map((p) => ({ name: p.name, sid: p.sid })),
        });
      } finally {
        if (!cancelled) setResolvingCompany(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, companyCharts]);

  const activeRef: NatalRef = mode === "user" ? userRef : (companyRef ?? userRef);

  const horizonMonths = 12;
  const [granularity, setGranularity] = useState<"week" | "month">("month");

  const chosen = useMemo(
    () => (granularity === "week" ? midOfWeek(cursor) : midOfMonth(cursor)),
    [cursor, granularity],
  );
  const periodStart = useMemo(() => (granularity === "week" ? weekStart(cursor) : monthStart(cursor)), [cursor, granularity]);
  const periodEnd   = useMemo(() => (granularity === "week" ? weekEnd(cursor)   : monthEnd(cursor)),   [cursor, granularity]);
  const periodLabel = granularity === "week" ? weekLabel(cursor) : monthLabel(cursor);
  const isCurrentPeriod = today.getTime() >= periodStart.getTime() && today.getTime() <= periodEnd.getTime();
  const isCurrentMonth = isCurrentPeriod;

  // ── Ingresses — anchored at today, horizon auto-extended for chosen month ──
  // Cache key is independent of `chosen` so flipping months stays instant.
  const [ingresses, setIngresses] = useState<SignIngress[] | null>(null);
  const [, setLoadingFuture] = useState(false);
  const ingressCacheRef = useRef<Map<string, SignIngress[]>>(new Map());

  // Horizon: cover both backward (past months user scrolled to) and forward.
  const scanFromDate = useMemo(() => {
    const earliest = periodStart.getTime() < monthStart(today).getTime() ? monthStart(periodStart) : monthStart(today);
    // Pad 1 extra month back so cluster boundaries near the edge still resolve
    return new Date(earliest.getFullYear(), earliest.getMonth() - 1, 1);
  }, [periodStart, today]);

  const scanHorizonDays = useMemo(() => {
    const baseFromHorizon = horizonMonths * 31;
    const monthsToChosenFwd = Math.max(0, monthsBetween(scanFromDate, chosen));
    const needed = (monthsToChosenFwd + 3) * 31; // +3 month buffer
    const raw = Math.max(baseFromHorizon, needed);
    // round up to nearest 90 days to avoid frequent refetches when scrolling
    return Math.ceil(raw / 90) * 90;
  }, [horizonMonths, scanFromDate, chosen]);

  useEffect(() => {
    if (mode !== "user" && !companyRef) return;
    const key = `${activeRef.key}:${scanFromDate.toISOString().slice(0,10)}:${scanHorizonDays}`;
    const cached = ingressCacheRef.current.get(key);
    if (cached) { setIngresses(cached); return; }
    let cancelled = false;
    setLoadingFuture(true);
    (async () => {
      try {
        const list = await computeFutureIngresses(activeRef.ascendant, activeRef.lat, activeRef.lon, {
          from: scanFromDate,
          horizonDays: scanHorizonDays,
          perPlanetLimit: scanHorizonDays >= 365 ? 8 : 4,
        });
        if (cancelled) return;
        ingressCacheRef.current.set(key, list);
        setIngresses(list);
      } finally {
        if (!cancelled) setLoadingFuture(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeRef.key, activeRef.ascendant, activeRef.lat, activeRef.lon, scanFromDate, scanHorizonDays, mode, companyRef]);
  // Clear ingress cache when natal ref changes
  useEffect(() => { ingressCacheRef.current.clear(); setIngresses(null); }, [activeRef.key]);
  // Publish ingresses up so sibling panels (WealthHousesPanel) can reuse without refetching
  useEffect(() => { onIngresses?.(ingresses); }, [ingresses, onIngresses]);

  // ── MOON EVENTS — 100% Moon-driven monthly/weekly forecast ──
  // House ingresses + Moon-to-natal-planet conjunctions, bisected to ~1 min
  // and rendered in the user's local timezone.
  const [moonEvents, setMoonEvents] = useState<import("@/lib/vedic/moonEvents").MoonEvent[] | null>(null);
  const [loadingMoon, setLoadingMoon] = useState(false);
  const moonCacheRef = useRef<Map<string, import("@/lib/vedic/moonEvents").MoonEvent[]>>(new Map());
  // Domain filter chips — all on by default
  const ALL_DOMAINS: MoonEventDomain[] = [
    "wealth-equity", "wealth-liquidity", "love", "power", "mental-health", "physical-health",
  ];
  const [activeDomains, setActiveDomains] = useState<Set<string>>(() => new Set(ALL_DOMAINS));
  const toggleDomain = (d: string) => setActiveDomains((prev) => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });
  useEffect(() => { moonCacheRef.current.clear(); }, [activeRef.key]);
  useEffect(() => {
    if (mode !== "user" && !companyRef) return;
    if (!activeRef.planets || activeRef.planets.length === 0) { setMoonEvents([]); return; }
    const cacheKey = `${activeRef.key}:${granularity}:${periodStart.getTime()}-${periodEnd.getTime()}`;
    const cached = moonCacheRef.current.get(cacheKey);
    if (cached) { setMoonEvents(cached); return; }
    let cancelled = false;
    setLoadingMoon(true);
    (async () => {
      try {
        const { computeMoonEvents } = await import("@/lib/vedic/moonEvents");
        const list = await computeMoonEvents(
          periodStart, periodEnd,
          activeRef.ascendant,
          activeRef.planets!,
          activeRef.lat, activeRef.lon,
        );
        if (cancelled) return;
        moonCacheRef.current.set(cacheKey, list);
        setMoonEvents(list);
      } catch (e) {
        console.error("[moon-events] failed:", e);
        if (!cancelled) setMoonEvents([]);
      } finally {
        if (!cancelled) setLoadingMoon(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeRef.key, activeRef.ascendant, activeRef.lat, activeRef.lon, activeRef.planets, granularity, periodStart, periodEnd, mode, companyRef]);
  // ── SUPPORT WINDOWS — kept only for the separate Wealth & Power calculator.
  // They no longer feed the "What's gonna happen" panel, which is strictly Moon-only.
  const wealthWindows = useMemo(
    () => (ingresses ? detectWindows(ingresses, activeRef.points, "wealth", { clusterDays: 14, minScore: 4 }) : []),
    [ingresses, activeRef.points],
  );
  const powerWindows = useMemo(
    () => (ingresses ? detectWindows(ingresses, activeRef.points, "power", { clusterDays: 14, minScore: 5 }) : []),
    [ingresses, activeRef.points],
  );
  const influenceWindows = useMemo(
    () => (ingresses ? detectWindows(ingresses, activeRef.points, "influence", { clusterDays: 14, minScore: 5 }) : []),
    [ingresses, activeRef.points],
  );
  const fameWindows = useMemo(
    () => (ingresses ? detectWindows(ingresses, activeRef.points, "fame", { clusterDays: 14, minScore: 5 }) : []),
    [ingresses, activeRef.points],
  );
  const careerWindows = useMemo(
    () => (ingresses ? detectWindows(ingresses, activeRef.points, "career", { clusterDays: 14, minScore: 5 }) : []),
    [ingresses, activeRef.points],
  );

  // ── WEALTH & POWER CALCULATOR — natal capacity + dasha+transit timing ──
  // Power windows = union of power/career/influence/fame transit clusters
  const combinedPowerWindows = useMemo(() => {
    const seen = new Set<string>();
    const all = [...powerWindows, ...careerWindows, ...influenceWindows, ...fameWindows];
    const dedup: typeof all = [];
    for (const w of all) {
      const k = `${w.start.getTime()}-${w.end.getTime()}-${w.score}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(w);
    }
    return dedup.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [powerWindows, careerWindows, influenceWindows, fameWindows]);

  const lifeSequence = useMemo(() => {
    if (activeRef.kind !== "user" || !natalPlanets || !dashaTimeline || !ingresses) return null;
    return computeLifeSequence(
      natalPlanets, activeRef.ascendant, dashaTimeline,
      wealthWindows, combinedPowerWindows,
    );
  }, [activeRef.kind, activeRef.ascendant, natalPlanets, dashaTimeline, ingresses, wealthWindows, combinedPowerWindows]);





  const shiftPeriod = (delta: number) => {
    if (granularity === "week") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + delta * 7));
    } else {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 15));
    }
  };
  const shiftYear  = (delta: number) => setCursor(new Date(cursor.getFullYear() + delta, cursor.getMonth(), granularity === "week" ? cursor.getDate() : 15));
  const jumpToNow  = () => setCursor(granularity === "week" ? midOfWeek(new Date()) : midOfMonth(new Date()));

  const subjectLabel = activeRef.label;

  return (
    <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/15 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Orbit className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">{granularity === "week" ? "Weekly" : "Monthly"} Transit Forecast</h3>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 ml-2 inline-flex items-center gap-1">
            {activeRef.kind === "user" ? <User2 className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
            {subjectLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {/* Granularity toggle */}
          <div className="inline-flex items-center rounded border border-border/25 overflow-hidden mr-2">
            {(["week","month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => {
                  if (g === granularity) return;
                  setGranularity(g);
                  setCursor(g === "week" ? midOfWeek(cursor) : midOfMonth(cursor));
                }}
                className={`text-[10px] uppercase tracking-[0.15em] px-2 py-1 transition ${granularity === g ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {g}
              </button>
            ))}
          </div>
          <button onClick={() => shiftYear(-1)} title="Previous year" className="p-1.5 rounded border border-border/25 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => shiftPeriod(-1)} title={`Previous ${granularity}`} className="p-1.5 rounded border border-border/25 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="px-3 py-1 rounded border border-foreground/30 bg-foreground/[0.05] min-w-[12rem] text-center">
            <div className="text-xs font-light tracking-[0.15em] text-foreground uppercase">{periodLabel}</div>
            {isCurrentPeriod && <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-300/80">This {granularity}</div>}
          </div>
          <button onClick={() => shiftPeriod(1)} title={`Next ${granularity}`} className="p-1.5 rounded border border-border/25 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => shiftYear(1)} title="Next year" className="p-1.5 rounded border border-border/25 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition">
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={jumpToNow}
            className="ml-2 text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition"
          >
            Now
          </button>
        </div>
      </div>

      {/* Chart-source switcher */}
      {companyCharts && companyCharts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">Chart Subject</span>
          <button
            onClick={() => setMode("user")}
            className={`text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded border transition inline-flex items-center gap-1.5 ${mode === "user" ? "border-foreground/40 bg-foreground/[0.08] text-foreground" : "border-border/25 text-muted-foreground hover:text-foreground"}`}
          >
            <User2 className="h-3 w-3" /> {userChartName || "Your Chart"}
          </button>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border/25">
            <Building2 className="h-3 w-3 text-muted-foreground/80" />
            <select
              value={mode === "user" ? "" : mode}
              onChange={(e) => setMode(e.target.value || "user")}
              className="bg-transparent text-[11px] font-light text-foreground outline-none cursor-pointer max-w-[14rem]"
            >
              <option value="" className="bg-background">— Company chart —</option>
              {companyCharts.map((c) => (
                <option key={c.symbol} value={c.symbol} className="bg-background">{c.symbol} · {c.name}</option>
              ))}
            </select>
          </div>
          {resolvingCompany && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      )}

      {/* MOON-ONLY MONTHLY BRIEF — 100% Moon transits: house ingresses + conjunctions with natal planets, rendered in the user's local time. */}
      {(

        <div className="rounded-lg border border-border/35 bg-background/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-foreground/80" />
            <h4 className="text-xs font-light tracking-[0.18em] text-foreground uppercase">
              What's gonna happen this {granularity === "week" ? "week" : "month"} · <span className="text-muted-foreground/80 normal-case tracking-normal">{subjectLabel}</span>
            </h4>
          </div>
          <p className="text-[10.5px] text-muted-foreground/75 italic leading-relaxed">
            100% Moon-driven, filtered to <span className="text-foreground/85">Wealth (Equity/Liquidity), Love, Power, Mental &amp; Physical Health</span>. Personalized to your ascendant — each event lists the natal planets sitting in the house being activated. Timestamps in your local time.
          </p>
          {/* Domain filter chips */}
          {(
            <div className="flex flex-wrap gap-1.5">
              {ALL_DOMAINS.map((d) => {
                const on = activeDomains.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDomain(d)}
                    className={`text-[9.5px] uppercase tracking-[0.18em] px-2 py-1 rounded border transition ${
                      on ? "border-foreground/45 bg-foreground/[0.08] text-foreground"
                         : "border-border/30 bg-background/30 text-muted-foreground/60 hover:text-foreground/80"
                    }`}
                  >
                    {DOMAIN_META[d].label}
                  </button>
                );
              })}
            </div>
          )}
          {loadingMoon && !moonEvents ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Tracing the Moon across {periodLabel}…</div>
          ) : (() => {
            const filtered = (moonEvents ?? []).filter((ev) => ev.domains.some((d) => activeDomains.has(d)));
            if (!moonEvents || moonEvents.length === 0) {
              return <div className="text-[11.5px] text-muted-foreground/70 italic">No Moon events resolved for this {granularity}. Try a different period.</div>;
            }
            if (filtered.length === 0) {
              return <div className="text-[11.5px] text-muted-foreground/70 italic">No events match the selected domains this {granularity}. Toggle more chips above.</div>;
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filtered.map((ev) => {
                  const tone = ev.tone;
                  const isConj = ev.kind === "conjunction";
                  const localStr = ev.at.toLocaleString(undefined, {
                    weekday: "short", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
                  });
                  return (
                    <div key={ev.id} className={`relative rounded-md border p-3 space-y-1.5 ${
                      tone === "bad" ? "border-red-500/35 bg-red-500/[0.05]"
                      : tone === "good" ? "border-emerald-500/35 bg-emerald-500/[0.05]"
                      : "border-border/25 bg-background/30"
                    }`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground/80 text-sm leading-none">☽</span>
                          <span className={`text-[10px] uppercase tracking-[0.2em] ${
                            tone === "bad" ? "text-red-200/90"
                            : tone === "good" ? "text-emerald-200/90"
                            : "text-foreground/85"
                          }`}>{ev.label}</span>
                          <span className={`text-[9px] uppercase tracking-[0.18em] ${
                            tone === "bad" ? "text-red-300/70"
                            : tone === "good" ? "text-emerald-300/70"
                            : "text-muted-foreground/60"
                          }`}>· {isConj ? "conjunction" : "ingress"}</span>
                        </div>
                        <span className="text-[9.5px] uppercase tracking-[0.16em] text-foreground/85 font-mono">{localStr}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ev.domains.map((d) => (
                          <span key={d} className="text-[8.5px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded border border-border/30 bg-background/40 text-muted-foreground/80">
                            {d.replace("-", " · ")}
                          </span>
                        ))}
                      </div>
                      <div className="text-[12px] font-light text-foreground leading-snug">{ev.headline}</div>
                      <div className="pt-1.5 mt-1 border-t border-border/15 space-y-1">
                        <div className="text-[8.5px] uppercase tracking-[0.22em] text-muted-foreground/60">What to expect</div>
                        <p className="text-[10.5px] leading-relaxed font-light text-muted-foreground/85">{ev.expect}</p>
                        {ev.natalEnrich && (
                          <p className="text-[10.5px] leading-relaxed font-light text-foreground/75 italic">↳ Your chart: {ev.natalEnrich}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}



      {/* WEALTH & POWER CALCULATOR — natal capacity (%) + dasha+transit timing */}
      {lifeSequence && (() => {
        const ls = lifeSequence;
        const gradePill = (g: string) =>
          `text-[8.5px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded border ${
            g === "peak" ? "border-foreground/40 bg-foreground/[0.06] text-foreground"
            : g === "strong" ? "border-foreground/25 bg-foreground/[0.03] text-foreground/85"
            : "border-border/40 bg-background/40 text-foreground/70"
          } ml-auto`;
        const wp = ls.wealthPotential;
        const pp = ls.powerPotential;
        const wealthTierLabel: Record<typeof wp.tier, string> = {
          billionaire: "Billionaire-grade capacity",
          millionaire: "Millionaire-grade capacity",
          comfortable: "Comfortable capacity",
          none: "Not supported by chart",
        };
        const powerTierLabel: Record<typeof pp.tier, string> = {
          "global-icon": "Global-icon capacity",
          "national-figure": "National-figure capacity",
          "regional-influencer": "Regional-influencer capacity",
          local: "Local-reach capacity",
          none: "Not supported by chart",
        };
        const POWER_TYPE_META: Record<typeof pp.primaryType, { label: string; icon: typeof Crown; tag: string }> = {
          public: { label: "Public / Celebrity", icon: Megaphone, tag: "Mass appeal, fame, visibility" },
          political: { label: "Political / Executive", icon: Crown, tag: "Governance, command, formal authority" },
          behindScenes: { label: "Behind-the-Scenes", icon: ScrollText, tag: "Kingmaker, operator, hidden influence" },
          institutional: { label: "Global Institutional", icon: Building2, tag: "Academies, doctrines, foreign institutions" },
        };
        const Bar = ({ pct }: { pct: number }) => (
          <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
            <div className="h-full bg-foreground/70" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
          </div>
        );
        return (
          <div className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-xs font-light tracking-[0.18em] text-foreground/85 uppercase">Wealth &amp; Power Calculator</h4>
              <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 ml-auto">Natal capacity · Dasha + Transit timing</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* WEALTH CARD */}
              <div className={`rounded-md border p-3 space-y-2 ${
                ls.wealthEvent ? "border-emerald-400/35 bg-emerald-400/[0.05]"
                : wp.tier === "none" ? "border-border/25 bg-background/30"
                : "border-border/35 bg-background/40"
              }`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Gem className={`h-3.5 w-3.5 ${ls.wealthEvent ? "text-emerald-300" : "text-muted-foreground/60"}`} />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/90">Wealth capacity</span>
                  <span className={`text-[8.5px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border ${
                    wp.tier === "billionaire" ? "border-foreground/50 text-foreground" :
                    wp.tier === "millionaire" ? "border-emerald-400/40 text-emerald-200/90" :
                    wp.tier === "comfortable" ? "border-border/40 text-muted-foreground" :
                    "border-border/30 text-muted-foreground/70"
                  }`}>
                    {wp.tier} · {wp.score}%
                  </span>
                  {ls.wealthEvent && <span className={gradePill(ls.wealthEvent.grade)}>{ls.wealthEvent.grade.toUpperCase()}</span>}
                </div>

                <div className="text-[11px] font-light text-foreground/85">{wealthTierLabel[wp.tier]}</div>
                <Bar pct={wp.score} />

                {/* Velocity */}
                <div className="flex items-start gap-1.5 pt-0.5">
                  <Activity className="h-3 w-3 text-foreground/70 mt-[2px] shrink-0" />
                  <div className="text-[10px] leading-snug">
                    <span className="uppercase tracking-[0.18em] text-foreground/85">{ls.wealthVelocity.label}</span>
                    <span className="text-muted-foreground/75"> — {ls.wealthVelocity.detail}</span>
                  </div>
                </div>

                {ls.wealthEvent ? (
                  <>
                    <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70 pt-1 border-t border-border/15">When you reach it</div>
                    <div className="text-[12px] font-light text-foreground">
                      {fmtDateTime(ls.wealthEvent.start)} → {fmtDateTime(ls.wealthEvent.end)}
                    </div>
                    <div className="text-[10.5px] font-light text-muted-foreground/85 leading-relaxed">{ls.wealthEvent.window.headline}</div>
                    <div className="text-[9.5px] uppercase tracking-[0.16em] text-emerald-200/70">
                      Dasha: {ls.wealthEvent.dasha?.mahaLord} MD / {ls.wealthEvent.dasha?.antarLord} AD
                    </div>
                    {ls.wealthEvent.convergingLords.length > 0 && (
                      <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/80">
                        Converging lords: {ls.wealthEvent.convergingLords.join(" + ")}
                      </div>
                    )}
                    {wp.reasons.length > 0 && (
                      <div className="text-[9.5px] text-muted-foreground/70 pt-1 border-t border-border/10 leading-relaxed">
                        Why supported: {wp.reasons.join(" · ")}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground/70 italic">
                    {wp.tier === "none"
                      ? `Dhana-yoga score ${wp.score}% — chart does not currently support millionaire/billionaire-grade wealth. No false-hope window will be shown.`
                      : `No dasha-backed wealth window inside scan horizon. Wealth lords: ${ls.wealthLords.join(", ")}.`}
                  </div>
                )}
              </div>

              {/* POWER CARD */}
              {(() => {
                const meta = POWER_TYPE_META[pp.primaryType];
                const PowerIcon = meta.icon;
                return (
                  <div className={`rounded-md border p-3 space-y-2 ${
                    ls.powerEvent ? "border-amber-400/40 bg-amber-400/[0.05]"
                    : pp.tier === "none" ? "border-border/25 bg-background/30"
                    : "border-border/35 bg-background/40"
                  }`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PowerIcon className={`h-3.5 w-3.5 ${ls.powerEvent ? "text-amber-200" : "text-muted-foreground/60"}`} />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-amber-200/90">Power capacity</span>
                      <span className={`text-[8.5px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border ${
                        pp.tier === "global-icon" ? "border-foreground/50 text-foreground" :
                        pp.tier === "national-figure" ? "border-amber-400/40 text-amber-200/90" :
                        pp.tier === "regional-influencer" ? "border-border/40 text-muted-foreground" :
                        pp.tier === "local" ? "border-border/30 text-muted-foreground/80" :
                        "border-border/30 text-muted-foreground/70"
                      }`}>
                        {pp.tier} · {pp.total}%
                      </span>
                      {ls.powerEvent && <span className={gradePill(ls.powerEvent.grade)}>{ls.powerEvent.grade.toUpperCase()}</span>}
                    </div>

                    <div className="text-[11px] font-light text-foreground/85">{powerTierLabel[pp.tier]} · primary: {meta.label}</div>
                    <div className="text-[9.5px] text-muted-foreground/70 italic">{meta.tag}</div>

                    {/* Per-type breakdown */}
                    <div className="space-y-1 pt-1">
                      {(["public","political","behindScenes","institutional"] as const).map((t) => {
                        const m = POWER_TYPE_META[t];
                        const v = pp.types[t];
                        const isPrimary = t === pp.primaryType;
                        return (
                          <div key={t} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className={isPrimary ? "text-foreground" : "text-muted-foreground/85"}>{m.label}</span>
                              <span className={isPrimary ? "text-foreground" : "text-muted-foreground/70"}>{v}%</span>
                            </div>
                            <Bar pct={v} />
                          </div>
                        );
                      })}
                    </div>

                    {ls.powerEvent ? (
                      <>
                        <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70 pt-1 border-t border-border/15">When you reach it</div>
                        <div className="text-[12px] font-light text-foreground">
                          {fmtDateTime(ls.powerEvent.start)} → {fmtDateTime(ls.powerEvent.end)}
                        </div>
                        <div className="text-[10.5px] font-light text-muted-foreground/85 leading-relaxed">{ls.powerEvent.window.headline}</div>
                        <div className="text-[9.5px] uppercase tracking-[0.16em] text-amber-200/70">
                          Dasha: {ls.powerEvent.dasha?.mahaLord} MD / {ls.powerEvent.dasha?.antarLord} AD
                        </div>
                        {ls.powerEvent.convergingLords.length > 0 && (
                          <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/80">
                            Converging lords: {ls.powerEvent.convergingLords.join(" + ")}
                          </div>
                        )}
                        {pp.reasons.length > 0 && (
                          <div className="text-[9.5px] text-muted-foreground/70 pt-1 border-t border-border/10 leading-relaxed">
                            Why supported: {pp.reasons.join(" · ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-muted-foreground/70 italic">
                        {pp.tier === "none"
                          ? `Power score ${pp.total}% — chart does not currently support large-scale power. No false-hope window will be shown.`
                          : `No dasha-backed power window inside scan horizon. Power lords: ${ls.powerLords.join(", ")}.`}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Additional candidates */}
            {(ls.wealthCandidates.length > 1 || ls.powerCandidates.length > 1) && (
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none select-none text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 hover:text-foreground">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  All dasha-backed candidates ({ls.wealthCandidates.length} wealth · {ls.powerCandidates.length} power)
                </summary>
                <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-300/80">Wealth windows</div>
                    {ls.wealthCandidates.slice(0, 6).map((e, i) => (
                      <div key={`w-${i}`} className="text-[10.5px] text-foreground/80 border border-border/20 rounded px-2 py-1 flex justify-between gap-2">
                        <span>{fmtDate(e.start)}</span>
                        <span className="text-muted-foreground/70">{e.dasha?.mahaLord}/{e.dasha?.antarLord}</span>
                        <span className="text-emerald-200/70">{e.grade}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-amber-300/80">Power windows</div>
                    {ls.powerCandidates.slice(0, 6).map((e, i) => (
                      <div key={`p-${i}`} className="text-[10.5px] text-foreground/80 border border-border/20 rounded px-2 py-1 flex justify-between gap-2">
                        <span>{fmtDate(e.start)}</span>
                        <span className="text-muted-foreground/70">{e.dasha?.mahaLord}/{e.dasha?.antarLord}</span>
                        <span className="text-amber-200/70">{e.grade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            <div className="text-[10px] text-muted-foreground/60 italic leading-relaxed">
              Method: scores your natal chart (Jupiter/Venus dignity, dhana-house lords, Atmakaraka, 10th/11th strength, Sun/Mars/Saturn/Jupiter/Rahu placements) for wealth tier and 4 power archetypes — then cross-references your Vimshottari Mahadasha + Antardasha with live transit windows firing the same lords. Earliest convergence = when you reach that level.
            </div>
          </div>
        );
      })()}

      {/* Old planet-by-planet, dasha-backed, and cross-domain forecast sections removed. */}
    </div>
  );
};

export default TransitsPanel;
