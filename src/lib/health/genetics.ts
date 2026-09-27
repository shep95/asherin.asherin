// genetic layer: predisposition expressed as tissue where a variant is expressed, with
// penetrance stated honestly. a variant is a probability shading, never a verdict.
import type { Finding } from "./model";

export interface GeneDef {
  key: string;
  label: string;
  aliases: string[];
  territoryKeys: string[];
  category: "metabolic" | "cardiac" | "oncologic" | "pharmacogenomic" | "connective" | "neurologic" | "haematologic";
  mechanism: string;
  penetrance: string;
  nextStep: string;
  redFlag?: boolean;
}

export const GENE_DEFS: GeneDef[] = [
  {
    key: "apoe4",
    label: "apoe ε4",
    aliases: ["apoe4", "apoe ε4", "apoe e4", "rs429358"],
    territoryKeys: ["hippocampus", "cerebral-cortex", "liver", "coronary"],
    category: "neurologic",
    mechanism: "the ε4 isoform handles lipid transport and amyloid clearance less efficiently in cortex and hippocampus.",
    penetrance: "risk-shifting, not deterministic — most carriers never develop dementia, and non-carriers can.",
    nextStep: "the modifiable side is blood pressure, sleep, hearing and metabolic control across midlife.",
  },
  {
    key: "brca1",
    label: "brca1",
    aliases: ["brca1"],
    territoryKeys: ["lymph-nodes", "adrenal"],
    category: "oncologic",
    mechanism: "loss of homologous recombination repair in dividing epithelium.",
    penetrance: "high penetrance for breast and ovarian tissue; the reference geometry does not carry those organs.",
    nextStep: "this belongs in a genetics clinic with a surveillance protocol, not in a viewer.",
    redFlag: true,
  },
  {
    key: "brca2",
    label: "brca2",
    aliases: ["brca2"],
    territoryKeys: ["prostate", "pancreas", "lymph-nodes"],
    category: "oncologic",
    mechanism: "same repair pathway as brca1, with a broader tissue spread including pancreas and prostate.",
    penetrance: "high penetrance; surveillance protocols exist and change outcomes.",
    nextStep: "genetics clinic referral, and share the result with first-degree relatives.",
    redFlag: true,
  },
  {
    key: "lynch",
    label: "lynch syndrome (mlh1/msh2/msh6)",
    aliases: ["lynch", "mlh1", "msh2", "msh6", "pms2"],
    territoryKeys: ["colon", "stomach", "small-intestine", "ureter"],
    category: "oncologic",
    mechanism: "mismatch repair deficiency accelerates the adenoma to carcinoma sequence in colonic epithelium.",
    penetrance: "high; colonoscopic surveillance interval is the single most consequential decision.",
    nextStep: "confirm your surveillance interval with a gastroenterologist — it is shorter than population screening.",
    redFlag: true,
  },
  {
    key: "factor-v-leiden",
    label: "factor v leiden",
    aliases: ["factor v leiden", "f5 leiden", "rs6025"],
    territoryKeys: ["deep-veins-leg", "lung", "portal-vein"],
    category: "haematologic",
    mechanism: "activated factor v resists inactivation by protein c, tipping the clotting balance in slow venous beds.",
    penetrance: "modest in isolation; risk multiplies with immobility, oestrogen and surgery.",
    nextStep: "mention it before any surgery, long flight or hormonal contraception decision.",
  },
  {
    key: "hfe",
    label: "hfe (haemochromatosis)",
    aliases: ["hfe", "c282y", "h63d", "haemochromatosis", "hemochromatosis"],
    territoryKeys: ["liver", "pancreas", "heart", "hip"],
    category: "metabolic",
    mechanism: "unregulated intestinal iron absorption deposits iron in liver, pancreatic islets, myocardium and joints.",
    penetrance: "biochemical penetrance is common, clinical iron overload much less so.",
    nextStep: "ferritin and transferrin saturation decide whether anything needs doing.",
  },
  {
    key: "mthfr",
    label: "mthfr c677t",
    aliases: ["mthfr", "c677t", "rs1801133"],
    territoryKeys: ["liver", "peripheral-arteries"],
    category: "metabolic",
    mechanism: "reduced enzyme activity in folate cycling, with a small effect on homocysteine.",
    penetrance: "very common and weakly consequential — the variant is heavily overinterpreted commercially.",
    nextStep: "do not buy a protocol for this variant; a homocysteine level answers the only useful question.",
  },
  {
    key: "cyp2c19",
    label: "cyp2c19 reduced function",
    aliases: ["cyp2c19", "*2", "poor metaboliser"],
    territoryKeys: ["liver", "coronary", "stomach"],
    category: "pharmacogenomic",
    mechanism: "clopidogrel needs cyp2c19 to become active; ppis and some ssris are cleared through the same enzyme.",
    penetrance: "directly actionable when a relevant drug is prescribed.",
    nextStep: "tell any prescriber before clopidogrel, ppi or ssri selection.",
  },
  {
    key: "cyp2d6",
    label: "cyp2d6 variant metabolism",
    aliases: ["cyp2d6"],
    territoryKeys: ["liver", "brainstem"],
    category: "pharmacogenomic",
    mechanism: "codeine, tamoxifen and many psychotropics depend on this enzyme; ultrarapid and poor phenotypes both matter.",
    penetrance: "actionable at the moment of prescribing.",
    nextStep: "carry the phenotype on your medication list.",
  },
  {
    key: "slco1b1",
    label: "slco1b1",
    aliases: ["slco1b1"],
    territoryKeys: ["liver", "muscle"],
    category: "pharmacogenomic",
    mechanism: "reduced hepatic statin uptake raises plasma exposure and the chance of muscle symptoms.",
    penetrance: "modifies statin tolerance rather than cardiovascular risk.",
    nextStep: "relevant only if statin-related muscle pain appears.",
  },
  {
    key: "ttr",
    label: "ttr variant",
    aliases: ["ttr", "transthyretin"],
    territoryKeys: ["heart", "peripheral-nerve", "spinal-cord"],
    category: "cardiac",
    mechanism: "misfolded transthyretin deposits as amyloid in myocardium and peripheral nerve.",
    penetrance: "variant- and age-dependent; treatable when identified early.",
    nextStep: "cardiology referral if there is unexplained wall thickening or neuropathy.",
    redFlag: true,
  },
  {
    key: "fh-ldlr",
    label: "familial hypercholesterolaemia (ldlr)",
    aliases: ["ldlr", "familial hypercholesterolaemia", "familial hypercholesterolemia", "pcsk9", "apob variant"],
    territoryKeys: ["coronary", "carotid", "aorta", "liver"],
    category: "cardiac",
    mechanism: "reduced hepatic ldl receptor clearance means lifelong high apoB exposure to arterial intima.",
    penetrance: "high and treatable — cumulative exposure starts in childhood.",
    nextStep: "lipid clinic, and cascade testing of first-degree relatives.",
    redFlag: true,
  },
  {
    key: "marfan-fbn1",
    label: "fbn1 (marfan)",
    aliases: ["fbn1", "marfan"],
    territoryKeys: ["aorta", "eye", "cartilage", "vertebra"],
    category: "connective",
    mechanism: "fibrillin-1 defects weaken elastic tissue in the aortic root, ocular lens suspension and skeleton.",
    penetrance: "high; aortic root surveillance is the intervention that changes outcome.",
    nextStep: "annual echocardiography and avoidance of maximal isometric strain, with cardiology.",
    redFlag: true,
  },
  {
    key: "g6pd",
    label: "g6pd deficiency",
    aliases: ["g6pd"],
    territoryKeys: ["spleen", "marrow-axial", "kidney"],
    category: "haematologic",
    mechanism: "red cells cannot buffer oxidative stress, so certain drugs and foods trigger haemolysis.",
    penetrance: "silent until exposure; the trigger list is the actionable part.",
    nextStep: "keep the trigger list with your medication record.",
  },
];

export interface GeneEntry {
  id: string;
  name: string;
  genotype?: string;
  geneKey?: string;
}

export function findGene(text: string): GeneDef | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  return GENE_DEFS.find((g) => g.aliases.some((a) => t.includes(a)));
}

export function geneFindings(entries: GeneEntry[]): Finding[] {
  return entries.map((entry) => {
    const def = entry.geneKey ? GENE_DEFS.find((g) => g.key === entry.geneKey) : findGene(entry.name);
    if (!def) {
      return {
        id: `gene:${entry.id}`,
        layer: "gene" as const,
        label: `${entry.name} — not in the reference set`,
        detail: "recorded, but no tissue mapping is claimed for this variant.",
        mechanism: "an unmapped variant is left unmapped rather than guessed.",
        nextStep: "a clinical genetics service can interpret it properly.",
        territoryKeys: [],
        direction: "neutral" as const,
        weight: 0.2,
        source: "your genetic record",
      };
    }
    return {
      id: `gene:${entry.id}`,
      layer: "gene" as const,
      label: `${def.label}${entry.genotype ? ` · ${entry.genotype}` : ""}`,
      detail: def.penetrance,
      mechanism: def.mechanism,
      nextStep: def.nextStep,
      territoryKeys: def.territoryKeys,
      direction: "risk" as const,
      weight: def.redFlag ? 0.7 : 0.45,
      source: `genetic record · ${def.category}`,
      redFlag: def.redFlag,
    };
  });
}
