/**
 * Canonical-host enforcement — local edition.
 *
 * asherin now runs wherever the operator serves it: a laptop, a home server,
 * a private domain, or asherin.com itself. Redirecting any of those to a
 * fixed public hostname would break the very thing this build exists for, so
 * the only job left here is the one that costs nothing: collapse the
 * legacy `www.` duplicate of asherin.com onto the bare host when, and only
 * when, the page is already being served from asherin.com over https.
 */

const CANONICAL_ORIGIN = "https://asherin.com";
const DUPLICATE_HOSTS = new Set(["www.asherin.com"]);

export function enforceCanonicalHost(): void {
  if (typeof window === "undefined") return;
  const { location } = window;
  if (location.protocol !== "https:") return;
  if (!DUPLICATE_HOSTS.has(location.hostname.toLowerCase())) return;
  const target = new URL(`${location.pathname}${location.search}${location.hash}`, CANONICAL_ORIGIN);
  if (target.origin !== CANONICAL_ORIGIN) return;
  location.replace(target.toString());
}
