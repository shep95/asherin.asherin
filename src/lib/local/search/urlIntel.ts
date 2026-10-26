/**
 * URL INTEL MAP — deterministic, on the device. Given any public URL, read it
 * and extract every observable connection: handles, hashtags, outbound links,
 * related domains, emails, phones, headings, social profiles and named
 * entities. No model is involved, so every pill traces to text on the page.
 */
import { normalizeTargetUrl, readPage, type ReadPage } from './reader';

export interface UrlIntel {
  success: boolean;
  target: string;
  domain: string;
  scrapeError: string | null;
  meta: { title: string; description: string; statusCode: number | null; language: string; siteName: string; sourceURL: string; image: string };
  screenshot: string | null;
  stats: { words: number; outboundLinks: number; internalLinks: number; uniqueDomains: number; handles: number; hashtags: number; emails: number; phones: number };
  handles: string[];
  tweetMentions: { value: string; count: number }[];
  hashtags: string[];
  emails: string[];
  phones: string[];
  socials: Record<string, string[]>;
  domainCounts: { value: string; count: number }[];
  outboundLinks: string[];
  internalLinks: string[];
  headings: string[];
  keySentences: string[];
  entities: { value: string; count: number }[];
  via: 'reader' | 'direct' | null;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
function uniq<T>(a: T[]): T[] {
  return Array.from(new Set(a));
}
function countBy(a: string[]): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of a) m.set(v, (m.get(v) || 0) + 1);
  return Array.from(m, ([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
}

const STOP = new Set(
  'the of and to a in is it for on with that by this as at from be or are was were has have had not but they we you he she his her them their our your an if so do does did can will would could should about into over more most other some any all one two three new news com www html http https'.split(' '),
);

export function extractProperNouns(text: string, max = 25): { value: string; count: number }[] {
  const matches = text.slice(0, 200000).match(/\b[A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]{2,}){0,3}\b/g) || [];
  const cleaned = matches.map((m) => m.trim()).filter((m) => !STOP.has(m.toLowerCase()) && m.length < 60);
  return countBy(cleaned).slice(0, max);
}

const SOCIAL_PATTERNS: Array<[string, RegExp]> = [
  ['x.com', /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{2,30})(?!\/status)/gi],
  ['instagram.com', /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,40})/gi],
  ['youtube.com', /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)?([A-Za-z0-9_.-]{2,60})/gi],
  ['tiktok.com', /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,40})/gi],
  ['github.com', /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_-]{2,40})\b/gi],
  ['linkedin.com', /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/([A-Za-z0-9_-]{2,80})/gi],
  ['facebook.com', /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.-]{2,60})/gi],
  ['reddit.com', /https?:\/\/(?:www\.)?reddit\.com\/(?:r|u|user)\/([A-Za-z0-9_-]{2,40})/gi],
  ['t.me', /https?:\/\/t\.me\/([A-Za-z0-9_]{2,40})/gi],
  ['discord', /https?:\/\/(?:discord\.gg|discord\.com\/invite)\/([A-Za-z0-9_-]{4,40})/gi],
];

/** Pure extraction over a read page. Exported for tests. */
export function intelFromPage(target: string, page: ReadPage | null, scrapeError: string | null): UrlIntel {
  const text = (page?.content ?? '').slice(0, 300000);
  const md = page?.markdown ?? '';
  const rootDomain = domainOf(target);
  const handles = uniq(((text + ' ' + md).match(/(?<![\w/])@[A-Za-z0-9_]{2,30}\b/g) || []).map((h) => h.toLowerCase()));
  const hashtags = uniq(((text + ' ' + md).match(/(?<![\w/&])#[A-Za-z][A-Za-z0-9_]{1,40}\b/g) || []).map((h) => h.toLowerCase()));
  const emails = uniq((text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((e) => e.toLowerCase()));
  const phones = uniq(text.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []);
  const linkUrls = (page?.links ?? []).map((l) => l.url);
  const urls = uniq([...linkUrls, ...(md.match(/https?:\/\/[^\s)\]<>"']+/g) || [])])
    .map((u) => u.replace(/[),.;:]+$/, ''))
    .filter((u) => {
      try {
        new URL(u);
        return true;
      } catch {
        return false;
      }
    });
  const outboundLinks = urls.filter((u) => domainOf(u) && domainOf(u) !== rootDomain);
  const internalLinks = urls.filter((u) => domainOf(u) === rootDomain && u !== target);
  const domainCounts = countBy(outboundLinks.map(domainOf).filter(Boolean)).slice(0, 40);

  const socials: Record<string, string[]> = {};
  const blob = md + '\n' + urls.join('\n');
  for (const [host, re] of SOCIAL_PATTERNS) {
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    let guard = 0;
    while ((m = re.exec(blob)) !== null && guard++ < 500) {
      const h = m[1].toLowerCase();
      if (!['share', 'intent', 'home', 'explore', 'search', 'i', 'settings', 'login', 'signup'].includes(h)) out.add(h);
    }
    if (out.size) socials[host] = Array.from(out).slice(0, 50);
  }

  const tweetMentions = countBy((text.match(/(?<![\w/])@[A-Za-z0-9_]{2,30}\b/g) || []).map((h) => h.toLowerCase())).slice(0, 50);
  const headings = (md.match(/^#{1,3}\s+(.+)$/gm) || []).map((h) => h.replace(/^#+\s+/, '').trim()).filter((h) => h.length > 2 && h.length < 200).slice(0, 30);
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 40 && s.length < 300 && !/^[#*\-|]/.test(s))
    .slice(0, 8);
  const entities = extractProperNouns(text, 30);

  return {
    success: true,
    target,
    domain: rootDomain,
    scrapeError,
    meta: {
      title: page?.title || '',
      description: page?.description || '',
      statusCode: page?.statusCode ?? null,
      language: page?.language || '',
      siteName: page?.siteName || '',
      sourceURL: page?.finalUrl || target,
      image: page?.image || '',
    },
    screenshot: null,
    stats: {
      words: text.split(/\s+/).filter(Boolean).length,
      outboundLinks: outboundLinks.length,
      internalLinks: internalLinks.length,
      uniqueDomains: domainCounts.length,
      handles: handles.length,
      hashtags: hashtags.length,
      emails: emails.length,
      phones: phones.length,
    },
    handles: handles.slice(0, 100),
    tweetMentions,
    hashtags: hashtags.slice(0, 100),
    emails: emails.slice(0, 50),
    phones: phones.slice(0, 50),
    socials,
    domainCounts,
    outboundLinks: outboundLinks.slice(0, 300),
    internalLinks: internalLinks.slice(0, 300),
    headings,
    keySentences: sentences,
    entities,
    via: page?.via ?? null,
  };
}

export async function mapUrl(input: string, signal?: AbortSignal): Promise<UrlIntel> {
  const target = normalizeTargetUrl(input);
  if (!target) throw new Error('that is not a public web address');
  let page: ReadPage | null = null;
  let scrapeError: string | null = null;
  try {
    page = await readPage(target, { signal, withLinks: true, timeoutMs: 18000 });
  } catch (e) {
    scrapeError = e instanceof Error ? e.message : 'read failed';
  }
  return intelFromPage(target, page, scrapeError);
}
