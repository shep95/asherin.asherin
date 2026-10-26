/**
 * SERP ENTITY ENGINE — deterministic intelligence layer over a result corpus.
 * ---------------------------------------------------------------------------
 * This module turns a list of search results (plus optionally their fetched
 * bodies) into: typed entities, resolved identities, a co-occurrence graph with
 * 0/1/2/3 hop rings, a chronological timeline and per-domain exposure signals.
 *
 * Design constraints, all deliberate:
 *  - NO model calls. Every claim here must be reproducible from the corpus, so
 *    the engine is pure string processing. A model can narrate this output, but
 *    it can never be the origin of it.
 *  - Every node and event carries the source URLs it came from. A finding with
 *    no source is a bug, not a finding.
 *  - All regexes are bounded and non-catastrophic (no nested unbounded
 *    quantifiers), and every input string is length-capped before matching, so
 *    a hostile page cannot pin the isolate's CPU.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type EntityKind =
  | "person" | "org" | "email" | "phone" | "handle" | "domain"
  | "ip" | "location" | "crypto" | "document" | "topic";

export interface SerpDoc {
  url: string;
  title: string;
  snippet: string;
  /** Full page text when the body harvest succeeded; empty when snippet-only. */
  body?: string;
  domain: string;
  /** true when only the SERP snippet backs this doc — lower evidentiary weight. */
  snippetOnly: boolean;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  label: string;
  /** Distinct documents mentioning this entity. */
  mentions: number;
  /** Distinct domains mentioning it — the real corroboration measure. */
  domains: string[];
  sources: string[];
  /** 0 = seed, 1..3 = hop ring, -1 = unplaced (not connected to the seed). */
  ring: number;
  /** 0..1 — corroboration × selector-strength. */
  confidence: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Number of documents in which both entities appear. */
  weight: number;
  /** Distinct domains supporting the link. */
  domains: number;
  kind: "co-occurrence" | "identity" | "inferred";
  sources: string[];
}

export interface IdentityCluster {
  id: string;
  label: string;
  members: { id: string; kind: EntityKind; label: string }[];
  /** Why the members were joined — shown verbatim in the UI. */
  basis: string[];
  confidence: number;
}

export interface TimelineEvent {
  iso: string;
  label: string;
  source: string;
  domain: string;
}

export type ExposureKind =
  | "breach" | "paste" | "darkweb" | "social" | "records"
  | "news" | "code" | "commercial" | "web";

export interface ExposureSignal {
  kind: ExposureKind;
  domain: string;
  url: string;
  title: string;
  /** Literal corpus text that justified the classification. */
  evidence: string;
}

export interface SerpIntel {
  seed: string;
  entities: Entity[];
  edges: GraphEdge[];
  identities: IdentityCluster[];
  timeline: TimelineEvent[];
  exposure: ExposureSignal[];
  coverage: {
    documents: number;
    bodiesParsed: number;
    snippetOnly: number;
    domains: number;
    ring1: number;
    ring2: number;
    ring3: number;
  };
}

// ── Bounded scan limits ────────────────────────────────────────────────────

const MAX_TEXT_PER_DOC = 120_000;   // chars fed to the matchers per document
const MAX_ENTITIES = 600;
const MAX_EDGES = 2_000;
const MAX_TIMELINE = 120;

// ── Lexicons ───────────────────────────────────────────────────────────────

const STOP = new Set([
  "The","This","That","These","Those","There","Here","When","Where","What","Which","Who","Why","How",
  "And","But","For","With","From","Into","Over","Under","After","Before","About","Between","During",
  "New","Old","Best","Top","Free","Full","More","Most","Some","Any","All","Not","You","Your","Our",
  "Home","Page","Search","Results","Login","Sign","Privacy","Terms","Cookie","Contact","About Us",
  "Read","View","Click","Learn","Share","Follow","Subscribe","Menu","Skip","Next","Previous","Back",
  "January","February","March","April","May","June","July","August","September","October","November","December",
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
]);

const ORG_SUFFIX = /(Inc|Corp|Corporation|Company|Co|LLC|L\.L\.C|Ltd|Limited|PLC|LLP|LP|GmbH|AG|NV|BV|SA|SAS|Pty|Holdings|Group|Partners|Ventures|Capital|Trust|Foundation|Institute|University|College|Academy|Hospital|Clinic|Agency|Bureau|Department|Ministry|Council|Authority|Commission|Association|Society|Labs?|Laboratories|Technologies|Systems|Solutions|Networks|Media|Press|Bank|Insurance|Realty|Properties|Construction|Services)$/;

const LOCATION_HINT = /(County|Parish|Province|District|Township|City of|State of|Republic of)/;

/** Multi-word place names that the capitalised-name matcher would otherwise
 *  file as people. Extraction that calls a city a person poisons every hop
 *  ring downstream, so this gate runs before the person branch. */
const KNOWN_PLACES = new Set([
  "san francisco","new york","los angeles","san diego","san jose","santa clara","santa monica",
  "palo alto","mountain view","menlo park","cape coral","fort myers","new orleans","las vegas",
  "salt lake","kansas city","san antonio","fort worth","st louis","new jersey","new hampshire",
  "new mexico","north carolina","south carolina","north dakota","south dakota","west virginia",
  "rhode island","united states","united kingdom","great britain","new zealand","south africa",
  "south korea","north korea","saudi arabia","hong kong","tel aviv","abu dhabi","buenos aires",
  "rio de janeiro","sao paulo","mexico city","washington dc","district of columbia",
]);

/** Generic institutional nouns — a name ending here is an organisation. */
const ORG_NOUN = /(Department|Commission|Management|Authority|Securities|Institute|Ministry|Administration|Council|Committee|Bureau|Board|Exchange|Office|Fund|Agency|Union|Alliance|Coalition|Registry|Division|Command)$/;

/** Sentence machinery that a capitalised-pair matcher mistakes for names. */
const FUNCTION_WORDS = new Set([
  "While","Although","Because","During","After","Before","Since","However","Meanwhile","Following",
  "Are","Is","Was","Were","Been","Being","Has","Have","Had","Will","Would","Should","Could","May",
  "Selling","Buying","Making","Taking","Getting","Number","Code","First","Second","Third","Next",
  "Both","Each","Every","Whether","Also","Even","Only","Just","Still","Then","Than","Such","Many",
  "Action","Report","Update","Release","Statement","Notice","Series","Round","Model","Version",
]);

/** Capitalised words that are product/section chrome, never a surname. */
const NON_NAME_TOKENS = new Set([
  "Products","Product","Solutions","Pricing","Careers","Company","Research","Blog","News","Support",
  "Docs","Documentation","Api","Enterprise","Platform","Overview","Features","Resources","Legal",
  "Policy","Security","Login","Signup","Download","Console","Dashboard","Team","Press","Events",
  "Claude","Gpt","Copilot","Assistant","Cookies","Settings","Account","Help","Terms","Privacy",
]);

const EXPOSURE_DOMAINS: { re: RegExp; kind: ExposureKind }[] = [
  { re: /(haveibeenpwned|dehashed|leakcheck|snusbase|breachdirectory|intelx|leak-lookup|weleakinfo)/i, kind: "breach" },
  { re: /(pastebin|ghostbin|paste\.|justpaste|controlc|rentry|hastebin|dpaste)/i, kind: "paste" },
  { re: /(\.onion|torch|ahmia|darkfail|dread)/i, kind: "darkweb" },
  { re: /(twitter|x\.com|linkedin|facebook|instagram|tiktok|reddit|mastodon|bsky|threads|youtube|telegram|vk\.com)/i, kind: "social" },
  { re: /(\.gov|\.us$|courtlistener|justia|pacer|unicourt|sunbiz|opencorporates|sec\.gov|companieshouse)/i, kind: "records" },
  { re: /(github|gitlab|bitbucket|npmjs|pypi|stackoverflow|sourceforge)/i, kind: "code" },
  { re: /(reuters|apnews|bloomberg|nytimes|washingtonpost|bbc|cnn|guardian|forbes|news)/i, kind: "news" },
  { re: /(whitepages|spokeo|beenverified|truepeoplesearch|fastbackgroundcheck|unmask|radaris|intelius|peoplefinders|thatsthem)/i, kind: "commercial" },
];

const EXPOSURE_TEXT: { re: RegExp; kind: ExposureKind }[] = [
  { re: /\b(data breach|breached|leaked (?:database|credentials|password)|dump(?:ed)? (?:database|creds)|combolist)\b/i, kind: "breach" },
  { re: /\b(paste|pastebin dump|full dump)\b/i, kind: "paste" },
  { re: /\b(darknet|dark web|hidden service|onion (?:site|market))\b/i, kind: "darkweb" },
];

// ── Matchers (all bounded) ─────────────────────────────────────────────────

const RE_EMAIL = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,12}\b/g;
const RE_PHONE = /(?:\+?1[ .-]?)?\(?\b[2-9]\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g;
const RE_HANDLE = /(?:^|[\s(])@([A-Za-z0-9_]{3,30})\b/g;
const RE_IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const RE_BTC = /\b(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g;
const RE_ETH = /\b0x[a-fA-F0-9]{40}\b/g;
const RE_DOMAIN = /\b((?:[a-z0-9-]{1,63}\.){1,4}(?:com|net|org|io|co|gov|edu|us|uk|ca|de|fr|au|info|biz|dev|app|ai|xyz|onion))\b/gi;
const RE_NAME = /\b([A-Z][a-z]{1,18})(?:\s+([A-Z][a-z]{1,18}|[A-Z]\.))?\s+([A-Z][a-z]{1,20})\b/g;
const RE_ISO_DATE = /\b(20\d{2}|19\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const RE_US_DATE = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/((?:19|20)\d{2})\b/g;
/** Left context that precedes a real personal name in prose. */
const RE_PERSON_LEFT = /\b(?:by|from|with|and|to|of|for|attorney|judge|officer|agent|ceo|cto|cfo|coo|founder|co-founder|president|director|chairman|professor|dr|mr|mrs|ms|sen|rep|gov|said|told|according to|contact)\b[\s:,]{1,3}$/i;
/** Right context that follows a real personal name in prose. */
const RE_PERSON_RIGHT = /^\s*,?\s*(?:said|says|told|wrote|who\s|is\s|was\s|has\s|had\s|joined|serves|founded|leads|owns|age\b|of\s|at\s|from\s|jr\b|sr\b|iii\b|ceo|cto|cfo|coo|founder|co-founder|president|director|esq)/i;

/** Attribution verbs and role titles — unambiguous personal-name context. */
const RE_PERSON_STRONG_LEFT = /\b(?:by|founder|co-founder|ceo|cto|cfo|coo|president|director|chairman|professor|dr|mr|mrs|ms|sen|rep|gov|attorney|judge|officer|agent|according to|contact|interview with|spokesperson)\b[\s:,]{1,3}$/i;
const RE_PERSON_STRONG_RIGHT = /^\s*,?\s*(?:said|says|told|wrote|who\s|is\s+(?:a|the|an)\s|was\s+(?:a|the|an)\s|co-founder|founder|ceo|cto|cfo|coo|president|director|age\s+\d{1,3}|,\s*\d{1,3}\b|jr\b|sr\b|iii\b|esq\b)/i;

const RE_LONG_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/g;

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
  July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
};

// ── Helpers ────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const keyOf = (kind: EntityKind, label: string) => `${kind}:${norm(label)}`;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, MAX_TEXT_PER_DOC);
}

/** Runs a global regex against text without leaking `lastIndex` between calls. */
function matchAll(re: RegExp, text: string, cap = 400): RegExpExecArray[] {
  const local = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = local.exec(text)) !== null) {
    out.push(m);
    if (out.length >= cap) break;
    if (m.index === local.lastIndex) local.lastIndex++; // zero-width guard
  }
  return out;
}

/** Selector strength — how identifying a datum is on its own. */
function baseWeight(kind: EntityKind): number {
  switch (kind) {
    case "email": case "crypto": return 0.9;
    case "phone": case "handle": case "ip": return 0.8;
    case "person": case "org": return 0.6;
    case "domain": case "document": return 0.5;
    case "location": return 0.45;
    default: return 0.35;
  }
}

// ── Extraction ─────────────────────────────────────────────────────────────

interface Hit { kind: EntityKind; label: string; }

function extractFromText(text: string, docDomain: string): Hit[] {
  const hits: Hit[] = [];
  const push = (kind: EntityKind, label: string) => {
    const l = label.trim();
    if (l.length >= 2 && l.length <= 120) hits.push({ kind, label: l });
  };

  for (const m of matchAll(RE_EMAIL, text)) push("email", m[0].toLowerCase());
  for (const m of matchAll(RE_PHONE, text)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) push("phone", digits.slice(-10));
  }
  for (const m of matchAll(RE_HANDLE, text)) push("handle", `@${m[1]}`);
  for (const m of matchAll(RE_IPV4, text)) {
    // Version strings and dotted decimals masquerade as IPs; require a public
    // routable first octet so "1.2.3.4"-style noise does not enter the graph.
    const parts = m[0].split(".").map(Number);
    if (parts[0] > 9 && parts[0] !== 127 && parts[0] !== 169 && parts[0] < 224) push("ip", m[0]);
  }
  for (const m of matchAll(RE_BTC, text, 40)) push("crypto", m[0]);
  for (const m of matchAll(RE_ETH, text, 40)) push("crypto", m[0].toLowerCase());
  for (const m of matchAll(RE_DOMAIN, text, 200)) {
    const d = m[1].toLowerCase();
    if (d !== docDomain) push("domain", d);
  }
  for (const m of matchAll(RE_NAME, text, 400)) {
    const full = m[0].replace(/\s+/g, " ");
    const left = text.slice(Math.max(0, m.index - 40), m.index);
    const right = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const first = m[1];
    const last = m[3];
    if (STOP.has(first) || STOP.has(last)) continue;
    if (NON_NAME_TOKENS.has(first) || NON_NAME_TOKENS.has(last)) continue;
    if (full.split(" ").some((t) => FUNCTION_WORDS.has(t))) continue;
    // "Products Claude Claude" — repeated tokens mean nav chrome, not a name.
    const tokens = full.split(" ").map((t) => t.toLowerCase());
    if (new Set(tokens).size !== tokens.length) continue;
    if (ORG_SUFFIX.test(last) || ORG_NOUN.test(last)) { push("org", full); continue; }
    if (KNOWN_PLACES.has(norm(full)) || LOCATION_HINT.test(full)) { push("location", full); continue; }
    // A capitalised word pair is only a person when prose says so. Without this
    // gate, navigation chrome ("Wikipedia Jump", "Bahasa Indonesia Ido") floods
    // hop ring 1 and buries the actual actors. A middle initial is self-evident
    // name structure and passes on its own.
    const hasMiddleInitial = /\b[A-Z]\.\s/.test(full);
    // Marketing headings are runs of Title Case words ("Secure Web Gateway"),
    // and they satisfy the weak cues. When the candidate sits inside such a run
    // we demand an explicit prose cue — a verb of attribution or a role title —
    // before admitting it as a person.
    const inTitleRun = /[A-Z][a-z]{1,18}\s*$/.test(left) || /^\s+[A-Z][a-z]{1,18}/.test(right);
    const strongCue = RE_PERSON_STRONG_LEFT.test(left) || RE_PERSON_STRONG_RIGHT.test(right);
    const weakCue = RE_PERSON_LEFT.test(left) || RE_PERSON_RIGHT.test(right);
    if (!hasMiddleInitial && !strongCue && !(weakCue && !inTitleRun)) continue;
    push("person", full);
  }
  return hits;
}

function extractDates(text: string): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  for (const m of matchAll(RE_ISO_DATE, text, 80)) out.push({ iso: m[0], label: m[0] });
  for (const m of matchAll(RE_US_DATE, text, 80)) {
    out.push({ iso: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, label: m[0] });
  }
  for (const m of matchAll(RE_LONG_DATE, text, 80)) {
    out.push({ iso: `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}`, label: m[0] });
  }
  return out;
}

// ── Identity resolution ────────────────────────────────────────────────────

/**
 * Joins selectors that denote the same actor. Only structural evidence counts:
 * an email local-part equal to a handle, a handle equal to a name's initials +
 * surname, or a domain whose label equals an org name. Fuzzy name similarity is
 * deliberately excluded — it is exactly what produced wrong-person merges.
 */
function resolveIdentities(entities: Map<string, Entity>): IdentityCluster[] {
  const byKind = (k: EntityKind) => [...entities.values()].filter((e) => e.kind === k);
  const emails = byKind("email");
  const handles = byKind("handle");
  const people = byKind("person");
  const orgs = byKind("org");
  const domains = byKind("domain");

  const clusters: IdentityCluster[] = [];

  const localOf = (email: string) => email.split("@")[0].replace(/[._-]/g, "").toLowerCase();
  const handleOf = (h: string) => h.replace(/^@/, "").replace(/[._-]/g, "").toLowerCase();
  const nameKeys = (name: string) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return [];
    const first = parts[0].toLowerCase();
    const last = parts[parts.length - 1].toLowerCase();
    return [first + last, last + first, first[0] + last, first + last[0]];
  };

  for (const person of people) {
    const keys = new Set(nameKeys(person.label));
    if (!keys.size) continue;
    const members = [{ id: person.id, kind: person.kind, label: person.label }];
    const basis: string[] = [];

    for (const e of emails) {
      if (keys.has(localOf(e.label))) {
        members.push({ id: e.id, kind: e.kind, label: e.label });
        basis.push(`email local-part "${e.label.split("@")[0]}" matches name pattern`);
      }
    }
    for (const h of handles) {
      if (keys.has(handleOf(h.label))) {
        members.push({ id: h.id, kind: h.kind, label: h.label });
        basis.push(`handle ${h.label} matches name pattern`);
      }
    }
    if (members.length > 1) {
      clusters.push({
        id: `identity:${person.id}`,
        label: person.label,
        members,
        basis,
        confidence: Math.min(0.95, 0.55 + 0.12 * (members.length - 1)),
      });
    }
  }

  // Email ↔ handle join with no person anchor still resolves an actor.
  for (const e of emails) {
    const local = localOf(e.label);
    const match = handles.find((h) => handleOf(h.label) === local);
    if (!match) continue;
    if (clusters.some((c) => c.members.some((m) => m.id === e.id))) continue;
    clusters.push({
      id: `identity:${e.id}`,
      label: e.label,
      members: [
        { id: e.id, kind: e.kind, label: e.label },
        { id: match.id, kind: match.kind, label: match.label },
      ],
      basis: [`handle ${match.label} equals email local-part`],
      confidence: 0.7,
    });
  }

  // Org ↔ its own domain.
  for (const o of orgs) {
    const slug = norm(o.label).replace(/[^a-z0-9]/g, "");
    if (slug.length < 4) continue;
    const match = domains.find((d) => d.label.split(".")[0].replace(/[^a-z0-9]/g, "") === slug);
    if (!match) continue;
    clusters.push({
      id: `identity:${o.id}`,
      label: o.label,
      members: [
        { id: o.id, kind: o.kind, label: o.label },
        { id: match.id, kind: match.kind, label: match.label },
      ],
      basis: [`domain ${match.label} matches organisation name`],
      confidence: 0.65,
    });
  }

  return clusters.slice(0, 40);
}

// ── Ring assignment ────────────────────────────────────────────────────────

/**
 * Breadth-first hop rings from the seed over the co-occurrence graph.
 * Ring 3 is intentionally intersection-only: a ring-3 candidate is admitted
 * only when at least two distinct ring-2 branches both reach it. Unbounded
 * ring-3 expansion is the step that turns a 40-contact graph into 2.5 million
 * meaningless nodes, so convergence — not fanout — is the admission rule.
 */
function assignRings(
  entities: Map<string, Entity>,
  adjacency: Map<string, Map<string, number>>,
  seedId: string,
): void {
  for (const e of entities.values()) e.ring = -1;
  const seed = entities.get(seedId);
  if (!seed) return;
  seed.ring = 0;

  const ring1 = [...(adjacency.get(seedId)?.keys() ?? [])];
  for (const id of ring1) {
    const n = entities.get(id);
    if (n && n.ring === -1) n.ring = 1;
  }

  const branchReach = new Map<string, Set<string>>(); // candidate → ring-1 parents
  for (const parent of ring1) {
    for (const id of adjacency.get(parent)?.keys() ?? []) {
      const n = entities.get(id);
      if (!n || n.ring === 0 || n.ring === 1) continue;
      if (n.ring === -1) n.ring = 2;
      if (!branchReach.has(id)) branchReach.set(id, new Set());
      branchReach.get(id)!.add(parent);
    }
  }

  const ring2 = [...entities.values()].filter((e) => e.ring === 2).map((e) => e.id);
  const convergence = new Map<string, Set<string>>();
  for (const parent of ring2) {
    for (const id of adjacency.get(parent)?.keys() ?? []) {
      const n = entities.get(id);
      if (!n || n.ring !== -1) continue;
      if (!convergence.has(id)) convergence.set(id, new Set());
      convergence.get(id)!.add(parent);
    }
  }
  for (const [id, parents] of convergence) {
    if (parents.size >= 2) {
      const n = entities.get(id);
      if (n) n.ring = 3;
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

export function buildSerpIntel(seedQuery: string, docs: SerpDoc[]): SerpIntel {
  const entities = new Map<string, Entity>();
  const docEntities: string[][] = [];
  const timeline: TimelineEvent[] = [];
  const exposure: ExposureSignal[] = [];
  const seedLabel = seedQuery.trim().slice(0, 120);
  const seedId = keyOf("topic", seedLabel);

  entities.set(seedId, {
    id: seedId, kind: "topic", label: seedLabel, mentions: docs.length,
    domains: [], sources: [], ring: 0, confidence: 1,
  });

  const seedTokens = norm(seedLabel).split(" ").filter((t) => t.length > 2);

  for (const doc of docs) {
    const text = clean(`${doc.title}. ${doc.snippet}. ${doc.body ?? ""}`);
    const hits = extractFromText(text, doc.domain);
    const idsInDoc = new Set<string>([]);

    for (const hit of hits) {
      const id = keyOf(hit.kind, hit.label);
      let e = entities.get(id);
      if (!e) {
        if (entities.size >= MAX_ENTITIES) continue;
        e = {
          id, kind: hit.kind, label: hit.label, mentions: 0,
          domains: [], sources: [], ring: -1, confidence: 0,
        };
        entities.set(id, e);
      }
      if (!idsInDoc.has(id)) {
        e.mentions += 1;
        if (!e.domains.includes(doc.domain)) e.domains.push(doc.domain);
        if (e.sources.length < 12) e.sources.push(doc.url);
        idsInDoc.add(id);
      }
    }

    // The seed participates in every document it was retrieved from, so the
    // graph is anchored even when the seed string never appears verbatim.
    idsInDoc.add(seedId);
    const seedEntity = entities.get(seedId)!;
    if (!seedEntity.domains.includes(doc.domain)) seedEntity.domains.push(doc.domain);
    if (seedEntity.sources.length < 12) seedEntity.sources.push(doc.url);

    docEntities.push([...idsInDoc]);

    for (const d of extractDates(text)) {
      if (timeline.length >= MAX_TIMELINE) break;
      timeline.push({ iso: d.iso, label: d.label, source: doc.url, domain: doc.domain });
    }

    const domainSignal = EXPOSURE_DOMAINS.find((s) => s.re.test(doc.domain) || s.re.test(doc.url));
    const textSignal = EXPOSURE_TEXT.find((s) => s.re.test(text.slice(0, 4000)));
    if (domainSignal || textSignal) {
      exposure.push({
        kind: (textSignal ?? domainSignal)!.kind,
        domain: doc.domain,
        url: doc.url,
        title: doc.title.slice(0, 160),
        evidence: textSignal
          ? (text.slice(0, 4000).match(textSignal.re)?.[0] ?? "keyword match")
          : `source class: ${doc.domain}`,
      });
    }
  }

  // ── Co-occurrence edges ──────────────────────────────────────────────────
  const pairWeight = new Map<string, { w: number; domains: Set<string>; sources: Set<string> }>();
  docs.forEach((doc, i) => {
    const ids = docEntities[i] ?? [];
    // O(k²) per document, k capped at 60. The cap is applied by evidentiary
    // value — the seed first, then strong selectors — because a naive slice
    // dropped the seed behind a page's footer domains and left every node
    // unringed (the graph anchor must survive truncation by construction).
    const priority = (id: string): number => {
      if (id === seedId) return 0;
      const kind = id.slice(0, id.indexOf(":")) as EntityKind;
      switch (kind) {
        case "email": case "crypto": case "phone": case "handle": return 1;
        case "person": case "org": return 2;
        case "ip": case "location": return 3;
        default: return 4;
      }
    };
    const capped = [...ids].sort((a, b) => priority(a) - priority(b)).slice(0, 60);
    for (let a = 0; a < capped.length; a++) {
      for (let b = a + 1; b < capped.length; b++) {
        const key = capped[a] < capped[b] ? `${capped[a]}|${capped[b]}` : `${capped[b]}|${capped[a]}`;
        let slot = pairWeight.get(key);
        if (!slot) {
          if (pairWeight.size >= MAX_EDGES) continue;
          slot = { w: 0, domains: new Set(), sources: new Set() };
          pairWeight.set(key, slot);
        }
        slot.w += 1;
        slot.domains.add(doc.domain);
        if (slot.sources.size < 6) slot.sources.add(doc.url);
      }
    }
  });

  const adjacency = new Map<string, Map<string, number>>();
  const edges: GraphEdge[] = [];
  for (const [key, slot] of pairWeight) {
    const [from, to] = key.split("|");
    edges.push({
      from, to, weight: slot.w, domains: slot.domains.size,
      kind: "co-occurrence", sources: [...slot.sources],
    });
    if (!adjacency.has(from)) adjacency.set(from, new Map());
    if (!adjacency.has(to)) adjacency.set(to, new Map());
    adjacency.get(from)!.set(to, slot.w);
    adjacency.get(to)!.set(from, slot.w);
  }

  const identities = resolveIdentities(entities);
  for (const cluster of identities) {
    for (let i = 1; i < cluster.members.length; i++) {
      edges.push({
        from: cluster.members[0].id, to: cluster.members[i].id,
        weight: 1, domains: 1, kind: "identity", sources: [],
      });
      const a = cluster.members[0].id, b = cluster.members[i].id;
      if (!adjacency.has(a)) adjacency.set(a, new Map());
      if (!adjacency.has(b)) adjacency.set(b, new Map());
      adjacency.get(a)!.set(b, Math.max(adjacency.get(a)!.get(b) ?? 0, 2));
      adjacency.get(b)!.set(a, Math.max(adjacency.get(b)!.get(a) ?? 0, 2));
    }
  }

  assignRings(entities, adjacency, seedId);

  // ── Confidence ───────────────────────────────────────────────────────────
  const totalDomains = new Set(docs.map((d) => d.domain)).size || 1;
  for (const e of entities.values()) {
    if (e.id === seedId) continue;
    const corroboration = Math.min(1, e.domains.length / Math.min(3, totalDomains));
    const seedAffinity = seedTokens.some((t) => norm(e.label).includes(t)) ? 0.1 : 0;
    e.confidence = Math.round(Math.min(1, baseWeight(e.kind) * (0.5 + 0.5 * corroboration) + seedAffinity) * 100) / 100;
  }

  // Rank: ring first (closeness to the seed), then corroboration, then volume.
  const ranked = [...entities.values()].sort((a, b) => {
    const ra = a.ring === -1 ? 9 : a.ring;
    const rb = b.ring === -1 ? 9 : b.ring;
    if (ra !== rb) return ra - rb;
    if (b.domains.length !== a.domains.length) return b.domains.length - a.domains.length;
    return b.mentions - a.mentions;
  });

  const keptIds = new Set(ranked.slice(0, 300).map((e) => e.id));
  const keptEdges = edges
    .filter((e) => keptIds.has(e.from) && keptIds.has(e.to))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 800);

  const dedupTimeline = new Map<string, TimelineEvent>();
  for (const ev of timeline) {
    const k = `${ev.iso}|${ev.domain}`;
    if (!dedupTimeline.has(k)) dedupTimeline.set(k, ev);
  }

  return {
    seed: seedLabel,
    entities: ranked.slice(0, 300),
    edges: keptEdges,
    identities,
    timeline: [...dedupTimeline.values()].sort((a, b) => b.iso.localeCompare(a.iso)).slice(0, 60),
    exposure: exposure.slice(0, 40),
    coverage: {
      documents: docs.length,
      bodiesParsed: docs.filter((d) => !d.snippetOnly).length,
      snippetOnly: docs.filter((d) => d.snippetOnly).length,
      domains: totalDomains,
      ring1: ranked.filter((e) => e.ring === 1).length,
      ring2: ranked.filter((e) => e.ring === 2).length,
      ring3: ranked.filter((e) => e.ring === 3).length,
    },
  };
}
