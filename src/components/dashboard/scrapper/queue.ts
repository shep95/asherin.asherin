// asherin.extract — one extraction queue for the whole tab.
//
// Files are read one at a time (an ocr pass can take a while on a phone, and
// two of them at once would double the memory). The queue lives at module
// level, not in a component, so switching sessions or re-opening the room
// never loses a pass that was half-way: the rows are the source of truth, the
// interface subscribes to the table and redraws from it.

import { emitPull } from "@/lib/connect/emitPull";
import { extractFile, type ExtractProgress, type ExtractResult } from "./extract";
import { getFile, loadBlob, markExtracting, recomputeTotals, saveExtraction } from "./store";

const pending: string[] = [];
const inFlight = new Set<string>();
let running = false;

const progress = new Map<string, ExtractProgress>();
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a listener never stops the pass */
    }
  }
}

/** redraw hook: fires whenever any file's progress changes or a pass ends. */
export function subscribeProgress(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function progressOf(fileId: string): ExtractProgress | undefined {
  return progress.get(fileId);
}

export function isQueued(fileId: string): boolean {
  return inFlight.has(fileId) || pending.includes(fileId);
}

/** put files on the queue (ids already queued or running are left alone) and start the pump. */
export function enqueue(fileIds: string[]): void {
  for (const id of fileIds) {
    if (!inFlight.has(id) && !pending.includes(id)) pending.push(id);
  }
  void pump();
}

/** forget a file that has not started yet (a running pass finishes on its own). */
export function dequeue(fileId: string): void {
  const i = pending.indexOf(fileId);
  if (i >= 0) pending.splice(i, 1);
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const id = pending.shift();
      if (id) await runOne(id);
    }
  } finally {
    running = false;
  }
}

const MISSING: ExtractResult = {
  status: "failed",
  text: "",
  method: null,
  truncated: false,
  pages: 0,
  ocrPages: 0,
  error: "the stored bytes are missing on this device — upload the file again",
};

async function runOne(fileId: string): Promise<void> {
  inFlight.add(fileId);
  const started = performance.now();
  try {
    const file = await getFile(fileId);
    if (!file) return; // deleted while it waited
    await markExtracting(fileId);
    progress.set(fileId, { stage: "reading" });
    notify();
    const blob = await loadBlob(file);
    const res = blob
      ? await extractFile(blob, file.file_name, {
          onProgress: (p) => {
            progress.set(fileId, p);
            notify();
          },
        })
      : MISSING;
    await saveExtraction(fileId, res);
    await recomputeTotals(file.session_id);
    // the connect graph lights this organ only because a pass really ran;
    // the trace carries the file name and counts, never the text.
    void emitPull({
      organ: "file-scrapper",
      capability: "extract",
      fromSurface: "file-scrapper",
      status: res.status === "completed" ? "ok" : res.status === "failed" ? "fail" : "skip",
      latencyMs: performance.now() - started,
      quote: file.file_name,
      meta: { chars: res.text.length, method: res.method ?? "", status: res.status, pages: res.pages, ocr_pages: res.ocrPages },
    });
  } catch {
    // every reader path already answers with a status; this guards the store
    await saveExtraction(fileId, { ...MISSING, error: "the pass stopped unexpectedly — retry" }).catch(() => null);
  } finally {
    inFlight.delete(fileId);
    progress.delete(fileId);
    notify();
  }
}
