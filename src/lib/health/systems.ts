// asherin.health — base anatomy model.
// geometry: BodyParts3D 4.0 (© Database Center for Life Science, CC BY 4.0), adapted:
// millimetres/Z-up → metres/Y-up, simplified with meshoptimizer, normals quantised to
// signed 16-bit, packed into binary chunks served from the asherin cdn.

export type SystemId =
  | "skeletal"
  | "muscular"
  | "arterial"
  | "venous"
  | "nervous"
  | "digestive"
  | "respiratory"
  | "urinary"
  | "reproductive"
  | "lymphatic"
  | "endocrine"
  | "integumentary"
  | "connective"
  | "sensory"
  | "cardiac";

export interface SystemDef {
  id: SystemId;
  name: string;
  color: string;
  description: string;
}

export const SYSTEMS: SystemDef[] = [
  {
    id: "skeletal",
    name: "skeleton",
    color: "#e2d9ba",
    description:
      "bone forms the supporting frame, protects organs and anchors muscle. its interior stores minerals and makes blood cells.",
  },
  {
    id: "muscular",
    name: "muscle",
    color: "#a85b50",
    description:
      "skeletal muscle moves joints by pulling on its attachments, holds posture and produces heat.",
  },
  {
    id: "cardiac",
    name: "heart",
    color: "#b96760",
    description:
      "a four-chambered muscular pump. its valves keep blood moving forward through the pulmonary and systemic circuits.",
  },
  {
    id: "sensory",
    name: "sensory organs",
    color: "#b0c8ce",
    description:
      "eye, ear and related structures. specialised tissue turns light, sound and motion into nerve signal.",
  },
  {
    id: "arterial",
    name: "arteries",
    color: "#c05245",
    description: "arteries carry blood away from the heart to the tissues, and to the lungs in the pulmonary circuit.",
  },
  {
    id: "venous",
    name: "veins",
    color: "#527c9f",
    description: "veins return blood toward the heart. superficial and deep networks drain the tissues.",
  },
  {
    id: "nervous",
    name: "nervous system",
    color: "#d8b565",
    description:
      "brain, spinal cord and peripheral nerves carry and process signal: sensation, movement, coordination and automatic regulation.",
  },
  {
    id: "respiratory",
    name: "respiratory",
    color: "#b98991",
    description:
      "airways conduct air to the lungs, where oxygen and carbon dioxide exchange across the alveolar surface.",
  },
  {
    id: "digestive",
    name: "digestive",
    color: "#b8916b",
    description:
      "the tract breaks food down, absorbs nutrients and water and moves waste on. accessory organs add bile and enzymes.",
  },
  {
    id: "urinary",
    name: "urinary",
    color: "#b47961",
    description:
      "the kidneys filter blood and hold fluid, electrolyte and acid–base balance. urine passes to the bladder through the ureters.",
  },
  {
    id: "lymphatic",
    name: "lymphatic",
    color: "#879f7c",
    description: "lymph vessels return tissue fluid to the circulation. nodes and lymphoid organs run immune surveillance.",
  },
  {
    id: "endocrine",
    name: "endocrine",
    color: "#c5a09a",
    description:
      "endocrine organs release hormones into blood to coordinate metabolism, growth, stress response and reproduction.",
  },
  {
    id: "reproductive",
    name: "reproductive",
    color: "#bda098",
    description: "the reproductive structures represented in this reference body, with their hormonal roles.",
  },
  {
    id: "integumentary",
    name: "body surface",
    color: "#ba9b7d",
    description:
      "the outer surface: barrier, sensation and temperature regulation. shown translucent so the interior stays visible.",
  },
  {
    id: "connective",
    name: "connective tissue",
    color: "#aec3bb",
    description: "cartilage, ligament and related tissue support, connect and separate structures and stabilise joints.",
  },
];

export const SYSTEM_BY_ID: Record<SystemId, SystemDef> = Object.fromEntries(
  SYSTEMS.map((s) => [s.id, s]),
) as Record<SystemId, SystemDef>;

/** a region one of the intelligence layers is pointing at, with why. */
export interface TerritoryHighlight {
  partIds: string[];
  color: string;
  /** 0..1 — how strongly the layer wants this region noticed. */
  intensity: number;
  label: string;
  reason: string;
  source: string;
}
