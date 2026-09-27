// IDE Pain Point: "I don't know what changed". Tracks every file the agent
// touched in the current turn, in-memory. Components subscribe via useState.

export interface ChangedFile {
  fileId: string;
  filePath: string;
  /** "edit" = patched in place, "create" = new file, "delete" = removed. */
  kind: "edit" | "create" | "delete";
  bytesBefore: number;
  bytesAfter: number;
  at: number;
}

type Listener = (files: ChangedFile[]) => void;

class ChangedFilesStore {
  private byScope: Record<string, ChangedFile[]> = {};
  private listeners: Record<string, Set<Listener>> = {};

  key(scope: string, projectId: string) { return `${scope}:${projectId}`; }

  list(scope: string, projectId: string): ChangedFile[] {
    return this.byScope[this.key(scope, projectId)] ?? [];
  }

  push(scope: string, projectId: string, f: ChangedFile) {
    const k = this.key(scope, projectId);
    const arr = this.byScope[k] ?? [];
    // Replace any prior entry for the same file in this turn.
    const filtered = arr.filter(x => x.fileId !== f.fileId);
    filtered.push(f);
    this.byScope[k] = filtered;
    this.emit(k);
  }

  clear(scope: string, projectId: string) {
    const k = this.key(scope, projectId);
    this.byScope[k] = [];
    this.emit(k);
  }

  subscribe(scope: string, projectId: string, fn: Listener): () => void {
    const k = this.key(scope, projectId);
    if (!this.listeners[k]) this.listeners[k] = new Set();
    this.listeners[k].add(fn);
    return () => this.listeners[k].delete(fn);
  }

  private emit(k: string) {
    const snap = [...(this.byScope[k] ?? [])];
    this.listeners[k]?.forEach(fn => fn(snap));
  }
}

export const changedFiles = new ChangedFilesStore();
