/**
 * BACKGROUND BRIDGE — retired in the local edition.
 *
 * The hosted build registered a background worker (public/sw-sentinel.js)
 * that beaconed this device's last fix and battery reading to an edge
 * function on a server. That server no longer exists, and a worker that
 * posts to a dead endpoint on a timer is exactly the hidden network call the
 * local edition refuses to make.
 *
 * So this module keeps its public surface for the callers that still hand it
 * data (the always-on daemon, the fleet reporter) and does three things:
 *   • it never registers the worker,
 *   • it unregisters one that an earlier build left behind,
 *   • it drops every hand-over on the floor, because there is no one to hand to.
 *
 * Nothing here opens a socket, writes a token, or touches IndexedDB.
 */

const SW_URL = "/sw-sentinel.js";
const LEGACY_TOKEN_KEY = "asherin.sentinel.deviceToken";

let cleaned = false;

async function unregisterOwn(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }
  } catch {
    /* no registrations to read */
  }
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

/** Idempotent. Removes the retired worker if an earlier build installed it. */
export async function startBackgroundSentinel(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  await unregisterOwn();
}

/** The daemon still calls this on every fix. There is no worker to receive it. */
export function handOverFix(_fix: { lat: number; lng: number; accuracy?: number }): void {
  /* local edition: no background runtime */
}

/** The fleet reporter still calls this. There is no worker to receive it. */
export function handOverMesh(_mesh: { deviceId: string; batteryPct: number | null; charging: boolean | null }): void {
  /* local edition: no background runtime */
}

/** Called as the tab hides. Nothing to beacon, nowhere to beacon it. */
export function beaconOnHide(): void {
  /* local edition: no background runtime */
}

export async function stopBackgroundSentinel(): Promise<void> {
  await unregisterOwn();
}
