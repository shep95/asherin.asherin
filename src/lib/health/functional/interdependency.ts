// organ/system interdependency network: a small directed graph of mechanistic edges used to
// propagate a set of seed territories outward with decay, and to answer "what feeds into this
// node". strengths are qualitative judgements stated as such, not fitted to data.
import type { HealthRecord } from "../store";

export interface InterNode { id: string; label: string; territoryKeys: string[]; kind: "system" | "organ" }
export interface InterEdge { from: string; to: string; mechanism: string; strength: number }

export const NODES: InterNode[] = [
  { id: "hypothalamus", label: "hypothalamus", territoryKeys: ["hypothalamus"], kind: "organ" },
  { id: "pituitary", label: "pituitary", territoryKeys: ["pituitary"], kind: "organ" },
  { id: "adrenal", label: "adrenal", territoryKeys: ["adrenal"], kind: "organ" },
  { id: "thyroid", label: "thyroid", territoryKeys: ["thyroid"], kind: "organ" },
  { id: "heart", label: "heart", territoryKeys: ["heart", "coronary"], kind: "organ" },
  { id: "liver", label: "liver", territoryKeys: ["liver"], kind: "organ" },
  { id: "gut", label: "gut", territoryKeys: ["colon", "small-intestine", "stomach"], kind: "system" },
  { id: "pancreas", label: "pancreas", territoryKeys: ["pancreas"], kind: "organ" },
  { id: "kidney", label: "kidney", territoryKeys: ["kidney"], kind: "organ" },
  { id: "immune", label: "immune / lymphatic", territoryKeys: ["lymph-nodes", "lymphatic", "spleen"], kind: "system" },
  { id: "vasculature", label: "vasculature", territoryKeys: ["peripheral-arteries", "carotid", "aorta"], kind: "system" },
  { id: "brain", label: "brain", territoryKeys: ["brain", "cerebral-cortex", "hippocampus", "amygdala"], kind: "organ" },
  { id: "muscle", label: "muscle", territoryKeys: ["muscle"], kind: "system" },
  { id: "sleep-axis", label: "sleep / circadian axis", territoryKeys: ["pineal", "hypothalamus"], kind: "system" },
];

export const EDGES: InterEdge[] = [
  { from: "hypothalamus", to: "pituitary", mechanism: "releasing hormones from the hypothalamus drive pituitary output.", strength: 0.9 },
  { from: "pituitary", to: "adrenal", mechanism: "acth from the pituitary drives cortisol release from the adrenal cortex.", strength: 0.85 },
  { from: "pituitary", to: "thyroid", mechanism: "tsh from the pituitary sets thyroid hormone output.", strength: 0.85 },
  { from: "adrenal", to: "heart", mechanism: "cortisol and catecholamines raise heart rate and blood pressure.", strength: 0.6 },
  { from: "adrenal", to: "gut", mechanism: "sympathetic tone from sustained cortisol slows gut motility and alters the microbiome.", strength: 0.5 },
  { from: "adrenal", to: "immune", mechanism: "sustained cortisol suppresses lymphocyte function over time.", strength: 0.55 },
  { from: "thyroid", to: "heart", mechanism: "thyroid hormone sets cardiac chronotropy and contractility.", strength: 0.6 },
  { from: "thyroid", to: "liver", mechanism: "thyroid hormone drives hepatic metabolic rate and lipid handling.", strength: 0.5 },
  { from: "liver", to: "vasculature", mechanism: "hepatic lipid and glucose output loads arterial intima over time.", strength: 0.55 },
  { from: "liver", to: "immune", mechanism: "the liver makes acute-phase proteins such as crp under il-6 signalling.", strength: 0.5 },
  { from: "gut", to: "immune", mechanism: "most of the body's lymphoid tissue sits along the gut wall.", strength: 0.6 },
  { from: "gut", to: "brain", mechanism: "vagal and microbial signalling from the gut modulates mood and cognition.", strength: 0.4 },
  { from: "pancreas", to: "liver", mechanism: "insulin and glucagon set hepatic glucose output directly.", strength: 0.6 },
  { from: "pancreas", to: "vasculature", mechanism: "insulin resistance drives endothelial dysfunction.", strength: 0.5 },
  { from: "kidney", to: "vasculature", mechanism: "renal sodium and renin-angiotensin handling sets systemic blood pressure.", strength: 0.6 },
  { from: "kidney", to: "heart", mechanism: "fluid and electrolyte handling by the kidney directly affects cardiac load.", strength: 0.5 },
  { from: "immune", to: "vasculature", mechanism: "inflammatory cytokines drive endothelial activation and plaque instability.", strength: 0.55 },
  { from: "immune", to: "brain", mechanism: "systemic inflammatory signalling reaches the brain and is associated with fatigue and low mood.", strength: 0.4 },
  { from: "sleep-axis", to: "adrenal", mechanism: "circadian misalignment disturbs the normal cortisol awakening rhythm.", strength: 0.5 },
  { from: "sleep-axis", to: "pancreas", mechanism: "circadian disruption reduces insulin sensitivity independent of diet.", strength: 0.45 },
  { from: "sleep-axis", to: "brain", mechanism: "sleep loss impairs hippocampal consolidation and prefrontal control.", strength: 0.5 },
  { from: "muscle", to: "vasculature", mechanism: "inactive muscle lowers lipoprotein lipase activity, changing circulating lipids.", strength: 0.35 },
  { from: "vasculature", to: "brain", mechanism: "cerebral perfusion depends directly on the health of the arterial bed feeding it.", strength: 0.5 },
  { from: "vasculature", to: "heart", mechanism: "coronary arterial health sets myocardial oxygen supply.", strength: 0.6 },
];

export interface PropagatedNode {
  nodeId: string;
  label: string;
  distance: number;
  strength: number;
  path: string[];
  explanation: string;
}

function nodesForTerritories(seedTerritories: string[]): InterNode[] {
  const seed = new Set(seedTerritories);
  return NODES.filter((n) => n.territoryKeys.some((k) => seed.has(k)));
}

/** breadth-first propagation with multiplicative decay along edges; record only unused today
 * but kept in the signature so this can eventually weight by record-specific findings. */
export function propagate(seedTerritories: string[], _record?: HealthRecord, cutoff = 0.05): PropagatedNode[] {
  const seeds = nodesForTerritories(seedTerritories);
  if (seeds.length === 0) return [];
  const best = new Map<string, PropagatedNode>();
  const queue: { id: string; strength: number; distance: number; path: string[] }[] = seeds.map((s) => ({
    id: s.id,
    strength: 1,
    distance: 0,
    path: [s.label],
  }));
  while (queue.length) {
    const current = queue.shift()!;
    const existing = best.get(current.id);
    if (existing && existing.strength >= current.strength) continue;
    const node = NODES.find((n) => n.id === current.id)!;
    best.set(current.id, {
      nodeId: current.id,
      label: node.label,
      distance: current.distance,
      strength: current.strength,
      path: current.path,
      explanation: current.distance === 0 ? "seed territory from the current selection." : `reached via ${current.path.join(" → ")}.`,
    });
    for (const edge of EDGES.filter((e) => e.from === current.id)) {
      const nextStrength = current.strength * edge.strength;
      if (nextStrength < cutoff) continue;
      queue.push({ id: edge.to, strength: nextStrength, distance: current.distance + 1, path: [...current.path, `${NODES.find((n) => n.id === edge.to)?.label} (${edge.mechanism})`] });
    }
  }
  return [...best.values()].sort((a, b) => b.strength - a.strength);
}

/** which edges feed into a given node — "what chains into this". */
export function chainsInto(nodeId: string): InterEdge[] {
  return EDGES.filter((e) => e.to === nodeId);
}
