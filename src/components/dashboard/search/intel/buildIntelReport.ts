// Deterministic, non-AI intelligence report builder for a single page.
// Consumes the raw text content from zophiel-preview and extracts entities,
// signals, and key sentences using regex + frequency heuristics.

export interface IntelReport {
  domain: string;
  title: string;
  description: string;
  wordCount: number;
  readingTimeMin: number;
  isPaywalled: boolean;
  entities: { name: string; count: number }[];
  emails: string[];
  phones: string[];
  urls: string[];
  socials: { platform: string; handle: string; url: string }[];
  dates: string[];
  money: string[];
  numbers: string[];
  locations: string[];
  keySentences: string[];
  keywords: { word: string; count: number }[];
  language: string;
}

const STOP = new Set([
  "the","a","an","and","or","but","of","in","on","at","to","for","with","by","from","is","are","was","were","be","been","being","this","that","these","those","it","its","as","if","then","than","so","not","no","yes","do","does","did","has","have","had","will","would","can","could","should","may","might","must","i","you","he","she","we","they","them","their","our","your","my","me","us","him","her","his","hers","also","just","there","here","what","which","who","whom","whose","when","where","why","how","into","over","under","about","more","most","some","any","all","each","every","other","another","such","own","same","very","much","many","few","only","still","new","one","two","said","says","like","up","down","out","off","per","via","across","while","being","upon"
]);

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const RX = {
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  phone: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
  url: /https?:\/\/[^\s"'<>)]+/g,
  twitter: /(?:^|\s)@([A-Za-z0-9_]{2,15})\b/g,
  money: /(?:US?\$|€|£|¥|₹)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|trillion|M|B|K))?|\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|JPY|CNY|INR|dollars|euros|pounds)\b/gi,
  date: new RegExp(`\\b${MONTH}\\s+\\d{1,2},?\\s+\\d{4}\\b|\\b\\d{1,2}\\s+${MONTH}\\s+\\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b`, "gi"),
  number: /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?%\b/g,
  // Sequence of 2-5 Capitalized tokens — proxy for proper nouns.
  proper: /\b([A-Z][a-z]+(?:\s+(?:of|de|del|la|le|van|von|du|the|and)\s+)?(?:[A-Z][a-zA-Z]+\.?(?:\s+|$)){0,4})/g,
};

const COUNTRY_CITY = [
  "United States","United Kingdom","Russia","China","Ukraine","Israel","Palestine","Iran","Iraq","Syria","India","Pakistan","Japan","Korea","Germany","France","Spain","Italy","Canada","Mexico","Brazil","Argentina","Australia","Egypt","Turkey","Saudi Arabia","Afghanistan","Venezuela","Cuba","Poland","Hungary","Switzerland","Sweden","Norway","Finland","Netherlands","Belgium","Greece","Portugal","Ireland","Scotland","Wales",
  "Washington","New York","London","Paris","Berlin","Moscow","Beijing","Tokyo","Kyiv","Tehran","Damascus","Baghdad","Tel Aviv","Gaza","Mumbai","Delhi","Karachi","Rome","Madrid","Toronto","Mexico City","Los Angeles","Chicago","Houston","Miami","Boston","Dallas","Atlanta","Seattle","Hong Kong","Singapore","Dubai","Riyadh"
];

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).map(s => s.trim()).filter(s => s.length > 30 && s.length < 400);
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000).toLowerCase();
  if (/\b(the|and|of|to|in|that|is|for)\b/.test(sample)) return "English";
  if (/\b(le|la|les|de|et|que|pour|dans)\b/.test(sample)) return "French";
  if (/\b(el|la|los|las|de|que|para|con)\b/.test(sample)) return "Spanish";
  if (/\b(der|die|das|und|ist|von|zu|mit)\b/.test(sample)) return "German";
  return "Unknown";
}

export function buildIntelReport(input: {
  url: string;
  title?: string;
  description?: string;
  content: string;
  wordCount?: number;
  readingTimeMin?: number;
  isPaywalled?: boolean;
}): IntelReport {
  const text = (input.content || "").replace(/\u00a0/g, " ");
  const domain = extractDomain(input.url);

  const emails = uniq(text.match(RX.email) || []).slice(0, 20);
  const phones = uniq((text.match(RX.phone) || []).filter(p => p.replace(/\D/g, "").length >= 7)).slice(0, 15);
  const urls = uniq(text.match(RX.url) || []).filter(u => !u.includes(domain)).slice(0, 25);
  const money = uniq(text.match(RX.money) || []).slice(0, 20);
  const dates = uniq(text.match(RX.date) || []).slice(0, 20);
  const numbers = uniq(text.match(RX.number) || []).slice(0, 15);

  // Socials from URLs + @handles
  const socials: IntelReport["socials"] = [];
  for (const u of urls) {
    const lo = u.toLowerCase();
    const platforms: Record<string,string> = { "twitter.com":"X","x.com":"X","facebook.com":"Facebook","instagram.com":"Instagram","linkedin.com":"LinkedIn","youtube.com":"YouTube","tiktok.com":"TikTok","reddit.com":"Reddit","github.com":"GitHub","t.me":"Telegram","mastodon":"Mastodon"};
    for (const [host, name] of Object.entries(platforms)) {
      if (lo.includes(host)) {
        const handle = u.split("/").filter(Boolean).pop() || u;
        socials.push({ platform: name, handle, url: u });
        break;
      }
    }
  }
  const handleMatches = Array.from(text.matchAll(RX.twitter)).map(m => m[1]);
  for (const h of uniq(handleMatches).slice(0, 10)) {
    if (!socials.find(s => s.handle === h)) {
      socials.push({ platform: "X", handle: "@" + h, url: `https://x.com/${h}` });
    }
  }

  // Proper-noun entities
  const properCounts: Record<string, number> = {};
  let m: RegExpExecArray | null;
  const rx = new RegExp(RX.proper);
  while ((m = rx.exec(text)) !== null) {
    const name = m[1].trim().replace(/\s+/g, " ");
    if (name.length < 4 || name.length > 60) continue;
    if (STOP.has(name.toLowerCase())) continue;
    if (/^(The|This|That|These|Those|A|An|And|But|Or|If|When|Where|While|After|Before|Although|Because|Since|However|Indeed|Yet|So|Also|Even|Just|Still|New|One|Two|Three|First|Second|Third|Last|Next|Today|Tomorrow|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|June|July|August|September|October|November|December)\b/.test(name)) continue;
    properCounts[name] = (properCounts[name] || 0) + 1;
  }
  const entities = Object.entries(properCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 20);

  // Locations
  const locations = uniq(COUNTRY_CITY.filter(c => new RegExp(`\\b${c.replace(/ /g,"\\s+")}\\b`).test(text)));

  // Keywords (TF)
  const tokens = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const tf: Record<string, number> = {};
  for (const t of tokens) {
    if (STOP.has(t)) continue;
    tf[t] = (tf[t] || 0) + 1;
  }
  const keywords = Object.entries(tf)
    .map(([word, count]) => ({ word, count }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 15);

  // Key sentences: ranked by keyword density
  const topWords = new Set(keywords.slice(0, 10).map(k => k.word));
  const sentences = splitSentences(text);
  const ranked = sentences
    .map(s => {
      const ws: string[] = s.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      let score = 0;
      for (const w of ws) if (topWords.has(w)) score += 1;
      score = score / Math.sqrt(ws.length + 1);
      return { s, score };
    })
    .sort((a,b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.s);

  return {
    domain,
    title: input.title || "",
    description: input.description || "",
    wordCount: input.wordCount || tokens.length,
    readingTimeMin: input.readingTimeMin || Math.max(1, Math.round(tokens.length / 220)),
    isPaywalled: !!input.isPaywalled,
    entities,
    emails,
    phones,
    urls,
    socials,
    dates,
    money,
    numbers,
    locations,
    keySentences: ranked,
    keywords,
    language: detectLanguage(text),
  };
}
