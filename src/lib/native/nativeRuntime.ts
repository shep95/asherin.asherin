import { Capacitor } from "@capacitor/core";

/**
 * NATIVE RUNTIME PROBE
 *
 * One truthful answer to "am I inside the Asherin companion app?", cached once
 * per page load. Everything downstream branches on this instead of sniffing the
 * user agent, which lies.
 */

let cached: boolean | null = null;

export function isNativeApp(): boolean {
  if (cached !== null) return cached;
  try {
    cached = Capacitor.isNativePlatform();
  } catch {
    cached = false;
  }
  return cached;
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    return "web";
  }
}

/** True only where the OS genuinely permits background radio work. */
export function supportsBackgroundRadio(): boolean {
  return isNativeApp();
}
