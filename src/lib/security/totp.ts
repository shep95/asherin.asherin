// Local RFC-6238 TOTP. The seed never leaves the browser: codes are derived
// in-page from the decrypted secret and are never written to a trace, a log,
// or the network. No third-party authenticator service is contacted.

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode a base32 (RFC 4648, no padding required) secret. Throws on junk. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error("Secret is not valid base32");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  if (out.length === 0) throw new Error("Secret is too short");
  return new Uint8Array(out);
}

export interface TotpOptions {
  digits?: number;
  periodSec?: number;
  /** Milliseconds since epoch. Injectable so the generator stays testable. */
  nowMs?: number;
}

/** Generate the current code for a base32 seed. */
export async function totpCode(
  secretB32: string,
  { digits = 6, periodSec = 30, nowMs = Date.now() }: TotpOptions = {},
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secretB32) as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const counter = Math.floor(nowMs / 1000 / periodSec);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // JS bitwise ops are 32-bit; split the counter across both halves.
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Seconds left in the current window — drives the countdown ring. */
export function totpRemaining(periodSec = 30, nowMs = Date.now()): number {
  return periodSec - Math.floor(nowMs / 1000) % periodSec;
}

/** Pull a seed out of an otpauth:// URI, or return the raw string as a seed. */
export function extractSeed(input: string): string {
  const raw = input.trim();
  if (!/^otpauth:\/\//i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return url.searchParams.get("secret")?.trim() ?? raw;
  } catch {
    return raw;
  }
}
