// functional layer: acute vs chronic stress load, read from hrv/resting-heart-rate series,
// sleep, symptoms, exposures and medications. mapped to the territories that carry the
// physiological cost of sustained sympathetic drive.
import type { HealthRecord, WearableSeries } from "../store";
import type { Finding } from "../model";
import { SYMPTOMS, type SymptomEntry } from "../symptoms";
import { EXPOSURES, type ExposureEntry } from "../records";
import { DRUG_DEFS, type MedicationEntry } from "../medications";

export interface StressTerritory {
  territoryKey: string;
  load: number;
  mechanism: string;
  inputs: string[];
}

const STRESS_SYMPTOM_KEYS = ["insomnia", "palpitations", "headache", "bloating", "brain-fog", "low-mood"];

export interface StressAssessment {
  acute: number;
  chronic: number;
  confidence: number;
  territories: StressTerritory[];
  findings: Finding[];
  notes: string[];
}

function series(record: HealthRecord, kind: WearableSeries["kind"]): WearableSeries | undefined {
  return record.wearables.find((w) => w.kind === kind);
}

function trendRatio(points: { t: string; v: number }[], recentN = 5): number | null {
  if (points.length < recentN + 2) return null;
  const ordered = [...points].sort((a, b) => a.t.localeCompare(b.t));
  const baseline = ordered.slice(0, ordered.length - recentN);
  const recent = ordered.slice(-recentN);
  const base = baseline.reduce((a, p) => a + p.v, 0) / baseline.length;
  const rec = recent.reduce((a, p) => a + p.v, 0) / recent.length;
  if (base === 0) return null;
  return rec / base;
}

export function computeStress(record: HealthRecord): StressAssessment {
  const notes: string[] = [];
  const territories = new Map<string, StressTerritory>();
  const add = (key: string, delta: number, mechanism: string, input: string) => {
    const existing = territories.get(key);
    if (existing) {
      existing.load = Math.min(1, existing.load + delta);
      if (!existing.inputs.includes(input)) existing.inputs.push(input);
    } else {
      territories.set(key, { territoryKey: key, load: Math.min(1, delta), mechanism, inputs: [input] });
    }
  };

  let acute = 0;
  let chronic = 0;
  let signals = 0;

  const hrv = series(record, "hrv");
  if (hrv) {
    const ratio = trendRatio(hrv.points);
    if (ratio !== null) {
      signals++;
      if (ratio < 0.85) {
        const drop = Math.min(0.5, (1 - ratio) * 1.2);
        chronic += drop;
        add("adrenal", drop, "sustained sympathetic drive keeps cortisol output elevated through the hpa axis.", `hrv fell to ${(ratio * 100).toFixed(0)}% of baseline`);
        add("heart", drop * 0.8, "reduced vagal tone shows up first as lower heart rate variability.", `hrv trend`);
        notes.push(`hrv is running at ${(ratio * 100).toFixed(0)}% of its earlier baseline — a chronic-load signal rather than a single reading.`);
      } else if (ratio < 0.95) {
        acute += 0.2;
        add("heart", 0.15, "a short vagal withdrawal accompanies an acute stress response.", "recent hrv dip");
      }
    }
  } else {
    notes.push("no hrv series recorded — chronic load cannot be estimated from that signal yet.");
  }

  const rhr = series(record, "resting-heart-rate");
  if (rhr) {
    const ratio = trendRatio(rhr.points);
    if (ratio !== null && ratio > 1.05) {
      signals++;
      const rise = Math.min(0.4, (ratio - 1) * 2);
      chronic += rise * 0.6;
      acute += rise * 0.4;
      add("heart", rise, "a sustained rise in resting heart rate reflects raised sympathetic tone on the sinus node.", `resting heart rate up ${(((ratio - 1) * 100)).toFixed(0)}%`);
    }
  }

  const sleep = series(record, "sleep");
  if (sleep && sleep.points.length >= 3) {
    signals++;
    const recent = sleep.points.slice(-7);
    const avg = recent.reduce((a, p) => a + p.v, 0) / recent.length;
    if (avg < 6.5) {
      chronic += 0.2;
      add("hypothalamus", 0.2, "short sleep disturbs hpa axis regulation at the hypothalamic level.", `sleep averaging ${avg.toFixed(1)}h`);
      add("hippocampus", 0.15, "the hippocampus is particularly sensitive to sustained cortisol exposure and to sleep loss.", "sleep record");
    }
  }

  for (const e of record.symptoms as SymptomEntry[]) {
    if (!STRESS_SYMPTOM_KEYS.includes(e.symptomKey)) continue;
    const def = SYMPTOMS.find((s) => s.key === e.symptomKey);
    if (!def) continue;
    signals++;
    const delta = Math.max(0.08, Math.min(0.3, e.severity / 25));
    chronic += delta * 0.5;
    for (const t of def.territoryKeys) add(t, delta, def.mechanism, `symptom: ${def.label}`);
    if (e.symptomKey === "bloating") add("colon", delta, "the gut is densely innervated by the enteric nervous system, which is directly modulated by sympathetic and vagal tone.", "symptom: bloating");
  }

  for (const x of record.exposures as ExposureEntry[]) {
    if (x.exposureKey !== "shift-work" && x.exposureKey !== "sedentary") continue;
    const def = EXPOSURES.find((d) => d.key === x.exposureKey);
    if (!def) continue;
    signals++;
    chronic += 0.15;
    add("hypothalamus", 0.15, def.mechanism, `exposure: ${def.label}`);
  }

  const takingBenzoOrSsri = (record.medications as MedicationEntry[]).some((m) => {
    const def = m.drugKey ? DRUG_DEFS.find((d) => d.key === m.drugKey) : undefined;
    return def?.key === "sertraline";
  });
  if (takingBenzoOrSsri) notes.push("an ssri is on the medication list — this context matters for interpreting hrv and mood-linked symptoms, and is not itself scored as stress.");

  // jaw/neck muscle bracing is a well-described somatic expression of sustained stress.
  const jawPain = record.pain.some((p) => p.territoryKeys.includes("tmj") || p.territoryKeys.includes("masseter"));
  if (jawPain) {
    add("masseter", 0.2, "sustained sympathetic tone increases resting muscle activity in the jaw and neck, often expressed as clenching or bruxism.", "pain report at jaw/tmj");
    add("tmj", 0.15, "chronic jaw clenching loads the temporomandibular joint mechanically.", "pain report at jaw/tmj");
    chronic += 0.1;
  }

  const confidence = signals === 0 ? 0.1 : Math.max(0.2, Math.min(0.85, 0.2 + signals * 0.12));

  const findings: Finding[] = [...territories.values()]
    .filter((t) => t.load >= 0.2)
    .map((t) => ({
      id: `stress:${t.territoryKey}`,
      layer: "stress" as const,
      label: `stress load — ${t.territoryKey.replace(/-/g, " ")}`,
      detail: `built from: ${t.inputs.join("; ")}.`,
      mechanism: t.mechanism,
      nextStep: "sustained findings across several weeks are more informative than any single day.",
      territoryKeys: [t.territoryKey],
      direction: "elevated" as const,
      weight: t.load,
      source: "stress layer · derived from your record",
    }));

  if (signals === 0) notes.push("not enough in your record yet — add an hrv or sleep series, or a stress-linked symptom, to estimate this.");

  return {
    acute: Math.max(0, Math.min(1, acute)),
    chronic: Math.max(0, Math.min(1, chronic)),
    confidence,
    territories: [...territories.values()].sort((a, b) => b.load - a.load),
    findings,
    notes,
  };
}
