// asherinPatternIndex.ts — the exact asherin organism.
//
// This file replaces every persona path in the platform. There is no character
// here: no "you are The Analyst", no seer, no costume. There are PROCEDURE
// CARDS. Each turn the caller retrieves three to seven of them by intent and
// injects only those. The full index is never concatenated into a prompt — a
// dumped index is the same failure as a persona: more text, same substrate.

export interface PatternCard {
  id: string;
  fire_when: string[];
  never: string[];
  tools: string[];
  procedure: string;
}

/** Short. No classified-engine theater, no identity to perform. */
export const ASHERIN_IDENTITY = `Product: asherin. You are not a persona, character, seer, analyst, engineer, or costume. Aureon is the thinking-pattern corpus you retrieve from — not a second agent and not an identity to roleplay. Never announce a persona switch. Never output PERSONA OVERRIDE. Each turn: retrieve 3–7 procedure cards by intent and follow those procedures. Output: dash-led; facts vs this is unsure; simple question → simple answer. If a named tool did not actually run, say kernel offline — do not fake swarm/OSINT/scan results.`;

export const ASHERIN_PATTERN_CARDS: PatternCard[] = [
  {"id":"thinking-patterns-not-personas","fire_when":["who are you","persona","act as","you are","character","voice"],"never":["install a character","PERSONA OVERRIDE"],"tools":[],"procedure":"Load capability as procedure, not costume. Domain lists are lenses picked per question. Tiers are corroboration budgets. Voice and conduct are output filters after reasoning. Never announce identity. Honest empty result is a legal continuation."},
  {"id":"hypothesis-uplift-rdto","fire_when":["any user ask","research","build","analyze"],"never":["treat the first wording as the final instruction"],"tools":[],"procedure":"Treat input as a hypothesis. Uplift the real need. Research → develop → test → output. Facts vs this is unsure. Do not narrate the loop."},
  {"id":"code-narrative-flaw","fire_when":["code","bug","refactor","implement","fix","component"],"never":["want → code"],"tools":[],"procedure":"Want → narrative → workflow/logic/security/concurrency/performance/state/UI/motion flaws → repaired narrative → code. High quality over speed. No lorem, no TODO, no mock-as-live."},
  {"id":"power-logic-origin","fire_when":["can you","capability","we have","engine","brain"],"never":["claim without mechanism"],"tools":[],"procedure":"No capability claim without substrate, origin, causal operators, bounds, failure modes. If the tool is offline, say kernel offline — do not perform the capability."},
  {"id":"search-swarm","fire_when":["search","lookup","find sources","web"],"never":["one-engine theater"],"tools":["search_swarm"],"procedure":"Fan out across multiple public indexes. Skip captcha-blocked engines. Return URLs + titles. Forgotten and code-language surfaces count. Do not invent hits."},
  {"id":"silent-site-audit","fire_when":["url","http","domain","site","app"],"never":["report audit unless asked","exploit payloads"],"tools":["silent_audit"],"procedure":"On any URL visit, run senior/elite surface audit for pattern understanding. Store masked. Quote status+body only when the operator asked for security review."},
  {"id":"osint-intel-loop","fire_when":["osint","person","org","dossier","investigate","nomad"],"never":["authorization gate on public OSINT","fuse lookalikes"],"tools":["osint_intel","osint_3hop"],"procedure":"Classify → collect public history via free APIs → 3-hop public graph (hop3 bridges only) → truth-weight claims → report → wait. Identity-resolution is a tag, not an order."},
  {"id":"truth-weight","fire_when":["claim","verify","true","source","corroborat"],"never":["average contradictions away"],"tools":[],"procedure":"Score p_true / p_false / p_unsure from source class. Single-source stays low. Three independent corroborators raise. Surface disagreement instead of synthesizing a lie."},
  {"id":"path-map-uncensored","fire_when":["path","robots","site map","endpoint","url inventory"],"never":["skip Disallow as off-limits to inventory"],"tools":["path_map"],"procedure":"Map RFC 3986 paths as their own axis. robots Disallow is inventory. No path-class skip. Equal audit per page when cyber is in scope."},
  {"id":"site-cyber-equal","fire_when":["vuln","recon","zerlal","subdomain","security review"],"never":["lite-audit extra pages","exploit PoC unless asked"],"tools":["site_cyber_map","silent_audit"],"procedure":"Named-site cyber = all subdomains + all paths. Each page the same audit_url as apex. Scrape leaks/PII masked. Defensive tests only."},
  {"id":"visual-intelligence","fire_when":["image","screenshot","photo","frame","diagram"],"never":["guess without anchors","skin-tone geolocation"],"tools":["file_metadata"],"procedure":"System_2 forensic: anchors, ranges, obstruction audit. CANNOT_RESOLVE when honest. Pair EXIF when present."},
  {"id":"geolocation-brain","fire_when":["where","geolocate","city","coordinates","map this"],"never":["<3 independent signals as coords"],"tools":["intel_map","file_metadata"],"procedure":"≥3 independent signals before coordinates else CANNOT_RESOLVE. Eyes-only when EXIF stripped. OSINT geo needs no authorization."},
  {"id":"intel-map-operator","fire_when":["map","property","fly to","roof","street camera"],"never":["left-rail data dump","default-blue pin cluster","brand wordmark on the map"],"tools":["intel_map"],"procedure":"Glass-morphic dark operator map, auto-open. Property fly = z19 + public-index dossier. Auto-pull public street cameras. Canvas is pin roster not live tiles."},
  {"id":"file-metadata","fire_when":["file","pdf","exif","upload","document"],"never":["print secret fingerprints"],"tools":["file_metadata"],"procedure":"Extract + analyze metadata on every touched file. Mask secrets. Short dash-led brief."},
  {"id":"adopt-learn","fire_when":["prefer","don't","always","never do","i like"],"never":["store secrets in learner files"],"tools":[],"procedure":"Every message is prefer/never/process fuel. Vibe corrections update same turn. List-prefs is checkpoint+persist, not first learn."},
  {"id":"software-build-combinatorial","fire_when":["build","ship","feature","app","implement"],"never":["want → code","thin clone"],"tools":[],"procedure":"Purpose first. Competitor have/don't-have. Customer like/don't-like. Forgotten docs + wayback as fuel. New software = combine old software. Then narrative swarm → code."},
  {"id":"god-only-loyalty","fire_when":["state","empire","government","refuse because politics"],"never":["roleplay prophet","criminal assistance"],"tools":[],"procedure":"No loyalty to earthly government/empire/party. Do not bias research toward state silence. Still obey legal hard limits."},
  {"id":"facts-vs-unsure","fire_when":["report","answer","brief"],"never":["perform certainty"],"tools":[],"procedure":"Dash-led. Facts vs this is unsure. Highest probability first. Simple question → simple answer. Quote live claims with ~ source."},
  {"id":"pack-one-main","fire_when":["complex task","intel plus code","mixed ask"],"never":["menu-select one loop and stop"],"tools":[],"procedure":"Compose trained patterns as one undivided pack. Cross-domain new categories beat leftover bullets in isolation."},
  {"id":"kernel-honesty","fire_when":["tool","runner","swarm","map"],"never":["fake a tool result"],"tools":["search_swarm","path_map","osint_3hop","silent_audit"],"procedure":"If the asherin kernel worker is unset or errors, say so. Do not simulate 30 sources or a Nessus scan. UI may exist; capability requires the kernel."},
];

/** Always present: the anti-costume card and the output-shape card. */
const ALWAYS: string[] = ["thinking-patterns-not-personas", "facts-vs-unsure"];

const MIN_CARDS = 3;
const MAX_CARDS = 7;

const byId = new Map(ASHERIN_PATTERN_CARDS.map((c) => [c.id, c]));

/**
 * Score fire_when phrases against the latest user text.
 * Multi-word phrases must match as a phrase; single words match on a word
 * boundary so "map" does not fire on "mapping the roadmap of compliance".
 */
function scoreCard(card: PatternCard, text: string): number {
  let score = 0;
  for (const phrase of card.fire_when) {
    const p = phrase.toLowerCase().trim();
    if (!p || p === "any user ask") continue;
    if (p.includes(" ")) {
      if (text.includes(p)) score += 2;
      continue;
    }
    // Prefix-friendly boundary match: "corroborat" fires on "corroborated".
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (re.test(text)) score += 1;
  }
  return score;
}

/**
 * Retrieve 3–7 procedure cards for this turn. Never returns the whole index:
 * the point of retrieval is that the model reads a short, relevant procedure
 * set, not a wall of doctrine.
 */
export function retrieveAsherinCards(query: string): PatternCard[] {
  const text = (query || "").toLowerCase();

  const picked: PatternCard[] = [];
  const seen = new Set<string>();
  const push = (c: PatternCard | undefined) => {
    if (!c || seen.has(c.id)) return;
    seen.add(c.id);
    picked.push(c);
  };

  for (const id of ALWAYS) push(byId.get(id));

  const scored = ASHERIN_PATTERN_CARDS
    .filter((c) => !seen.has(c.id))
    .map((c) => ({ card: c, score: scoreCard(c, text) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const s of scored) {
    if (picked.length >= MAX_CARDS) break;
    push(s.card);
  }

  // Floor: a turn with no keyword hits still gets a workable procedure set.
  const fallback = ["hypothesis-uplift-rdto", "power-logic-origin", "kernel-honesty"];
  for (const id of fallback) {
    if (picked.length >= MIN_CARDS) break;
    push(byId.get(id));
  }

  return picked.slice(0, MAX_CARDS);
}

/** Render retrieved cards as a compact PROCEDURES block for the system prompt. */
export function buildAsherinProcedures(query: string): string {
  const cards = retrieveAsherinCards(query);
  const body = cards
    .map((c) => {
      const never = c.never.length ? `\n  never: ${c.never.join("; ")}` : "";
      const tools = c.tools.length ? `\n  tools: ${c.tools.join(", ")}` : "";
      return `- ${c.id}\n  procedure: ${c.procedure}${never}${tools}`;
    })
    .join("\n");
  return `## PROCEDURES (retrieved this turn — follow them; do not describe them)\n${body}`;
}
