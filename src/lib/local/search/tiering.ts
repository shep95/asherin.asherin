/**
 * TRUTH GRAPH — source credibility and provenance, computed on the device.
 * Ported from the hosted search organ; every number here is reproducible from
 * the domain and the text, so a badge can always be explained.
 */
import type { FreshnessAlert, SearchResult, SourceTier, TruthGraphNode } from '@/components/dashboard/search/types';

const TIER_1_DOMAINS = new Set([
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'nature.com', 'science.org',
  'who.int', 'nih.gov', 'cdc.gov', 'nasa.gov', 'sec.gov', 'federalreserve.gov',
  'supremecourt.gov', 'congress.gov', 'whitehouse.gov', 'europa.eu',
  'worldbank.org', 'imf.org', 'un.org', 'pubmed.ncbi.nlm.nih.gov',
  'scholar.google.com', 'jstor.org', 'ncbi.nlm.nih.gov', 'ieee.org',
  'ecb.europa.eu', 'bis.org', 'wto.org', 'iaea.org', 'patents.google.com',
  'nvd.nist.gov', 'arxiv.org', 'doi.org',
]);

const TIER_2_DOMAINS = new Set([
  'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'economist.com',
  'wsj.com', 'ft.com', 'bloomberg.com', 'cnbc.com', 'techcrunch.com',
  'wired.com', 'arstechnica.com', 'theatlantic.com', 'newyorker.com',
  'propublica.com', 'politico.com', 'npr.org', 'pbs.org',
  'github.com', 'stackoverflow.com', 'stackexchange.com', 'developer.mozilla.org', 'docs.python.org',
  'docs.microsoft.com', 'learn.microsoft.com', 'cloud.google.com', 'aws.amazon.com',
  'wikipedia.org', 'britannica.com', 'statista.com', 'openalex.org', 'crossref.org',
  'books.google.com', 'web.archive.org', 'archive.org', 'openlibrary.org',
]);

const TIER_3_PATTERNS = ['.gov', '.edu', '.ac.uk', '.ac.jp', '.edu.au', '.mil', '.int'];

const HOSTILE_INDICATORS = new Set([
  'infowars.com', 'naturalnews.com', 'beforeitsnews.com', 'globalresearch.ca',
  'zerohedge.com', 'breitbart.com', 'dailycaller.com',
]);

const COMMUNITY_DOMAINS = new Set(['reddit.com', 'news.ycombinator.com', 'lobste.rs', 'dev.to', 'hashnode.com', 'stackoverflow.com']);

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getSourceTier(domain: string): SourceTier {
  const clean = domain.replace(/^www\./, '');
  if (/\.onion$/i.test(clean)) return 5;
  if (TIER_1_DOMAINS.has(clean)) return 1;
  if (TIER_2_DOMAINS.has(clean)) return 2;
  // a subdomain of a listed host inherits the tier
  for (const d of TIER_1_DOMAINS) if (clean.endsWith('.' + d)) return 1;
  for (const d of TIER_2_DOMAINS) if (clean.endsWith('.' + d)) return 2;
  for (const pat of TIER_3_PATTERNS) if (clean.endsWith(pat)) return 3;
  return 4;
}

export function getTierLabel(tier: SourceTier): string {
  switch (tier) {
    case 1:
      return 'primary source';
    case 2:
      return 'established';
    case 3:
      return 'institutional';
    case 4:
      return 'general';
    case 5:
      return 'onion (unverified)';
  }
}

export function isHostile(domain: string): boolean {
  return HOSTILE_INDICATORS.has(domain.replace(/^www\./, ''));
}

export function calculateProvenance(domain: string, tier: SourceTier, snippet: string): number {
  let score = tier === 1 ? 0.95 : tier === 2 ? 0.8 : tier === 3 ? 0.7 : 0.65;
  const citations = (snippet.match(/\b(according to|cited by|published in|data from|report by)\b/gi) || []).length;
  score = Math.min(1, score + citations * 0.05);
  if (isHostile(domain)) score *= 0.2;
  return Math.round(score * 100) / 100;
}

export function calculateFreshness(publishDate?: string): number {
  if (!publishDate) return 0.5;
  const pub = new Date(publishDate);
  if (isNaN(pub.getTime())) return 0.5;
  const days = (Date.now() - pub.getTime()) / 86400000;
  if (days <= 1) return 1.0;
  if (days <= 7) return 0.9;
  if (days <= 30) return 0.75;
  if (days <= 90) return 0.6;
  if (days <= 365) return 0.4;
  return 0.2;
}

export function estimateReadingTime(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 230));
}

export function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function categorizeResult(r: { url: string; tier: SourceTier; snippet: string; publishDate?: string }): SearchResult['category'] {
  const domain = extractDomain(r.url);
  if (r.tier === 1) return 'primary';
  if (COMMUNITY_DOMAINS.has(domain)) return 'community';
  if (r.publishDate) {
    const pub = new Date(r.publishDate);
    if (!isNaN(pub.getTime()) && pub.getTime() > Date.now() - 86400000) return 'breaking';
  }
  if (r.snippet.length > 200) return 'analysis';
  return 'general';
}

export function truthGraphFor(url: string, snippet: string, publishDate?: string): TruthGraphNode {
  const domain = extractDomain(url);
  const tier = getSourceTier(domain);
  return {
    tier,
    tierLabel: getTierLabel(tier),
    provenanceScore: calculateProvenance(domain, tier, snippet),
    freshnessScore: calculateFreshness(publishDate),
    hostileFlag: isHostile(domain),
    consensusWeight: 0,
  };
}

export function normalizeDate(d?: string): string | undefined {
  if (!d) return undefined;
  const t = new Date(d);
  if (isNaN(t.getTime())) return d.slice(0, 10) || undefined;
  return t.toISOString().slice(0, 10);
}

/** Build a scored result from a raw provider hit. Returns null for junk. */
export function buildSearchResult(input: {
  title: string;
  url: string;
  snippet: string;
  publishDate?: string;
  engine: string;
  layer: string;
}): SearchResult | null {
  let url = (input.url || '').trim();
  if (!url) return null;
  // an explicit non-web scheme (javascript:, data:, mailto:, ftp:) is refused,
  // not prefixed; a bare host (example.com/a, host:8080/a) gets https://
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(url) && !/^https?:\/\//i.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const title = cleanHtml(input.title || '').slice(0, 220) || extractDomain(url);
  const snippet = cleanHtml(input.snippet || '').slice(0, 600);
  const tg = truthGraphFor(url, snippet, input.publishDate);
  const veracity = Math.round((tg.provenanceScore * 0.7 + tg.freshnessScore * 0.3) * 100);
  return {
    title,
    url,
    snippet,
    source: extractDomain(url),
    tier: tg.tier,
    tierLabel: tg.tierLabel,
    publishDate: normalizeDate(input.publishDate),
    readingTimeMin: snippet ? Math.max(1, estimateReadingTime(snippet) * 3) : undefined,
    category: categorizeResult({ url, tier: tg.tier, snippet, publishDate: input.publishDate }),
    engine: input.engine,
    engines: [input.engine],
    layer: input.layer,
    veracity,
    truthGraph: tg,
  };
}

export function checkFreshness(query: string, publishDate?: string): FreshnessAlert | null {
  if (!publishDate) return null;
  const pub = new Date(publishDate);
  if (isNaN(pub.getTime())) return null;
  const diffDays = Math.floor((Date.now() - pub.getTime()) / 86400000);
  const q = query.toLowerCase();
  if (/\b(stock|market|price|earnings|trading|crypto|bitcoin|eth)\b/.test(q) && diffDays > 7) {
    return { message: `this result is ${diffDays} days old. financial data may have changed.`, severity: 'warning' };
  }
  if (/\b(news|breaking|latest|update|today)\b/.test(q) && diffDays > 3) {
    return { message: `published ${diffDays} days ago. newer coverage may exist.`, severity: 'info' };
  }
  if (/\b(tutorial|guide|how to|install|setup|config|version)\b/.test(q) && diffDays > 180) {
    return { message: `this article is ${Math.floor(diffDays / 30)} months old. technical detail may be outdated.`, severity: 'warning' };
  }
  if (/\b(health|medical|treatment|symptom|disease|drug|medicine)\b/.test(q) && diffDays > 365) {
    return { message: 'published over a year ago. medical guidance may have changed.', severity: 'warning' };
  }
  return null;
}

/** Phrase overlap between snippets drives the consensus weight. */
export function extractKeyPhrases(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const out = new Set<string>();
  for (let i = 0; i + 1 < words.length; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return [...out];
}
