/**
 * Keyless open indexes that answer a browser directly (CORS-enabled).
 * Each provider is a pure parser plus one bounded fetch, so the parser can be
 * tested against a fixture of the real response shape without any network.
 */
import { getJson, getText } from '../http';
import { arr, q, rec, str, type ProviderContext, type RawHit, type SearchProvider } from './types';

// ── Wikipedia ────────────────────────────────────────────────────────────────
export function parseWikipedia(json: unknown): RawHit[] {
  const hits = arr<Record<string, unknown>>(rec(rec(json).query).search);
  return hits.map((r) => {
    const title = str(r.title);
    return {
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      snippet: str(r.snippet).replace(/<[^>]+>/g, ''),
      publishDate: str(r.timestamp) || undefined,
    };
  });
}

export const wikipedia: SearchProvider = {
  id: 'wikipedia',
  label: 'Wikipedia',
  modes: ['web', 'news', 'docs', 'academic', 'deep'],
  layer: 'curated',
  run: async (ctx) =>
    parseWikipedia(
      await getJson(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q(ctx.query)}&format=json&srlimit=${Math.min(20, ctx.limit)}&origin=*`,
        { signal: ctx.signal, timeoutMs: 6000 },
      ),
    ),
};

// ── Hacker News (Algolia) ────────────────────────────────────────────────────
export function parseHackerNews(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).hits).map((h) => ({
    title: str(h.title) || str(h.story_title),
    url: str(h.url) || `https://news.ycombinator.com/item?id=${str(h.objectID)}`,
    snippet: `${Number(h.points) || 0} points · ${Number(h.num_comments) || 0} comments · by ${str(h.author) || 'anon'}`,
    publishDate: str(h.created_at) || undefined,
  }));
}

export const hackerNews: SearchProvider = {
  id: 'hackernews',
  label: 'Hacker News',
  modes: ['web', 'news', 'code', 'deep'],
  layer: 'social',
  run: async (ctx) =>
    parseHackerNews(
      await getJson(`https://hn.algolia.com/api/v1/search?query=${q(ctx.query)}&hitsPerPage=${Math.min(20, ctx.limit)}&tags=story`, {
        signal: ctx.signal,
        timeoutMs: 6000,
      }),
    ),
};

// ── GitHub repositories (keyless) and code (token) ───────────────────────────
export function parseGitHubRepos(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).items).map((i) => ({
    title: str(i.full_name),
    url: str(i.html_url),
    snippet: str(i.description) || `${Number(i.stargazers_count) || 0}★ · ${str(i.language) || 'mixed'}`,
    publishDate: str(i.updated_at) || undefined,
  }));
}

export function parseGitHubCode(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).items).map((i) => {
    const repo = rec(i.repository);
    const matches = arr<Record<string, unknown>>(i.text_matches);
    return {
      title: `${str(repo.full_name)} · ${str(i.path)}`,
      url: str(i.html_url),
      snippet: str(matches[0]?.fragment).slice(0, 280),
    };
  });
}

export const githubRepos: SearchProvider = {
  id: 'github-repos',
  label: 'GitHub repositories',
  modes: ['code', 'web', 'deep'],
  layer: 'code',
  run: async (ctx) =>
    parseGitHubRepos(
      await getJson(`https://api.github.com/search/repositories?q=${q(ctx.query)}&per_page=${Math.min(15, ctx.limit)}`, {
        signal: ctx.signal,
        timeoutMs: 7000,
        headers: { Accept: 'application/vnd.github+json' },
      }),
    ),
};

export const githubCode: SearchProvider = {
  id: 'github-code',
  label: 'GitHub code',
  modes: ['code'],
  layer: 'code',
  keyId: 'github',
  run: async (ctx) =>
    parseGitHubCode(
      await getJson(`https://api.github.com/search/code?q=${q(ctx.query)}&per_page=${Math.min(15, ctx.limit)}`, {
        signal: ctx.signal,
        timeoutMs: 8000,
        headers: { Accept: 'application/vnd.github.text-match+json', Authorization: `Bearer ${ctx.key ?? ''}` },
      }),
    ),
};

// ── Stack Exchange ───────────────────────────────────────────────────────────
export function parseStackExchange(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).items).map((i) => ({
    title: str(i.title),
    url: str(i.link),
    snippet: `${Number(i.score) || 0} votes · ${Number(i.answer_count) || 0} answers${i.is_answered ? ' · accepted' : ''} · ${arr<string>(i.tags).slice(0, 5).join(', ')}`,
    publishDate: typeof i.creation_date === 'number' ? new Date(i.creation_date * 1000).toISOString() : undefined,
  }));
}

export const stackExchange: SearchProvider = {
  id: 'stackoverflow',
  label: 'Stack Overflow',
  modes: ['code', 'docs'],
  layer: 'social',
  run: async (ctx) =>
    parseStackExchange(
      await getJson(
        `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q(ctx.query)}&site=stackoverflow&pagesize=${Math.min(15, ctx.limit)}&filter=default`,
        { signal: ctx.signal, timeoutMs: 7000 },
      ),
    ),
};

// ── arXiv (Atom XML) ─────────────────────────────────────────────────────────
export function parseArxiv(xml: string, limit = 20): RawHit[] {
  const out: RawHit[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null && out.length < limit) {
    const block = m[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
    // arXiv ids are http://arxiv.org/abs/…; the page policy only connects over https
    const url = (block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '').replace(/^http:\/\/(export\.)?arxiv\.org\//i, 'https://arxiv.org/');
    const summary = (block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 320);
    const published = block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim();
    if (title && url) out.push({ title, url, snippet: summary, publishDate: published });
  }
  return out;
}

export const arxiv: SearchProvider = {
  id: 'arxiv',
  label: 'arXiv',
  modes: ['academic', 'deep'],
  layer: 'academic',
  run: async (ctx) =>
    parseArxiv(
      await getText(`https://export.arxiv.org/api/query?search_query=all:${q(ctx.query)}&start=0&max_results=${Math.min(15, ctx.limit)}&sortBy=relevance`, {
        signal: ctx.signal,
        timeoutMs: 8000,
      }),
      ctx.limit,
    ),
};

// ── Crossref ─────────────────────────────────────────────────────────────────
export function parseCrossref(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(rec(json).message).items).map((item) => {
    const title = str(arr(item.title)[0]);
    const doi = str(item.DOI);
    const journal = str(arr(item['container-title'])[0]);
    const authors = arr<Record<string, unknown>>(item.author)
      .slice(0, 3)
      .map((a) => `${str(a.family)} ${str(a.given)}`.trim())
      .filter(Boolean)
      .join(', ');
    const abstract = str(item.abstract).replace(/<[^>]+>/g, '').slice(0, 240);
    const dp = arr<number>(arr(rec(item['published-print'])['date-parts'] ?? rec(item['published-online'])['date-parts'])[0]);
    const date = dp.length ? `${dp[0]}-${String(dp[1] || 1).padStart(2, '0')}-${String(dp[2] || 1).padStart(2, '0')}` : undefined;
    return {
      title,
      url: str(item.URL) || (doi ? `https://doi.org/${doi}` : ''),
      snippet: `${authors ? authors + ' · ' : ''}${journal ? journal + ' · ' : ''}${abstract}`,
      publishDate: date,
    };
  });
}

export const crossref: SearchProvider = {
  id: 'crossref',
  label: 'Crossref',
  modes: ['academic'],
  layer: 'academic',
  run: async (ctx) =>
    parseCrossref(
      await getJson(
        `https://api.crossref.org/works?query=${q(ctx.query)}&rows=${Math.min(15, ctx.limit)}&select=DOI,title,author,published-print,published-online,abstract,URL,container-title`,
        { signal: ctx.signal, timeoutMs: 8000 },
      ),
    ),
};

// ── OpenAlex ─────────────────────────────────────────────────────────────────
export function parseOpenAlex(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).results).map((w) => {
    const doi = str(w.doi);
    const authors = arr<Record<string, unknown>>(w.authorships)
      .slice(0, 3)
      .map((a) => str(rec(a.author).display_name))
      .filter(Boolean)
      .join(', ');
    const venue = str(rec(rec(w.primary_location).source).display_name) || str(rec(w.host_venue).display_name) || 'open access';
    return {
      title: str(w.title) || str(w.display_name),
      url: doi ? `https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}` : str(w.id),
      snippet: `${authors ? authors + ' · ' : ''}cited ${Number(w.cited_by_count) || 0}× · ${venue}`,
      publishDate: str(w.publication_date) || undefined,
    };
  });
}

export const openAlex: SearchProvider = {
  id: 'openalex',
  label: 'OpenAlex',
  modes: ['academic', 'deep'],
  layer: 'academic',
  run: async (ctx) =>
    parseOpenAlex(await getJson(`https://api.openalex.org/works?search=${q(ctx.query)}&per-page=${Math.min(15, ctx.limit)}`, { signal: ctx.signal, timeoutMs: 8000 })),
};

// ── Google Books ─────────────────────────────────────────────────────────────
export function parseGoogleBooks(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).items).map((item) => {
    const v = rec(item.volumeInfo);
    return {
      title: `${str(v.title)}${v.subtitle ? ': ' + str(v.subtitle) : ''}`,
      url: str(v.infoLink) || str(v.canonicalVolumeLink) || `https://books.google.com/books?id=${str(item.id)}`,
      snippet: `${arr<string>(v.authors).join(', ')} · ${str(v.publisher)} · ${str(v.publishedDate)} · ${str(v.description).slice(0, 240)}`,
      publishDate: str(v.publishedDate) || undefined,
    };
  });
}

export const googleBooks: SearchProvider = {
  id: 'google-books',
  label: 'Google Books',
  modes: ['docs', 'academic'],
  layer: 'deep',
  run: async (ctx) =>
    parseGoogleBooks(
      await getJson(`https://www.googleapis.com/books/v1/volumes?q=${q(ctx.query)}&maxResults=${Math.min(10, ctx.limit)}&printType=books`, {
        signal: ctx.signal,
        timeoutMs: 7000,
      }),
    ),
};

// ── Open Library ─────────────────────────────────────────────────────────────
export function parseOpenLibrary(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).docs).map((d) => ({
    title: str(d.title),
    url: `https://openlibrary.org${str(d.key)}`,
    snippet: `${arr<string>(d.author_name).slice(0, 3).join(', ')}${d.first_publish_year ? ' · ' + str(d.first_publish_year) : ''}${d.subject ? ' · ' + arr<string>(d.subject).slice(0, 4).join(', ') : ''}`,
    publishDate: d.first_publish_year ? `${str(d.first_publish_year)}-01-01` : undefined,
  }));
}

export const openLibrary: SearchProvider = {
  id: 'openlibrary',
  label: 'Open Library',
  modes: ['docs'],
  layer: 'deep',
  run: async (ctx) =>
    parseOpenLibrary(
      await getJson(`https://openlibrary.org/search.json?q=${q(ctx.query)}&limit=${Math.min(10, ctx.limit)}&fields=key,title,author_name,first_publish_year,subject`, {
        signal: ctx.signal,
        timeoutMs: 8000,
      }),
    ),
};

// ── GDELT (global news) ──────────────────────────────────────────────────────
export function parseGdelt(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).articles).map((a) => {
    const seen = str(a.seendate); // 20240101T120000Z
    const date = /^\d{8}T/.test(seen) ? `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}` : undefined;
    return {
      title: str(a.title),
      url: str(a.url),
      snippet: `${str(a.domain)}${a.sourcecountry ? ' · ' + str(a.sourcecountry) : ''}${a.language ? ' · ' + str(a.language) : ''}`,
      publishDate: date,
    };
  });
}

export const gdelt: SearchProvider = {
  id: 'gdelt',
  label: 'GDELT news',
  modes: ['news', 'web', 'deep'],
  layer: 'surface',
  run: async (ctx) => {
    const span = ctx.freshness === 'day' ? '1d' : ctx.freshness === 'week' ? '1w' : ctx.freshness === 'month' ? '1m' : '3m';
    // gdelt rejects very short or operator-laden queries; keep the plain words.
    const words = ctx.query.replace(/["']/g, '').trim();
    if (words.length < 3) return [];
    return parseGdelt(
      await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q(words)}&mode=artlist&maxrecords=${Math.min(25, ctx.limit)}&format=json&timespan=${span}&sort=hybridrel`, {
        signal: ctx.signal,
        timeoutMs: 9000,
      }),
    );
  },
};

// ── Wayback CDX ──────────────────────────────────────────────────────────────
export function parseWayback(rows: unknown, limit = 15): RawHit[] {
  const list = arr<string[]>(rows);
  if (list.length < 2) return [];
  const out: RawHit[] = [];
  for (const row of list.slice(1, limit + 1)) {
    const [, ts, original] = row;
    if (!original || !ts) continue;
    const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    out.push({
      title: `archived: ${original}`,
      url: `https://web.archive.org/web/${ts}/${original}`,
      snippet: `snapshot from ${date} preserved by the internet archive.`,
      publishDate: date,
    });
  }
  return out;
}

export const wayback: SearchProvider = {
  id: 'wayback',
  label: 'Wayback Machine',
  modes: ['archive', 'web'],
  layer: 'archive',
  run: async (ctx) => {
    const term = ctx.query.replace(/\s+/g, '-');
    return parseWayback(
      await getJson(`https://web.archive.org/cdx/search/cdx?url=*${q(term)}*&output=json&limit=${Math.min(20, ctx.limit)}&filter=statuscode:200&collapse=urlkey`, {
        signal: ctx.signal,
        timeoutMs: 9000,
      }),
      ctx.limit,
    );
  },
};

// ── NVD CVE 2.0 ──────────────────────────────────────────────────────────────
export function parseNvd(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).vulnerabilities).map((v) => {
    const cve = rec(v.cve);
    const id = str(cve.id);
    const desc = str(arr<Record<string, unknown>>(cve.descriptions).find((d) => d.lang === 'en')?.value);
    const metrics = rec(cve.metrics);
    const pick = (k: string) => rec(rec(arr<Record<string, unknown>>(metrics[k])[0]).cvssData).baseScore;
    const score = pick('cvssMetricV31') ?? pick('cvssMetricV30') ?? pick('cvssMetricV2');
    const n = typeof score === 'number' ? score : undefined;
    const sev = n == null ? 'unrated' : n >= 9 ? 'critical' : n >= 7 ? 'high' : n >= 4 ? 'medium' : 'low';
    return {
      title: `${id} · ${sev}${n != null ? ` (${n})` : ''}`,
      url: `https://nvd.nist.gov/vuln/detail/${id}`,
      snippet: desc.slice(0, 320),
      publishDate: str(cve.published) || undefined,
    };
  });
}

const VULN_RE = /\b(cve|vulnerab|exploit|0-?day|rce|xss|sqli|csrf|ssrf|patch|advisory)\b/i;

export const nvd: SearchProvider = {
  id: 'nvd-cve',
  label: 'NVD (CVE)',
  modes: ['data', 'web', 'code'],
  layer: 'vuln',
  gate: (query) => /CVE-\d{4}-\d{4,7}/i.test(query) || VULN_RE.test(query),
  run: async (ctx) => {
    const direct = /CVE-\d{4}-\d{4,7}/i.exec(ctx.query);
    const params = direct ? `cveId=${direct[0].toUpperCase()}` : `keywordSearch=${q(ctx.query)}&resultsPerPage=${Math.min(10, ctx.limit)}`;
    return parseNvd(await getJson(`https://services.nvd.nist.gov/rest/json/cves/2.0?${params}`, { signal: ctx.signal, timeoutMs: 9000 }));
  },
};

// ── SEC EDGAR full-text search ───────────────────────────────────────────────
export function parseEdgar(json: unknown, query = ''): RawHit[] {
  return arr<Record<string, unknown>>(rec(rec(json).hits).hits).map((hit) => {
    const src = rec(hit._source);
    const adsh = str(src.adsh).replace(/-/g, '');
    const cik = str(arr(src.ciks)[0]);
    const file = str(hit._id).split(':')[1] || '';
    const url = cik && adsh && file ? `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${adsh}/${file}` : `https://efts.sec.gov/LATEST/search-index?q=${q(query)}`;
    return {
      title: `${str(arr(src.display_names)[0]) || 'filer'} · ${str(src.form) || 'filing'} · ${str(src.file_date)}`,
      url,
      snippet: (str(src.file_description) || str(src.items)).slice(0, 280),
      publishDate: str(src.file_date) || undefined,
    };
  });
}

export const edgar: SearchProvider = {
  id: 'sec-edgar',
  label: 'SEC EDGAR',
  modes: ['data'],
  layer: 'deep',
  run: async (ctx) =>
    parseEdgar(
      await getJson(`https://efts.sec.gov/LATEST/search-index?q=${q('"' + ctx.query.replace(/"/g, '') + '"')}&forms=10-K,10-Q,8-K,S-1,DEF+14A`, {
        signal: ctx.signal,
        timeoutMs: 8000,
      }),
      ctx.query,
    ),
};

// ── Jina reader search (keyless with limits, keyed for more) ─────────────────
export function parseJinaSearch(json: unknown): RawHit[] {
  return arr<Record<string, unknown>>(rec(json).data).map((d) => ({
    title: str(d.title),
    url: str(d.url),
    snippet: (str(d.description) || str(d.content)).replace(/\s+/g, ' ').slice(0, 320),
    publishDate: str(d.publishedTime) || undefined,
  }));
}

export const jinaSearch: SearchProvider = {
  id: 'jina',
  label: 'Jina web search',
  modes: ['web', 'news', 'docs', 'deep'],
  layer: 'surface',
  keyOptional: true,
  run: async (ctx) =>
    parseJinaSearch(
      await getJson(`https://s.jina.ai/?q=${q(ctx.query)}`, {
        signal: ctx.signal,
        timeoutMs: 12000,
        headers: {
          Accept: 'application/json',
          'X-Respond-With': 'no-content',
          ...(ctx.key ? { Authorization: `Bearer ${ctx.key}` } : {}),
        },
      }),
    ),
};

export const OPEN_PROVIDERS: SearchProvider[] = [
  jinaSearch,
  wikipedia,
  gdelt,
  hackerNews,
  githubRepos,
  githubCode,
  stackExchange,
  arxiv,
  crossref,
  openAlex,
  googleBooks,
  openLibrary,
  wayback,
  nvd,
  edgar,
];

export type { ProviderContext };
