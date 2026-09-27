/**
 * ASHERIN BACKGROUND SENTINEL WORKER
 *
 * This worker exists for one reason: to keep the safety watch reporting when
 * the Asherin tab is closed and the screen is off. It is deliberately NOT an
 * app-shell service worker — it caches nothing, intercepts no navigation, and
 * has no fetch handler, so it can never serve a stale page or white-screen a
 * deploy. Its whole surface is three background events.
 *
 *   periodicsync → the browser's own cadence (Chromium, installed app)
 *   sync         → a retry queue for a beacon that failed while offline
 *   message      → the page handing over a fresh position/credential
 *
 * It authenticates with an opaque device token kept in IndexedDB, never with
 * the user's session, so nothing here can read intelligence or change settings.
 */

const DB_NAME = "asherin-sentinel";
const STORE = "kv";
const TAG = "asherin-sentinel-sweep";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result ?? null);
    tx.onerror = () => resolve(null);
  });
}

async function kvSet(key, value) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

/** Report in. Position comes from the last fix the page handed over: a worker
 *  cannot call geolocation itself, and pretending otherwise would silently
 *  send a fixless beacon forever. */
async function beacon(source) {
  const cfg = await kvGet("config");
  if (!cfg || !cfg.token || !cfg.endpoint) return false;
  const fix = await kvGet("fix");
  const fresh = fix && Date.now() - fix.at < 6 * 3600e3 ? fix : null;
  // Fleet identity + last true battery reading handed over by the page.
  const mesh = await kvGet("mesh");

  const payload = {
    action: "beacon",
    token: cfg.token,
    source: source || "worker",
    linkType: (self.navigator && self.navigator.connection && self.navigator.connection.type) || "unknown",
    effectiveType: (self.navigator && self.navigator.connection && self.navigator.connection.effectiveType) || "",
  };
  if (mesh && mesh.deviceId) {
    payload.meshDeviceId = mesh.deviceId;
    payload.batteryPct = typeof mesh.batteryPct === "number" ? mesh.batteryPct : null;
    payload.batteryCharging = typeof mesh.charging === "boolean" ? mesh.charging : null;
    payload.batteryAt = mesh.at || null;
  }
  if (fresh) {
    payload.lat = fresh.lat;
    payload.lng = fresh.lng;
    payload.accuracy = fresh.accuracy ?? null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    await kvSet("lastBeacon", { at: Date.now(), status: res.status, source: payload.source });
    return res.ok;
  } catch (_e) {
    await kvSet("lastBeacon", { at: Date.now(), status: 0, source: payload.source });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** OP LAYER — TIER 2. The worker cannot run the local battery (no DOM, no
 *  WebRTC, no geolocation), so it does not pretend to: it files presence and
 *  the last fix the page handed over, at a confidence the server caps anyway.
 *  Its only value is that it keeps the account's roster honest about which
 *  devices are still alive after every tab is gone. */
async function opBeacon(source) {
  const cfg = await kvGet("config");
  if (!cfg || !cfg.token || !cfg.opEndpoint || !cfg.opDeviceId) return false;
  const fix = await kvGet("fix");
  const fresh = fix && Date.now() - fix.at < 6 * 3600e3 ? fix : null;

  const signals = [{
    type: "posture",
    verdict: "unknown",
    confidence: 0.3,
    evidence: {
      note: "Background presence beacon. No local battery was run — a worker cannot inspect DNS, WebRTC or the radio.",
      linkType: (self.navigator && self.navigator.connection && self.navigator.connection.effectiveType) || "unknown",
      source: source || "worker",
    },
  }];
  if (fresh) {
    signals.push({
      type: "geo", verdict: "clean", confidence: 0.3,
      lat: fresh.lat, lng: fresh.lng, accuracy: fresh.accuracy ?? null,
      evidence: { source: "handover", handedOverAt: new Date(fresh.at).toISOString() },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(cfg.opEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
      body: JSON.stringify({ action: "report", token: cfg.token, deviceId: cfg.opDeviceId, tier: "background", signals }),
      signal: controller.signal,
    });
    return res.ok;
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("periodicsync", (event) => {
  if (event.tag === TAG) event.waitUntil(Promise.all([beacon("periodicsync"), opBeacon("periodicsync")]));
});

self.addEventListener("sync", (event) => {
  if (event.tag === TAG) event.waitUntil(Promise.all([beacon("sync"), opBeacon("sync")]));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "sentinel-config") event.waitUntil(kvSet("config", data.config));
  else if (data.type === "sentinel-fix") event.waitUntil(kvSet("fix", data.fix));
  else if (data.type === "sentinel-mesh") event.waitUntil(kvSet("mesh", data.mesh));
  else if (data.type === "sentinel-beacon-now") event.waitUntil(Promise.all([beacon("page"), opBeacon("page")]));
});
