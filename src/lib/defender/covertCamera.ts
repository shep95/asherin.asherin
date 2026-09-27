// asherin.defender — covert-camera law.
//
// The rule the operator wrote: a camera that is CAPTURING while the person
// being captured has no on-screen preview of themselves or of the aim is
// covert, and covert capture is BLOCKED.
//
// A browser tab can only speak for its own origin, and it says so. What it can
// prove is exact: this tab opened a video track, and this tab is (or is not)
// painting that track into a visible <video>. Anything outside the tab —
// another app, a kernel driver, a hardware webcam LED — is not observable here
// and is reported as an uncovered surface, never as "clear".

export type CameraVerdict = "idle" | "previewed" | "covert-blocked" | "unknown";

export interface CameraState {
  verdict: CameraVerdict;
  /** live video tracks this tab currently holds. */
  activeTracks: number;
  /** visible <video> elements painting a live track. */
  visiblePreviews: number;
  detail: string;
  uncovered: string[];
}

const UNCOVERED = [
  "other applications on this device (a browser tab cannot enumerate them)",
  "os-level or kernel capture drivers",
  "hardware capture cards and external recorders",
  "the physical camera indicator led",
];

type Listener = (state: CameraState) => void;

const listeners = new Set<Listener>();
const tracked = new Set<MediaStreamTrack>();
let installed = false;
/** When true, new video tracks are stopped the moment they go covert. */
let enforcing = false;

function isVisible(el: HTMLVideoElement): boolean {
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) < 0.05) return false;
  const r = el.getBoundingClientRect();
  // A 1×1 sink pinned off-screen is the classic covert preview. Require a
  // rectangle a human could actually see themselves in.
  return r.width >= 64 && r.height >= 64 && r.bottom > 0 && r.right > 0;
}

function liveTracks(): MediaStreamTrack[] {
  for (const t of Array.from(tracked)) {
    if (t.readyState === "ended") tracked.delete(t);
  }
  return Array.from(tracked);
}

export function readCameraState(): CameraState {
  const active = liveTracks();
  if (typeof document === "undefined") {
    return { verdict: "unknown", activeTracks: 0, visiblePreviews: 0, detail: "no document", uncovered: UNCOVERED };
  }

  const videos = Array.from(document.querySelectorAll("video"));
  const previews = videos.filter((v) => {
    const src = v.srcObject as MediaStream | null;
    if (!src) return false;
    const hasLive = src.getVideoTracks().some((t) => t.readyState === "live");
    return hasLive && isVisible(v);
  });

  if (active.length === 0) {
    return {
      verdict: "idle",
      activeTracks: 0,
      visiblePreviews: previews.length,
      detail: "no video track is open in this tab.",
      uncovered: UNCOVERED,
    };
  }

  if (previews.length > 0) {
    return {
      verdict: "previewed",
      activeTracks: active.length,
      visiblePreviews: previews.length,
      detail: `${active.length} live track · you can see the aim in ${previews.length} on-screen preview.`,
      uncovered: UNCOVERED,
    };
  }

  return {
    verdict: "covert-blocked",
    activeTracks: active.length,
    visiblePreviews: 0,
    detail: `${active.length} live video track with no visible preview — covert capture. blocked.`,
    uncovered: UNCOVERED,
  };
}

function publish() {
  const state = readCameraState();
  if (enforcing && state.verdict === "covert-blocked") {
    for (const t of liveTracks()) t.stop();
    tracked.clear();
  }
  for (const l of listeners) l(state);
}

/**
 * Wrap getUserMedia once so every video track this tab opens is accounted for.
 * Idempotent: a second install is a no-op, and the wrapper never swallows the
 * caller's promise or its rejection.
 */
export function installCameraWatch(): void {
  if (installed) return;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  installed = true;

  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const stream = await original(constraints);
    for (const t of stream.getVideoTracks()) {
      tracked.add(t);
      t.addEventListener("ended", () => { tracked.delete(t); publish(); });
    }
    publish();
    return stream;
  };
}

export function setCovertEnforcement(on: boolean): void {
  enforcing = on;
  publish();
}

export function isEnforcing(): boolean {
  return enforcing;
}

/** Poll + subscribe. Returns an unsubscribe. */
export function watchCamera(listener: Listener, intervalMs = 1500): () => void {
  installCameraWatch();
  listeners.add(listener);
  listener(readCameraState());
  const id = window.setInterval(() => listener(readCameraState()), intervalMs);
  return () => {
    listeners.delete(listener);
    window.clearInterval(id);
  };
}
