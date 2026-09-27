// ZANOEM redactor — scrubs API keys, JWTs, and bearer tokens before we
// inline user-provided text (brain files, model outputs) into a prompt or
// persist it. Deliberately conservative: we prefer over-redaction to
// leaking a secret into a prompt or a decision log row.
//
// Patterns cover the common shapes we've seen in practice:
//   • sk-… / rk-… / ghp_… / gho_… / github_pat_… style prefixes
//   • xoxb-/xoxp-/xoxa- Slack tokens
//   • AKIA/ASIA AWS access keys + 40-char secret pairs
//   • generic JWT `header.payload.signature`
//   • bearer `Bearer <token>` headers
//   • private-key PEM blocks
//   • email addresses (best-effort — PII, not secret)
//
// Text is never mutated in place; we return a new string plus a hit count
// so callers can log "N secrets scrubbed" without seeing the payload.

const PATTERNS: Array<[RegExp, string]> = [
  // ── Provider-prefixed API keys ────────────────────────────────
  [/\b(sk|rk|pk_live|pk_test|sk_live|sk_test)-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_APIKEY]"],
  [/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_PAT]"],
  [/\bgho_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_OAUTH]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_PAT]"],
  [/\bxox[abpors]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_SLACK_TOKEN]"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[REDACTED_GOOGLE_APIKEY]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_AKID]"],
  [/\bASIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_STS]"],

  // ── JWT (header.payload.signature) ─────────────────────────────
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]"],

  // ── Bearer / Authorization headers ─────────────────────────────
  [/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, "Bearer [REDACTED]"],
  [/\bAuthorization\s*[:=]\s*[A-Za-z0-9._-]{16,}\b/gi, "Authorization: [REDACTED]"],

  // ── PEM private key blocks ─────────────────────────────────────
  [/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]{20,}?-----END [A-Z ]+PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],

  // ── Emails (PII, best-effort) ──────────────────────────────────
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]"],
];

export interface RedactResult {
  text: string;
  hits: number;
}

/** Scrub secrets/PII from arbitrary text. Best-effort; returns hit count. */
export function redact(input: string): RedactResult {
  if (!input) return { text: input ?? "", hits: 0 };
  let out = input;
  let hits = 0;
  for (const [re, replacement] of PATTERNS) {
    // Rebuild the RegExp each call so the /g `lastIndex` state cannot leak
    // across invocations — a classic stateful-regex bug.
    const local = new RegExp(re.source, re.flags);
    out = out.replace(local, () => {
      hits += 1;
      return replacement;
    });
  }
  return { text: out, hits };
}

/** Convenience: scrub every string value in a shallow object. */
export function redactShallow<T extends Record<string, unknown>>(obj: T): { data: T; hits: number } {
  let total = 0;
  const next: Record<string, unknown> = { ...obj };
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      const r = redact(v);
      next[k] = r.text;
      total += r.hits;
    }
  }
  return { data: next as T, hits: total };
}
