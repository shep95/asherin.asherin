/**
 * asherin.briefing — the pure part.
 *
 * Everything here is a function of its arguments: the setup-conversation
 * prompt, the reply parser that lifts a profile out of shepherd's answer, the
 * briefing prompt, and the report parser that turns the markdown shepherd
 * wrote into a titled, tiered, sectioned report. No network, no storage, no
 * react — the unit tests in src/test/briefingEngine.test.ts drive it directly.
 */

export const PROFILE_LIST_KEYS = [
  "competitors",
  "key_markets",
  "technology_stack",
  "investment_interests",
  "tracked_people",
  "regulatory_bodies",
  "custom_topics",
] as const;

export type ProfileListKey = (typeof PROFILE_LIST_KEYS)[number];

export interface BriefingProfile {
  company_name: string;
  industry: string;
  competitors: string[];
  key_markets: string[];
  technology_stack: string[];
  investment_interests: string[];
  tracked_people: string[];
  regulatory_bodies: string[];
  custom_topics: string[];
}

export const EMPTY_PROFILE: BriefingProfile = {
  company_name: "",
  industry: "",
  competitors: [],
  key_markets: [],
  technology_stack: [],
  investment_interests: [],
  tracked_people: [],
  regulatory_bodies: [],
  custom_topics: [],
};

export const PROFILE_LABELS: Record<keyof BriefingProfile, string> = {
  company_name: "company or project",
  industry: "field",
  competitors: "competitors",
  key_markets: "markets",
  technology_stack: "technology",
  investment_interests: "investment interests",
  tracked_people: "people",
  regulatory_bodies: "regulators",
  custom_topics: "other topics",
};

const MAX_LIST_ITEMS = 30;
const MAX_ITEM_CHARS = 80;
const MAX_TEXT_CHARS = 120;

function cleanText(v: unknown, max = MAX_TEXT_CHARS): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = cleanText(item, MAX_ITEM_CHARS);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

/** Coerce anything row-shaped (a table row, a model's json) into a profile. */
export function normalizeProfile(raw: unknown): BriefingProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: BriefingProfile = { ...EMPTY_PROFILE, company_name: cleanText(r.company_name), industry: cleanText(r.industry) };
  for (const k of PROFILE_LIST_KEYS) p[k] = cleanList(r[k]);
  return p;
}

/** Merge a partial profile over an existing one: new text wins when present, lists union. */
export function mergeProfile(base: BriefingProfile, patch: Partial<BriefingProfile> | null | undefined): BriefingProfile {
  if (!patch) return base;
  const next: BriefingProfile = { ...base };
  const pc = normalizeProfile(patch);
  if (patch.company_name !== undefined && pc.company_name) next.company_name = pc.company_name;
  if (patch.industry !== undefined && pc.industry) next.industry = pc.industry;
  for (const k of PROFILE_LIST_KEYS) {
    if (patch[k] === undefined) continue;
    next[k] = cleanList([...base[k], ...pc[k]]);
  }
  return next;
}

/** A profile shepherd can write a briefing from: a subject and at least one list. */
export function profileIsUsable(p: BriefingProfile): boolean {
  const subject = !!(p.company_name || p.industry);
  const lists = PROFILE_LIST_KEYS.reduce((n, k) => n + p[k].length, 0);
  return subject && lists > 0;
}

export function profileIsEmpty(p: BriefingProfile): boolean {
  return !p.company_name && !p.industry && PROFILE_LIST_KEYS.every((k) => p[k].length === 0);
}

/** Human-readable summary of what the profile watches, for the room and for the prompt. */
export function describeProfile(p: BriefingProfile): string {
  const lines: string[] = [];
  if (p.company_name) lines.push(`${PROFILE_LABELS.company_name}: ${p.company_name}`);
  if (p.industry) lines.push(`${PROFILE_LABELS.industry}: ${p.industry}`);
  for (const k of PROFILE_LIST_KEYS) if (p[k].length) lines.push(`${PROFILE_LABELS[k]}: ${p[k].join(", ")}`);
  return lines.join("\n");
}

/* ── setup conversation ─────────────────────────────────────────────────── */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const SETUP_OPENING =
  "i'll set up what this briefing watches. start with the company or field you want covered, and the competitors or topics that matter most. you can answer in one message or a few.";

export const SETUP_FIELDS_HINT = PROFILE_LIST_KEYS.map((k) => `${k} (${PROFILE_LABELS[k]})`).join(", ");

/**
 * The system prompt for the setup conversation. shepherd asks one focused
 * question at a time and ends every reply with a fenced json block the room
 * strips before display and parses for the profile so far.
 */
export function buildSetupSystemPrompt(current: BriefingProfile): string {
  return [
    "you are shepherd, the ai inside asherin, setting up a briefing profile with the operator. the profile says what a written briefing should watch.",
    "always lowercase, unless giving a proper name or entity. no padding, no praise, no comparisons to other tools.",
    "ask one focused question at a time. never invent details the operator did not give. do not ask about delivery times or schedules — the briefing is written on request, not on a schedule.",
    "fields to fill: company_name (string), industry (string), and the lists " + SETUP_FIELDS_HINT + ".",
    "a profile is complete when it has a company_name or industry and at least two non-empty lists, or when the operator says they are done. then confirm what will be watched in two or three lines and set profile_complete to true.",
    "every reply ends with exactly one fenced json block, like:",
    '```json\n{"profile_complete": false, "profile": {"company_name": "", "industry": "", "competitors": [], "key_markets": [], "technology_stack": [], "investment_interests": [], "tracked_people": [], "regulatory_bodies": [], "custom_topics": []}}\n```',
    "the json carries the whole profile as understood so far, every field present, lists as arrays of short strings. the prose before it is what the operator reads; keep it under 80 words.",
    "profile so far:\n" + (profileIsEmpty(current) ? "(empty)" : describeProfile(current)),
  ].join("\n\n");
}

export interface ParsedSetupReply {
  /** The prose to show, with the json block removed. */
  reply: string;
  /** The profile shepherd reported, or null when the block was missing or unreadable. */
  profile: BriefingProfile | null;
  complete: boolean;
}

/** Split shepherd's setup reply into prose and the profile json it ends with. */
export function parseSetupReply(text: string): ParsedSetupReply {
  const src = text ?? "";
  let jsonText: string | null = null;
  let prose = src;
  const fences = [...src.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let i = fences.length - 1; i >= 0; i--) {
    if (/"profile"/.test(fences[i][1])) {
      jsonText = fences[i][1];
      prose = src.slice(0, fences[i].index) + src.slice((fences[i].index ?? 0) + fences[i][0].length);
      break;
    }
  }
  if (jsonText === null) {
    // unfenced: the last top-level object that mentions "profile"
    const start = src.lastIndexOf('{"profile');
    const alt = src.lastIndexOf("{ \"profile");
    const s = Math.max(start, alt, src.lastIndexOf('{"profile_complete'));
    if (s >= 0) {
      for (let end = src.length; end > s; end--) {
        if (src[end - 1] !== "}") continue;
        try {
          JSON.parse(src.slice(s, end));
          jsonText = src.slice(s, end);
          prose = src.slice(0, s) + src.slice(end);
          break;
        } catch {
          /* keep shrinking */
        }
      }
    }
  }
  let profile: BriefingProfile | null = null;
  let complete = false;
  if (jsonText) {
    try {
      const j = JSON.parse(jsonText) as { profile_complete?: unknown; profile?: unknown };
      if (j && typeof j === "object") {
        profile = normalizeProfile(j.profile ?? j);
        complete = j.profile_complete === true;
      }
    } catch {
      profile = null;
    }
  }
  const reply = prose.replace(/\n{3,}/g, "\n\n").trim();
  return { reply, profile, complete };
}

/* ── the briefing ───────────────────────────────────────────────────────── */

export type Tier = "critical" | "significant" | "monitoring";

/** Section headings the prompt demands and the tabs read, in report order. */
export const REPORT_SECTIONS = [
  { id: "summary", heading: "summary", label: "summary" },
  { id: "developments", heading: "developments", label: "developments" },
  { id: "competitors", heading: "competitors", label: "competitors" },
  { id: "markets", heading: "markets & regulation", label: "markets" },
  { id: "technology", heading: "technology", label: "technology" },
  { id: "people", heading: "people", label: "people" },
  { id: "watch", heading: "what to watch", label: "watch" },
  { id: "limits", heading: "limits", label: "limits" },
] as const;

export type ReportSectionId = (typeof REPORT_SECTIONS)[number]["id"];

export function buildBriefingSystemPrompt(): string {
  return [
    "you are shepherd, the ai inside asherin, writing a briefing for one operator from a profile of what they watch.",
    "always lowercase, unless giving a proper name or entity. plain prose, no praise, no filler.",
    "you have no live sources in this room. you write from what you know, and you say so: never invent urls, article titles, quotes, dates you are not sure of, or citations. when you are unsure, say unsure. when you know nothing recent about a topic, say that and move on.",
    "format: markdown. first line is `# ` followed by a short lowercase title. then exactly these second-level sections, in this order, each starting with `## ` and the heading verbatim:",
    REPORT_SECTIONS.map((s) => `## ${s.heading}`).join("\n"),
    "in `## developments`, each item is a bullet that starts with a tier tag in square brackets: `[critical]`, `[significant]` or `[monitoring]`, then one or two sentences. critical means the operator should act or decide now; significant means it changes a plan; monitoring means it is worth a glance. three to ten items.",
    "`## limits` must state, in the operator's terms, what this briefing is not: written from model knowledge with a training cutoff, no live sources checked, and the two or three claims most worth verifying before relying on them.",
    "keep the whole briefing under 900 words. no sections other than the eight above. no closing remarks after `## limits`.",
  ].join("\n\n");
}

export function buildBriefingUserPrompt(profile: BriefingProfile, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return [
    `today is ${day}. write today's briefing for this profile:`,
    describeProfile(profile) || "(no profile details)",
    "cover only what the profile names. if a list is empty, leave its section to one line saying nothing is tracked there.",
  ].join("\n\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The body of one `## heading` section, or "" when the report has none. */
export function extractSection(content: string, heading: string): string {
  const re = new RegExp(`(^|\\n)##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`, "i");
  const m = (content ?? "").match(re);
  if (!m) return "";
  return m[2].trim();
}

export interface TierCounts {
  critical: number;
  significant: number;
  monitoring: number;
}

/** Count tier tags on bullets. Looks inside `## developments` when present, else the whole text. */
export function countTiers(content: string): TierCounts {
  const dev = extractSection(content, "developments") || content || "";
  const count = (tier: Tier) => (dev.match(new RegExp(`^\\s*[-*]\\s*\\[${tier}\\]`, "gim")) ?? []).length;
  return { critical: count("critical"), significant: count("significant"), monitoring: count("monitoring") };
}

export interface ParsedReport {
  title: string;
  content: string;
  counts: TierCounts;
  /** Headings the prompt asked for that the model did not write. */
  missing: string[];
}

export function defaultTitle(now: Date = new Date()): string {
  return `briefing — ${now.toISOString().slice(0, 10)}`;
}

/** Title, cleaned body, tier counts and missing sections from shepherd's markdown. */
export function parseBriefingReport(raw: string, now: Date = new Date()): ParsedReport {
  let content = (raw ?? "").replace(/\r\n/g, "\n").trim();
  // some providers wrap the whole answer in a markdown fence
  const whole = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (whole) content = whole[1].trim();
  let title = defaultTitle(now);
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) {
    const t = h1[1].trim().replace(/\s+/g, " ");
    if (t) title = t.slice(0, 120);
    content = content.replace(h1[0], "").trim();
  }
  const missing = REPORT_SECTIONS.filter((s) => !extractSection(content, s.heading)).map((s) => s.heading);
  return { title, content, counts: countTiers(content), missing };
}

/** The markdown shown for one tab. */
export function sectionForTab(content: string, tab: "full" | ReportSectionId): string {
  if (tab === "full") return content;
  const s = REPORT_SECTIONS.find((x) => x.id === tab);
  if (!s) return content;
  const body = extractSection(content, s.heading);
  return body ? `## ${s.heading}\n\n${body}` : `shepherd did not write a "${s.heading}" section in this briefing.`;
}

/** A safe file name for the download: letters, digits, dashes, one extension. */
export function reportFileName(title: string, createdAt: string): string {
  const day = (createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const slug = (title || "briefing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "briefing"}-${day}.md`;
}

/** "just now", "3 h ago", "2 d ago" — or the date once it is old. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
