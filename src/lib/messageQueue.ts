/**
 * Production-grade message queue with IndexedDB persistence,
 * offline support, retry logic, and background sync.
 */

const DB_NAME = "aureon_queue_db";
const DB_VERSION = 2;
const MSG_STORE = "queued_messages";
const DRAFT_STORE = "drafts";
const WEBINTEL_STORE = "webintel_sessions";

export type MessageStatus = "queued" | "sending" | "sent" | "failed" | "retrying";

export interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  role: "user";
  status: MessageStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

export interface Draft {
  id: string; // conversationId or view key
  content: string;
  cursorPosition?: number;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MSG_STORE)) {
        db.createObjectStore(MSG_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(WEBINTEL_STORE)) {
        db.createObjectStore(WEBINTEL_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ───── Message Queue ─────

export async function enqueueMessage(msg: Omit<QueuedMessage, "status" | "retryCount" | "maxRetries" | "createdAt">): Promise<QueuedMessage> {
  const queued: QueuedMessage = {
    ...msg,
    status: "queued",
    retryCount: 0,
    maxRetries: 5,
    createdAt: Date.now(),
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MSG_STORE, "readwrite");
    tx.objectStore(MSG_STORE).put(queued);
    tx.oncomplete = () => resolve(queued);
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateMessageStatus(id: string, status: MessageStatus, error?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MSG_STORE, "readwrite");
    const store = tx.objectStore(MSG_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const msg = getReq.result;
      if (msg) {
        msg.status = status;
        msg.lastAttempt = Date.now();
        if (error) msg.error = error;
        if (status === "retrying") msg.retryCount = (msg.retryCount || 0) + 1;
        store.put(msg);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeMessage(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MSG_STORE, "readwrite");
    tx.objectStore(MSG_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedMessages(): Promise<QueuedMessage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MSG_STORE, "readonly");
    const req = tx.objectStore(MSG_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingMessages(): Promise<QueuedMessage[]> {
  const all = await getQueuedMessages();
  return all.filter(m => m.status === "queued" || m.status === "retrying");
}

// ───── Retry with exponential backoff ─────

export function getRetryDelay(retryCount: number): number {
  const delays = [1000, 2000, 4000, 8000, 16000, 30000];
  return delays[Math.min(retryCount, delays.length - 1)];
}

// ───── Draft Persistence ─────

export async function saveDraft(draft: Draft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    tx.objectStore(DRAFT_STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDraft(id: string): Promise<Draft | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const req = tx.objectStore(DRAFT_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    tx.objectStore(DRAFT_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllDrafts(): Promise<Draft[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const req = tx.objectStore(DRAFT_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ───── Web Intelligence Session Persistence ─────

export async function saveWebIntelSession(session: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEBINTEL_STORE, "readwrite");
    tx.objectStore(WEBINTEL_STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getWebIntelSessions(): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEBINTEL_STORE, "readonly");
    const req = tx.objectStore(WEBINTEL_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteWebIntelSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEBINTEL_STORE, "readwrite");
    tx.objectStore(WEBINTEL_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ───── Online/Offline Detection ─────

let onlineListeners: Array<() => void> = [];

export function onOnline(cb: () => void) {
  onlineListeners.push(cb);
  window.addEventListener("online", cb);
  return () => {
    onlineListeners = onlineListeners.filter(l => l !== cb);
    window.removeEventListener("online", cb);
  };
}

export function isOnline(): boolean {
  return navigator.onLine;
}

// ───── Background Sync Registration ─────

export async function registerBackgroundSync(tag = "aureon-message-sync") {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await (reg as any).sync.register(tag);
    } catch {
      // Background sync not supported or denied
    }
  }
}
