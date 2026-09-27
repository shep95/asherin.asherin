// functional layer: inflammatory load per territory, built only from what is actually
// recorded — labs (crp/esr/ferritin/wbc), symptoms, pain reports, exposures, nutrition and
// wearable sleep/hrv series. every load carries the inputs that produced it and a confidence
// that falls when the evidence is thin. never a diagnosis, never a synthesised lab value.
import type { HealthRecord } from "../store";
import type { Finding } from "../model";
import { labDef, type LabValue } from "../labs";
import { SYMPTOMS, type SymptomEntry } from "../symptoms";
import { reasonAboutPain, type PainReport } from "../pain";
import { EXPOSURES, type ExposureEntry } from "../records";
import { NUTRIENTS, type NutritionEntry } from "../records";
import type { WearableSeries } from "../store";

export interface TerritoryInflammation {
  territoryKey: string;
  /** 0..1 inflammatory load estimate for this territory. */
  load: number;
  inputs: string[];
  mechanism: string;
  confidence: number;
}

/** generic thresholds for markers this room does not carry a full reference definition for. */
const GENERIC_MARKER_THRESHOLDS: Record<string, { high: number; label: string; unit: string }> = {
  esr: { high: 20, label: "esr", unit: "mm/hr" },
  wbc: { high: 11, label: "white cell count", unit: "x10⁹/L" },
};

const INFLAMMATION_SYMPTOM_KEYS = ["joint-stiffness", "fatigue", "night-sweats", "bloating", "headache", "brain-fog"];
const INFLAMMATION_EXPOSURE_KEYS = ["tobacco", "alcohol", "air-pollution", "sedentary"];

function addLoad(map: Map<string, TerritoryInflammation>, key: string, delta: number, input: string, mechanism: string) {
  const existing = map.get(key);
  if (existing) {
    existing.load = Math.min(1, existing.load + delta);
    if (!existing.inputs.includes(input)) existing.inputs.push(input);
  } else {
    map.set(key, { territoryKey: key, load: Math.min(1, delta), inputs: [input], mechanism, confidence: 0 });
  }
}

export function computeInflammation(record: HealthRecord): { territories: TerritoryInflammation[]; findings: Finding[] } {
  const map = new Map<string, TerritoryInflammation>();

  // labs: crp and ferritin are already defined analytes; esr and wbc use a generic threshold
  // because this room does not carry a full reference interval for them yet.
  for (const v of record.labs as LabValue[]) {
    const def = labDef(v.key);
    if (def && v.value > def.high && def.elevated) {
      for (const t of def.elevated.territoryKeys) addLoad(map, t, 0.3, `${def.label} ${v.value} ${def.unit} above reference`, def.elevated.mechanism);
    }
    const generic = GENERIC_MARKER_THRESHOLDS[v.key];
    if (generic && v.value > generic.high) {
      for (const t of ["liver", "peripheral-arteries", "lymph-nodes"]) {
        addLoad(map, t, 0.25, `${generic.label} ${v.value} ${generic.unit} above ${generic.high}`, "a raised acute-phase or leukocyte marker reports systemic inflammatory tone, not its source.");
      }
    }
  }

  for (const e of record.symptoms as SymptomEntry[]) {
    if (!INFLAMMATION_SYMPTOM_KEYS.includes(e.symptomKey)) continue;
    const def = SYMPTOMS.find((s) => s.key === e.symptomKey);
    if (!def) continue;
    const delta = Math.max(0.1, Math.min(0.4, e.severity / 20));
    for (const t of def.territoryKeys) addLoad(map, t, delta, `symptom: ${def.label} (${e.severity}/10)`, def.mechanism);
  }

  for (const p of record.pain as PainReport[]) {
    const reasoning = reasonAboutPain(p);
    const pattern = p.answers.pattern;
    const morningStiffness = pattern === "morning";
    if (reasoning.tissue === "joint" || morningStiffness) {
      const severity = Number(p.answers.severity ?? 5);
      const delta = Math.max(0.1, Math.min(0.35, severity / 25)) * (morningStiffness ? 1.3 : 1);
      for (const t of p.territoryKeys) {
        addLoad(map, t, delta, `pain report${p.partName ? ` (${p.partName})` : ""}: ${morningStiffness ? "morning stiffness pattern" : "joint-pattern pain"}`, "prolonged morning stiffness and load-independent joint pain are the pattern most associated with an inflammatory rather than a purely mechanical origin.");
      }
    }
  }

  for (const x of record.exposures as ExposureEntry[]) {
    if (!INFLAMMATION_EXPOSURE_KEYS.includes(x.exposureKey)) continue;
    const def = EXPOSURES.find((d) => d.key === x.exposureKey);
    if (!def) continue;
    const delta = x.intensity === "current-high" ? 0.3 : x.intensity === "current-low" ? 0.18 : 0.1;
    for (const t of def.territoryKeys) addLoad(map, t, delta, `exposure: ${def.label} (${x.intensity.replace("-", " ")})`, def.mechanism + " this also drives systemic inflammatory tone.");
  }

  for (const n of record.nutrition as NutritionEntry[]) {
    if (n.status !== "low") continue;
    if (!["omega3", "vitamin-d", "fibre"].includes(n.nutrientKey)) continue;
    const def = NUTRIENTS.find((d) => d.key === n.nutrientKey);
    if (!def) continue;
    for (const t of def.territoryKeys) addLoad(map, t, 0.12, `nutrition: ${def.label} recorded low`, `${def.deficiencyMechanism} low intake here is one of the inputs known to raise inflammatory tone.`);
  }

  // wearable sleep/hrv: short sleep and low hrv are both associated with raised inflammatory
  // markers in the literature; this is stated as an association, not a measured marker.
  const sleep = (record.wearables as WearableSeries[]).find((w) => w.kind === "sleep");
  if (sleep && sleep.points.length >= 3) {
    const recent = sleep.points.slice(-7);
    const avg = recent.reduce((a, p) => a + p.v, 0) / recent.length;
    if (avg < 6) {
      for (const t of ["heart", "peripheral-arteries", "liver"]) {
        addLoad(map, t, 0.15, `wearable sleep: ${avg.toFixed(1)}h average over last ${recent.length} nights`, "short sleep duration is associated with raised inflammatory tone through sympathetic and metabolic pathways; this is an association, not a direct marker.");
      }
    }
  }
  const hrv = (record.wearables as WearableSeries[]).find((w) => w.kind === "hrv");
  if (hrv && hrv.points.length >= 5) {
    const all = hrv.points.map((p) => p.v);
    const baseline = all.slice(0, Math.max(1, all.length - 5)).reduce((a, b) => a + b, 0) / Math.max(1, all.length - 5);
    const recent = all.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (baseline > 0 && recent < baseline * 0.8) {
      for (const t of ["heart", "adrenal"]) {
        addLoad(map, t, 0.1, `wearable hrv: recent average ${recent.toFixed(0)} vs baseline ${baseline.toFixed(0)}`, "a sustained drop in hrv tracks with sympathetic dominance, which co-travels with inflammatory tone; it is not itself an inflammatory marker.");
      }
    }
  }

  const territories = [...map.values()].map((t) => ({
    ...t,
    confidence: Math.max(0.15, Math.min(0.85, 0.2 + t.inputs.length * 0.15)),
  }));

  const findings: Finding[] = territories
    .filter((t) => t.load >= 0.25)
    .map((t) => ({
      id: `inflammation:${t.territoryKey}`,
      layer: "inflammation" as const,
      label: `inflammatory load — ${t.territoryKey.replace(/-/g, " ")}`,
      detail: `built from: ${t.inputs.join("; ")}.`,
      mechanism: t.mechanism,
      nextStep: t.confidence < 0.4 ? "this rests on limited inputs; more labs or symptom detail would sharpen it." : "discuss the combination of inputs behind this with a clinician rather than any single one.",
      territoryKeys: [t.territoryKey],
      direction: "elevated" as const,
      weight: t.load,
      source: "inflammation layer · derived from your record",
    }));

  return { territories: territories.sort((a, b) => b.load - a.load), findings };
}

export function inflammationSummary(territories: TerritoryInflammation[]): string {
  if (territories.length === 0) return "not enough in your record yet to estimate inflammatory load anywhere.";
  const top = territories[0];
  return `highest estimated inflammatory load is in ${top.territoryKey.replace(/-/g, " ")} (${Math.round(top.load * 100)}%, confidence ${Math.round(top.confidence * 100)}%).`;
}
