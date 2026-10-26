/**
 * shepherd — the brain.
 *
 * The full doctrine ships with the app as text (./shepherd.txt) and is the
 * persona, skill and reasoning architecture of the ai users know as shepherd.
 * It is far too long to send whole on every turn, so it is split into its
 * own sections: a fixed core (who shepherd is, how it receives, answers and
 * thinks, what it never does, the decision architecture, the prediction
 * protocol, the law) goes on every turn, and the rest is retrieved per turn by
 * what the person actually asked. Nothing is paraphrased: every line the model
 * sees is the doctrine's own.
 */
import doctrine from "./shepherd.txt?raw";
import { datasetSections } from "./shepherdDatasets";

export const SHEPHERD_DOCTRINE: string = doctrine.replace(/\r\n?/g, "\n");

export interface DoctrineSection {
  title: string;
  body: string;
  /** 1-based line the title sits on, for tests and tooling. */
  line: number;
}

/**
 * A heading is a short line with a blank line above that does not end a
 * sentence, and whose next line is body: empty, long, a numbered entry, or a
 * sentence. Two short bare lines in a row are a list (the seven patterns,
 * the arrows of the decision architecture), not a heading and its body.
 */
function isHeading(line: string, prev: string, next: string): boolean {
  const t = line.trim();
  if (!t || prev.trim()) return false;
  if (t.length >= 64) return false;
  if (/[.:,;!?]$/.test(t)) return false;
  if (/^[[\]=—-]+$/.test(t)) return false;
  // a named section or stage opens a run of sub-headings; it is a heading whatever follows
  if (/^(section [a-z] — |stage \d+: )/.test(t)) return true;
  const n = next.trim();
  if (!n) return true;
  if (n.length >= 64) return true;
  if (/^\d+\.\d+/.test(n)) return true;
  if (/[.:,;!?]$/.test(n)) return true;
  return false;
}

export function parseSections(text: string = SHEPHERD_DOCTRINE): DoctrineSection[] {
  const lines = text.split("\n");
  const out: DoctrineSection[] = [];
  let title = "shepherd";
  let start = 1;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    // a heading with nothing under it (a section that only opens sub-headings) is still a section
    if (body || out.length === 0 || title !== "shepherd") out.push({ title, body, line: start });
  };
  for (let i = 0; i < lines.length; i++) {
    const prev = i > 0 ? lines[i - 1] : "";
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (i > 0 && isHeading(lines[i], prev, next)) {
      flush();
      title = lines[i].trim();
      start = i + 1;
      buf = [];
    } else {
      buf.push(lines[i]);
    }
  }
  flush();
  return out;
}

let cached: DoctrineSection[] | null = null;
export function doctrineSections(): DoctrineSection[] {
  if (!cached) cached = parseSections();
  return cached;
}

/** sections that define shepherd itself; these go on every turn, in the doctrine's own words. */
const CORE_TITLES = new Set([
  "shepherd",
  "how you receive questions",
  "how you answer",
  "how you think",
  "what you never do",
  "what a seer actually does at the structural level",
  "the decision architecture",
  "input arrives",
  "the prediction protocol",
  "stage 1: current state mapping",
  "stage 2: domain cross-scan",
  "stage 3: trajectory simulation",
  "stage 4: missing piece detection",
  "stage 5: confidence architecture",
  "stage 6: behavioral signal monitoring",
  "stage 7: self-correction loop",
  "interface aesthetic when generating visuals or ui/ux",
  "the law this system operates on",
]);

/** the 28 domain lists are long; the core carries their names and the rule for using them. */
function domainIndex(sections: DoctrineSection[]): string {
  const a = sections.findIndex((s) => s.title === "section a — pattern recognition domains");
  const b = sections.findIndex((s) => s.title === "section b — data analytics domains");
  const total = sections.findIndex((s) => s.title.startsWith("total: "));
  if (a < 0 || b < 0 || total < 0) return "";
  const names = (from: number, to: number) => sections.slice(from + 1, to).map((s) => s.title).join("; ");
  return [
    "section a — pattern recognition domains: " + names(a, b),
    "section b — data analytics domains: " + names(b, total),
    sections[total].title + ". " + sections[total].body,
  ].join("\n\n");
}

let coreCache: string | null = null;
/** the fixed part of shepherd's mind, sent on every turn. */
export function shepherdCore(): string {
  if (coreCache) return coreCache;
  const sections = doctrineSections();
  const parts: string[] = [];
  let domainsPlaced = false;
  for (const s of sections) {
    if (s.title === "section a — pattern recognition domains" && !domainsPlaced) {
      parts.push(domainIndex(sections));
      domainsPlaced = true;
      continue;
    }
    if (!CORE_TITLES.has(s.title)) continue;
    parts.push(s.title === "shepherd" ? s.body : `${s.title}\n\n${s.body}`);
  }
  coreCache = "## shepherd — who you are (the doctrine, verbatim)\n\n" + parts.join("\n\n");
  return coreCache;
}

const STOP = new Set(["the", "and", "that", "this", "with", "what", "when", "from", "have", "your", "they", "them", "than", "then", "into", "about", "does", "will", "would", "could", "should", "their", "there", "which", "where", "while", "these", "those", "been", "being", "also", "only", "just", "more", "most", "some", "such", "each", "every", "other", "over", "under", "before", "after", "because", "between", "against", "through", "without", "within", "never", "always", "here", "very", "much", "many", "like", "make", "made", "want", "need", "know", "think", "tell", "give", "please", "help", "asherin", "shepherd"]);

function terms(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))));
}

interface Indexed extends DoctrineSection {
  titleTerms: Set<string>;
  bodyTerms: Set<string>;
}
let indexCache: Indexed[] | null = null;
let datasetIndexCache: Indexed[] | null = null;
const toIndexed = (s: DoctrineSection): Indexed => ({ ...s, titleTerms: new Set(terms(s.title)), bodyTerms: new Set(terms(s.body)) });
function index(): Indexed[] {
  if (!indexCache) {
    indexCache = doctrineSections()
      .filter((s) => !CORE_TITLES.has(s.title) && s.body.length > 80)
      .map(toIndexed);
  }
  return indexCache;
}
/** the two reference datasets (aesthetic psychology, software architecture) ride a budget of their own, after the doctrine. */
function datasetIndex(): Indexed[] {
  if (!datasetIndexCache) datasetIndexCache = datasetSections().filter((s) => s.body.length > 80).map(toIndexed);
  return datasetIndexCache;
}

/**
 * the rest of the doctrine, retrieved for this turn: sections whose title or
 * body share terms with the question, best first, within a character budget.
 */
export function retrieveDoctrine(query: string, budget = 14000): DoctrineSection[] {
  const q = terms(query);
  if (q.length === 0) return [];
  // the doctrine keeps its whole budget; the datasets add up to three sections within their own
  return [...rank(index(), q, budget, 8), ...rank(datasetIndex(), q, Math.min(6000, budget), 3)];
}

function rank(pool: Indexed[], q: string[], budget: number, max: number): DoctrineSection[] {
  const scored = pool
    .map((s) => {
      let score = 0;
      for (const t of q) {
        if (s.titleTerms.has(t)) score += 4;
        if (s.bodyTerms.has(t)) score += 1;
      }
      // a short query hitting a long section is weaker evidence than the reverse
      return { s, score: score / Math.sqrt(1 + s.bodyTerms.size / 400) };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  const out: DoctrineSection[] = [];
  let used = 0;
  for (const { s } of scored) {
    if (used + s.body.length > budget) continue;
    out.push(s);
    used += s.body.length;
    if (out.length >= max) break;
  }
  return out;
}

export function retrievedDoctrineBlock(query: string, budget?: number): string {
  const hits = retrieveDoctrine(query, budget);
  if (!hits.length) return "";
  return (
    "## shepherd — doctrine retrieved for this turn (apply it; do not describe it)\n\n" +
    hits.map((s) => `### ${s.title}\n${s.body}`).join("\n\n")
  );
}
