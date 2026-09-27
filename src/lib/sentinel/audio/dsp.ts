// asherin.sentinel — signal floor.
//
// Everything the room claims about a sound has to come from a number that was
// actually measured, so the primitives live here on their own, pure and
// synchronous, and every layer above them (voice activity, sound events,
// voiceprints) is a named reading of these features rather than a guess.
//
// Deliberate constraints:
//   • real radix-2 FFT, iterative, no recursion (a recursion-per-frame at 31
//     frames/second is a garbage-collection tax for nothing).
//   • power-of-two frame size enforced by the caller through FRAME.
//   • no allocation inside the hot loop beyond the two scratch arrays, reused.

export const FRAME = 512;

/** Hann window, cached per length: recomputing cosines per frame is waste. */
const windows = new Map<number, Float32Array>();
export function hann(n: number): Float32Array {
  const cached = windows.get(n);
  if (cached) return cached;
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  windows.set(n, w);
  return w;
}

/**
 * Magnitude spectrum of one real frame. Returns n/2 bins.
 * In-place iterative Cooley-Tukey on scratch buffers owned by the caller-free
 * module scope; safe because the whole pipeline is single-threaded per worklet.
 */
const reScratch = new Float32Array(FRAME);
const imScratch = new Float32Array(FRAME);

export function magnitudeSpectrum(frame: Float32Array): Float32Array {
  const n = frame.length;
  if ((n & (n - 1)) !== 0) throw new Error("frame length must be a power of two");
  const re = n === FRAME ? reScratch : new Float32Array(n);
  const im = n === FRAME ? imScratch : new Float32Array(n);
  const w = hann(n);
  for (let i = 0; i < n; i++) {
    re[i] = frame[i] * w[i];
    im[i] = 0;
  }

  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + (len >> 1)] * cr - im[i + k + (len >> 1)] * ci;
        const vi = re[i + k + (len >> 1)] * ci + im[i + k + (len >> 1)] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + (len >> 1)] = ur - vr;
        im[i + k + (len >> 1)] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }

  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]) / half;
  return mag;
}

export interface FrameFeatures {
  /** root-mean-square amplitude, 0..1 */
  rms: number;
  /** zero-crossing rate, 0..1 */
  zcr: number;
  /** spectral centroid in hz */
  centroid: number;
  /** spectral flatness, 0..1 — tonal near 0, noise-like near 1 */
  flatness: number;
  /** normalised band energies: <300hz, 300-2000hz, 2-5khz, >5khz */
  bands: [number, number, number, number];
  /** dominant pitch estimate in hz over 70-400hz, 0 when unvoiced */
  pitch: number;
}

const EMPTY_BANDS: [number, number, number, number] = [0, 0, 0, 0];

export function frameFeatures(frame: Float32Array, sampleRate: number): FrameFeatures {
  let sum = 0;
  let crossings = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
    if (i > 0 && ((frame[i] >= 0 && frame[i - 1] < 0) || (frame[i] < 0 && frame[i - 1] >= 0))) crossings++;
  }
  const rms = Math.sqrt(sum / frame.length);
  const zcr = crossings / (frame.length - 1);

  const mag = magnitudeSpectrum(frame);
  const binHz = sampleRate / frame.length;
  let total = 0;
  let weighted = 0;
  let logSum = 0;
  const bands: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 1; i < mag.length; i++) {
    const m = mag[i];
    const hz = i * binHz;
    total += m;
    weighted += m * hz;
    logSum += Math.log(m + 1e-12);
    if (hz < 300) bands[0] += m;
    else if (hz < 2000) bands[1] += m;
    else if (hz < 5000) bands[2] += m;
    else bands[3] += m;
  }
  const centroid = total > 0 ? weighted / total : 0;
  const geo = Math.exp(logSum / (mag.length - 1));
  const arith = total / (mag.length - 1);
  const flatness = arith > 0 ? Math.min(1, geo / arith) : 0;
  if (total > 0) for (let b = 0; b < 4; b++) bands[b] /= total;

  // Pitch by autocorrelation over the human range. Cheap, and the only claim
  // made on it is "voiced-ish", never a musical note.
  let pitch = 0;
  if (rms > 0.004) {
    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.min(frame.length - 1, Math.floor(sampleRate / 70));
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let acc = 0;
      for (let i = 0; i + lag < frame.length; i++) acc += frame[i] * frame[i + lag];
      if (acc > best) {
        best = acc;
        bestLag = lag;
      }
    }
    const energy = sum || 1e-9;
    if (bestLag > 0 && best / energy > 0.3) pitch = sampleRate / bestLag;
  }

  return { rms, zcr, centroid, flatness, bands: total > 0 ? bands : EMPTY_BANDS, pitch };
}

/** Split a buffer into non-overlapping frames of `size`, dropping the remainder. */
export function frames(buffer: Float32Array, size = FRAME): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i + size <= buffer.length; i += size) out.push(buffer.subarray(i, i + size));
  return out;
}

export function featureSeries(buffer: Float32Array, sampleRate: number, size = FRAME): FrameFeatures[] {
  return frames(buffer, size).map((f) => frameFeatures(f, sampleRate));
}
