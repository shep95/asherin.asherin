// Shared per-route SEO source of truth.
//
// Consumed at runtime by src/components/RouteSeo.tsx and at build time by
// scripts/seoPrerenderPlugin.ts, which bakes these tags into static per-route
// HTML so non-JS crawlers (social previews, plain HTTP fetchers) see them too.
//
// Rules for this file:
//  - only paths that render a real public page live here. A path in this map
//    becomes a physical prerendered index.html, so listing a retired or
//    redirect-only path would manufacture a soft-404 with a marketing title.
//  - titles are short and match the visible page. No category sentences, no
//    keyword stacks, no "operator stack" costume, no Aureon.
//  - descriptions state what the page is, in one plain line.

export const ORIGIN = "https://asherin.com";
export const DEFAULT_OG_IMAGE = "https://asherin.com/asherin-share.jpg?v=20260927b";

export type SeoEntry = {
  title: string;
  description: string;
  ogType?: "website" | "article" | "product";
  /** ISO date (YYYY-MM-DD) — required for editorial routes so Article JSON-LD is valid. */
  datePublished?: string;
  dateModified?: string;
  noindex?: boolean;
  /** Public page, but deliberately kept out of sitemap.xml. */
  excludeFromSitemap?: boolean;
};

export const ROUTE_SEO: Record<string, SeoEntry> = {
  "/": {
    title: "asherin, look a little closer.",
    description:
      "asherin is a sourced research workspace: chat, asherin.cyber, asherin.defender, asherin.arvision and asherin.eye..",
  },

  // --- Product / company ---
  "/asherin.acatalepsy": {
    title: "asherin.acatalepsy — local data visualization",
    description: "free, no-login data profiling and visualization in your browser. deterministic rules, no ai processing, and no uploaded data stored on a server.",
    ogType: "product",
  },
  "/asherin.analytics": {
    title: "asherin.analytics — the public record of who arrives here",
    description:
      "a public, live analytics record for asherin: visitors, returning visitors, sources, pages, countries and regions, ai crawlers, suspected vpn exits, sign-ups and page speed.",
  },
  "/software": {
    title: "software | asherin",
    description:
      "the rooms on a seat: chat, asherin.cyber, asherin.defender, asherin.arvision, asherin.eye, library, projects, memory, vault, whiteboard, connect, team..",
  },
  "/for": {
    title: "who asherin is for",
    description:
      "five desks. same seat: sourced chat, public-index search, a map, a vault, memory. first click is look, wikipedia + wayback, not a paywall..",
  },
  "/for/research": {
    title: "asherin for people who already chat with a model",
    description:
      "if you already talk to a model and need sources beside the answer, a map, files, and a vault, that is this seat..",
  },
  "/for/journalists": {
    title: "asherin for journalists",
    description:
      "sourced research for reporting: citations beside the answer, public-index search, a map for place, and a vault that does not enter chat..",
  },
  "/for/companies": {
    title: "asherin for companies that need intelligence-grade research",
    description:
      "a sourced research seat for teams: chat, public-index search, maps, vault, memory, connect, team..",
  },
  "/for/investigators": {
    title: "asherin for private investigators",
    description:
      "public-index research, a talkable map, and a vault that stays out of chat. for licensed investigators working open sources..",
  },
  "/for/analysts": {
    title: "asherin for data analytics people",
    description:
      "a sourced research seat for analysts: ask with citations, keep files and memory, map a place, connect the model you already use..",
  },
  "/founder": {
    title: "Founder | asherin",
    description: "asher newton, who built asherin, and the book he wrote alongside it.",
  },
  "/forums": {
    title: "notes from the work line | asherin",
    description:
      "public product notes, current plans, research records, and dated engineering updates from asherin.",
  },

  // --- Legal ---
  "/privacy": {
    title: "Privacy | asherin",
    description: "how asherin stores, encrypts and retains your data, and what you can ask us to delete.",
  },
  "/terms": {
    title: "Terms | asherin",
    description: "the terms of service for using asherin.",
  },
  "/security-policy": {
    title: "Security Policy | asherin",
    description: "how to report a vulnerability in asherin, and what we do when you do.",
  },

  // --- Blog index ---
  "/blog": {
    title: "Blog | asherin",
    description: "long-form write-ups on how the parts of asherin work, and what they cannot do yet.",
  },

  // --- Blog posts ---
  "/blog/what-is-ai-osint": {
    title: "What is AI OSINT?",
    description: "the four stages of an osint pipeline, and how to tell one apart from a search wrapper.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/sovereign-ai-platforms": {
    title: "The 2026 sovereign AI landscape",
    description: "four architecture patterns, and the four-layer test for whether a sovereignty claim holds.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/ai-without-restrictions": {
    title: "Working without vendor refusal defaults",
    description: "model choice, prompt discipline, and refusal detection over long sessions.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/elite-corporations-algorithms-vs-axrlen": {
    title: "Forecasting, symbolism, and probability",
    description: "an archived method note on probability, windows, symbolic candidate generation, and honest verification.",
    ogType: "article",
    datePublished: "2026-06-24",
  },
  "/blog/ai-vulnerability-scanning-explained": {
    title: "AI vulnerability scanning, explained",
    description: "signal collection, exploit-path reasoning, false-positive suppression, confidence scoring.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/vulnerability-chaining-explained": {
    title: "Vulnerability chaining, explained",
    description: "how low-severity findings combine into one compromise path, with worked examples.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/how-ai-predictive-forecasting-works": {
    title: "How AI forecasting actually works",
    description: "signal fusion, scenario branching, probability weighting, and why calibration beats confidence.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/how-aureon-uses-c-seo-research": {
    title: "How asherin uses conversational SEO research",
    description: "entity clustering, answer-shaped pages, and measuring citations inside AI answers.",
    ogType: "article",
    datePublished: "2026-06-19",
  },
  "/blog/how-we-make-aureon-sound-human": {
    title: "How we make asherin sound human",
    description: "cadence, specificity, refusal of filler, and the review passes every page survives.",
    ogType: "article",
    datePublished: "2026-07-01",
  },
  "/blog/ai-stack-for-indian-startups": {
    title: "An AI stack for early-stage Indian startups",
    description: "the bottleneck is workflow logic, not compute or budget.",
    ogType: "article",
    datePublished: "2026-08-10",
  },
  "/blog/code-narrative-quantum-collapse": {
    title: "Code-to-narrative and candidate collapse",
    description: "turn a prompt into a narrative, hunt the flaws, then collapse the candidates into one answer.",
    ogType: "article",
    datePublished: "2026-07-01",
  },
  "/blog/the-truth-and-reality-of-wars": {
    title: "The truth and reality of wars",
    description: "incentive maps, resource clocks, and the exhaustion cycles that decide conflicts.",
    ogType: "article",
    datePublished: "2026-06-24",
  },
  "/blog/zaxin-tactical-ble-intelligence": {
    title: "Archived bluetooth signal research",
    description: "a retired concept and the limits of what browser bluetooth signals can show.",
    ogType: "article",
    datePublished: "2026-06-26",
  },
  "/blog/asherin-engine-deep-time": {
    title: "The asherin engine and deep time",
    description: "reading long cycles instead of headlines, and where that reading breaks.",
    ogType: "article",
    datePublished: "2026-08-02",
  },
  "/blog/cloud-intelligence-suite": {
    title: "Cloud intelligence in asherin",
    description: "what asherin can read from a google account you authorize, with permission and coverage limits.",
    ogType: "article",
    datePublished: "2026-08-03",
  },
  "/blog/asherin-maps-find-my": {
    title: "asherin maps and finding your own devices",
    description: "how the map layer handles your locations, and who can see them.",
    ogType: "article",
    datePublished: "2026-08-04",
  },
  "/blog/transit-guardian": {
    title: "Archived trip-safety research",
    description: "what phone telemetry and public records can show about a trip, without claiming identity or safety certainty.",
    ogType: "article",
    datePublished: "2026-08-05",
  },
  "/blog/bulwark-counter-surveillance": {
    title: "Counter-surveillance notes",
    description: "what a browser can legitimately observe about the devices and trackers around it.",
    ogType: "article",
    datePublished: "2026-08-06",
    // Research notes, not a sold product surface — kept out of the sitemap.
    excludeFromSitemap: true,
  },
  "/blog/autonomous-intelligence-loop": {
    title: "The supervised intelligence loop",
    description: "how an active request is routed through collection, verification, memory, and visible degraded states.",
    ogType: "article",
    datePublished: "2026-08-07",
  },
  "/blog/aureon-legal-advisor-multi-jurisdictional": {
    title: "Multi-jurisdictional legal research in asherin",
    description: "jurisdiction-specific research with source verification and uncertainty; not legal advice.",
    ogType: "article",
    datePublished: "2026-07-08",
  },
  "/blog/personalities-are-not-thinking-patterns": {
    title: "Personalities are not thinking patterns",
    description: "why a persona is not a reasoning procedure, and what we replaced ours with.",
    ogType: "article",
    datePublished: "2026-08-12",
  },

  "/blog/asher-fold-memory": {
    title: "asher.fold-memory, leftover memory, stored once",
    description:
      "identical copies stored once. unique files stay their size. unfold returns the exact bits or refuses. $99 one-time pack, no account.",
    ogType: "article",
    datePublished: "2026-08-16",
  },

  // --- Glossary ---

  // --- Feature pages ---
};

// /asher is intentionally NOT skipped — it has an SEO entry and is in the
// sitemap; skipping it let the static homepage canonical leak through and made
// crawlers read /asher as a duplicate of "/".
export const SKIP_PREFIXES = ["/dashboard", "/asher-dashboard", "/internal"];

/** Public routes that belong in sitemap.xml. */
export function sitemapPaths(): string[] {
  return Object.entries(ROUTE_SEO)
    .filter(([, e]) => !e.noindex && !e.excludeFromSitemap)
    .map(([path]) => path);
}
