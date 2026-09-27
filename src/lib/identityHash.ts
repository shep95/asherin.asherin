// Identity hashing (client twin of supabase/functions/_shared/identityHash.ts).
// The only way this bundle is allowed to recognise an operator inbox.
//
// Why hashes and not a list of addresses: a committed allowlist of real
// mailboxes is a disclosure. The repository is readable by anyone who can read
// the repository, and the client bundle is readable by everyone. A SHA-256 hex
// digest recognises the holder of an address without ever naming it, and a
// digest cannot be reversed into an inbox that can be phished, credential-
// stuffed, or scraped.
//
// The digest is over the CANONICAL form of the address: trimmed, lowercased,
// and for Gmail-class hosts with the local-part dots and "+tag" suffix removed.
// Google treats those as the same mailbox, so an alias sign-in must resolve to
// the same identity rather than silently losing entitlement.
//
// This module is deliberately dependency-free and SYNCHRONOUS. Web Crypto's
// digest is async, and turning every call site into an await would push
// identity checks into promise chains inside request handlers that are already
// sequenced around auth. A 60-line FIPS 180-4 SHA-256 keeps the call sites
// honest and cheap (a digest of a 30-byte string is one compression block).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 SHA-256 over UTF-8 input. Returns lowercase hex. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  // message + 0x80 + zero pad to 56 mod 64 + 64-bit big-endian length
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) out += h[i].toString(16).padStart(8, "0");
  return out;
}

const ALIAS_HOSTS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Canonical form of an address. Trim + lowercase always; for Google-class
 * hosts also drop "+tag" and dots in the local part, because those all deliver
 * to one mailbox and must resolve to one identity.
 */
export function canonicalizeEmail(email: string | null | undefined): string {
  const raw = String(email ?? "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at <= 0) return raw;
  let local = raw.slice(0, at);
  const host = raw.slice(at + 1);
  if (ALIAS_HOSTS.has(host)) {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.split(".").join("");
    // googlemail.com is the same mailbox as gmail.com; fold to one identity so
    // the alias domain does not silently produce a different digest.
    return `${local}@gmail.com`;
  }
  return `${local}@${host}`;
}

/** SHA-256 hex of the canonical address, or "" when there is no address. */
export function emailHash(email: string | null | undefined): string {
  const canonical = canonicalizeEmail(email);
  return canonical ? sha256Hex(canonical) : "";
}

/** Length-independent, branch-free hex comparison. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the digest matches any member of the set, without early exit. */
export function hashInSet(hash: string, set: ReadonlySet<string>): boolean {
  if (!hash) return false;
  let hit = false;
  for (const candidate of set) if (timingSafeEqualHex(hash, candidate)) hit = true;
  return hit;
}

/**
 * Owner / internal-Pro identities. These digests gate cosmetic UI only —
 * every real decision is re-made server-side against the same digests, so a
 * user who patches this file in devtools gains a menu item and nothing else.
 */
export const INTERNAL_PRO_HASHES: ReadonlySet<string> = new Set([
  "f68b7e47077aa50a88e993818e1d88cbf491b81582e46e3d0cd0e0ea54607aea",
  "bf82821ba9b7f8c56f865b9cc453e791d84f829c71f4585cd99cf0a064390a54",
]);

/** Primary owner digest — the single account some legacy surfaces gate on. */
export const OWNER_HASH = "f68b7e47077aa50a88e993818e1d88cbf491b81582e46e3d0cd0e0ea54607aea";

/** Staff: internal Pro pair plus the two internal collaborator identities. */
export const STAFF_HASHES: ReadonlySet<string> = new Set([
  ...INTERNAL_PRO_HASHES,
  "732426de6211ba1300bc85ed04d17240bc6efa2dffc18df78d1f70bb7fa668ad",
  "5d29ee379ee81c23e7d5aa9f5039e9086e02d67747b960bd39eca3bda4cbf033",
]);

/** Brain/content contributors: owner plus the collaborator identity. */
export const CONTRIBUTOR_HASHES: ReadonlySet<string> = new Set([
  OWNER_HASH,
  "5d29ee379ee81c23e7d5aa9f5039e9086e02d67747b960bd39eca3bda4cbf033",
]);

export const isOwnerEmail = (email?: string | null): boolean =>
  timingSafeEqualHex(emailHash(email), OWNER_HASH);

export const isStaffEmail = (email?: string | null): boolean =>
  hashInSet(emailHash(email), STAFF_HASHES);

export const isInternalProEmail = (email?: string | null): boolean =>
  hashInSet(emailHash(email), INTERNAL_PRO_HASHES);

export const isContributorEmail = (email?: string | null): boolean =>
  hashInSet(emailHash(email), CONTRIBUTOR_HASHES);
