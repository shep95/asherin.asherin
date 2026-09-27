// asherin.health — functional map catalogue: dermatomes, myotomes, peripheral nerve
// sensory territories, arterial and lymphatic maps, referred-pain patterns, cortical
// homunculus segments, brainstem/cranial-nerve nuclei and organ functional zones.
// reference knowledge only, never derived from a live signal. every entry names the
// clinical convention it follows and is honest about whether the reference mesh actually
// carries a distinct surface for it — many of these are schematic overlays on a nearby
// parent structure, not a separately modelled part.

export type MapKind =
  | "dermatome"
  | "myotome"
  | "peripheral-nerve"
  | "vascular"
  | "lymphatic"
  | "referred-pain"
  | "homunculus"
  | "brainstem-nuclei"
  | "organ-zone";

export interface FunctionalMapEntry {
  key: string;
  label: string;
  kind: MapKind;
  /** territory keys resolved against the atlas (base TERRITORIES + territoryExtra.ts). */
  territoryKeys: string[];
  description: string;
  /** the named clinical/anatomical convention this entry follows. */
  source: string;
  /** honest note on whether the reference geometry carries a distinct surface for this,
   * or whether it is shown schematically against a parent/neighbouring structure. */
  geometryNote: string;
}

export const MAP_KIND_LABELS: Record<MapKind, string> = {
  dermatome: "dermatomes — skin sensation by spinal level",
  myotome: "myotomes — muscle groups by spinal level",
  "peripheral-nerve": "peripheral nerve sensory territories",
  vascular: "vascular territories",
  lymphatic: "lymphatic drainage basins",
  "referred-pain": "referred pain patterns",
  homunculus: "cortical motor/sensory homunculus",
  "brainstem-nuclei": "brainstem and cranial nerve nuclei",
  "organ-zone": "organ functional zones",
};

export const MAP_KIND_ORDER: MapKind[] = [
  "dermatome",
  "myotome",
  "peripheral-nerve",
  "vascular",
  "lymphatic",
  "referred-pain",
  "homunculus",
  "brainstem-nuclei",
  "organ-zone",
];

const DERMATOME_SOURCE = "Keegan & Garrett dermatome chart (standard clinical convention; individual overlap varies)";
const MYOTOME_SOURCE = "standard clinical segmental (myotome) motor testing convention";
const SPINAL_GEOMETRY_NOTE = "the reference geometry does not carve the body surface or muscle into segmental bands; the territory shown is the whole spinal cord level, not the skin/muscle region itself.";

// ---------- dermatomes: all 31 spinal levels, C1 (no reliable cutaneous field) through Co1 ----------
export const DERMATOMES: FunctionalMapEntry[] = [
  { key: "dermatome-C1", label: "C1", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "C1 carries little or no cutaneous sensation of its own in most charts; mainly proprioceptive fibres for neck muscles and joints.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C2", label: "C2", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "back and top of the head, from the occiput forward to the vertex.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C3", label: "C3", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "upper neck and lower jaw line.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C4", label: "C4", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lower neck and the point of the shoulder, following the trapezius ridge.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C5", label: "C5", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lateral shoulder and upper arm, over the deltoid.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C6", label: "C6", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "radial (thumb-side) forearm and thumb.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C7", label: "C7", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "middle finger and central palm/dorsum of the hand.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-C8", label: "C8", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "little finger and ulnar (little-finger-side) forearm.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T1", label: "T1", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "medial forearm, just above the elbow crease.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T2", label: "T2", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "medial upper arm and armpit.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T3", label: "T3", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "upper chest wall below the clavicle.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T4", label: "T4", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "chest at the nipple line.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T5", label: "T5", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "chest wall just below the nipple line.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T6", label: "T6", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lower chest wall at the xiphoid level.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T7", label: "T7", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "upper abdomen, just below the ribcage.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T8", label: "T8", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "upper-mid abdomen.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T9", label: "T9", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "abdomen just above the navel.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T10", label: "T10", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "skin at the level of the navel.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T11", label: "T11", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "abdomen just below the navel.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-T12", label: "T12", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lower abdomen just above the groin crease.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-L1", label: "L1", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "groin and upper inner thigh.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-L2", label: "L2", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "anterior and inner mid-thigh.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-L3", label: "L3", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lower anterior thigh and inner knee.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-L4", label: "L4", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "medial shin and inner ankle, extending to the big toe.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-L5", label: "L5", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lateral shin and dorsum of the foot, into the middle toes.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-S1", label: "S1", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "lateral foot, sole and little toe.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-S2", label: "S2", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "posterior thigh and calf.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-S3", label: "S3", kind: "dermatome", territoryKeys: ["spinal-cord", "pelvic-floor"],
    description: "medial buttock and perineum, part of the saddle region.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-S4", label: "S4", kind: "dermatome", territoryKeys: ["spinal-cord", "pelvic-floor"],
    description: "perineal saddle region; new loss here alongside bladder/bowel change is a surgical emergency sign.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-S5", label: "S5", kind: "dermatome", territoryKeys: ["spinal-cord"],
    description: "skin immediately around the anus.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "dermatome-Co1", label: "Co1 (coccygeal)", kind: "dermatome", territoryKeys: ["spinal-cord", "vertebra"],
    description: "a small area of skin over the tailbone.",
    source: DERMATOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
];

// ---------- myotomes: key movement tested at each level ----------
export const MYOTOMES: FunctionalMapEntry[] = [
  { key: "myotome-C1-C2", label: "C1–C2", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: neck flexion/extension.", source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-C3", label: "C3", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: neck lateral flexion.", source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-C4", label: "C4", kind: "myotome", territoryKeys: ["spinal-cord", "shoulder", "muscle"],
    description: "key movement: shoulder elevation (shrug); also innervates the diaphragm via the phrenic nerve.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-C5", label: "C5", kind: "myotome", territoryKeys: ["spinal-cord", "shoulder", "muscle"],
    description: "key movement: shoulder abduction (raising the arm out to the side).",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-C6", label: "C6", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: wrist extension (cocking the wrist back); also elbow flexion.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-C7", label: "C7", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: elbow extension; also wrist flexion.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-C8", label: "C8", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: finger flexion (making a fist).",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-T1", label: "T1", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: finger abduction (spreading the fingers).",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-L2", label: "L2", kind: "myotome", territoryKeys: ["spinal-cord", "hip", "muscle"],
    description: "key movement: hip flexion (lifting the thigh toward the chest).",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-L3", label: "L3", kind: "myotome", territoryKeys: ["spinal-cord", "knee", "muscle"],
    description: "key movement: knee extension (straightening the knee).",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-L4", label: "L4", kind: "myotome", territoryKeys: ["spinal-cord", "knee", "muscle"],
    description: "key movement: ankle dorsiflexion (pulling the foot upward); also knee extension.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-L5", label: "L5", kind: "myotome", territoryKeys: ["spinal-cord", "hip", "muscle"],
    description: "key movement: big toe extension; also hip abduction.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-S1", label: "S1", kind: "myotome", territoryKeys: ["spinal-cord", "muscle"],
    description: "key movement: ankle plantarflexion (pushing the foot down / standing on toes); also hip extension.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
  { key: "myotome-S2", label: "S2", kind: "myotome", territoryKeys: ["spinal-cord", "knee", "muscle"],
    description: "key movement: knee flexion; also toe flexion.",
    source: MYOTOME_SOURCE, geometryNote: SPINAL_GEOMETRY_NOTE },
];

// ---------- peripheral nerve sensory territories ----------
const NERVE_SOURCE = "standard clinical peripheral nerve sensory distribution chart (as opposed to dermatomal/root distribution)";
export const PERIPHERAL_NERVE_TERRITORIES: FunctionalMapEntry[] = [
  { key: "nerve-median-sensory", label: "median nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-median"],
    description: "palmar surface of the thumb, index, middle and half the ring finger — distinct from the C6/C7 root pattern it overlaps.",
    source: NERVE_SOURCE, geometryNote: "the reference geometry has no separate median nerve mesh; the territory resolves to the forearm/hand region as a schematic stand-in." },
  { key: "nerve-ulnar-sensory", label: "ulnar nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-ulnar"],
    description: "little finger and ulnar half of the ring finger, both palm and dorsum.",
    source: NERVE_SOURCE, geometryNote: "the reference geometry has no separate ulnar nerve mesh; shown schematically against the forearm/hand." },
  { key: "nerve-radial-sensory", label: "radial nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-radial"],
    description: "dorsal (back) surface of the thumb-side hand and forearm, the classic 'wristdrop' sensory patch.",
    source: NERVE_SOURCE, geometryNote: "the reference geometry has no separate radial nerve mesh; shown schematically against the arm/forearm." },
  { key: "nerve-axillary-sensory", label: "axillary nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-axillary"],
    description: "a small patch of skin over the lateral deltoid ('regimental badge' area).",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the shoulder region." },
  { key: "nerve-musculocutaneous-sensory", label: "musculocutaneous nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-musculocutaneous"],
    description: "lateral forearm skin, via its terminal lateral antebrachial cutaneous branch.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the anterior upper arm/forearm." },
  { key: "nerve-femoral-sensory", label: "femoral nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-femoral"],
    description: "anterior thigh, and medial shin/foot via its saphenous branch.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the anterior thigh." },
  { key: "nerve-obturator-sensory", label: "obturator nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-obturator"],
    description: "a small patch of medial thigh skin.",
    source: NERVE_SOURCE, geometryNote: "a deep pelvic nerve unlikely to be resolved separately; shown schematically against the medial thigh/hip." },
  { key: "nerve-sciatic-sensory", label: "sciatic nerve (trunk)", kind: "peripheral-nerve", territoryKeys: ["nerve-sciatic"],
    description: "the sciatic trunk itself carries little direct cutaneous sensation but its tibial and common fibular branches supply almost the entire leg below the knee.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the posterior thigh." },
  { key: "nerve-tibial-sensory", label: "tibial nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-tibial"],
    description: "sole of the foot, via the medial and lateral plantar nerves.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the posterior leg/sole." },
  { key: "nerve-common-fibular-sensory", label: "common fibular (peroneal) nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-common-fibular"],
    description: "anterolateral leg and dorsum of the foot, via its superficial and deep branches; compression at the fibular neck causes foot drop.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the lateral knee/upper leg." },
  { key: "nerve-superficial-fibular-sensory", label: "superficial fibular nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-superficial-fibular"],
    description: "most of the dorsum of the foot, sparing the first web space.",
    source: NERVE_SOURCE, geometryNote: "a small distal branch unlikely to be resolved separately; shown schematically against the lower leg/foot dorsum." },
  { key: "nerve-deep-fibular-sensory", label: "deep fibular nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-deep-fibular"],
    description: "a small patch of skin in the first web space between the big and second toes.",
    source: NERVE_SOURCE, geometryNote: "a small distal branch unlikely to be resolved separately; shown schematically against the anterior lower leg." },
  { key: "nerve-sural-sensory", label: "sural nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-sural"],
    description: "posterolateral lower leg and lateral edge of the foot.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the posterolateral lower leg." },
  { key: "nerve-saphenous-sensory", label: "saphenous nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-saphenous"],
    description: "medial lower leg and inner ankle, the only sensory branch of the femoral nerve reaching below the knee.",
    source: NERVE_SOURCE, geometryNote: "not resolved as its own mesh; shown schematically against the medial lower leg." },
  { key: "nerve-lateral-femoral-cutaneous-sensory", label: "lateral femoral cutaneous nerve", kind: "peripheral-nerve", territoryKeys: ["nerve-lateral-femoral-cutaneous"],
    description: "anterolateral thigh; entrapment near the inguinal ligament causes meralgia paraesthetica.",
    source: NERVE_SOURCE, geometryNote: "a small purely sensory nerve unlikely to be resolved separately; shown schematically against the anterolateral thigh." },
];

// ---------- vascular territories: cerebral + coronary ----------
const CEREBRAL_SOURCE = "circle-of-Willis / stroke topography convention (ACA-MCA-PCA territory mapping)";
const CORONARY_SOURCE = "AHA/ACC coronary-artery-to-myocardial-wall convention used in angiography and echocardiography";
export const VASCULAR_TERRITORIES: FunctionalMapEntry[] = [
  { key: "vascular-ACA", label: "anterior cerebral artery (ACA)", kind: "vascular", territoryKeys: ["frontal-lobe", "parietal-lobe", "cerebral-arteries"],
    description: "supplies the medial frontal and parietal lobes; occlusion typically weakens the opposite leg more than the arm and can affect personality/judgement.",
    source: CEREBRAL_SOURCE, geometryNote: "the artery's own perfusion boundary is not a modelled surface; shown against the lobes it is understood to supply." },
  { key: "vascular-MCA", label: "middle cerebral artery (MCA)", kind: "vascular", territoryKeys: ["frontal-lobe", "temporal-lobe", "parietal-lobe", "cerebral-arteries"],
    description: "supplies most of the lateral cortex including motor, sensory and language areas; the most common site of ischaemic stroke.",
    source: CEREBRAL_SOURCE, geometryNote: "the artery's own perfusion boundary is not a modelled surface; shown against the lobes it is understood to supply." },
  { key: "vascular-PCA", label: "posterior cerebral artery (PCA)", kind: "vascular", territoryKeys: ["occipital-lobe", "temporal-lobe", "cerebral-arteries"],
    description: "supplies the occipital lobe and medial temporal lobe; occlusion classically causes a visual field loss.",
    source: CEREBRAL_SOURCE, geometryNote: "the artery's own perfusion boundary is not a modelled surface; shown against the lobes it is understood to supply." },
  { key: "vascular-vertebrobasilar", label: "vertebrobasilar system", kind: "vascular", territoryKeys: ["brainstem", "cerebellum", "cerebral-arteries"],
    description: "supplies the brainstem and cerebellum; occlusion can affect consciousness, cranial nerves and coordination together.",
    source: CEREBRAL_SOURCE, geometryNote: "the artery's own perfusion boundary is not a modelled surface; shown against the brainstem/cerebellum it supplies." },
  { key: "vascular-watershed", label: "watershed (border zone) territory", kind: "vascular", territoryKeys: ["cerebral-cortex", "cerebral-arteries"],
    description: "the boundary areas between major artery territories, most vulnerable in low blood pressure or cardiac arrest rather than a single vessel blockage.",
    source: CEREBRAL_SOURCE, geometryNote: "a border-zone concept, not a distinct anatomical surface; shown against the cerebral cortex generally." },
  { key: "vascular-LAD", label: "left anterior descending (LAD) artery", kind: "vascular", territoryKeys: ["heart", "coronary"],
    description: "supplies the anterior wall and anterior two-thirds of the interventricular septum; the largest coronary territory, sometimes called the 'widow-maker' vessel when occluded proximally.",
    source: CORONARY_SOURCE, geometryNote: "coronary wall territories are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart/coronary territory key." },
  { key: "vascular-LCx", label: "left circumflex (LCx) artery", kind: "vascular", territoryKeys: ["heart", "coronary"],
    description: "supplies the lateral and posterior left ventricular wall.",
    source: CORONARY_SOURCE, geometryNote: "coronary wall territories are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart/coronary territory key." },
  { key: "vascular-RCA", label: "right coronary artery (RCA)", kind: "vascular", territoryKeys: ["heart", "coronary"],
    description: "supplies the inferior wall, right ventricle, and in most people the sinoatrial and atrioventricular nodes.",
    source: CORONARY_SOURCE, geometryNote: "coronary wall territories are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart/coronary territory key." },
];

// ---------- lymphatic drainage basins ----------
const LYMPH_SOURCE = "standard clinical lymphatic drainage basin convention";
export const LYMPHATIC_DRAINAGE: FunctionalMapEntry[] = [
  { key: "lymph-basin-head-neck", label: "head and neck", kind: "lymphatic", territoryKeys: ["lymph-cervical"],
    description: "scalp, face and neck drain to the cervical node chain.",
    source: LYMPH_SOURCE, geometryNote: "individual node groups are rarely separated in the reference mesh; shown schematically against the neck region." },
  { key: "lymph-basin-breast-arm", label: "breast and arm", kind: "lymphatic", territoryKeys: ["lymph-axillary", "mammary-gland"],
    description: "drains mainly to the axillary node chain, with a smaller route to internal mammary nodes.",
    source: LYMPH_SOURCE, geometryNote: "the reference body is an adult male with minimal breast geometry; axillary drainage is shown schematically against the axilla region." },
  { key: "lymph-basin-leg-perineum", label: "leg and lower pelvis", kind: "lymphatic", territoryKeys: ["lymph-inguinal"],
    description: "the leg, external genitalia and lower pelvis drain to the inguinal node chain.",
    source: LYMPH_SOURCE, geometryNote: "individual node groups are rarely separated in the reference mesh; shown schematically against the groin region." },
  { key: "lymph-basin-popliteal", label: "posterior lower leg and foot", kind: "lymphatic", territoryKeys: ["lymph-popliteal"],
    description: "a first-stop node group behind the knee before drainage continues to the inguinal chain.",
    source: LYMPH_SOURCE, geometryNote: "a small node group unlikely to be resolved separately; shown schematically against the popliteal fossa." },
  { key: "lymph-basin-forearm", label: "medial forearm and hand", kind: "lymphatic", territoryKeys: ["lymph-epitrochlear"],
    description: "a first-stop node group at the medial elbow before drainage continues to the axillary chain.",
    source: LYMPH_SOURCE, geometryNote: "a small node group unlikely to be resolved separately; shown schematically against the medial elbow region." },
  { key: "lymph-basin-abdominal-viscera", label: "abdominal organs", kind: "lymphatic", territoryKeys: ["lymph-mesenteric", "lymph-celiac"],
    description: "drains to mesenteric and celiac node chains before entering the cisterna chyli.",
    source: LYMPH_SOURCE, geometryNote: "deep abdominal node groups are unlikely to be resolved separately; shown schematically against the mesentery/celiac region." },
  { key: "lymph-basin-thorax", label: "chest organs", kind: "lymphatic", territoryKeys: ["lymph-mediastinal"],
    description: "lungs, heart and oesophagus drain to the mediastinal node chain, a common site of early cancer spread.",
    source: LYMPH_SOURCE, geometryNote: "mediastinal nodes are unlikely to be resolved separately; shown schematically against the mediastinum." },
  { key: "lymph-basin-thoracic-duct", label: "thoracic duct", kind: "lymphatic", territoryKeys: ["lymphatic"],
    description: "the main lymphatic trunk, returning lymph from most of the body into the venous system at the left neck.",
    source: LYMPH_SOURCE, geometryNote: "a specific duct is unlikely to be modelled separately; shown against the lymphatic system generally." },
];

// ---------- referred pain patterns per viscus ----------
const REFERRED_SOURCE = "classic visceral referred-pain convention, largely explained by shared embryological dermatome origin between the organ and the referral site";
export const REFERRED_PAIN_PATTERNS: FunctionalMapEntry[] = [
  { key: "referred-heart", label: "cardiac ischaemia", kind: "referred-pain", territoryKeys: ["heart", "coronary"],
    description: "chest pain referred to the left arm, jaw or upper back; reflects shared spinal cord entry (T1–T4) between the heart and those dermatomes.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the heart itself as the true source." },
  { key: "referred-gallbladder", label: "gallbladder/biliary colic", kind: "referred-pain", territoryKeys: ["gallbladder"],
    description: "right upper quadrant pain that can refer to the right shoulder or scapula via the phrenic nerve's shared segmental origin (C3–C5) with diaphragmatic irritation.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the gallbladder as the true source." },
  { key: "referred-diaphragm", label: "diaphragmatic irritation", kind: "referred-pain", territoryKeys: ["diaphragm"],
    description: "irritation of the diaphragm (blood, infection, free air beneath it) classically refers to the tip of the shoulder.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the diaphragm as the true source." },
  { key: "referred-renal", label: "kidney/ureteric colic", kind: "referred-pain", territoryKeys: ["kidney", "ureter"],
    description: "flank pain from a kidney stone classically radiates forward and down toward the groin as the stone moves along the ureter.",
    source: REFERRED_SOURCE, geometryNote: "referral tracks the ureter's course rather than a fixed surface patch; shown against the kidney/ureter as the true source." },
  { key: "referred-appendix", label: "acute appendicitis", kind: "referred-pain", territoryKeys: ["colon"],
    description: "pain often starts as vague periumbilical discomfort (visceral, T10 origin) before localising to the right lower quadrant as the inflamed peritoneum itself becomes irritated.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the colon/appendix region as the true source." },
  { key: "referred-pancreas", label: "acute pancreatitis", kind: "referred-pain", territoryKeys: ["pancreas"],
    description: "epigastric pain that classically bores through to the back, reflecting the pancreas's retroperitoneal position against the spine.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the pancreas as the true source." },
  { key: "referred-spleen", label: "splenic injury/irritation (Kehr's sign)", kind: "referred-pain", territoryKeys: ["spleen"],
    description: "blood or irritation around the spleen can refer to the left shoulder tip, via the same diaphragmatic phrenic pathway as gallbladder referral.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the spleen as the true source." },
  { key: "referred-peptic-ulcer", label: "peptic ulcer/gastric pain", kind: "referred-pain", territoryKeys: ["stomach", "duodenum"],
    description: "epigastric burning pain that can radiate through to the mid-back, especially with posterior duodenal ulcers eroding toward the pancreas.",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against the stomach/duodenum as the true source." },
  { key: "referred-testicular", label: "testicular torsion/renal colic overlap", kind: "referred-pain", territoryKeys: ["testis", "kidney"],
    description: "testicular pain can be felt in the flank or groin and vice versa, because the testis's nerve supply travels with vessels that originate near the kidney (T10 shared origin).",
    source: REFERRED_SOURCE, geometryNote: "referral is a shared-nerve-root phenomenon, not a surface on the body — shown against both the testis and kidney as plausible true sources." },
];

// ---------- cortical motor/sensory homunculus segments ----------
const HOMUNCULUS_SOURCE = "Penfield cortical homunculus (a schematic map with body-part representation sized by cortical territory, not physical body size — hands and lips are wildly over-represented relative to the trunk)";
export const HOMUNCULUS_SEGMENTS: FunctionalMapEntry[] = [
  { key: "homunculus-motor-leg", label: "motor cortex — leg and foot", kind: "homunculus", territoryKeys: ["cortex-precentral-gyrus"],
    description: "represents voluntary movement of the leg and foot; sits at the top of the precentral gyrus, folding onto the medial surface.",
    source: HOMUNCULUS_SOURCE, geometryNote: "the homunculus is a schematic strip, not a physical structure; shown against the precentral gyrus, itself likely absent as a distinct mesh." },
  { key: "homunculus-motor-trunk-arm", label: "motor cortex — trunk and arm", kind: "homunculus", territoryKeys: ["cortex-precentral-gyrus"],
    description: "represents voluntary movement of the trunk, shoulder, arm and hand along the mid-portion of the precentral gyrus.",
    source: HOMUNCULUS_SOURCE, geometryNote: "the homunculus is a schematic strip, not a physical structure; shown against the precentral gyrus, itself likely absent as a distinct mesh." },
  { key: "homunculus-motor-face", label: "motor cortex — face, lips and tongue", kind: "homunculus", territoryKeys: ["cortex-precentral-gyrus"],
    description: "a disproportionately large area representing the fine voluntary control of face, lips, jaw and tongue, at the lower end of the precentral gyrus.",
    source: HOMUNCULUS_SOURCE, geometryNote: "the homunculus is a schematic strip, not a physical structure; shown against the precentral gyrus, itself likely absent as a distinct mesh." },
  { key: "homunculus-sensory-leg", label: "sensory cortex — leg and foot", kind: "homunculus", territoryKeys: ["cortex-postcentral-gyrus"],
    description: "represents touch, pressure and proprioceptive sensation from the leg and foot, mirroring the motor strip just anterior to it.",
    source: HOMUNCULUS_SOURCE, geometryNote: "the homunculus is a schematic strip, not a physical structure; shown against the postcentral gyrus, itself likely absent as a distinct mesh." },
  { key: "homunculus-sensory-hand", label: "sensory cortex — hand and fingers", kind: "homunculus", territoryKeys: ["cortex-postcentral-gyrus"],
    description: "a disproportionately large area representing the fine touch discrimination of the hand and fingertips.",
    source: HOMUNCULUS_SOURCE, geometryNote: "the homunculus is a schematic strip, not a physical structure; shown against the postcentral gyrus, itself likely absent as a distinct mesh." },
  { key: "homunculus-sensory-face", label: "sensory cortex — face and lips", kind: "homunculus", territoryKeys: ["cortex-postcentral-gyrus"],
    description: "a disproportionately large area representing sensation from the face and especially the lips.",
    source: HOMUNCULUS_SOURCE, geometryNote: "the homunculus is a schematic strip, not a physical structure; shown against the postcentral gyrus, itself likely absent as a distinct mesh." },
];

// ---------- brainstem and cranial nerve nuclei ----------
const NUCLEI_SOURCE = "standard cranial nerve nuclei columns as described in brainstem cross-sectional neuroanatomy atlases";
export const BRAINSTEM_NUCLEI: FunctionalMapEntry[] = [
  { key: "nucleus-oculomotor", label: "oculomotor nucleus (CN III)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "cranial-nerve-oculomotor"],
    description: "in the midbrain; controls most eye movement muscles, eyelid elevation and pupil constriction.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-trochlear", label: "trochlear nucleus (CN IV)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "cranial-nerve-trochlear"],
    description: "in the midbrain; controls the superior oblique muscle that lets the eye look down and in.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-trigeminal", label: "trigeminal nuclear complex (CN V)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "trigeminal"],
    description: "spans midbrain to spinal cord; processes facial sensation and chewing muscle control across its several subnuclei.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-abducens", label: "abducens nucleus (CN VI)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "cranial-nerve-abducens"],
    description: "in the pons; controls the lateral rectus muscle that turns the eye outward.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-facial", label: "facial motor nucleus (CN VII)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "facial-nerve"],
    description: "in the pons; controls the muscles of facial expression.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-vestibulocochlear", label: "vestibular and cochlear nuclei (CN VIII)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "vestibulocochlear"],
    description: "at the pontomedullary junction; the first relay for balance and hearing signals.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-ambiguus", label: "nucleus ambiguus (CN IX, X, XI)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "vagus"],
    description: "in the medulla; supplies the muscles of the pharynx and larynx shared across three cranial nerves.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-dorsal-vagal", label: "dorsal motor nucleus of the vagus (CN X)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "vagus"],
    description: "in the medulla; the main source of parasympathetic output to the heart, lungs and gut via the vagus nerve.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
  { key: "nucleus-hypoglossal", label: "hypoglossal nucleus (CN XII)", kind: "brainstem-nuclei", territoryKeys: ["brainstem", "cranial-nerve-hypoglossal"],
    description: "in the medulla; controls the muscles of the tongue.",
    source: NUCLEI_SOURCE, geometryNote: "individual brainstem nuclei are microscopic and not modelled as separate meshes; shown against the brainstem region as a whole." },
];

// ---------- organ functional zones ----------
export const ORGAN_ZONES: FunctionalMapEntry[] = [
  { key: "liver-seg1-4", label: "liver segments I–IV (Couinaud)", kind: "organ-zone", territoryKeys: ["liver"],
    description: "caudate lobe (I) and left lobe segments (II–IV), surgically resectable independently of the right lobe based on their own portal and venous supply.",
    source: "Couinaud segmental liver classification, used for surgical planning",
    geometryNote: "individual Couinaud segments are not separated as distinct surfaces in the reference liver mesh; shown against the whole liver." },
  { key: "liver-seg5-8", label: "liver segments V–VIII (Couinaud)", kind: "organ-zone", territoryKeys: ["liver"],
    description: "right lobe segments, each with independent portal, hepatic arterial, biliary and venous supply.",
    source: "Couinaud segmental liver classification, used for surgical planning",
    geometryNote: "individual Couinaud segments are not separated as distinct surfaces in the reference liver mesh; shown against the whole liver." },
  { key: "lung-right-upper-lobe", label: "right upper lobe", kind: "organ-zone", territoryKeys: ["lung"],
    description: "apical lung zone; tuberculosis and some emphysema patterns classically favour upper lobes.",
    source: "standard bronchopulmonary lobar/segmental anatomy", geometryNote: "individual lobes are unlikely to be separated as distinct surfaces in the reference lung mesh; shown against the whole lung." },
  { key: "lung-right-middle-lobe", label: "right middle lobe", kind: "organ-zone", territoryKeys: ["lung"],
    description: "a lobe unique to the right lung, prone to a distinct 'right middle lobe syndrome' of recurrent collapse/infection.",
    source: "standard bronchopulmonary lobar/segmental anatomy", geometryNote: "individual lobes are unlikely to be separated as distinct surfaces in the reference lung mesh; shown against the whole lung." },
  { key: "lung-lower-lobes", label: "lower lobes (both lungs)", kind: "organ-zone", territoryKeys: ["lung"],
    description: "basal lung zones; aspiration pneumonia classically favours these, particularly on the right, when lying down.",
    source: "standard bronchopulmonary lobar/segmental anatomy", geometryNote: "individual lobes are unlikely to be separated as distinct surfaces in the reference lung mesh; shown against the whole lung." },
  { key: "kidney-cortex", label: "renal cortex", kind: "organ-zone", territoryKeys: ["kidney", "glomerulus"],
    description: "the outer kidney zone holding the glomeruli, where blood filtration begins.",
    source: "standard renal cortex/medulla zonal anatomy", geometryNote: "the cortex/medulla boundary is unlikely to be a distinct surface in the reference kidney mesh; shown against the whole kidney." },
  { key: "kidney-medulla", label: "renal medulla", kind: "organ-zone", territoryKeys: ["kidney", "collecting-duct"],
    description: "the inner kidney zone holding the loops of Henle and collecting ducts, organised into pyramids that concentrate urine.",
    source: "standard renal cortex/medulla zonal anatomy", geometryNote: "the cortex/medulla boundary is unlikely to be a distinct surface in the reference kidney mesh; shown against the whole kidney." },
  { key: "heart-anterior-wall", label: "anterior cardiac wall", kind: "organ-zone", territoryKeys: ["heart", "coronary"],
    description: "supplied mainly by the left anterior descending coronary artery.",
    source: "coronary-territory wall convention used in echocardiography/angiography",
    geometryNote: "wall segments are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart." },
  { key: "heart-inferior-wall", label: "inferior cardiac wall", kind: "organ-zone", territoryKeys: ["heart", "coronary"],
    description: "supplied mainly by the right coronary artery in most people.",
    source: "coronary-territory wall convention used in echocardiography/angiography",
    geometryNote: "wall segments are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart." },
  { key: "heart-lateral-wall", label: "lateral cardiac wall", kind: "organ-zone", territoryKeys: ["heart", "coronary"],
    description: "supplied mainly by the left circumflex coronary artery.",
    source: "coronary-territory wall convention used in echocardiography/angiography",
    geometryNote: "wall segments are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart." },
  { key: "heart-septal-wall", label: "interventricular septum", kind: "organ-zone", territoryKeys: ["heart", "coronary"],
    description: "the wall dividing the two ventricles; supplied mainly by septal perforator branches of the LAD, with the posterior third often from the RCA/LCx system.",
    source: "coronary-territory wall convention used in echocardiography/angiography",
    geometryNote: "wall segments are not separated as distinct surfaces in the reference heart mesh; shown against the whole heart." },
];

export const FUNCTIONAL_MAPS: FunctionalMapEntry[] = [
  ...DERMATOMES,
  ...MYOTOMES,
  ...PERIPHERAL_NERVE_TERRITORIES,
  ...VASCULAR_TERRITORIES,
  ...LYMPHATIC_DRAINAGE,
  ...REFERRED_PAIN_PATTERNS,
  ...HOMUNCULUS_SEGMENTS,
  ...BRAINSTEM_NUCLEI,
  ...ORGAN_ZONES,
];

/** all entries grouped by kind, in a stable display order. */
export function mapsByKind(kind: MapKind): FunctionalMapEntry[] {
  return FUNCTIONAL_MAPS.filter((m) => m.kind === kind);
}

/** every map entry that references any of the given territory keys. */
export function mapsForTerritory(territoryKey: string): FunctionalMapEntry[] {
  return FUNCTIONAL_MAPS.filter((m) => m.territoryKeys.includes(territoryKey));
}

/** referred-pain entries for a given viscus territory key (e.g. "heart", "gallbladder"). */
export function referredPatternsFor(territoryKey: string): FunctionalMapEntry[] {
  return REFERRED_PAIN_PATTERNS.filter((m) => m.territoryKeys.includes(territoryKey));
}

export function findMap(key: string): FunctionalMapEntry | undefined {
  return FUNCTIONAL_MAPS.find((m) => m.key === key);
}

export function searchMaps(list: FunctionalMapEntry[], query: string): FunctionalMapEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (e) => e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
  );
}
