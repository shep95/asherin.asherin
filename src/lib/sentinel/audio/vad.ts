// asherin.sentinel — layer 1, voice activity detection.
//
// The narrative asked for a tiny model that keeps the heavy pipeline asleep.
// Downloading a neural VAD into a browser tab would be a 1mb network cost per
// session for a decision three measured features already make well, so this is
// an energy + zero-crossing + centroid gate with an ADAPTIVE noise floor, which
// is the part that matters: a fixed threshold works in a quiet room and fails
// in a car, a kitchen or a bar, and a detector that fails outside a studio is
// not an always-on detector.
//
// Flaws deliberately handled:
//   • cold start — the floor is seeded from the first frames instead of 0, so
//     the first breath does not read as speech.
//   • ratcheting — the floor only tracks DOWNWARD fast and upward slowly, so a
//     long conversation cannot raise the floor above the speaker's own voice.
//   • chatter — a hangover keeps a segment open across the natural gaps inside
//     a sentence; without it every word becomes its own "speaker turn".
//   • runaway — a segment is force-closed at maxMs so one long noise cannot
//     hold the buffer open forever.

import type { FrameFeatures } from "./dsp";

export type VadVerdict = "silence" | "opening" | "speech" | "closed";

export interface VadOptions {
  /** speech must exceed floor by this factor */
  ratio: number;
  /** frames of continued speech required before a segment opens */
  minOpenFrames: number;
  /** frames of quiet tolerated inside a segment before it closes */
  hangoverFrames: number;
  /** hard ceiling on one segment, in frames */
  maxFrames: number;
  /** absolute rms below which nothing is ever speech (dead mic / muted input) */
  absoluteFloor: number;
}

export const VAD_DEFAULTS: VadOptions = {
  ratio: 2.6,
  minOpenFrames: 4,
  hangoverFrames: 12,
  maxFrames: 900,
  absoluteFloor: 0.0025,
};

/** Pickup sensitivity presets. "near" rejects distant room noise; "far" opens
 * on quiet voices across a room at the cost of more false openings. */
export type VadSensitivity = "near" | "balanced" | "far";

export const VAD_SENSITIVITY: Record<VadSensitivity, VadOptions> = {
  near: { ratio: 3.4, minOpenFrames: 6, hangoverFrames: 10, maxFrames: 900, absoluteFloor: 0.005 },
  balanced: VAD_DEFAULTS,
  far: { ratio: 1.9, minOpenFrames: 3, hangoverFrames: 16, maxFrames: 900, absoluteFloor: 0.0012 },
};

export function isVadSensitivity(v: unknown): v is VadSensitivity {
  return v === "near" || v === "balanced" || v === "far";
}

/** Human speech occupies a narrow shape: voiced energy low-mid, moderate zcr. */
export function looksLikeSpeech(f: FrameFeatures): boolean {
  if (f.zcr > 0.42) return false; // hiss, cymbal, keyboard
  if (f.centroid > 4200) return false; // bright transient, not a voice
  if (f.bands[1] + f.bands[2] < 0.25) return false; // no formant energy at all
  return true;
}

export interface VadSegment {
  startFrame: number;
  endFrame: number;
  /** true when the segment carried voice-shaped frames for most of its length */
  voiced: boolean;
  peakRms: number;
}

/** Stateful detector for the live daemon. One instance per capture session. */
export class Vad {
  private floor = 0;
  private seeded = 0;
  private open = false;
  private openFrames = 0;
  private quietFrames = 0;
  private voicedFrames = 0;
  private startFrame = 0;
  private peak = 0;
  private index = -1;

  constructor(private readonly opts: VadOptions = VAD_DEFAULTS) {}

  /** Current adaptive noise floor — surfaced so the UI can show a real meter. */
  get noiseFloor(): number {
    return this.floor;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Feed one frame. Returns a segment only on the frame that closes it. */
  push(f: FrameFeatures): { verdict: VadVerdict; segment?: VadSegment } {
    this.index++;

    // Seed the floor from the opening frames rather than trusting zero.
    if (this.seeded < 12) {
      this.seeded++;
      this.floor = this.seeded === 1 ? f.rms : this.floor * 0.7 + f.rms * 0.3;
      return { verdict: "silence" };
    }

    const active = f.rms > this.opts.absoluteFloor && f.rms > this.floor * this.opts.ratio && looksLikeSpeech(f);

    // Floor tracking: fall quickly toward quiet, rise reluctantly, and never
    // learn from a frame we just called speech.
    if (!active) {
      const alpha = f.rms < this.floor ? 0.25 : 0.02;
      this.floor = this.floor * (1 - alpha) + f.rms * alpha;
    }

    if (active) {
      if (!this.open) {
        this.open = true;
        this.startFrame = this.index;
        this.openFrames = 0;
        this.voicedFrames = 0;
        this.peak = 0;
      }
      this.openFrames++;
      this.quietFrames = 0;
      if (f.pitch > 0) this.voicedFrames++;
      if (f.rms > this.peak) this.peak = f.rms;
      if (this.openFrames >= this.opts.maxFrames) return this.close();
      return { verdict: this.openFrames >= this.opts.minOpenFrames ? "speech" : "opening" };
    }

    if (this.open) {
      this.quietFrames++;
      this.openFrames++;
      if (this.quietFrames >= this.opts.hangoverFrames) return this.close();
      return { verdict: "speech" };
    }

    return { verdict: "silence" };
  }

  /** Close whatever is open — used on stop so the tail is never dropped. */
  flush(): VadSegment | null {
    if (!this.open) return null;
    return this.close().segment ?? null;
  }

  private close(): { verdict: VadVerdict; segment?: VadSegment } {
    const length = this.index - this.startFrame + 1;
    const speech = length - this.quietFrames;
    const segment: VadSegment = {
      startFrame: this.startFrame,
      endFrame: this.index - this.quietFrames,
      voiced: speech > 0 && this.voicedFrames / speech > 0.35,
      peakRms: this.peak,
    };
    this.open = false;
    this.openFrames = 0;
    this.quietFrames = 0;
    this.voicedFrames = 0;
    this.peak = 0;
    // Too short to be a word — report closure but hand back nothing.
    if (speech < this.opts.minOpenFrames) return { verdict: "closed" };
    return { verdict: "closed", segment };
  }
}

/** Offline pass over a whole feature series. Used by the tests and by replay. */
export function segmentSeries(series: FrameFeatures[], opts: VadOptions = VAD_DEFAULTS): VadSegment[] {
  const vad = new Vad(opts);
  const out: VadSegment[] = [];
  for (const f of series) {
    const { segment } = vad.push(f);
    if (segment) out.push(segment);
  }
  const tail = vad.flush();
  if (tail) out.push(tail);
  return out;
}
