// asherin.health — life-phase layer: expected structural and functional change by system
// across the lifespan. descriptive reference only, never a comparison against the person's
// own measured data (other layers own that).
import type { SystemId } from "./systems";

export interface LifePhase {
  id: string;
  label: string;
  ageRange: string;
  minAge: number;
  maxAge: number;
  changes: { system: SystemId; detail: string; territoryKeys: string[] }[];
}

export const LIFE_PHASES: LifePhase[] = [
  {
    id: "infant", label: "infant", ageRange: "0–1 year", minAge: 0, maxAge: 1,
    changes: [
      { system: "skeletal", detail: "bones are cartilage-rich and still fusing; fontanelles remain open to allow rapid brain growth.", territoryKeys: ["bone"] },
      { system: "nervous", detail: "the brain roughly doubles in size in the first year as synapses form at a very high rate.", territoryKeys: ["brain"] },
      { system: "integumentary", detail: "the skin barrier is still maturing and is more permeable and injury-prone than later in life.", territoryKeys: ["skin"] },
    ],
  },
  {
    id: "child", label: "child", ageRange: "1–10 years", minAge: 1, maxAge: 10,
    changes: [
      { system: "skeletal", detail: "growth plates remain active, driving steady height gain; bone is more flexible and less brittle than adult bone.", territoryKeys: ["bone"] },
      { system: "lymphatic", detail: "lymphoid tissue, including tonsils and adenoids, is proportionally larger than in adulthood.", territoryKeys: ["lymph-nodes", "upper-airway"] },
      { system: "nervous", detail: "myelination and synaptic pruning continue, refining motor coordination and attention.", territoryKeys: ["brain"] },
    ],
  },
  {
    id: "adolescent", label: "adolescent", ageRange: "10–19 years", minAge: 10, maxAge: 19,
    changes: [
      { system: "endocrine", detail: "the hypothalamic-pituitary-gonadal axis activates, driving puberty and the growth spurt.", territoryKeys: ["hypothalamus", "pituitary"] },
      { system: "skeletal", detail: "peak growth velocity occurs, with growth plates closing toward the end of this phase.", territoryKeys: ["bone"] },
      { system: "nervous", detail: "the prefrontal cortex is still maturing, lagging behind emotional and reward circuitry.", territoryKeys: ["frontal-lobe"] },
      { system: "reproductive", detail: "primary and secondary sexual characteristics develop under rising sex hormone levels.", territoryKeys: ["testis", "ovary"] },
    ],
  },
  {
    id: "young-adult", label: "young adult", ageRange: "19–30 years", minAge: 19, maxAge: 30,
    changes: [
      { system: "skeletal", detail: "peak bone density is reached in this window, the reserve drawn on for the rest of life.", territoryKeys: ["bone"] },
      { system: "nervous", detail: "the prefrontal cortex completes its maturation by the mid-20s.", territoryKeys: ["frontal-lobe"] },
      { system: "muscular", detail: "muscle mass and strength are typically at or near their lifetime peak.", territoryKeys: ["muscle"] },
    ],
  },
  {
    id: "adult", label: "adult", ageRange: "30–45 years", minAge: 30, maxAge: 45,
    changes: [
      { system: "skeletal", detail: "bone density begins a slow, gradual decline after the peak reached in the twenties.", territoryKeys: ["bone"] },
      { system: "integumentary", detail: "collagen production begins a gradual, steady decline that continues for the rest of life.", territoryKeys: ["skin"] },
      { system: "reproductive", detail: "fertility begins a gradual decline, more markedly for women in the second half of this decade.", territoryKeys: ["ovary", "testis"] },
    ],
  },
  {
    id: "midlife", label: "midlife", ageRange: "45–65 years", minAge: 45, maxAge: 65,
    changes: [
      { system: "reproductive", detail: "women typically go through menopause in this window as ovarian hormone production ends; men experience a more gradual decline in testosterone.", territoryKeys: ["ovary", "testis"] },
      { system: "skeletal", detail: "bone loss accelerates in women after menopause as estrogen's protective effect is lost.", territoryKeys: ["bone"] },
      { system: "sensory", detail: "lens flexibility declines (presbyopia) and high-frequency hearing often begins to fade.", territoryKeys: ["eye", "cochlea"] },
      { system: "cardiac", detail: "arterial stiffness increases gradually, raising systolic blood pressure over time.", territoryKeys: ["aorta", "heart"] },
    ],
  },
  {
    id: "older-adult", label: "older adult", ageRange: "65–80 years", minAge: 65, maxAge: 80,
    changes: [
      { system: "muscular", detail: "sarcopenia (age-related muscle loss) accelerates, affecting strength and balance.", territoryKeys: ["muscle"] },
      { system: "skeletal", detail: "fracture risk rises meaningfully as bone density and microarchitecture continue to decline.", territoryKeys: ["bone"] },
      { system: "nervous", detail: "processing speed typically slows, though vocabulary and accumulated knowledge are often preserved.", territoryKeys: ["brain"] },
      { system: "urinary", detail: "kidney filtration capacity gradually declines, changing how some medications are cleared.", territoryKeys: ["kidney", "nephron"] },
    ],
  },
  {
    id: "elder", label: "elder", ageRange: "80+ years", minAge: 80, maxAge: 130,
    changes: [
      { system: "skeletal", detail: "bone fragility and fall-related fracture risk are highest in this phase.", territoryKeys: ["bone"] },
      { system: "nervous", detail: "brain volume and white matter integrity decline further; the pace and pattern vary greatly between individuals.", territoryKeys: ["brain"] },
      { system: "integumentary", detail: "skin is markedly thinner, less elastic and slower to heal.", territoryKeys: ["skin"] },
      { system: "cardiac", detail: "the heart's reserve capacity for exertion or stress is reduced even without overt disease.", territoryKeys: ["heart"] },
    ],
  },
];

export function phaseForAge(age: number): LifePhase {
  return LIFE_PHASES.find((p) => age >= p.minAge && age < p.maxAge) ?? LIFE_PHASES[LIFE_PHASES.length - 1];
}

export function phaseById(id: string): LifePhase | undefined {
  return LIFE_PHASES.find((p) => p.id === id);
}
