// Deterministic, client-side gematria engine.
// English Ordinal, Full Reduction, Reverse Ordinal, and Chaldean ciphers.
// Purely a linguistic pattern-matching tool — no medical or predictive claims.

export type CipherKey = "ordinal" | "reduction" | "reverse" | "chaldean";

export const CIPHER_LABEL: Record<CipherKey, string> = {
  ordinal: "English Ordinal",
  reduction: "Full Reduction",
  reverse: "Reverse Ordinal",
  chaldean: "Chaldean",
};

/** Lowercase and strip anything outside a–z. */
export function normalize(input: string): string {
  return (input || "").toLowerCase().replace(/[^a-z]/g, "");
}

// a=1..z=26
export function ordinalOf(ch: string): number {
  const c = ch.charCodeAt(0) - 96;
  return c >= 1 && c <= 26 ? c : 0;
}

// Pythagorean Full Reduction: a=1..i=9, j=1..r=9, s=1..z=8.
export function reductionOf(ch: string): number {
  const o = ordinalOf(ch);
  if (!o) return 0;
  return ((o - 1) % 9) + 1;
}

// a=26..z=1
export function reverseOrdinalOf(ch: string): number {
  const o = ordinalOf(ch);
  return o ? 27 - o : 0;
}

// Chaldean: fixed table, no 9.
const CHALDEAN: Record<string, number> = {
  a: 1, i: 1, j: 1, q: 1, y: 1,
  b: 2, k: 2, r: 2,
  c: 3, g: 3, l: 3, s: 3,
  d: 4, m: 4, t: 4,
  e: 5, h: 5, n: 5, x: 5,
  u: 6, v: 6, w: 6,
  o: 7, z: 7,
  f: 8, p: 8,
};
export function chaldeanOf(ch: string): number {
  return CHALDEAN[ch] ?? 0;
}

const FN: Record<CipherKey, (ch: string) => number> = {
  ordinal: ordinalOf,
  reduction: reductionOf,
  reverse: reverseOrdinalOf,
  chaldean: chaldeanOf,
};

export interface LetterBreakdown {
  letter: string;
  value: number;
}
export interface CipherResult {
  cipher: CipherKey;
  sum: number;
  /** One-pass digit sum of `sum` (may still be multi-digit, e.g. 299 → 20). */
  step: number;
  /** Fully reduced single-digit (honoring master numbers 11/22/33). */
  reduced: number;
  letters: LetterBreakdown[];
}

export function computeCipher(input: string, cipher: CipherKey): CipherResult {
  const n = normalize(input);
  const fn = FN[cipher];
  const letters: LetterBreakdown[] = [];
  let sum = 0;
  for (const ch of n) {
    const v = fn(ch);
    letters.push({ letter: ch, value: v });
    sum += v;
  }
  return { cipher, sum, step: digitSum(sum), reduced: recursiveReduce(sum), letters };
}

/** Single-pass digit sum: 299 → 20, 20 → 2. Does NOT recurse. */
export function digitSum(n: number): number {
  let x = Math.abs(n);
  if (x <= 9) return x;
  let s = 0;
  while (x > 0) { s += x % 10; x = Math.floor(x / 10); }
  return s;
}

export function computeAll(input: string): Record<CipherKey, CipherResult> {
  return {
    ordinal: computeCipher(input, "ordinal"),
    reduction: computeCipher(input, "reduction"),
    reverse: computeCipher(input, "reverse"),
    chaldean: computeCipher(input, "chaldean"),
  };
}

/** Reduce to single digit 1–9 unless the intermediate sum hits 11, 22, or 33. */
export function recursiveReduce(n: number): number {
  let x = Math.abs(n);
  while (x > 9) {
    if (x === 11 || x === 22 || x === 33) return x;
    let s = 0;
    while (x > 0) {
      s += x % 10;
      x = Math.floor(x / 10);
    }
    x = s;
  }
  return x;
}
