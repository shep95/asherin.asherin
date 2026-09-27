// asherin.sentinel — layer 5, the intelligence gate.
//
// NARRATIVE CHECK.
//
// The fast detector in vad.ts is an energy-and-spectrum judge. It is honest
// about what it is: it opens on anything with speech-shaped energy, which means
// a television, a fan cycling, a chair scrape with a formant-ish resonance can
// all open a turn. Sending those to a transcriber produces the worst possible
// output — a confident sentence invented out of noise — and that sentence then
// enters the account timeline as if a person said it.
//
// So a second, model-based judgement sits between "a turn closed" and "send it
// for transcription": silero, running locally in wasm, scoring 30 ms frames.
// Nothing leaves the device to make this decision.
//
// Flaws designed around:
//   • the model is 2.3 mb plus a wasm runtime. Loading it at boot would tax
//     every operator who never presses start, so it loads lazily on the first
//     candidate segment and every later call reuses the same instance.
//   • a failed load must not silence the watch. If the model cannot load, this
//     layer reports `available: false` and the pipeline falls back to the fast
//     detector alone — degraded, and said out loud, never silently.
//   • a model verdict is a probability, not a fact. A segment is only discarded
//     when the model finds no speech at all in it; anything partial is kept,
//     because losing a real sentence is far worse than transcribing a fan.
//   • silero expects 16 khz. The caller already resamples to 16 khz for the
//     wav it uploads, so the same buffer is judged that gets transcribed —
//     judging a different signal than the one sent would be theatre.

const MODEL_URL = "/sentinel/silero_vad_legacy.onnx";

/** Matches the installed onnxruntime-web; the runtime's wasm is fetched from
 *  the CDN because the binaries are far too large to ship in the app bundle. */
const ORT_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";

export interface SpeechVerdict {
  /** false only when the model ran and found no speech at all */
  speech: boolean;
  /** portion of the clip the model marked as speech, 0..1 */
  ratio: number;
  /** true when the model actually ran; false means the fast detector decided */
  modelRan: boolean;
  note: string | null;
}

type Vad = { run: (audio: Float32Array, rate: number) => AsyncGenerator<{ audio: Float32Array; start: number; end: number }> };

let loading: Promise<Vad | null> | null = null;
let failureNoted = false;

async function loadVad(): Promise<Vad | null> {
  if (!loading) {
    loading = (async () => {
      try {
        const [{ NonRealTimeVAD }, ort] = await Promise.all([
          import("@ricky0123/vad-web"),
          import("onnxruntime-web"),
        ]);
        ort.env.wasm.wasmPaths = ORT_WASM_BASE;
        // Single-threaded: cross-origin isolation is not guaranteed on this
        // origin, and a threaded runtime silently falls back anyway.
        ort.env.wasm.numThreads = 1;
        const vad = await NonRealTimeVAD.new({
          ortConfig: (o: typeof ort) => {
            o.env.wasm.wasmPaths = ORT_WASM_BASE;
            o.env.wasm.numThreads = 1;
          },
          modelURL: MODEL_URL,
          // Slightly lower than the library default: a missed sentence costs
          // the operator more than a transcribed fan does.
          positiveSpeechThreshold: 0.32,
          negativeSpeechThreshold: 0.24,
          minSpeechMs: 260,
          redemptionMs: 600,
          preSpeechPadMs: 200,
        } as never);

        return vad as unknown as Vad;
      } catch {
        return null;
      }
    })();
  }
  return loading;
}

/** Warm the model without blocking anything, so the first real turn is not the
 *  one that pays the download. */
export function primeNeuralVad(): void {
  void loadVad();
}

export function neuralVadReady(): boolean {
  return Boolean(loading);
}

/**
 * Judge a candidate turn. `pcm` must be mono 16 khz — the same buffer that will
 * be uploaded — so the verdict describes the audio the transcriber receives.
 */
export async function confirmSpeech(pcm: Float32Array, sampleRate: number): Promise<SpeechVerdict> {
  // Under ~250 ms silero has too few frames to judge; the fast detector's
  // minimum-duration rule already covers that case.
  if (pcm.length < sampleRate * 0.25) {
    return { speech: true, ratio: 1, modelRan: false, note: null };
  }
  const vad = await loadVad();
  if (!vad) {
    const note = failureNoted
      ? null
      : "the on-device speech model could not load — turns are being judged by the energy detector alone, which lets more room noise through.";
    failureNoted = true;
    return { speech: true, ratio: 1, modelRan: false, note };
  }

  try {
    // The generator yields the speech audio itself at 16 khz; measuring the
    // returned samples is exact, where start/end are millisecond frame edges
    // rounded outward and would overstate a short turn.
    let speechSamples = 0;
    for await (const found of vad.run(pcm, sampleRate)) {
      speechSamples += found.audio?.length ?? Math.max(0, ((found.end - found.start) / 1000) * 16000);
    }
    const total = (pcm.length / sampleRate) * 16000;
    const ratio = total > 0 ? Math.min(1, speechSamples / total) : 0;
    return {
      speech: speechSamples > 0,
      ratio,
      modelRan: true,
      note: null,
    };

  } catch {
    return { speech: true, ratio: 1, modelRan: false, note: null };
  }
}
