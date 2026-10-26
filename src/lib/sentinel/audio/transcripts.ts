// asherin.sentinel — the words, from the browser's own speech recogniser.
//
// NARRATIVE CHECK, written before the code.
//
// The local edition has no transcription server. The one path to words that
// exists in a browser is the Web Speech API: a recogniser the browser itself
// provides (chrome, edge, safari; not firefox). Three facts about it shape
// everything below, and the room states all three on its face:
//
//   • it listens to the SYSTEM DEFAULT microphone. it cannot be pointed at a
//     chosen input, so only the lane bound to the default input gets words; a
//     headset lane records turns without them and says so.
//   • it may not run on this device. chrome and safari hand audio to the
//     browser maker's speech service unless the browser can process locally
//     (`processLocally`, newer chrome with a language pack). the recogniser
//     reports which it was given, and the room prints it. asherin itself
//     sends nothing anywhere; switching transcription off keeps the audio
//     entirely on this device.
//   • it segments speech by its own rules, not by the energy detector's. a
//     phrase therefore lands on the captured turn it overlaps most, and a turn
//     the recogniser missed is kept as audio with "no transcript for this
//     turn" rather than a guessed sentence.
//
// The matching is pure and tested; the recogniser wrapper is thin.

export interface SpokenPhrase {
  text: string;
  /** ms epoch when the first interim result for this phrase arrived */
  startedAt: number;
  /** ms epoch when the final result arrived */
  endedAt: number;
  confidence: number | null;
  lang: string;
  /** true when the browser confirmed on-device processing for this session */
  local: boolean;
}

export interface TurnWindow {
  id: string;
  startedAt: number;
  endedAt: number;
}

/** A phrase older than this with no turn to land on is dropped: the turn it
 *  belonged to was discarded as noise, or never opened. */
export const PHRASE_TTL_MS = 20_000;
/** A turn waits this long for its words before being considered wordless. */
export const TURN_TTL_MS = 20_000;
/** A phrase and a turn that touch only within this slack still pair. */
export const PAIR_SLACK_MS = 1_500;

export function overlapMs(a: { startedAt: number; endedAt: number }, b: { startedAt: number; endedAt: number }): number {
  return Math.min(a.endedAt, b.endedAt) - Math.max(a.startedAt, b.startedAt);
}

function pairs(a: { startedAt: number; endedAt: number }, b: { startedAt: number; endedAt: number }): boolean {
  return overlapMs(a, b) >= -PAIR_SLACK_MS;
}

/**
 * Two queues that empty into each other. A turn offered before its phrase
 * waits; a phrase offered before its turn waits; whichever arrives second
 * takes the best partner. Every pairing is by time overlap and nothing else.
 */
export class PhraseMatcher {
  private phrases: SpokenPhrase[] = [];
  private turns: TurnWindow[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** A captured turn asks for its words. Returns the phrase, or null and waits. */
  offerTurn(turn: TurnWindow): SpokenPhrase | null {
    this.expire();
    const best = this.best(this.phrases, turn);
    if (best) {
      this.phrases = this.phrases.filter((p) => p !== best);
      return best;
    }
    this.turns.push(turn);
    return null;
  }

  /** A final phrase looks for the turn it belongs to. Returns the turn, or null and waits. */
  offerPhrase(phrase: SpokenPhrase): TurnWindow | null {
    this.expire();
    const best = this.best(this.turns, phrase);
    if (best) {
      this.turns = this.turns.filter((t) => t !== best);
      return best;
    }
    this.phrases.push(phrase);
    return null;
  }

  pendingPhrases(): number {
    return this.phrases.length;
  }

  pendingTurns(): number {
    return this.turns.length;
  }

  /** Drop what has waited too long. Called on every offer and on stop. */
  expire(at = this.now()): void {
    this.phrases = this.phrases.filter((p) => at - p.endedAt < PHRASE_TTL_MS);
    this.turns = this.turns.filter((t) => at - t.endedAt < TURN_TTL_MS);
  }

  clear(): void {
    this.phrases = [];
    this.turns = [];
  }

  private best<T extends { startedAt: number; endedAt: number }>(pool: T[], target: { startedAt: number; endedAt: number }): T | null {
    let winner: T | null = null;
    let score = -Infinity;
    for (const item of pool) {
      if (!pairs(item, target)) continue;
      const s = overlapMs(item, target);
      if (s > score) {
        score = s;
        winner = item;
      }
    }
    return winner;
  }
}

// ── the recogniser ───────────────────────────────────────────────────────────

export type RecognitionProcessing = "on-device" | "browser-service" | "unknown";

export interface SpeechSupport {
  available: boolean;
  /** what the browser says about where recognition happens, before a session starts */
  processing: RecognitionProcessing;
  note: string;
}

type RecognitionCtor = new () => RecognitionInstance;

interface RecognitionResultLike {
  isFinal: boolean;
  0?: { transcript: string; confidence: number };
  length: number;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult: ((ev: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string; message?: string }) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface RecognitionStatic extends RecognitionCtor {
  available?: (opts: { langs: string[]; processLocally?: boolean }) => Promise<string>;
}

function recognitionCtor(): RecognitionStatic | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionStatic; webkitSpeechRecognition?: RecognitionStatic };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The recogniser's language tag. The channel stores an iso-639-1 code or
 *  "auto"; the api wants a bcp-47 tag and has no auto mode, so auto follows
 *  the browser's own language. */
export function recognitionLang(sourceLang: string): string {
  if (!sourceLang || sourceLang === "auto") {
    return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  }
  return sourceLang;
}

/** What this browser can do about words, said before any microphone opens. */
export async function speechSupport(lang = "en-US"): Promise<SpeechSupport> {
  const ctor = recognitionCtor();
  if (!ctor) {
    return { available: false, processing: "unknown", note: "this browser has no speech recogniser, so turns are kept as audio without words." };
  }
  if (typeof ctor.available === "function") {
    try {
      const local = await ctor.available({ langs: [lang], processLocally: true });
      if (local === "available") {
        return { available: true, processing: "on-device", note: "this browser can recognise speech on this device." };
      }
      return {
        available: true,
        processing: "browser-service",
        note: "this browser recognises speech through the browser maker's speech service, not on this device. switch transcription off to keep audio entirely here.",
      };
    } catch {
      /* fall through to the older api */
    }
  }
  return {
    available: true,
    processing: "unknown",
    note: "this browser has a speech recogniser. it does not say whether it runs on this device or through the browser maker's speech service; switch transcription off to keep audio entirely here.",
  };
}

export interface LiveTranscriberEvents {
  onPhrase: (phrase: SpokenPhrase) => void;
  onNote?: (note: string) => void;
  onState?: (state: "listening" | "stopped" | "unavailable" | "denied") => void;
}

/**
 * One continuous recognition session, restarted whenever the browser ends it
 * on its own (chrome ends a continuous session after a minute of silence and
 * on every network hiccup). A stop the operator asked for is not restarted.
 */
export class LiveTranscriber {
  private rec: RecognitionInstance | null = null;
  private active = false;
  private phraseStart: Map<number, number> = new Map();
  private restartTimer: number | null = null;
  private failures = 0;
  private processing: RecognitionProcessing = "unknown";

  constructor(private readonly events: LiveTranscriberEvents) {}

  /** What this session was granted, once it started. */
  mode(): RecognitionProcessing {
    return this.processing;
  }

  isActive(): boolean {
    return this.active;
  }

  async start(lang: string): Promise<boolean> {
    const ctor = recognitionCtor();
    if (!ctor) {
      this.events.onState?.("unavailable");
      return false;
    }
    if (this.active) return true;
    this.active = true;
    this.failures = 0;
    const support = await speechSupport(lang);
    this.processing = support.processing;
    this.spawn(ctor, lang, support.processing === "on-device");
    return true;
  }

  stop(): void {
    this.active = false;
    if (this.restartTimer) window.clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try {
      this.rec?.abort();
    } catch {
      /* already gone */
    }
    this.rec = null;
    this.phraseStart.clear();
    this.events.onState?.("stopped");
  }

  private spawn(ctor: RecognitionStatic, lang: string, local: boolean): void {
    const rec = new ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    if (local && "processLocally" in rec) {
      try {
        rec.processLocally = true;
      } catch {
        /* the attribute is read-only on some builds */
      }
    }
    rec.onstart = () => {
      this.failures = 0;
      this.events.onState?.("listening");
    };
    rec.onresult = (ev) => {
      const now = Date.now();
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result) continue;
        if (!this.phraseStart.has(i)) this.phraseStart.set(i, now);
        if (!result.isFinal) continue;
        const alt = result[0];
        const text = (alt?.transcript ?? "").trim();
        const startedAt = this.phraseStart.get(i) ?? now;
        this.phraseStart.delete(i);
        if (!text) continue;
        this.events.onPhrase({
          text,
          startedAt,
          endedAt: now,
          confidence: typeof alt?.confidence === "number" && alt.confidence > 0 ? Number(alt.confidence.toFixed(2)) : null,
          lang,
          local,
        });
      }
    };
    rec.onerror = (ev) => {
      const code = ev?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        this.active = false;
        this.events.onNote?.("the speech recogniser was refused, so turns are kept as audio without words.");
        this.events.onState?.("denied");
        return;
      }
      if (code === "language-not-supported") {
        this.active = false;
        this.events.onNote?.(`this browser's recogniser does not know the language set on this lane (${lang}); turns are kept as audio without words.`);
        this.events.onState?.("unavailable");
        return;
      }
      if (code === "network") {
        this.events.onNote?.("the browser's speech service could not be reached; words will resume when it can.");
      }
      // "no-speech" and "aborted" are ordinary ends of a continuous session.
    };
    rec.onend = () => {
      this.phraseStart.clear();
      this.rec = null;
      if (!this.active) return;
      // The browser ended the session on its own: come back, with backoff so a
      // dead speech service does not spin the cpu.
      this.failures += 1;
      const delay = Math.min(15_000, 250 * 2 ** Math.min(this.failures, 6));
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        if (this.active) this.spawn(ctor, lang, local);
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      // start() throws when another session is already running on this page.
      this.events.onNote?.("the browser's recogniser is busy; words will resume on the next attempt.");
      rec.onend?.();
    }
  }
}
