/**
 * Deterministic Intel Graph Builder (NO AI)
 * ------------------------------------------
 * Pure client-side algorithm that derives nodes + edges from a list of
 * SearchResult objects. Uses entity extraction (regex + dictionaries),
 * TF-IDF topic ranking, and co-occurrence linking.
 *
 * Output shape matches what the legacy zophiel-intelmap edge function returned
 * so the rest of IntelMapPanel renders identically.
 */

import type { SearchResult } from "../types";

export interface IntelNode {
  id: string;
  label: string;
  type: "source" | "person" | "organization" | "location" | "topic" | "event";
  tier?: number;
  tierLabel?: string;
  url?: string;
  domain?: string;
  mentions?: number;
  context?: string;
}

export interface IntelEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","in","on","at","to","for","with","by","from",
  "as","is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","can","this","that","these",
  "those","it","its","their","they","them","we","our","you","your","he","she","his",
  "her","not","no","yes","if","then","than","so","also","more","most","some","any",
  "all","one","two","three","new","said","says","say","over","into","about","after",
  "before","other","such","only","very","just","like","up","down","out","off","via",
  "per","amid","while","because","due","made","make","makes","get","gets","got",
  "use","used","using","including","included","based","first","last","next","still",
  "now","today","year","years","day","days","time","times","week","weeks","month",
  "months","report","reports","reported","reportedly","according","including","via",
]);

const ORG_SUFFIXES = /\b(Inc\.?|Corp\.?|Corporation|Co\.?|LLC|Ltd\.?|Limited|PLC|GmbH|AG|SA|Holdings|Group|Foundation|Institute|University|College|School|Agency|Department|Ministry|Bureau|Bank|Capital|Partners|Ventures|Labs?|Studios?|Media|News|Times|Post|Tribune|Journal|Press|Network|Systems?|Technologies|Tech|Software)\b/;

const KNOWN_ORGS = new Set([
  "FBI","CIA","NSA","DOJ","DOD","DHS","IRS","SEC","FTC","FDA","FCC","EPA","NASA",
  "NATO","UN","EU","WHO","IMF","WTO","OPEC","ASEAN","BRICS","G7","G20",
  "Google","Apple","Microsoft","Amazon","Meta","OpenAI","Anthropic","Nvidia",
  "Tesla","SpaceX","Boeing","Lockheed","Raytheon","Palantir",
  "Pentagon","Kremlin","Whitehouse","Congress","Senate","Parliament",
  "BBC","CNN","Reuters","Bloomberg","AP","AFP","Xinhua","RT",
]);

const KNOWN_LOCATIONS = new Set([
  "United States","USA","America","Washington","New York","California","Texas",
  "Florida","Los Angeles","San Francisco","Chicago","Boston",
  "United Kingdom","UK","Britain","England","London","Scotland",
  "Russia","Moscow","Ukraine","Kyiv","Kiev","China","Beijing","Shanghai",
  "Japan","Tokyo","India","Delhi","Mumbai","Germany","Berlin","France","Paris",
  "Italy","Rome","Spain","Madrid","Israel","Tel Aviv","Jerusalem","Gaza",
  "Iran","Tehran","Iraq","Baghdad","Syria","Damascus","Saudi Arabia","Riyadh",
  "Turkey","Istanbul","Ankara","Egypt","Cairo","Pakistan","Afghanistan","Kabul",
  "North Korea","South Korea","Seoul","Pyongyang","Taiwan","Taipei",
  "Brazil","Mexico","Canada","Toronto","Australia","Sydney",
  "Europe","Asia","Africa","Middle East",
]);

const EVENT_TRIGGERS = /\b(election|war|conflict|attack|strike|summit|treaty|agreement|deal|launch|breach|hack|leak|scandal|crisis|protest|invasion|crash|recall|merger|acquisition|ipo|verdict|ruling|hearing|sanction|sanctions)\b/i;

function cleanText(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function domainOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

/** Extract capitalized multi-word phrases (Title Case). */
function extractProperNouns(text: string): string[] {
  const out: string[] = [];
  const rx = /\b([A-Z][a-zA-Z'’-]+(?:\s+(?:of|and|de|la|von|van|the)\s+|\s+)){0,3}[A-Z][a-zA-Z'’-]+\b/g;
  const m = text.match(rx);
  if (m) for (const w of m) {
    const trimmed = w.trim();
    // skip single short or sentence-starts that are common words
    if (trimmed.length < 3) continue;
    if (/^(The|This|That|These|Those|A|An|In|On|At|For|By|With|From|And|Or|But|So|If|When|While|After|Before|During|Because|However|Although|Despite|Said|Says|According)\b/i.test(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

function classifyEntity(name: string): "person" | "organization" | "location" | null {
  const n = name.trim();
  if (KNOWN_LOCATIONS.has(n)) return "location";
  if (KNOWN_ORGS.has(n)) return "organization";
  if (ORG_SUFFIXES.test(n)) return "organization";
  // ALL-CAPS short string → acronym → org
  if (/^[A-Z]{2,6}$/.test(n)) return "organization";
  // Two or three Title Case words, no org suffix → person
  const words = n.split(/\s+/);
  if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][a-z'’-]+$/.test(w))) {
    return "person";
  }
  return null;
}

interface EntityHit { id: string; type: IntelNode["type"]; label: string; sourceIdx: number; }

export interface BuildIntelGraphResult {
  nodes: IntelNode[];
  edges: IntelEdge[];
  topics: string[];
}

/**
 * Build the full intel graph from a list of SearchResults.
 * Pure, deterministic, no network calls.
 */
export function buildIntelGraph(results: SearchResult[]): BuildIntelGraphResult {
  const sourceNodes: IntelNode[] = [];
  const entityMap = new Map<string, IntelNode>(); // id → node
  const entitySources = new Map<string, Set<number>>(); // entity id → set of source idxs
  const sourceEntities = new Map<number, Set<string>>(); // source idx → set of entity ids
  const edges: IntelEdge[] = [];
  const hits: EntityHit[] = [];

  // === Pass 1: source nodes + entity extraction ===
  results.forEach((r, idx) => {
    const title = cleanText(r.title);
    const snippet = cleanText(r.snippet);
    const text = `${title}. ${snippet}`;
    const dom = domainOf(r.url);
    const sId = `s_${idx}`;
    sourceNodes.push({
      id: sId,
      label: title || dom || `Source ${idx + 1}`,
      type: "source",
      url: r.url,
      domain: dom,
      tier: r.tier,
      tierLabel: r.tierLabel,
      context: snippet.slice(0, 240),
      mentions: 1,
    });
    sourceEntities.set(idx, new Set());

    // Proper nouns → person / org / location
    const seenLocal = new Set<string>();
    for (const raw of extractProperNouns(text)) {
      const name = raw.replace(/[.,;:!?]+$/, "").trim();
      if (name.length < 3) continue;
      const cls = classifyEntity(name);
      if (!cls) continue;
      const key = `${cls[0]}_${slug(name)}`;
      if (seenLocal.has(key)) continue;
      seenLocal.add(key);
      hits.push({ id: key, type: cls, label: name, sourceIdx: idx });
    }

    // Event detection: trigger word + nearby capitalized phrase OR year
    const evMatch = text.match(new RegExp(`([A-Z][\\w\\-]+(?:\\s+[A-Z][\\w\\-]+){0,3})\\s+${EVENT_TRIGGERS.source}`, "i"));
    if (evMatch) {
      const evLabel = `${evMatch[1]} ${evMatch[2]}`.trim();
      const key = `e_${slug(evLabel)}`;
      hits.push({ id: key, type: "event", label: evLabel, sourceIdx: idx });
    }
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    if (yearMatch && EVENT_TRIGGERS.test(text)) {
      const trig = text.match(EVENT_TRIGGERS)?.[0] ?? "event";
      const evLabel = `${yearMatch[0]} ${trig}`;
      const key = `e_${slug(evLabel)}`;
      hits.push({ id: key, type: "event", label: evLabel, sourceIdx: idx });
    }
  });

  // === Pass 2: TF-IDF topics (global top N) ===
  const docTokens: string[][] = results.map((r) =>
    cleanText(`${r.title} ${r.snippet}`)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
  const df = new Map<string, number>();
  docTokens.forEach((toks) => {
    const seen = new Set(toks);
    seen.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = Math.max(1, results.length);
  const tfidf = new Map<string, number>();
  docTokens.forEach((toks) => {
    const tf = new Map<string, number>();
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    tf.forEach((freq, term) => {
      const dfv = df.get(term) || 1;
      // skip terms appearing in every doc (likely query echo)
      if (dfv === N && N > 2) return;
      const score = freq * Math.log(1 + N / dfv);
      tfidf.set(term, (tfidf.get(term) || 0) + score);
    });
  });
  const topicTerms = [...tfidf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(10, Math.ceil(N / 1.5)))
    .map(([t]) => t);

  // Add topic nodes + topic→source edges
  topicTerms.forEach((term) => {
    const id = `t_${slug(term)}`;
    const label = term.charAt(0).toUpperCase() + term.slice(1);
    entityMap.set(id, { id, label, type: "topic", mentions: 0 });
    entitySources.set(id, new Set());
    docTokens.forEach((toks, idx) => {
      if (toks.includes(term)) {
        hits.push({ id, type: "topic", label, sourceIdx: idx });
      }
    });
  });

  // === Pass 3: register all hits into entity map ===
  for (const h of hits) {
    if (!entityMap.has(h.id)) {
      entityMap.set(h.id, { id: h.id, label: h.label, type: h.type, mentions: 0, context: "" });
      entitySources.set(h.id, new Set());
    }
    const node = entityMap.get(h.id)!;
    const set = entitySources.get(h.id)!;
    if (!set.has(h.sourceIdx)) {
      set.add(h.sourceIdx);
      node.mentions = (node.mentions || 0) + 1;
      sourceEntities.get(h.sourceIdx)!.add(h.id);
      if (!node.context) {
        node.context = cleanText(results[h.sourceIdx]?.snippet || "").slice(0, 240);
      }
    }
  }

  // Drop entities mentioned in fewer than 1 source (already ≥1 by construction)
  // but cap to avoid clutter: keep top 60 by mentions.
  const entityList = [...entityMap.values()]
    .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
    .slice(0, 60);
  const keptIds = new Set(entityList.map((n) => n.id));

  // === Pass 4: edges ===
  // 4a. source → entity for each mention
  entitySources.forEach((srcSet, entId) => {
    if (!keptIds.has(entId)) return;
    const ent = entityMap.get(entId)!;
    srcSet.forEach((idx) => {
      edges.push({
        source: `s_${idx}`,
        target: entId,
        label: ent.type,
        weight: 1,
      });
    });
  });

  // 4b. entity ↔ entity co-occurrence (>=2 shared sources)
  const entArr = entityList;
  for (let i = 0; i < entArr.length; i++) {
    const a = entArr[i];
    const sa = entitySources.get(a.id)!;
    if (sa.size < 2) continue;
    for (let j = i + 1; j < entArr.length; j++) {
      const b = entArr[j];
      const sb = entitySources.get(b.id)!;
      if (sb.size < 2) continue;
      let shared = 0;
      sa.forEach((x) => { if (sb.has(x)) shared++; });
      if (shared >= 2) {
        edges.push({ source: a.id, target: b.id, label: "co-mentioned", weight: shared });
      }
    }
  }

  // 4c. source ↔ source if same domain OR share ≥2 entities
  for (let i = 0; i < sourceNodes.length; i++) {
    for (let j = i + 1; j < sourceNodes.length; j++) {
      const a = sourceNodes[i], b = sourceNodes[j];
      let connected = false;
      let label = "";
      if (a.domain && b.domain && a.domain === b.domain) {
        connected = true; label = "same domain";
      } else {
        const ea = sourceEntities.get(i)!;
        const eb = sourceEntities.get(j)!;
        let shared = 0;
        ea.forEach((x) => { if (eb.has(x)) shared++; });
        if (shared >= 2) { connected = true; label = "related"; }
      }
      if (connected) edges.push({ source: a.id, target: b.id, label, weight: 1 });
    }
  }

  return {
    nodes: [...sourceNodes, ...entityList],
    edges,
    topics: topicTerms,
  };
}
