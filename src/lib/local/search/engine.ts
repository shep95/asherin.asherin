/**
 * asherin.search — the device-side engine.
 *
 * understand → retrieve → rank, all in the browser:
 *   1. the query plan (operators, required terms, entity shape) is built locally
 *   2. every engine that serves the mode is asked in parallel, each under its
 *      own deadline, keyed engines only when their key is in the vault
 *   3. hits are deduped across engines, tiered by the truth graph, scored by
 *      relevance × credibility, grouped, and run through the fusion layer
 *
 * nothing leaves the device except the query words sent to each index.
 */
import type { EngineReport, SearchFilters, SearchMode, SearchResponse, SearchResult } from '@/components/dashboard/search/types';
import { buildQueryPlan, finalScore, relaxedQuery, scoreRelevance, type QueryPlan } from './queryPlan';
import { fuseCorpus, computeRankingQuality, type FusionResult, type RankingQuality } from './fusion';
import { instantAnswerFor, detectInstantAnswerType } from './instant';
import { getSearchKey } from './keys';
import { providersFor, type RawHit, type SearchProvider } from './providers';
import { buildSearchResult, checkFreshness, extractDomain, extractKeyPhrases } from './tiering';

export interface EngineInput {
  query: string;
  mode: SearchMode;
  filters?: SearchFilters;
  operatorOverrides?: string;
  signal?: AbortSignal;
  /** Cap on results after ranking. */
  limit?: number;
  /** Skip instant answers and fusion for a leaner pass (deep search's gather step). */
  lean?: boolean;
}

export interface FusionPayload {
  centrality: FusionResult['centrality'];
  clusters: FusionResult['clusters'];
  claims: FusionResult['claims'];
  contradictions: FusionResult['contradictions'];
  anomalies: FusionResult['anomalies'];
  rankingQuality: RankingQuality;
  prunedBelowFloor: number;
}

export interface EngineResponse extends SearchResponse {
  plan: Pick<QueryPlan, 'required' | 'optional' | 'negative' | 'phrases' | 'entity' | 'shape' | 'operators' | 'wireQuery'>;
  fusion: FusionPayload | null;
  rescueUsed: boolean;
  ms: number;
}

const MODE_DOMAIN_BOOSTS: Partial<Record<SearchMode, string[]>> = {
  news: ['reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com', 'nytimes.com', 'npr.org'],
  academic: ['arxiv.org', 'doi.org', 'nature.com', 'science.org', 'pubmed.ncbi.nlm.nih.gov', 'openalex.org'],
  code: ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.python.org'],
  docs: ['developer.mozilla.org', 'learn.microsoft.com', 'docs.python.org', 'en.wikipedia.org', 'books.google.com'],
  data: ['sec.gov', 'nvd.nist.gov', 'data.gov', 'worldbank.org', 'statista.com'],
};

const RELEVANCE_FLOOR = 0.12;

const OPERATOR_TOKEN_RE = /(^|\s)-?(site|filetype|ext|inurl|allinurl|intitle|allintitle|intext|allintext|related|cache|link|before|after|lang|loc|location|source|around|imagesize)\s*:\s*("[^"]{1,120}"|[^\s]{1,120})/gi;

/**
 * The string the engines receive: the operator's words plus explicit filters.
 * Search operators never go on the wire — open indexes do not understand
 * `site:` and return nothing — they are applied locally by the operator gate.
 */
export function buildWireQuery(plan: QueryPlan, filters?: SearchFilters, operatorOverrides?: string): string {
  let q = plan.wireQuery.replace(OPERATOR_TOKEN_RE, ' ').trim();
  if (operatorOverrides) q += ' ' + operatorOverrides.replace(OPERATOR_TOKEN_RE, ' ');
  if (filters) {
    if (filters.exactPhrase) q = `"${filters.exactPhrase.replace(/"/g, '')}" ${q}`;
    if (filters.includeKeywords?.length) q += ' ' + filters.includeKeywords.join(' ');
    if (filters.intitle) q += ` ${filters.intitle}`;
  }
  return q.replace(/\s+/g, ' ').trim();
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach((p) => u.searchParams.delete(p));
    return (u.origin.replace(/^https?:\/\/www\./, 'https://') + u.pathname.replace(/\/$/, '') + (u.search || '')).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

interface OperatorGate {
  sites: string[];
  notSites: string[];
  exts: string[];
  inurl: string[];
  intitle: string[];
}

export function parseOperatorGate(operators: string[], filters?: SearchFilters, overrides = ''): OperatorGate {
  const gate: OperatorGate = { sites: [], notSites: [], exts: [], inurl: [], intitle: [] };
  const all = [...operators, ...(overrides.match(/-?[a-z]+:\S+/gi) || [])];
  for (const raw of all) {
    const m = raw.match(/^(-?)([a-z]+):(.+)$/i);
    if (!m) continue;
    const neg = m[1] === '-';
    const key = m[2].toLowerCase();
    const val = m[3].replace(/^"|"$/g, '').toLowerCase();
    if (key === 'site') (neg ? gate.notSites : gate.sites).push(val.replace(/^www\./, ''));
    else if (key === 'filetype' || key === 'ext') gate.exts.push(val.replace(/^\./, ''));
    else if (key === 'inurl' || key === 'allinurl') gate.inurl.push(val);
    else if (key === 'intitle' || key === 'allintitle') gate.intitle.push(val);
  }
  if (filters?.domainInclude?.length) gate.sites.push(...filters.domainInclude.map((d) => d.toLowerCase().replace(/^www\./, '')));
  if (filters?.domainExclude?.length) gate.notSites.push(...filters.domainExclude.map((d) => d.toLowerCase().replace(/^www\./, '')));
  if (filters?.fileType) gate.exts.push(filters.fileType.toLowerCase());
  if (filters?.inurl) gate.inurl.push(filters.inurl.toLowerCase());
  if (filters?.intitle) gate.intitle.push(filters.intitle.toLowerCase());
  return gate;
}

export function passesGate(r: { url: string; title: string }, gate: OperatorGate): boolean {
  const domain = extractDomain(r.url).toLowerCase();
  const url = r.url.toLowerCase();
  const title = r.title.toLowerCase();
  const sameSite = (s: string) => domain === s || domain.endsWith('.' + s);
  if (gate.sites.length && !gate.sites.some(sameSite)) return false;
  if (gate.notSites.some(sameSite)) return false;
  if (gate.exts.length) {
    const path = url.split('?')[0];
    if (!gate.exts.some((e) => path.endsWith('.' + e))) return false;
  }
  if (gate.inurl.length && !gate.inurl.every((s) => url.includes(s))) return false;
  if (gate.intitle.length && !gate.intitle.every((s) => title.includes(s))) return false;
  return true;
}

function withinDateRange(publishDate: string | undefined, filters?: SearchFilters): boolean {
  if (!filters?.dateRange || !publishDate) return true;
  const t = new Date(publishDate).getTime();
  if (isNaN(t)) return true;
  const now = Date.now();
  const day = 86400000;
  switch (filters.dateRange) {
    case 'day':
      return now - t <= day;
    case 'week':
      return now - t <= 7 * day;
    case 'month':
      return now - t <= 31 * day;
    case 'year':
      return now - t <= 366 * day;
    case 'custom': {
      const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : -Infinity;
      const to = filters.dateTo ? new Date(filters.dateTo).getTime() + day : Infinity;
      return t >= from && t <= to;
    }
  }
  return true;
}

async function runProvider(p: SearchProvider, ctx: { query: string; phrases: string[]; mode: SearchMode; limit: number; signal?: AbortSignal; freshness?: 'day' | 'week' | 'month' | 'year' }): Promise<{ report: EngineReport; hits: RawHit[] }> {
  const started = performance.now();
  const base: EngineReport = { id: p.id, label: p.label, status: 'skipped', hits: 0, ms: 0 };
  if (p.gate && !p.gate(ctx.query)) return { report: { ...base, reason: 'not relevant to this query' }, hits: [] };
  let key: string | undefined;
  if (p.keyId) {
    key = (await getSearchKey(p.keyId)) ?? undefined;
    if (!key && !p.keyOptional) return { report: { ...base, reason: 'no key saved' }, hits: [] };
  } else if (p.keyOptional) {
    key = (await getSearchKey(p.id)) ?? undefined;
  }
  try {
    const hits = await p.run({ ...ctx, key });
    const ms = Math.round(performance.now() - started);
    return { report: { ...base, status: hits.length ? 'ok' : 'empty', hits: hits.length, ms }, hits };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    return { report: { ...base, status: 'failed', ms, reason: e instanceof Error ? e.message : 'failed' }, hits: [] };
  }
}

/** Merge raw hits across engines into scored, deduped results. */
export function assembleResults(
  batches: { provider: SearchProvider; hits: RawHit[] }[],
  plan: QueryPlan,
  gate: OperatorGate,
  filters?: SearchFilters,
): SearchResult[] {
  const byKey = new Map<string, SearchResult>();
  for (const { provider, hits } of batches) {
    for (const h of hits) {
      const built = buildSearchResult({ ...h, engine: provider.id, layer: provider.layer });
      if (!built) continue;
      if (!passesGate(built, gate)) continue;
      if (!withinDateRange(built.publishDate, filters)) continue;
      if (filters?.credibilityMin && built.tier > filters.credibilityMin) continue;
      const k = normalizeUrlKey(built.url);
      const existing = byKey.get(k);
      if (existing) {
        if (!existing.engines!.includes(provider.id)) existing.engines!.push(provider.id);
        if (built.snippet.length > existing.snippet.length) existing.snippet = built.snippet;
        if (!existing.publishDate && built.publishDate) existing.publishDate = built.publishDate;
      } else {
        byKey.set(k, built);
      }
    }
  }
  const rows = [...byKey.values()];

  // consensus: how many other documents share a phrase with this one
  const phrases = rows.map((r) => new Set(extractKeyPhrases(`${r.title} ${r.snippet}`)));
  rows.forEach((r, i) => {
    let corroborations = 0;
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      for (const p of phrases[i]) {
        if (phrases[j].has(p)) {
          corroborations++;
          break;
        }
      }
    }
    const weight = Math.min(1, corroborations / Math.max(1, rows.length - 1));
    if (r.truthGraph) r.truthGraph.consensusWeight = weight;
    r.veracity = Math.min(100, Math.round((r.veracity ?? 60) * (0.8 + weight * 0.2)));
  });

  rankRows(rows, plan);
  return rows;
}

function rankRows(rows: SearchResult[], plan: QueryPlan) {
  for (const r of rows) {
    r.relevance = scoreRelevance(plan, { title: r.title, url: r.url, snippet: r.snippet });
    r.score = finalScore({ relevance: r.relevance, veracity: r.veracity ?? 60, engines: r.engines, hostile: r.truthGraph?.hostileFlag });
  }
  rows.sort((a, b) => {
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    if ((b.veracity ?? 0) !== (a.veracity ?? 0)) return (b.veracity ?? 0) - (a.veracity ?? 0);
    return a.tier - b.tier;
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
}

export async function runSearch(input: EngineInput): Promise<EngineResponse> {
  const started = performance.now();
  const query = input.query.trim();
  const plan = buildQueryPlan(query);
  const wire = buildWireQuery(plan, input.filters, input.operatorOverrides);
  const gate = parseOperatorGate(plan.operators, input.filters, input.operatorOverrides);
  const freshness = input.filters?.dateRange && input.filters.dateRange !== 'custom' ? input.filters.dateRange : undefined;
  const limit = input.limit ?? 40;

  const providers = providersFor(input.mode === 'deep' ? 'deep' : input.mode);
  const ctx = { query: wire, phrases: plan.phrases, mode: input.mode, limit: 15, signal: input.signal, freshness };

  const [runs, instant] = await Promise.all([
    Promise.all(providers.map((p) => runProvider(p, ctx))),
    input.lean ? Promise.resolve(null) : instantAnswerFor(query, input.signal).catch(() => null),
  ]);

  let engines: EngineReport[] = runs.map((r) => r.report);
  let results = assembleResults(
    runs.map((r, i) => ({ provider: providers[i], hits: r.hits })),
    plan,
    gate,
    input.filters,
  );

  // rescue pass: a tight plan that returned little is re-asked relaxed, once,
  // against the three broadest engines that already answered.
  let rescueUsed = false;
  const topRel = results.slice(0, 5).reduce((s, r) => s + (r.relevance ?? 0), 0) / Math.max(1, Math.min(5, results.length));
  if (!input.lean && plan.required.length > 0 && (results.length < 5 || topRel < 0.45) && !input.signal?.aborted) {
    const relaxed = relaxedQuery(plan);
    if (relaxed && relaxed !== wire) {
      const answered = providers.filter((p, i) => runs[i].report.status === 'ok' && !p.keyId).slice(0, 3);
      const again = await Promise.all(answered.map((p) => runProvider(p, { ...ctx, query: relaxed })));
      const extra = assembleResults(
        again.map((r, i) => ({ provider: answered[i], hits: r.hits })),
        plan,
        gate,
        input.filters,
      );
      const known = new Set(results.map((r) => normalizeUrlKey(r.url)));
      for (const r of extra) {
        if (known.has(normalizeUrlKey(r.url))) continue;
        known.add(normalizeUrlKey(r.url));
        results.push(r);
        rescueUsed = true;
      }
      if (rescueUsed) rankRows(results, plan);
      engines = engines.map((e) => {
        const r = again.find((_, i) => answered[i].id === e.id);
        return r ? { ...e, hits: e.hits + r.report.hits, reason: 'answered twice: strict, then relaxed' } : e;
      });
    }
  }

  // mode-relevant domains get a bounded bonus, never a hoist above the list
  const boosts = new Set(MODE_DOMAIN_BOOSTS[input.mode] || []);
  if (boosts.size) {
    for (const r of results) if (boosts.has(extractDomain(r.url))) r.score = (r.score ?? 0) + 0.08;
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    results.forEach((r, i) => {
      r.rank = i + 1;
    });
  }

  // relevance floor: prune the off-topic tail only while a usable head survives
  let prunedBelowFloor = 0;
  const survivors = results.filter((r) => (r.relevance ?? 0) >= RELEVANCE_FLOOR);
  if (survivors.length >= 8 && survivors.length < results.length) {
    prunedBelowFloor = results.length - survivors.length;
    results = survivors;
    results.forEach((r, i) => {
      r.rank = i + 1;
    });
  }
  results = results.slice(0, limit);

  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) (grouped[r.category] ||= []).push(r);

  const freshnessAlerts: Record<string, NonNullable<ReturnType<typeof checkFreshness>>> = {};
  for (const r of results) {
    const alert = checkFreshness(query, r.publishDate);
    if (alert) freshnessAlerts[r.url] = alert;
  }

  let fusion: FusionPayload | null = null;
  if (!input.lean && results.length) {
    const docs = results.map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      domain: extractDomain(r.url),
      tier: r.tier,
      engine: r.engine,
      engines: r.engines,
      layer: r.layer,
      publishDate: r.publishDate,
    }));
    const f = fuseCorpus(query, docs);
    for (const r of results) r.dataType = f.dataTypes[r.url] || 'web';
    const rankingQuality = computeRankingQuality(
      results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        domain: extractDomain(r.url),
        tier: r.tier,
        engine: r.engine,
        engines: r.engines,
        relevance: r.relevance,
        veracity: r.veracity,
        dataType: f.dataTypes[r.url],
      })),
    );
    fusion = {
      centrality: f.centrality.slice(0, 40),
      clusters: f.clusters.slice(0, 20),
      claims: f.claims,
      contradictions: f.contradictions,
      anomalies: f.anomalies,
      rankingQuality,
      prunedBelowFloor,
    };
  }

  return {
    success: true,
    query,
    builtQuery: wire,
    mode: input.mode,
    instantAnswer: instant,
    instantAnswerType: detectInstantAnswerType(query),
    results,
    grouped,
    freshnessAlerts,
    page: 1,
    totalResults: results.length,
    engines,
    plan: {
      required: plan.required,
      optional: plan.optional,
      negative: plan.negative,
      phrases: plan.phrases,
      entity: plan.entity,
      shape: plan.shape,
      operators: plan.operators,
      wireQuery: plan.wireQuery,
    },
    fusion,
    rescueUsed,
    ms: Math.round(performance.now() - started),
  };
}
