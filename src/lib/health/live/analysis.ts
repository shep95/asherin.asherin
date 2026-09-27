// pure dsp on real samples only. every function here takes concrete arrays gathered by a
// device adapter and returns a proxy read-out with a stated confidence — never a diagnosis,
// never a value manufactured to fill a gap.

// ---------------------------------------------------------------------------------------
// hrv from rr intervals
// ---------------------------------------------------------------------------------------

export interface HrvResult {
  rmssd: number | null;
  sdnn: number | null;
  pnn50: number | null;
  lfPower: number | null;
  hfPower: number | null;
  lfHfRatio: number | null;
  beats: number;
  /** 0..1, grows with beat count; hrv from under ~30 beats is unreliable and flagged low. */
  confidence: number;
  autonomicReadout: string;
}

function cleanRr(rr: number[]): number[] {
  return rr.filter((v) => v > 300 && v < 2000);
}

/** resample an rr series onto a uniform time grid via linear interpolation, for spectral work. */
function interpolateRr(rr: number[], hz: number): number[] {
  const t: number[] = [0];
  for (const v of rr) t.push(t[t.length - 1] + v);
  const totalMs = t[t.length - 1];
  const stepMs = 1000 / hz;
  const out: number[] = [];
  let idx = 0;
  for (let time = 0; time <= totalMs; time += stepMs) {
    while (idx < t.length - 2 && t[idx + 1] < time) idx++;
    const t0 = t[idx];
    const t1 = t[idx + 1] ?? t0 + 1;
    const v0 = rr[idx - 1] ?? rr[0] ?? 0;
    const v1 = rr[idx] ?? v0;
    const frac = t1 === t0 ? 0 : (time - t0) / (t1 - t0);
    out.push(v0 + (v1 - v0) * frac);
  }
  return out;
}

/** basic welch-style power in a band via a naive dft on the interpolated series (short series, no need for fft libs). */
function bandPowerFromSeries(series: number[], hz: number, lo: number, hi: number): number {
  const n = series.length;
  if (n < 8) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const centred = series.map((v) => v - mean);
  let power = 0;
  const freqStep = hz / n;
  for (let k = 1; k < n / 2; k++) {
    const freq = k * freqStep;
    if (freq < lo || freq > hi) continue;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * k * i) / n;
      re += centred[i] * Math.cos(angle);
      im -= centred[i] * Math.sin(angle);
    }
    power += (re * re + im * im) / (n * n);
  }
  return power;
}

export function computeHrv(rrMs: number[]): HrvResult {
  const rr = cleanRr(rrMs);
  const beats = rr.length;
  if (beats < 4) {
    return { rmssd: null, sdnn: null, pnn50: null, lfPower: null, hfPower: null, lfHfRatio: null, beats, confidence: 0, autonomicReadout: "not enough beats captured to estimate hrv." };
  }
  let sqDiff = 0;
  let nn50 = 0;
  for (let i = 1; i < rr.length; i++) {
    const diff = rr[i] - rr[i - 1];
    sqDiff += diff * diff;
    if (Math.abs(diff) > 50) nn50++;
  }
  const rmssd = Math.sqrt(sqDiff / (rr.length - 1));
  const mean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sdnn = Math.sqrt(rr.reduce((a, b) => a + (b - mean) ** 2, 0) / rr.length);
  const pnn50 = (nn50 / (rr.length - 1)) * 100;

  const confidence = Math.max(0, Math.min(1, (beats - 4) / 60));
  let lfPower: number | null = null;
  let hfPower: number | null = null;
  let lfHfRatio: number | null = null;
  let autonomicReadout = "beat count is too low to resolve frequency-domain balance; reporting time-domain hrv only.";
  if (beats >= 30) {
    const hz = 4;
    const series = interpolateRr(rr, hz);
    lfPower = bandPowerFromSeries(series, hz, 0.04, 0.15);
    hfPower = bandPowerFromSeries(series, hz, 0.15, 0.4);
    lfHfRatio = hfPower > 0 ? lfPower / hfPower : null;
    if (lfHfRatio !== null) {
      autonomicReadout =
        lfHfRatio > 2
          ? "lf/hf ratio suggests sympathetic-weighted balance right now — a proxy, not a stress diagnosis."
          : lfHfRatio < 0.5
            ? "lf/hf ratio suggests parasympathetic-weighted balance right now — a proxy reading."
            : "lf/hf ratio sits in a mixed range — no strong autonomic skew detected.";
    }
  }
  return {
    rmssd: Math.round(rmssd),
    sdnn: Math.round(sdnn),
    pnn50: Math.round(pnn50 * 10) / 10,
    lfPower: lfPower === null ? null : Number(lfPower.toFixed(2)),
    hfPower: hfPower === null ? null : Number(hfPower.toFixed(2)),
    lfHfRatio: lfHfRatio === null ? null : Number(lfHfRatio.toFixed(2)),
    beats,
    confidence: Number(confidence.toFixed(2)),
    autonomicReadout,
  };
}

// ---------------------------------------------------------------------------------------
// eeg band powers
// ---------------------------------------------------------------------------------------

export type EegBand = "delta" | "theta" | "alpha" | "beta" | "gamma";

export const EEG_BAND_RANGES: Record<EegBand, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};

export interface EegChannelResult {
  channel: string;
  bandPower: Record<EegBand, number>;
  artefact: boolean;
  signalQuality: number;
}

export interface EegResult {
  channels: EegChannelResult[];
  states: { label: string; confidence: number; detail: string }[];
}

/** naive dft magnitude spectrum, adequate for short eeg windows without pulling in an fft dependency. */
function magnitudeSpectrum(samples: number[], hz: number): { freq: number; magnitude: number }[] {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const windowed = samples.map((v, i) => (v - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const out: { freq: number; magnitude: number }[] = [];
  const freqStep = hz / n;
  for (let k = 1; k < n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * k * i) / n;
      re += windowed[i] * Math.cos(angle);
      im -= windowed[i] * Math.sin(angle);
    }
    out.push({ freq: k * freqStep, magnitude: Math.sqrt(re * re + im * im) / n });
  }
  return out;
}

/** amplitude + jump-based artefact rejection: real eeg rarely exceeds ~150µv or jumps that fast. */
export function detectEegArtefact(samples: number[]): boolean {
  if (samples.some((v) => Math.abs(v) > 200)) return true;
  for (let i = 1; i < samples.length; i++) {
    if (Math.abs(samples[i] - samples[i - 1]) > 120) return true;
  }
  return false;
}

export function analyseEegChannel(channel: string, samples: number[], sampleRateHz: number): EegChannelResult {
  const artefact = detectEegArtefact(samples);
  const bandPower: Record<EegBand, number> = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  if (samples.length >= 32 && !artefact) {
    const spectrum = magnitudeSpectrum(samples, sampleRateHz);
    for (const band of Object.keys(EEG_BAND_RANGES) as EegBand[]) {
      const [lo, hi] = EEG_BAND_RANGES[band];
      const inBand = spectrum.filter((p) => p.freq >= lo && p.freq < hi);
      bandPower[band] = inBand.length ? Number((inBand.reduce((a, p) => a + p.magnitude ** 2, 0) / inBand.length).toFixed(3)) : 0;
    }
  }
  const variance = samples.length ? samples.reduce((a, v) => a + v * v, 0) / samples.length : 0;
  const signalQuality = artefact ? 0.1 : Math.max(0, Math.min(1, variance > 1 ? 0.9 : variance * 0.9));
  return { channel, bandPower, artefact, signalQuality };
}

export function analyseEeg(channels: EegChannelResult[]): EegResult {
  const clean = channels.filter((c) => !c.artefact);
  const states: EegResult["states"] = [];
  if (clean.length === 0) {
    return { channels, states: [{ label: "no clean eeg window", confidence: 0, detail: "every recent channel window was rejected as artefact." }] };
  }
  const avg = (band: EegBand) => clean.reduce((a, c) => a + c.bandPower[band], 0) / clean.length;
  const alpha = avg("alpha");
  const beta = avg("beta");
  const theta = avg("theta");
  const delta = avg("delta");
  const total = alpha + beta + theta + delta + avg("gamma") || 1;
  const confidenceBase = clean.length / channels.length;

  if (alpha / total > 0.35) {
    states.push({ label: "relaxed, eyes-closed-like alpha proxy", confidence: Number((confidenceBase * 0.8).toFixed(2)), detail: "alpha dominates the clean channels — a relaxation proxy, not a clinical read." });
  }
  if (beta / total > 0.35) {
    states.push({ label: "alert / focus proxy", confidence: Number((confidenceBase * 0.75).toFixed(2)), detail: "beta dominates — associated with active engagement in population studies, not a measurement of attention itself." });
  }
  if (theta / total > 0.35 && alpha / total < 0.25) {
    states.push({ label: "drowsy proxy", confidence: Number((confidenceBase * 0.6).toFixed(2)), detail: "theta is elevated relative to alpha and beta — a drowsiness proxy only." });
  }
  if (states.length === 0) {
    states.push({ label: "mixed band pattern", confidence: Number((confidenceBase * 0.5).toFixed(2)), detail: "no single band dominates enough to propose a state." });
  }
  return { channels, states };
}

// ---------------------------------------------------------------------------------------
// motion: tremor, sway, cadence, jaw-impulse candidate
// ---------------------------------------------------------------------------------------

export interface MotionSample {
  t: number;
  ax: number;
  ay: number;
  az: number;
}

export interface TremorResult {
  dominantHz: number;
  amplitude: number;
  inTremorBand: boolean;
}

function dft(series: number[], hz: number, lo: number, hi: number): { freq: number; magnitude: number }[] {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const centred = series.map((v) => v - mean);
  const out: { freq: number; magnitude: number }[] = [];
  const freqStep = hz / n;
  for (let k = 1; k < n / 2; k++) {
    const freq = k * freqStep;
    if (freq < lo || freq > hi) continue;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * k * i) / n;
      re += centred[i] * Math.cos(angle);
      im -= centred[i] * Math.sin(angle);
    }
    out.push({ freq, magnitude: Math.sqrt(re * re + im * im) / n });
  }
  return out;
}

export function analyseTremor(samples: MotionSample[]): TremorResult | null {
  if (samples.length < 32) return null;
  const duration = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (duration <= 0) return null;
  const hz = samples.length / duration;
  const magnitudes = samples.map((s) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az));
  const spectrum = dft(magnitudes, hz, 3, Math.min(13, hz / 2 - 0.5));
  if (spectrum.length === 0) return null;
  const peak = spectrum.reduce((best, p) => (p.magnitude > best.magnitude ? p : best), spectrum[0]);
  return { dominantHz: Number(peak.freq.toFixed(1)), amplitude: Number(peak.magnitude.toFixed(3)), inTremorBand: peak.freq >= 4 && peak.freq <= 12 };
}

export function posturalSwayPathLength(samples: MotionSample[]): number | null {
  if (samples.length < 8) return null;
  let path = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].ax - samples[i - 1].ax;
    const dy = samples[i].ay - samples[i - 1].ay;
    path += Math.sqrt(dx * dx + dy * dy);
  }
  return Number(path.toFixed(3));
}

export function stepCadence(samples: MotionSample[]): number | null {
  if (samples.length < 32) return null;
  const duration = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (duration <= 0) return null;
  const magnitude = samples.map((s) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az));
  const mean = magnitude.reduce((a, b) => a + b, 0) / magnitude.length;
  let crossings = 0;
  for (let i = 1; i < magnitude.length; i++) {
    if (magnitude[i - 1] < mean && magnitude[i] >= mean) crossings++;
  }
  const stepsPerMinute = (crossings / duration) * 60;
  return Number(stepsPerMinute.toFixed(1));
}

export interface JawImpulseResult {
  candidateCount: number;
  perMinute: number;
}

/** only meaningful when the motion source is head-worn; caller must gate on that. */
export function detectJawImpulses(samples: MotionSample[], thresholdG: number = 1.5): JawImpulseResult | null {
  if (samples.length < 16) return null;
  const duration = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (duration <= 0) return null;
  let count = 0;
  for (let i = 1; i < samples.length; i++) {
    const jump = Math.abs(samples[i].az - samples[i - 1].az);
    if (jump > thresholdG * 9.81) count++;
  }
  return { candidateCount: count, perMinute: Number(((count / duration) * 60).toFixed(1)) };
}

// ---------------------------------------------------------------------------------------
// audio: breathing rate, noise dose, voice presence
// ---------------------------------------------------------------------------------------

export interface AudioSample {
  t: number;
  rms: number;
}

export interface BreathingResult {
  breathsPerMinute: number;
  confidence: number;
}

/** breathing rate from periodicity of the low-frequency envelope (rms series), not from the raw waveform. */
export function estimateBreathingRate(envelope: AudioSample[]): BreathingResult | null {
  if (envelope.length < 20) return null;
  const duration = (envelope[envelope.length - 1].t - envelope[0].t) / 1000;
  if (duration < 8) return null;
  const hz = envelope.length / duration;
  const series = envelope.map((e) => e.rms);
  const spectrum = dft(series, hz, 0.1, 0.6); // 6–36 breaths/min
  if (spectrum.length === 0) return null;
  const peak = spectrum.reduce((best, p) => (p.magnitude > best.magnitude ? p : best), spectrum[0]);
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, v) => a + (v - mean) ** 2, 0) / series.length;
  const confidence = Math.max(0, Math.min(1, peak.magnitude / (Math.sqrt(variance) + 0.001) / 5));
  return { breathsPerMinute: Number((peak.freq * 60).toFixed(1)), confidence: Number(confidence.toFixed(2)) };
}

export interface NoiseDoseResult {
  approxDbA: number;
  caveat: string;
}

/** uncalibrated dbfs-to-dba proxy — explicitly caveated, never presented as a calibrated slm reading. */
export function estimateNoiseDose(frequencyDb: Float32Array): NoiseDoseResult {
  const finite = Array.from(frequencyDb).filter((v) => Number.isFinite(v));
  const mean = finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : -100;
  const approxDbA = Math.round(mean + 100); // rough offset from dbfs to a plausible dba range
  return {
    approxDbA: Math.max(0, approxDbA),
    caveat: "uncalibrated microphone estimate — treat as relative, not a certified sound-level measurement.",
  };
}

export function detectVoicePresence(frequencyDb: Float32Array, sampleRate: number): boolean {
  const binHz = sampleRate / 2 / frequencyDb.length;
  const loBin = Math.floor(300 / binHz);
  const hiBin = Math.ceil(3400 / binHz);
  let energy = 0;
  let count = 0;
  for (let i = loBin; i <= hiBin && i < frequencyDb.length; i++) {
    if (Number.isFinite(frequencyDb[i])) {
      energy += frequencyDb[i];
      count++;
    }
  }
  if (count === 0) return false;
  return energy / count > -55;
}

// ---------------------------------------------------------------------------------------
// sleep staging proxy — only when hr + motion are both live for a long session.
// ---------------------------------------------------------------------------------------

export interface SleepSegment {
  startMs: number;
  endMs: number;
  stage: "wake" | "light-candidate" | "deep-candidate";
}

export interface SleepProxyResult {
  segments: SleepSegment[];
  note: string;
}

export function sleepStagingProxy(
  hrSeries: { t: number; bpm: number }[],
  motionSeries: { t: number; magnitude: number }[],
  minDurationMs: number = 20 * 60 * 1000,
): SleepProxyResult | null {
  if (hrSeries.length < 10 || motionSeries.length < 10) return null;
  const start = Math.min(hrSeries[0].t, motionSeries[0].t);
  const end = Math.max(hrSeries[hrSeries.length - 1].t, motionSeries[motionSeries.length - 1].t);
  if (end - start < minDurationMs) return null;
  const bucketMs = 5 * 60 * 1000;
  const segments: SleepSegment[] = [];
  for (let t = start; t < end; t += bucketMs) {
    const hrWindow = hrSeries.filter((s) => s.t >= t && s.t < t + bucketMs).map((s) => s.bpm);
    const motionWindow = motionSeries.filter((s) => s.t >= t && s.t < t + bucketMs).map((s) => s.magnitude);
    if (hrWindow.length === 0 || motionWindow.length === 0) continue;
    const meanHr = hrWindow.reduce((a, b) => a + b, 0) / hrWindow.length;
    const meanMotion = motionWindow.reduce((a, b) => a + b, 0) / motionWindow.length;
    let stage: SleepSegment["stage"] = "wake";
    if (meanMotion < 0.05 && meanHr < 65) stage = "deep-candidate";
    else if (meanMotion < 0.2) stage = "light-candidate";
    segments.push({ startMs: t, endMs: t + bucketMs, stage });
  }
  return { segments, note: "proxy segmentation from heart rate and motion only — not polysomnography and not a sleep-stage diagnosis." };
}
