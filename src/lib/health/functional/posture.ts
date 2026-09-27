// functional layer: postural / kinetic-chain load read from body-model geometry, pain
// reports and activity/exposure entries. reasons up the chain foot -> knee -> hip -> pelvis
// -> spine -> shoulder -> neck -> jaw, describing plausible compensation, never diagnosing.
import type { HealthRecord } from "../store";
import type { Finding } from "../model";

export interface PostureSegment {
  id: string;
  label: string;
  territoryKeys: string[];
}

export const KINETIC_CHAIN: PostureSegment[] = [
  { id: "foot", label: "foot / ankle", territoryKeys: [] },
  { id: "knee", label: "knee", territoryKeys: ["knee", "cartilage"] },
  { id: "hip", label: "hip", territoryKeys: ["hip"] },
  { id: "pelvis", label: "pelvis", territoryKeys: ["sacroiliac"] },
  { id: "spine", label: "spine", territoryKeys: ["vertebra", "muscle"] },
  { id: "shoulder", label: "shoulder", territoryKeys: ["shoulder"] },
  { id: "neck", label: "neck", territoryKeys: ["vertebra", "muscle"] },
  { id: "jaw", label: "jaw", territoryKeys: ["tmj", "masseter"] },
];

export interface PostureChainStep {
  segmentId: string;
  label: string;
  load: number;
  inputs: string[];
  compensationNote: string;
}

export interface PostureAssessment {
  chain: PostureChainStep[];
  findings: Finding[];
  confidence: number;
  notes: string[];
}

export function computePosture(record: HealthRecord): PostureAssessment {
  const notes: string[] = [];
  const chain = new Map<string, PostureChainStep>();
  for (const seg of KINETIC_CHAIN) chain.set(seg.id, { segmentId: seg.id, label: seg.label, load: 0, inputs: [], compensationNote: "" });

  let signals = 0;

  for (const p of record.pain) {
    for (const seg of KINETIC_CHAIN) {
      if (seg.territoryKeys.length === 0) continue;
      if (p.territoryKeys.some((k) => seg.territoryKeys.includes(k))) {
        signals++;
        const severity = Number(p.answers.severity ?? 5);
        const step = chain.get(seg.id)!;
        step.load = Math.min(1, step.load + severity / 15);
        step.inputs.push(`pain report at ${p.partName ?? seg.label} (${severity}/10)`);
      }
    }
  }


  const sedentary = record.exposures.some((e) => e.exposureKey === "sedentary");
  if (sedentary) {
    signals++;
    for (const segId of ["hip", "pelvis", "spine"]) {
      const step = chain.get(segId)!;
      step.load = Math.min(1, step.load + 0.15);
      step.inputs.push("exposure: prolonged sitting recorded");
    }
  }

  // propagate a compensation note downstream/upstream along the chain when a segment is loaded.
  const order = KINETIC_CHAIN.map((s) => s.id);
  for (let i = 0; i < order.length; i++) {
    const step = chain.get(order[i])!;
    if (step.load <= 0) continue;
    const upstream = i > 0 ? chain.get(order[i - 1])!.label : null;
    const downstream = i < order.length - 1 ? chain.get(order[i + 1])!.label : null;
    step.compensationNote = `sustained load here plausibly shifts mechanical demand toward the ${downstream ?? "adjacent segment"}${upstream ? ` and reflects load already carried from the ${upstream}` : ""}; this is a mechanical reasoning chain, not a measured transfer.`;
  }

  if (signals === 0) notes.push("not enough in your record yet — pain reports at a joint, or body-model posture notes, would let this reason about the chain.");

  const findings: Finding[] = [...chain.values()]
    .filter((s) => s.load > 0.15)
    .map((s) => {
      const seg = KINETIC_CHAIN.find((k) => k.id === s.segmentId)!;
      return {
        id: `posture:${s.segmentId}`,
        layer: "pain" as const,
        label: `postural load — ${s.label}`,
        detail: `built from: ${s.inputs.join("; ")}.`,
        mechanism: s.compensationNote,
        nextStep: "a physiotherapist assessment of the whole chain is more useful than treating one joint in isolation.",
        territoryKeys: seg.territoryKeys,
        direction: "elevated" as const,
        weight: s.load,
        source: "posture layer · derived from your record",
      };
    });

  const confidence = signals === 0 ? 0.1 : Math.max(0.2, Math.min(0.8, 0.2 + signals * 0.12));

  return { chain: [...chain.values()], findings, confidence, notes };
}
