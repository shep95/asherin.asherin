// IDE Pain Point #12: Losing work / no auto-save.
// IndexedDB-backed infinite history. Keeps last 1000 snapshots per file, with
// optional named "checkpoints". Works offline. No network.

const DB_NAME = "ide_history";
const DB_VERSION = 1;
const STORE = "snapshots";

export interface Snapshot {
  id?: number;
  scope: string; // "aureon" | "asher" — keeps the two IDEs isolated
  projectId: string;
  fileId: string;
  filePath: string;
  content: string;
  createdAt: number;
  bytes: number;
  label?: string; // "checkpoint" name, if any
}

let dbP: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbP) return dbP;
  dbP = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        s.createIndex("by_file", ["scope", "projectId", "fileId", "createdAt"]);
        s.createIndex("by_scope_project", ["scope", "projectId"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbP;
}

const MAX_PER_FILE = 1000;

export async function saveSnapshot(snap: Omit<Snapshot, "id" | "createdAt" | "bytes">): Promise<number> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const full: Snapshot = { ...snap, createdAt: Date.now(), bytes: snap.content.length };
  const id = await new Promise<number>((res, rej) => {
    const r = store.add(full);
    r.onsuccess = () => res(r.result as number);
    r.onerror = () => rej(r.error);
  });
  // Trim to MAX_PER_FILE
  const idx = store.index("by_file");
  const range = IDBKeyRange.bound([snap.scope, snap.projectId, snap.fileId, 0], [snap.scope, snap.projectId, snap.fileId, Date.now() + 1]);
  const all: Snapshot[] = await new Promise((res, rej) => {
    const r = idx.getAll(range);
    r.onsuccess = () => res(r.result as Snapshot[]);
    r.onerror = () => rej(r.error);
  });
  if (all.length > MAX_PER_FILE) {
    const toDelete = all.sort((a, b) => a.createdAt - b.createdAt).slice(0, all.length - MAX_PER_FILE);
    for (const s of toDelete) if (s.id) store.delete(s.id);
  }
  return id;
}

export async function listSnapshots(scope: string, projectId: string, fileId: string): Promise<Snapshot[]> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  const idx = tx.objectStore(STORE).index("by_file");
  const range = IDBKeyRange.bound([scope, projectId, fileId, 0], [scope, projectId, fileId, Date.now() + 1]);
  return new Promise((res, rej) => {
    const r = idx.getAll(range);
    r.onsuccess = () => res((r.result as Snapshot[]).sort((a, b) => b.createdAt - a.createdAt));
    r.onerror = () => rej(r.error);
  });
}

export async function listProjectSnapshots(scope: string, projectId: string): Promise<Snapshot[]> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  const idx = tx.objectStore(STORE).index("by_scope_project");
  return new Promise((res, rej) => {
    const r = idx.getAll([scope, projectId]);
    r.onsuccess = () => res((r.result as Snapshot[]).sort((a, b) => b.createdAt - a.createdAt));
    r.onerror = () => rej(r.error);
  });
}

export async function restoreSnapshot(id: number): Promise<Snapshot | null> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  return new Promise((res, rej) => {
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => res(r.result as Snapshot ?? null);
    r.onerror = () => rej(r.error);
  });
}

/**
 * Throttled snapshot helper. Won't write if content hasn't changed since last
 * snapshot of the same file. Call freely — it dedupes.
 */
const lastHash = new Map<string, string>();
function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return String(h);
}

export async function snapshotIfChanged(snap: Omit<Snapshot, "id" | "createdAt" | "bytes">): Promise<number | null> {
  const key = `${snap.scope}:${snap.projectId}:${snap.fileId}`;
  const h = quickHash(snap.content);
  if (lastHash.get(key) === h) return null;
  lastHash.set(key, h);
  return saveSnapshot(snap);
}
