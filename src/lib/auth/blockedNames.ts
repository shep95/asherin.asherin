/**
 * Reserved / blocked display-name registry.
 *
 * Threat model: a display name is rendered next to intelligence output, so an
 * attacker who registers as "Asherin Security" or "verified" can impersonate
 * the platform inside the product's own UI. Separately, SQL keywords and
 * dev-trap literals ("null", "undefined", "0") smoke out sloppy string
 * handling downstream and produce confusing support tickets.
 *
 * This module is the SINGLE source of truth for the *client* check. It is a
 * UX affordance only — the authoritative gate is the database trigger
 * `public.tg_guard_display_name`, because the client can be bypassed entirely
 * by calling the auth API directly or by signing in through Google OAuth.
 */

const SQL_KEYWORDS = [
  "select", "drop", "insert", "delete", "update", "where", "from", "join",
  "union", "create", "alter", "table", "database", "exec", "execute",
  "truncate", "having", "order", "group", "limit", "offset", "into",
  "values", "declare", "cast", "convert",
];

const SYSTEM_NAMES = [
  "admin", "administrator", "root", "superuser", "system", "god", "owner",
  "mod", "moderator", "staff", "support", "helpdesk", "sysadmin", "devops",
  "operator", "sudo", "su",
];

const DEV_TRAPS = [
  "null", "undefined", "true", "false", "nan", "none", "nil", "void",
  "test", "debug", "localhost", "default", "unknown", "error", "exception",
];

const SOCIAL_ENGINEERING = [
  "official", "verified", "real", "authentic", "legit", "team", "security",
  "account", "service", "bot", "autopilot", "internal", "corp", "corporate",
];

const RESERVED_ROUTES = [
  "api", "app", "www", "mail", "email", "login", "signup", "register",
  "dashboard", "settings", "profile", "home", "index", "about", "contact",
  "help", "faq", "terms", "privacy", "billing",
];

const NUMERIC_EDGE_CASES = ["0", "1", "00", "000", "123", "1234", "12345"];

/** Brand impersonation — not in the supplied list, but the same attack class. */
const BRAND_NAMES = ["asherin", "aureon", "asher", "zophiel", "houseofasher"];

export const BLOCKED_NAMES: ReadonlySet<string> = new Set([
  ...SQL_KEYWORDS,
  ...SYSTEM_NAMES,
  ...DEV_TRAPS,
  ...SOCIAL_ENGINEERING,
  ...RESERVED_ROUTES,
  ...NUMERIC_EDGE_CASES,
  ...BRAND_NAMES,
]);

/**
 * Homoglyph / leetspeak folding.
 *
 * A naive `toLowerCase()` comparison is defeated by "Adm1n", "a-d-m-i-n" and
 * "ａdmin" (fullwidth). Normalising first means the blocklist stays a flat set
 * of plain words instead of an unmaintainable regex zoo.
 *
 * Deliberately NOT folded: "l"/"i" -> "1" in the reverse direction, since that
 * would collapse legitimate names onto the numeric edge cases.
 */
const LEET_MAP: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a",
  $: "s", "!": "i", "|": "i",
};

export function normalizeName(raw: string): string {
  const stripped = raw
    .normalize("NFKD")               // fullwidth + composed accents -> ASCII base
    .replace(/[\u0300-\u036f]/g, "") // drop combining diacritics
    .toLowerCase()
    .trim();

  // Digits-only inputs are compared verbatim so "0" and "12345" still match
  // their edge-case entries instead of folding into letters ("0" -> "o").
  if (/^\d+$/.test(stripped)) return stripped;

  return stripped
    .split("")
    .map((ch) => LEET_MAP[ch] ?? ch)
    .filter((ch) => /[a-z0-9]/.test(ch)) // drop spaces, dots, dashes, underscores
    .join("");
}

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 50;

export type NameCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validates a human-facing display name. Empty input is treated as valid here
 * because the field is optional at signup — callers that require it must check
 * for emptiness themselves before calling.
 */
export function validateDisplayName(raw: string): NameCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true };

  if (trimmed.length < NAME_MIN_LENGTH) {
    return { ok: false, reason: `Name must be at least ${NAME_MIN_LENGTH} characters.` };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return { ok: false, reason: `Name must be under ${NAME_MAX_LENGTH} characters.` };
  }
  // Control characters and bidi overrides can visually reverse a name in the UI.
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(trimmed)) {
    return { ok: false, reason: "Name contains invalid characters." };
  }

  const normalized = normalizeName(trimmed);
  if (!normalized) return { ok: false, reason: "Name must contain letters or numbers." };

  if (BLOCKED_NAMES.has(normalized)) {
    return { ok: false, reason: `"${trimmed}" is a reserved name. Please choose another.` };
  }

  return { ok: true };
}
