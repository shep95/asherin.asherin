// shared shapes for every asherin.health intelligence layer.
import type { TerritoryHighlight } from "./systems";

export type LayerId =
  | "lab"
  | "medication"
  | "gene"
  | "nutrition"
  | "exposure"
  | "surgery"
  | "family"
  | "pain"
  | "symptom"
  | "herb"
  | "inflammation"
  | "stress"
  | "circadian"
  | "aging"
  | "live";

export type Direction = "elevated" | "low" | "risk" | "absent" | "active" | "neutral";

export interface Finding {
  id: string;
  layer: LayerId;
  label: string;
  /** what was observed, in plain language. never a diagnosis. */
  detail: string;
  /** physiological meaning: why this territory lights up. */
  mechanism: string;
  /** what the person can do next. every concern carries a next step. */
  nextStep: string;
  territoryKeys: string[];
  direction: Direction;
  /** 0..1 confidence-weighted salience used for opacity on the atlas. */
  weight: number;
  source: string;
  /** true when the pattern warrants prompt clinical evaluation. */
  redFlag?: boolean;
}

export const DIRECTION_COLOR: Record<Direction, string> = {
  elevated: "#c9622f",
  low: "#4f83b3",
  risk: "#b39348",
  absent: "#7b7f86",
  active: "#4f9e86",
  neutral: "#8b9099",
};

export const PAIN_SEVERE = "#e0402a";
export const PAIN_MILD = "#e78a2e";

/** every finding as a region the room can point at, coloured by direction; pain reads in red and orange only. */
export function findingHighlights(findings: Finding[]): TerritoryHighlight[] {
  return findings
    .filter((f) => f.territoryKeys.length > 0)
    .map((f) => ({
      partIds: [],
      color: f.layer === "pain" ? (f.weight >= 0.6 ? PAIN_SEVERE : PAIN_MILD) : DIRECTION_COLOR[f.direction],
      intensity: f.layer === "pain" ? Math.max(0.45, Math.min(1, f.weight)) : Math.max(0.15, Math.min(1, f.weight)),
      label: f.label,
      reason: f.mechanism,
      source: f.source,
    }));
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => Number(!!b.redFlag) - Number(!!a.redFlag) || b.weight - a.weight);
}
