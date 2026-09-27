// pre-session baseline and rolling-baseline comparison. a person's own history is the only
// reference used here — never a population norm presented as personal, never a value filled
// in when there isn't enough history yet.
import type { LiveSessionRecord } from "../store";
import type { SessionMode } from "./session";

/** fewer sessions than this and a rolling baseline is not claimed — only "not enough history yet". */
export const MIN_SESSIONS_FOR_BASELINE = 3;

export interface RollingBaseline {
  metric: string;
  mode: SessionMode;
  mean: number;
  stddev: number;
  sessionCount: number;
}

/** mean/stddev of one metric across the person's own past sessions of the same mode, excluding the current one. */
export function computeRollingBaseline(sessions: LiveSessionRecord[], mode: SessionMode, metric: string, excludeId?: string): RollingBaseline | null {
  const values = sessions
    .filter((s) => s.mode === mode && s.id !== excludeId && metric in s.metrics)
    .map((s) => s.metrics[metric]);
  if (values.length < MIN_SESSIONS_FOR_BASELINE) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { metric, mode, mean, stddev: Math.sqrt(variance), sessionCount: values.length };
}

export interface BaselineComparison {
  metric: string;
  status: "above-baseline" | "below-baseline" | "within-baseline" | "insufficient-history";
  value: number;
  baselineMean: number | null;
  deltaSd: number | null;
  detail: string;
}

/** compares one metric from a finished session to the person's own rolling baseline for that mode. */
export function compareToBaseline(session: LiveSessionRecord, priorSessions: LiveSessionRecord[], metric: string): BaselineComparison | null {
  if (!(metric in session.metrics)) return null;
  const value = session.metrics[metric];
  const baseline = computeRollingBaseline(priorSessions, session.mode, metric, session.id);
  if (!baseline) {
    return {
      metric,
      status: "insufficient-history",
      value,
      baselineMean: null,
      deltaSd: null,
      detail: `not enough ${session.mode} sessions yet to compare against — need at least ${MIN_SESSIONS_FOR_BASELINE}, have ${priorSessions.filter((s) => s.mode === session.mode && metric in s.metrics).length}.`,
    };
  }
  if (baseline.stddev === 0) {
    return {
      metric,
      status: "within-baseline",
      value,
      baselineMean: baseline.mean,
      deltaSd: 0,
      detail: `matches the flat baseline of ${baseline.mean.toFixed(1)} across ${baseline.sessionCount} sessions.`,
    };
  }
  const deltaSd = (value - baseline.mean) / baseline.stddev;
  const status = deltaSd > 0.75 ? "above-baseline" : deltaSd < -0.75 ? "below-baseline" : "within-baseline";
  const detail =
    status === "within-baseline"
      ? `close to this person's own ${session.mode} baseline of ${baseline.mean.toFixed(1)} (${baseline.sessionCount} prior sessions).`
      : `${Math.abs(deltaSd).toFixed(1)} sd ${status === "above-baseline" ? "above" : "below"} this person's own ${session.mode} baseline of ${baseline.mean.toFixed(1)} (${baseline.sessionCount} prior sessions).`;
  return { metric, status, value, baselineMean: baseline.mean, deltaSd: Number(deltaSd.toFixed(2)), detail };
}

/** runs the comparison across every metric the finished session actually reported. */
export function compareSessionToBaseline(session: LiveSessionRecord, priorSessions: LiveSessionRecord[]): BaselineComparison[] {
  return Object.keys(session.metrics)
    .map((metric) => compareToBaseline(session, priorSessions, metric))
    .filter((c): c is BaselineComparison => c !== null);
}
