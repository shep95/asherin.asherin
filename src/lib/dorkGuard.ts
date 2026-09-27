// dorkGuard.ts — client-side Google-dork / recon hardening.
//
// Narrative → Flaws → New narrative:
//
// Original narrative: "Aureon has a lot of public pages, some of which surface
// sensitive route names, admin surfaces, and query params (?token=, ?email=)
// that Google dorks can enumerate via `site:aureonai.app inurl:admin`,
// `intitle:"index of"`, `filetype:env`, etc."
//
// Flaws in the original defense (robots.txt only):
//   1. Robots.txt is a POLITE hint, not enforcement. Malicious bots ignore it.
//   2. Robots.txt only affects crawl, not the URLs already indexed via
//      backlinks. Google indexes URLs it never crawled if links point at them.
//   3. Robots.txt does not scrub query-param leakage in referrers.
//   4. Sensitive routes (auth callbacks, dashboards, admin) can still be
//      indexed if a link exists somewhere on the web.
//   5. Client-side SPA routes render 200 for /admin, /wp-admin, /.env etc.
//      before React resolves 404 — dork operators see the 200 and add it.
//
// New narrative: enforce a layered defense:
//   L1 — robots.txt (already updated) blocks the polite bots.
//   L2 — meta robots noindex/nofollow injected at runtime on any route
//        matching the sensitive pattern list, so even indexed URLs get
//        de-indexed on Google's next fetch.
//   L3 — scrub `?token=…`, `?apikey=…`, `?password=…`, `?email=…`,
//        `?session=…` from window.location + history so it never lands in
//        referrer headers or analytics.
//   L4 — replace referrer policy to `strict-origin-when-cross-origin` (belt
//        + suspenders vs the meta tag in index.html).
//   L5 — set `X-Robots-Tag`-equivalent noindex meta on 404s so dork probes
//        for /wp-admin, /.env, /phpmyadmin all get a de-indexable 404.
//
// This runs once at App boot. It is idempotent and cheap.

const SENSITIVE_ROUTE_PATTERNS: RegExp[] = [
  /^\/dashboard(\/|$)/i,
  /^\/asher-dashboard(\/|$)/i,
  /^\/asherin[.-]gov\/dashboard(\/|$)/i,
  /^\/ziaassets(\/|$)/i,
  /^\/whiteboard(\/|$)/i,
  /^\/admin(\/|$)/i,
  /^\/wp-admin(\/|$)/i,
  /^\/wp-login/i,
  /^\/phpmyadmin(\/|$)/i,
  /^\/\.env/i,
  /^\/\.git(\/|$)/i,
  /^\/\.aws(\/|$)/i,
  /^\/\.ssh(\/|$)/i,
  /^\/\.well-known\/(?!security\.txt)/i,
  /^\/config(\/|$)/i,
  /^\/backup(s)?(\/|$)/i,
  /^\/server-(status|info)/i,
  /^\/debug(\/|$)/i,
  /^\/api\/internal(\/|$)/i,
  /^\/api\/admin(\/|$)/i,
  /^\/functions\/v1(\/|$)/i,
  /^\/rest\/v1(\/|$)/i,
  /\.(sql|bak|log|env|pem|key|pfx|p12|kdbx|ovpn)$/i,
];

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "apikey",
  "api_key",
  "password",
  "passwd",
  "pwd",
  "secret",
  "client_secret",
  "session",
  "sessionid",
  "sid",
  "auth",
  "authorization",
  "otp",
  "totp",
  "mfa",
  // NOTE: "code" and "state" (OAuth), "invite"/"invite_token" (Asher invitations)
  // are intentionally NOT scrubbed here — downstream components
  // (MultiAccountManager, AsherInvitationsBanner) must read them on mount
  // and clean the URL themselves after consumption. Scrubbing them here
  // pre-render silently breaks Google OAuth callback + invitation accept.
  "email",    // PII — avoid dork operators pivoting from search cache
  "phone",
  "signature",
  "sig",
  "hmac",
]);


function upsertMetaRobots(content: string) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "robots");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertReferrerPolicy() {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "referrer");
    document.head.appendChild(el);
  }
  // strict-origin-when-cross-origin: browser sends origin (not path/query) to
  // third parties, and only sends full URL to same-origin. Kills the primary
  // way dork operators harvest URLs via referrer logs.
  el.setAttribute("content", "strict-origin-when-cross-origin");
}

function scrubSensitiveQuery() {
  try {
    const url = new URL(window.location.href);
    if (!url.search) return;
    let mutated = false;
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
        mutated = true;
      }
    }
    if (mutated) {
      // replaceState — do not add a new history entry, and do not trigger a
      // navigation. The URL is scrubbed in-place before any downstream code
      // (analytics, referrer, error reporter) reads window.location.href.
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch { /* URL parse failed — nothing to scrub */ }
}

function applyRouteHardening() {
  const path = window.location.pathname;
  const sensitive = SENSITIVE_ROUTE_PATTERNS.some((rx) => rx.test(path));
  if (sensitive) {
    upsertMetaRobots("noindex, nofollow, noarchive, nosnippet, noimageindex");
  }
}

let started = false;
export function initDorkGuard() {
  if (started || typeof window === "undefined") return;
  started = true;

  upsertReferrerPolicy();
  scrubSensitiveQuery();
  applyRouteHardening();

  // SPA navigation — re-apply on route change. React Router pushes to
  // history without a full page reload, so we listen to popstate + patch
  // pushState/replaceState.
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  window.history.pushState = function (...args) {
    const result = originalPush.apply(this, args as Parameters<typeof originalPush>);
    queueMicrotask(() => { scrubSensitiveQuery(); applyRouteHardening(); });
    return result;
  };
  window.history.replaceState = function (...args) {
    const result = originalReplace.apply(this, args as Parameters<typeof originalReplace>);
    queueMicrotask(() => { scrubSensitiveQuery(); applyRouteHardening(); });
    return result;
  };
  window.addEventListener("popstate", () => { scrubSensitiveQuery(); applyRouteHardening(); });
}
