/**
 * Keyed web engines. Each runs only when the operator saved its key in the
 * device vault, and the key is sent to that provider alone. A provider that
 * refuses browser calls fails cleanly and says so in the engine report.
 */
import { fetchTimeout } from '../http';
import { arr, q, rec, str, type RawHit, type SearchProvider } from './types';

async function postJson(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal, timeoutMs = 12000): Promise<unknown> {
  const resp = await fetchTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
    timeoutMs,
  });
  return resp.json();
}

// ── Tavily ───────────────────────────────────────────────────────────────────
export function parseTavily(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).results).map((r) => ({
    title: str(r.title),
    url: str(r.url),
    snippet: str(r.content).slice(0, 400),
    publishDate: str(r.published_date) || undefined,
  }));
}

export const tavily: SearchProvider = {
  id: 'tavily',
  label: 'Tavily',
  modes: ['web', 'news', 'deep', 'docs'],
  layer: 'surface',
  keyId: 'tavily',
  run: async (ctx) =>
    parseTavily(
      await postJson(
        'https://api.tavily.com/search',
        { query: ctx.query, max_results: Math.min(20, ctx.limit), topic: ctx.mode === 'news' ? 'news' : 'general', search_depth: ctx.mode === 'deep' ? 'advanced' : 'basic' },
        { Authorization: `Bearer ${ctx.key ?? ''}` },
        ctx.signal,
      ),
    ),
};

// ── Exa ──────────────────────────────────────────────────────────────────────
export function parseExa(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).results).map((r) => ({
    title: str(r.title),
    url: str(r.url),
    snippet: (str(arr(r.highlights)[0]) || str(r.text)).slice(0, 400),
    publishDate: str(r.publishedDate) || undefined,
  }));
}

export const exa: SearchProvider = {
  id: 'exa',
  label: 'Exa',
  modes: ['web', 'news', 'deep', 'academic'],
  layer: 'surface',
  keyId: 'exa',
  run: async (ctx) =>
    parseExa(
      await postJson(
        'https://api.exa.ai/search',
        { query: ctx.query, numResults: Math.min(20, ctx.limit), type: 'auto', contents: { highlights: { numSentences: 2 } }, ...(ctx.mode === 'news' ? { category: 'news' } : {}) },
        { 'x-api-key': ctx.key ?? '' },
        ctx.signal,
      ),
    ),
};

// ── Firecrawl ────────────────────────────────────────────────────────────────
export function parseFirecrawl(json: unknown): RawHit[] {
  const data = rec(json).data;
  const web = Array.isArray(data) ? data : arr(rec(data).web);
  return arr<Record<string, unknown>>(web).map((r) => ({
    title: str(r.title) || str(rec(r.metadata).title),
    url: str(r.url) || str(rec(r.metadata).sourceURL),
    snippet: (str(r.description) || str(r.markdown)).replace(/\s+/g, ' ').slice(0, 400),
  }));
}

export const firecrawl: SearchProvider = {
  id: 'firecrawl',
  label: 'Firecrawl',
  modes: ['web', 'deep'],
  layer: 'surface',
  keyId: 'firecrawl',
  run: async (ctx) =>
    parseFirecrawl(await postJson('https://api.firecrawl.dev/v2/search', { query: ctx.query, limit: Math.min(15, ctx.limit) }, { Authorization: `Bearer ${ctx.key ?? ''}` }, ctx.signal)),
};

// ── Serper ───────────────────────────────────────────────────────────────────
export function parseSerper(json: unknown): RawHit[] {
  const root = rec(json);
  const organic = arr<Record<string, unknown>>(root.organic);
  const news = arr<Record<string, unknown>>(root.news);
  return [...organic, ...news].map((r) => ({
    title: str(r.title),
    url: str(r.link),
    snippet: str(r.snippet).slice(0, 400),
    publishDate: str(r.date) || undefined,
  }));
}

export const serper: SearchProvider = {
  id: 'serper',
  label: 'Serper',
  modes: ['web', 'news', 'deep'],
  layer: 'surface',
  keyId: 'serper',
  run: async (ctx) =>
    parseSerper(
      await postJson(
        ctx.mode === 'news' ? 'https://google.serper.dev/news' : 'https://google.serper.dev/search',
        { q: ctx.query, num: Math.min(20, ctx.limit) },
        { 'X-API-KEY': ctx.key ?? '' },
        ctx.signal,
      ),
    ),
};

// ── Brave ────────────────────────────────────────────────────────────────────
export function parseBrave(json: unknown): RawHit[] {
  const root = rec(json);
  const web = arr<Record<string, unknown>>(rec(root.web).results);
  const news = arr<Record<string, unknown>>(rec(root.news).results);
  return [...web, ...news].map((r) => ({
    title: str(r.title),
    url: str(r.url),
    snippet: str(r.description).replace(/<[^>]+>/g, '').slice(0, 400),
    publishDate: str(r.page_age) || str(r.age) || undefined,
  }));
}

export const brave: SearchProvider = {
  id: 'brave',
  label: 'Brave Search',
  modes: ['web', 'news', 'deep'],
  layer: 'surface',
  keyId: 'brave',
  run: async (ctx) => {
    const resp = await fetchTimeout(`https://api.search.brave.com/res/v1/web/search?q=${q(ctx.query)}&count=${Math.min(20, ctx.limit)}`, {
      signal: ctx.signal,
      timeoutMs: 10000,
      headers: { Accept: 'application/json', 'X-Subscription-Token': ctx.key ?? '' },
    });
    return parseBrave(await resp.json());
  },
};

export const KEYED_PROVIDERS: SearchProvider[] = [tavily, exa, firecrawl, serper, brave];
