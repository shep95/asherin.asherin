export type ArticleStatus = "current" | "archived" | "research" | "reference";

export type ArticleDisclosure = {
  status: ArticleStatus;
  statusLabel: string;
  boundaries: readonly { label: string; detail: string }[];
};

export type BlogPost = {
  slug: string;
  title: string;
  dek: string;
  tag: string;
  published: string; // ISO-8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ
  readTime: string;
  featured?: boolean;
  pinned?: boolean;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "/blog/asher-fold-memory",
    title: "asher.fold-memory, leftover memory, stored once",
    dek: "identical copies stored once. unique files stay their size. unfold returns the exact bits or refuses.",
    tag: "Release",
    published: "2026-08-16T06:00:00.000Z",
    readTime: "6 min",
    featured: true,
    pinned: true,
  },
  {
    slug: "/blog/personalities-are-not-thinking-patterns",
    title: "personalities are not thinking patterns",
    dek: "the exact conversion, piece by piece: identity lines become capability text, domain lists become recognition lenses, tier ladders become reasoning budgets, and conduct moves from character morality to forbidden reasoning patterns. with diagrams of both loops.",
    tag: "Method",
    published: "2026-08-11T00:00:00.000Z",
    readTime: "9 min",
    featured: true,
  },
  {
    slug: "/blog/ai-stack-for-indian-startups",
    title: "The AI stack for Indian startups that can't afford to fail",
    dek: "How early-stage founders in India use AI to compete with funded companies at 1/10th the cost. The real bottleneck is not compute or budget, it is instruction overhead.",
    tag: "Founder Notes",
    published: "2026-08-10T00:00:00.000Z",
    readTime: "7 min",
    featured: true,
    pinned: true,
  },
  {
    slug: "/blog/autonomous-intelligence-loop",
    title: "the supervised research loop",
    dek: "during an active request, asherin can detect research intent, use owner-scoped context, query available sources, preserve citations, and report degraded states. it does not run as an unsupervised background agent.",
    tag: "Product",
    published: "2026-08-07T00:00:00.000Z",
    readTime: "12 min",
    featured: true,
  },
  {
    slug: "/blog/bulwark-counter-surveillance",
    title: "notes on counter-surveillance, what a browser can and cannot see",
    dek: "an archived write-up. this is not a live dashboard tab, it is a note on what follower detection and network audits can honestly claim from inside a browser.",
    tag: "Security",
    published: "2026-08-06T00:00:00.000Z",
    readTime: "11 min",
  },
  {
    slug: "/blog/transit-guardian",
    title: "notes on trip safety, driver checks and telemetry, and their limits",
    dek: "an archived write-up on what plate-anchored checks and ride telemetry can show, and what public records do not give you. not a shipped dashboard tab.",
    tag: "Product",
    published: "2026-08-05T00:00:00.000Z",
    readTime: "11 min",
  },
  {
    slug: "/blog/asherin-maps-find-my",
    title: "asherin maps, satellite by default, and what it does not locate",
    dek: "satellite imagery by default, public dot camera feeds, osrm routing, and coarse bluetooth proximity rings. it does not locate a phone.",
    tag: "Product",
    published: "2026-08-04T00:00:00.000Z",
    readTime: "10 min",
    featured: true,
  },
  {
    slug: "/blog/cloud-intelligence-suite",
    title: "cloud intelligence, reading what google actually hands over",
    dek: "mail headers, calendar, drive, summarised and drafted with your consent, inside signed-in connect. it does not locate phones.",
    tag: "Product",
    published: "2026-08-03T00:00:00.000Z",
    readTime: "13 min",
    featured: true,
  },
  {
    slug: "/blog/asherin-engine-deep-time",
    title: "asherin engine, metadata-first search and deep-time retrieval",
    dek: "how one query becomes several retrieval legs across time: host lifespan, pdf metadata, redirect-chain origins, and a deduped exposure map.",
    tag: "Product",
    published: "2026-08-02T00:00:00.000Z",
    readTime: "12 min",
    featured: true,
  },

  {
    slug: "/blog/aureon-legal-advisor-multi-jurisdictional",
    title: "asherin legal mode, multi-jurisdictional legal research",
    dek: "a per-message legal-research setting that structures jurisdiction-specific research, asks for primary authority, preserves uncertainty, and clearly states that it is not legal advice.",
    tag: "Product",
    published: "2026-07-08T00:00:00.000Z",
    readTime: "8 min",
    featured: true,
  },
  {
    slug: "/blog/code-narrative-quantum-collapse",
    title: "code-as-narrative × candidate collapse, how we patch bugs",
    dek: "two methods, reading code as narrative, and collapsing candidate fixes, and why they make small models patch logical and ui bugs faster than raw prompting.",
    tag: "Engineering",
    published: "2026-07-01T00:00:00.000Z",
    readTime: "12 min",
    featured: true,
  },
  {
    slug: "/blog/the-truth-and-reality-of-wars",
    title: "the truth and reality of wars, an essay",
    dek: "Wars are scripted. The Bible calls it scripture for a reason. The field manual on how the elite use occultism to direct conflict, why fiat currency is the slave-collar you're conscripted to defend, and why every world war is an elite civil war dressed in flags.",
    tag: "Geopolitics",
    published: "2026-06-24T00:00:00.000Z",
    readTime: "14 min",
    featured: true,
    pinned: true,
  },

  {
    slug: "/blog/zaxin-tactical-ble-intelligence",
    title: "archived bluetooth signal research",
    dek: "what compatible browsers can observe after permission, why signal strength is only coarse proximity evidence, and why the retired concept cannot identify or locate a person.",
    tag: "Archive",
    published: "2026-06-26T00:00:00.000Z",
    readTime: "11 min",
    featured: true,
  },

  {
    slug: "/blog/elite-corporations-algorithms-vs-axrlen",
    title: "archived forecasting method, symbolism and probability",
    dek: "a retired method note on framing forecasts as probabilities with a window and an observable resolution rule.",
    tag: "Analysis",
    published: "2026-06-24T14:00:00.000Z",
    readTime: "5 min",
    featured: true,
  },


  {
    slug: "/blog/ai-vulnerability-scanning-explained",
    title: "AI vulnerability scanning, explained, beyond legacy SAST/DAST",
    dek: "What AI-powered vulnerability scanning actually means, how it differs from legacy SAST/DAST, where it adds real signal, and the named limitations to know before deploying.",
    tag: "Security",
    published: "2026-06-19",
    readTime: "9 min",
  },
  {
    slug: "/blog/vulnerability-chaining-explained",
    title: "Vulnerability chaining, explained, when 3 mediums equal 1 critical",
    dek: "Most critical real-world exploits are 2-4 low or medium findings combined. The anatomy of a chain, why isolated findings miss it, and how AI scanners surface it.",
    tag: "Security",
    published: "2026-06-19",
    readTime: "8 min",
  },
  {
    slug: "/blog/how-ai-predictive-forecasting-works",
    title: "How AI predictive forecasting actually works",
    dek: "Probability, window, signal fusion, verification plan, the four ingredients real forecasts need, and how to evaluate any AI forecasting platform against them.",
    tag: "Predictive",
    published: "2026-06-19",
    readTime: "9 min",
  },
  {
    slug: "/blog/how-we-make-aureon-sound-human",
    title: "How we make Asherin sound so human, the voice stack",
    dek: "A behind-the-scenes look at the layered persona architecture, appraisal, restraint, timing, leakage, that turns a generic model into a voice with weight.",
    tag: "Voice Design",
    published: "2026-07-01",
    readTime: "9 min",
  },
  {
    slug: "/blog/how-aureon-uses-c-seo-research",
    title: "How Asherin uses C-SEO research, practicing what the paper recommends",
    dek: "The C-SEO Bench paper formalized the discipline of ranking inside AI search engines. This is how Asherin's llms.txt, structural markup, and crawler policy implement its findings.",
    tag: "AI Search",
    published: "2026-06-19",
    readTime: "10 min",
  },
  {
    slug: "/blog/sovereign-ai-platforms",
    title: "The 2026 sovereign AI platform landscape",
    dek: "Eight serious platforms, four architecture patterns, and the four-layer test that eliminates 60% of sovereignty claims on first inspection.",
    tag: "Landscape",
    published: "2026-06-19",
    readTime: "11 min",
  },
  {
    slug: "/blog/what-is-ai-osint",
    title: "What is AI OSINT? The analyst's complete guide",
    dek: "The four-stage pipeline, the cross-validation requirement, and how to spot a search wrapper pretending to be AI OSINT.",
    tag: "Guide",
    published: "2026-06-19",
    readTime: "9 min",
  },
  {
    slug: "/blog/ai-without-restrictions",
    title: "AI with operator choice, the practical workflow",
    dek: "model choice, provider boundaries, prompt discipline, and workflow patterns for long sessions.",
    tag: "Operator Guide",
    published: "2026-06-19",
    readTime: "8 min",
  },
];



const DEFAULT_DISCLOSURE: ArticleDisclosure = {
  status: "reference",
  statusLabel: "public reference",
  boundaries: [
    { label: "scope", detail: "public explanation, not a promise of automated action." },
    { label: "sources", detail: "verify important claims against the linked primary material." },
    { label: "control", detail: "you decide what to use, save, export, or discard." },
  ],
};

const PRODUCT_BOUNDARIES = [
  { label: "evidence", detail: "results retain source links and uncertainty when available." },
  { label: "access", detail: "coverage depends on your permissions, connected sources, and provider limits." },
  { label: "control", detail: "you can stop a run, disconnect a source, and remove saved output." },
] as const;

export const ARTICLE_DISCLOSURES: Record<string, ArticleDisclosure> = {
  "/blog/asher-fold-memory": { status: "research", statusLabel: "experimental release", boundaries: [
    { label: "scope", detail: "deduplication works only on supplied files and supported storage paths." },
    { label: "integrity", detail: "restoration must match the original bytes or report failure." },
    { label: "availability", detail: "platform availability can change; the package is described, not sold, here." },
  ] },
  "/blog/personalities-are-not-thinking-patterns": { status: "reference", statusLabel: "method note", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/ai-stack-for-indian-startups": { status: "reference", statusLabel: "founder note", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/autonomous-intelligence-loop": { status: "current", statusLabel: "current workflow", boundaries: PRODUCT_BOUNDARIES },
  "/blog/bulwark-counter-surveillance": { status: "archived", statusLabel: "archived research", boundaries: [
    { label: "hardware", detail: "browser visibility is limited by device and operating-system permissions." },
    { label: "detection", detail: "signal persistence is an indicator, not proof of a person or intent." },
    { label: "availability", detail: "this is not presented as a current standalone dashboard room." },
  ] },
  "/blog/transit-guardian": { status: "archived", statusLabel: "archived research", boundaries: [
    { label: "sensors", detail: "phone telemetry can estimate motion; it cannot certify driver identity or safety." },
    { label: "records", detail: "public plate and operator data varies by jurisdiction and may be unavailable." },
    { label: "availability", detail: "this is not presented as a current standalone dashboard room." },
  ] },
  "/blog/asherin-maps-find-my": { status: "current", statusLabel: "current capability", boundaries: PRODUCT_BOUNDARIES },
  "/blog/cloud-intelligence-suite": { status: "current", statusLabel: "current connection", boundaries: [
    { label: "consent", detail: "only sources you authorize can be read, and access can be revoked." },
    { label: "coverage", detail: "results depend on the records exposed by the connected account." },
    { label: "privacy", detail: "account data remains isolated to the signed-in owner." },
  ] },
  "/blog/asherin-engine-deep-time": { status: "current", statusLabel: "current search method", boundaries: PRODUCT_BOUNDARIES },
  "/blog/aureon-legal-advisor-multi-jurisdictional": { status: "current", statusLabel: "current legal research", boundaries: [
    { label: "not advice", detail: "legal mode supports research and orientation; it does not replace counsel." },
    { label: "jurisdiction", detail: "you must name the controlling place and verify current primary authority." },
    { label: "citations", detail: "uncertain citations must be marked uncertain rather than invented." },
  ] },
  "/blog/code-narrative-quantum-collapse": { status: "reference", statusLabel: "engineering method", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/the-truth-and-reality-of-wars": { status: "reference", statusLabel: "opinion essay", boundaries: [
    { label: "genre", detail: "this is an attributed essay, not a verified product capability." },
    { label: "evidence", detail: "interpretive claims should be weighed against primary sources." },
    { label: "scope", detail: "publication does not convert opinion into established fact." },
  ] },
  "/blog/zaxin-tactical-ble-intelligence": { status: "archived", statusLabel: "retired concept", boundaries: [
    { label: "availability", detail: "zaxin is retired and is not sold or accessible as a current room." },
    { label: "bluetooth", detail: "web bluetooth requires user permission and does not provide precise location." },
    { label: "imagery", detail: "camera and map overlays do not identify a person or prove intent." },
  ] },
  "/blog/elite-corporations-algorithms-vs-axrlen": { status: "archived", statusLabel: "retired method note", boundaries: [
    { label: "availability", detail: "axrlen is retired and is not a current product surface." },
    { label: "forecast", detail: "probabilities are estimates, not facts or guarantees." },
    { label: "verification", detail: "a forecast needs a deadline and an observable resolution rule." },
  ] },
  "/blog/ai-vulnerability-scanning-explained": { status: "reference", statusLabel: "security guide", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/vulnerability-chaining-explained": { status: "reference", statusLabel: "security guide", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/how-ai-predictive-forecasting-works": { status: "archived", statusLabel: "forecasting reference", boundaries: [
    { label: "availability", detail: "the former axrlen room is retired; this method remains as reference." },
    { label: "probability", detail: "forecasts are estimates and must be scored after their stated window." },
    { label: "evidence", detail: "independent source classes reduce error but do not guarantee accuracy." },
  ] },
  "/blog/how-we-make-aureon-sound-human": { status: "reference", statusLabel: "design method", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/how-aureon-uses-c-seo-research": { status: "reference", statusLabel: "publishing method", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/sovereign-ai-platforms": { status: "reference", statusLabel: "landscape note", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/what-is-ai-osint": { status: "reference", statusLabel: "osint guide", boundaries: DEFAULT_DISCLOSURE.boundaries },
  "/blog/ai-without-restrictions": { status: "reference", statusLabel: "model-choice guide", boundaries: [
    { label: "providers", detail: "model behavior and availability remain controlled by each provider." },
    { label: "safety", detail: "reduced refusal does not remove legal, factual, or operational limits." },
    { label: "keys", detail: "saved provider keys are used only for the calls you choose to make." },
  ] },
};

export function getArticleDisclosure(pathname: string): ArticleDisclosure {
  return ARTICLE_DISCLOSURES[pathname] ?? DEFAULT_DISCLOSURE;
}
