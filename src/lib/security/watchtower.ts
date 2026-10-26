// watchtower — exposure checks that never transmit a secret.
//
// password exposure uses the Pwned Passwords range api (k-anonymity): the
// browser computes sha-1 locally and sends only the FIRST FIVE hex characters
// to api.pwnedpasswords.com. the remaining 35 are compared in-page. the
// password, the label, the domain and the device it belongs to are never
// sent. the call is opt-in (the operator presses the button), bounded by an
// 8-second abort, and skipped outright when the browser reports it is offline.
//
// honest gap: which sites leaked a given email address needs an authenticated
// Have I Been Pwned subscription key. asherin does not hold one, so that check
// is reported as unavailable rather than faked.

const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT_MS = 8000;

export type ExposureState = "clear" | "exposed" | "error";

export interface ExposureResult {
  state: ExposureState;
  /** Times this exact password appears in aggregated breach corpora. */
  count: number;
  reason?: string;
}

/** Uppercase hex SHA-1. Local only. */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Parse a range response body. Pure — unit testable without network. */
export function matchSuffix(body: string, suffix: string): number {
  for (const line of body.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    if (line.slice(0, idx).trim().toUpperCase() !== suffix) continue;
    const n = Number.parseInt(line.slice(idx + 1).trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function checkPasswordExposure(password: string): Promise<ExposureResult> {
  if (!password) return { state: "error", count: 0, reason: "no password stored on this item" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { state: "error", count: 0, reason: "offline — the range service was not contacted" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const hash = await sha1Hex(password);
    const res = await fetch(`${RANGE_ENDPOINT}${hash.slice(0, 5)}`, {
      signal: controller.signal,
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return { state: "error", count: 0, reason: `range service answered ${res.status}` };
    const count = matchSuffix(await res.text(), hash.slice(5));
    return count > 0 ? { state: "exposed", count } : { state: "clear", count: 0 };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      state: "error",
      count: 0,
      reason: aborted ? "range service timed out" : "range service unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Rough strength score 0-4. Local heuristic, never a guarantee. */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

/** Group indices of items whose secrets are identical — reuse is the real risk. */
export function findReuse(secrets: (string | null | undefined)[]): number[][] {
  const buckets = new Map<string, number[]>();
  secrets.forEach((s, i) => {
    if (!s) return;
    const list = buckets.get(s) ?? [];
    list.push(i);
    buckets.set(s, list);
  });
  return Array.from(buckets.values()).filter((g) => g.length > 1);
}

/** Days since a timestamp, or null when never rotated. */
export function ageInDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}
