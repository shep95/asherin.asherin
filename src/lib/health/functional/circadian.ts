// functional layer: circadian phase, regularity and social jetlag from sleep series and
// shift-work/exposure entries. the melatonin/cortisol curve returned here is a labelled
// textbook curve for orientation, never a measured value.
import type { HealthRecord, WearableSeries } from "../store";
import type { Finding } from "../model";

export interface CircadianCurvePoint { hourOfDay: number; melatoninRelative: number; cortisolRelative: number }

/** textbook shape only — not derived from any measurement in the record. */
export function textbookCurve(): CircadianCurvePoint[] {
  const points: CircadianCurvePoint[] = [];
  for (let h = 0; h < 24; h++) {
    const melatonin = Math.max(0, Math.sin(((h - 21 + 24) % 24) / 24 * Math.PI * 2 - Math.PI / 2) * -1) ;
    const cortisol = Math.max(0, Math.cos(((h - 8 + 24) % 24) / 24 * Math.PI * 2));
    points.push({ hourOfDay: h, melatoninRelative: Number(Math.max(0, melatonin).toFixed(2)), cortisolRelative: Number(cortisol.toFixed(2)) });
  }
  return points;
}

export interface CircadianAssessment {
  phaseEstimate: "no data" | "likely regular" | "phase-delayed" | "phase-advanced" | "irregular";
  regularity: number | null;
  socialJetlagHours: number | null;
  confidence: number;
  curve: CircadianCurvePoint[];
  curveLabel: string;
  territories: { territoryKey: string; mechanism: string }[];
  findings: Finding[];
  notes: string[];
}

export function computeCircadian(record: HealthRecord): CircadianAssessment {
  const notes: string[] = [];
  const sleep = record.wearables.find((w: WearableSeries) => w.kind === "sleep");
  const territories = [
    { territoryKey: "pineal", mechanism: "melatonin synthesis and release is timed by the suprachiasmatic nucleus acting on the pineal gland." },
    { territoryKey: "hypothalamus", mechanism: "the suprachiasmatic nucleus in the hypothalamus is the master circadian clock, entrained chiefly by light." },
    { territoryKey: "liver", mechanism: "hepatic metabolic enzymes and glucose handling follow a circadian rhythm set by feeding time as well as light." },
    { territoryKey: "colon", mechanism: "gut motility and the microbiome both show circadian rhythmicity, disrupted by irregular meal and sleep timing." },
  ];

  if (!sleep || sleep.points.length < 4) {
    notes.push("not enough in your record yet — a sleep series of at least a few nights is needed to estimate phase or regularity.");
    return {
      phaseEstimate: "no data",
      regularity: null,
      socialJetlagHours: null,
      confidence: 0.05,
      curve: textbookCurve(),
      curveLabel: "textbook melatonin/cortisol curve — not measured from your record.",
      territories,
      findings: [],
      notes,
    };
  }

  const hours = sleep.points.map((p) => p.v);
  const mean = hours.reduce((a, b) => a + b, 0) / hours.length;
  const variance = hours.reduce((a, b) => a + (b - mean) ** 2, 0) / hours.length;
  const sd = Math.sqrt(variance);
  const regularity = Math.max(0, Math.min(1, 1 - sd / 2.5));

  const weekdays = sleep.points.filter((p) => [1, 2, 3, 4, 5].includes(new Date(p.t).getDay()));
  const weekends = sleep.points.filter((p) => [0, 6].includes(new Date(p.t).getDay()));
  let socialJetlag: number | null = null;
  if (weekdays.length >= 2 && weekends.length >= 1) {
    const wdAvg = weekdays.reduce((a, p) => a + p.v, 0) / weekdays.length;
    const weAvg = weekends.reduce((a, p) => a + p.v, 0) / weekends.length;
    socialJetlag = Number(Math.abs(weAvg - wdAvg).toFixed(1));
  }

  let phase: CircadianAssessment["phaseEstimate"] = "likely regular";
  if (sd > 1.5) phase = "irregular";
  else if (mean < 6.2) phase = "phase-delayed";

  const shiftWork = record.exposures.some((e) => e.exposureKey === "shift-work");
  if (shiftWork) {
    notes.push("shift or rotating night work is recorded — this is the strongest circadian disruptor this room can see in your record.");
    phase = "irregular";
  }

  const confidence = Math.max(0.2, Math.min(0.75, 0.25 + sleep.points.length * 0.02));

  const findings: Finding[] = [];
  if (regularity < 0.6 || shiftWork) {
    findings.push({
      id: "circadian:regularity",
      layer: "circadian",
      label: `circadian regularity ${Math.round(regularity * 100)}%`,
      detail: `built from ${sleep.points.length} nights of recorded sleep${shiftWork ? " and recorded shift work" : ""}.`,
      mechanism: "irregular sleep timing desynchronises the central hypothalamic clock from peripheral clocks in liver and gut.",
      nextStep: "anchoring wake time, even on days off, is the single highest-leverage change here.",
      territoryKeys: ["hypothalamus", "pineal"],
      direction: "risk",
      weight: Math.max(0.3, 1 - regularity),
      source: "circadian layer · derived from your sleep record",
    });
  }
  if (socialJetlag !== null && socialJetlag >= 1.5) {
    findings.push({
      id: "circadian:jetlag",
      layer: "circadian",
      label: `social jetlag ≈ ${socialJetlag}h`,
      detail: "difference between weekday and weekend sleep timing recorded in your wearable series.",
      mechanism: "a shifting sleep schedule across the week produces a weekly circadian re-entrainment, similar in kind to travel jetlag.",
      nextStep: "keeping wake time within an hour across the week reduces this directly.",
      territoryKeys: ["hypothalamus", "liver"],
      direction: "risk",
      weight: Math.min(0.7, socialJetlag / 3),
      source: "circadian layer · derived from your sleep record",
    });
  }

  return {
    phaseEstimate: phase,
    regularity: Number(regularity.toFixed(2)),
    socialJetlagHours: socialJetlag,
    confidence,
    curve: textbookCurve(),
    curveLabel: "textbook melatonin/cortisol curve — not measured from your record; shown for orientation only.",
    territories,
    findings,
    notes,
  };
}
