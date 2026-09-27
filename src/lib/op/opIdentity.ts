// ═══════════════════════════════════════════════════════════════════════════
// OP LAYER — DEVICE IDENTITY
//
// A sensor is only useful if the ledger can tell it apart from its siblings
// across sessions. This mints one stable, account-agnostic handle per browser
// profile / app install and nothing more: it is a random opaque id, not a
// fingerprint hash, so it cannot be correlated back to the user by anyone who
// happens to see it, and clearing site data legitimately produces a new device
// which the roster will then flag as unfamiliar — which is the correct
// behaviour, not a bug.
// ═══════════════════════════════════════════════════════════════════════════

import { isNativeApp, nativePlatform } from "@/lib/native/nativeRuntime";

const KEY = "asherin.op.deviceId";

function mint(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return `op_${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function opDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 12) return existing;
    const id = mint();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode without storage: the device is still a sensor for this
    // session, it simply cannot build history. Honest, not silent.
    return mint();
  }
}

export type FormFactor = "phone" | "tablet" | "laptop" | "desktop" | "unknown";

export function opFormFactor(): FormFactor {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPhone|Android.*Mobile|Windows Phone/i.test(ua)) return "phone";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || (touch && /Macintosh/.test(ua))) return "tablet";
  if (/Macintosh|Mac OS X|Windows NT|Linux/i.test(ua)) return touch ? "laptop" : "desktop";
  return "unknown";
}

export function opPlatform(): string {
  const native = isNativeApp() ? `companion/${nativePlatform()}` : "web";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const os = /Windows NT/.test(ua) ? "Windows"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "Unknown";
  return `${os} · ${native}`;
}

/** A label a human can recognise in the roster without leaking anything. */
export function opLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "Browser";
  const ff = opFormFactor();
  return isNativeApp() ? `Asherin companion · ${nativePlatform()}` : `${browser} · ${ff}`;
}

/** Low-entropy, non-identifying context. Deliberately excludes canvas/WebGL
 *  hashes: the OP layer is protecting this person, not profiling them. */
export function opFingerprint(): Record<string, unknown> {
  if (typeof navigator === "undefined") return {};
  return {
    languages: (navigator.languages ?? []).slice(0, 3),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cores: (navigator as any).hardwareConcurrency ?? null,
    memoryGb: (navigator as any).deviceMemory ?? null,
    screen: typeof screen !== "undefined" ? `${screen.width}x${screen.height}@${window.devicePixelRatio ?? 1}` : null,
    native: isNativeApp(),
  };
}
