// QUERY PLAN — Zophiel "Understand → Retrieve → Rank" stage 1 + stage 3.
//
// Narrative: the engine used to glue augmentation words onto the raw query and
// then order results purely by source credibility (`veracity`), with zero
// comparison against what the operator actually asked. Credibility ordering
// reads as randomness. This module restores topical relevance as a first-class
// ranking factor WITHOUT hard-filtering rare, high-value hits out of existence.
//
// Design constraints (flaws fixed vs. the naive version):
//  1. Required terms are variant-aware (initials, diacritics, hyphen/space) and
//     apply a PENALTY, never a filter — recall floor is preserved.
//  2. Final score is a weighted SUM with a credibility floor, not a product —
//     a near-zero relevance cannot collapse the list into ties.
//  3. Corroboration counts DISTINCT engine-independence CLASSES, because most
//     "different" engines resell the same Google/Bing index.
//  4. Pure regex/dictionary work — no LLM call, sub-millisecond, latency-safe.

export type EntityKind =
  | "person" | "organization" | "place" | "ticker"
  | "cve" | "wallet" | "domain" | "general";

/**
 * Query SHAPE decides the retrieval contract. The same required/optional split
 * cannot serve a bare keyword, a dork string and a two-entity relationship
 * question — each one wants a different gate.
 */
export type QueryShape =
  | "single-token"     // one bare word — the word IS the query, gating adds nothing
  | "operator-dork"    // site:/filetype: dominate; operators are the signal
  | "form-path"        // the operator wants FILE FORM + PATH, not a title match
  | "relationship"     // [entity] <relation phrase> [entity] — both sides gate
  | "identifier"       // CVE / wallet / domain / email — exact selector
  | "natural-question" // filler-heavy sentence; strip noise, keep signal
  | "topic";           // no entity present — pure relevance ranking

/**
 * FORM/PATH intent. When the operator asks for "the html, python and
 * typescript files" or "the non-indexed /agent/ directory", matching the exact
 * TITLE is the wrong contract — the artefact almost never carries the words the
 * operator used. What survives is the file EXTENSION and the PATH SEGMENT.
 */
export interface FormPathIntent {
  /** Concrete extensions to hunt, deduped and lowercase (html, py, ts …). */
  exts: string[];
  /** Path segments seen in the query (`/agent/`, `dist/`, `src`). */
  paths: string[];
  /** Operator explicitly asked for material search engines do not index. */
  nonIndexed: boolean;
}


/** A required term carries a CONFIDENCE, not a boolean. */
export interface WeightedTerm {
  term: string;
  /** 0..1 — how sure we are this is a real selector. Drives gate hardness. */
  confidence: number;
  /** Why it was promoted — surfaced in telemetry, never guessed at later. */
  basis: string;
}

/** [subject] <relation> [object] extracted case-insensitively from the query. */
export interface QueryRelation {
  subject: string;
  relation: string;
  /** What the object side is expected to be. */
  objectKind: "location" | "organization" | "person" | "unknown";
  object: string;
}

export interface QueryPlan {
  raw: string;
  /** Hard-signal terms: proper nouns, IDs, tickers, domains. Missing → heavy penalty. */
  required: string[];
  /** Same terms, with per-term confidence. Gating is a spectrum, not a switch. */
  requiredWeighted: WeightedTerm[];
  /** Context terms that boost but never gate. */
  optional: string[];
  /** Terms prefixed with `-`. Presence sinks a result. */
  negative: string[];
  /** Quoted "..." phrases — exact-match bonus. */
  phrases: string[];
  entity: EntityKind;
  shape: QueryShape;
  relations: QueryRelation[];
  /** Non-Latin script detected — the capitalized-run detector cannot see it. */
  scriptNote?: string;
  /** Search operators (`site:`, `filetype:`, `-site:` …) preserved verbatim. */
  operators: string[];
  /** The string that should go on the wire — the operator's words, unpolluted. */
  wireQuery: string;
  /** Present only when shape === "form-path". */
  formPath?: FormPathIntent;
}


/**
 * Dork operators must survive the planner untouched. Before this guard the
 * tokenizer split `site:linkedin.com` on the colon, quoted "linkedin.com" as a
 * proper noun and left a dangling `site:` on the wire — every operator-driven
 * dork leg silently degraded into a bag-of-words search.
 */
const OPERATOR_RE =
  /(^|\s)(-?)(site|filetype|ext|inurl|allinurl|intitle|allintitle|intext|allintext|related|cache|link|before|after|lang|loc|location|source|around|imagesize)\s*:\s*("[^"]{1,120}"|[^\s]{1,120})/gi;

/**
 * FORM words → concrete extensions. The operator says "typescript"; the SERP
 * only understands `ext:ts`. Language names, not file names, are what people
 * actually type, so the mapping has to live here rather than in the caller.
 */
const FORM_EXT: Record<string, string[]> = {
  html: ["html", "htm"], htm: ["html", "htm"], webpage: ["html"],
  python: ["py"], py: ["py"],
  typescript: ["ts", "tsx"], ts: ["ts", "tsx"], tsx: ["ts", "tsx"],
  javascript: ["js", "mjs"], js: ["js", "mjs"], jsx: ["jsx"],
  markdown: ["md"], md: ["md"],
  json: ["json"], yaml: ["yml", "yaml"], yml: ["yml", "yaml"],
  sql: ["sql"], csv: ["csv"], xml: ["xml"], pdf: ["pdf"],
  php: ["php"], rust: ["rs"], go: ["go"], java: ["java"],
  shell: ["sh"], bash: ["sh"], sh: ["sh"],
  env: ["env"], config: ["conf", "cfg", "ini"], ini: ["ini"],
  zip: ["zip"], tar: ["tar", "gz"], sqlite: ["db", "sqlite"], log: ["log"],
};

/** Path segments: `/agent/`, `dist/`, `src/lib`. A bare word is NOT a path. */
const PATH_RE = /(^|\s)(\/[A-Za-z0-9._-]{1,40}(?:\/[A-Za-z0-9._-]{1,40})*\/?|[A-Za-z0-9._-]{1,40}\/[A-Za-z0-9._-]{1,40}(?:\/[A-Za-z0-9._-]{1,40})*)/g;

const NON_INDEXED_RE =
  /\b(non[\s-]?indexed|unindexed|not\s+indexed|no[\s-]?index|deindexed|hidden\s+(?:files?|dir\w*)|open\s+director\w+|index\s+of|directory\s+listing)\b/i;

/** A form/path ask has to be explicit — a stray "go" or "log" must not fire. */
const FORM_CUE_RE =
  /\b(files?|file\s?type|filetype|extensions?|source\s*code|scripts?|directory|directories|folder|path|paths|dump|artifacts?|assets?|listing|repo|repository)\b/i;

export function detectFormPath(input: string): FormPathIntent | null {
  const lower = input.toLowerCase();
  const nonIndexed = NON_INDEXED_RE.test(lower);

  const exts: string[] = [];
  const seenExt = new Set<string>();
  for (const word of lower.split(/[^a-z0-9]+/)) {
    const mapped = FORM_EXT[word];
    if (!mapped) continue;
    for (const e of mapped) {
      if (seenExt.has(e)) continue;
      seenExt.add(e);
      exts.push(e);
    }
  }
  // Literal `.ext` mentions ("*.tsx", "the .py ones") are the hardest signal.
  for (const m of input.matchAll(/(^|\s|\*)\.([a-z0-9]{1,5})\b/gi)) {
    const e = m[2].toLowerCase();
    if (!seenExt.has(e)) { seenExt.add(e); exts.push(e); }
  }

  const paths: string[] = [];
  const seenPath = new Set<string>();
  for (const m of input.matchAll(PATH_RE)) {
    const seg = m[2].trim();
    // A domain (`asherin.com/blog`) is an identifier, not a path ask.
    if (/^[a-z0-9-]+\.[a-z]{2,}\//i.test(seg)) continue;
    if (seenPath.has(seg)) continue;
    seenPath.add(seg);
    paths.push(seg);
  }

  // Silence is not evidence: fire only when the operator gave a real cue.
  const cued = FORM_CUE_RE.test(lower) || nonIndexed;
  const strong = exts.length >= 2 || (exts.length >= 1 && (cued || paths.length > 0)) ||
    (paths.length > 0 && cued);
  if (!strong) return null;

  return { exts: exts.slice(0, 6), paths: paths.slice(0, 3), nonIndexed };
}

/** Turn a form/path intent into wire operators the SERP actually honours. */
export function formPathOperators(fp: FormPathIntent): string[] {
  const ops: string[] = [];
  if (fp.exts.length) {
    ops.push(fp.exts.length === 1 ? `ext:${fp.exts[0]}` : `(${fp.exts.map((e) => `ext:${e}`).join(" OR ")})`);
  }
  for (const p of fp.paths) {
    const seg = p.replace(/^\/+|\/+$/g, "");
    if (seg) ops.push(`inurl:${seg.includes(" ") ? `"${seg}"` : seg}`);
  }
  if (fp.nonIndexed) ops.push(`intitle:"index of"`);
  return ops;
}



const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","from","has","have","he","her","his",
  "how","i","in","is","it","its","me","my","of","on","or","she","that","the","their","them",
  "there","they","this","to","was","were","what","when","where","which","who","whom","why",
  "will","with","you","your","about","into","over","than","then","tell","find","give","show",
  "search","lookup","look","info","information","data","please","can","do","does","did","get",
]);

/** Strip diacritics, lowercase, collapse punctuation used as word joins. */
export function normalizeTerm(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[-_/.]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TICKER_RE = /^\$?[A-Z]{1,5}$/;
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/i;
const WALLET_RE = /\b(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,62})\b/;
const DOMAIN_RE = /\b([a-z0-9-]+\.)+[a-z]{2,}\b/i;
const ORG_SUFFIX = /\b(inc|llc|ltd|corp|corporation|company|gmbh|plc|sa|nv|ag|holdings|group|labs|foundation)\b/i;
const PLACE_HINT = /\b(city|county|state|province|country|island|district|street|avenue|road)\b/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// ── Rarity lexicon ──────────────────────────────────────────────────────────
// Name/org detection used to fire ONLY on capitalization, so "asher newton"
// scored the same as "the weather today". Capitalization is now one signal
// among several; token RARITY (a token that is not ordinary English) is the
// load-bearing one, which is what makes a lowercase name still register.
const COMMON_WORDS = new Set([
  ...STOPWORDS,
  "after","again","all","also","any","back","because","been","before","being","best","between",
  "both","call","came","come","could","day","did","different","does","down","each","early","even",
  "every","first","found","free","good","great","group","help","here","high","home","just","keep",
  "know","large","last","late","left","less","life","like","little","long","made","make","many",
  "may","more","most","much","must","need","never","new","next","night","now","number","off","old",
  "one","only","open","other","our","out","own","part","people","place","point","price","problem",
  "public","put","real","report","right","said","same","see","seem","set","should","since","small",
  "some","state","still","such","system","take","think","three","through","time","today","two",
  "under","until","up","use","used","very","want","water","way","week","well","went","were","while",
  "work","world","would","year","years","yes","news","best","top","list","free","online","near",
  "cost","review","reviews","guide","vs","versus","company","business","service","services",
]);

/** A token is "rare" when it is alphabetic, long enough, and not ordinary English. */
function isRareToken(tok: string): boolean {
  if (!/^[a-z][a-z'’-]{2,}$/.test(tok)) return false;
  if (COMMON_WORDS.has(tok)) return false;
  // Ordinary inflections of common words are still common.
  for (const suf of ["s", "es", "ed", "ing", "ly"]) {
    if (tok.endsWith(suf) && COMMON_WORDS.has(tok.slice(0, -suf.length))) return false;
  }
  return true;
}

// ── Relation library ────────────────────────────────────────────────────────
// Generalises "who lives in X" into [entity] <relation> [entity]. Matched
// case-insensitively so a lowercase query is handled identically.
const RELATION_PHRASES: { re: RegExp; kind: QueryRelation["objectKind"] }[] = [
  { re: /\b(lives?\s+in|living\s+in|based\s+in|located\s+in|resides?\s+in|from|near)\b/i, kind: "location" },
  { re: /\b(works?\s+at|worked\s+at|employed\s+by|employee\s+of|founder\s+of|co-?founder\s+of|ceo\s+of|cto\s+of|cfo\s+of|director\s+of|owner\s+of|partner\s+at|works?\s+for)\b/i, kind: "organization" },
  { re: /\b(married\s+to|wife\s+of|husband\s+of|son\s+of|daughter\s+of|brother\s+of|sister\s+of|related\s+to|connected\s+to|associated\s+with|linked\s+to|friends?\s+with)\b/i, kind: "person" },
];

/** Non-Latin scripts bypass every capitalization heuristic in this file. */
function detectScript(input: string): string | undefined {
  if (/[\u0400-\u04FF]/.test(input)) return "cyrillic";
  if (/[\u0600-\u06FF]/.test(input)) return "arabic";
  if (/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(input)) return "cjk";
  if (/[\u0900-\u097F]/.test(input)) return "devanagari";
  return undefined;
}

/**
 * Stage 1 — Query Understanding. Pure lexical parse, no network, no model.
 * The returned `wireQuery` is the operator's own words (minus negatives),
 * with multi-word proper nouns quoted so engines treat them atomically.
 */
export function buildQueryPlan(raw: string): QueryPlan {
  const input = (raw || "").trim();
  const phrases: string[] = [];
  const negative: string[] = [];
  const operators: string[] = [];

  // 0. Search operators come off FIRST and go back on the wire verbatim.
  let residue = input.replace(OPERATOR_RE, (_m, lead, neg, key, val) => {
    operators.push(`${neg || ""}${String(key).toLowerCase()}:${val}`);
    return String(lead || " ");
  });

  // 1. Quoted phrases are extracted verbatim (hard signal).
  residue = residue.replace(/"([^"]{2,120})"/g, (_m, p) => {
    phrases.push(String(p).trim());
    return " ";
  });

  // 2. Explicit negatives.
  residue = residue.replace(/(^|\s)-([A-Za-z0-9][\w.-]{1,40})/g, (_m, _s, t) => {
    negative.push(normalizeTerm(String(t)));
    return " ";
  });


  const required = new Set<string>();
  const optional = new Set<string>();
  /** normalized term → the operator's original spelling (for the wire query). */
  const surfaceForm = new Map<string, string>();
  /** normalized term → how sure we are it is a selector, and why. */
  const confidence = new Map<string, { confidence: number; basis: string }>();
  const addRequired = (norm: string, original: string, conf = 1, basis = "explicit") => {
    if (!norm) return;
    required.add(norm);
    if (!surfaceForm.has(norm)) surfaceForm.set(norm, original.trim());
    const prev = confidence.get(norm);
    if (!prev || prev.confidence < conf) confidence.set(norm, { confidence: conf, basis });
  };

  for (const p of phrases) addRequired(normalizeTerm(p), p, 1, "quoted-phrase");

  // 3. Structured identifiers are always required.
  const cve = input.match(CVE_RE);
  if (cve) addRequired(normalizeTerm(cve[0]), cve[0], 1, "cve");
  const wallet = input.match(WALLET_RE);
  if (wallet) addRequired(wallet[0].toLowerCase(), wallet[0], 1, "wallet");
  const email = input.match(EMAIL_RE);
  if (email) addRequired(normalizeTerm(email[0]), email[0], 1, "email");
  const domainHit = residue.match(DOMAIN_RE);
  if (domainHit) addRequired(normalizeTerm(domainHit[0]), domainHit[0], 0.95, "domain");

  // 4. Capitalized runs = proper nouns → required as one atomic term.
  //    "Asher Shepherd Newton" becomes a single required term, not three.
  //    An ALL-CAPS acronym inside a run ("Tesla TSLA") is split off: gluing a
  //    ticker onto a company name produces a phrase no page ever contains.
  const ACRONYM = /^[A-Z0-9]{2,6}$/;
  const properRuns = residue.match(/\b([A-Z][\w'’-]+)(?:\s+(?:of|de|van|von|del|la|le)\s+[A-Z][\w'’-]+|\s+[A-Z][\w'’-]+)*/g) || [];
  for (const run of properRuns) {
    const words = run.trim().split(/\s+/);
    // Split the run into acronym singletons and title-case segments.
    const segments: string[][] = [];
    let buf: string[] = [];
    for (const w of words) {
      if (ACRONYM.test(w)) {
        if (buf.length) { segments.push(buf); buf = []; }
        segments.push([w]);
      } else buf.push(w);
    }
    if (buf.length) segments.push(buf);

    for (const seg of segments) {
      // A single capitalized stopword ("Who", "What") is sentence case, not a name.
      if (seg.length === 1 && STOPWORDS.has(seg[0].toLowerCase())) continue;
      const original = seg.join(" ");
      const n = normalizeTerm(original);
      if (!n || n.length < 2) continue;
      if (seg.length >= 2) addRequired(n, original, 0.9, "capitalized-run");
      else if (ACRONYM.test(seg[0])) addRequired(n, original, 0.75, "acronym");
      else if (isRareToken(n)) addRequired(n, original, 0.6, "capitalized-rare-token");
      else optional.add(n);
    }
  }

  // 5. Bare uppercase tickers.
  for (const tok of residue.split(/\s+/)) {
    const t = tok.replace(/[^A-Za-z$]/g, "");
    if (t.length >= 2 && TICKER_RE.test(t) && t === t.toUpperCase()) addRequired(normalizeTerm(t), t, 0.8, "ticker");
  }

  // 6a. LOWERCASE ENTITY RECOVERY — the fix for the capitalization hard gate.
  //     Adjacent rare tokens ("asher newton", "punita budhiraja") are a probable
  //     name even with no capital letters. They enter as MEDIUM confidence, so
  //     they gate softly instead of either vanishing or over-constraining.
  {
    const toks = normalizeTerm(residue).split(" ").filter(Boolean);
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const n = run.join(" ");
        if (!required.has(n)) addRequired(n, n, 0.55, "lowercase-rare-run");
      } else if (run.length === 1 && run[0].length >= 5) {
        const n = run[0];
        if (!required.has(n)) addRequired(n, n, 0.4, "lowercase-rare-token");
      }
      run = [];
    };
    for (const t of toks) {
      if (isRareToken(t)) run.push(t); else flush();
    }
    flush();
  }

  // 6b. RELATION LAYER — [subject] <relation phrase> [object]. Both sides are
  //     anchored as required, which is what makes "who is X at Y" work the same
  //     way as "did X work for Y" without hardcoding either.
  const relations: QueryRelation[] = [];
  for (const { re, kind } of RELATION_PHRASES) {
    const m = residue.match(re);
    if (!m || m.index === undefined) continue;
    const subjRaw = residue.slice(0, m.index).trim();
    const objRaw = residue.slice(m.index + m[0].length).trim();
    const pickSide = (side: string): string => {
      const toks = normalizeTerm(side).split(" ").filter((t) => t && !STOPWORDS.has(t));
      const rare = toks.filter(isRareToken);
      return (rare.length ? rare : toks).slice(-3).join(" ");
    };
    const subject = pickSide(subjRaw);
    const object = pickSide(objRaw);
    if (!subject || !object) continue;
    relations.push({ subject, relation: m[0].trim().toLowerCase(), objectKind: kind, object });
    addRequired(subject, subject, Math.max(0.7, confidence.get(subject)?.confidence ?? 0), "relation-subject");
    addRequired(object, object, Math.max(0.7, confidence.get(object)?.confidence ?? 0), "relation-object");
  }

  // 6. Everything else that survives stopword removal is optional context.
  for (const tok of normalizeTerm(residue).split(" ")) {
    if (!tok || tok.length < 3 || STOPWORDS.has(tok)) continue;
    if ([...required].some((r) => r.split(" ").includes(tok))) continue;
    optional.add(tok);
  }

  // 7b. Collapse redundant required terms — "cve" is already inside
  //     "cve 2024 3094"; keeping both double-counts the gate denominator.
  const reqList = [...required].sort((a, b) => b.length - a.length);
  const requiredFinal: string[] = [];
  for (const t of reqList) {
    if (requiredFinal.some((k) => k === t || k.includes(t))) continue;
    requiredFinal.push(t);
  }
  for (const t of [...optional]) {
    if (requiredFinal.some((k) => k.includes(t))) optional.delete(t);
  }

  // 7. Entity classification — drives per-engine eligibility upstream.
  //    A person is a multi-word, purely alphabetic name with no acronym token.
  const phraseNorms = new Set(phrases.map(normalizeTerm));
  const looksPersonal = requiredFinal.some((r) => {
    if (phraseNorms.has(r)) return false;
    const w = r.split(" ");
    return w.length >= 2 && w.length <= 4 && w.every((x) => /^[a-z]{2,}$/.test(x));
  });
  let entity: EntityKind = "general";
  if (cve) entity = "cve";
  else if (wallet) entity = "wallet";
  else if (ORG_SUFFIX.test(input)) entity = "organization";
  else if (domainHit) entity = "domain";
  else if (requiredFinal.some((r) => /^[a-z]{1,5}$/.test(r)) && /\b(stock|ticker|share|earnings|price)\b/i.test(input)) entity = "ticker";
  else if (PLACE_HINT.test(input)) entity = "place";
  else if (looksPersonal) entity = "person";

  // 8. Wire query: operator's ORIGINAL spelling. Multi-word required terms get
  //    quoted so SERPs treat them atomically instead of bag-of-words. The
  //    literal spans they cover are stripped from the remainder so the query
  //    is never doubled (a doubled query silently drifts recall).
  //    Flaw fixed: a SINGLE-word quoted phrase ("Harshit") was extracted into
  //    `phrases`, stripped from `rest`, and then skipped by the multi-word
  //    quoting pass — so the operator's hardest signal silently vanished from
  //    the wire. Explicit quotes are now always re-emitted verbatim.
  const multi = requiredFinal.filter((r) => r.includes(" "));
  const seenQuoted = new Set<string>();
  const quoted: string[] = [];
  for (const p of phrases) {
    const key = normalizeTerm(p);
    if (!key || seenQuoted.has(key)) continue;
    seenQuoted.add(key);
    quoted.push(`"${p}"`);
  }
  for (const r of multi) {
    if (seenQuoted.has(r)) continue;
    seenQuoted.add(r);
    quoted.push(`"${surfaceForm.get(r) || r}"`);
  }
  let rest = input
    .replace(OPERATOR_RE, " ")
    .replace(/"([^"]{2,120})"/g, " ")
    .replace(/(^|\s)-([A-Za-z0-9][\w.-]{1,40})/g, " ");
  for (const term of multi) {
    const pattern = term.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\-_.]+");
    rest = rest.replace(new RegExp(pattern, "gi"), " ");
  }
  rest = rest
    .split(/\s+/)
    // Uppercase OR is a boolean the SERP understands — the stopword filter used
    // to eat it and collapse `A OR B` into an implicit AND.
    .filter((w) => w && (w === "OR" || !STOPWORDS.has(w.toLowerCase().replace(/[^a-z0-9]/g, ""))))
    .join(" ")
    .replace(/^(OR\s+)+|(\s+OR)+$/g, "")
    .trim();
  let wireQuery = [...quoted, rest, ...operators].filter(Boolean).join(" ").trim() || input;

  // 9. SHAPE ROUTING — decided last, because it depends on everything above.
  const bareTokens = input.trim().split(/\s+/).filter(Boolean);
  // FORM/PATH is checked before the generic shapes but AFTER explicit dorks:
  // if the operator already wrote `ext:py`, they own the contract and we do not
  // second-guess it. Otherwise "the html python and typescript files" must
  // become extension+path matching, never a title match against those words.
  const formPath = operators.length === 0 ? detectFormPath(input) : null;
  let shape: QueryShape;
  if (operators.length > 0) shape = "operator-dork";
  else if (formPath) shape = "form-path";
  else if (bareTokens.length === 1) shape = "single-token";
  else if (relations.length > 0) shape = "relationship";
  else if (cve || wallet || email || (domainHit && bareTokens.length <= 3)) shape = "identifier";
  else if (requiredFinal.length === 0) shape = "topic";
  else if (/^(who|what|where|when|why|how|which|is|are|did|does|can)\b/i.test(input) || bareTokens.length >= 6) shape = "natural-question";
  else shape = "topic";

  // The derived operators go ON THE WIRE — a form/path plan that never emits
  // `ext:` is indistinguishable from the topic search it was meant to replace.
  if (formPath) {
    const derived = formPathOperators(formPath);
    for (const op of derived) if (!operators.includes(op)) operators.push(op);
    if (derived.length) wireQuery = `${wireQuery} ${derived.join(" ")}`.trim();
  }


  // A single bare word IS the query — gating it against itself adds nothing and
  // only penalises pages that paraphrase. Drop the gate, keep the term as
  // context so relevance still ranks on it.
  let requiredOut = requiredFinal;
  if (shape === "single-token") {
    for (const t of requiredFinal) optional.add(t);
    requiredOut = [];
  }
  // Under a dork string the operators ARE the constraint; word gating on top
  // of `site:` double-penalises pages the operator already selected.
  if (shape === "operator-dork") {
    requiredOut = requiredFinal.filter((t) => (confidence.get(t)?.confidence ?? 0) >= 0.9);
  }
  // FORM/PATH: the extension and the path segment ARE the gate. The words that
  // named the form ("html", "typescript", "files") describe the CONTAINER, not
  // the content, and gating on them is exactly the title-matching failure this
  // shape exists to kill. Demote them to context, keep every other selector.
  if (shape === "form-path" && formPath) {
    const formWords = new Set<string>([
      ...Object.keys(FORM_EXT),
      ...formPath.exts,
      "file", "files", "filetype", "extension", "extensions", "source", "code",
      "script", "scripts", "directory", "directories", "folder", "path", "paths",
      "indexed", "unindexed", "listing", "repo", "repository",
    ]);
    const kept: string[] = [];
    for (const t of requiredFinal) {
      const words = normalizeTerm(t).split(" ").filter(Boolean);
      if (words.length && words.every((w) => formWords.has(w))) { optional.add(t); continue; }
      kept.push(t);
    }
    requiredOut = kept;
  }


  // A span may have been captured with a leading/trailing function word — a
  // natural question such as "who is the CEO of Reuters" yielded the selector
  // "of reuters", which no page ever contains as written and which therefore
  // gated the correct answer out. Trim the carrier words; keep the selector.
  const CARRIER = new Set(["of", "the", "a", "an", "in", "at", "on", "for", "to", "by", "from", "with", "is", "are", "was", "were"]);
  const trimCarrier = (t: string): string => {
    let parts = t.split(/\s+/);
    while (parts.length > 1 && CARRIER.has(parts[0].toLowerCase())) parts = parts.slice(1);
    while (parts.length > 1 && CARRIER.has(parts[parts.length - 1].toLowerCase())) parts = parts.slice(0, -1);
    return parts.join(" ");
  };
  const trimmedSeen = new Set<string>();
  requiredOut = requiredOut
    .map((t) => {
      const trimmedTerm = trimCarrier(t);
      if (trimmedTerm !== t && confidence.has(t) && !confidence.has(trimmedTerm)) {
        confidence.set(trimmedTerm, confidence.get(t)!);
      }
      return trimmedTerm;
    })
    .filter((t) => {
      if (!t || CARRIER.has(t.toLowerCase()) || trimmedSeen.has(t)) return false;
      trimmedSeen.add(t);
      return true;
    });

  const requiredWeighted: WeightedTerm[] = requiredOut.map((t) => ({
    term: t,
    confidence: Math.max(0.3, Math.min(1, confidence.get(t)?.confidence ?? 0.7)),
    basis: confidence.get(t)?.basis ?? "derived",
  }));

  return {
    raw: input,
    required: requiredOut,
    requiredWeighted,
    optional: [...optional].filter((t) => !requiredOut.includes(t) || shape === "single-token"),
    negative,
    phrases,
    entity,
    shape,
    relations,
    scriptNote: detectScript(input)
      ? `Non-Latin script (${detectScript(input)}) detected — name/org detection is Latin-only, so entity gating falls back to relevance.`
      : undefined,
    operators,
    wireQuery,
    formPath: formPath ?? undefined,

  };

}

/** Relaxed re-issue string for the rescue pass: drop quoting + optional noise. */
export function relaxedQuery(plan: QueryPlan): string {
  const core = plan.required.length ? plan.required.join(" ") : plan.raw;
  return core.slice(0, 200);
}

// ── Variant matching ────────────────────────────────────────────────────────
/**
 * "asher shepherd newton" also matches "a shepherd newton", "asher s newton",
 * "asher newton", and hyphen/period spellings. Prevents the required-term
 * gate from deleting correct pages that abbreviate a middle name.
 */
function termVariants(term: string): string[] {
  const words = term.split(" ").filter(Boolean);
  if (words.length < 2) return [term];
  const out = new Set<string>([term]);
  // initials for any single interior word
  for (let i = 0; i < words.length; i++) {
    const v = words.map((w, j) => (j === i ? w[0] : w));
    out.add(v.join(" "));
  }
  // drop interior words (middle names)
  if (words.length >= 3) out.add(`${words[0]} ${words[words.length - 1]}`);
  // last, first
  out.add(`${words[words.length - 1]} ${words[0]}`);
  return [...out];
}

/**
 * Bounded edit-distance ≤1 (Levenshtein with early exit). OSINT input is full
 * of transliterations and breach-dump typos — "Shephard" must still match a
 * page spelled "Shepherd" instead of silently losing the whole page.
 */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; }
    else if (la > lb) i++;
    else j++;
  }
  if (i < la || j < lb) edits++;
  return edits <= 1;
}

/** Fuzzy containment: every word of `term` appears in `hay` within 1 edit. */
function fuzzyHit(hay: string, term: string): boolean {
  const words = term.split(" ").filter((w) => w.length >= 6);
  if (!words.length) return false;
  const hayWords = hay.split(" ");
  return words.every((w) => hayWords.some((h) => within1(h, w)));
}

function fieldHit(hay: string, term: string): boolean {
  if (termVariants(term).some((v) => hay.includes(v))) return true;
  return fuzzyHit(hay, term);
}

export interface RelevanceInput {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Stage 3a — topical relevance, 0..1. Title outweighs URL outweighs snippet.
 *
 * Requirement is a SPECTRUM, not a switch: each required term carries a
 * confidence, coverage is confidence-weighted, and the gate hardens in
 * proportion to how sure we are the term is a real selector. A low-confidence
 * lowercase name therefore nudges ranking instead of annihilating every page
 * that spells it differently.
 */
export function scoreRelevance(plan: QueryPlan, doc: RelevanceInput): number {
  const title = normalizeTerm(doc.title || "");
  const url = normalizeTerm(doc.url || "");
  const snippet = normalizeTerm(doc.snippet || "");
  const all = `${title} ${url} ${snippet}`;

  if (plan.negative.some((n) => n && all.includes(n))) return 0.05;

  const weighted = plan.requiredWeighted?.length
    ? plan.requiredWeighted
    : plan.required.map((term) => ({ term, confidence: 1, basis: "legacy" }));

  // Confidence-weighted required coverage, scaled by the strongest field hit.
  let confHit = 0, confTotal = 0, covered = 0, fieldWeight = 0;
  for (const { term, confidence: conf } of weighted) {
    if (!term) continue;
    confTotal += conf;
    let fw = 0;
    if (fieldHit(title, term)) fw = 1.0;
    else if (fieldHit(url, term)) fw = 0.8;
    else if (fieldHit(snippet, term)) fw = 0.6;
    if (fw > 0) { covered++; fieldWeight += fw; confHit += conf; }
  }
  const reqCount = weighted.length;
  const coverage = confTotal ? confHit / confTotal : 1;
  const fieldQuality = covered ? fieldWeight / covered : 0.7;
  const avgConf = reqCount ? confTotal / reqCount : 0;

  // Optional context — capped contribution.
  let optHits = 0;
  for (const t of plan.optional) if (t && all.includes(t)) optHits++;
  const optScore = plan.optional.length ? Math.min(1, optHits / plan.optional.length) : 0;

  // Exact phrase bonus.
  let phraseBonus = 0;
  for (const p of plan.phrases) {
    const n = normalizeTerm(p);
    if (n && all.includes(n)) phraseBonus += 0.12;
  }

  // Relationship queries reward BOTH sides landing on the same page.
  let relationBonus = 0;
  for (const rel of plan.relations || []) {
    if (all.includes(rel.subject) && all.includes(rel.object)) relationBonus += 0.1;
  }

  // Proximity: two required terms close together in title/snippet.
  let proximity = 0;
  if (reqCount >= 2) {
    const idx = weighted
      .map(({ term }) => termVariants(term).map((v) => all.indexOf(v)).filter((i) => i >= 0)[0])
      .filter((i): i is number => typeof i === "number" && i >= 0)
      .sort((a, b) => a - b);
    if (idx.length >= 2 && idx[idx.length - 1] - idx[0] < 120) proximity = 0.08;
  }

  // Gate hardness tracks confidence: 1.0-confidence miss floors at 0.25,
  // a 0.5-confidence miss only floors at ~0.62.
  const gate = reqCount ? 1 - avgConf * 0.75 * (1 - coverage) : 1;
  const base = 0.62 * coverage * fieldQuality + 0.22 * optScore + phraseBonus + proximity + relationBonus;

  return Math.max(0.02, Math.min(1, base * gate + (reqCount ? 0 : 0.35)));
}

// ── Engine independence classes ─────────────────────────────────────────────
// Most "different" engines resell one index. Corroborating on raw engine count
// counts the same crawl up to five times.
const ENGINE_CLASS: Record<string, string> = {
  firecrawl: "google-derived",
  searxng: "google-derived",
  brave: "brave-index",
  ddg: "bing-derived",
  metager: "bing-derived",
  gigablast: "bing-derived",
  mojeek: "independent-crawl",
  yandex: "independent-crawl",
  "common-crawl": "independent-crawl",
  wayback: "archive",
  wikipedia: "curated",
  "google-books": "curated",
  github: "primary-record",
  "sec-edgar": "primary-record",
  crossref: "primary-record",
  openalex: "primary-record",
  blockchair: "primary-record",
  hibp: "primary-record",
  shodan: "primary-record",
  "nvd-cve": "primary-record",
  hackernews: "social",
  reddit: "social",
  ahmia: "dark",
};

export function engineClass(engine?: string): string {
  return ENGINE_CLASS[(engine || "").toLowerCase()] || "other";
}

/** Distinct-class corroboration bonus, capped at +0.15 on the credibility axis. */
export function corroborationBonus(engines: string[] | undefined): number {
  if (!engines || engines.length < 2) return 0;
  const classes = new Set(engines.map(engineClass));
  return Math.min(0.15, (classes.size - 1) * 0.05);
}

/**
 * Stage 3b — final ordering score. Weighted sum, credibility floored at 0.5 so
 * no source is annihilated and no list collapses into ties.
 */
export function finalScore(opts: {
  relevance: number;
  veracity: number;
  engines?: string[];
  hostile?: boolean;
}): number {
  const credibility = Math.max(0.5, Math.min(1, opts.veracity / 100)) + corroborationBonus(opts.engines);
  const raw = 0.65 * opts.relevance + 0.35 * Math.min(1, credibility);
  return Math.round((opts.hostile ? raw * 0.35 : raw) * 1000) / 1000;
}
