/**
 * asherin local store — one IndexedDB database on this device.
 *
 * Three object stores:
 *   tables  key = table name        value = Row[]          (the "database")
 *   blobs   key = "bucket/path"     value = { blob, meta } (the "storage buckets")
 *   kv      key = string            value = any            (settings, ids, keys)
 *
 * Nothing here ever leaves the browser. Reads are served from an in-memory
 * cache once a table is loaded; writes are serialised per table so two
 * overlapping mutations can never clobber each other.
 */

export type Row = Record<string, unknown>;

const DB_NAME = "asherin_local_v1";
const DB_VERSION = 1;
export const STORE_TABLES = "tables";
export const STORE_BLOBS = "blobs";
export const STORE_KV = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB is not available in this browser"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TABLES)) db.createObjectStore(STORE_TABLES);
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("local database is blocked by another tab"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openLocalDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ── generic kv ─────────────────────────────────────────────────────────── */

export async function kvGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    return (await tx<T | undefined>(STORE_KV, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await tx(STORE_KV, "readwrite", (s) => s.put(value, key));
}

export async function kvDel(key: string): Promise<void> {
  await tx(STORE_KV, "readwrite", (s) => s.delete(key));
}

/* ── tables ─────────────────────────────────────────────────────────────── */

const cache = new Map<string, Row[]>();
const loading = new Map<string, Promise<Row[]>>();
const chains = new Map<string, Promise<unknown>>();

// In-memory fallback when IndexedDB is unavailable (private mode on some
// browsers, or a test runner): the app still works for the session.
let memoryOnly = false;

export async function loadTable(name: string): Promise<Row[]> {
  const hit = cache.get(name);
  if (hit) return hit;
  const inflight = loading.get(name);
  if (inflight) return inflight;
  const p = (async () => {
    let rows: Row[] = [];
    if (!memoryOnly) {
      try {
        rows = (await tx<Row[] | undefined>(STORE_TABLES, "readonly", (s) => s.get(name) as IDBRequest<Row[] | undefined>)) ?? [];
      } catch {
        memoryOnly = true;
        rows = [];
      }
    }
    if (!Array.isArray(rows)) rows = [];
    cache.set(name, rows);
    return rows;
  })().finally(() => loading.delete(name));
  loading.set(name, p);
  return p;
}

async function persistTable(name: string, rows: Row[]): Promise<void> {
  if (memoryOnly) return;
  try {
    await tx(STORE_TABLES, "readwrite", (s) => s.put(rows, name));
  } catch {
    memoryOnly = true;
  }
}

/**
 * Serialised mutation: `fn` receives the live row array and returns the new
 * array (or the same one, mutated) plus a result value. The write is queued
 * behind any earlier mutation of the same table.
 */
export function mutateTable<T>(name: string, fn: (rows: Row[]) => { rows: Row[]; result: T }): Promise<T> {
  const prev = chains.get(name) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const rows = await loadTable(name);
      const out = fn(rows);
      cache.set(name, out.rows);
      await persistTable(name, out.rows);
      notifyTable(name);
      return out.result;
    });
  chains.set(name, next);
  return next;
}

export async function tableNames(): Promise<string[]> {
  if (memoryOnly) return [...cache.keys()];
  try {
    const keys = await tx<IDBValidKey[]>(STORE_TABLES, "readonly", (s) => s.getAllKeys());
    return Array.from(new Set([...keys.map(String), ...cache.keys()]));
  } catch {
    return [...cache.keys()];
  }
}

export async function dropTable(name: string): Promise<void> {
  cache.delete(name);
  if (memoryOnly) return;
  try {
    await tx(STORE_TABLES, "readwrite", (s) => s.delete(name));
  } catch {
    /* ignore */
  }
}

/* ── blobs ──────────────────────────────────────────────────────────────── */

export interface BlobRecord {
  blob: Blob;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export function blobKey(bucket: string, path: string): string {
  return `${bucket}/${path.replace(/^\/+/, "")}`;
}

export async function blobGet(bucket: string, path: string): Promise<BlobRecord | undefined> {
  try {
    return (await tx<BlobRecord | undefined>(STORE_BLOBS, "readonly", (s) => s.get(blobKey(bucket, path)) as IDBRequest<BlobRecord | undefined>)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function blobPut(bucket: string, path: string, rec: BlobRecord): Promise<void> {
  await tx(STORE_BLOBS, "readwrite", (s) => s.put(rec, blobKey(bucket, path)));
}

export async function blobDel(bucket: string, path: string): Promise<void> {
  await tx(STORE_BLOBS, "readwrite", (s) => s.delete(blobKey(bucket, path)));
}

export async function blobKeys(bucket: string): Promise<string[]> {
  try {
    const keys = await tx<IDBValidKey[]>(STORE_BLOBS, "readonly", (s) => s.getAllKeys());
    const prefix = `${bucket}/`;
    return keys.map(String).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  } catch {
    return [];
  }
}

/* ── change notifications (used by the realtime shim) ───────────────────── */

const listeners = new Map<string, Set<() => void>>();

export function onTableChange(name: string, cb: () => void): () => void {
  const set = listeners.get(name) ?? new Set();
  set.add(cb);
  listeners.set(name, set);
  return () => set.delete(cb);
}

function notifyTable(name: string) {
  const set = listeners.get(name);
  if (!set) return;
  for (const cb of set) {
    try {
      cb();
    } catch {
      /* listener errors never break a write */
    }
  }
}

/* ── wipe ───────────────────────────────────────────────────────────────── */

/** Everything this device holds for asherin, gone. Used by "delete my data". */
export async function wipeLocalDb(): Promise<void> {
  cache.clear();
  try {
    const db = await openLocalDb();
    db.close();
  } catch {
    /* not open */
  }
  dbPromise = null;
  await new Promise<void>((resolve) => {
    if (!hasIndexedDb()) return resolve();
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export function uuid(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
