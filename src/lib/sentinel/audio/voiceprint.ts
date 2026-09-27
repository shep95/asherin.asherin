// asherin.sentinel — layer 2, the voiceprint.
//
// The narrative names resemblyzer / titanet. Those are 20-50mb speaker
// verification networks; in a browser tab they are neither downloadable on a
// phone plan nor runnable per-turn. What matters for the product promise is not
// the specific network — it is that a voice heard twice is RECOGNISED as the
// same voice, that a new voice is NOT silently folded into an existing one, and
// that the system says how sure it is.
//
// So the signature here is an explicit acoustic statistic vector: band-energy
// means and variances, centroid, zero-crossing, and pitch statistics — the same
// dimensions a classical speaker-ID front end uses. It separates voices that
// differ in pitch register, resonance and cadence. It does NOT pretend to be
// forensic speaker verification, and the confidence it reports is a similarity
// margin, not a court-grade probability. That distinction is printed in the UI.
//
// Flaws handled:
//   • short samples — a segment under `MIN_SAMPLE_MS` gets no print at all,
//     rather than a noisy print that pollutes a stored centroid forever.
//   • drift — a matched print updates the stored centroid by a decaying weight
//     so a thousand samples cannot be dragged by one bad one.
//   • the second-best trap — a match requires a MARGIN over the runner-up, so
//     two similar voices produce "unsure" instead of a confident wrong name.

import type { FrameFeatures } from "./dsp";

export const PRINT_DIMS = 14;
export const MIN_SAMPLE_MS = 700;
/** cosine similarity required before a voice is called the same voice */
export const MATCH_THRESHOLD = 0.955;
/** how far ahead of the runner-up the winner must be */
export const MATCH_MARGIN = 0.012;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
};

export function l2normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return n > 0 ? v.map((x) => x / n) : v.slice();
}

/**
 * Build a signature from the voiced frames of one speaker turn.
 * Returns null when the sample is too thin to characterise a person.
 */
export function embedVoice(series: FrameFeatures[], frameMs: number): number[] | null {
  const voiced = series.filter((f) => f.pitch > 60 && f.pitch < 420 && f.rms > 0.003);
  if (voiced.length * frameMs < MIN_SAMPLE_MS) return null;

  const pitches = voiced.map((f) => f.pitch);
  const raw = [
    mean(voiced.map((f) => f.bands[0])),
    mean(voiced.map((f) => f.bands[1])),
    mean(voiced.map((f) => f.bands[2])),
    mean(voiced.map((f) => f.bands[3])),
    sd(voiced.map((f) => f.bands[0])),
    sd(voiced.map((f) => f.bands[1])),
    sd(voiced.map((f) => f.bands[2])),
    mean(voiced.map((f) => f.centroid)) / 4000,
    sd(voiced.map((f) => f.centroid)) / 4000,
    mean(voiced.map((f) => f.zcr)),
    sd(voiced.map((f) => f.zcr)),
    mean(pitches) / 300,
    sd(pitches) / 120,
    mean(voiced.map((f) => f.flatness)),
  ];
  return l2normalise(raw.map((x) => (Number.isFinite(x) ? x : 0)));
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export interface KnownSpeaker {
  id: string;
  label: string;
  name: string | null;
  embedding: number[];
  sampleCount: number;
}

export type SpeakerMatch =
  | { kind: "match"; speaker: KnownSpeaker; similarity: number; margin: number }
  | { kind: "new"; best: number }
  | { kind: "unsure"; candidates: KnownSpeaker[]; best: number; margin: number };

/** Decide who spoke. Never returns a match it cannot separate from a rival. */
export function matchSpeaker(print: number[], known: KnownSpeaker[]): SpeakerMatch {
  const scored = known
    .filter((k) => k.embedding.length === print.length)
    .map((k) => ({ k, s: cosine(print, k.embedding) }))
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { kind: "new", best: 0 };
  const top = scored[0];
  const runner = scored[1]?.s ?? 0;
  const margin = top.s - runner;
  if (top.s < MATCH_THRESHOLD) return { kind: "new", best: top.s };
  if (scored.length > 1 && margin < MATCH_MARGIN) {
    return { kind: "unsure", candidates: [top.k, scored[1].k], best: top.s, margin };
  }
  return { kind: "match", speaker: top.k, similarity: top.s, margin };
}

/** Fold a new sample into a stored centroid with a decaying weight. */
export function mergeCentroid(stored: number[], fresh: number[], sampleCount: number): number[] {
  if (!stored.length) return fresh.slice();
  const w = 1 / Math.min(20, Math.max(2, sampleCount + 1));
  return l2normalise(stored.map((x, i) => x * (1 - w) + (fresh[i] ?? 0) * w));
}

/** Reported confidence in an identity: samples heard, capped, honest. */
export function identityConfidence(sampleCount: number, lastSimilarity: number): number {
  const volume = Math.min(1, sampleCount / 12);
  return Number(Math.min(0.95, 0.25 + volume * 0.45 + Math.max(0, lastSimilarity - MATCH_THRESHOLD) * 6).toFixed(2));
}
