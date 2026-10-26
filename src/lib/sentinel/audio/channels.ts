// asherin.sentinel — channels: one input, one lane, one language hint.
//
// NARRATIVE CHECK, written before the code.
//
// The old watch had exactly one microphone: the machine's. That made distance
// the limit — walk to another room and the record stops being about you and
// starts being about an empty desk. A bluetooth headset moves the microphone
// onto the person, so the distance from the machine stops mattering; what
// matters is whether the headset is powered on and inside its own radio range.
//
// So the unit of this layer is a CHANNEL, not a device:
//   • a channel binds one browser audio input to one lane row in this device's
//     timeline,
//   • it carries a name the operator chose ("kitchen", "marcus", "van"),
//   • it carries a spoken-language hint for the recogniser,
//   • it runs its own capture engine, independently started and stopped,
//   • and every turn it produces is tagged to its lane in the one timeline.
//
// Words come from the browser's own speech recogniser (transcripts.ts). That
// recogniser hears only the system default input and only one of them can run
// per page, so exactly one lane — the one on the default input — gets words.
// Every other lane records turns as audio and says so on its card.
//
// Flaws this file exists to refuse:
//   • a dropped headset that looks like a quiet room. Every unclean end writes
//     an OPEN gap event immediately and closes it when capture resumes.
//   • a reload that erases the fact that a watch was running. A liveness stamp
//     is written every 10s; on boot, any channel that was listening and is no
//     longer gets its gap opened from the last stamp, not from "now".
//   • a channel bound to an input that has since disappeared. The input roster
//     is re-read on `devicechange`, and a bound-but-absent input is shown as
//     absent rather than quietly falling back to the built-in mic.
//   • two channels on one input, which would double-bill the same audio and
//     make the speaker centroids fight each other.
//
// Nothing here claims a browser can outlive its tab. When the tab goes, the
// watch goes, and the gap is written when the tab comes back.

import { SentinelEngine, deviceLabel, type EngineStatus } from "./captureEngine";
import type { IngestResult } from "./sync";
import { attachPhrase, closeGap, fetchSettings, openGap, renameDevice, setDevicePrefs } from "./sync";
import { AUTO_SOURCE, NO_TRANSLATION, isLanguageCode } from "./languages";
import { isVadSensitivity, type VadSensitivity } from "./vad";
import { LiveTranscriber, recognitionLang, speechSupport, type RecognitionProcessing, type SpokenPhrase } from "./transcripts";
import { clearMatcher, matcherFor } from "./phraseRegistry";

const STORE_KEY = "asherin.sentinel.channels.v1";
const LEGACY_DEVICE_KEY = "asherin.sentinel.ambient.deviceKey";
const LIVENESS_MS = 10_000;
/** Anything shorter than this between a stamp and a restart is scheduling
 *  jitter, not a hole in the record; writing it would spam the timeline. */
const GAP_FLOOR_MS = 4_000;

export interface ChannelConfig {
  id: string;
  /** lane key in this device's timeline; stable for the life of the channel */
  deviceKey: string;
  /** operator-facing name; defaults to "bluetooth device one" and so on */
  label: string;
  /** MediaDeviceInfo.deviceId, or null for this machine's default input */
  inputDeviceId: string | null;
  /** what the browser called the input when it was added, for recognition */
  inputLabel: string;
  /** hint for the recogniser: an iso-639-1 code, or "auto" for the browser's language */
  sourceLang: string;
  /** kept for older rosters; the local edition translates nothing and never reads it */
  translateTo: string;
  createdAt: number;
  /** liveness bookkeeping, so a reload cannot erase a running watch */
  wasListening: boolean;
  lastAliveAt: number | null;
  openGapId: string | null;
  openGapSince: number | null;
  openGapReason: string | null;
}

export type WordsState =
  | "off"
  | "other-input"
  | "unavailable"
  | "denied"
  | "starting"
  | "listening";

export interface ChannelView {
  config: ChannelConfig;
  status: EngineStatus | null;
  notes: string[];
  listening: boolean;
  /** the bound input is currently enumerable on this machine */
  inputPresent: boolean;
  gapOpen: boolean;
  /** whether, and how, this lane's turns get words right now */
  words: { state: WordsState; processing: RecognitionProcessing; note: string } | null;
}

type Listener = () => void;
type IngestListener = (channelId: string, r: IngestResult) => void;

interface Runtime {
  engine: SentinelEngine;
  status: EngineStatus | null;
  notes: string[];
}

const runtimes = new Map<string, Runtime>();
const listeners = new Set<Listener>();
const ingestListeners = new Set<IngestListener>();

let configs: ChannelConfig[] = [];
let inputs: MediaDeviceInfo[] = [];
let booted = false;
let sensitivity: VadSensitivity = "balanced";
let livenessTimer: number | null = null;

// ── the one recogniser ──────────────────────────────────────────────────────
let transcribeEnabled = true;
let transcriber: LiveTranscriber | null = null;
let transcriberChannelId: string | null = null;
let transcriberState: "stopped" | "listening" | "unavailable" | "denied" = "stopped";
let browserSupport: { available: boolean; processing: RecognitionProcessing; note: string } | null = null;

const ORDINALS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function notify() {
  listeners.forEach((fn) => fn());
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(configs));
  } catch {
    /* private mode: the roster is in memory for this session only, and the
       lane rows in the timeline still carry the names, so nothing is invented. */
  }
}

function readStore(): ChannelConfig[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is ChannelConfig => Boolean(c) && typeof (c as ChannelConfig).id === "string" && typeof (c as ChannelConfig).deviceKey === "string")
      .map((c) => ({
        ...c,
        label: String(c.label || "channel").slice(0, 60),
        inputDeviceId: c.inputDeviceId ?? null,
        inputLabel: String(c.inputLabel || ""),
        sourceLang: isLanguageCode(c.sourceLang) ? c.sourceLang : AUTO_SOURCE,
        translateTo: NO_TRANSLATION,
        wasListening: Boolean(c.wasListening),
        lastAliveAt: typeof c.lastAliveAt === "number" ? c.lastAliveAt : null,
        openGapId: typeof c.openGapId === "string" ? c.openGapId : null,
        openGapSince: typeof c.openGapSince === "number" ? c.openGapSince : null,
        openGapReason: typeof c.openGapReason === "string" ? c.openGapReason : null,
      }));
  } catch {
    return [];
  }
}

function legacyDeviceKey(): string {
  try {
    const existing = localStorage.getItem(LEGACY_DEVICE_KEY);
    if (existing && existing.length >= 16) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(LEGACY_DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

function baseConfig(over: Partial<ChannelConfig>): ChannelConfig {
  return {
    id: crypto.randomUUID(),
    deviceKey: crypto.randomUUID(),
    label: "channel",
    inputDeviceId: null,
    inputLabel: "",
    sourceLang: AUTO_SOURCE,
    translateTo: NO_TRANSLATION,
    createdAt: Date.now(),
    wasListening: false,
    lastAliveAt: null,
    openGapId: null,
    openGapSince: null,
    openGapReason: null,
    ...over,
  };
}

function runtimeFor(cfg: ChannelConfig): Runtime {
  const existing = runtimes.get(cfg.id);
  if (existing) return existing;
  const rt: Runtime = { engine: null as unknown as SentinelEngine, status: null, notes: [] };
  rt.engine = new SentinelEngine(
    {
      onStatus: (s) => {
        const wasListening = rt.status?.state === "listening";
        rt.status = s;
        notify();
        if (wasListening !== (s.state === "listening")) syncTranscriber();
      },
      onNote: (n) => {
        if (!rt.notes.includes(n)) rt.notes.unshift(n);
        rt.notes.splice(6);
        notify();
      },
      onIngest: (r) => ingestListeners.forEach((fn) => fn(cfg.id, r)),
      onDrop: (reason) => void markDropped(cfg.id, reason),
    },
    { deviceKey: cfg.deviceKey, label: cfg.label, inputDeviceId: cfg.inputDeviceId },
  );
  runtimes.set(cfg.id, rt);
  return rt;
}

function patch(id: string, over: Partial<ChannelConfig>) {
  configs = configs.map((c) => (c.id === id ? { ...c, ...over } : c));
  persist();
  notify();
}

const find = (id: string) => configs.find((c) => c.id === id) ?? null;

// ── gaps ─────────────────────────────────────────────────────────────────────

/** Write the hole. The gap is opened at the last moment the channel is KNOWN
 *  to have been capturing, never at the moment we noticed, because the two are
 *  not the same after a crash or a reload. */
async function raiseGap(cfg: ChannelConfig, since: number, reason: string): Promise<void> {
  if (cfg.openGapId || cfg.openGapSince) return; // already holed; do not stack
  patch(cfg.id, { openGapSince: since, openGapReason: reason });
  try {
    const { gapId } = await openGap(cfg.deviceKey, new Date(since).toISOString(), reason);
    patch(cfg.id, { openGapId: gapId ?? null });
  } catch {
    // The store could not be written. The local marker stays so the room can
    // still show the hole — better than a timeline that pretends nothing was
    // missed.
  }
}

async function sealGap(id: string): Promise<void> {
  const cfg = find(id);
  if (!cfg || (!cfg.openGapId && !cfg.openGapSince)) return;
  const gapId = cfg.openGapId;
  patch(id, { openGapId: null, openGapSince: null, openGapReason: null });
  if (!gapId) return;
  try {
    await closeGap(gapId, new Date().toISOString());
  } catch {
    /* the hole is already recorded as open; leaving it open is the honest
       failure mode, and the next successful close will fix its duration. */
  }
}

async function markDropped(id: string, reason: string): Promise<void> {
  const cfg = find(id);
  if (!cfg) return;
  const since = cfg.lastAliveAt ?? Date.now();
  patch(id, { wasListening: false, lastAliveAt: Date.now() });
  await raiseGap({ ...cfg, openGapId: null, openGapSince: null }, since, reason);
}

// ── boot ─────────────────────────────────────────────────────────────────────

export function bootChannels(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;

  configs = readStore();
  if (!configs.length) {
    // First run, or an operator upgrading from the single-microphone watch.
    // Reusing the legacy lane key keeps their existing timeline attached to
    // this channel instead of orphaning it under a new lane.
    configs = [baseConfig({ deviceKey: legacyDeviceKey(), label: `this machine · ${deviceLabel()}`, inputLabel: "system default input" })];
    persist();
  }

  // Any channel that was listening when the page went away has a hole in it,
  // measured from its last liveness stamp — the truth of when capture ended.
  for (const cfg of configs) {
    if (cfg.wasListening) {
      const since = cfg.lastAliveAt ?? cfg.createdAt;
      if (Date.now() - since > GAP_FLOOR_MS) {
        void raiseGap(cfg, since, "the browser tab closed, reloaded, or the device slept while this channel was listening.");
      }
      patch(cfg.id, { wasListening: false });
    }
  }

  // Stored preferences drive the detector and the recogniser from the first
  // start, not from the first visit to the settings tab.
  void fetchSettings()
    .then((s) => {
      const prefs = s.prefs as { sensitivity?: unknown; transcribe?: unknown };
      if (isVadSensitivity(prefs.sensitivity)) setChannelSensitivity(prefs.sensitivity);
      setTranscribeEnabled(prefs.transcribe !== false);
    })
    .catch(() => {});
  void speechSupport(recognitionLang(configs[0]?.sourceLang ?? AUTO_SOURCE)).then((s) => {
    browserSupport = s;
    notify();
  });

  void refreshInputs();
  navigator.mediaDevices?.addEventListener?.("devicechange", () => void refreshInputs());

  livenessTimer = window.setInterval(() => {
    let dirty = false;
    for (const cfg of configs) {
      const rt = runtimes.get(cfg.id);
      const live = rt?.status?.state === "listening";
      if (live) {
        configs = configs.map((c) => (c.id === cfg.id ? { ...c, wasListening: true, lastAliveAt: Date.now() } : c));
        dirty = true;
      } else if (cfg.wasListening) {
        configs = configs.map((c) => (c.id === cfg.id ? { ...c, wasListening: false } : c));
        dirty = true;
      }
    }
    if (dirty) persist();
  }, LIVENESS_MS);
}

export function shutdownChannels(): void {
  if (livenessTimer) window.clearInterval(livenessTimer);
  livenessTimer = null;
  stopTranscriber();
}

// ── inputs ───────────────────────────────────────────────────────────────────

export async function refreshInputs(): Promise<MediaDeviceInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    inputs = all.filter((d) => d.kind === "audioinput");
  } catch {
    inputs = [];
  }
  notify();
  return inputs;
}

export const audioInputs = (): MediaDeviceInfo[] => [...inputs];

/** Browsers hide input labels until a microphone permission has been granted
 *  once. Asking here is honest: the operator is choosing an input, so the
 *  prompt is expected, and the roster is unusable without it. */
export async function unlockInputLabels(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    await refreshInputs();
    return true;
  } catch {
    return false;
  }
}

// ── words ────────────────────────────────────────────────────────────────────

/** The recogniser hears the system default input and nothing else. */
export const isDefaultInput = (cfg: ChannelConfig): boolean => cfg.inputDeviceId === null || cfg.inputDeviceId === "default";

function wordsFor(cfg: ChannelConfig, listening: boolean): ChannelView["words"] {
  if (!listening) return null;
  const processing = transcriber?.mode() ?? browserSupport?.processing ?? "unknown";
  if (!transcribeEnabled) {
    return { state: "off", processing, note: "words are off — audio stays entirely on this device." };
  }
  if (!isDefaultInput(cfg)) {
    return { state: "other-input", processing, note: "no words on this lane: the browser's recogniser hears only the system default input." };
  }
  if (browserSupport && !browserSupport.available) {
    return { state: "unavailable", processing, note: browserSupport.note };
  }
  if (transcriberChannelId !== cfg.id) {
    return { state: "other-input", processing, note: "another lane on the default input already has the recogniser." };
  }
  if (transcriberState === "denied") {
    return { state: "denied", processing, note: "the speech recogniser was refused, so turns are kept as audio without words." };
  }
  if (transcriberState === "unavailable") {
    return { state: "unavailable", processing, note: "this browser's recogniser could not run for this lane; turns are kept as audio without words." };
  }
  if (transcriberState === "listening") {
    const where =
      processing === "on-device"
        ? "words from this browser, on this device"
        : processing === "browser-service"
          ? "words from the browser maker's speech service — audio for words leaves this device"
          : "words from this browser's recogniser; it does not say whether that runs here or at the browser maker";
    return { state: "listening", processing, note: where };
  }
  return { state: "starting", processing, note: "the recogniser is starting." };
}

function stopTranscriber() {
  transcriber?.stop();
  transcriber = null;
  if (transcriberChannelId) clearMatcher(find(transcriberChannelId)?.deviceKey ?? "");
  transcriberChannelId = null;
  transcriberState = "stopped";
}

/** Keep exactly one recogniser bound to the one lane that can use it. */
function syncTranscriber() {
  const target = transcribeEnabled
    ? configs.find((c) => isDefaultInput(c) && runtimes.get(c.id)?.status?.state === "listening") ?? null
    : null;
  if (!target) {
    if (transcriber) {
      stopTranscriber();
      notify();
    }
    return;
  }
  if (transcriber && transcriberChannelId === target.id) return;
  stopTranscriber();
  transcriberChannelId = target.id;
  const rt = runtimeFor(target);
  const t = new LiveTranscriber({
    onPhrase: (phrase: SpokenPhrase) => {
      const cfg = find(target.id);
      if (!cfg) return;
      const turn = matcherFor(cfg.deviceKey).offerPhrase(phrase);
      if (!turn) return;
      void attachPhrase(turn.id, phrase).then((r) => {
        if (r) ingestListeners.forEach((fn) => fn(cfg.id, r));
      });
    },
    onNote: (n) => {
      if (!rt.notes.includes(n)) rt.notes.unshift(n);
      rt.notes.splice(6);
      notify();
    },
    onState: (s) => {
      transcriberState = s;
      notify();
    },
  });
  transcriber = t;
  void t.start(recognitionLang(target.sourceLang)).then((ok) => {
    if (!ok) transcriberState = "unavailable";
    notify();
  });
}

export function setTranscribeEnabled(on: boolean): void {
  if (transcribeEnabled === on) return;
  transcribeEnabled = on;
  syncTranscriber();
  notify();
}

export const transcribeEnabledNow = (): boolean => transcribeEnabled;

/** What this browser can do about words, before any lane starts. */
export const wordsSupport = () => browserSupport;

// ── roster ───────────────────────────────────────────────────────────────────

export function listChannels(): ChannelView[] {
  return configs.map((config) => {
    const rt = runtimes.get(config.id);
    const listening = rt?.status?.state === "listening";
    return {
      config,
      status: rt?.status ?? null,
      notes: rt?.notes ?? [],
      listening,
      inputPresent: config.inputDeviceId === null || inputs.some((d) => d.deviceId === config.inputDeviceId),
      gapOpen: Boolean(config.openGapSince),
      words: wordsFor(config, listening),
    };
  });
}

export function subscribeChannels(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeChannelIngest(fn: IngestListener): () => void {
  ingestListeners.add(fn);
  return () => ingestListeners.delete(fn);
}

export const anyListening = (): boolean => listChannels().some((c) => c.listening);

function nextBluetoothName(): string {
  const used = configs.length;
  return `bluetooth device ${ORDINALS[used] ?? used + 1}`;
}

export function addChannel(input: { inputDeviceId: string | null; inputLabel: string; label?: string }): ChannelConfig {
  const cfg = baseConfig({
    label: (input.label || nextBluetoothName()).slice(0, 60),
    inputDeviceId: input.inputDeviceId,
    inputLabel: input.inputLabel.slice(0, 120),
  });
  configs = [...configs, cfg];
  persist();
  notify();
  return cfg;
}

/** An input may back only one channel: two engines on one microphone would
 *  store the same words twice and fight over the same speaker centroid. */
export const inputTaken = (deviceId: string): boolean => configs.some((c) => c.inputDeviceId === deviceId);

export async function renameChannel(id: string, label: string): Promise<void> {
  const clean = label.trim().slice(0, 60);
  const cfg = find(id);
  if (!cfg || !clean) return;
  patch(id, { label: clean });
  try {
    await renameDevice(cfg.deviceKey, clean);
  } catch {
    /* the local name is already applied; the lane row catches up on the
       next register call when this channel starts. */
  }
}

export async function setChannelLanguages(id: string, next: { sourceLang?: string }): Promise<void> {
  const cfg = find(id);
  if (!cfg) return;
  const sourceLang = next.sourceLang !== undefined && isLanguageCode(next.sourceLang) ? next.sourceLang : cfg.sourceLang;
  patch(id, { sourceLang });
  await setDevicePrefs(cfg.deviceKey, { sourceLang }).catch(() => {});
  // A running recogniser takes its language at start; restart it on the new hint.
  if (transcriberChannelId === id && transcriber) {
    stopTranscriber();
    syncTranscriber();
  }
}

export async function startChannel(id: string): Promise<boolean> {
  const cfg = find(id);
  if (!cfg) return false;
  await setDevicePrefs(cfg.deviceKey, { sourceLang: cfg.sourceLang }).catch(() => {});
  const rt = runtimeFor(cfg);
  rt.engine.setSensitivity(sensitivity);
  const ok = await rt.engine.start();
  if (ok) {
    patch(id, { wasListening: true, lastAliveAt: Date.now() });
    await sealGap(id);
    syncTranscriber();
  }
  return ok;
}

export async function stopChannel(id: string): Promise<void> {
  const rt = runtimes.get(id);
  patch(id, { wasListening: false, lastAliveAt: Date.now() });
  await rt?.engine.stop();
  syncTranscriber();
}

export async function removeChannel(id: string): Promise<void> {
  await stopChannel(id);
  runtimes.delete(id);
  configs = configs.filter((c) => c.id !== id);
  persist();
  notify();
}

export function setChannelSensitivity(s: VadSensitivity): void {
  sensitivity = s;
  runtimes.forEach((rt) => rt.engine.setSensitivity(s));
}

export const channelSensitivity = (): VadSensitivity => sensitivity;

/** Lanes are matched to timeline rows by lane key through the device list the
 *  timeline call returns. */
export const channelByDeviceKey = (key: string): ChannelConfig | null =>
  configs.find((c) => c.deviceKey === key) ?? null;
