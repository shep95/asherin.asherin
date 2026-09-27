/**
 * VIMSHOTTARI DASHA — Bishop Occult engine port.
 *
 * Bishop reference: src/lib/dashaChainCalc.ts
 *   - Sidereal year: 365.25636 days (ms-based)
 *   - 6 levels: Mahadasha → Antardasha → Pratyantardasha → Sookshma → Prana → Deha
 *   - Sub-period length = parentLength * (subLordYears / 120)
 *   - Sub-period order starts from the parent's own lord and follows the standard
 *     Vimshottari cycle.
 *
 * This wrapper exposes the same `DashaPeriod` shape the rest of the app uses
 * (recursive `children`, `level`, `years`, `isCurrent`).
 */

const DASHA_ORDER = [
  "Ketu", "Venus", "Sun", "Moon", "Mars",
  "Rahu", "Jupiter", "Saturn", "Mercury",
] as const;

export type DashaLord = (typeof DASHA_ORDER)[number];

const DASHA_YEARS: Record<DashaLord, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
const TOTAL_CYCLE = 120;

const NAK_LORDS: DashaLord[] = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
];

const NAK_SPAN = 360 / 27;
// Bishop uses sidereal year (365.25636 days). All sub-period math is ms-based.
const SIDEREAL_YEAR_MS = 365.25636 * 86400_000;

export type DashaLevel = "maha" | "antar" | "pratyantar" | "sookshma" | "prana" | "deha";

export const DASHA_LEVEL_LABEL: Record<DashaLevel, string> = {
  maha: "Mahadasha",
  antar: "Antardasha",
  pratyantar: "Pratyantardasha",
  sookshma: "Sookshma (Weekly)",
  prana: "Prana (Daily)",
  deha: "Deha (Hourly)",
};

const NEXT_LEVEL: Record<DashaLevel, DashaLevel | null> = {
  maha: "antar",
  antar: "pratyantar",
  pratyantar: "sookshma",
  sookshma: "prana",
  prana: "deha",
  deha: null,
};

export interface DashaPeriod {
  level: DashaLevel;
  lord: DashaLord;
  start: Date;
  end: Date;
  years: number;     // duration in fractional sidereal years (for display only)
  isCurrent: boolean;
  children?: DashaPeriod[];
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Bishop subdividePeriod — sub-period order starts from the parent's own lord. */
function subdivide(
  parentLord: DashaLord,
  startMs: number,
  endMs: number,
  level: DashaLevel,
  nowMs: number,
): DashaPeriod[] {
  const pIdx = DASHA_ORDER.indexOf(parentLord);
  const totalDur = endMs - startMs;
  const out: DashaPeriod[] = [];
  let cursor = startMs;
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(pIdx + i) % 9];
    const dur = (DASHA_YEARS[lord] / TOTAL_CYCLE) * totalDur;
    const e = cursor + dur;
    out.push({
      level,
      lord,
      start: new Date(cursor),
      end: new Date(e),
      years: dur / SIDEREAL_YEAR_MS,
      isCurrent: nowMs >= cursor && nowMs < e,
    });
    cursor = e;
  }
  return out;
}

/** Recursively expand the *currently active* branch all the way down to Deha. */
export function expandCurrentPath(period: DashaPeriod, nowMs = Date.now()): DashaPeriod {
  const next = NEXT_LEVEL[period.level];
  if (!next) return period;
  if (!period.children) {
    period.children = subdivide(period.lord, period.start.getTime(), period.end.getTime(), next, nowMs);
  }
  const cur = period.children.find((c) => c.isCurrent);
  if (cur) expandCurrentPath(cur, nowMs);
  return period;
}

/** Build immediate children on demand for any period (used by UI drill-down). */
export function ensureChildren(period: DashaPeriod, nowMs = Date.now()): DashaPeriod[] {
  const next = NEXT_LEVEL[period.level];
  if (!next) return [];
  if (!period.children) {
    period.children = subdivide(period.lord, period.start.getTime(), period.end.getTime(), next, nowMs);
  }
  return period.children;
}

/**
 * Compute the Vimshottari Mahadasha sequence — Bishop's `buildMahadashas` math
 * extended to a configurable `mahaCount` (default 14, covers ~120+ years).
 */
export function computeMahadasha(
  birthUtc: Date,
  moonSidDeg: number,
  mahaCount = 14,
): DashaPeriod[] {
  const deg = norm360(moonSidDeg);
  const nakIdx = Math.min(Math.floor(deg / NAK_SPAN), 26);
  const birthLord = NAK_LORDS[nakIdx];
  const elapsed = (deg - nakIdx * NAK_SPAN) / NAK_SPAN;
  const remainYears = DASHA_YEARS[birthLord] * (1 - elapsed);

  const nowMs = Date.now();
  const startIdx = DASHA_ORDER.indexOf(birthLord);
  const periods: DashaPeriod[] = [];
  let cursorMs = birthUtc.getTime();

  // 1. Birth lord (partial — remainYears).
  {
    const dur = remainYears * SIDEREAL_YEAR_MS;
    const endMs = cursorMs + dur;
    const p: DashaPeriod = {
      level: "maha",
      lord: birthLord,
      start: new Date(cursorMs),
      end: new Date(endMs),
      years: remainYears,
      isCurrent: nowMs >= cursorMs && nowMs < endMs,
    };
    if (p.isCurrent) expandCurrentPath(p, nowMs); else ensureChildren(p, nowMs);
    periods.push(p);
    cursorMs = endMs;
  }

  // 2. Subsequent full Mahadashas.
  for (let i = 1; i < mahaCount; i++) {
    const lord = DASHA_ORDER[(startIdx + i) % 9];
    const years = DASHA_YEARS[lord];
    const endMs = cursorMs + years * SIDEREAL_YEAR_MS;
    const p: DashaPeriod = {
      level: "maha",
      lord,
      start: new Date(cursorMs),
      end: new Date(endMs),
      years,
      isCurrent: nowMs >= cursorMs && nowMs < endMs,
    };
    if (p.isCurrent) expandCurrentPath(p, nowMs); else ensureChildren(p, nowMs);
    periods.push(p);
    cursorMs = endMs;
  }
  return periods;
}

export interface CurrentDashaPath {
  maha: DashaPeriod | null;
  antar: DashaPeriod | null;
  pratyantar: DashaPeriod | null;
  sookshma: DashaPeriod | null;
  prana: DashaPeriod | null;
  deha: DashaPeriod | null;
}

export function findCurrentDasha(periods: DashaPeriod[]): CurrentDashaPath {
  const empty: CurrentDashaPath = { maha: null, antar: null, pratyantar: null, sookshma: null, prana: null, deha: null };
  const maha = periods.find((p) => p.isCurrent) ?? null;
  if (!maha) return empty;
  const antar = maha.children?.find((c) => c.isCurrent) ?? null;
  const pratyantar = antar?.children?.find((c) => c.isCurrent) ?? null;
  const sookshma = pratyantar?.children?.find((c) => c.isCurrent) ?? null;
  const prana = sookshma?.children?.find((c) => c.isCurrent) ?? null;
  const deha = prana?.children?.find((c) => c.isCurrent) ?? null;
  // Lazy-expand prana → deha if needed (only the active prana node may have skipped it).
  if (prana && !deha) {
    ensureChildren(prana);
    return { maha, antar, pratyantar, sookshma, prana, deha: prana.children?.find((c) => c.isCurrent) ?? null };
  }
  return { maha, antar, pratyantar, sookshma, prana, deha };
}
