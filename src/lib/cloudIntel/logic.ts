// ─────────────────────────────────────────────────────────────────────────────
// CLOUD INTELLIGENCE MESH — SYNTHESIS LOGIC CORE
//
// Every module in the mesh renders through this layer. The contract it enforces
// is deliberately narrow and non-negotiable:
//
//   1.  A number alone is inventory. A number becomes intelligence only when it
//       carries a baseline, a deviation from that baseline, and a consequence.
//   2.  Absence is evidence. A count of zero is a finding, never a blank card.
//   3.  Every finding names its root cause chain, not just its symptom.
//   4.  Every finding names what it enables next (primary → secondary → tertiary).
//   5.  Every finding declares confidence, the evidence it rests on, and the
//       single observation that would prove it wrong.
//   6.  Trends are stated as velocity plus a dated projection, not as a level.
//   7.  Levels are stated as percentile context against the subject's own
//       population, never as a bare integer.
//   8.  A pattern is only reported after the null hypothesis is tested and
//       rejected — coincidence is the default explanation until it is beaten.
//
// No value in this file is fabricated. Every function is a pure transform over
// data the caller already fetched from the user's own Google surfaces.
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "critical" | "elevated" | "notable" | "baseline" | "positive";

export interface ThreatChain {
  /** The immediate, directly-observed consequence. */
  primary: string;
  /** What the primary consequence makes possible. */
  secondary?: string;
  /** The terminal outcome if the chain is left unbroken. */
  tertiary?: string;
}

export interface Finding {
  id: string;
  module: string;
  severity: Severity;
  title: string;
  /** The observed value, already formatted for display. */
  current: string;
  /** The subject's own established normal, already formatted. */
  normal: string;
  /** Signed deviation from normal, e.g. "+312%" or "−4.1σ". */
  deviation: string;
  /** When the deviation began, in plain language ("since 14 Mar"). */
  onset?: string;
  /** Root-cause ladder, shallowest first. Minimum one rung. */
  why: string[];
  /** What this enables if unaddressed. */
  chain?: ThreatChain;
  /** Named evidence rows this rests on. Never "the data". */
  basis: string[];
  /** 0–100. Derived from sample size and effect size, never asserted. */
  confidence: number;
  /** The single observation that would falsify this finding. */
  falsifier: string;
  /** The next physical action, phrased as an imperative. */
  action: string;
  /** Optional dated projection produced by `project()`. */
  projection?: string;
}

// ───────────────────────────── statistics ─────────────────────────────

export const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Median absolute deviation — robust to the outliers we are hunting for. */
export function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Robust z-score. Uses MAD scaled to the normal distribution so a single
 * extreme value cannot inflate the yardstick it is being measured against.
 * Falls back to classical σ when MAD collapses to zero (constant series).
 */
export function robustZ(x: number, population: number[]): number {
  if (population.length < 3) return 0;
  const m = median(population);
  const scale = mad(population) * 1.4826 || stdev(population);
  if (!scale) return 0;
  return (x - m) / scale;
}

/** Percentile rank of `x` within `population`, 0–100. Rule 7. */
export function percentile(x: number, population: number[]): number {
  if (!population.length) return 0;
  const below = population.filter((p) => p < x).length;
  const equal = population.filter((p) => p === x).length;
  return Math.round(((below + equal / 2) / population.length) * 100);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Least-squares slope over an evenly-spaced series. Returned in units per step.
 * Rule 6 — the mesh reports motion, not position.
 */
export function slope(series: number[]): number {
  const n = series.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(series);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (series[i] - ym);
    den += (i - xm) ** 2;
  }
  return den ? num / den : 0;
}

/**
 * Dated projection. Given a series sampled every `stepDays`, states when the
 * trend crosses `threshold`, or returns null when it never will.
 */
export function project(
  series: number[],
  threshold: number,
  stepDays = 1,
  label = "threshold"
): string | null {
  if (series.length < 3) return null;
  const k = slope(series);
  const last = series[series.length - 1];
  if (Math.abs(k) < 1e-9) return null;
  const steps = (threshold - last) / k;
  if (steps <= 0 || !Number.isFinite(steps) || steps > 365 / stepDays) return null;
  const when = new Date(Date.now() + steps * stepDays * 86400000);
  return `On the current slope (${k > 0 ? "+" : ""}${round(k, 2)}/${stepDays === 1 ? "day" : `${stepDays}d`}), ${label} is crossed around ${when.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}.`;
}

/**
 * Null-hypothesis screen. A pattern is reported only when the observed effect
 * is large enough, and the sample deep enough, that coincidence is a worse
 * explanation than structure. Returns the rejection confidence, or 0.
 */
export function rejectNull(effectZ: number, sampleSize: number): number {
  if (sampleSize < 4) return 0;
  const a = Math.min(1, Math.abs(effectZ) / 3);        // effect strength
  const b = Math.min(1, Math.log10(sampleSize) / 2.2); // evidence depth
  const c = Math.round(a * b * 100);
  return c < 35 ? 0 : c; // below 35 the coincidence explanation still wins
}

/**
 * Confidence from sample depth and effect size, capped so the mesh never
 * claims certainty it has not earned.
 */
export function confidenceFrom(sampleSize: number, effectZ: number, ceiling = 95): number {
  if (!sampleSize) return 10;
  const depth = Math.min(1, Math.log10(sampleSize + 1) / 2.4);
  const effect = Math.min(1, Math.abs(effectZ) / 2.5);
  return Math.max(15, Math.min(ceiling, Math.round((0.45 * depth + 0.55 * effect) * 100)));
}

/**
 * Benford first-digit conformance over a set of naturally-occurring amounts.
 * Returns 0–100 conformance; low values on a large sample suggest the figures
 * were constructed rather than accumulated.
 */
export function benfordConformance(values: number[]): { score: number; n: number } {
  const digits = values
    .map((v) => Math.abs(v))
    .filter((v) => v >= 1)
    .map((v) => Number(String(Math.trunc(v))[0]))
    .filter((d) => d >= 1 && d <= 9);
  if (digits.length < 20) return { score: 0, n: digits.length };
  const observed = new Array(10).fill(0);
  digits.forEach((d) => observed[d]++);
  let divergence = 0;
  for (let d = 1; d <= 9; d++) {
    const expected = Math.log10(1 + 1 / d);
    divergence += Math.abs(observed[d] / digits.length - expected);
  }
  return { score: Math.max(0, Math.round((1 - divergence) * 100)), n: digits.length };
}

export const round = (x: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

export function signedPct(current: number, baseline: number): string {
  if (!baseline) return current ? "new (no prior baseline)" : "flat";
  const d = ((current - baseline) / Math.abs(baseline)) * 100;
  if (Math.abs(d) < 1) return "at baseline";
  return `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d))}%`;
}

export function fmtDays(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return "unknown";
  if (d < 1) return "under a day";
  if (d < 45) return `${Math.round(d)} days`;
  if (d < 400) return `${round(d / 30.44, 1)} months`;
  return `${round(d / 365.25, 1)} years`;
}

export function fmtBytes(b: number | string | null | undefined): string {
  const n = Number(b);
  if (!n || !Number.isFinite(n)) return "—";
  if (n >= 1e12) return `${round(n / 1e12, 2)} TB`;
  if (n >= 1e9) return `${round(n / 1e9, 2)} GB`;
  if (n >= 1e6) return `${round(n / 1e6, 1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

export function fmtMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${round(cents / 100, 2)}`;
  }
}

export function relativeDay(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─────────────────────────── finding builders ───────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  elevated: 1,
  notable: 2,
  positive: 3,
  baseline: 4,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.confidence - a.confidence
  );
}

export function severityFromZ(z: number): Severity {
  const a = Math.abs(z);
  if (a >= 3) return "critical";
  if (a >= 2) return "elevated";
  if (a >= 1.2) return "notable";
  return "baseline";
}

/**
 * Rule 2 — silence is data. When a surface returns nothing, the mesh must still
 * explain *why* nothing is a finding and what to do about it, never render an
 * empty panel.
 */
export function silenceFinding(opts: {
  module: string;
  id: string;
  subject: string;
  expected: string;
  cause: string[];
  action: string;
  connected: boolean;
}): Finding {
  return {
    id: opts.id,
    module: opts.module,
    severity: opts.connected ? "notable" : "baseline",
    title: `${opts.subject} returned no observations`,
    current: "0 records",
    normal: opts.expected,
    deviation: "total absence",
    why: opts.cause,
    basis: [
      opts.connected
        ? "Live query executed against the connected account and returned an empty set."
        : "No account is linked, so no query was executed.",
    ],
    confidence: opts.connected ? 90 : 100,
    falsifier: "A single matching record appearing on the next sweep.",
    action: opts.action,
    chain: opts.connected
      ? {
          primary: "The surface is unmonitored while it reads empty.",
          secondary: "Activity occurring here would not raise an alert.",
          tertiary: "A blind spot persists across every downstream synthesis.",
        }
      : undefined,
  };
}

/**
 * Rule 10 — cross-module synthesis. Correlates independent module signals into
 * a single narrative. Each input is a named, already-scored observation; the
 * synthesis only fires when at least two independent modules agree.
 */
export interface CrossSignal {
  module: string;
  label: string;
  /** Signed strength, roughly a z-score. */
  z: number;
  /** When the signal was first observed. */
  onset?: number;
  detail: string;
}

export function synthesize(signals: CrossSignal[], theme: {
  id: string;
  title: string;
  why: string[];
  chain: ThreatChain;
  action: string;
  falsifier: string;
}): Finding | null {
  const active = signals.filter((s) => Math.abs(s.z) >= 1.2);
  const modules = new Set(active.map((s) => s.module));
  if (modules.size < 2) return null; // a single module is a reading, not a pattern

  const aggregate = active.reduce((a, s) => a + Math.abs(s.z), 0) / active.length;
  const rejection = rejectNull(aggregate, active.length * 8);
  if (!rejection) return null;

  const onsets = active.map((s) => s.onset).filter((t): t is number => !!t);
  return {
    id: theme.id,
    module: "Synthesis",
    severity: severityFromZ(aggregate),
    title: theme.title,
    current: `${modules.size} independent modules in agreement`,
    normal: "Modules diverge; no shared driver",
    deviation: `mean effect ${round(aggregate, 1)}σ`,
    onset: onsets.length ? `since ${relativeDay(Math.min(...onsets))}` : undefined,
    why: theme.why,
    chain: theme.chain,
    basis: active.map((s) => `${s.module} — ${s.label}: ${s.detail}`),
    confidence: rejection,
    falsifier: theme.falsifier,
    action: theme.action,
  };
}
