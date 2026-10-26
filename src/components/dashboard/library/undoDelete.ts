// delete with undo, for library files.
//
// The row leaves the screen at once; the store is touched only after the undo
// window closes. The timer lives at module level, so leaving the room does not
// cancel a delete the operator asked for — and a tab closed inside the window
// fails safe: the file is still there next time.

import { toast } from "sonner";
import { deleteLibraryFile, type LibraryFile } from "@/lib/library/library";

export const UNDO_WINDOW_MS = 6000;

interface Pending {
  file: LibraryFile;
  timer: ReturnType<typeof setTimeout>;
  onRestore: (f: LibraryFile) => void;
}

const pending = new Map<string, Pending>();

export function isDeletePending(fileId: string): boolean {
  return pending.has(fileId);
}

/**
 * Schedule a delete. `onRestore` puts the row back on screen when the operator
 * presses undo, or when the delete itself fails after the window.
 */
export function scheduleFileDelete(
  file: LibraryFile,
  onRestore: (f: LibraryFile) => void,
  onDeleted?: (f: LibraryFile) => void,
  delayMs = UNDO_WINDOW_MS,
): void {
  const prior = pending.get(file.id);
  if (prior) clearTimeout(prior.timer);

  const timer = setTimeout(async () => {
    pending.delete(file.id);
    try {
      await deleteLibraryFile(file);
      onDeleted?.(file);
    } catch (e) {
      onRestore(file);
      toast.error(e instanceof Error ? e.message : "could not remove that file.");
    }
  }, delayMs);

  pending.set(file.id, { file, timer, onRestore });

  toast(`removed ${file.file_name}`, {
    duration: delayMs,
    action: {
      label: "undo",
      onClick: () => {
        const entry = pending.get(file.id);
        if (!entry) { toast.error("already removed."); return; }
        clearTimeout(entry.timer);
        pending.delete(file.id);
        entry.onRestore(entry.file);
      },
    },
  });
}

/** test seam: run every pending delete now. */
export async function flushPendingDeletes(): Promise<void> {
  const entries = Array.from(pending.values());
  pending.clear();
  for (const e of entries) {
    clearTimeout(e.timer);
    try { await deleteLibraryFile(e.file); } catch { e.onRestore(e.file); }
  }
}
