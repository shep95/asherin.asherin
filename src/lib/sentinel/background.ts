/**
 * BACKGROUND BRIDGE — hands the watch over to something that outlives the tab.
 *
 * The always-on daemon in this app is still a tab: close it and every timer
 * dies. This module attaches the two runtimes that survive that:
 *
 *   Tier B — the background worker (public/sw-sentinel.js). Alive while the
 *            browser process is, with no tab open. Reports presence.
 *   Tier A — the server clock (sentinel-cron). Alive with every device off.
 *            Re-scores following patterns and re-judges the area from the last
 *            reported fix. Nothing here is required for Tier A to run; the
 *            beacon only makes it *timely*.
 *
 * Guards, deliberately strict: the worker is never registered in the Lovable
 * preview, in an iframe, or in dev. It caches nothing and has no fetch
 * handler, so the usual PWA failure mode (stale shell after deploy) does not
 * exist here — but a worker registered inside a preview frame would still be
 * confusing, so it stays out.
 */

import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/native/nativeRuntime";
import { opDeviceId } from "@/lib/op/opIdentity";


const SW_URL = "/sw-sentinel.js";
const TAG = "asherin-sentinel-sweep";
const TOKEN_KEY = "asherin.sentinel.deviceToken";
const DB_NAME = "asherin-sentinel";
const STORE = "kv";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function previewOrDev(): boolean {
  if (typeof window === "undefined") return true;
  // The companion app is never a preview, whatever origin it was built against.
  // Without this the shipped native shell disables its own background leg.
  if (isNativeApp()) return false;
  if (!import.meta.env.PROD) return true;
  try { if (window.self !== window.top) return true; } catch { return true; }
  const h = window.location.hostname;
  return (
    h.startsWith("id-preview--") || h.startsWith("preview--") ||
    new URL(window.location.href).searchParams.get("sw") === "off"
  );
}


function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await idb();
    await new Promise((res) => {
      const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      tx.onsuccess = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch { /* a browser without IDB simply loses Tier B; Tier A stands */ }
}

/** Opaque, revocable, single-capability. Not a session, not derived from one. */
function mintToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function deviceToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && existing.length >= 32) return existing;
    const t = mintToken();
    localStorage.setItem(TOKEN_KEY, t);
    return t;
  } catch {
    return mintToken();
  }
}

let registration: ServiceWorkerRegistration | null = null;
let started = false;

async function unregisterOwn(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }
  } catch { /* noop */ }
}

/** Idempotent. Safe to call on every boot and every auth change. */
export async function startBackgroundSentinel(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (previewOrDev()) { await unregisterOwn(); return; }
  if (started) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  started = true;

  const token = deviceToken();

  // Server-side half first: without a registered device the worker's beacon is
  // rejected, so registration must land before the worker is told anything.
  try {
    const { error } = await supabase.functions.invoke("sentinel-beacon", {
      body: {
        action: "register",
        token,
        label: navigator.userAgent.slice(0, 80),
        platform: (navigator as any).platform || "web",
      },
    });
    if (error) throw error;
  } catch {
    started = false;
    return; // retried on the next boot or auth change
  }

  const workerConfig = {
    token,
    endpoint: `${SUPABASE_URL}/functions/v1/sentinel-beacon`,
    // Tier B of the OP layer rides the same worker and the same revocable
    // token: one background wake, two ledgers kept honest.
    opEndpoint: `${SUPABASE_URL}/functions/v1/op-layer`,
    opDeviceId: opDeviceId(),
    anonKey: ANON_KEY,
  };
  await kvSet("config", workerConfig);

  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "sentinel-config", config: workerConfig });

    // Periodic sync is Chromium + installed-app only. Its absence is normal,
    // not a failure: Tier A still sweeps on the server clock.
    const periodic = (registration as any).periodicSync;
    if (periodic) {
      const permission = await (navigator as any).permissions
        ?.query({ name: "periodic-background-sync" as PermissionName })
        .catch(() => null);
      if (!permission || permission.state === "granted") {
        await periodic.register(TAG, { minInterval: 15 * 60_000 }).catch(() => {});
      }
    }
  } catch { /* worker unavailable — Tier A unaffected */ }
}

/** Called by the foreground daemon on every fresh fix, so the worker has
 *  something true to report after the tab is gone. */
export function handOverFix(fix: { lat: number; lng: number; accuracy?: number }): void {
  const payload = { ...fix, at: Date.now() };
  void kvSet("fix", payload);
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "sentinel-fix", fix: payload });
  } catch { /* noop */ }
}

/** The fleet half of the same hand-over: a worker cannot read the Battery
 *  Status API (it is window-only), so the page leaves its last true reading
 *  behind. The worker forwards it verbatim and never extrapolates a drain
 *  curve — a stale percentage is labelled stale in the UI, not guessed. */
export function handOverMesh(mesh: { deviceId: string; batteryPct: number | null; charging: boolean | null }): void {
  const payload = { ...mesh, at: Date.now() };
  void kvSet("mesh", payload);
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "sentinel-mesh", mesh: payload });
  } catch { /* noop */ }
}


/** Last-gasp report as the tab dies: the moment Tier B matters most. */
export function beaconOnHide(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "sentinel-beacon-now" });
    (registration as any)?.sync?.register?.(TAG)?.catch?.(() => {});
  } catch { /* noop */ }
}

export async function stopBackgroundSentinel(): Promise<void> {
  started = false;
  try {
    const periodic = (registration as any)?.periodicSync;
    await periodic?.unregister?.(TAG);
  } catch { /* noop */ }
  await unregisterOwn();
  registration = null;
}
