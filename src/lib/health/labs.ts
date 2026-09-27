// blood laboratory layer: reference ranges, parsing of pasted results, and the anatomical
// territories a deviation implicates. interpretation is spatial, never diagnostic.
import type { Finding } from "./model";

export interface LabDef {
  key: string;
  label: string;
  unit: string;
  /** adult reference interval used for direction and severity. */
  low: number;
  high: number;
  /** alternative spellings accepted by the parser. */
  aliases: string[];
  panel: string;
  elevated?: { territoryKeys: string[]; mechanism: string; nextStep: string };
  reduced?: { territoryKeys: string[]; mechanism: string; nextStep: string };
}

export const LAB_DEFS: LabDef[] = [
  {
    key: "hemoglobin",
    label: "haemoglobin",
    unit: "g/dL",
    low: 13.5,
    high: 17.5,
    aliases: ["hgb", "hb", "haemoglobin", "hemoglobin"],
    panel: "complete blood count",
    reduced: {
      territoryKeys: ["marrow-axial", "duodenum", "spleen"],
      mechanism:
        "oxygen carrying capacity falls. red cell production sits in axial marrow, iron absorption in the duodenum, and aged red cells are cleared by the spleen — the three places a low haemoglobin is usually generated.",
      nextStep: "bring iron studies, b12 and folate to a clinician so the cause is separated from the number.",
    },
    elevated: {
      territoryKeys: ["marrow-axial", "lung", "kidney"],
      mechanism:
        "a raised haemoglobin follows either reduced plasma volume or increased erythropoietin drive from chronic hypoxia or renal signalling.",
      nextStep: "note altitude, smoking and sleep apnoea history for the clinician; repeat when hydrated.",
    },
  },
  {
    key: "mcv",
    label: "mean cell volume",
    unit: "fL",
    low: 80,
    high: 100,
    aliases: ["mcv"],
    panel: "complete blood count",
    reduced: {
      territoryKeys: ["marrow-axial", "duodenum"],
      mechanism: "small red cells point at iron availability at the marrow, and at absorption in the duodenum.",
      nextStep: "pair with ferritin before treating anything.",
    },
    elevated: {
      territoryKeys: ["marrow-axial", "liver", "stomach"],
      mechanism:
        "large red cells follow b12 or folate limitation, alcohol load on the liver, or loss of gastric intrinsic factor.",
      nextStep: "request b12, folate and liver enzymes together.",
    },
  },
  {
    key: "ferritin",
    label: "ferritin",
    unit: "ng/mL",
    low: 30,
    high: 300,
    aliases: ["ferritin"],
    panel: "iron studies",
    reduced: {
      territoryKeys: ["marrow-axial", "duodenum", "liver"],
      mechanism: "iron stores are depleted before haemoglobin falls; the stores sit in liver, marrow and macrophages.",
      nextStep: "look for a source of loss as well as intake; do not self-supplement iron indefinitely.",
    },
    elevated: {
      territoryKeys: ["liver", "spleen", "heart"],
      mechanism:
        "ferritin rises as an acute phase protein and in iron loading; sustained loading deposits in liver, pancreas and myocardium.",
      nextStep: "ask for transferrin saturation and crp so inflammation and iron loading are separated.",
    },
  },
  {
    key: "creatinine",
    label: "creatinine",
    unit: "mg/dL",
    low: 0.6,
    high: 1.3,
    aliases: ["creatinine", "creat"],
    panel: "metabolic panel",
    elevated: {
      territoryKeys: ["kidney"],
      mechanism: "filtration at the glomeruli in the renal cortex has fallen, or muscle turnover is unusually high.",
      nextStep: "check hydration and any nephrotoxic medication with a clinician, and repeat with egfr.",
    },
  },
  {
    key: "egfr",
    label: "egfr",
    unit: "mL/min/1.73m²",
    low: 60,
    high: 200,
    aliases: ["egfr", "gfr"],
    panel: "metabolic panel",
    reduced: {
      territoryKeys: ["kidney", "peripheral-arteries"],
      mechanism:
        "reduced filtration changes fluid, electrolyte and drug clearance. renally cleared medication doses depend on this value.",
      nextStep: "review every current medication for renal dosing with a clinician or pharmacist.",
    },
  },
  {
    key: "alt",
    label: "alt",
    unit: "U/L",
    low: 7,
    high: 45,
    aliases: ["alt", "sgpt"],
    panel: "liver panel",
    elevated: {
      territoryKeys: ["liver"],
      mechanism: "alt is concentrated in hepatocytes; a rise indicates hepatocellular membrane injury rather than obstruction.",
      nextStep: "review alcohol, medication, supplements and metabolic risk, then recheck in six to eight weeks.",
    },
  },
  {
    key: "ast",
    label: "ast",
    unit: "U/L",
    low: 8,
    high: 40,
    aliases: ["ast", "sgot"],
    panel: "liver panel",
    elevated: {
      territoryKeys: ["liver", "muscle", "heart"],
      mechanism:
        "ast sits in liver, skeletal muscle and myocardium. an ast-dominant pattern shifts attention to zone 3 hepatocytes and to muscle.",
      nextStep: "note recent exercise and alcohol; ask for a ck if muscle is plausible.",
    },
  },
  {
    key: "bilirubin",
    label: "total bilirubin",
    unit: "mg/dL",
    low: 0.1,
    high: 1.2,
    aliases: ["bilirubin", "tbili"],
    panel: "liver panel",
    elevated: {
      territoryKeys: ["liver", "gallbladder", "spleen"],
      mechanism: "bilirubin rises with haemolysis, impaired conjugation, or obstruction anywhere along the biliary tree.",
      nextStep: "ask whether the pattern is conjugated or unconjugated — it separates the three causes.",
    },
  },
  {
    key: "glucose",
    label: "fasting glucose",
    unit: "mg/dL",
    low: 70,
    high: 99,
    aliases: ["glucose", "fasting glucose", "fbg"],
    panel: "metabolic panel",
    elevated: {
      territoryKeys: ["pancreas", "liver", "muscle", "peripheral-arteries"],
      mechanism:
        "beta cells, hepatic glucose output and muscle uptake set fasting glucose together. sustained elevation loads endothelium everywhere.",
      nextStep: "pair with hba1c before drawing any conclusion from a single fasting value.",
    },
  },
  {
    key: "hba1c",
    label: "hba1c",
    unit: "%",
    low: 4,
    high: 5.6,
    aliases: ["hba1c", "a1c"],
    panel: "metabolic panel",
    elevated: {
      territoryKeys: ["pancreas", "peripheral-arteries", "kidney", "retina", "peripheral-nerve"],
      mechanism:
        "average glycaemia over ~3 months. the tissues that carry the consequence are the small vessels of kidney and retina and the peripheral nerve.",
      nextStep: "annual retinal and urine albumin screening are the standard surveillance; raise both with a clinician.",
    },
  },
  {
    key: "ldl",
    label: "ldl cholesterol",
    unit: "mg/dL",
    low: 0,
    high: 100,
    aliases: ["ldl", "ldl-c"],
    panel: "lipid panel",
    elevated: {
      territoryKeys: ["coronary", "carotid", "aorta", "peripheral-arteries"],
      mechanism: "apoB particles deposit in arterial intima over decades; the coronary and carotid beds carry most of the event risk.",
      nextStep: "risk is cumulative exposure, not a single value — discuss lifetime risk rather than one result.",
    },
  },
  {
    key: "hdl",
    label: "hdl cholesterol",
    unit: "mg/dL",
    low: 40,
    high: 90,
    aliases: ["hdl", "hdl-c"],
    panel: "lipid panel",
    reduced: {
      territoryKeys: ["coronary", "peripheral-arteries", "liver"],
      mechanism: "reverse cholesterol transport back to the liver is reduced; it usually tracks with insulin resistance.",
      nextStep: "look at triglyceride and waist together — the three move as one metabolic pattern.",
    },
  },
  {
    key: "triglycerides",
    label: "triglycerides",
    unit: "mg/dL",
    low: 0,
    high: 150,
    aliases: ["triglycerides", "tg"],
    panel: "lipid panel",
    elevated: {
      territoryKeys: ["liver", "pancreas", "peripheral-arteries"],
      mechanism: "hepatic vldl output rises with insulin resistance and alcohol; very high values put the pancreas at risk.",
      nextStep: "confirm the sample was fasting before interpreting it.",
    },
  },
  {
    key: "tsh",
    label: "tsh",
    unit: "mIU/L",
    low: 0.4,
    high: 4,
    aliases: ["tsh"],
    panel: "thyroid panel",
    elevated: {
      territoryKeys: ["thyroid", "pituitary", "hypothalamus"],
      mechanism: "the pituitary is pushing harder on the thyroid — the feedback loop is compensating for reduced output.",
      nextStep: "free t4 completes the picture; a single tsh does not.",
    },
    reduced: {
      territoryKeys: ["thyroid", "pituitary", "heart", "bone"],
      mechanism:
        "suppressed tsh means thyroid hormone is high enough to switch the pituitary off; the heart and bone carry the consequence of excess.",
      nextStep: "free t4 and t3 alongside, and mention any thyroid hormone or supplement intake.",
    },
  },
  {
    key: "crp",
    label: "c-reactive protein",
    unit: "mg/L",
    low: 0,
    high: 3,
    aliases: ["crp", "hs-crp"],
    panel: "inflammatory markers",
    elevated: {
      territoryKeys: ["liver", "peripheral-arteries", "lymph-nodes"],
      mechanism: "crp is made by the liver under il-6 drive; it reports systemic inflammatory tone, not its location.",
      nextStep: "a single raised crp needs context — recent infection, injury and training all raise it.",
    },
  },
  {
    key: "vitamin-d",
    label: "vitamin d (25-oh)",
    unit: "ng/mL",
    low: 30,
    high: 80,
    aliases: ["vitamin d", "25-oh", "25 oh vitamin d", "vit d"],
    panel: "vitamins",
    reduced: {
      territoryKeys: ["bone", "muscle", "lymphatic"],
      mechanism: "reduced calcium handling at bone, proximal muscle function and innate immune signalling all track with low 25-oh d.",
      nextStep: "dose and target should be set with a clinician; very high supplementation is not benign.",
    },
  },
  {
    key: "b12",
    label: "vitamin b12",
    unit: "pg/mL",
    low: 200,
    high: 900,
    aliases: ["b12", "cobalamin"],
    panel: "vitamins",
    reduced: {
      territoryKeys: ["spinal-cord", "peripheral-nerve", "marrow-axial", "stomach"],
      mechanism:
        "b12 supports myelin and dna synthesis; the dorsal columns of the cord and peripheral nerve express deficiency before the blood count does.",
      nextStep: "ask for methylmalonic acid if the value is borderline and symptoms are present.",
    },
  },
  {
    key: "potassium",
    label: "potassium",
    unit: "mmol/L",
    low: 3.5,
    high: 5.2,
    aliases: ["potassium", "k+"],
    panel: "metabolic panel",
    elevated: {
      territoryKeys: ["heart", "kidney", "adrenal"],
      mechanism: "potassium sets cardiac membrane excitability; the kidney and aldosterone axis control it.",
      nextStep: "a genuinely high potassium is urgent — confirm it is not a haemolysed sample, and contact a clinician.",
    },
    reduced: {
      territoryKeys: ["heart", "kidney", "colon"],
      mechanism: "losses through kidney or gut lower potassium and destabilise cardiac rhythm.",
      nextStep: "review diuretics and gastrointestinal losses with a clinician.",
    },
  },
  {
    key: "sodium",
    label: "sodium",
    unit: "mmol/L",
    low: 135,
    high: 145,
    aliases: ["sodium", "na+"],
    panel: "metabolic panel",
    reduced: {
      territoryKeys: ["kidney", "brain", "adrenal"],
      mechanism: "sodium tracks water handling; a fall shifts water into brain cells, which is why symptoms are neurological.",
      nextStep: "sudden or symptomatic low sodium needs prompt clinical assessment.",
    },
  },
  {
    key: "psa",
    label: "psa",
    unit: "ng/mL",
    low: 0,
    high: 4,
    aliases: ["psa"],
    panel: "tumour markers",
    elevated: {
      territoryKeys: ["prostate", "lymph-nodes"],
      mechanism: "psa rises with prostate volume, inflammation, recent instrumentation and malignancy alike.",
      nextStep: "a single value is not a diagnosis; velocity and clinical exam matter more.",
    },
  },
];

export interface LabValue {
  key: string;
  value: number;
  takenAt?: string;
}

const NUMBER = "([0-9]+(?:[.,][0-9]+)?)";

/** parse pasted lab text. only values whose analyte name is recognised are accepted. */
export function parseLabText(text: string): { values: LabValue[]; unrecognised: string[] } {
  const values: LabValue[] = [];
  const unrecognised: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    let matched = false;
    for (const def of LAB_DEFS) {
      if (seen.has(def.key)) continue;
      for (const alias of def.aliases) {
        const pattern = new RegExp(`(?:^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^0-9<>-]{0,24}${NUMBER}`);
        const hit = line.match(pattern);
        if (hit) {
          const value = Number(hit[1].replace(",", "."));
          if (Number.isFinite(value)) {
            values.push({ key: def.key, value });
            seen.add(def.key);
            matched = true;
          }
          break;
        }
      }
      if (matched) break;
    }
    if (!matched && /[0-9]/.test(line) && line.length < 90) unrecognised.push(raw.trim());
  }
  return { values, unrecognised };
}

export function labDef(key: string): LabDef | undefined {
  return LAB_DEFS.find((d) => d.key === key);
}

/** how far outside the interval, expressed 0..1 for atlas opacity. */
function deviation(def: LabDef, value: number): number {
  const span = Math.max(def.high - def.low, 1e-6);
  if (value > def.high) return Math.min(1, (value - def.high) / span + 0.25);
  if (value < def.low) return Math.min(1, (def.low - value) / span + 0.25);
  return 0;
}

export function labFindings(values: LabValue[]): Finding[] {
  const out: Finding[] = [];
  for (const v of values) {
    const def = labDef(v.key);
    if (!def) continue;
    const high = v.value > def.high;
    const low = v.value < def.low;
    if (!high && !low) continue;
    const rule = high ? def.elevated : def.reduced;
    if (!rule) continue;
    out.push({
      id: `lab:${def.key}`,
      layer: "lab",
      label: `${def.label} ${high ? "above" : "below"} reference`,
      detail: `${v.value} ${def.unit} against a reference interval of ${def.low}–${def.high} ${def.unit}.`,
      mechanism: rule.mechanism,
      nextStep: rule.nextStep,
      territoryKeys: rule.territoryKeys,
      direction: high ? "elevated" : "low",
      weight: 0.35 + deviation(def, v.value) * 0.6,
      source: `laboratory value you entered · ${def.panel}`,
    });
  }
  return out;
}
