// nutrition, exposure, surgical and family-history layers. each one converts a recorded
// fact into the territory that carries it, with the mechanism stated.
import type { Finding } from "./model";

export interface NutrientDef {
  key: string;
  label: string;
  territoryKeys: string[];
  deficiencyMechanism: string;
  nextStep: string;
  foodSources: string;
}

export const NUTRIENTS: NutrientDef[] = [
  {
    key: "iron",
    label: "iron",
    territoryKeys: ["marrow-axial", "duodenum", "muscle"],
    deficiencyMechanism: "haem synthesis in marrow and oxidative capacity in muscle both depend on iron stores.",
    nextStep: "ferritin first; supplementing without measuring can mask a bleeding source.",
    foodSources: "red meat, shellfish, legumes, dark leafy greens with a vitamin c source.",
  },
  {
    key: "b12",
    label: "vitamin b12",
    territoryKeys: ["spinal-cord", "peripheral-nerve", "marrow-axial"],
    deficiencyMechanism: "myelin maintenance in the dorsal columns fails before the blood count changes.",
    nextStep: "plant-only diets and long ppi or metformin use need periodic checks.",
    foodSources: "animal products, or fortified foods and supplementation.",
  },
  {
    key: "folate",
    label: "folate",
    territoryKeys: ["marrow-axial", "spinal-cord", "liver"],
    deficiencyMechanism: "dna synthesis in rapidly dividing marrow depends on folate cycling.",
    nextStep: "relevant before and during pregnancy above all.",
    foodSources: "leafy greens, legumes, fortified grains.",
  },
  {
    key: "magnesium",
    label: "magnesium",
    territoryKeys: ["muscle", "heart", "peripheral-nerve"],
    deficiencyMechanism: "magnesium gates nmda channels and calcium handling in muscle and myocardium.",
    nextStep: "serum magnesium under-reports body stores; symptoms matter more.",
    foodSources: "nuts, seeds, whole grains, dark chocolate.",
  },
  {
    key: "vitamin-d",
    label: "vitamin d",
    territoryKeys: ["bone", "muscle", "lymphatic"],
    deficiencyMechanism: "calcium absorption, proximal muscle function and innate immune tone all depend on 25-oh d.",
    nextStep: "latitude, skin tone and indoor work are the main drivers; measure before high-dose supplementation.",
    foodSources: "oily fish, egg yolk, fortified dairy, sunlight exposure.",
  },
  {
    key: "omega3",
    label: "omega-3 fatty acids",
    territoryKeys: ["cerebral-cortex", "retina", "heart"],
    deficiencyMechanism: "dha is a structural lipid in neuronal and retinal membranes.",
    nextStep: "two portions of oily fish weekly covers most of the requirement.",
    foodSources: "oily fish, algae oil, walnuts, flaxseed.",
  },
  {
    key: "potassium",
    label: "dietary potassium",
    territoryKeys: ["heart", "kidney", "muscle"],
    deficiencyMechanism: "potassium intake shapes blood pressure through renal sodium handling.",
    nextStep: "a potassium-rich diet is contraindicated in advanced kidney disease — check first.",
    foodSources: "vegetables, fruit, legumes, dairy.",
  },
  {
    key: "protein",
    label: "protein",
    territoryKeys: ["muscle", "liver", "bone"],
    deficiencyMechanism: "muscle protein synthesis and hepatic albumin production both need sustained intake.",
    nextStep: "requirement rises with age, not falls.",
    foodSources: "meat, fish, dairy, legumes, soy.",
  },
  {
    key: "fibre",
    label: "dietary fibre",
    territoryKeys: ["colon", "small-intestine", "liver"],
    deficiencyMechanism: "colonic microbes convert fibre to short chain fatty acids that feed the colonocytes directly.",
    nextStep: "increase gradually with water; sudden increases cause bloating.",
    foodSources: "whole grains, legumes, vegetables, fruit.",
  },
  {
    key: "iodine",
    label: "iodine",
    territoryKeys: ["thyroid"],
    deficiencyMechanism: "thyroid hormone synthesis requires iodine; both deficiency and excess disturb it.",
    nextStep: "kelp supplements can deliver a wildly variable dose — prefer iodised salt.",
    foodSources: "iodised salt, dairy, seafood.",
  },
];

export interface NutritionEntry {
  id: string;
  nutrientKey: string;
  status: "low" | "adequate" | "high";
  note?: string;
}

export function nutritionFindings(entries: NutritionEntry[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entries) {
    const def = NUTRIENTS.find((n) => n.key === e.nutrientKey);
    if (!def || e.status === "adequate") continue;
    out.push({
      id: `nutrition:${e.id}`,
      layer: "nutrition",
      label: `${def.label} intake recorded as ${e.status}`,
      detail: e.note?.trim() || `food sources: ${def.foodSources}`,
      mechanism: def.deficiencyMechanism,
      nextStep: def.nextStep,
      territoryKeys: def.territoryKeys,
      direction: e.status === "low" ? "low" : "elevated",
      weight: 0.35,
      source: "your nutrition record",
    });
  }
  return out;
}

export interface ExposureDef {
  key: string;
  label: string;
  territoryKeys: string[];
  mechanism: string;
  nextStep: string;
  cumulative: boolean;
}

export const EXPOSURES: ExposureDef[] = [
  {
    key: "tobacco",
    label: "tobacco smoke",
    territoryKeys: ["lung", "upper-airway", "coronary", "carotid", "bladder", "pancreas"],
    mechanism: "combustion products reach the alveoli and then every vascular bed; the bladder concentrates the metabolites.",
    nextStep: "risk falls measurably within a year of stopping and keeps falling for a decade.",
    cumulative: true,
  },
  {
    key: "alcohol",
    label: "alcohol",
    territoryKeys: ["liver", "pancreas", "brain", "oesophagus", "heart"],
    mechanism: "acetaldehyde load falls on hepatocytes first, then on pancreas, oesophageal epithelium and myocardium.",
    nextStep: "weekly total matters more than any single evening.",
    cumulative: true,
  },
  {
    key: "noise",
    label: "occupational or recreational noise",
    territoryKeys: ["cochlea", "vestibulocochlear"],
    mechanism: "outer hair cells in the basal cochlea die from sustained high sound pressure and do not regenerate.",
    nextStep: "hearing loss in midlife is a modifiable dementia risk factor — protect and test.",
    cumulative: true,
  },
  {
    key: "air-pollution",
    label: "particulate air pollution",
    territoryKeys: ["lung", "coronary", "brain"],
    mechanism: "pm2.5 crosses the alveolar barrier and drives systemic inflammatory and endothelial change.",
    nextStep: "indoor filtration and route choice measurably reduce personal exposure.",
    cumulative: true,
  },
  {
    key: "uv",
    label: "ultraviolet exposure",
    territoryKeys: ["skin", "eye"],
    mechanism: "uvb damages keratinocyte dna directly; uva penetrates deeper and ages dermal collagen.",
    nextStep: "cumulative dose and burn episodes both count; annual skin checks if there is a history of either.",
    cumulative: true,
  },
  {
    key: "shift-work",
    label: "night or rotating shift work",
    territoryKeys: ["hypothalamus", "pineal", "pancreas", "colon"],
    mechanism: "circadian misalignment shifts melatonin, cortisol and insulin sensitivity out of phase with feeding.",
    nextStep: "anchor light exposure and meal timing rather than sleep duration alone.",
    cumulative: true,
  },
  {
    key: "sedentary",
    label: "prolonged sitting",
    territoryKeys: ["deep-veins-leg", "muscle", "vertebra", "pancreas"],
    mechanism: "muscle inactivity lowers lipoprotein lipase activity and slows venous return in the calf.",
    nextStep: "interruption frequency matters more than total exercise volume.",
    cumulative: true,
  },
  {
    key: "heavy-metals",
    label: "heavy metal exposure",
    territoryKeys: ["kidney", "peripheral-nerve", "marrow-axial", "brain"],
    mechanism: "lead and cadmium accumulate in bone and renal cortex over years, with neurological expression.",
    nextStep: "occupational or water-source exposure should be measured, not estimated.",
    cumulative: true,
  },
  {
    key: "radiation",
    label: "medical or occupational radiation",
    territoryKeys: ["thyroid", "marrow-axial", "lymph-nodes"],
    mechanism: "dividing tissues — marrow, thyroid follicular cells, lymphoid tissue — carry most of the stochastic risk.",
    nextStep: "keep a cumulative imaging record and ask whether each ct is necessary.",
    cumulative: true,
  },
];

export interface ExposureEntry {
  id: string;
  exposureKey: string;
  intensity: "past" | "current-low" | "current-high";
  years?: number;
  note?: string;
}

export function exposureFindings(entries: ExposureEntry[]): Finding[] {
  const weight = { past: 0.3, "current-low": 0.45, "current-high": 0.75 } as const;
  const out: Finding[] = [];
  for (const e of entries) {
    const def = EXPOSURES.find((x) => x.key === e.exposureKey);
    if (!def) continue;
    out.push({
      id: `exposure:${e.id}`,
      layer: "exposure",
      label: `${def.label} · ${e.intensity.replace("-", " ")}`,
      detail: `${e.years ? `${e.years} years recorded. ` : ""}${e.note?.trim() ?? ""}`.trim() || "recorded exposure.",
      mechanism: def.mechanism,
      nextStep: def.nextStep,
      territoryKeys: def.territoryKeys,
      direction: "risk",
      weight: weight[e.intensity],
      source: "your exposure record",
    });
  }
  return out;
}

export interface SurgeryEntry {
  id: string;
  label: string;
  year?: number;
  territoryKeys: string[];
  note?: string;
}

export const SURGERY_PRESETS: { label: string; territoryKeys: string[]; mechanism: string }[] = [
  { label: "appendicectomy", territoryKeys: ["colon"], mechanism: "the caecal appendix is absent; adhesions can form in the right iliac fossa." },
  { label: "cholecystectomy", territoryKeys: ["gallbladder", "liver", "duodenum"], mechanism: "bile now flows continuously rather than in postprandial pulses, which changes fat handling." },
  { label: "caesarean section", territoryKeys: ["muscle", "colon"], mechanism: "a lower segment scar changes abdominal wall mechanics and can tether bowel." },
  { label: "coronary stent", territoryKeys: ["coronary", "heart"], mechanism: "an endothelialised metal scaffold; antiplatelet cover is the critical dependency." },
  { label: "hip replacement", territoryKeys: ["hip", "femur", "muscle"], mechanism: "load transfer through the prosthesis changes gait mechanics and periprosthetic bone." },
  { label: "knee arthroscopy", territoryKeys: ["knee", "cartilage"], mechanism: "meniscal or cartilage volume has changed, altering load distribution." },
  { label: "thyroidectomy", territoryKeys: ["thyroid", "parathyroid"], mechanism: "hormone replacement is now external; parathyroid function may also be affected." },
  { label: "tonsillectomy", territoryKeys: ["upper-airway", "lymph-nodes"], mechanism: "pharyngeal lymphoid tissue removed; airway calibre changes." },
  { label: "spinal fusion", territoryKeys: ["vertebra", "spinal-cord", "muscle"], mechanism: "fused segments transfer motion to the adjacent levels." },
  { label: "bowel resection", territoryKeys: ["colon", "small-intestine"], mechanism: "absorptive surface and transit time change according to the segment removed." },
];

export function surgeryFindings(entries: SurgeryEntry[]): Finding[] {
  return entries.map((e) => {
    const preset = SURGERY_PRESETS.find((p) => p.label === e.label.toLowerCase());
    return {
      id: `surgery:${e.id}`,
      layer: "surgery" as const,
      label: `${e.label}${e.year ? ` · ${e.year}` : ""}`,
      detail: e.note?.trim() || "recorded procedure.",
      mechanism: preset?.mechanism ?? "this region has been altered surgically; anatomy there differs from the reference model.",
      nextStep: "keep this on any pre-operative or imaging history.",
      territoryKeys: e.territoryKeys.length ? e.territoryKeys : preset?.territoryKeys ?? [],
      direction: "absent" as const,
      weight: 0.4,
      source: "your surgical history",
    };
  });
}

export interface FamilyEntry {
  id: string;
  condition: string;
  relation: "parent" | "sibling" | "grandparent" | "child" | "other";
  ageAtOnset?: number;
  territoryKeys: string[];
}

export const FAMILY_PRESETS: { condition: string; territoryKeys: string[]; mechanism: string }[] = [
  { condition: "heart attack", territoryKeys: ["coronary", "heart", "aorta"], mechanism: "shared lipid handling, blood pressure and clotting tendency concentrate in the coronary bed." },
  { condition: "stroke", territoryKeys: ["cerebral-arteries", "carotid", "brain"], mechanism: "shared vascular and atrial rhythm risk expresses in cerebral circulation." },
  { condition: "type 2 diabetes", territoryKeys: ["pancreas", "liver", "muscle"], mechanism: "beta cell reserve and insulin sensitivity both carry heritable components." },
  { condition: "bowel cancer", territoryKeys: ["colon"], mechanism: "colonic epithelial repair capacity and polyp tendency cluster in families." },
  { condition: "prostate cancer", territoryKeys: ["prostate"], mechanism: "a first-degree history moves screening age earlier." },
  { condition: "alzheimer disease", territoryKeys: ["hippocampus", "cerebral-cortex"], mechanism: "shared apoe status and vascular risk both contribute." },
  { condition: "thyroid disease", territoryKeys: ["thyroid"], mechanism: "autoimmune thyroid disease clusters strongly in families." },
  { condition: "kidney disease", territoryKeys: ["kidney"], mechanism: "structural and hypertensive renal disease both show familial clustering." },
  { condition: "venous thrombosis", territoryKeys: ["deep-veins-leg", "lung"], mechanism: "inherited thrombophilia expresses in slow venous beds and the pulmonary circulation." },
  { condition: "glaucoma", territoryKeys: ["eye", "optic-nerve"], mechanism: "outflow anatomy and optic disc vulnerability are heritable; screening age moves earlier." },
];

export function familyFindings(entries: FamilyEntry[]): Finding[] {
  const relationWeight = { parent: 0.6, sibling: 0.6, child: 0.5, grandparent: 0.35, other: 0.25 } as const;
  return entries.map((e) => {
    const preset = FAMILY_PRESETS.find((p) => p.condition === e.condition.toLowerCase());
    const early = typeof e.ageAtOnset === "number" && e.ageAtOnset < 55;
    return {
      id: `family:${e.id}`,
      layer: "family" as const,
      label: `${e.condition} · ${e.relation}${e.ageAtOnset ? ` at ${e.ageAtOnset}` : ""}`,
      detail: early
        ? "onset before 55 in a close relative carries more weight than the same condition later in life."
        : "recorded family history.",
      mechanism: preset?.mechanism ?? "shared genetics and shared environment both contribute; the mechanism here is not specified in the reference set.",
      nextStep: early
        ? "early onset in a first-degree relative usually shifts your own screening age — raise it with a clinician."
        : "mention this at your next review so screening intervals reflect it.",
      territoryKeys: e.territoryKeys.length ? e.territoryKeys : preset?.territoryKeys ?? [],
      direction: "risk" as const,
      weight: relationWeight[e.relation] * (early ? 1.2 : 1),
      source: "your family history",
    };
  });
}
