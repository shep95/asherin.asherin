/**
 * The only href builder for links whose target came from a model, a search
 * provider, or a file. `javascript:` and `data:` never become clickable.
 */
export function safeUrl(v: unknown): string | null {
  if (v == null) return null;
  const raw = String(v).trim().slice(0, 2048);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    /* relative or malformed */
  }
  return null;
}

/** For `href=`: a safe absolute url, or undefined so the anchor is inert. */
export function safeHref(v: unknown): string | undefined {
  return safeUrl(v) ?? undefined;
}
