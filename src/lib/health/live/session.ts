// session state machine for the headphone/wearable subsystem. it degrades gracefully — a
// lost signal downgrades the derived read-outs it feeds, it never ends the session or
// invents a replacement value.
import { newId, type LiveSessionRecord } from "../store";
import { computeHrv, type HrvResult } from "./analysis";

export type SessionState = "idle" | "contact-check" | "baseline" | "recording" | "paused" | "ended";

export type SessionMode = "focus" | "rest" | "meditation" | "sleep" | "open";

export interface SessionEvent {
  at: string;
  kind: "contact-lost" | "contact-regained" | "artefact-burst" | "state-change" | "note";
  detail: string;
}

export interface SignalContact {
  id: string;
  live: boolean;
  quality: number | null;
}

export interface RollingMetrics {
  bpm: number | null;
  rmssd: number | null;
  breathsPerMinute: number | null;
  eegState: string | null;
  tremorHz: number | null;
}

export interface SessionSnapshot {
  state: SessionState;
  mode: SessionMode;
  startedAt: string | null;
  events: SessionEvent[];
  contacts: Record<string, SignalContact>;
  metrics: RollingMetrics;
  /** metrics frozen from the pre-session baseline window; null until a baseline was captured. */
  baseline: RollingMetrics | null;
}

const CONTACT_QUALITY_FLOOR = 0.2;

export class LiveSession {
  private state: SessionState = "idle";
  private mode: SessionMode = "open";
  private startedAt: string | null = null;
  private events: SessionEvent[] = [];
  private contacts: Map<string, SignalContact> = new Map();
  private rrHistory: number[] = [];
  private bpmHistory: number[] = [];
  private breathHistory: number[] = [];
  private eegStateHistory: string[] = [];
  private tremorHistory: number[] = [];
  private baselineBpmHistory: number[] = [];
  private baselineRrHistory: number[] = [];
  private baselineBreathHistory: number[] = [];
  private baselineSnapshot: RollingMetrics | null = null;

  getSnapshot(): SessionSnapshot {
    return {
      state: this.state,
      mode: this.mode,
      startedAt: this.startedAt,
      events: [...this.events],
      contacts: Object.fromEntries(this.contacts),
      metrics: this.rollingMetrics(),
      baseline: this.baselineSnapshot,
    };
  }

  private captureBaselineSnapshot(): void {
    if (this.baselineBpmHistory.length === 0 && this.baselineRrHistory.length < 4 && this.baselineBreathHistory.length === 0) return;
    this.baselineSnapshot = {
      bpm: this.baselineBpmHistory.length ? this.baselineBpmHistory[this.baselineBpmHistory.length - 1] : null,
      rmssd: this.baselineRrHistory.length >= 4 ? computeHrv(this.baselineRrHistory).rmssd : null,
      breathsPerMinute: this.baselineBreathHistory.length ? this.baselineBreathHistory[this.baselineBreathHistory.length - 1] : null,
      eegState: null,
      tremorHz: null,
    };
  }

  private rollingMetrics(): RollingMetrics {
    return {
      bpm: this.bpmHistory.length ? this.bpmHistory[this.bpmHistory.length - 1] : null,
      rmssd: this.rrHistory.length >= 4 ? computeHrv(this.rrHistory).rmssd : null,
      breathsPerMinute: this.breathHistory.length ? this.breathHistory[this.breathHistory.length - 1] : null,
      eegState: this.eegStateHistory.length ? this.eegStateHistory[this.eegStateHistory.length - 1] : null,
      tremorHz: this.tremorHistory.length ? this.tremorHistory[this.tremorHistory.length - 1] : null,
    };
  }

  private log(kind: SessionEvent["kind"], detail: string): void {
    this.events.push({ at: new Date().toISOString(), kind, detail });
  }

  private transition(next: SessionState): void {
    this.log("state-change", `${this.state} → ${next}`);
    this.state = next;
  }

  beginContactCheck(mode: SessionMode): void {
    this.mode = mode;
    this.transition("contact-check");
  }

  beginBaseline(): void {
    if (this.state !== "contact-check" && this.state !== "idle") return;
    this.transition("baseline");
  }

  start(): void {
    if (this.state === "ended") return;
    if (this.state === "baseline") this.captureBaselineSnapshot();
    if (!this.startedAt) this.startedAt = new Date().toISOString();
    this.transition("recording");
  }

  pause(): void {
    if (this.state !== "recording") return;
    this.transition("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.transition("recording");
  }

  end(): void {
    this.transition("ended");
  }

  /** update contact state for one signal id; logs a lost/regained event only on a real transition. */
  updateContact(id: string, live: boolean, quality: number | null): void {
    const prev = this.contacts.get(id);
    this.contacts.set(id, { id, live, quality });
    if (prev && prev.live && !live) this.log("contact-lost", `${id} signal lost.`);
    if (prev && !prev.live && live) this.log("contact-regained", `${id} signal regained.`);
    if (quality !== null && quality < CONTACT_QUALITY_FLOOR && prev?.quality !== null && (prev?.quality ?? 1) >= CONTACT_QUALITY_FLOOR) {
      this.log("artefact-burst", `${id} quality dropped below usable threshold.`);
    }
  }

  pushHeart(bpm: number, rr: number[]): void {
    if (this.state !== "recording" && this.state !== "baseline") return;
    if (this.state === "baseline") {
      this.baselineBpmHistory.push(bpm);
      if (this.baselineBpmHistory.length > 200) this.baselineBpmHistory.shift();
      for (const v of rr) this.baselineRrHistory.push(v);
      if (this.baselineRrHistory.length > 500) this.baselineRrHistory.splice(0, this.baselineRrHistory.length - 500);
    }
    this.bpmHistory.push(bpm);
    if (this.bpmHistory.length > 500) this.bpmHistory.shift();
    for (const v of rr) this.rrHistory.push(v);
    if (this.rrHistory.length > 2000) this.rrHistory.splice(0, this.rrHistory.length - 2000);
  }

  pushBreath(breathsPerMinute: number): void {
    if (this.state !== "recording" && this.state !== "baseline") return;
    if (this.state === "baseline") {
      this.baselineBreathHistory.push(breathsPerMinute);
      if (this.baselineBreathHistory.length > 200) this.baselineBreathHistory.shift();
    }
    this.breathHistory.push(breathsPerMinute);
    if (this.breathHistory.length > 200) this.breathHistory.shift();
  }

  pushEegState(label: string): void {
    if (this.state !== "recording" && this.state !== "baseline") return;
    this.eegStateHistory.push(label);
    if (this.eegStateHistory.length > 200) this.eegStateHistory.shift();
  }

  pushTremor(hz: number): void {
    if (this.state !== "recording" && this.state !== "baseline") return;
    this.tremorHistory.push(hz);
    if (this.tremorHistory.length > 200) this.tremorHistory.shift();
  }

  /** source ids that actually produced data this session — never a listed capability alone. */
  private activeSources(): string[] {
    const out: string[] = [];
    if (this.bpmHistory.length) out.push("heart-rate");
    if (this.rrHistory.length >= 4) out.push("hrv");
    if (this.breathHistory.length) out.push("breathing");
    if (this.eegStateHistory.length) out.push("eeg");
    if (this.tremorHistory.length) out.push("motion");
    return out;
  }

  finaliseSession(): LiveSessionRecord {
    const endedAt = new Date().toISOString();
    const hrv: HrvResult | null = this.rrHistory.length >= 4 ? computeHrv(this.rrHistory) : null;
    const meanBpm = this.bpmHistory.length ? Math.round(this.bpmHistory.reduce((a, b) => a + b, 0) / this.bpmHistory.length) : null;
    const meanBreath = this.breathHistory.length ? Number((this.breathHistory.reduce((a, b) => a + b, 0) / this.breathHistory.length).toFixed(1)) : null;

    const metrics: Record<string, number> = {};
    if (meanBpm !== null) metrics.meanBpm = meanBpm;
    if (hrv?.rmssd !== null && hrv?.rmssd !== undefined) metrics.rmssd = hrv.rmssd;
    if (hrv?.sdnn !== null && hrv?.sdnn !== undefined) metrics.sdnn = hrv.sdnn;
    if (meanBreath !== null) metrics.breathsPerMinute = meanBreath;
    if (this.tremorHistory.length) metrics.meanTremorHz = Number((this.tremorHistory.reduce((a, b) => a + b, 0) / this.tremorHistory.length).toFixed(1));

    const sources = this.activeSources();
    const summaryParts: string[] = [];
    if (sources.length === 0) {
      summaryParts.push("no device produced usable data during this session.");
    } else {
      summaryParts.push(`live sources: ${sources.join(", ")}.`);
      if (meanBpm !== null) summaryParts.push(`mean heart rate ${meanBpm} bpm.`);
      if (hrv?.rmssd !== null && hrv?.rmssd !== undefined) summaryParts.push(`rmssd ${hrv.rmssd} ms (${hrv.confidence >= 0.5 ? "adequate" : "low"} confidence, ${hrv.beats} beats).`);
      if (meanBreath !== null) summaryParts.push(`mean breathing rate ${meanBreath} breaths/min.`);
    }
    const lostEvents = this.events.filter((e) => e.kind === "contact-lost").length;
    if (lostEvents > 0) summaryParts.push(`contact was lost and regained ${lostEvents} time(s) during the session.`);

    const baseline: Record<string, number> = {};
    if (this.baselineSnapshot?.bpm !== null && this.baselineSnapshot?.bpm !== undefined) baseline.bpm = this.baselineSnapshot.bpm;
    if (this.baselineSnapshot?.rmssd !== null && this.baselineSnapshot?.rmssd !== undefined) baseline.rmssd = this.baselineSnapshot.rmssd;
    if (this.baselineSnapshot?.breathsPerMinute !== null && this.baselineSnapshot?.breathsPerMinute !== undefined) baseline.breathsPerMinute = this.baselineSnapshot.breathsPerMinute;

    const record: LiveSessionRecord = {
      id: newId("live"),
      startedAt: this.startedAt ?? endedAt,
      endedAt,
      mode: this.mode,
      sources,
      metrics,
      baseline,
      events: this.events.map((e) => ({ at: e.at, kind: e.kind, detail: e.detail })),
      summary: summaryParts.join(" "),
    };
    this.transition("ended");
    return record;
  }
}

// ---------------------------------------------------------------------------------------
// longitudinal helpers
// ---------------------------------------------------------------------------------------

export interface TrendPoint {
  metric: string;
  values: { at: string; value: number }[];
  direction: "up" | "down" | "flat" | "insufficient-data";
  deltaFromPrevious: number | null;
}

/** compares a session to the person's previous sessions of the same mode, on shared metric keys only. */
export function compareToHistory(session: LiveSessionRecord, previousSessions: LiveSessionRecord[]): TrendPoint[] {
  const sameMode = previousSessions.filter((s) => s.mode === session.mode && s.id !== session.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const keys = new Set<string>(Object.keys(session.metrics));
  for (const s of sameMode) for (const k of Object.keys(s.metrics)) keys.add(k);

  const out: TrendPoint[] = [];
  for (const metric of keys) {
    const values = [...sameMode, session].filter((s) => metric in s.metrics).map((s) => ({ at: s.startedAt, value: s.metrics[metric] }));
    if (values.length < 2) {
      out.push({ metric, values, direction: "insufficient-data", deltaFromPrevious: null });
      continue;
    }
    const last = values[values.length - 1].value;
    const prev = values[values.length - 2].value;
    const delta = last - prev;
    const direction = Math.abs(delta) < prev * 0.03 ? "flat" : delta > 0 ? "up" : "down";
    out.push({ metric, values, direction, deltaFromPrevious: Number(delta.toFixed(2)) });
  }
  return out;
}

export function detectTrends(sessions: LiveSessionRecord[], mode: SessionMode, minSessions: number = 3): string[] {
  const filtered = sessions.filter((s) => s.mode === mode).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (filtered.length < minSessions) return [];
  const notes: string[] = [];
  const rmssdSeries = filtered.map((s) => s.metrics.rmssd).filter((v): v is number => typeof v === "number");
  if (rmssdSeries.length >= minSessions) {
    const first = rmssdSeries.slice(0, Math.ceil(rmssdSeries.length / 2));
    const second = rmssdSeries.slice(Math.ceil(rmssdSeries.length / 2));
    const firstMean = first.reduce((a, b) => a + b, 0) / first.length;
    const secondMean = second.reduce((a, b) => a + b, 0) / second.length;
    if (Math.abs(secondMean - firstMean) > firstMean * 0.1) {
      notes.push(`rmssd during ${mode} sessions has ${secondMean > firstMean ? "risen" : "fallen"} across the last ${filtered.length} sessions — a trend worth discussing, not a conclusion on its own.`);
    }
  }
  return notes;
}
