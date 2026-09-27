// Memory taxonomy + the guard that keeps credentials out of it.
//
// Memory holds durable operating rules, never secrets. Guardian Vault is the
// only place a credential lives; anything credential-shaped is refused at the
// door instead of being silently stored.

export type MemoryKind = "prefer" | "never" | "process" | "output" | "scope" | "general";

export const MEMORY_KINDS: { id: MemoryKind; label: string; hint: string }[] = [
  { id: "prefer", label: "Prefer", hint: "Do it this way by default" },
  { id: "never", label: "Never", hint: "Rejected — do not bring it back" },
  { id: "process", label: "Process", hint: "How work should be carried out" },
  { id: "output", label: "Output", hint: "Format, tone, length of answers" },
  { id: "scope", label: "Scope", hint: "What this work covers or excludes" },
  { id: "general", label: "General", hint: "Durable context" },
];

const SECRET_SHAPES: { re: RegExp; why: string }[] = [
  // key prefixes commonly carry internal hyphens (sk-live-…, sk-proj-…), so the
  // body is matched loosely rather than as one alphanumeric run.
  { re: /\b(sk|pk|rk)[-_][A-Za-z0-9_-]{12,}/i, why: "that looks like an api key" },
  { re: /\bAIza[0-9A-Za-z_\-]{20,}\b/, why: "that looks like a google api key" },
  { re: /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/, why: "that looks like a token" },
  { re: /\b(gh[pousr]|xox[bpa])[-_][A-Za-z0-9]{12,}/i, why: "that looks like an access token" },
  { re: /(password|passphrase|secret|api[ _-]?key|token|totp|otp|seed phrase|mnemonic|private key)\s*(is|are|=|:)\s*\S+/i, why: "credentials belong in Guardian Vault, not memory" },
  { re: /-----BEGIN[^-]{0,40}PRIVATE KEY-----/, why: "that is a private key" },
  { re: /\b\d{13,19}\b(?=[^\d]*(cvv|exp|card))/i, why: "that looks like card data" },
];


export interface MemoryGuardResult {
  ok: boolean;
  reason?: string;
}

/** Pure — safe to unit test. Returns why a memory is refused, if it is. */
export function guardMemoryContent(content: string): MemoryGuardResult {
  const s = content.trim();
  if (!s) return { ok: false, reason: "empty" };
  if (s.length > 600) return { ok: false, reason: "keep a memory under 600 characters" };
  for (const { re, why } of SECRET_SHAPES) {
    if (re.test(s)) return { ok: false, reason: why };
  }
  return { ok: true };
}

/** A Connect-safe label: the rule's shape, never the raw content. */
export function memoryLabel(kind: MemoryKind, content: string): string {
  const head = content.trim().split(/\s+/).slice(0, 6).join(" ");
  return `${kind}: ${head}${content.trim().split(/\s+/).length > 6 ? "…" : ""}`;
}
