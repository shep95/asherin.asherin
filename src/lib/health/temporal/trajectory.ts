// temporal layer: forward projection. every trend here is a straight-line extrapolation of what
// is already in the record — never a prediction of an outcome, always a modelled continuation of
// a recorded direction, with a band that widens with the horizon and an explicit assumption list.
// whatIf() is a separate, non-record-derived table of textbook directions of effect: it never
// claims to model this person specifically.
import type { HealthRecord, WearableSeries } from "../store";
import { labDef, type LabValue } from "../labs";

export type Horizon = 3 | 6 | 12;
export const HORIZONS: Horizon[] = [3, 6, 12];

export interface ProjectedPoint {
  monthsAhead: Horizon;
  low: number;
  expected: number;
  high: number;
}

export interface TrajectoryProjection {
  metricKey: string;
  label: string;
  unit: string;
  history: { t: string; v: number }[];
  points: ProjectedPoint[];
  direction: "rising" | "falling" | "flat";
  confidence: number;
  assumptions: string[];
}

interface TimedPoint { t: number; v: number }

function linearFit(points: TimedPoint[]): { slope: number; intercept: number; residualSd: number } {
  const n = points.length;
  const meanT = points.reduce((a, p) => a + p.t, 0) / n;
  const meanV = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.v - meanV);
    den += (p.t - meanT) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanV - slope * meanT;
  const residuals = points.map((p) => p.v - (slope * p.t + intercept));
  const residualSd = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));
  return { slope, intercept, residualSd };
}

function projectFromFit(label: string, metricKey: string, unit: string, history: { t: string; v: number }[], points: TimedPoint[]): TrajectoryProjection {
  const { slope, intercept, residualSd } = linearFit(points);
  const lastT = points[points.length - 1].t;
  const dayMs = 24 * 60 * 60 * 1000;
  const projected: ProjectedPoint[] = HORIZONS.map((months) => {
    const t = lastT + months * 30 * dayMs;
    const expected = slope * t + intercept;
    const band = residualSd * (1 + months / 6);
    return { monthsAhead: months, low: Number((expected - band).toFixed(2)), expected: Number(expected.toFixed(2)), high: Number((expected + band).toFixed(2)) };
  });
  const slopePerMonth = slope * 30 * dayMs;
  const direction = Math.abs(slopePerMonth) < residualSd * 0.1 ? "flat" : slopePerMonth > 0 ? "rising" : "falling";
  const confidence = Math.max(0.1, Math.min(0.75, 0.2 + Math.min(points.length, 12) * 0.04 - (residualSd > 0 ? Math.min(0.2, residualSd / 20) : 0)));
  return {
    metricKey,
    label,
    unit,
    history,
    points: projected,
    direction,
    confidence,
    assumptions: [
      "assumes the recorded trend continues at its recent rate; it does not know about any change you plan to make.",
      "the band widens with distance because a straight line is a weaker assumption the further out it is projected.",
      history.length < 5 ? "this rests on a short history — a longer record would tighten this a great deal." : "based on the points you have recorded to date.",
    ],
  };
}

/** forward projections from every trend-capable series in the record: wearables, repeated labs, body solves. */
export function buildTrajectories(record: HealthRecord): TrajectoryProjection[] {
  const out: TrajectoryProjection[] = [];

  for (const w of record.wearables as WearableSeries[]) {
    if (w.points.length < 4) continue;
    const ordered = [...w.points].sort((a, b) => a.t.localeCompare(b.t));
    const points = ordered.map((p) => ({ t: new Date(p.t).getTime(), v: p.v }));
    out.push(projectFromFit(`${w.kind} (${w.source})`, `wearable:${w.kind}`, w.unit, ordered.map((p) => ({ t: p.t, v: p.v })), points));
  }

  const byLabKey = new Map<string, LabValue[]>();
  for (const v of record.labs as LabValue[]) {
    if (!v.takenAt) continue;
    const list = byLabKey.get(v.key) ?? [];
    list.push(v);
    byLabKey.set(v.key, list);
  }
  for (const [key, values] of byLabKey) {
    if (values.length < 3) continue;
    const def = labDef(key);
    const ordered = [...values].sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? ""));
    const points = ordered.map((v) => ({ t: new Date(v.takenAt!).getTime(), v: v.value }));
    out.push(projectFromFit(def?.label ?? key, `lab:${key}`, def?.unit ?? "", ordered.map((v) => ({ t: v.takenAt!, v: v.value })), points));
  }


  return out;
}

export type EffectDirection = "would likely raise" | "would likely lower" | "modelled direction uncertain";

export interface WhatIfEstimate {
  factor: string;
  target: string;
  direction: EffectDirection;
  magnitude: "small" | "moderate" | "large";
  mechanism: string;
}

export interface WhatIfInput {
  sleepHours?: number;
  activityMinutes?: number;
  weightDeltaKg?: number;
  alcoholUnits?: number;
  smokingStopped?: boolean;
  medicationChange?: "started" | "stopped" | "dose-increased" | "dose-decreased";
}

/**
 * textbook directions of effect for a hypothetical change — not a projection from this person's
 * data, and not a prediction of any outcome. every result restates that caveat.
 */
export function whatIf(input: WhatIfInput): { estimates: WhatIfEstimate[]; caveat: string } {
  const estimates: WhatIfEstimate[] = [];

  if (typeof input.sleepHours === "number") {
    const short = input.sleepHours < 7;
    estimates.push({
      factor: `sleep at ${input.sleepHours}h/night`,
      target: "inflammatory tone and stress load",
      direction: short ? "would likely raise" : "would likely lower",
      magnitude: input.sleepHours < 6 || input.sleepHours > 9 ? "large" : "moderate",
      mechanism: "sleep duration outside roughly 7–9 hours is associated with raised sympathetic tone and inflammatory markers over weeks, not a single night.",
    });
  }
  if (typeof input.activityMinutes === "number") {
    estimates.push({
      factor: `${input.activityMinutes} minutes of activity/week`,
      target: "cardiometabolic and postural load",
      direction: input.activityMinutes >= 150 ? "would likely lower" : "would likely raise",
      magnitude: input.activityMinutes < 60 || input.activityMinutes > 300 ? "large" : "moderate",
      mechanism: "regular activity improves insulin sensitivity, lipoprotein lipase activity and venous return; the standard reference threshold is 150 minutes/week.",
    });
  }
  if (typeof input.weightDeltaKg === "number" && input.weightDeltaKg !== 0) {
    estimates.push({
      factor: `${input.weightDeltaKg > 0 ? "+" : ""}${input.weightDeltaKg}kg`,
      target: "metabolic and joint load",
      direction: input.weightDeltaKg > 0 ? "would likely raise" : "would likely lower",
      magnitude: Math.abs(input.weightDeltaKg) > 5 ? "large" : "moderate",
      mechanism: "weight change shifts insulin sensitivity, arterial lipid load and mechanical load on weight-bearing joints in the same direction as the change.",
    });
  }
  if (typeof input.alcoholUnits === "number") {
    estimates.push({
      factor: `${input.alcoholUnits} units/week`,
      target: "liver, pancreas and blood pressure",
      direction: input.alcoholUnits > 14 ? "would likely raise" : input.alcoholUnits === 0 ? "would likely lower" : "modelled direction uncertain",
      magnitude: input.alcoholUnits > 21 ? "large" : "moderate",
      mechanism: "acetaldehyde load on hepatocytes scales with weekly total, not any single occasion.",
    });
  }
  if (input.smokingStopped) {
    estimates.push({
      factor: "smoking stopped",
      target: "vascular and respiratory territories",
      direction: "would likely lower",
      magnitude: "large",
      mechanism: "measurable cardiovascular risk reduction begins within a year of stopping and continues for a decade; this is one of the best-evidenced directions in this table.",
    });
  }
  if (input.medicationChange) {
    estimates.push({
      factor: `medication ${input.medicationChange.replace("-", " ")}`,
      target: "whichever territory that medication acts on or clears through",
      direction: "modelled direction uncertain",
      magnitude: "moderate",
      mechanism: "the direction here depends entirely on which medication and why; this room does not estimate it without that specific drug named.",
    });
  }

  return {
    estimates,
    caveat: "these are modelled directions of effect drawn from general physiology, not a prediction for you specifically and not a recommendation. discuss any change with a clinician, especially around medication.",
  };
}
