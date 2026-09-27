// Single source of truth for in-app navigation: every dashboard view paired
// with a plain-language label, a codename subtitle, intent keywords, and the
// verb-first group it belongs to. Drives both the global Command Palette and
// the dashboard sidebar so users can navigate by intent, not by codename.

import type { DashboardView } from "@/components/dashboard/types";

// Groups are named after the job the user came to do, not the department the
// tool belongs to. Seven groups, every room one click inside one of them.
export type IntentGroup = "talk" | "watch" | "find" | "understand" | "make" | "keep" | "account";

export interface NavIntent {
  /** Dashboard view id (preferred). */
  view?: DashboardView;
  /** Or an absolute app route for non-dashboard pages. */
  route?: string;
  /** Plain-language label — what the user wants to DO. */
  label: string;
  /** Codename / brand name shown as small subtitle. */
  codename?: string;
  /** One-line job description. */
  blurb?: string;
  /** Keyword synonyms used by the palette to match intent. */
  keywords: string[];
  /** Verb-first intent group. */
  group: IntentGroup;
  /** Optional access tag. */
  access?: "search" | "pro";
  /** Only admin sees this. */
  adminOnly?: boolean;
}

// Navigation is grouped by job. Folded tools (slides, ebooks) no longer own a
// row — they are output types inside asherin.pages — but their views still
// resolve so old deep links keep working.
export const NAV_INTENTS: NavIntent[] = [
  // ── TALK ───────────────────────────────────────────────────────────────
  {
    view: "chat",
    label: "Chat",
    codename: "Asherin",
    blurb: "Ask for anything — search, maps, code, data, cyber all run from here",
    keywords: ["chat", "ask", "talk", "conversation", "prompt", "assistant"],
    group: "talk",
  },

  // ── WATCH ──────────────────────────────────────────────────────────────
  {
    view: "asherin-eye",
    label: "asherin.eye",
    codename: "asherin.eye",
    blurb: "photoreal 3d globe with live public flights, ships, sats, quakes, radio and osm sites",
    keywords: ["eye", "globe", "cesium", "flights", "ships", "satellites", "earthquakes", "cockpit", "hud", "3d"],
    group: "watch",
  },
  {
    view: "asherin-arvision",
    label: "asherin.arvision",
    codename: "asherin.arvision",
    blurb: "Live camera HUD — frame intel, freeze, barcode, honest cannot-resolve",
    keywords: ["arvision", "ar", "vision", "camera", "hud", "freeze", "lens", "look", "see"],
    group: "watch",
  },
  {
    view: "asherin-sentinel",
    label: "asherin.sentinel",
    codename: "asherin.sentinel",
    blurb: "Ambient watch — voices separated and named from their own words, sounds tagged, one searchable timeline",
    keywords: ["sentinel", "ambient", "listen", "audio", "microphone", "transcribe", "speaker", "voice", "diarization", "watch"],
    group: "watch",
  },
  {
    view: "asherin-defender",
    label: "asherin.defender",
    codename: "asherin.defender",
    blurb: "Your device — 186 named protections, measured honestly from this browser",
    keywords: [
      "defender",
      "bunker",
      "counter surveillance",
      "camera",
      "wifi",
      "bluetooth",
      "spy",
      "keylogger",
      "poison",
      "protect",
    ],
    group: "watch",
  },

  // ── FIND ───────────────────────────────────────────────────────────────
  {
    view: "search",
    label: "asherin.search",
    codename: "sourced search",
    blurb: "sourced search with credibility tiers",
    keywords: ["search", "zophiel", "osint", "web", "dark web", "leaks", "archives"],
    group: "find",
  },
  {
    view: "investigations",
    label: "asherin.investigations",
    codename: "multi-hop osint",
    blurb: "multi-hop osint research with provenance, contradictions, gaps and next-best hops",
    keywords: ["investigation", "investigations", "osint", "research", "due diligence", "background", "evidence", "provenance", "dossier", "trace"],
    group: "find",
  },
  {
    view: "zerlal",
    label: "asherin.cyber",
    codename: "domain + infra",
    blurb: "domain and infrastructure recon",
    keywords: ["cyber", "zerlal", "domain", "ports", "cve", "recon", "vulnerability"],
    group: "find",
  },
  {
    view: "google",
    label: "asherin.google",
    codename: "your accounts",
    blurb: "your connected google accounts, read on request",
    keywords: ["google", "gmail", "calendar", "drive", "accounts", "mesh"],
    group: "find",
  },
  {
    view: "file-scrapper",
    label: "asherin.extract",
    codename: "document text",
    blurb: "pull text and tables out of documents",
    keywords: ["extract", "scrapper", "scraper", "parse", "pdf", "ocr", "file"],
    group: "find",
  },
  {
    view: "briefing",
    label: "asherin.briefing",
    codename: "scheduled reading",
    blurb: "scheduled reading, sourced",
    keywords: ["briefing", "briefings", "daily", "digest", "news"],
    group: "find",
  },

  // ── UNDERSTAND ─────────────────────────────────────────────────────────

  {
    view: "azplen",
    label: "asherin.data",
    codename: "datasets",
    blurb: "datasets, analysis and charts",
    keywords: ["data", "azplen", "dataset", "ontology", "chart", "table"],
    group: "understand",
  },
  {
    view: "knowledge-vault",
    label: "asherin.knowledge",
    codename: "private corpus",
    blurb: "private files asherin can cite",
    keywords: ["knowledge", "vault", "corpus", "rag", "documents", "cite"],
    group: "understand",
  },
  {
    view: "asherin-health",
    label: "asherin.health",
    codename: "asherin.health",
    blurb: "your own anatomy read from your own record — bloodwork, medication, genes, exposures, pain and live sensors",
    keywords: ["health", "anatomy", "body", "pain", "blood", "labs", "medication", "herbs", "genes", "hrv", "organ"],
    group: "understand",
  },
  {
    view: "gematria",
    label: "asherin.gematria",
    codename: "letter values",
    blurb: "letter-value arithmetic and matches",
    keywords: ["gematria", "numerology", "letters", "values"],
    group: "understand",
  },
  {
    view: "vedic-astrology",
    label: "asherin.vedic",
    codename: "transits",
    blurb: "moon-driven transits and timing",
    keywords: ["vedic", "astrology", "transit", "dasha", "chart"],
    group: "understand",
  },
  {
    view: "pattern-analysis",
    label: "asherin.patterns",
    codename: "trend shapes",
    blurb: "find repeating shapes in your numbers and project them forward",
    keywords: ["pattern", "patterns", "trend", "forecast", "graph", "series"],
    group: "understand",
  },
  {
    view: "notebooks",
    label: "asherin.notebooks",
    codename: "shared analysis",
    blurb: "shared analysis sessions with versions",
    keywords: ["notebook", "notebooks", "analysis", "session", "collaborate", "versions"],
    group: "understand",
  },


  // ── MAKE ───────────────────────────────────────────────────────────────
  {
    view: "pdf-generator",
    label: "asherin.pages",
    codename: "document studio",
    blurb: "one prompt, one file — report, deck, book or pdf",
    keywords: [
      "pages",
      "pdf",
      "document",
      "report",
      "typeset",
      "typst",
      "slides",
      "slideshow",
      "deck",
      "presentation",
      "ebook",
      "book",
      "chapters",
      "write",
    ],
    group: "make",
  },
  {
    view: "zali",
    label: "asherin.design",
    codename: "design lab",
    blurb: "design exploration",
    keywords: ["design", "zali", "ui", "lab", "sketch"],
    group: "make",
  },
  {
    view: "zahten",
    label: "asherin.agents",
    codename: "agent forge",
    blurb: "build and publish an agent",
    keywords: ["agent", "agents", "zahten", "forge", "workflow", "deploy"],
    group: "make",
  },
  {
    view: "whiteboard",
    label: "asherin.whiteboard",
    codename: "Canvas",
    blurb: "Infinite canvas with layers, snap grids, and freeform sketching",
    keywords: ["whiteboard", "canvas", "draw", "sketch", "diagram", "board"],
    group: "make",
  },
  {
    view: "snippets",
    label: "asherin.snippets",
    codename: "saved code",
    blurb: "saved code you reuse",
    keywords: ["snippet", "snippets", "code", "reuse"],
    group: "make",
  },

  // ── KEEP ───────────────────────────────────────────────────────────────
  {
    view: "library",
    label: "Library",
    codename: "Library",
    blurb: "Saved files and references",
    keywords: ["library", "files", "storage", "documents"],
    group: "keep",
  },
  {
    view: "projects",
    label: "Projects",
    codename: "Projects",
    blurb: "Organize conversations into projects",
    keywords: ["project", "folder", "organize"],
    group: "keep",
  },
  {
    view: "memory",
    label: "asherin.vault",
    codename: "Vault",
    blurb: "Everything Asherin has learned about you, encrypted and yours to edit",
    keywords: ["memory", "remember", "context", "recall", "vault", "learned"],
    group: "keep",
  },
  {
    view: "guardian-vault",
    label: "Guardian Vault",
    codename: "Vault",
    blurb: "Passwords, TOTP, sessions, and activity — contents never enter chat",
    keywords: ["vault", "password", "secret", "mfa", "totp", "sessions", "activity"],
    group: "keep",
  },
  {
    view: "teams",
    label: "Team",
    codename: "Team",
    blurb: "Your company workspace — members, roles, invites, shared projects",
    keywords: ["team", "teams", "workspace", "members", "invite", "roles", "company", "org", "seats", "colleagues"],
    group: "keep",
  },

  // ── ACCOUNT ────────────────────────────────────────────────────────────
  {
    view: "settings",
    label: "Settings",
    codename: "Settings",
    keywords: ["settings", "preferences", "config", "options"],
    group: "account",
  },
  {
    view: "api-keys",
    label: "Connect",
    codename: "Connect",
    blurb: "Live capability pull-graph, bindings, and your encrypted provider keys (BYOK)",
    keywords: [
      "connect",
      "graph",
      "pulls",
      "bindings",
      "api",
      "api key",
      "byok",
      "keys",
      "provider",
      "openai",
      "anthropic",
      "gemini",
      "groq",
    ],
    group: "account",
  },
  {
    view: "stats",
    label: "asherin.activity",
    codename: "usage + trail",
    blurb: "what you used, and every recorded action on your account",
    keywords: ["activity", "usage", "stats", "audit", "trail", "log", "history", "streak"],
    group: "account",
  },
  {
    view: "community",
    label: "asherin.community",
    codename: "shared room",
    blurb: "shared prompts and rooms",
    keywords: ["community", "forum", "shared", "people"],
    group: "account",
  },
  {
    view: "bug-reports",
    label: "asherin.bugs",
    codename: "your reports",
    blurb: "what you reported, and its state",
    keywords: ["bug", "bugs", "report", "issue", "broken"],
    group: "account",
  },
];

export const INTENT_GROUPS: IntentGroup[] = ["talk", "watch", "find", "understand", "make", "keep", "account"];

export const INTENT_GROUP_BLURB: Record<IntentGroup, string> = {
  talk: "ask for anything",
  watch: "live cameras, sound, device, globe",
  find: "search, recon, your own accounts",
  understand: "data, knowledge, body, timing",
  make: "documents, design, agents, canvas",
  keep: "library, projects, vault, team",
  account: "settings, billing, keys, activity",
};

/* ───────────────────────── Recents ───────────────────────── */

const RECENT_KEY = "aureon_recent_intents";
const RECENT_MAX = 6;

export function trackRecentIntent(viewOrRoute: string): void {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((x) => x !== viewOrRoute);
    filtered.unshift(viewOrRoute);
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, RECENT_MAX)));
    window.dispatchEvent(new CustomEvent("aureon-recents-changed"));
  } catch {
    /* ignore */
  }
}

export function getRecentIntents(): NavIntent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    return list.map((key) => NAV_INTENTS.find((i) => (i.view ?? i.route) === key)).filter((i): i is NavIntent => !!i);
  } catch {
    return [];
  }
}

/* ─────────────────────── Auto config ─────────────────────── */

export interface ChatConfigHint {
  mode?: "chat" | "code" | "research" | "truth";
  depth?: "concise" | "standard" | "detailed";
}

/** Infer chat mode/depth/persona from the user's first sentence. */
export function inferChatConfig(text: string): ChatConfigHint {
  const lower = text.toLowerCase();
  const out: ChatConfigHint = {};

  // MODE
  if (
    /\b(debug|refactor|implement|function|class|api|typescript|python|react|compile|build|error|stack trace)\b/.test(
      lower,
    )
  ) {
    out.mode = "code";
  } else if (
    /\b(research|sources?|study|cite|literature|paper|academic|investigate|find out|deep dive)\b/.test(lower)
  ) {
    out.mode = "research";
  } else if (/\b(truth|uncensored|honest|raw|no filter|brutally|direct)\b/.test(lower)) {
    out.mode = "truth";
  }

  // DEPTH
  if (/\b(quick|short|brief|tldr|one line|summary|summari[sz]e|in a sentence)\b/.test(lower)) {
    out.depth = "concise";
  } else if (
    /\b(detailed|comprehensive|exhaustive|deep|long|full|thorough|step by step|walk me through)\b/.test(lower)
  ) {
    out.depth = "detailed";
  }

  return out;
}
