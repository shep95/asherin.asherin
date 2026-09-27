// asherin.sentinel — layer 3, the background sound pipeline.
//
// The narrative names yamnet/panns. Shipping a 4mb audio classifier into a tab
// that is meant to run all day is the wrong trade, and — worse — a label from a
// generic 521-class network is presented to the operator as if it were certain
// when it is frequently not. So this layer stays honest in a different way: it
// reports the ACOUSTIC SHAPE it actually measured, names the shape when the
// shape is distinctive, and files everything else as an unclassified impact
// rather than inventing a class.
//
// Each tag therefore carries a confidence AND the features it rests on, so the
// timeline row can be justified when the operator asks "why does it say glass?".
//
// Nothing here decides that a crime happened. It decides that a broadband
// transient with most of its energy above 5khz occurred at 14:32:44.

import type { FrameFeatures } from "./dsp";

export type SoundTag =
  | "door event"
  | "impact — glass"
  | "elevated vocal stress"
  | "movement detected"
  | "vehicle — exterior"
  | "unclassified impact";

export interface SoundEvent {
  tag: SoundTag;
  confidence: number;
  /** frame index inside the analysed window where the event began */
  atFrame: number;
  durationFrames: number;
  /** the measured basis for the label — never omitted */
  evidence: Record<string, number | string>;
}

export interface SoundOptions {
  /** transient = rms jumps by this factor over the trailing average */
  transientRatio: number;
  /** rms floor: below this nothing is an event, however sharp */
  minRms: number;
}

export const SOUND_DEFAULTS: SoundOptions = { transientRatio: 3.2, minRms: 0.02 };

const round = (n: number, p = 3) => Number(n.toFixed(p));

/**
 * Classify non-voice events in one analysed window.
 *
 * Voice-shaped windows are NOT excluded outright: a shout is a voice event and
 * the operator wants it. What is excluded is ordinary conversation, which the
 * voice pipeline already owns.
 */
export function classifySounds(series: FrameFeatures[], opts: SoundOptions = SOUND_DEFAULTS): SoundEvent[] {
  if (series.length < 4) return [];
  const out: SoundEvent[] = [];
  const trailing: number[] = [];
  let lastEventFrame = -99;

  for (let i = 2; i < series.length; i++) {
    const f = series[i];
    trailing.push(series[i - 2].rms);
    if (trailing.length > 20) trailing.shift();
    const base = trailing.reduce((a, b) => a + b, 0) / trailing.length;

    const isTransient = f.rms > opts.minRms && base > 0 && f.rms / base >= opts.transientRatio;
    if (!isTransient) continue;
    if (i - lastEventFrame < 6) continue; // one strike, one row
    lastEventFrame = i;

    // how long the burst lasts — decay length separates a slam from an engine
    let end = i;
    while (end + 1 < series.length && series[end + 1].rms > base * 1.6) end++;
    const durationFrames = end - i + 1;
    const window = series.slice(i, end + 1);
    const avg = (pick: (x: FrameFeatures) => number) => window.reduce((a, x) => a + pick(x), 0) / window.length;
    const high = avg((x) => x.bands[3]);
    const mid = avg((x) => x.bands[2]);
    const low = avg((x) => x.bands[0]);
    const zcr = avg((x) => x.zcr);
    const flat = avg((x) => x.flatness);
    const voicedShare = window.filter((x) => x.pitch > 70 && x.pitch < 400).length / window.length;
    const evidence = {
      rms: round(f.rms),
      lift: round(f.rms / base, 2),
      lowBand: round(low),
      midHigh: round(mid + high),
      zcr: round(zcr),
      flatness: round(flat),
      frames: durationFrames,
    };

    if (voicedShare > 0.5 && f.rms > opts.minRms * 3 && durationFrames >= 6) {
      out.push({
        tag: "elevated vocal stress",
        confidence: Math.min(0.82, 0.45 + voicedShare * 0.35),
        atFrame: i,
        durationFrames,
        evidence: { ...evidence, voicedShare: round(voicedShare, 2) },
      });
      continue;
    }
    if (high + mid > 0.55 && zcr > 0.3 && durationFrames <= 12) {
      out.push({
        tag: "impact — glass",
        confidence: Math.min(0.78, 0.4 + (high + mid - 0.55) * 1.2),
        atFrame: i,
        durationFrames,
        evidence,
      });
      continue;
    }
    if (low > 0.5 && durationFrames <= 10) {
      out.push({
        tag: "door event",
        confidence: Math.min(0.7, 0.38 + (low - 0.5)),
        atFrame: i,
        durationFrames,
        evidence,
      });
      continue;
    }
    if (low > 0.4 && durationFrames > 25 && flat > 0.25) {
      out.push({
        tag: "vehicle — exterior",
        confidence: 0.55,
        atFrame: i,
        durationFrames,
        evidence,
      });
      continue;
    }
    out.push({ tag: "unclassified impact", confidence: 0.4, atFrame: i, durationFrames, evidence });
  }

  // Footsteps are a RHYTHM, not a single sound: three or more low-frequency
  // taps at a roughly even spacing between 250ms and 900ms.
  const taps = out.filter((e) => e.tag === "door event" || e.tag === "unclassified impact");
  if (taps.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < taps.length; i++) gaps.push(taps[i].atFrame - taps[i - 1].atFrame);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (mean >= 8 && mean <= 28 && spread <= mean * 0.6) {
      return [
        {
          tag: "movement detected",
          confidence: 0.6,
          atFrame: taps[0].atFrame,
          durationFrames: taps[taps.length - 1].atFrame - taps[0].atFrame,
          evidence: { taps: taps.length, meanGapFrames: round(mean, 1), spreadFrames: spread },
        },
        ...out.filter((e) => !taps.includes(e)),
      ];
    }
  }

  return out;
}

/** Which tags are worth a push by default. Everything still lands in the log. */
export const DEFAULT_PUSH_TAGS: SoundTag[] = ["impact — glass", "elevated vocal stress", "unclassified impact"];
