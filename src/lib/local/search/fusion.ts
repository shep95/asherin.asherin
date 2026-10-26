/**
 * ZOPHIEL FUSION — the single deterministic analysis layer for a result corpus.
 * ---------------------------------------------------------------------------
 * Before this module Zophiel extracted entities TWICE: an inline regex pass in
 * `zophiel-search` and the identity resolver in `serpEntityEngine`. Two code
 * paths, two output shapes, and corroboration counts that reset whenever the
 * operator switched panels. This module is the merge point: `serpEntityEngine`
 * is now the ONLY extractor, and everything derived from a corpus — data-type
 * classification, graph centrality, story clustering, per-CLAIM veracity,
 * contradiction detection and numeric anomaly scoring — is computed here, once.
 *
 * Hard constraints:
 *  - No model calls. Every field below is reproducible from the corpus text,
 *    which is what makes the output auditable instead of merely plausible.
 *  - Every claim, contradiction and anomaly carries the URLs that produced it.
 *  - All regexes bounded; all inputs length-capped before matching.
 */

import { buildSerpIntel, type SerpDoc, type SerpIntel, type Entity } from "./serpEntityEngine";
import { engineClass } from "./queryPlan";

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface FusionDoc {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  tier: number;
  engine?: string;
  engines?: string[];
  layer?: string;
  onion?: boolean;
  publishDate?: string;
  body?: string;
}

// ── Data typing ────────────────────────────────────────────────────────────

export type DataType =
  | "social-profile" | "filing" | "infra-record" | "breach-record"
  | "darkweb-listing" | "academic" | "code" | "news" | "reference"
  | "archive" | "commercial-broker" | "web";

const ENGINE_DATATYPE: Record<string, DataType> = {
  "sec-edgar": "filing",
  shodan: "infra-record",
  hibp: "breach-record",
  "nvd-cve": "infra-record",
  blockchair: "infra-record",
  github: "code",
  crossref: "academic",
  openalex: "academic",
  arxiv: "academic",
  wayback: "archive",
  "common-crawl": "archive",
  wikipedia: "reference",
  "google-books": "reference",
  ahmia: "darkweb-listing",
  reddit: "social-profile",
  hackernews: "social-profile",
};

const DOMAIN_DATATYPE: { re: RegExp; type: DataType }[] = [
  { re: /(linkedin|twitter|x\.com|facebook|instagram|tiktok|mastodon|bsky|threads|vk\.com|telegram|youtube)/i, type: "social-profile" },
  { re: /(sec\.gov|companieshouse|opencorporates|sunbiz|justia|courtlistener|pacer|unicourt|edgar)/i, type: "filing" },
  { re: /(shodan|censys|zoomeye|virustotal|urlscan|abuseipdb|bgp\.he\.net)/i, type: "infra-record" },
  { re: /(haveibeenpwned|dehashed|leakcheck|snusbase|breachdirectory|intelx|leak-lookup)/i, type: "breach-record" },
  { re: /\.onion/i, type: "darkweb-listing" },
  { re: /(whitepages|spokeo|beenverified|truepeoplesearch|radaris|intelius|peoplefinders|thatsthem|fastbackgroundcheck)/i, type: "commercial-broker" },
  { re: /(github|gitlab|bitbucket|npmjs|pypi|stackoverflow)/i, type: "code" },
  { re: /(arxiv|doi\.org|springer|elsevier|jstor|pubmed|ncbi|nature|science\.org)/i, type: "academic" },
  { re: /(reuters|apnews|bloomberg|nytimes|washingtonpost|bbc|cnn|guardian|npr|politico|ft\.com|wsj)/i, type: "news" },
  { re: /(wikipedia|britannica|wikidata)/i, type: "reference" },
  { re: /(web\.archive\.org|archive\.org|commoncrawl)/i, type: "archive" },
];

export function classifyDataType(doc: FusionDoc): DataType {
  if (doc.onion) return "darkweb-listing";
  const byEngine = doc.engine ? ENGINE_DATATYPE[doc.engine.toLowerCase()] : undefined;
  if (byEngine) return byEngine;
  const hay = `${doc.domain} ${doc.url}`;
  for (const { re, type } of DOMAIN_DATATYPE) if (re.test(hay)) return type;
  return "web";
}

// ── Story clustering ───────────────────────────────────────────────────────

export interface StoryCluster {
  id: string;
  /** Longest, most-corroborated title in the cluster — the story's headline. */
  label: string;
  size: number;
  urls: string[];
  domains: string[];
  /** Distinct engine-independence classes backing the cluster. */
  independence: number;
  /** Terms shared by every member — what the cluster is actually about. */
  sharedTerms: string[];
}

const CLUSTER_STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "you", "your", "are", "was", "how", "what",
  "who", "why", "new", "his", "her", "its", "has", "have", "will", "not", "but", "about", "into",
]);

function contentTokens(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !CLUSTER_STOP.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Groups the corpus by underlying STORY rather than by category bucket. With 22
 * sources covering one event, a flat ranked list shows the same story fourteen
 * times; a cluster shows it once with its spread of sources attached.
 */
export function clusterStories(docs: FusionDoc[], threshold = 0.34): StoryCluster[] {
  const sigs = docs.map((d) => new Set(contentTokens(`${d.title} ${d.snippet.slice(0, 240)}`)));
  const assigned = new Array(docs.length).fill(-1);
  const groups: number[][] = [];

  for (let i = 0; i < docs.length; i++) {
    if (assigned[i] !== -1) continue;
    const g = [i];
    assigned[i] = groups.length;
    for (let j = i + 1; j < docs.length; j++) {
      if (assigned[j] !== -1) continue;
      if (jaccard(sigs[i], sigs[j]) >= threshold) { g.push(j); assigned[j] = groups.length; }
    }
    groups.push(g);
  }

  return groups
    .map((g, idx) => {
      const members = g.map((i) => docs[i]);
      const shared = g.length > 1
        ? [...g.map((i) => sigs[i]).reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))))].slice(0, 8)
        : [...sigs[g[0]]].slice(0, 8);
      const classes = new Set(
        members.flatMap((m) => (m.engines?.length ? m.engines : [m.engine || ""])).map(engineClass),
      );
      return {
        id: `cluster-${idx + 1}`,
        label: members.slice().sort((a, b) => b.title.length - a.title.length)[0]?.title?.slice(0, 160) || "(untitled)",
        size: members.length,
        urls: members.map((m) => m.url).slice(0, 40),
        domains: [...new Set(members.map((m) => m.domain))],
        independence: classes.size,
        sharedTerms: shared,
      };
    })
    .sort((a, b) => b.size - a.size || b.independence - a.independence);
}

// ── Graph centrality ───────────────────────────────────────────────────────

export interface CentralityNode {
  id: string;
  label: string;
  kind: string;
  /** PageRank over the co-occurrence graph — who is load-bearing, not just frequent. */
  pagerank: number;
  degree: number;
}

/**
 * Weighted PageRank, 20 power iterations, damping 0.85. Deterministic and
 * O(iterations × edges) — cheap enough to run inline on every search.
 */
export function computeCentrality(
  entities: { id: string; label: string; kind: string }[],
  edges: { from: string; to: string; weight: number }[],
  iterations = 20,
  damping = 0.85,
): CentralityNode[] {
  const ids = entities.map((e) => e.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  if (n === 0) return [];

  const outWeight = new Array(n).fill(0);
  const degree = new Array(n).fill(0);
  const adj: { to: number; w: number }[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    const a = index.get(e.from), b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const w = Math.max(1, e.weight);
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
    outWeight[a] += w; outWeight[b] += w;
    degree[a]++; degree[b]++;
  }

  let rank = new Array(n).fill(1 / n);
  for (let it = 0; it < iterations; it++) {
    const next = new Array(n).fill((1 - damping) / n);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (outWeight[i] === 0) { dangling += rank[i]; continue; }
      for (const { to, w } of adj[i]) next[to] += damping * rank[i] * (w / outWeight[i]);
    }
    if (dangling > 0) for (let i = 0; i < n; i++) next[i] += damping * dangling / n;
    rank = next;
  }

  return entities
    .map((e, i) => ({
      id: e.id,
      label: e.label,
      kind: e.kind,
      pagerank: Math.round(rank[i] * 10000) / 10000,
      degree: degree[i],
    }))
    .sort((a, b) => b.pagerank - a.pagerank);
}

// ── Per-claim veracity ─────────────────────────────────────────────────────

export interface Claim {
  /** The sentence as written, trimmed. */
  text: string;
  /** Normalised comparison key: subject + predicate + value. */
  key: string;
  subject: string;
  /** Numeric or date value asserted, when the claim carries one. */
  value?: string;
  valueKind?: "number" | "money" | "date" | "percent";
  sources: string[];
  domains: string[];
  /** Distinct engine-independence classes asserting THIS claim (not the page). */
  independence: number;
  /** Best (lowest) source tier asserting the claim. */
  bestTier: number;
  /** 0..100 — corroboration × independence × tier, computed per claim. */
  veracity: number;
}

export interface Contradiction {
  subject: string;
  valueKind: string;
  /** Two mutually incompatible assertions, each with its own backing. */
  sides: { value: string; text: string; sources: string[]; bestTier: number }[];
  severity: "high" | "medium";
  reason: string;
}

const VALUE_RE = {
  money: /(?:\$|usd\s?|€|£)\s?([\d,]+(?:\.\d+)?)(\s?(?:million|billion|bn|m|k))?/i,
  percent: /\b(\d{1,3}(?:\.\d+)?)\s?%/,
  date: /\b((?:19|20)\d{2})(?:-(\d{2})-(\d{2}))?\b/,
  number: /\b(\d{2,}(?:,\d{3})*(?:\.\d+)?)\b/,
};

const CLAIM_STOP = /^(cookie|privacy|terms|sign in|log in|subscribe|read more|advertisement)/i;

function sentences(text: string): string[] {
  return (text || "")
    .slice(0, 4000)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 40 && s.length <= 320 && !CLAIM_STOP.test(s));
}

function claimSubject(sentence: string, entityLabels: string[]): string {
  const low = sentence.toLowerCase();
  for (const label of entityLabels) {
    if (label.length >= 4 && low.includes(label.toLowerCase())) return label.toLowerCase();
  }
  return contentTokens(sentence).slice(0, 3).join(" ");
}

function extractValue(sentence: string): { value: string; kind: Claim["valueKind"] } | null {
  const money = sentence.match(VALUE_RE.money);
  if (money) return { value: `${money[1].replace(/,/g, "")}${money[2] ? money[2].trim().toLowerCase() : ""}`, kind: "money" };
  const pct = sentence.match(VALUE_RE.percent);
  if (pct) return { value: pct[1], kind: "percent" };
  const date = sentence.match(VALUE_RE.date);
  if (date) return { value: date[0], kind: "date" };
  const num = sentence.match(VALUE_RE.number);
  if (num) return { value: num[1].replace(/,/g, ""), kind: "number" };
  return null;
}

/**
 * Per-CLAIM veracity. The old score was per DOCUMENT: a tier-1 page made every
 * sentence on it trustworthy. Here each discrete assertion is scored by how
 * many INDEPENDENT-CLASS engines carry that specific assertion.
 */
export function extractClaims(docs: FusionDoc[], entityLabels: string[], limit = 40): Claim[] {
  const byKey = new Map<string, Claim & { engineSet: Set<string> }>();

  for (const d of docs) {
    const text = `${d.title}. ${d.body ? d.body.slice(0, 3000) : d.snippet}`;
    for (const s of sentences(text)) {
      const subject = claimSubject(s, entityLabels);
      if (!subject) continue;
      const v = extractValue(s);
      const predicate = contentTokens(s).filter((t) => t !== subject).slice(0, 4).join(" ");
      const key = `${subject}|${predicate}|${v?.value ?? ""}`;
      const engines = (d.engines?.length ? d.engines : [d.engine || ""]).map(engineClass);

      const prev = byKey.get(key);
      if (prev) {
        if (!prev.sources.includes(d.url) && prev.sources.length < 12) prev.sources.push(d.url);
        if (!prev.domains.includes(d.domain)) prev.domains.push(d.domain);
        prev.bestTier = Math.min(prev.bestTier, d.tier);
        for (const c of engines) prev.engineSet.add(c);
      } else {
        byKey.set(key, {
          text: s,
          key,
          subject,
          value: v?.value,
          valueKind: v?.kind,
          sources: [d.url],
          domains: [d.domain],
          independence: 0,
          bestTier: d.tier,
          veracity: 0,
          engineSet: new Set(engines),
        });
      }
    }
  }

  const claims: Claim[] = [];
  for (const c of byKey.values()) {
    const independence = c.engineSet.size;
    // corroboration: distinct DOMAINS (a syndicated wire story is one source)
    const corroboration = c.domains.length;
    const tierFactor = 1 - (Math.min(5, Math.max(1, c.bestTier)) - 1) * 0.14; // t1=1.00 … t5=0.44
    const corrFactor = Math.min(1, 0.35 + 0.22 * (corroboration - 1));
    const indFactor = Math.min(1, 0.6 + 0.2 * (independence - 1));
    claims.push({
      text: c.text,
      key: c.key,
      subject: c.subject,
      value: c.value,
      valueKind: c.valueKind,
      sources: c.sources,
      domains: c.domains,
      independence,
      bestTier: c.bestTier,
      veracity: Math.round(100 * tierFactor * corrFactor * indFactor),
    });
  }

  return claims
    .sort((a, b) => b.domains.length - a.domains.length || b.veracity - a.veracity)
    .slice(0, limit);
}

/**
 * Source disagreement, promoted to a first-class always-on signal: two claims
 * about the SAME subject asserting incompatible values of the same kind.
 */
export function detectContradictions(claims: Claim[]): Contradiction[] {
  const bySubject = new Map<string, Claim[]>();
  for (const c of claims) {
    if (!c.value || !c.valueKind) continue;
    const k = `${c.subject}|${c.valueKind}`;
    const arr = bySubject.get(k) || [];
    arr.push(c);
    bySubject.set(k, arr);
  }

  const out: Contradiction[] = [];
  for (const [k, arr] of bySubject) {
    const [subject, valueKind] = k.split("|");
    const distinct = new Map<string, Claim>();
    for (const c of arr) if (!distinct.has(c.value!)) distinct.set(c.value!, c);
    if (distinct.size < 2) continue;

    const sides = [...distinct.values()]
      .sort((a, b) => a.bestTier - b.bestTier)
      .slice(0, 3)
      .map((c) => ({ value: c.value!, text: c.text, sources: c.sources.slice(0, 4), bestTier: c.bestTier }));

    // Numeric values within 2% of each other are rounding, not disagreement.
    if (valueKind !== "date") {
      const nums = sides.map((s) => Number(s.value)).filter((n) => Number.isFinite(n));
      if (nums.length === sides.length) {
        const min = Math.min(...nums), max = Math.max(...nums);
        if (min > 0 && (max - min) / max < 0.02) continue;
      }
    }

    const bothHighTier = sides.filter((s) => s.bestTier <= 2).length >= 2;
    out.push({
      subject,
      valueKind,
      sides,
      severity: bothHighTier ? "high" : "medium",
      reason: bothHighTier
        ? "Two independent high-tier sources assert incompatible values for the same fact."
        : "Sources disagree; at least one side is below tier 2.",
    });
  }

  return out.sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1)).slice(0, 20);
}

// ── Numeric anomaly / forensic layer ───────────────────────────────────────

export interface AnomalyReport {
  /** Benford first-digit conformity over every number scraped from the corpus. */
  benford: {
    sampleSize: number;
    /** Chi-square statistic against Benford's expected distribution. */
    chiSquare: number;
    /** 15.51 = chi-square critical value, 8 df, p=0.05. */
    conforms: boolean | null;
    observed: number[];
    expected: number[];
    note: string;
  };
  /** Values > 3 median-absolute-deviations from the corpus median. */
  outliers: { value: number; sources: string[]; zRobust: number; context: string }[];
  /** Dates asserted in the future or implausibly old for the corpus. */
  temporalAnomalies: { value: string; source: string; reason: string }[];
}

const BENFORD_EXPECTED = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];

export function analyzeAnomalies(docs: FusionDoc[], claims: Claim[]): AnomalyReport {
  // ── Benford: first significant digit of every MEASURED number in the corpus.
  // Identifiers are not measurements: DOIs, CIK numbers, docket ids, version
  // strings and URL fragments are assigned sequentially, so feeding them to
  // Benford produces a guaranteed "fabricated" verdict on any academic or
  // filings-heavy corpus. They are excluded before the test, and an
  // identifier-dominated corpus returns no verdict at all rather than a wrong one.
  const digits = new Array(9).fill(0);
  let sample = 0;
  const identifierHeavy = docs.length > 0 &&
    docs.filter((d) => /doi\.org|arxiv|sec\.gov|pubmed|ncbi|crossref|openalex|\/cgi-bin\/browse-edgar/i.test(d.url)).length / docs.length > 0.5;

  for (const d of docs) {
    const text = `${d.title} ${d.snippet}`
      .slice(0, 4000)
      .replace(/https?:\/\/\S+/g, " ")     // URL-borne digits are addresses, not data
      .replace(/\b10\.\d{4,9}\/\S+/g, " ") // bare DOIs
      .replace(/\b(?:CIK|CVE|ISBN|ISSN|DOI|No\.?|#)\s*[:-]?\s*[\d.-]+/gi, " ");
    let perDoc = 0;
    for (const m of text.match(/\b\d[\d,]{1,15}(?:\.\d+)?\b/g) || []) {
      const clean = m.replace(/,/g, "");
      const n = Number(clean);
      if (!Number.isFinite(n) || n < 10) continue;
      // Years are structurally non-Benford; excluding them prevents a false flag.
      if (/^(19|20)\d{2}$/.test(clean)) continue;
      // Long unpunctuated digit runs are almost always identifiers.
      if (/^\d{9,}$/.test(clean.split(".")[0])) continue;
      const first = Number(clean.replace(/^0+/, "")[0]);
      if (first >= 1 && first <= 9) { digits[first - 1]++; sample++; perDoc++; }
      // No single document may dominate the distribution.
      if (perDoc >= 40 || sample >= 3000) break;
    }
  }


  let chi = 0;
  const testable = sample >= 120 && !identifierHeavy;
  const observed = digits.map((c) => (sample ? Math.round((c / sample) * 1000) / 1000 : 0));
  if (testable) {
    for (let i = 0; i < 9; i++) {
      const exp = BENFORD_EXPECTED[i] * sample;
      chi += ((digits[i] - exp) ** 2) / exp;
    }
  }
  const conforms = testable ? chi <= 15.51 : null;

  // ── Robust outliers on numeric claim values (median absolute deviation).
  const numeric = claims
    .filter((c) => (c.valueKind === "number" || c.valueKind === "money" || c.valueKind === "percent") && c.value)
    .map((c) => ({ n: Number(c.value), c }))
    .filter((x) => Number.isFinite(x.n) && x.n !== 0);

  const outliers: AnomalyReport["outliers"] = [];
  if (numeric.length >= 6) {
    const vals = numeric.map((x) => x.n).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    const devs = vals.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = devs[Math.floor(devs.length / 2)] || 1;
    for (const { n, c } of numeric) {
      const z = Math.abs(n - median) / (1.4826 * mad);
      if (z > 3.5) {
        outliers.push({
          value: n,
          sources: c.sources.slice(0, 3),
          zRobust: Math.round(z * 10) / 10,
          context: c.text.slice(0, 160),
        });
      }
    }
    outliers.sort((a, b) => b.zRobust - a.zRobust);
  }

  // ── Temporal impossibility.
  const nowYear = new Date().getUTCFullYear();
  const temporalAnomalies: AnomalyReport["temporalAnomalies"] = [];
  for (const c of claims) {
    if (c.valueKind !== "date" || !c.value) continue;
    const year = Number(String(c.value).slice(0, 4));
    if (!Number.isFinite(year)) continue;
    if (year > nowYear + 1) {
      temporalAnomalies.push({ value: c.value, source: c.sources[0], reason: `Asserted date is ${year - nowYear} years in the future.` });
    } else if (year < 1900) {
      temporalAnomalies.push({ value: c.value, source: c.sources[0], reason: "Asserted date predates 1900 — likely a parse artefact." });
    }
  }

  return {
    benford: {
      sampleSize: sample,
      chiSquare: Math.round(chi * 100) / 100,
      conforms,
      observed,
      expected: BENFORD_EXPECTED,
      note: identifierHeavy
        ? "No verdict: this corpus is dominated by identifier-bearing sources (DOIs, filings), whose numbers are assigned rather than measured."
        : sample < 120
          ? `Sample too small for a Benford verdict (${sample} usable numbers, need ≥120).`
          : conforms
            ? "First-digit distribution is consistent with naturally occurring figures."
            : "First-digit distribution deviates from Benford — figures in this corpus may be fabricated, rounded, or machine-generated.",
    },
    outliers: outliers.slice(0, 12),
    temporalAnomalies: temporalAnomalies.slice(0, 12),
  };
}

// ── Ranking-quality telemetry ──────────────────────────────────────────────

export interface RankingQuality {
  engineHitRate: Record<string, number>;
  independenceClasses: Record<string, number>;
  tierDistribution: Record<string, number>;
  dataTypeDistribution: Record<string, number>;
  avgRelevance: number;
  avgVeracity: number;
  /** Share of results whose relevance cleared 0.5 — the real "did it work" number. */
  onTargetRate: number;
}

export function computeRankingQuality(
  docs: (FusionDoc & { relevance?: number; veracity?: number; dataType?: DataType })[],
): RankingQuality {
  const engineHitRate: Record<string, number> = {};
  const independenceClasses: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};
  const dataTypeDistribution: Record<string, number> = {};
  let rel = 0, ver = 0, onTarget = 0;

  for (const d of docs) {
    const eng = d.engine || "unknown";
    engineHitRate[eng] = (engineHitRate[eng] || 0) + 1;
    independenceClasses[engineClass(eng)] = (independenceClasses[engineClass(eng)] || 0) + 1;
    tierDistribution[`tier${d.tier}`] = (tierDistribution[`tier${d.tier}`] || 0) + 1;
    const dt = d.dataType || classifyDataType(d);
    dataTypeDistribution[dt] = (dataTypeDistribution[dt] || 0) + 1;
    rel += d.relevance ?? 0;
    ver += d.veracity ?? 0;
    if ((d.relevance ?? 0) >= 0.5) onTarget++;
  }

  const n = Math.max(1, docs.length);
  return {
    engineHitRate,
    independenceClasses,
    tierDistribution,
    dataTypeDistribution,
    avgRelevance: Math.round((rel / n) * 1000) / 1000,
    avgVeracity: Math.round(ver / n),
    onTargetRate: Math.round((onTarget / n) * 100) / 100,
  };
}

// ── Top-level fusion ───────────────────────────────────────────────────────

export interface FusionResult {
  intel: SerpIntel;
  centrality: CentralityNode[];
  clusters: StoryCluster[];
  claims: Claim[];
  contradictions: Contradiction[];
  anomalies: AnomalyReport;
  dataTypes: Record<string, DataType>;
}

/** One pass over the corpus produces every deterministic analysis Zophiel has. */
export function fuseCorpus(query: string, docs: FusionDoc[]): FusionResult {
  const serpDocs: SerpDoc[] = docs.map((d) => ({
    url: d.url,
    title: d.title,
    snippet: d.snippet,
    body: d.body,
    domain: d.domain,
    snippetOnly: !d.body,
  }));

  const intel = buildSerpIntel(query, serpDocs);
  const centrality = computeCentrality(
    intel.entities.map((e: Entity) => ({ id: e.id, label: e.label, kind: e.kind })),
    intel.edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight })),
  );
  const entityLabels = intel.entities
    .filter((e) => e.confidence >= 0.4)
    .slice(0, 60)
    .map((e) => e.label);

  const claims = extractClaims(docs, entityLabels);
  const contradictions = detectContradictions(claims);
  const anomalies = analyzeAnomalies(docs, claims);
  const clusters = clusterStories(docs);

  const dataTypes: Record<string, DataType> = {};
  for (const d of docs) dataTypes[d.url] = classifyDataType(d);

  return { intel, centrality, clusters, claims, contradictions, anomalies, dataTypes };
}
