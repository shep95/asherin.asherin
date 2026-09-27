// the anatomical territory catalogue: every named region a layer can point at, with
// the body system it belongs to. panels refer to territories by key; labels resolve here.
import type { SystemId } from "./systems";

export interface TerritoryDef {
  key: string;
  label: string;
  /** lower-case substrings; a concept or part matches if its name contains any of them. */
  match: string[];
  /** optional system restriction to stop a name colliding across systems. */
  systems?: SystemId[];
  note?: string;
}

export const TERRITORIES: TerritoryDef[] = [
  { key: "brain", label: "brain", match: ["brain", "cerebral hemisphere", "cerebrum"], systems: ["nervous"] },
  { key: "cerebral-cortex", label: "cerebral cortex", match: ["cortex", "cerebral hemisphere"], systems: ["nervous"] },
  { key: "frontal-lobe", label: "frontal lobe", match: ["frontal lobe"], systems: ["nervous"] },
  { key: "temporal-lobe", label: "temporal lobe", match: ["temporal lobe"], systems: ["nervous"] },
  { key: "occipital-lobe", label: "occipital lobe", match: ["occipital lobe"], systems: ["nervous"] },
  { key: "parietal-lobe", label: "parietal lobe", match: ["parietal lobe"], systems: ["nervous"] },
  { key: "hippocampus", label: "hippocampus", match: ["hippocamp"], systems: ["nervous"] },
  { key: "amygdala", label: "amygdala", match: ["amygdal"], systems: ["nervous"] },
  { key: "hypothalamus", label: "hypothalamus", match: ["hypothalam"], systems: ["nervous", "endocrine"] },
  { key: "thalamus", label: "thalamus", match: ["thalamus"], systems: ["nervous"] },
  { key: "basal-ganglia", label: "basal ganglia", match: ["caudate", "putamen", "pallidum", "globus pallidus", "substantia nigra"] },
  { key: "cerebellum", label: "cerebellum", match: ["cerebell"], systems: ["nervous"] },
  { key: "brainstem", label: "brainstem", match: ["medulla oblongata", "pons", "midbrain", "brain stem"] },
  { key: "pituitary", label: "pituitary gland", match: ["hypophysis", "pituitary"] },
  { key: "pineal", label: "pineal gland", match: ["pineal"] },
  { key: "spinal-cord", label: "spinal cord", match: ["spinal cord"], systems: ["nervous"] },
  { key: "peripheral-nerve", label: "peripheral nerves", match: ["nerve"], systems: ["nervous"] },
  { key: "vagus", label: "vagus nerve", match: ["vagus", "vagal"] },
  { key: "sympathetic-chain", label: "sympathetic chain", match: ["sympathetic", "splanchnic", "ganglion"] },
  { key: "optic-nerve", label: "optic nerve", match: ["optic nerve", "optic tract"] },
  { key: "trigeminal", label: "trigeminal nerve", match: ["trigeminal"] },
  { key: "facial-nerve", label: "facial nerve", match: ["facial nerve"] },
  { key: "vestibulocochlear", label: "vestibulocochlear nerve", match: ["vestibulocochlear", "cochlear nerve", "vestibular nerve"] },

  { key: "heart", label: "heart", match: ["heart", "ventricle of heart", "atrium"], systems: ["cardiac"] },
  { key: "coronary", label: "coronary arteries", match: ["coronary"], systems: ["arterial", "venous", "cardiac"] },
  { key: "aorta", label: "aorta", match: ["aorta", "aortic"], systems: ["arterial"] },
  { key: "carotid", label: "carotid arteries", match: ["carotid"], systems: ["arterial"] },
  { key: "cerebral-arteries", label: "cerebral arteries", match: ["cerebral artery", "basilar artery", "vertebral artery"] },
  { key: "pulmonary-vessels", label: "pulmonary vessels", match: ["pulmonary artery", "pulmonary vein", "pulmonary trunk"] },
  { key: "deep-veins-leg", label: "deep veins of the leg", match: ["femoral vein", "popliteal vein", "tibial vein", "iliac vein"] },
  { key: "portal-vein", label: "portal vein", match: ["portal vein", "hepatic vein", "splenic vein", "mesenteric vein"] },
  { key: "peripheral-arteries", label: "peripheral arteries", match: ["artery"], systems: ["arterial"] },
  { key: "veins", label: "venous system", match: ["vein"], systems: ["venous"] },

  { key: "lung", label: "lungs", match: ["lung", "bronch", "alveolar"], systems: ["respiratory"] },
  { key: "upper-airway", label: "upper airway", match: ["pharynx", "soft palate", "uvula", "tongue", "larynx", "epiglottis"] },
  { key: "trachea", label: "trachea", match: ["trachea"] },
  { key: "diaphragm", label: "diaphragm", match: ["diaphragm"], systems: ["muscular"] },
  { key: "pleura", label: "pleura", match: ["pleura"], note: "pleural cavities are not separated in the reference geometry." },

  { key: "liver", label: "liver", match: ["liver", "hepatic"], systems: ["digestive"] },
  { key: "gallbladder", label: "gallbladder and bile ducts", match: ["gall bladder", "gallbladder", "bile duct", "cystic duct"] },
  { key: "pancreas", label: "pancreas", match: ["pancrea"] },
  { key: "stomach", label: "stomach", match: ["stomach", "gastric"] },
  { key: "duodenum", label: "duodenum", match: ["duoden"] },
  { key: "small-intestine", label: "small intestine", match: ["jejunum", "ileum", "small intestine"] },
  { key: "colon", label: "colon and rectum", match: ["colon", "caecum", "cecum", "rectum", "appendix"] },
  { key: "oesophagus", label: "oesophagus", match: ["esophagus", "oesophagus"] },
  { key: "spleen", label: "spleen", match: ["spleen", "splenic"] },
  { key: "salivary", label: "salivary glands", match: ["parotid", "submandibular gland", "sublingual gland"] },
  { key: "teeth", label: "teeth and gingiva", match: ["tooth", "teeth", "gingiva", "dental"] },
  { key: "tmj", label: "temporomandibular joint", match: ["temporomandibular", "mandible"] },
  { key: "masseter", label: "masseter and temporalis", match: ["masseter", "temporalis"] },

  { key: "kidney", label: "kidneys", match: ["kidney", "renal"], systems: ["urinary"] },
  { key: "ureter", label: "ureters", match: ["ureter"] },
  { key: "bladder", label: "urinary bladder", match: ["urinary bladder"] },
  { key: "adrenal", label: "adrenal glands", match: ["suprarenal", "adrenal"] },
  { key: "thyroid", label: "thyroid gland", match: ["thyroid gland", "thyroid"] },
  { key: "parathyroid", label: "parathyroid glands", match: ["parathyroid"] },
  { key: "prostate", label: "prostate", match: ["prostate"] },
  { key: "testis", label: "testes", match: ["testis", "epididymis"] },

  { key: "bone", label: "skeleton", match: [""], systems: ["skeletal"] },
  { key: "vertebra", label: "vertebral column", match: ["vertebra", "sacrum", "coccyx"], systems: ["skeletal"] },
  { key: "marrow-axial", label: "axial marrow-bearing bone", match: ["vertebra", "sternum", "rib", "ilium", "femur"], systems: ["skeletal"] },
  { key: "hip", label: "hip joint", match: ["femur", "acetabul", "ilium", "pubis", "ischium"] },
  { key: "knee", label: "knee", match: ["patella", "tibia", "femur"] },
  { key: "shoulder", label: "shoulder", match: ["scapula", "humerus", "clavicle"] },
  { key: "sacroiliac", label: "sacroiliac joints", match: ["sacrum", "ilium"] },
  { key: "cartilage", label: "cartilage and ligament", match: [""], systems: ["connective"] },
  { key: "muscle", label: "skeletal muscle", match: [""], systems: ["muscular"] },
  { key: "skin", label: "body surface", match: [""], systems: ["integumentary"] },

  { key: "eye", label: "eye", match: ["eyeball", "cornea", "lens", "retina", "sclera", "iris", "choroid"] },
  { key: "retina", label: "retina", match: ["retina"] },
  { key: "cochlea", label: "cochlea", match: ["cochlea", "organ of corti", "spiral"] },
  { key: "vestibular", label: "vestibular apparatus", match: ["semicircular", "utricle", "saccule", "vestibule of"] },
  { key: "middle-ear", label: "middle ear", match: ["malleus", "incus", "stapes", "tympanic", "auditory tube"] },
  { key: "sinuses", label: "paranasal sinuses", match: ["sinus", "concha", "nasal"] },

  { key: "lymph-nodes", label: "lymph nodes", match: ["lymph node", "node"], systems: ["lymphatic"] },
  { key: "lymphatic", label: "lymphatic system", match: [""], systems: ["lymphatic"] },
  { key: "thymus", label: "thymus", match: ["thymus"] },
];

let labelExtra: TerritoryDef[] = [];

/** the room registers the extended catalogue once so labels resolve everywhere. */
export function registerTerritoryDefs(defs: TerritoryDef[]): void {
  labelExtra = defs;
}

export function territoryLabel(key: string): string {
  return TERRITORIES.find((t) => t.key === key)?.label ?? labelExtra.find((t) => t.key === key)?.label ?? key;
}
