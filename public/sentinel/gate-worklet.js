// generated from src/lib/sentinel/audio/earChain.ts — keep in sync

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
