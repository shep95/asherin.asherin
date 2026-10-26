/**
 * Page reading without a server. The reader relay (r.jina.ai) returns the
 * readable text of a public page with permissive CORS; a direct fetch is tried
 * when the relay cannot (some sites allow it). Nothing is fabricated: when both
 * fail, the preview says so.
 */
import type { PagePreview } from '@/components/dashboard/search/types';
import { fetchTimeout } from './http';
import { getSearchKey } from './keys';
import { arr, rec, str } from './providers/types';
import { cleanHtml, estimateReadingTime } from './tiering';

const PAYWALL_HINTS = ['subscribe to continue', 'subscription required', 'paywall', 'sign in to read', 'premium article', 'create a free account to', 'to continue reading'];

export interface ReadPage extends PagePreview {
  /** Outbound links the reader found (text → url). */
  links: { text: string; url: string }[];
  /** Markdown or plain text, before HTML sanitising. */
  markdown: string;
  finalUrl: string;
  statusCode: number | null;
  language: string;
  siteName: string;
  image: string;
}

export function normalizeTargetUrl(input: string): string | null {
  try {
    const raw = input.trim();
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0)/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function finish(partial: Partial<ReadPage> & { content: string; title: string }): ReadPage {
  const text = partial.content;
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    success: true,
    title: partial.title,
    description: partial.description ?? '',
    content: text,
    wordCount: words,
    readingTimeMin: estimateReadingTime(text),
    isPaywalled: PAYWALL_HINTS.some((p) => text.toLowerCase().includes(p)),
    fetchedAt: new Date().toISOString(),
    via: partial.via,
    links: partial.links ?? [],
    markdown: partial.markdown ?? text,
    finalUrl: partial.finalUrl ?? '',
    statusCode: partial.statusCode ?? null,
    language: partial.language ?? '',
    siteName: partial.siteName ?? '',
    image: partial.image ?? '',
  };
}

/** Markdown from the relay, flattened to readable prose for previews and reports. */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\n?/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+(.*)$/gm, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*[-=]{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parse the relay's JSON envelope. Exported for tests. */
export function parseReaderJson(json: unknown, url: string): ReadPage | null {
  const data = rec(rec(json).data);
  const raw = str(data.content);
  if (!raw.trim()) return null;
  const content = markdownToText(raw);
  const linksRec = rec(data.links);
  const links = Object.entries(linksRec)
    .map(([text, u]) => ({ text, url: str(u) }))
    .filter((l) => /^https?:\/\//i.test(l.url));
  return finish({
    title: str(data.title) || url,
    description: str(data.description),
    content: content.slice(0, 60000),
    markdown: raw.slice(0, 60000),
    via: 'reader',
    links,
    finalUrl: str(data.url) || url,
    statusCode: 200,
    siteName: str(rec(data.metadata)['og:site_name']),
    language: str(rec(data.metadata).lang),
    image: str(rec(data.metadata)['og:image']),
  });
}

function extractAnchors(html: string, base: string): { text: string; url: string }[] {
  const out: { text: string; url: string }[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(html)) !== null && guard++ < 2000) {
    try {
      const abs = new URL(m[1], base).toString();
      if (/^https?:/i.test(abs)) out.push({ text: cleanHtml(m[2]).slice(0, 120), url: abs.split('#')[0] });
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function parseDirectHtml(html: string, url: string, status: number): ReadPage {
  const grab = (re: RegExp) => {
    const m = html.match(re);
    return m ? m[1].trim() : '';
  };
  const title = cleanHtml(grab(/<title[^>]*>([\s\S]*?)<\/title>/i)) || grab(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || url;
  const description = grab(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || grab(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const paragraphs = (body.match(/<(?:p|h[1-4]|li|blockquote)[^>]*>[\s\S]*?<\/(?:p|h[1-4]|li|blockquote)>/gi) || []).map(cleanHtml).filter((t) => t.length > 20);
  const content = (paragraphs.length ? paragraphs.join('\n\n') : cleanHtml(body)).slice(0, 60000);
  return finish({
    title,
    description,
    content,
    markdown: content,
    via: 'direct',
    links: extractAnchors(html, url),
    finalUrl: url,
    statusCode: status,
    language: grab(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i),
    siteName: grab(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i),
    image: grab(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
  });
}

export async function readPage(rawUrl: string, opts: { signal?: AbortSignal; timeoutMs?: number; withLinks?: boolean } = {}): Promise<ReadPage> {
  const url = normalizeTargetUrl(rawUrl);
  if (!url) throw new Error('not a public http(s) address');
  const timeoutMs = opts.timeoutMs ?? 15000;
  const errors: string[] = [];

  try {
    const key = await getSearchKey('jina');
    const resp = await fetchTimeout(`https://r.jina.ai/${url}`, {
      signal: opts.signal,
      timeoutMs,
      headers: {
        Accept: 'application/json',
        'X-Return-Format': 'markdown',
        ...(opts.withLinks ? { 'X-With-Links-Summary': 'true' } : {}),
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
    });
    const parsed = parseReaderJson(await resp.json(), url);
    if (parsed) return parsed;
    errors.push('reader returned no text');
  } catch (e) {
    errors.push(`reader: ${e instanceof Error ? e.message : 'failed'}`);
  }

  try {
    // the direct read must be https: an http fetch from this https page is
    // mixed content and the page policy refuses it before it leaves the browser
    const direct = url.replace(/^http:\/\//i, 'https://');
    const resp = await fetchTimeout(direct, { signal: opts.signal, timeoutMs: Math.min(timeoutMs, 10000), headers: { Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' } });
    const ctype = resp.headers.get('content-type') || '';
    const text = await resp.text();
    if (/html/i.test(ctype) || /<html/i.test(text.slice(0, 2000))) return parseDirectHtml(text, url, resp.status);
    return finish({ title: url, content: text.slice(0, 60000), via: 'direct', finalUrl: url, statusCode: resp.status });
  } catch (e) {
    errors.push(`direct: ${e instanceof Error ? e.message : 'failed'}`);
  }

  throw new Error(`could not read this page from the browser (${errors.join('; ')})`);
}

/** The reader's link map, when the relay returned one as an array form. */
export function linksFromReaderArray(v: unknown): { text: string; url: string }[] {
  return arr<unknown>(v)
    .map((x) => {
      const r = rec(x);
      return { text: str(r.text), url: str(r.url) };
    })
    .filter((l) => /^https?:\/\//i.test(l.url));
}
