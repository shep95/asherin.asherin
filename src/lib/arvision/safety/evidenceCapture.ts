// asherin.arvision — event triggered evidence capture.
//
// The failure this exists to prevent: an alert fires, someone opens it an hour
// later, and the only thing stored is the moment after everything happened. So
// the buffer runs continuously and keeps the seconds *before* the trigger, and
// the frames it keeps are the original camera frames. Overlays are stored as
// data alongside them, never burned in, so the drawing can be reproduced later
// and can also be turned off to see what the lens actually saw.
//
// The second commitment: storage is not pretended. A bundle is only "stored"
// when a configured backend accepted it. With no backend the state is
// NOT CONFIGURED and the operator is told the capture lives in this tab only
// and dies with it.

export interface EvidenceFrame {
  atMs: number;
  /** original camera frame, no overlay drawn into the pixels. */
  dataUrl: string;
  width: number;
  height: number;
  /** everything needed to redraw the overlay over this exact frame. */
  overlay: unknown;
  sourceId: string;
}

export interface EvidenceBundle {
  id: string;
  incidentId: string;
  createdAtMs: number;
  triggerAtMs: number;
  preRollMs: number;
  postRollMs: number;
  frames: EvidenceFrame[];
  /** sha-256 over the concatenated frame payloads, for tamper evidence. */
  digest: string | null;
  storage: "session_only" | "backend";
  retentionUntilMs: number;
  notes: string;
}

export interface CaptureOutcome {
  ok: boolean;
  /** present only when ok. */
  bundle: EvidenceBundle | null;
  /** what happened, in the operator's words. */
  detail: string;
  /** why it did not happen. null when it did. */
  reason: string | null;
  state: "stored" | "session_only" | "no_frames" | "failed";
}

export interface RollingBufferOptions {
  /** seconds of history kept before a trigger. */
  preRollMs: number;
  /** seconds kept after a trigger. */
  postRollMs: number;
  /** capture cadence. */
  intervalMs: number;
  /** hard cap so a long session cannot exhaust memory. */
  maxFrames: number;
}

export const DEFAULT_BUFFER_OPTIONS: RollingBufferOptions = {
  preRollMs: 10_000,
  postRollMs: 5_000,
  intervalMs: 500,
  maxFrames: 60,
};

/** Continuous pre-event frame buffer. Holds original frames only. */
export class RollingFrameBuffer {
  private frames: EvidenceFrame[] = [];
  private lastPushMs = 0;

  constructor(private options: RollingBufferOptions = DEFAULT_BUFFER_OPTIONS) {}

  configure(options: Partial<RollingBufferOptions>) {
    this.options = { ...this.options, ...options };
  }

  /** Push a frame if the cadence allows. Returns whether it was kept. */
  push(frame: EvidenceFrame): boolean {
    if (frame.atMs - this.lastPushMs < this.options.intervalMs) return false;
    this.lastPushMs = frame.atMs;
    this.frames.push(frame);
    const cutoff = frame.atMs - (this.options.preRollMs + this.options.postRollMs);
    this.frames = this.frames.filter((f) => f.atMs >= cutoff).slice(-this.options.maxFrames);
    return true;
  }

  /** Frames covering the pre-roll window before a trigger instant. */
  window(triggerAtMs: number): EvidenceFrame[] {
    const from = triggerAtMs - this.options.preRollMs;
    const to = triggerAtMs + this.options.postRollMs;
    return this.frames.filter((f) => f.atMs >= from && f.atMs <= to);
  }

  size(): number {
    return this.frames.length;
  }

  settings(): RollingBufferOptions {
    return { ...this.options };
  }

  clear() {
    this.frames = [];
    this.lastPushMs = 0;
  }
}

async function digestFrames(frames: EvidenceFrame[]): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const payload = frames.map((f) => `${f.atMs}:${f.dataUrl.length}:${f.sourceId}`).join("|");
  const bytes = new TextEncoder().encode(payload);
  const hash = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface EvidenceStorage {
  /** true only when a real backend accepted a write during the last probe. */
  configured: boolean;
  detail: string;
  put?: (bundle: EvidenceBundle) => Promise<{ ok: boolean; detail: string }>;
  retentionMs: number;
}

export const UNCONFIGURED_STORAGE: EvidenceStorage = {
  configured: false,
  detail:
    "no evidence storage backend is configured. captures are held in this browser tab only, are not retained, and are lost on reload.",
  retentionMs: 0,
};

let seq = 0;

/** Capture a bundle for an incident. Never fabricates frames. */
export async function captureEvidence(
  buffer: RollingFrameBuffer,
  incidentId: string,
  triggerAtMs: number,
  storage: EvidenceStorage,
  notes = "",
): Promise<CaptureOutcome> {
  const frames = buffer.window(triggerAtMs);
  if (frames.length === 0) {
    const reason =
      "no camera frames were buffered around this trigger, so there is nothing to store. the capture buffer runs only while a camera stream is open.";
    return { ok: false, bundle: null, detail: reason, reason, state: "no_frames" };
  }
  const settings = buffer.settings();
  seq += 1;
  const bundle: EvidenceBundle = {
    id: `ev_${triggerAtMs.toString(36)}_${seq}`,
    incidentId,
    createdAtMs: Date.now(),
    triggerAtMs,
    preRollMs: settings.preRollMs,
    postRollMs: settings.postRollMs,
    frames,
    digest: await digestFrames(frames),
    storage: storage.configured ? "backend" : "session_only",
    retentionUntilMs: storage.configured ? Date.now() + storage.retentionMs : 0,
    notes,
  };

  if (!storage.configured || !storage.put) {
    return {
      ok: true,
      bundle,
      reason: null,
      state: "session_only",
      detail: `${frames.length} original frames were captured in this tab. ${UNCONFIGURED_STORAGE.detail}`,
    };
  }

  try {
    const result = await storage.put(bundle);
    if (!result.ok) return { ok: false, bundle: null, detail: result.detail, reason: result.detail, state: "failed" };
    return { ok: true, bundle, detail: result.detail, reason: null, state: "stored" };
  } catch (e) {
    const reason = `the storage backend rejected the capture: ${(e as Error).message}`;
    return { ok: false, bundle: null, detail: reason, reason, state: "failed" };
  }
}

/** Drop bundles past their retention deadline. */
export function applyRetention(bundles: EvidenceBundle[], nowMs: number): EvidenceBundle[] {
  return bundles.filter((b) => b.retentionUntilMs === 0 || b.retentionUntilMs > nowMs);
}
