// temporal layer: a chronological read of every dated element in the record, plus point-in-time
// snapshots of the record's findings and a diff between two of them. this is the room's memory —
// nothing here is projected or modelled, only what was actually recorded and when.
import type { HealthRecord, TimelineSnapshot } from "../store";
import { newId } from "../store";
import type { Finding } from "../model";
import { sortFindings } from "../model";
import { labFindings } from "../labs";
import { medicationFindings } from "../medications";
import { geneFindings } from "../genetics";
import { nutritionFindings, exposureFindings, surgeryFindings, familyFindings } from "../records";
import { painFindings } from "../pain";
import { symptomFindings } from "../symptoms";

export type TimelineKind =
  | "lab"
  | "pain"
  | "symptom"
  | "surgery"
  | "body-solve"
  | "observation"
  | "snapshot"
  | "session"
  | "wearable-range";

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineKind;
  label: string;
  detail: string;
}

/** every dated element of the record, oldest first. */
export function buildTimeline(record: HealthRecord): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const v of record.labs) {
    if (!v.takenAt) continue;
    events.push({ id: `lab:${v.key}:${v.takenAt}`, at: v.takenAt, kind: "lab", label: `${v.key} recorded`, detail: `${v.value}` });
  }
  for (const p of record.pain) {
    events.push({ id: `pain:${p.id}`, at: p.createdAt, kind: "pain", label: `pain report${p.partName ? ` — ${p.partName}` : ""}`, detail: `severity ${p.answers.severity ?? "unrecorded"}/10` });
  }
  for (const s of record.symptoms) {
    if (!s.since) continue;
    events.push({ id: `symptom:${s.id}`, at: s.since, kind: "symptom", label: `symptom noted since`, detail: `${s.symptomKey} · ${s.severity}/10` });
  }
  for (const s of record.surgeries) {
    if (!s.year) continue;
    events.push({ id: `surgery:${s.id}`, at: `${s.year}-01-01`, kind: "surgery", label: s.label, detail: s.note ?? "recorded procedure." });
  }
  for (const snap of record.snapshots) {
    events.push({ id: `snapshot:${snap.id}`, at: snap.at, kind: "snapshot", label: `snapshot: ${snap.label}`, detail: snap.note ?? `${snap.findings.length} findings held.` });
  }
  for (const session of record.sessions) {
    events.push({ id: `session:${session.id}`, at: session.startedAt, kind: "session", label: `${session.mode} session`, detail: session.summary });
  }
  for (const w of record.wearables) {
    if (w.points.length === 0) continue;
    const ordered = [...w.points].sort((a, b) => a.t.localeCompare(b.t));
    events.push({
      id: `wearable:${w.id}`,
      at: ordered[0].t,
      kind: "wearable-range",
      label: `${w.kind} series imported`,
      detail: `${ordered.length} points from ${w.source}, ${ordered[0].t.slice(0, 10)} to ${ordered[ordered.length - 1].t.slice(0, 10)}.`,
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function currentFindings(record: HealthRecord): Finding[] {
  return sortFindings([
    ...labFindings(record.labs),
    ...medicationFindings(record.medications),
    ...geneFindings(record.genes),
    ...nutritionFindings(record.nutrition),
    ...exposureFindings(record.exposures),
    ...surgeryFindings(record.surgeries),
    ...familyFindings(record.family),
    ...painFindings(record.pain),
    ...symptomFindings(record.symptoms),
  ]);
}

function currentMetrics(record: HealthRecord): Record<string, number> {
  const metrics: Record<string, number> = {
    labs: record.labs.length,
    medications: record.medications.length,
    symptoms: record.symptoms.length,
    painReports: record.pain.length,
  };
  for (const v of record.labs) metrics[`lab:${v.key}`] = v.value;
  return metrics;
}

/** capture the record's current findings and a handful of headline metrics as a saved snapshot. */
export function snapshotRecord(record: HealthRecord, label: string): TimelineSnapshot {
  return {
    id: newId("snapshot"),
    at: new Date().toISOString(),
    label,
    findings: currentFindings(record),
    metrics: currentMetrics(record),
  };
}

export interface SnapshotDiff {
  added: Finding[];
  resolved: Finding[];
  worsened: { id: string; label: string; from: number; to: number }[];
  improved: { id: string; label: string; from: number; to: number }[];
  metricChanges: { key: string; from: number; to: number; delta: number }[];
}

/** compare an earlier snapshot `a` against a later one `b`. */
export function compareSnapshots(a: TimelineSnapshot, b: TimelineSnapshot): SnapshotDiff {
  const aMap = new Map(a.findings.map((f) => [f.id, f]));
  const bMap = new Map(b.findings.map((f) => [f.id, f]));

  const added = b.findings.filter((f) => !aMap.has(f.id));
  const resolved = a.findings.filter((f) => !bMap.has(f.id));

  const worsened: SnapshotDiff["worsened"] = [];
  const improved: SnapshotDiff["improved"] = [];
  for (const [id, before] of aMap) {
    const after = bMap.get(id);
    if (!after) continue;
    if (after.weight > before.weight + 0.05) worsened.push({ id, label: after.label, from: before.weight, to: after.weight });
    else if (after.weight < before.weight - 0.05) improved.push({ id, label: after.label, from: before.weight, to: after.weight });
  }

  const metricChanges: SnapshotDiff["metricChanges"] = [];
  const keys = new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)]);
  for (const key of keys) {
    const from = a.metrics[key] ?? 0;
    const to = b.metrics[key] ?? 0;
    if (from !== to) metricChanges.push({ key, from, to, delta: to - from });
  }

  return { added, resolved, worsened, improved, metricChanges };
}
