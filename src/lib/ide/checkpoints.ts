// Per-IDE checkpoint store. Snapshots the *whole* working file set before an
// agent edit, so the user can roll the entire turn back with one click.
// Built on top of the existing IndexedDB used for per-file history.

const DB_NAME = "ide_checkpoints";
const DB_VERSION = 1;
const STORE = "checkpoints";

export interface CheckpointFile {
  fileId: string;
  filePath: string;
  content: string;
}

export interface Checkpoint {
  id?: number;
  scope: "aureon" | "asher";
  projectId: string;
  label: string;       // "Before agent edit · 14:02"
  createdAt: number;
  files: CheckpointFile[];
  /** Optional: the user prompt that triggered the agent run. */
  trigger?: string;
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
        s.createIndex("by_scope_project", ["scope", "projectId", "createdAt"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbP;
}

const MAX_PER_PROJECT = 50;

export async function saveCheckpoint(c: Omit<Checkpoint, "id" | "createdAt">): Promise<number> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const full: Checkpoint = { ...c, createdAt: Date.now() };
  const id = await new Promise<number>((res, rej) => {
    const r = store.add(full);
    r.onsuccess = () => res(r.result as number);
    r.onerror = () => rej(r.error);
  });
  // Trim
  const idx = store.index("by_scope_project");
  const range = IDBKeyRange.bound([c.scope, c.projectId, 0], [c.scope, c.projectId, Date.now() + 1]);
  const all: Checkpoint[] = await new Promise((res, rej) => {
    const r = idx.getAll(range);
    r.onsuccess = () => res(r.result as Checkpoint[]);
    r.onerror = () => rej(r.error);
  });
  if (all.length > MAX_PER_PROJECT) {
    const toDelete = all.sort((a, b) => a.createdAt - b.createdAt).slice(0, all.length - MAX_PER_PROJECT);
    for (const s of toDelete) if (s.id) store.delete(s.id);
  }
  return id;
}

export async function listCheckpoints(scope: string, projectId: string): Promise<Checkpoint[]> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  const idx = tx.objectStore(STORE).index("by_scope_project");
  const range = IDBKeyRange.bound([scope, projectId, 0], [scope, projectId, Date.now() + 1]);
  return new Promise((res, rej) => {
    const r = idx.getAll(range);
    r.onsuccess = () => res((r.result as Checkpoint[]).sort((a, b) => b.createdAt - a.createdAt));
    r.onerror = () => rej(r.error);
  });
}

export async function getCheckpoint(id: number): Promise<Checkpoint | null> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  return new Promise((res, rej) => {
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => res((r.result as Checkpoint) ?? null);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteCheckpoint(id: number): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  return new Promise((res, rej) => {
    const r = tx.objectStore(STORE).delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
