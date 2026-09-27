// Resonance engine — hunts multi-axis collisions between a phrase's
// gematria fingerprint and a date's numeric fingerprint.
//
// Every finding carries an explicit evidence bundle (which axes matched,
// rarity weight, precedent count) and a falsifiable window. This is a
// statistical collision search, not a mystical claim.

import { computeAll, recursiveReduce, type CipherKey } from "@/lib/gematria";
import { fingerprintOf, primeFactors, type DateFingerprint } from "./dateFingerprint";
import { DATED_EVENTS, KNOWN_FUTURE_MARKERS, type DatedEvent } from "./eventCorpus";

export interface PhraseFingerprint {
  phrase: string;
  ordinal: number;
  reduction: number;
  reverse: number;
  chaldean: number;
  ordinalReduced: number;
  reverseReduced: number;
  ordinalPrimes: number[];
  reversePrimes: number[];
}

export function phraseFingerprintOf(phrase: string): PhraseFingerprint {
  const r = computeAll(phrase);
  return {
    phrase,
    ordinal: r.ordinal.sum,
    reduction: r.reduction.sum,
    reverse: r.reverse.sum,
    chaldean: r.chaldean.sum,
    ordinalReduced: recursiveReduce(r.ordinal.sum),
    reverseReduced: recursiveReduce(r.reverse.sum),
    ordinalPrimes: primeFactors(r.ordinal.sum),
    reversePrimes: primeFactors(r.reverse.sum),
  };
}

export type Axis =
  | "ordinal-numero"
  | "ordinal-dayOfYear"
  | "reduction-numeroReduced"
  | "reduction-monthDayProduct"
  | "reverse-julianPrime"
  | "reverse-isoWeek"
  | "chaldean-monthDayProduct"
  | "chaldean-numeroReduced"
  | "reduced-moon"
  | "reduced-weekday";

export interface AxisHit {
  axis: Axis;
  phraseSide: string;   // "ordinal=245"
  dateSide: string;     // "MM+DD+YYYY=245"
  rarity: number;       // 1 / expected-collision-frequency
}

/** Approximate value-frequency weights: bigger number → rarer collision. */
function rarityFor(value: number): number {
  if (value <= 9) return 1;      // single digit — extremely common
  if (value <= 31) return 2;     // day-of-month range
  if (value <= 99) return 4;
  if (value <= 366) return 8;    // day-of-year range
  if (value <= 999) return 16;
  return 24;
}

/** Return every axis on which this phrase and this date collide. */
export function findAxisHits(pf: PhraseFingerprint, df: DateFingerprint): AxisHit[] {
  const hits: AxisHit[] = [];

  const push = (axis: Axis, a: number, b: number, aLbl: string, bLbl: string) => {
    if (a === b && a > 0) hits.push({
      axis,
      phraseSide: `${aLbl}=${a}`,
      dateSide: `${bLbl}=${b}`,
      rarity: rarityFor(a),
    });
  };

  push("ordinal-numero",           pf.ordinal, df.numeroSum,          "ordinal",    "MM+DD+YYYY");
  push("ordinal-dayOfYear",        pf.ordinal, df.dayOfYear,          "ordinal",    "day-of-year");
  push("reduction-numeroReduced",  pf.reduction, df.numeroReduced,    "reduction",  "numero(reduced)");
  push("reduction-monthDayProduct",pf.reduction, df.monthDayProduct,  "reduction",  "MM×DD");
  push("reverse-isoWeek",          pf.reverse, df.isoWeek,            "reverse",    "ISO-week");
  push("chaldean-monthDayProduct", pf.chaldean, df.monthDayProduct,   "chaldean",   "MM×DD");
  push("chaldean-numeroReduced",   pf.chaldean, df.numeroReduced,     "chaldean",   "numero(reduced)");
  push("reduced-moon",             pf.ordinalReduced, df.moonPhase,   "ord.reduced","moon-phase");
  push("reduced-weekday",          pf.ordinalReduced, df.weekday,     "ord.reduced","weekday");

  // Prime-factor overlap between reverse ordinal and the Julian day.
  for (const p of pf.reversePrimes) {
    if (p >= 5 && df.julianPrimes.includes(p)) {
      hits.push({
        axis: "reverse-julianPrime",
        phraseSide: `reverse-prime=${p}`,
        dateSide: `julian-prime=${p}`,
        rarity: rarityFor(p),
      });
    }
  }

  return hits;
}

/** Weighted resonance score: rare collisions dominate; single-digit ones don't. */
export function scoreHits(hits: AxisHit[]): number {
  if (hits.length === 0) return 0;
  const raw = hits.reduce((a, h) => a + h.rarity, 0);
  // Superlinear axis-count bonus: 3 collisions >> 3× one collision.
  return +(raw * Math.pow(hits.length, 0.6)).toFixed(2);
}

export type Direction = "past" | "present" | "future";

export interface Resonance {
  date: string;         // YYYY-MM-DD
  event?: DatedEvent;
  hits: AxisHit[];
  score: number;
  direction: Direction;
}

export interface DirectionalOutput {
  past: Resonance[];
  present: Resonance[];
  future: Resonance[];
}

/**
 * Full projection: score every known historical event as past, the next
 * 30 days as present, and every day in the next N years as future.
 * Returns top-k per direction.
 */
export function projectResonance(
  phrase: string,
  opts: { futureYears?: number; topK?: number; now?: Date } = {},
): DirectionalOutput {
  const { futureYears = 4, topK = 8, now = new Date() } = opts;
  const pf = phraseFingerprintOf(phrase);
  if (pf.ordinal === 0) return { past: [], present: [], future: [] };

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // PAST — score all historical events.
  const past: Resonance[] = [];
  for (const ev of DATED_EVENTS) {
    const d = new Date(ev.d + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) continue;
    const hits = findAxisHits(pf, fingerprintOf(d));
    if (hits.length === 0) continue;
    past.push({ date: ev.d, event: ev, hits, score: scoreHits(hits), direction: "past" });
  }
  past.sort((a, b) => b.score - a.score);

  // PRESENT — next 30 days, no anchor event required (we surface high-collision windows).
  const present: Resonance[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getTime() + i * 86_400_000);
    const df = fingerprintOf(d);
    const hits = findAxisHits(pf, df);
    if (hits.length === 0) continue;
    present.push({ date: df.iso, hits, score: scoreHits(hits), direction: "present" });
  }
  present.sort((a, b) => b.score - a.score);

  // FUTURE — every day out to futureYears; if a known marker falls on that
  // day, attach it. Bound the scan to keep it under ~1500 days per year.
  const future: Resonance[] = [];
  const markerByDate = new Map(KNOWN_FUTURE_MARKERS.map((e) => [e.d, e]));
  const days = Math.min(futureYears * 366, 366 * 6);
  const minScoreForFuture = 6; // filter noise from short-phrase collisions
  for (let i = 31; i <= days; i++) {
    const d = new Date(today.getTime() + i * 86_400_000);
    const df = fingerprintOf(d);
    const hits = findAxisHits(pf, df);
    if (hits.length < 2) continue; // future needs multi-axis
    const score = scoreHits(hits);
    if (score < minScoreForFuture && !markerByDate.has(df.iso)) continue;
    future.push({ date: df.iso, event: markerByDate.get(df.iso), hits, score, direction: "future" });
  }
  future.sort((a, b) => b.score - a.score);

  return {
    past: past.slice(0, topK),
    present: present.slice(0, topK),
    future: future.slice(0, topK),
  };
}

export interface Theory {
  id: string;                // stable hash of phrase + direction + date
  phrase: string;
  direction: Direction;
  date: string;
  score: number;
  confidence: "low" | "medium" | "high";
  hits: AxisHit[];
  event?: DatedEvent;
  precedents: { date: string; title: string; score: number }[];
  hypothesis: string;
  falsifiability: string;
  status: "open" | "confirmed" | "refuted";
  createdAt: string;
  resolvedAt?: string;
}

/** Deterministic id so re-computing the same theory doesn't duplicate. */
export function theoryId(phrase: string, direction: Direction, date: string): string {
  const key = `${phrase.trim().toLowerCase()}|${direction}|${date}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `t_${(h >>> 0).toString(36)}`;
}

export function synthesizeTheory(
  phrase: string,
  r: Resonance,
  precedents: Resonance[],
): Theory {
  const confidence: Theory["confidence"] =
    r.score >= 30 && precedents.length >= 2 ? "high"
    : r.score >= 15 || precedents.length >= 1 ? "medium"
    : "low";

  const axisSummary = r.hits.map((h) => h.axis.replace(/-/g, " ")).join(", ");
  const hypothesis = r.direction === "future"
    ? `"${phrase}" resonates with ${r.date} on ${r.hits.length} axes (${axisSummary})${r.event ? ` — a known marker: ${r.event.t}` : ""}. Historical precedent pattern suggests a category-matched event window ±3 days.`
    : r.direction === "present"
    ? `"${phrase}" collides with ${r.date} on ${r.hits.length} axes. Watch news within ±2 days for a same-category surface.`
    : `"${phrase}" echoes ${r.event?.t ?? r.date} across ${r.hits.length} axes (${axisSummary}).`;

  const falsifiability = r.direction === "future"
    ? `If no notable ${dominantCategory(precedents)} event occurs within ${r.date} ±3 days, theory is refuted.`
    : r.direction === "present"
    ? `If no matching event surfaces within ${r.date} ±2 days, theory is refuted.`
    : `Historical observation — no refutation window.`;

  return {
    id: theoryId(phrase, r.direction, r.date),
    phrase,
    direction: r.direction,
    date: r.date,
    score: r.score,
    confidence,
    hits: r.hits,
    event: r.event,
    precedents: precedents.slice(0, 5).map((p) => ({
      date: p.date,
      title: p.event?.t ?? p.date,
      score: p.score,
    })),
    hypothesis,
    falsifiability,
    status: "open",
    createdAt: new Date().toISOString(),
  };
}

function dominantCategory(precedents: Resonance[]): string {
  const counts = new Map<string, number>();
  for (const p of precedents) if (p.event) counts.set(p.event.c, (counts.get(p.event.c) ?? 0) + 1);
  let best = "notable"; let n = 0;
  for (const [c, k] of counts) if (k > n) { best = c; n = k; }
  return best;
}

// Cipher-to-axis mapping used by UI to explain which cipher a hit came from.
export const AXIS_CIPHER: Record<Axis, CipherKey | "reduced"> = {
  "ordinal-numero": "ordinal",
  "ordinal-dayOfYear": "ordinal",
  "reduction-numeroReduced": "reduction",
  "reduction-monthDayProduct": "reduction",
  "reverse-julianPrime": "reverse",
  "reverse-isoWeek": "reverse",
  "chaldean-monthDayProduct": "chaldean",
  "chaldean-numeroReduced": "chaldean",
  "reduced-moon": "reduced",
  "reduced-weekday": "reduced",
};
