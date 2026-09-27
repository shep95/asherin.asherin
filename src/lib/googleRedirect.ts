/**
 * Canonical Google OAuth redirect.
 *
 * Google matches redirect_uri as an exact string. One URI is registered:
 * https://asherin.com/dashboard
 * Consent lands on asherin.com; the opener origin must be a trusted asherin host.
 */

export const GOOGLE_REDIRECT_URI = "https://asherin.com/dashboard";

export const GOOGLE_CANONICAL_ORIGIN = new URL(GOOGLE_REDIRECT_URI).origin;

export function isTrustedAppOrigin(origin: string): boolean {
  if (!origin) return false;
  let host: string;
  let protocol: string;
  try {
    const u = new URL(origin);
    host = u.hostname;
    protocol = u.protocol;
  } catch {
    return false;
  }
  if (protocol === "http:" && (host === "localhost" || host === "127.0.0.1")) return true;
  if (protocol !== "https:") return false;
  return host === "asherin.com" || host === "www.asherin.com";
}
