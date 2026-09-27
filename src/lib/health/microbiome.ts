// asherin.health — microbiome knowledge layer. this is a general knowledge surface only:
// asherin.health never fabricates a personal microbiome reading. any "your notes" content
// shown here is read back verbatim from the person's own exposures/nutrition entries.
import type { ExposureEntry, NutritionEntry } from "./records";

export interface MicrobiomeSite {
  id: string;
  label: string;
  detail: string;
  influences: string[];
  territoryKeys: string[];
}

export const MICROBIOME_SITES: MicrobiomeSite[] = [
  { id: "gut-small-intestine", label: "small intestine", detail: "lower microbial density than the colon, dominated by fast-growing, oxygen-tolerant species; overgrowth here (SIBO) is a distinct clinical entity from normal colonic flora.", influences: ["nutrient absorption", "bile acid recycling", "local immune tone"], territoryKeys: ["small-intestine"] },
  { id: "gut-colon", label: "colon", detail: "the body's densest microbial community, dominated by anaerobic bacteria that ferment fibre the small intestine cannot digest.", influences: ["short-chain fatty acid production", "vitamin k and some b vitamin synthesis", "training of gut immune tissue", "stool consistency"], territoryKeys: ["colon"] },
  { id: "skin-sebaceous", label: "skin — oily sites (face, scalp, back)", detail: "dominated by lipid-loving species that feed on sebum.", influences: ["acne pathophysiology alongside sebaceous activity", "local skin barrier tone"], territoryKeys: ["skin", "sebaceous-gland"] },
  { id: "skin-moist", label: "skin — moist sites (axilla, groin, toe webs)", detail: "dominated by species tolerant of humidity and higher bacterial density.", influences: ["body odour production from apocrine secretion breakdown", "susceptibility to intertrigo and fungal overgrowth"], territoryKeys: ["skin", "apocrine-gland"] },
  { id: "skin-dry", label: "skin — dry sites (forearm, palm)", detail: "the lowest density and most variable skin microbial community.", influences: ["barrier resilience", "response to topical products"], territoryKeys: ["skin"] },
  { id: "oral-cavity", label: "oral cavity", detail: "hundreds of species across teeth, gum, tongue and cheek surfaces, organised into biofilms.", influences: ["dental plaque formation and cavity risk", "periodontal inflammation", "some systemic inflammatory links under active study"], territoryKeys: ["teeth", "salivary"] },
  { id: "nasal-sinus", label: "nasal and sinus passages", detail: "a comparatively sparse community that helps exclude airborne pathogens.", influences: ["susceptibility to upper respiratory infection", "chronic sinus inflammation in some people"], territoryKeys: ["sinuses"] },
  { id: "vaginal", label: "vaginal", detail: "typically lactobacillus-dominated in reproductive-age women, keeping the environment acidic.", influences: ["resistance to bacterial vaginosis and yeast overgrowth", "shifts with cycle phase, pregnancy and menopause"], territoryKeys: ["vagina"] },
  { id: "lung", label: "lung", detail: "a low-biomass community, once thought sterile; imbalance is studied in chronic respiratory disease.", influences: ["research area in asthma and copd, not yet a personal diagnostic marker"], territoryKeys: ["lung"] },
];

export interface MicrobiomeUserNote {
  site: string;
  note: string;
  source: "exposures" | "nutrition";
}

/** reads only what the person already entered elsewhere; never invents a reading. */
export function microbiomeUserNotes(exposures: ExposureEntry[], nutrition: NutritionEntry[]): MicrobiomeUserNote[] {
  const notes: MicrobiomeUserNote[] = [];
  for (const e of exposures) {
    const text = `${e.exposureKey} ${e.note ?? ""}`;
    if (/probiotic|antibiotic|ferment|gut|microbiome|yeast|vaginal|skin flora|mould|mold/i.test(text)) {
      notes.push({ site: e.exposureKey, note: e.note ?? e.exposureKey, source: "exposures" });
    }
  }
  for (const n of nutrition) {
    const text = `${n.nutrientKey} ${n.note ?? ""}`;
    if (/probiotic|fermented|yogurt|kefir|kimchi|sauerkraut|fiber|fibre|prebiotic/i.test(text)) {
      notes.push({ site: n.nutrientKey, note: n.note ?? n.nutrientKey, source: "nutrition" });
    }
  }
  return notes;
}

export const MICROBIOME_LIMITS =
  "this room holds no personal microbiome sequencing data and does not simulate any. everything above is general biology. " +
  "the only personal content shown is whatever you have already written into your own exposures or nutrition entries.";
