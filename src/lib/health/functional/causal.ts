// causal reasoning layer: chains a recorded input (lab, gene, medication, exposure, symptom)
// through the interdependency network to a territory of interest, and the reverse — given a
// symptom, which territories/mechanisms could plausibly generate it, ranked by how much of the
// record supports each and what would move that ranking. never a diagnosis: language stays in
// "consistent with", "would raise", "would lower".
import type { HealthRecord } from "../store";
import { labDef, type LabValue } from "../labs";
import { GENE_DEFS, findGene, type GeneEntry } from "../genetics";
import { DRUG_DEFS, findDrug, type MedicationEntry } from "../medications";
import { EXPOSURES, type ExposureEntry } from "../records";
import { SYMPTOMS, type SymptomEntry } from "../symptoms";
import { NODES, EDGES, propagate } from "./interdependency";

export interface CausalStep {
  label: string;
  detail: string;
  source: string;
  confidence: number;
}

export interface CausalChain {
  steps: CausalStep[];
  conclusion: string;
  confidence: number;
  uncertainties: string[];
}

interface RecordedInput {
  label: string;
  detail: string;
  source: string;
  territoryKeys: string[];
  confidence: number;
}

function collectInputs(record: HealthRecord): RecordedInput[] {
  const out: RecordedInput[] = [];
  for (const v of record.labs as LabValue[]) {
    const def = labDef(v.key);
    if (!def) continue;
    const rule = v.value > def.high ? def.elevated : v.value < def.low ? def.reduced : undefined;
    if (!rule) continue;
    out.push({
      label: `${def.label} ${v.value > def.high ? "above" : "below"} reference`,
      detail: `${v.value} ${def.unit} against ${def.low}–${def.high} ${def.unit}. ${rule.mechanism}`,
      source: "laboratory value you entered",
      territoryKeys: rule.territoryKeys,
      confidence: 0.55,
    });
  }
  for (const g of record.genes as GeneEntry[]) {
    const def = g.geneKey ? GENE_DEFS.find((d) => d.key === g.geneKey) : findGene(g.name);
    if (!def) continue;
    out.push({
      label: `${def.label} recorded`,
      detail: `${def.mechanism} ${def.penetrance}`,
      source: "your genetic record",
      territoryKeys: def.territoryKeys,
      confidence: 0.4,
    });
  }
  for (const m of record.medications as MedicationEntry[]) {
    const def = m.drugKey ? DRUG_DEFS.find((d) => d.key === m.drugKey) : findDrug(m.name);
    if (!def) continue;
    out.push({
      label: `${def.label} on your medication list`,
      detail: def.mechanism,
      source: "your medication list",
      territoryKeys: [...def.actsOn, ...def.burden],
      confidence: 0.45,
    });
  }
  for (const x of record.exposures as ExposureEntry[]) {
    const def = EXPOSURES.find((d) => d.key === x.exposureKey);
    if (!def) continue;
    out.push({
      label: `${def.label} exposure (${x.intensity.replace("-", " ")})`,
      detail: def.mechanism,
      source: "your exposure record",
      territoryKeys: def.territoryKeys,
      confidence: x.intensity === "current-high" ? 0.5 : 0.35,
    });
  }
  for (const s of record.symptoms as SymptomEntry[]) {
    const def = SYMPTOMS.find((d) => d.key === s.symptomKey);
    if (!def) continue;
    out.push({
      label: `symptom: ${def.label} (${s.severity}/10)`,
      detail: def.mechanism,
      source: "your symptom record",
      territoryKeys: def.territoryKeys,
      confidence: Math.max(0.2, Math.min(0.6, s.severity / 15)),
    });
  }
  return out;
}

/** which network node (if any) carries a given territory key. */
function nodeFor(territoryKey: string): { id: string; label: string } | undefined {
  const n = NODES.find((node) => node.territoryKeys.includes(territoryKey));
  return n ? { id: n.id, label: n.label } : undefined;
}

/**
 * build every plausible causal chain in the record that reasons toward `seed` (a territory key).
 * a chain is either direct (the input's territory keys already include the seed) or mediated
 * through one or more interdependency edges reaching a node that covers the seed.
 */
export function buildCausalChains(record: HealthRecord, seed: string): CausalChain[] {
  const inputs = collectInputs(record);
  const chains: CausalChain[] = [];
  const seedNode = nodeFor(seed);

  for (const input of inputs) {
    if (input.territoryKeys.includes(seed)) {
      chains.push({
        steps: [
          { label: input.label, detail: input.detail, source: input.source, confidence: input.confidence },
        ],
        conclusion: `${input.label} maps directly onto ${seed.replace(/-/g, " ")}.`,
        confidence: input.confidence,
        uncertainties: ["a direct territory match does not establish that this input is the only, or even the main, contributor."],
      });
      continue;
    }
    if (!seedNode) continue;
    const propagated = propagate(input.territoryKeys, record);
    const hit = propagated.find((p) => p.nodeId === seedNode.id);
    if (!hit || hit.distance === 0) continue;
    const decay = Math.pow(0.7, hit.distance);
    const confidence = Math.max(0.1, input.confidence * hit.strength * decay);
    chains.push({
      steps: [
        { label: input.label, detail: input.detail, source: input.source, confidence: input.confidence },
        { label: `propagates via ${hit.path.slice(1).join(" → ") || seedNode.label}`, detail: hit.explanation, source: "interdependency network · qualitative edges, not fitted to your data", confidence: hit.strength },
      ],
      conclusion: `${input.label} plausibly reaches ${seedNode.label} through ${hit.distance} mechanistic step${hit.distance === 1 ? "" : "s"}.`,
      confidence,
      uncertainties: [
        "edge strengths here are qualitative physiological judgements, not measured from your data.",
        "a multi-step chain is a plausibility statement, not a proven pathway; each step weakens it.",
      ],
    });
  }

  return chains.sort((a, b) => b.confidence - a.confidence);
}

export interface ReverseCandidate {
  territoryKey: string;
  mechanism: string;
  likelihood: "some support in your record" | "weak support in your record" | "no support in your record yet";
  supportingInputs: string[];
  wouldRaise: string[];
  wouldLower: string[];
}

/** given a symptom key, rank the territories/mechanisms it could plausibly be generated by. */
export function reverseSymptomMap(symptomKey: string, record: HealthRecord): { candidates: ReverseCandidate[]; note: string } {
  const def = SYMPTOMS.find((s) => s.key === symptomKey);
  if (!def) return { candidates: [], note: "that symptom is not in the reference set yet." };

  const inputs = collectInputs(record);
  const candidates: ReverseCandidate[] = def.territoryKeys.map((territoryKey) => {
    const supporting = inputs.filter((i) => i.territoryKeys.includes(territoryKey));
    const wouldRaise: string[] = [];
    const wouldLower: string[] = [];
    const edgesIn = EDGES.filter((e) => {
      const node = nodeFor(territoryKey);
      return node && e.to === node.id;
    });
    for (const e of edgesIn) {
      const fromNode = NODES.find((n) => n.id === e.from);
      if (fromNode) wouldRaise.push(`worsening ${fromNode.label} function (${e.mechanism})`);
    }
    wouldLower.push("resolution of the supporting inputs above, or their absence being confirmed by further testing.");
    const likelihood: ReverseCandidate["likelihood"] =
      supporting.length >= 2 ? "some support in your record" : supporting.length === 1 ? "weak support in your record" : "no support in your record yet";
    return {
      territoryKey,
      mechanism: def.mechanism,
      likelihood,
      supportingInputs: supporting.map((s) => s.label),
      wouldRaise,
      wouldLower,
    };
  });

  candidates.sort((a, b) => b.supportingInputs.length - a.supportingInputs.length);
  const note =
    candidates.every((c) => c.supportingInputs.length === 0)
      ? "not enough in your record yet to favour any one territory — this is the full reference list for this symptom, unranked by your data."
      : "ranked by how many recorded inputs in your own record touch each territory; this is never a diagnosis.";
  return { candidates, note };
}
