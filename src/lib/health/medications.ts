// medication layer: where a drug acts, what it clears through, and which territories carry
// its predictable burden. this is orientation, never dosing advice.
import type { Finding } from "./model";

export interface DrugDef {
  key: string;
  label: string;
  aliases: string[];
  className: string;
  /** where the therapeutic effect lands. */
  actsOn: string[];
  /** organs of clearance and predictable burden. */
  burden: string[];
  mechanism: string;
  watch: string;
  /** other drug keys or herb keys with a meaningful interaction. */
  interacts?: string[];
}

export const DRUG_DEFS: DrugDef[] = [
  {
    key: "metformin",
    label: "metformin",
    aliases: ["metformin", "glucophage"],
    className: "biguanide",
    actsOn: ["liver", "muscle"],
    burden: ["kidney", "small-intestine", "stomach"],
    mechanism: "suppresses hepatic glucose output and improves muscle uptake; cleared unchanged by the kidney.",
    watch: "renal function sets the safe dose, and long use lowers b12 absorption in the ileum.",
  },
  {
    key: "atorvastatin",
    label: "atorvastatin",
    aliases: ["atorvastatin", "lipitor", "statin", "rosuvastatin", "simvastatin"],
    className: "hmg-coa reductase inhibitor",
    actsOn: ["liver", "coronary", "carotid"],
    burden: ["liver", "muscle"],
    mechanism: "reduces hepatic cholesterol synthesis, lowering circulating apoB particles that load arterial intima.",
    watch: "new muscle aching deserves a ck check rather than silent discontinuation.",
    interacts: ["grapefruit", "red-yeast-rice"],
  },
  {
    key: "lisinopril",
    label: "lisinopril",
    aliases: ["lisinopril", "ramipril", "enalapril", "ace inhibitor"],
    className: "ace inhibitor",
    actsOn: ["peripheral-arteries", "heart", "kidney"],
    burden: ["kidney", "upper-airway"],
    mechanism: "blocks angiotensin ii formation, lowering arteriolar tone and glomerular pressure.",
    watch: "potassium and creatinine after any dose change; a dry cough is a class effect.",
  },
  {
    key: "amlodipine",
    label: "amlodipine",
    aliases: ["amlodipine", "norvasc"],
    className: "calcium channel blocker",
    actsOn: ["peripheral-arteries"],
    burden: ["liver", "deep-veins-leg"],
    mechanism: "relaxes arteriolar smooth muscle; ankle swelling comes from capillary pressure, not fluid overload.",
    watch: "ankle oedema is expected rather than dangerous, but tell the prescriber.",
  },
  {
    key: "levothyroxine",
    label: "levothyroxine",
    aliases: ["levothyroxine", "synthroid", "thyroxine"],
    className: "thyroid hormone",
    actsOn: ["thyroid", "pituitary", "heart"],
    burden: ["heart", "bone"],
    mechanism: "replaces t4; the pituitary reports adequacy through tsh.",
    watch: "iron, calcium and coffee within four hours reduce absorption.",
    interacts: ["ashwagandha", "kelp"],
  },
  {
    key: "omeprazole",
    label: "omeprazole",
    aliases: ["omeprazole", "esomeprazole", "pantoprazole", "ppi"],
    className: "proton pump inhibitor",
    actsOn: ["stomach", "oesophagus"],
    burden: ["stomach", "duodenum", "bone", "kidney"],
    mechanism: "shuts down parietal cell acid output; acid is also required for iron, b12 and calcium absorption.",
    watch: "long continuous use is worth reviewing yearly rather than renewing by default.",
  },
  {
    key: "warfarin",
    label: "warfarin",
    aliases: ["warfarin", "coumadin"],
    className: "vitamin k antagonist",
    actsOn: ["liver", "veins", "deep-veins-leg"],
    burden: ["liver"],
    mechanism: "reduces hepatic synthesis of factors ii, vii, ix and x.",
    watch: "narrow therapeutic index — vitamin k intake, antibiotics and many herbs shift inr.",
    interacts: ["st-johns-wort", "ginkgo", "garlic", "turmeric", "ginger", "dong-quai"],
  },
  {
    key: "apixaban",
    label: "apixaban",
    aliases: ["apixaban", "eliquis", "rivaroxaban", "doac"],
    className: "direct factor xa inhibitor",
    actsOn: ["veins", "deep-veins-leg", "heart"],
    burden: ["kidney", "liver", "colon"],
    mechanism: "blocks factor xa directly; renal function and p-glycoprotein handling set exposure.",
    watch: "any unexplained bleeding is a same-day clinical conversation.",
    interacts: ["st-johns-wort", "ginkgo"],
  },
  {
    key: "sertraline",
    label: "sertraline",
    aliases: ["sertraline", "zoloft", "fluoxetine", "escitalopram", "ssri"],
    className: "ssri",
    actsOn: ["brainstem", "hippocampus", "amygdala"],
    burden: ["liver", "stomach", "colon"],
    mechanism: "raises synaptic serotonin availability, with most peripheral serotonin sitting in the gut.",
    watch: "serotonergic load stacks — tell any prescriber about every serotonergic agent.",
    interacts: ["st-johns-wort", "sam-e", "tramadol"],
  },
  {
    key: "prednisone",
    label: "prednisone",
    aliases: ["prednisone", "prednisolone", "corticosteroid"],
    className: "glucocorticoid",
    actsOn: ["lymphatic", "lymph-nodes", "lung"],
    burden: ["adrenal", "bone", "stomach", "pancreas", "eye"],
    mechanism: "broad immune suppression; sustained exposure suppresses the adrenal axis and demineralises bone.",
    watch: "never stop a long course abruptly — the adrenal axis needs a taper.",
  },
  {
    key: "ibuprofen",
    label: "ibuprofen",
    aliases: ["ibuprofen", "naproxen", "diclofenac", "nsaid"],
    className: "nsaid",
    actsOn: ["muscle", "cartilage", "peripheral-nerve"],
    burden: ["stomach", "duodenum", "kidney", "heart"],
    mechanism: "cox inhibition reduces prostaglandin signalling, including the prostaglandins that protect gastric mucosa and renal perfusion.",
    watch: "combining with an ace inhibitor and a diuretic strains the kidney more than any of the three alone.",
  },
  {
    key: "amoxicillin",
    label: "amoxicillin",
    aliases: ["amoxicillin", "amoxil", "co-amoxiclav", "augmentin"],
    className: "beta-lactam antibiotic",
    actsOn: ["upper-airway", "lung", "lymph-nodes"],
    burden: ["colon", "liver", "kidney"],
    mechanism: "bactericidal against susceptible organisms; the colonic microbiome takes collateral load.",
    watch: "diarrhoea that persists after the course warrants a clinical check.",
  },
  {
    key: "furosemide",
    label: "furosemide",
    aliases: ["furosemide", "lasix", "bumetanide"],
    className: "loop diuretic",
    actsOn: ["kidney", "lung", "heart"],
    burden: ["kidney", "cochlea"],
    mechanism: "blocks the na-k-2cl transporter in the loop of henle; the same transporter exists in the inner ear.",
    watch: "potassium, magnesium and standing blood pressure need periodic checks.",
  },
  {
    key: "metoprolol",
    label: "metoprolol",
    aliases: ["metoprolol", "bisoprolol", "atenolol", "beta blocker", "propranolol"],
    className: "beta blocker",
    actsOn: ["heart", "coronary", "sympathetic-chain"],
    burden: ["lung", "liver", "peripheral-arteries"],
    mechanism: "reduces sympathetic drive on the sinus node and myocardium, lowering rate and oxygen demand.",
    watch: "abrupt cessation causes rebound; taper with the prescriber.",
  },
  {
    key: "insulin",
    label: "insulin",
    aliases: ["insulin", "lantus", "novorapid", "humalog"],
    className: "hormone replacement",
    actsOn: ["muscle", "liver", "pancreas"],
    burden: ["brain"],
    mechanism: "drives glucose into muscle and fat and switches off hepatic glucose output.",
    watch: "the brain has no glucose store — hypoglycaemia is the acute risk to plan around.",
  },
  {
    key: "gabapentin",
    label: "gabapentin",
    aliases: ["gabapentin", "pregabalin", "lyrica"],
    className: "alpha-2-delta ligand",
    actsOn: ["spinal-cord", "peripheral-nerve"],
    burden: ["kidney", "brain"],
    mechanism: "reduces excitatory neurotransmitter release at the dorsal horn.",
    watch: "renally cleared — dose depends on egfr; sedation stacks with alcohol and opioids.",
  },
];

export function findDrug(text: string): DrugDef | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  return DRUG_DEFS.find((d) => d.aliases.some((a) => t === a || t.includes(a)));
}

export interface MedicationEntry {
  id: string;
  name: string;
  drugKey?: string;
  dose?: string;
  note?: string;
}

export function medicationFindings(entries: MedicationEntry[]): Finding[] {
  const out: Finding[] = [];
  for (const entry of entries) {
    const def = entry.drugKey ? DRUG_DEFS.find((d) => d.key === entry.drugKey) : findDrug(entry.name);
    if (!def) {
      out.push({
        id: `med:${entry.id}`,
        layer: "medication",
        label: `${entry.name} — not in the reference set`,
        detail: "this medication is recorded but has no mapped territory in the built-in reference.",
        mechanism: "no mapping is shown rather than an invented one.",
        nextStep: "a pharmacist can tell you where it acts and what it clears through.",
        territoryKeys: [],
        direction: "neutral",
        weight: 0.2,
        source: "your medication list",
      });
      continue;
    }
    out.push({
      id: `med:${entry.id}:action`,
      layer: "medication",
      label: `${def.label} — site of action`,
      detail: `${def.className}${entry.dose ? ` · ${entry.dose}` : ""}.`,
      mechanism: def.mechanism,
      nextStep: def.watch,
      territoryKeys: def.actsOn,
      direction: "active",
      weight: 0.55,
      source: "your medication list",
    });
    if (def.burden.length) {
      out.push({
        id: `med:${entry.id}:burden`,
        layer: "medication",
        label: `${def.label} — clearance and burden`,
        detail: "organs that process this medication or absorb its predictable side effects.",
        mechanism: def.mechanism,
        nextStep: def.watch,
        territoryKeys: def.burden,
        direction: "risk",
        weight: 0.4,
        source: "your medication list",
      });
    }
  }
  return out;
}

export interface InteractionWarning {
  a: string;
  b: string;
  detail: string;
  severity: "caution" | "serious";
}

export function drugInteractions(entries: MedicationEntry[]): InteractionWarning[] {
  const defs = entries.map((e) => (e.drugKey ? DRUG_DEFS.find((d) => d.key === e.drugKey) : findDrug(e.name))).filter(Boolean) as DrugDef[];
  const out: InteractionWarning[] = [];
  const nsaid = defs.find((d) => d.key === "ibuprofen");
  const ace = defs.find((d) => d.key === "lisinopril");
  const loop = defs.find((d) => d.key === "furosemide");
  if (nsaid && ace && loop) {
    out.push({
      a: "nsaid",
      b: "ace inhibitor + loop diuretic",
      detail: "the three together reduce renal perfusion more than any one alone. renal function is worth checking.",
      severity: "serious",
    });
  }
  const anticoag = defs.find((d) => d.key === "warfarin" || d.key === "apixaban");
  if (anticoag && nsaid) {
    out.push({
      a: anticoag.label,
      b: "nsaid",
      detail: "bleeding risk compounds: one reduces clotting, the other strips gastric mucosal protection.",
      severity: "serious",
    });
  }
  const ssri = defs.find((d) => d.key === "sertraline");
  if (ssri && anticoag) {
    out.push({ a: "ssri", b: anticoag.label, detail: "platelet serotonin uptake is reduced, adding to bleeding risk.", severity: "caution" });
  }
  const ppi = defs.find((d) => d.key === "omeprazole");
  const thyroid = defs.find((d) => d.key === "levothyroxine");
  if (ppi && thyroid) {
    out.push({ a: "proton pump inhibitor", b: "levothyroxine", detail: "reduced gastric acid lowers thyroxine absorption; separate the doses.", severity: "caution" });
  }
  return out;
}
