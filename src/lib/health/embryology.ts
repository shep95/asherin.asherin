// asherin.health — embryology knowledge layer: germ layer origins, key developmental
// events and common structural variants. reference knowledge only.
export type GermLayer = "ectoderm" | "mesoderm" | "endoderm" | "neural-crest";

export interface EmbryologyEntry {
  id: string;
  structureGroup: string;
  germLayer: GermLayer;
  event: string;
  detail: string;
  territoryKeys: string[];
}

export interface DevelopmentalVariant {
  id: string;
  name: string;
  detail: string;
  commonality: "common, usually harmless" | "uncommon" | "rare";
  territoryKeys: string[];
}

export const EMBRYOLOGY: EmbryologyEntry[] = [
  { id: "nervous-system", structureGroup: "brain and spinal cord", germLayer: "ectoderm", event: "neurulation, weeks 3–4", detail: "the neural tube forms from folding neuroectoderm; its failure to close causes neural tube defects.", territoryKeys: ["brain", "spinal-cord"] },
  { id: "neural-crest-derivatives", structureGroup: "peripheral nerves, facial skeleton, adrenal medulla", germLayer: "neural-crest", event: "neural crest migration, weeks 4–7", detail: "cells delaminating from the closing neural tube migrate widely to form much of the peripheral nervous system, facial cartilage and pigment cells.", territoryKeys: ["peripheral-nerve", "adrenal"] },
  { id: "skin", structureGroup: "epidermis", germLayer: "ectoderm", event: "epidermal stratification, weeks 4–20", detail: "surface ectoderm thickens and layers into the epidermal strata; the dermis beneath is mesodermal.", territoryKeys: ["skin"] },
  { id: "heart", structureGroup: "heart", germLayer: "mesoderm", event: "cardiac looping, week 4", detail: "the earliest functioning organ; the straight heart tube loops and septates into four chambers over the following weeks.", territoryKeys: ["heart"] },
  { id: "gut-tube", structureGroup: "digestive tract", germLayer: "endoderm", event: "gut tube formation, weeks 3–4", detail: "endoderm folds into foregut, midgut and hindgut, which give rise to the lining of the entire digestive tract and its glandular outgrowths (liver, pancreas).", territoryKeys: ["stomach", "small-intestine", "colon", "liver", "pancreas"] },
  { id: "kidney", structureGroup: "kidney", germLayer: "mesoderm", event: "three successive kidney forms, weeks 4–10", detail: "the pronephros and mesonephros are transient; the metanephros becomes the definitive, permanent kidney.", territoryKeys: ["kidney", "nephron"] },
  { id: "gonads", structureGroup: "gonads", germLayer: "mesoderm", event: "sexual differentiation, weeks 7–12", detail: "gonads are initially identical (bipotential) before differentiating into testis or ovary under genetic and hormonal signal.", territoryKeys: ["testis", "ovary"] },
  { id: "limb-buds", structureGroup: "limbs", germLayer: "mesoderm", event: "limb bud outgrowth, weeks 4–8", detail: "limb skeleton and muscle arise from mesoderm under signalling from an overlying ectodermal ridge that patterns proximal-to-distal growth.", territoryKeys: ["bone", "muscle"] },
  { id: "face", structureGroup: "face and palate", germLayer: "neural-crest", event: "facial prominence fusion, weeks 4–10", detail: "paired facial prominences derived largely from neural crest fuse to form the face and palate; incomplete fusion causes cleft lip or palate.", territoryKeys: ["teeth", "upper-airway"] },
];

export const DEVELOPMENTAL_VARIANTS: DevelopmentalVariant[] = [
  { id: "pfo", name: "patent foramen ovale", detail: "the flap-like opening between the atria that lets blood bypass the fetal lungs sometimes fails to seal after birth.", commonality: "common, usually harmless", territoryKeys: ["heart"] },
  { id: "meckel-diverticulum", name: "meckel diverticulum", detail: "a remnant of the fetal yolk stalk left on the small intestine in a minority of people; usually silent, occasionally inflames or bleeds.", commonality: "uncommon", territoryKeys: ["small-intestine"] },
  { id: "horseshoe-kidney", name: "horseshoe kidney", detail: "the two kidneys fuse at their lower poles during ascent from the pelvis, usually causing no problem but altering surgical anatomy.", commonality: "uncommon", territoryKeys: ["kidney"] },
  { id: "bicornuate-uterus", name: "bicornuate uterus", detail: "incomplete fusion of the paired ducts that form the uterus leaves it heart-shaped rather than pear-shaped.", commonality: "uncommon", territoryKeys: ["uterus"] },
  { id: "accessory-spleen", name: "accessory spleen", detail: "a small extra nodule of splenic tissue, usually near the main spleen, of no consequence unless the main spleen is removed.", commonality: "common, usually harmless", territoryKeys: ["spleen"] },
  { id: "bifid-ureter", name: "bifid or duplicated ureter", detail: "a kidney drains through two ureters instead of one, from incomplete or duplicated budding; usually harmless, sometimes predisposes to reflux or infection.", commonality: "uncommon", territoryKeys: ["ureter"] },
  { id: "persistent-thyroglossal-duct", name: "thyroglossal duct cyst", detail: "a remnant of the tract the thyroid gland migrates down during development, appearing as a midline neck lump that moves with swallowing.", commonality: "uncommon", territoryKeys: ["thyroid"] },
  { id: "cervical-rib", name: "cervical rib", detail: "an extra rib arising from the lowest neck vertebra, present in a small minority of people; can compress nearby nerves or vessels (thoracic outlet syndrome).", commonality: "rare", territoryKeys: ["vertebra"] },
];

export function embryologyForTerritory(key: string): EmbryologyEntry[] {
  return EMBRYOLOGY.filter((e) => e.territoryKeys.includes(key));
}

export function variantsForTerritory(key: string): DevelopmentalVariant[] {
  return DEVELOPMENTAL_VARIANTS.filter((v) => v.territoryKeys.includes(key));
}
