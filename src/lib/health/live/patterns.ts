// longitudinal patterns across saved sessions. every function here refuses to name a pattern
// until it has seen enough sessions — the threshold is explicit and returned alongside any
// claim so the panel can say plainly "not enough sessions yet" instead of guessing early.
import type { LiveSessionRecord } from "../store";
import type { SessionMode } from "./session";
import { computeRollingBaseline } from "./baseline";

/** the floor below which no pattern is claimed, for any pattern kind in this module. */
export const MIN_SESSIONS_FOR_PATTERN = 5;

export interface PerModeTrend {
  mode: SessionMode;
  metric: string;
  sessionCount: number;
  firstHalfMean: number;
  secondHalfMean: number;
  direction: "rising" | "falling" | "flat" | "insufficient-data";
  detail: string;
}

export function perModeTrend(sessions: LiveSessionRecord[], mode: SessionMode, metric: string): PerModeTrend | null {
  const values = sessions
    .filter((s) => s.mode === mode && metric in s.metrics)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((s) => s.metrics[metric]);
  if (values.length < MIN_SESSIONS_FOR_PATTERN) {
    return {
      mode,
      metric,
      sessionCount: values.length,
      firstHalfMean: NaN,
      secondHalfMean: NaN,
      direction: "insufficient-data",
      detail: `only ${values.length} ${mode} session(s) with ${metric} — need at least ${MIN_SESSIONS_FOR_PATTERN} before a trend is claimed.`,
    };
  }
  const mid = Math.ceil(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const firstHalfMean = first.reduce((a, b) => a + b, 0) / first.length;
  const secondHalfMean = second.reduce((a, b) => a + b, 0) / second.length;
  const relChange = firstHalfMean === 0 ? 0 : (secondHalfMean - firstHalfMean) / Math.abs(firstHalfMean);
  const direction = Math.abs(relChange) < 0.05 ? "flat" : relChange > 0 ? "rising" : "falling";
  return {
    mode,
    metric,
    sessionCount: values.length,
    firstHalfMean: Number(firstHalfMean.toFixed(2)),
    secondHalfMean: Number(secondHalfMean.toFixed(2)),
    direction,
    detail:
      direction === "flat"
        ? `${metric} during ${mode} sessions has stayed roughly flat across ${values.length} sessions.`
        : `${metric} during ${mode} sessions has been ${direction} across ${values.length} sessions (${firstHalfMean.toFixed(1)} → ${secondHalfMean.toFixed(1)}).`,
  };
}

export interface BucketPattern {
  kind: "day-of-week" | "time-of-day";
  bucket: string;
  sessionCount: number;
  mean: number | null;
}

export interface BucketedPatternResult {
  kind: "day-of-week" | "time-of-day";
  metric: string;
  sufficient: boolean;
  totalSessions: number;
  buckets: BucketPattern[];
  detail: string;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TIME_BUCKETS: { label: string; startHour: number; endHour: number }[] = [
  { label: "night (00-06)", startHour: 0, endHour: 6 },
  { label: "morning (06-12)", startHour: 6, endHour: 12 },
  { label: "afternoon (12-18)", startHour: 12, endHour: 18 },
  { label: "evening (18-24)", startHour: 18, endHour: 24 },
];

function bucketMeans(sessions: LiveSessionRecord[], metric: string, bucketKeyFor: (d: Date) => string, order: string[]): BucketPattern[] {
  const grouped = new Map<string, number[]>();
  for (const s of sessions) {
    if (!(metric in s.metrics)) continue;
    const key = bucketKeyFor(new Date(s.startedAt));
    grouped.set(key, [...(grouped.get(key) ?? []), s.metrics[metric]]);
  }
  return order.map((bucket) => {
    const values = grouped.get(bucket) ?? [];
    return {
      kind: "day-of-week" as const,
      bucket,
      sessionCount: values.length,
      mean: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null,
    };
  });
}

/** groups a metric by day of week; refuses to claim a pattern under the session-count floor. */
export function dayOfWeekPattern(sessions: LiveSessionRecord[], mode: SessionMode, metric: string): BucketedPatternResult {
  const filtered = sessions.filter((s) => s.mode === mode && metric in s.metrics);
  const sufficient = filtered.length >= MIN_SESSIONS_FOR_PATTERN;
  const buckets = sufficient ? bucketMeans(filtered, metric, (d) => DAY_NAMES[d.getDay()], DAY_NAMES) : [];
  return {
    kind: "day-of-week",
    metric,
    sufficient,
    totalSessions: filtered.length,
    buckets,
    detail: sufficient
      ? `day-of-week comparison across ${filtered.length} ${mode} sessions.`
      : `only ${filtered.length} ${mode} session(s) — need at least ${MIN_SESSIONS_FOR_PATTERN} before a day-of-week pattern is claimed.`,
  };
}

/** groups a metric by time-of-day bucket; same explicit floor as the day-of-week pattern. */
export function timeOfDayPattern(sessions: LiveSessionRecord[], mode: SessionMode, metric: string): BucketedPatternResult {
  const filtered = sessions.filter((s) => s.mode === mode && metric in s.metrics);
  const sufficient = filtered.length >= MIN_SESSIONS_FOR_PATTERN;
  const order = TIME_BUCKETS.map((b) => b.label);
  const bucketFor = (d: Date) => TIME_BUCKETS.find((b) => d.getHours() >= b.startHour && d.getHours() < b.endHour)?.label ?? order[0];
  const buckets = sufficient
    ? bucketMeans(filtered, metric, bucketFor, order).map((b) => ({ ...b, kind: "time-of-day" as const }))
    : [];
  return {
    kind: "time-of-day",
    metric,
    sufficient,
    totalSessions: filtered.length,
    buckets,
    detail: sufficient
      ? `time-of-day comparison across ${filtered.length} ${mode} sessions.`
      : `only ${filtered.length} ${mode} session(s) — need at least ${MIN_SESSIONS_FOR_PATTERN} before a time-of-day pattern is claimed.`,
  };
}

export interface DriftResult {
  metric: string;
  mode: SessionMode;
  sufficient: boolean;
  latestValue: number | null;
  baselineMean: number | null;
  drift: number | null;
  detail: string;
}

/** how far the most recent session's metric sits from the rolling baseline of everything before it. */
export function driftVsBaseline(sessions: LiveSessionRecord[], mode: SessionMode, metric: string): DriftResult {
  const sameMode = sessions.filter((s) => s.mode === mode).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (sameMode.length < MIN_SESSIONS_FOR_PATTERN) {
    return {
      metric,
      mode,
      sufficient: false,
      latestValue: null,
      baselineMean: null,
      drift: null,
      detail: `only ${sameMode.length} ${mode} session(s) — need at least ${MIN_SESSIONS_FOR_PATTERN} before drift is claimed.`,
    };
  }
  const latest = sameMode[sameMode.length - 1];
  if (!(metric in latest.metrics)) {
    return { metric, mode, sufficient: false, latestValue: null, baselineMean: null, drift: null, detail: `the most recent ${mode} session did not record ${metric}.` };
  }
  const priors = sameMode.slice(0, -1);
  const baseline = computeRollingBaseline(priors, mode, metric, latest.id);
  if (!baseline) {
    return { metric, mode, sufficient: false, latestValue: latest.metrics[metric], baselineMean: null, drift: null, detail: `not enough prior ${mode} sessions with ${metric} to establish a baseline.` };
  }
  const drift = latest.metrics[metric] - baseline.mean;
  return {
    metric,
    mode,
    sufficient: true,
    latestValue: latest.metrics[metric],
    baselineMean: Number(baseline.mean.toFixed(2)),
    drift: Number(drift.toFixed(2)),
    detail: `latest ${metric} is ${drift >= 0 ? "+" : ""}${drift.toFixed(1)} from the ${baseline.sessionCount}-session baseline of ${baseline.mean.toFixed(1)}.`,
  };
}
