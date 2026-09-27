/**
 * Vercel Edge Middleware — runs in front of every HTML request.
 *
 * Three jobs, all cheap:
 *   1. Scrapers and AI-training crawlers get a 403 on page requests. Search
 *      engines and social-preview fetchers are allow-listed by name so SEO and
 *      link previews keep working.
 *   2. A per-IP request budget for page loads (token bucket, per edge
 *      instance). It is a speed bump, not a wall: one instance forgets the
 *      bucket when it recycles, and the real enforcement for expensive work
 *      lives in the edge functions that do that work.
 *   3. Recon paths (/.git, /.env, /wp-admin, …) answer 404 before the SPA
 *      shell can turn them into a soft 200.
 *
 * Static assets under /assets, images, fonts and the service workers are
 * excluded by the matcher so this never sits on the hot path for the bundle.
 */

export const config = {
  matcher: ["/((?!assets/|wallpapers/|fonts/|models/|wasm/|sentinel/|favicon|manifest\\.json|sw\\.js|sw-sentinel\\.js|robots\\.txt|sitemap\\.xml|llms\\.txt|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|css|js|map|woff2?|ttf|otf|mp4|webm|onnx|glb|bin)$).*)"],
};

/** Crawlers that are welcome: search engines and link-preview fetchers. */
const ALLOWED_BOTS =
  /googlebot|google-inspectiontool|adsbot-google|bingbot|bingpreview|duckduckbot|applebot|yandex(bot|images)|baiduspider|slurp|twitterbot|facebookexternalhit|facebot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|pinterestbot|redditbot|embedly|quora link preview|skypeuripreview|vercel-screenshot|lighthouse|chrome-lighthouse|pagespeed/i;

/** Scrapers, bulk downloaders and AI-training crawlers. */
const BLOCKED_BOTS =
  /gptbot|chatgpt-user|oai-searchbot|ccbot|claudebot|claude-web|anthropic-ai|cohere-ai|perplexitybot|youbot|bytespider|amazonbot|petalbot|dataforseobot|semrushbot|ahrefsbot|mj12bot|dotbot|blexbot|serpstatbot|seokicks|megaindex|zoominfobot|omgili|diffbot|img2dataset|scrapy|httrack|webcopier|webzip|wget|curl\/|python-requests|python-urllib|aiohttp|go-http-client|java\/|libwww-perl|okhttp|node-fetch|axios\/|phantomjs|headlesschrome|puppeteer|playwright|selenium|nutch|heritrix|larbin|sitesucker|offline explorer|teleport|grabber|harvest|extract|scraper/i;

/** Paths a scanner probes; none of them exist here. */
const RECON =
  /^\/(\.git|\.svn|\.hg|\.env|\.aws|\.ssh|\.well-known\/(?!security\.txt$)|wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|phpinfo\.php|cgi-bin|actuator|debug|admin\/|administrator|console|server-status|vendor\/|node_modules\/|\.vscode|\.idea|backup|db\.sql|dump\.sql|config\.(php|json|yml|yaml)|api(\/|$))/i;

type Bucket = { tokens: number; ts: number };
const buckets = new Map<string, Bucket>();
const CAPACITY = 90; // page loads per window per IP
const REFILL_PER_SEC = 1.5; // ≈ 90 per minute sustained
const SWEEP_EVERY = 5_000;
let lastSweep = 0;

function allow(ip: string): boolean {
  const now = Date.now();
  if (now - lastSweep > SWEEP_EVERY) {
    lastSweep = now;
    for (const [k, b] of buckets) if (now - b.ts > 120_000) buckets.delete(k);
  }
  const b = buckets.get(ip) ?? { tokens: CAPACITY, ts: now };
  b.tokens = Math.min(CAPACITY, b.tokens + ((now - b.ts) / 1000) * REFILL_PER_SEC);
  b.ts = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

function deny(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      ...extra,
    },
  });
}

export default function middleware(req: Request): Response | undefined {
  const url = new URL(req.url);
  const path = url.pathname;

  if (RECON.test(path)) return deny(404, "not found");

  // Only page navigations are policed here; API-style calls go to Supabase,
  // not to this origin.
  const accept = req.headers.get("accept") || "";
  const isPage = req.method === "GET" && (accept.includes("text/html") || accept === "*/*" || accept === "");
  if (!isPage) return undefined;

  const ua = req.headers.get("user-agent") || "";
  if (!ALLOWED_BOTS.test(ua)) {
    if (!ua || BLOCKED_BOTS.test(ua)) return deny(403, "forbidden");
    // Real browsers send Sec-Fetch-Mode on navigations. Its absence on a
    // browser-shaped UA is the signature of a headless fetch pretending.
    const mode = req.headers.get("sec-fetch-mode");
    const looksLikeBrowser = /mozilla\/5\.0/i.test(ua);
    if (looksLikeBrowser && mode && mode !== "navigate" && mode !== "same-origin" && mode !== "no-cors") {
      return deny(403, "forbidden");
    }
  }

  const ip =
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "anon";
  if (!ALLOWED_BOTS.test(ua) && !allow(ip)) {
    return deny(429, "slow down", { "retry-after": "30" });
  }

  return undefined;
}
