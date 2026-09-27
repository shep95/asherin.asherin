// asherin.sentinel — layers 2, 3 and 4: the ear model.
//
// NARRATIVE CHECK, written before the code.
//
// A microphone hears flat. A person does not. The ear is most sensitive around
// 3–4 khz, discards sub-bass rumble it cannot use, compresses loud events on
// its own inside the cochlea, and stops reporting a steady room-tone floor to
// the conscious mind at all. A transcription engine fed a flat capture is
// therefore fed something no human ever hears: hvac hum at full weight, a door
// slam at the same gain as a whisper, and a noise floor that never stops.
//
// So this chain is not "audio polish". Each stage is a deliberate stand-in for
// one thing the ear does before the brain gets involved:
//
//   layer 2  frequency shaping   → the equal-loudness contour
//   layer 3  dynamic compression → cochlear automatic gain
//   layer 4  noise gate          → habituation to a steady floor
//
// The flaws this design has to survive, named up front:
//
//   • a gate that hard-zeroes samples clicks, and a click is a broadband
//     transient — the sound classifier would file it as an impact. So the gate
//     fades over 10 ms rather than switching, and holds open for 200 ms so the
//     tail of a word is never guillotined.
//   • an AudioWorklet needs a module URL. Shipping a separate file means a
//     deploy where the js is new and the worklet is stale. The processor source
//     therefore travels inline as a blob URL, versioned with the bundle.
//   • no worklet at all (older Safari, a blocked blob URL) must not mean no
//     capture. The chain degrades to filters + compressor and says so, instead
//     of throwing and taking the whole watch down.
//   • makeup gain after compression can push a loud room into clipping. The
//     gain is applied before the gate and kept at +6 db, and the downstream
//     feature extractor measures the real post-chain rms, so the meters the
//     operator sees are the signal the transcriber actually gets — not the raw
//     mic.
//
// Bluetooth honesty: a browser cannot pick HFP over A2DP, cannot force the mSBC
// wideband codec, and cannot read which one the OS negotiated. Asking for a
// microphone at all makes the OS switch a headset into its voice profile, which
// is narrowband on older links. This chain tunes what arrives; it cannot widen
// a band the radio already threw away, and the room says so rather than
// implying a 48 khz capture from an 8 khz link.

export interface EarChainTuning {
  /** layer 2 */
  rumbleCutHz: number;
  warmthHz: number;
  warmthGainDb: number;
  presenceHz: number;
  presenceGainDb: number;
  presenceQ: number;
  airShelfHz: number;
  airShelfGainDb: number;
  ceilingHz: number;
  /** layer 3 */
  compThresholdDb: number;
  compRatio: number;
  compAttackSec: number;
  compReleaseSec: number;
  compKneeDb: number;
  makeupGainDb: number;
  /** layer 4 */
  gateThresholdDb: number;
  gateHoldMs: number;
  gateFadeMs: number;
}

/** The reference tuning: the equal-loudness contour approximated with five
 *  biquads, cochlear compression, and habituation at a whisper-safe floor. */
export const EAR_TUNING: EarChainTuning = {
  rumbleCutHz: 80,
  warmthHz: 300,
  warmthGainDb: 2,
  presenceHz: 3500,
  presenceGainDb: 4,
  presenceQ: 0.8,
  airShelfHz: 8000,
  airShelfGainDb: -6,
  ceilingHz: 16000,
  compThresholdDb: -24,
  compRatio: 4,
  compAttackSec: 0.003,
  compReleaseSec: 0.15,
  compKneeDb: 10,
  makeupGainDb: 6,
  gateThresholdDb: -45,
  gateHoldMs: 200,
  gateFadeMs: 10,
};

/** Pickup distance changes only what counts as the floor. A headset on a collar
 *  and a phone across a room disagree about which -50 db is worth keeping. */
export const GATE_BY_PICKUP: Record<"near" | "balanced" | "far", number> = {
  near: -38,
  balanced: -45,
  far: -52,
};

export const dbToLinear = (db: number): number => Math.pow(10, db / 20);
export const linearToDb = (x: number): number => (x <= 0 ? -Infinity : 20 * Math.log10(x));

/**
 * Layer 4 as an AudioWorklet, source-inline so it can never drift from the
 * bundle that loaded it. It is a gate with hysteresis, hold and a raised-cosine
 * fade — not the naive `Math.abs(x) > t ? x : 0`, which zips a click into the
 * stream on every syllable boundary and destroys the sound classifier's input.
 */
const GATE_WORKLET_SOURCE = `
class SentinelGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: 0.0056, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "holdSamples", defaultValue: 9600, minValue: 0, maxValue: 480000, automationRate: "k-rate" },
      { name: "fadeSamples", defaultValue: 480, minValue: 1, maxValue: 48000, automationRate: "k-rate" },
    ];
  }
  constructor() {
    super();
    this.envelope = 0;   // rectified follower, ~5 ms
    this.gain = 0;       // current gate gain, 0..1
    this.held = 0;       // samples remaining on the hold timer
    this.openFrames = 0;
    this.reported = 0;
  }
  process(inputs, outputs, params) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) { output.fill(0); return true; }

    const threshold = params.threshold[0];
    const hold = params.holdSamples[0];
    const step = 1 / Math.max(1, params.fadeSamples[0]);
    // Hysteresis: open at the threshold, close 3 db under it, so a signal
    // sitting exactly on the line does not chatter the gate at frame rate.
    const closeAt = threshold * 0.707;

    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const rect = x < 0 ? -x : x;
      // one-pole follower: fast attack so a consonant opens the gate, slow
      // release so the envelope does not fall inside a word.
      this.envelope = rect > this.envelope ? this.envelope + (rect - this.envelope) * 0.35 : this.envelope * 0.9994;

      if (this.envelope > threshold) this.held = hold;
      else if (this.held > 0) this.held--;

      const wantOpen = this.envelope > threshold || this.held > 0 || (this.gain > 0 && this.envelope > closeAt);
      if (wantOpen) this.gain = this.gain + step > 1 ? 1 : this.gain + step;
      else this.gain = this.gain - step < 0 ? 0 : this.gain - step;

      output[i] = x * this.gain;
      if (this.gain > 0) this.openFrames++;
    }

    // Report duty cycle about twice a second: the room shows how much of the
    // hour actually passed the gate, which is the only honest measure of
    // whether the threshold is set where this environment needs it.
    this.reported += input.length;
    if (this.reported >= sampleRate / 2) {
      this.port.postMessage({ openRatio: this.openFrames / this.reported, envelope: this.envelope });
      this.reported = 0;
      this.openFrames = 0;
    }
    return true;
  }
}
registerProcessor("sentinel-gate", SentinelGate);
`;

/** Mirror of GATE_WORKLET_SOURCE served from this origin. A worklet module is
 *  fetched under script-src, and this app's content policy does not allow
 *  blob: scripts — loading the inline copy first would silently cost every
 *  session its silence gate. The blob is kept only as a fallback for a host
 *  that fails to serve the file. */
const GATE_WORKLET_URL = "/sentinel/gate-worklet.js";

let workletUrl: string | null = null;
const loadedContexts = new WeakSet<BaseAudioContext>();

async function ensureGateModule(ctx: BaseAudioContext): Promise<boolean> {
  if (loadedContexts.has(ctx)) return true;
  if (!ctx.audioWorklet) return false;
  try {
    await ctx.audioWorklet.addModule(GATE_WORKLET_URL);
    loadedContexts.add(ctx);
    return true;
  } catch {
    /* fall through to the inline copy */
  }
  try {
    if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([GATE_WORKLET_SOURCE], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(workletUrl);
    loadedContexts.add(ctx);
    return true;
  } catch {
    return false;
  }
}


export interface EarChain {
  /** the node the rest of the pipeline reads from */
  tail: AudioNode;
  /** true when layer 4 is a real worklet rather than a skipped stage */
  gated: boolean;
  /** fraction of the last half-second the gate let through, 0..1 */
  gateOpenRatio: () => number;
  setGateThresholdDb: (db: number) => void;
  setMakeupGainDb: (db: number) => void;
  describe: () => string;
  disconnect: () => void;
}

/**
 * Build layers 2 → 3 → 4 and hand back the tail. The caller owns the source and
 * whatever consumes the tail; this function owns nothing but the chain.
 */
export async function buildEarChain(
  ctx: AudioContext,
  source: AudioNode,
  tuning: EarChainTuning = EAR_TUNING,
): Promise<EarChain> {
  const biquad = (type: BiquadFilterType, freq: number, gain?: number, q?: number) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = freq;
    if (gain !== undefined) n.gain.value = gain;
    if (q !== undefined) n.Q.value = q;
    return n;
  };

  // layer 2 — the contour.
  // Two cascaded high-pass stages, not one: a single biquad is 12 db/octave,
  // and 60 hz mains hum sits well under half an octave below an 80 hz corner,
  // so one stage leaves most of the rumble in place. Cascading gets it to
  // 24 db/octave, which is what actually clears table thumps and hvac out of
  // the compressor's input — otherwise the compressor rides the rumble and
  // ducks the speech that follows it.
  const highpass = biquad("highpass", tuning.rumbleCutHz, undefined, 0.707);
  const highpass2 = biquad("highpass", tuning.rumbleCutHz, undefined, 0.707);
  const warmth = biquad("lowshelf", tuning.warmthHz, tuning.warmthGainDb);

  const presence = biquad("peaking", tuning.presenceHz, tuning.presenceGainDb, tuning.presenceQ);
  const airShelf = biquad("highshelf", tuning.airShelfHz, tuning.airShelfGainDb);
  // A lowpass above nyquist is a no-op that lies in the description, so the
  // ceiling follows the hardware when the link is narrowband.
  const ceilingHz = Math.min(tuning.ceilingHz, Math.max(3000, ctx.sampleRate / 2 - 500));
  const ceiling = biquad("lowpass", ceilingHz);

  // layer 3 — cochlear gain
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = tuning.compThresholdDb;
  comp.ratio.value = tuning.compRatio;
  comp.attack.value = tuning.compAttackSec;
  comp.release.value = tuning.compReleaseSec;
  comp.knee.value = tuning.compKneeDb;

  const makeup = ctx.createGain();
  makeup.gain.value = dbToLinear(tuning.makeupGainDb);

  source.connect(highpass);
  highpass.connect(highpass2);
  highpass2.connect(warmth);
  warmth.connect(presence);
  presence.connect(airShelf);
  airShelf.connect(ceiling);
  ceiling.connect(comp);
  comp.connect(makeup);

  // layer 4 — habituation
  let tail: AudioNode = makeup;
  let gate: AudioWorkletNode | null = null;
  let openRatio = 1;

  if (await ensureGateModule(ctx)) {
    try {
      gate = new AudioWorkletNode(ctx, "sentinel-gate", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const p = gate.parameters;
      p.get("threshold")!.value = dbToLinear(tuning.gateThresholdDb);
      p.get("holdSamples")!.value = Math.round((tuning.gateHoldMs / 1000) * ctx.sampleRate);
      p.get("fadeSamples")!.value = Math.max(1, Math.round((tuning.gateFadeMs / 1000) * ctx.sampleRate));
      gate.port.onmessage = (ev) => {
        const d = ev.data as { openRatio?: number };
        if (typeof d?.openRatio === "number") openRatio = d.openRatio;
      };
      makeup.connect(gate);
      tail = gate;
    } catch {
      gate = null;
    }
  }

  const nodes: AudioNode[] = [highpass, highpass2, warmth, presence, airShelf, ceiling, comp, makeup];
  if (gate) nodes.push(gate);

  return {
    tail,
    gated: Boolean(gate),
    gateOpenRatio: () => openRatio,
    setGateThresholdDb: (db) => {
      if (gate) gate.parameters.get("threshold")!.value = dbToLinear(db);
    },
    setMakeupGainDb: (db) => {
      makeup.gain.setTargetAtTime(dbToLinear(db), ctx.currentTime, 0.05);
    },
    describe: () =>
      [
        `${Math.round(ctx.sampleRate / 1000)} khz mono`,
        `rumble cut ${tuning.rumbleCutHz} hz at 24 db/oct`,
        `presence +${tuning.presenceGainDb} db at ${tuning.presenceHz} hz`,
        `air ${tuning.airShelfGainDb} db over ${tuning.airShelfHz} hz`,
        `ceiling ${Math.round(ceilingHz / 1000)} khz`,
        `compression ${tuning.compRatio}:1 at ${tuning.compThresholdDb} db`,
        `makeup +${tuning.makeupGainDb} db`,
        gate ? `gate ${tuning.gateThresholdDb} db, ${tuning.gateHoldMs} ms hold` : "gate unavailable in this browser — the floor is passed through",
      ].join(" · "),
    disconnect: () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* teardown is best effort */
        }
      }
      if (gate) gate.port.onmessage = null;
    },
  };
}
