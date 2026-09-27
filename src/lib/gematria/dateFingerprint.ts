// Deterministic multi-axis numeric fingerprint for any calendar date.
// Every axis is a small non-negative integer so it can be compared 1:1
// against a gematria cipher sum / reduction / prime factor.

import { digitSum, recursiveReduce } from "@/lib/gematria";

export interface DateFingerprint {
  /** ISO YYYY-MM-DD (UTC). */
  iso: string;
  /** MM + DD + YYYY digit sum, single-pass. */
  numeroSum: number;
  /** Same, recursively reduced (honors 11/22/33). */
  numeroReduced: number;
  /** MM * DD (small product often echoed in short phrases). */
  monthDayProduct: number;
  /** 1-366. */
  dayOfYear: number;
  /** Day of year, recursively reduced. */
  dayOfYearReduced: number;
  /** ISO week (1-53). */
  isoWeek: number;
  /** Julian Day Number (integer). */
  julianDay: number;
  /** Prime factors of the Julian day (dedup, ascending). */
  julianPrimes: number[];
  /** Weekday, 0=Sun … 6=Sat. */
  weekday: number;
  /** Approx moon-phase index 0–29 (0 = new). Coarse, deterministic. */
  moonPhase: number;
}

/** Deterministic small-integer axes suitable for collision scoring. */
export function fingerprintOf(date: Date): DateFingerprint {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const iso = `${y.toString().padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const numero = digitSum(m) + digitSum(d) + digitSum(y);
  const jd = julianDay(y, m, d);
  const doy = dayOfYear(date);

  return {
    iso,
    numeroSum: numero,
    numeroReduced: recursiveReduce(numero),
    monthDayProduct: m * d,
    dayOfYear: doy,
    dayOfYearReduced: recursiveReduce(doy),
    isoWeek: isoWeekOf(date),
    julianDay: jd,
    julianPrimes: primeFactors(jd),
    weekday: date.getUTCDay(),
    moonPhase: Math.floor(((jd - 2451550.1) % 29.530588853 + 29.530588853) % 29.530588853),
  };
}

/** Standard Meeus JDN for a Gregorian date at 00:00 UTC. */
export function julianDay(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
       + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export function isoWeekOf(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

/** Trial-division prime factorization, ascending, deduplicated. Bounded by √n. */
export function primeFactors(n: number): number[] {
  const out = new Set<number>();
  let x = Math.abs(Math.trunc(n));
  if (x < 2) return [];
  for (let p = 2; p * p <= x; p++) {
    while (x % p === 0) { out.add(p); x = Math.floor(x / p); }
  }
  if (x > 1) out.add(x);
  return [...out].sort((a, b) => a - b);
}
