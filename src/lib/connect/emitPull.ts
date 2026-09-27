// Asherin Connect — capability pull tracing.
//
// Every organ that actually reaches out for data emits one row here. The
// Connect graph reads these rows; it never invents a pull. A node is only
// green because something really ran.
//
// Hard rule: quote_masked is a human hint, never payload. Secrets, tokens,
// TOTP codes, vault contents and raw contact details are stripped before the
// row leaves the browser.

import { supabase } from "@/integrations/supabase/client";

export type PullStatus = "ok" | "fail" | "skip" | "stale";

/** Organ ids used across the graph. Keep in sync with ORGANS in the view. */
export type Organ =
  | "chat" | "maps" | "zophiel" | "google" | "ide" | "vault" | "zerlal"
  | "azplen" | "axrlen" | "zahten" | "briefings" | "notebooks"
  | "knowledge-vault" | "library" | "memory" | "whiteboard" | "ghost"
  | "file-scrapper" | "zeeion" | "zaxin" | "zacoon" | "zali" | "gematria"
  | "vedic" | "document-studio" | "pattern" | "timeseries" | "teams"
  | "snippets" | "rad" | "shield" | "connect"
  | "defender" | "arvision";

export interface PullInput {
  organ: Organ | string;
  capability: string;
  fromSurface?: string;
  status: PullStatus;
  latencyMs?: number;
  /** Short human hint — masked before insert. */
  quote?: string | null;
  meta?: Record<string, unknown>;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk|api|key|token|bearer|secret|pat|ghp|gho|ghu|ghs|xoxb|xoxp)[-_a-z]*[=:\s]*["']?[A-Za-z0-9_\-]{16,}/gi,
  /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, // jwt
  /\bAIza[0-9A-Za-z_\-]{20,}\b/g,
  /\b\d{6}\b(?=\s*(otp|totp|code|2fa))/gi,
  /\b(?:password|passphrase|totp|otp|seed|mnemonic)\s*[:=]\s*\S+/gi,
];

const EMAIL_RE = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-])[A-Za-z0-9.-]*\.([A-Za-z]{2,})\b/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

/**
 * Reduce a quote to something safe to render: no credentials, contacts
 * starred, hard length cap. Pure function — safe to unit test.
 */
export function maskQuote(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/\s+/g, " ").trim();
  if (!s) return null;

  for (const re of SECRET_PATTERNS) s = s.replace(re, "[redacted]");

  s = s.replace(EMAIL_RE, (_m, a, d, tld) => `${a}***@${d}***.${tld}`);
  s = s.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 8) return m; // not a phone — leave house numbers alone
    return `***${digits.slice(-3)}`;
  });

  if (s.length > 160) s = `${s.slice(0, 157)}…`;
  return s;
}

/** meta must never carry payload — only scalars we chose to keep. */
function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!meta) return out;
  for (const [k, v] of Object.entries(meta)) {
    if (/key|token|secret|password|totp|otp|auth|cookie|session/i.test(k)) continue;
    if (v == null) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = maskQuote(v) ?? "";
  }
  return out;
}

/**
 * Fire-and-forget trace write. Never throws, never blocks the caller's
 * critical path — a failed trace must not fail the capability that ran.
 */
export async function emitPull(input: PullInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return; // signed-out surfaces do not trace

    const latency =
      typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)
        ? Math.max(0, Math.min(600000, Math.round(input.latencyMs)))
        : null;

    await supabase.from("asherin_connect_pulls").insert([{
      user_id: uid,
      organ: String(input.organ).slice(0, 48),
      capability: String(input.capability).slice(0, 64),
      from_surface: String(input.fromSurface || "unknown").slice(0, 48),
      status: input.status,
      latency_ms: latency,
      quote_masked: maskQuote(input.quote),
      meta: safeMeta(input.meta) as Record<string, string | number | boolean>,
    }]);

  } catch {
    // tracing is best-effort by design
  }
}

/** Time a capability and trace the outcome in one wrapper. */
export async function tracePull<T>(
  base: Omit<PullInput, "status" | "latencyMs">,
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await run();
    void emitPull({ ...base, status: "ok", latencyMs: performance.now() - started });
    return result;
  } catch (err) {
    void emitPull({
      ...base,
      status: "fail",
      latencyMs: performance.now() - started,
      quote: err instanceof Error ? err.message : "unknown error",
    });
    throw err;
  }
}
