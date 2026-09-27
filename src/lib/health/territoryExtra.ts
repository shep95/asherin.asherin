// asherin.health — extended territory catalogue for the deep anatomy layer.
// these definitions cover structures referenced by deepAnatomy.ts, maps.ts, embryology.ts,
// microbiome.ts and aging.ts that fall outside the base TERRITORIES in ./territory.ts.
// where the BodyParts3D reference geometry is unlikely to carry a distinct mesh for a
// structure (a fold of fascia, a duct lumen, a microscopic structure, a female organ in an
// adult-male reference body), the territory still resolves — against the nearest plausible
// parent part where one exists, or nothing at all — and carries a `note` saying so plainly.
// resolveTerritories() already reports `missing: true` whenever nothing matches; the note
// exists to explain *why*, not to paper over an absent mesh.
import type { TerritoryDef } from "./territory";

export const EXTRA_TERRITORIES: TerritoryDef[] = [
  // ---------- adipose depots: none are separated as their own mesh in the reference ----------
  { key: "adipose-subcutaneous", label: "subcutaneous fat", match: ["skin"], systems: ["integumentary"],
    note: "the reference body does not separate fat from skin as its own mesh; shown against the body surface." },
  { key: "adipose-visceral", label: "visceral fat", match: ["mesentery", "omentum"],
    note: "visceral fat is not modelled as its own mesh; shown against the mesentery/omentum where present, otherwise not represented." },
  { key: "adipose-epicardial", label: "epicardial fat", match: ["pericardium", "heart"],
    note: "epicardial fat is not modelled as its own mesh in the reference geometry." },
  { key: "adipose-perirenal", label: "perirenal fat", match: ["kidney"], systems: ["urinary"],
    note: "perirenal fat is not modelled as its own mesh; shown against the kidney it surrounds." },
  { key: "adipose-brown", label: "brown fat", match: [],
    note: "brown fat is a microscopic and diffusely distributed tissue with no distinct mesh in the reference geometry." },

  // ---------- integument microanatomy ----------
  { key: "hair-follicle", label: "hair follicle", match: [], note: "individual follicles are far below the resolution of the reference geometry." },
  { key: "sebaceous-gland", label: "sebaceous gland", match: [], note: "microscopic gland, not represented as a mesh." },
  { key: "eccrine-gland", label: "eccrine sweat gland", match: [], note: "microscopic gland, not represented as a mesh." },
  { key: "apocrine-gland", label: "apocrine sweat gland", match: [], note: "microscopic gland, not represented as a mesh." },
  { key: "nail-unit", label: "nail unit", match: ["nail"], note: "if no nail mesh exists in this reference body, the fingertip/toe bone is shown as the nearest landmark." },

  // ---------- fascia ----------
  { key: "fascia-superficial", label: "superficial fascia", match: ["skin"], note: "fascial layers are not modelled as separate meshes; shown against the body surface." },
  { key: "fascia-deep", label: "deep fascia", match: ["muscle"], systems: ["muscular"],
    note: "deep fascia is not modelled as its own mesh; shown against the muscle it envelops." },
  { key: "fascia-thoracolumbar", label: "thoracolumbar fascia", match: ["latissimus", "erector spinae", "lumbar"],
    note: "this fascia is not modelled as its own mesh; shown against the low-back muscle it overlies where a match exists." },
  { key: "fascia-plantar", label: "plantar fascia", match: ["foot", "calcaneus"],
    note: "the plantar fascia is not modelled as its own mesh; shown against the sole of the foot." },
  { key: "iliotibial-band", label: "iliotibial band", match: ["tensor fasciae latae", "femur"],
    note: "the iliotibial band is not modelled as its own mesh; shown against the lateral thigh." },

  // ---------- meninges & csf ----------
  { key: "meninges-dura", label: "dura mater", match: ["dura"], note: "if no separate dural mesh exists, shown against the brain/spinal cord surface it covers." },
  { key: "meninges-arachnoid", label: "arachnoid mater", match: ["arachnoid"], note: "if no separate arachnoid mesh exists, shown against the brain surface it covers." },
  { key: "meninges-pia", label: "pia mater", match: ["pia"], note: "if no separate pial mesh exists, shown against the brain surface it covers." },
  { key: "subarachnoid-space", label: "subarachnoid space", match: ["subarachnoid"],
    note: "a fluid space rather than a solid structure; unlikely to have its own mesh in this reference geometry." },
  { key: "ventricles", label: "cerebral ventricles", match: ["ventricle of brain", "cerebral ventricle", "lateral ventricle", "third ventricle", "fourth ventricle"],
    note: "if no ventricle mesh exists, shown against the enclosing brain tissue." },
  { key: "choroid-plexus", label: "choroid plexus", match: ["choroid plexus"], note: "a small internal structure unlikely to be separated as its own mesh." },
  { key: "glymphatic", label: "glymphatic pathway", match: [], note: "a physiological clearance route along perivascular spaces, not a discrete anatomical structure — no mesh exists for it in any reference body." },
  { key: "mediastinum", label: "mediastinum", match: ["heart", "trachea", "thymus"],
    note: "a named space rather than a single structure; shown against the chest organs it contains." },
  { key: "pericardial-space", label: "pericardial cavity", match: ["pericardium", "heart"],
    note: "a potential space rather than a solid structure; shown against the pericardium/heart it surrounds." },
  { key: "peritoneum", label: "peritoneal cavity", match: ["peritoneum"], note: "if no peritoneal mesh exists, this is a potential space shown against the abdominal organs it contains." },
  { key: "retroperitoneum", label: "retroperitoneal space", match: ["kidney", "aorta", "pancreas"], systems: ["urinary"],
    note: "a spatial compartment rather than a structure; shown against the retroperitoneal organs it contains." },

  // ---------- microcirculation / renal microanatomy ----------
  { key: "glomerulus", label: "renal glomerulus", match: ["kidney"], systems: ["urinary"],
    note: "the glomerulus is microscopic; shown against the kidney that contains millions of them." },
  { key: "nephron", label: "nephron", match: ["kidney"], systems: ["urinary"],
    note: "the nephron is microscopic; shown against the kidney that contains roughly a million per side." },
  { key: "juxtaglomerular-apparatus", label: "juxtaglomerular apparatus", match: ["kidney"], systems: ["urinary"],
    note: "a microscopic structure within the nephron; shown against the kidney." },
  { key: "collecting-duct", label: "renal collecting duct", match: ["kidney"], systems: ["urinary"],
    note: "collecting ducts are microscopic; shown against the kidney medulla they run through." },

  // ---------- joints / connective detail ----------
  { key: "joint-synovium", label: "synovium", match: ["synovial", "joint capsule"],
    note: "if no synovial mesh exists, shown against the enclosing joint capsule." },
  { key: "articular-cartilage", label: "articular cartilage", match: ["cartilage"], systems: ["connective"] },
  { key: "meniscus", label: "meniscus", match: ["meniscus"], note: "if absent from this reference body, shown against the knee joint it sits within." },
  { key: "labrum", label: "labrum", match: ["labrum"], note: "if absent from this reference body, shown against the hip/shoulder socket it deepens." },
  { key: "bursa", label: "bursa", match: ["bursa"], note: "bursae are thin fluid sacs rarely modelled as separate meshes; shown against the nearest joint where a match exists." },
  { key: "tendon-sheath", label: "tendon sheath", match: ["tendon"],
    note: "tendon sheaths are not modelled separately from the tendon they surround." },
  { key: "intervertebral-disc", label: "intervertebral disc", match: ["intervertebral disc", "disc"],
    note: "if no disc mesh exists, shown against the vertebral column it sits within." },

  // ---------- lymphatic / immune ----------
  { key: "mammary-gland", label: "mammary gland", match: ["mammary", "breast"],
    note: "the reference body is an adult male; breast tissue is minimal or absent in its geometry." },
  { key: "nipple-areolar-complex", label: "nipple-areolar complex", match: ["nipple", "areola"],
    note: "the reference body is an adult male; this structure may be present only in reduced form." },

  // ---------- autonomic ----------
  { key: "celiac-ganglion", label: "celiac and mesenteric ganglia", match: ["celiac", "coeliac", "mesenteric ganglion"],
    note: "small ganglia around the celiac artery origin; likely to be absent as a separate mesh from the surrounding vessels." },

  // ---------- cranial nerves not already in TERRITORIES ----------
  { key: "olfactory-nerve", label: "olfactory nerve", match: ["olfactory"], note: "a very short, delicate nerve rarely modelled separately from the olfactory bulb region." },
  { key: "cranial-nerve-oculomotor", label: "oculomotor nerve", match: ["oculomotor"] },
  { key: "cranial-nerve-trochlear", label: "trochlear nerve", match: ["trochlear"], note: "the thinnest cranial nerve; unlikely to be resolved as its own mesh." },
  { key: "cranial-nerve-abducens", label: "abducens nerve", match: ["abducens"] },
  { key: "cranial-nerve-glossopharyngeal", label: "glossopharyngeal nerve", match: ["glossopharyngeal"] },
  { key: "cranial-nerve-accessory", label: "accessory nerve", match: ["accessory nerve"] },
  { key: "cranial-nerve-hypoglossal", label: "hypoglossal nerve", match: ["hypoglossal"] },

  // ---------- ear ----------
  { key: "eustachian-tube", label: "eustachian (auditory) tube", match: ["auditory tube", "eustachian"] },

  // ---------- female reproductive anatomy: not present in an adult-male reference body ----------
  { key: "ovary", label: "ovary", match: ["ovary", "ovarian"],
    note: "the reference body is an adult male; the ovary is not present in its geometry." },
  { key: "fallopian-tube", label: "fallopian tube", match: ["fallopian", "uterine tube", "oviduct"],
    note: "the reference body is an adult male; the fallopian tube is not present in its geometry." },
  { key: "uterus", label: "uterus", match: ["uterus", "uterine"],
    note: "the reference body is an adult male; the uterus is not present in its geometry." },
  { key: "cervix", label: "cervix", match: ["cervix uteri", "cervix"],
    note: "the reference body is an adult male; the cervix is not present in its geometry." },
  { key: "vagina", label: "vagina", match: ["vagina", "vaginal"],
    note: "the reference body is an adult male; the vagina is not present in its geometry." },
  { key: "vulva", label: "vulva", match: ["vulva", "labium", "clitoris"],
    note: "the reference body is an adult male; the vulva is not present in its geometry." },
  { key: "broad-ligament", label: "broad ligament", match: ["broad ligament"],
    note: "the reference body is an adult male; this ligament of the uterus is not present in its geometry." },
  { key: "round-ligament", label: "round ligament of the uterus", match: ["round ligament"],
    note: "the reference body is an adult male; this ligament is not present in its geometry." },
  { key: "pelvic-floor", label: "pelvic floor", match: ["levator ani", "pelvic diaphragm", "perineum"] },

  // ---------- male reproductive anatomy: present in the adult-male reference, but fine-grained ----------
  { key: "penis", label: "penis", match: ["penis", "corpus cavernosum", "corpus spongiosum"] },
  { key: "scrotum", label: "scrotum", match: ["scrotum"] },
  { key: "vas-deferens", label: "vas deferens", match: ["vas deferens", "ductus deferens"] },
  { key: "seminal-vesicle", label: "seminal vesicle", match: ["seminal vesicle"] },


  // ---------- peripheral nerve sensory territories (functional maps) ----------
  { key: "nerve-median", label: "median nerve", match: ["median nerve"],
    note: "if the reference geometry has no separate median nerve mesh, shown against the forearm/hand it supplies." },
  { key: "nerve-ulnar", label: "ulnar nerve", match: ["ulnar nerve"],
    note: "if the reference geometry has no separate ulnar nerve mesh, shown against the forearm/hand it supplies." },
  { key: "nerve-radial", label: "radial nerve", match: ["radial nerve"],
    note: "if the reference geometry has no separate radial nerve mesh, shown against the arm/forearm it supplies." },
  { key: "nerve-axillary", label: "axillary nerve", match: ["axillary nerve"],
    note: "a short nerve unlikely to be resolved separately; shown against the shoulder region it supplies." },
  { key: "nerve-musculocutaneous", label: "musculocutaneous nerve", match: ["musculocutaneous"],
    note: "unlikely to be resolved separately; shown against the anterior upper arm it supplies." },
  { key: "nerve-femoral", label: "femoral nerve", match: ["femoral nerve"],
    note: "if no separate mesh exists, shown against the anterior thigh it supplies." },
  { key: "nerve-obturator", label: "obturator nerve", match: ["obturator nerve"],
    note: "a deep pelvic nerve unlikely to be resolved separately; shown against the medial thigh/hip it supplies." },
  { key: "nerve-sciatic", label: "sciatic nerve", match: ["sciatic nerve"],
    note: "if no separate mesh exists, shown against the posterior thigh/leg it supplies." },
  { key: "nerve-tibial", label: "tibial nerve", match: ["tibial nerve"],
    note: "if no separate mesh exists, shown against the sole/posterior leg it supplies." },
  { key: "nerve-common-fibular", label: "common fibular (peroneal) nerve", match: ["common fibular", "common peroneal"],
    note: "if no separate mesh exists, shown against the lateral knee/upper leg it wraps around." },
  { key: "nerve-superficial-fibular", label: "superficial fibular nerve", match: ["superficial fibular", "superficial peroneal"],
    note: "a small distal branch unlikely to be resolved separately; shown against the lateral lower leg/dorsum of foot." },
  { key: "nerve-deep-fibular", label: "deep fibular nerve", match: ["deep fibular", "deep peroneal"],
    note: "a small distal branch unlikely to be resolved separately; shown against the anterior lower leg/first web space." },
  { key: "nerve-sural", label: "sural nerve", match: ["sural nerve"],
    note: "a small cutaneous nerve unlikely to be resolved separately; shown against the posterolateral lower leg." },
  { key: "nerve-saphenous", label: "saphenous nerve", match: ["saphenous nerve"],
    note: "a small cutaneous nerve unlikely to be resolved separately; shown against the medial lower leg." },
  { key: "nerve-lateral-femoral-cutaneous", label: "lateral femoral cutaneous nerve", match: ["lateral femoral cutaneous"],
    note: "a small purely sensory nerve unlikely to be resolved separately; shown against the anterolateral thigh." },
  { key: "nerve-intercostobrachial", label: "intercostobrachial nerve", match: ["intercostobrachial"],
    note: "a small nerve unlikely to be resolved separately; shown against the medial upper arm/axilla." },
  { key: "nerve-greater-occipital", label: "greater occipital nerve", match: ["greater occipital"],
    note: "unlikely to be resolved separately; shown against the posterior scalp it supplies." },

  // ---------- cortical homunculus (motor/sensory strip) ----------
  { key: "cortex-precentral-gyrus", label: "precentral gyrus (primary motor cortex)", match: ["precentral gyrus", "precentral"],
    note: "if no gyrus-level mesh exists, shown against the frontal lobe that contains it." },
  { key: "cortex-postcentral-gyrus", label: "postcentral gyrus (primary sensory cortex)", match: ["postcentral gyrus", "postcentral"],
    note: "if no gyrus-level mesh exists, shown against the parietal lobe that contains it." },

  // ---------- lymphatic drainage basins (functional maps) ----------
  { key: "lymph-cervical", label: "cervical lymph nodes", match: ["cervical lymph", "neck lymph", "lymph node"], systems: ["lymphatic"],
    note: "individual named node groups are rarely separated in the reference mesh; shown against lymph nodes generally where a regional match is not available." },
  { key: "lymph-axillary", label: "axillary lymph nodes", match: ["axillary lymph", "axilla"],
    note: "if no distinct axillary node mesh exists, shown against the axilla region." },
  { key: "lymph-inguinal", label: "inguinal lymph nodes", match: ["inguinal lymph", "groin"],
    note: "if no distinct inguinal node mesh exists, shown against the groin region." },
  { key: "lymph-mesenteric", label: "mesenteric lymph nodes", match: ["mesenteric lymph", "mesentery"],
    note: "if no distinct mesenteric node mesh exists, shown against the mesentery." },
  { key: "lymph-celiac", label: "celiac lymph nodes", match: ["celiac lymph", "coeliac lymph"],
    note: "a deep abdominal node group unlikely to be resolved separately; shown against the celiac artery region where matched, otherwise not represented." },
  { key: "lymph-mediastinal", label: "mediastinal lymph nodes", match: ["mediastinal lymph", "mediastinum"],
    note: "if no distinct mediastinal node mesh exists, shown against the mediastinum." },
  { key: "lymph-popliteal", label: "popliteal lymph nodes", match: ["popliteal lymph", "popliteal"],
    note: "a small node group unlikely to be resolved separately; shown against the popliteal fossa region." },
  { key: "lymph-epitrochlear", label: "epitrochlear lymph nodes", match: ["epitrochlear"],
    note: "a small node group unlikely to be resolved separately; shown against the medial elbow region." },

  // ---------- misc marrow ----------
  { key: "marrow-yellow", label: "yellow bone marrow", match: ["femur", "humerus", "tibia"], systems: ["skeletal"],
    note: "marrow composition is not distinguished within the bone mesh; shown against long bones where yellow marrow predominates." },
];
