// Aureon Service Worker — PWA + Background Sync + Message Queue
const CACHE_NAME = "aureon-v3";
// Pre-cache the Swiss Ephemeris WASM so Vedic chart calculations work offline
// after first load (previously the 2-3MB file silently 504'd offline).
const PRECACHE_URLS = ["/wasm/swisseph.wasm"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Clean old caches
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests; let the browser handle the rest
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isWasm = url.pathname.endsWith(".wasm");
  // Supabase Data API, auth and realtime endpoints must never be served from cache,
  // otherwise a signed-in device can see stale state or a different user's session.
  // Model providers and live data sources are never served from cache.
  const isSupabaseApi = url.origin !== self.location.origin;

  // Always hit the network for live backend state; do not cache.
  if (isSupabaseApi) return;

  event.respondWith(
    (async () => {
      // Stale-while-revalidate for WASM: serve cache fast, refresh in background.
      if (isWasm) {
        const cached = await caches.match(event.request);
        const networkPromise = fetch(event.request)
          .then(async (resp) => {
            if (resp && resp.ok) {
              const c = await caches.open(CACHE_NAME);
              c.put(event.request, resp.clone()).catch(() => {});
            }
            return resp;
          })
          .catch(() => null);
        if (cached) {
          networkPromise.catch(() => {});
          return cached;
        }
        const fresh = await networkPromise;
        if (fresh) return fresh;
        return new Response("", { status: 504, statusText: "Gateway Timeout (offline)" });
      }

      try {
        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response("", {
          status: 504,
          statusText: "Gateway Timeout (offline)",
          headers: { "Content-Type": "text/plain" },
        });
      }
    })(),
  );
});

// Background Sync — process queued messages when connection returns
self.addEventListener("sync", (event) => {
  if (event.tag === "aureon-message-sync") {
    event.waitUntil(processQueuedMessages());
  }
});

async function processQueuedMessages() {
  const DB_NAME = "aureon_queue_db";
  const DB_VERSION = 2;
  const STORE = "queued_messages";

  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const messages = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const pending = messages.filter((m) => m.status === "queued" || m.status === "retrying");

    for (const msg of pending) {
      try {
        const allClients = await clients.matchAll();
        allClients.forEach((client) => {
          client.postMessage({ type: "QUEUE_STATUS", messageId: msg.id, status: "sending" });
        });
        allClients.forEach((client) => {
          client.postMessage({ type: "PROCESS_QUEUE" });
        });
      } catch (e) {
        console.error("Background sync failed for message:", msg.id, e);
      }
    }
  } catch (e) {
    console.error("Background sync DB error:", e);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "QUEUE_UPDATE") {
    clients.matchAll().then((allClients) => {
      allClients.forEach((client) => {
        if (client.id !== event.source?.id) {
          client.postMessage(event.data);
        }
      });
    });
  }
});

/* ── RIDESHARE GUARDIAN · push alerts ────────────────────────────────────
   A safety alert must survive a closed tab, so it is handled here rather
   than in page code. The payload is treated as untrusted: only known fields
   are read, and every one is coerced to a plain string before display. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Asherin", body: event.data ? event.data.text() : "" };
  }

  const title = String(data.title || "Asherin · Guardian").slice(0, 120);
  const body = String(data.body || "").slice(0, 300);
  const verdict = String(data.verdict || "");
  // AVOID/WATCH must not be silently collapsed into an older notification.
  const tag = String(data.tag || "asherin-guardian").slice(0, 80);
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      requireInteraction: verdict === "AVOID" || verdict === "WATCH",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        // Reuse an open Asherin tab rather than stacking new windows.
        if (win.url.includes(self.location.origin) && "focus" in win) {
          win.navigate(target).catch(() => {});
          return win.focus();
        }
      }
      return clients.openWindow(target);
    }),
  );
});
