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
    label: "chat",
    codename: "shepherd",
    blurb: "Ask shepherd for anything — search, maps, code, data, cyber all run from here",
    keywords: ["chat", "ask", "talk", "conversation", "prompt", "assistant"],
    group: "talk",
  },

  // ── WATCH ──────────────────────────────────────────────────────────────
  {
    view: "asherin-adam",
    label: "asherin.adam",
    codename: "live globe",
    blurb: "a live globe on this device — imagery, terrain, earthquakes, recent satellite passes. what leaves: map tiles, and only the places and weather you ask for",
    keywords: ["adam", "eye", "globe", "map", "earth", "satellite", "cesium", "terrain", "earthquakes", "imagery", "3d"],
    group: "watch",
  },
  {
    view: "asherin-arvision",
    label: "asherin.arvision",
    codename: "camera hud",
    blurb: "a live camera head-up display on this device — frame intel, filters, barcode, ocr, and cannot-resolve where nothing resolves",
    keywords: ["arvision", "ar", "vision", "camera", "hud", "lens", "look", "see"],
    group: "watch",
  },
  {
    view: "asherin-sentinel",
    label: "asherin.sentinel",
    codename: "ambient watch",
    blurb: "ambient watch — voices separated and named from their own words, sounds tagged, one searchable timeline on this device",
    keywords: ["sentinel", "ambient", "listen", "audio", "microphone", "transcribe", "speaker", "voice", "diarization", "watch"],
    group: "watch",
  },
  {
    view: "asherin-defender",
    label: "asherin.defender",
    codename: "protections, measured",
    blurb: "your own device — a register of named protections; the browser measures what it can and names what it cannot",
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
    keywords: ["search", "zophiel", "osint", "web", "news", "academic", "code", "archive", "deep search", "intel map"],
    group: "find",
  },
  {
    view: "zerlal",
    label: "asherin.cyber",
    codename: "domain + infra",
    blurb: "domain and infrastructure context",
    keywords: ["cyber", "zerlal", "domain", "ports", "cve", "recon", "vulnerability"],
    group: "find",
  },
  {
    view: "google",
    label: "asherin.google",
    codename: "your accounts",
    blurb: "google desks — no account path on this device yet",
    keywords: ["google", "gmail", "calendar", "drive", "accounts", "mesh"],
    group: "find",
  },
  {
    view: "file-scrapper",
    label: "asherin.extract",
    codename: "document text",
    blurb: "pull text out of documents",
    keywords: ["extract", "scrapper", "scraper", "parse", "pdf", "ocr", "file"],
    group: "find",
  },
  {
    view: "briefing",
    label: "asherin.briefing",
    codename: "written briefing",
    blurb: "a briefing from what you watch, on request",
    keywords: ["briefing", "briefings", "daily", "digest", "news"],
    group: "find",
  },

  // ── UNDERSTAND ─────────────────────────────────────────────────────────

  {
    view: "azplen",
    label: "asherin.data",
    codename: "datasets",
    blurb: "datasets, analysis and charts",
    keywords: ["data", "azplen", "dataset", "csv", "spreadsheet", "chart", "table", "ask"],
    group: "understand",
  },
  {
    view: "knowledge-vault",
    label: "asherin.knowledge",
    codename: "private corpus",
    blurb: "your documents, indexed on this device and cited",
    keywords: ["knowledge", "vault", "corpus", "rag", "documents", "cite"],
    group: "understand",
  },
  {
    view: "asherin-health",
    label: "asherin.health",
    codename: "your records",
    blurb: "your own anatomy read from your own record — bloodwork, medication, genes, exposures, pain and live sensors",
    keywords: ["health", "anatomy", "body", "pain", "blood", "labs", "medication", "herbs", "genes", "hrv", "organ"],
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
    view: "notebooks",
    label: "asherin.notebooks",
    codename: "notebooks",
    blurb: "cells of notes, code and questions for shepherd, with versions",
    keywords: ["notebook", "notebooks", "analysis", "cells", "prompt", "versions"],
    group: "understand",
  },


  // ── MAKE ───────────────────────────────────────────────────────────────
  {
    view: "pdf-generator",
    label: "asherin.pages",
    codename: "page, deck or book",
    blurb: "one prompt, one file — a typeset page, a deck or a chaptered book, written on this device",
    keywords: [
      "pages",
      "pdf",
      "document",
      "report",
      "typeset",
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
    blurb: "design projects with shepherd on this device",
    keywords: ["design", "zali", "spec", "materials", "components", "viewport", "lab"],
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
    codename: "canvas",
    blurb: "an infinite canvas with layers, snap grids and ink, encrypted on this device",
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
    label: "library",
    codename: "files on this device",
    blurb: "files kept on this device, searched by what they say",
    keywords: ["library", "files", "storage", "documents"],
    group: "keep",
  },
  {
    view: "projects",
    label: "projects",
    codename: "workspaces",
    blurb: "workspaces with their own files, directions and conversations",
    keywords: ["project", "folder", "organize"],
    group: "keep",
  },
  {
    view: "memory",
    label: "asherin.vault",
    codename: "what shepherd knows",
    blurb: "what shepherd has learned about you, sealed on this device and yours to forget",
    keywords: ["memory", "remember", "context", "recall", "vault", "learned"],
    group: "keep",
  },
  {
    view: "guardian-vault",
    label: "guardian vault",
    codename: "device security",
    blurb: "key vault, sealed items, authenticator codes and the device trail — contents never enter chat",
    keywords: ["vault", "password", "secret", "passphrase", "totp", "authenticator", "trail", "device security"],
    group: "keep",
  },

  // ── ACCOUNT ────────────────────────────────────────────────────────────
  {
    view: "settings",
    label: "settings",
    codename: "this device",
    blurb: "how asherin looks and works on this device — keys, memory, spend, export",
    keywords: ["settings", "preferences", "config", "options", "keys", "export", "wipe"],
    group: "account",
  },
  {
    view: "api-keys",
    label: "connect",
    codename: "what ran",
    blurb: "what actually ran on this device, what it is bound to, and the provider keys it answers with",
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
    blurb: "what you did here, and what this device recorded about itself",
    keywords: ["activity", "usage", "stats", "audit", "trail", "log", "history", "streak"],
    group: "account",
  },
  {
    view: "bug-reports",
    label: "asherin.bugs",
    codename: "your log",
    blurb: "what broke and what you want, logged on this device",
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
  keep: "library, projects, vault, guardian",
  account: "settings, keys, activity, device",
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
