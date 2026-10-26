// asherin.notebooks — cells of notes, code and questions for shepherd, kept on this device.
//
// What this room honestly does: keeps notebooks of ordered cells in IndexedDB;
// renders text cells as markdown; answers prompt cells with shepherd (the
// model the operator connected, called from this device); keeps code and sql
// cells as text — no engine ships in this build, and the cell says so;
// snapshots versions on request and restores them; exports a notebook as
// markdown. It does not share, schedule, or run anything on a server.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import {
  Plus, FileText, Play, Square, Copy, Trash2, Pencil, Code, Type, Database, MessageSquare,
  X, History, RotateCcw, Loader2, ChevronLeft, ArrowUp, ArrowDown, Download, Check, Save, KeyRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { streamChat } from "@/lib/ai";
import { emitPull } from "@/lib/connect/emitPull";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import CellOutput, { parseOutput } from "@/components/dashboard/notebooks/CellOutput";
import {
  CELL_TYPES, LIMITS, addCell, cellLabel, cellTitle, cloneNotebook, createNotebook, deleteCell, deleteNotebook,
  describeModelFailure, exportFileName, exportMarkdown, listNotebooks, listVersions, loadCells, onNotebooksChange,
  promptContext, renameNotebook, reorderCells, restoreVersion, saveVersion, updateCell,
  type CellType, type Notebook, type NotebookCell, type NotebookVersion,
} from "@/components/dashboard/notebooks/notebookStore";

const PROSE =
  "prose prose-invert prose-sm max-w-none [&_h1]:text-base [&_h1]:font-extralight [&_h1]:tracking-wide [&_h2]:text-sm [&_h2]:font-light [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-light [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:text-xs [&_p]:font-extralight [&_p]:leading-relaxed [&_p]:text-foreground/85 [&_li]:text-xs [&_li]:font-extralight [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_hr]:border-border/20 [&_strong]:text-foreground [&_strong]:font-light [&_code]:text-[11px] [&_pre]:text-[11px] [&_pre]:bg-background/40 [&_pre]:rounded-lg";

const ICON_BTN = "rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-40";
const QUIET_BTN = "inline-flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-1.5 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50";
const PRIMARY_BTN = "inline-flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT = "w-full rounded-xl border border-border/20 bg-card/20 px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border/40";

const CELL_ICON: Record<CellType, React.ElementType> = { text: Type, prompt: MessageSquare, code: Code, sql: Database };
const CELL_HINT: Record<CellType, string> = {
  text: "markdown, rendered here",
  prompt: "a question shepherd answers in place",
  code: "kept as text",
  sql: "kept as text — no sql engine in this build",
};

const SAVE_DEBOUNCE_MS = 800;

function openSettings() {
  try {
    window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: "settings" }));
  } catch {
    /* no window */
  }
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** a two-step inline confirm; no browser dialog. */
const InlineConfirm = ({ text, onYes, onNo, yes = "delete" }: { text: string; onYes: () => void; onNo: () => void; yes?: string }) => (
  <div role="alertdialog" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-light text-foreground">
    <span className="min-w-0 flex-1">{text}</span>
    <button onClick={onYes} className="rounded-md bg-red-500/15 px-2.5 py-1 text-red-300 hover:bg-red-500/25">{yes}</button>
    <button onClick={onNo} className="rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground">keep</button>
  </div>
);

const NotebooksView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const v2 = useIsV2();

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [cells, setCells] = useState<NotebookCell[]>([]);
  const [cellsError, setCellsError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [confirmCell, setConfirmCell] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [liveAnswer, setLiveAnswer] = useState<string>("");

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmNotebook, setConfirmNotebook] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameDesc, setRenameDesc] = useState("");

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<NotebookVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionSummary, setVersionSummary] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const alive = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const pending = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; content: string }>>({});
  const liveRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => notebooks.find((n) => n.id === selectedId) ?? null, [notebooks, selectedId]);

  /* ── loading ─────────────────────────────────────────────────────────── */

  const refreshList = useCallback(async () => {
    if (!user) {
      setLoadError("this device has no identity yet — open chat once and come back.");
      setLoading(false);
      return;
    }
    const res = await listNotebooks(user.id);
    if (!alive.current) return;
    if (res.error) setLoadError(res.error.toLowerCase());
    else {
      setLoadError(null);
      setNotebooks(res.data ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    alive.current = true;
    void refreshList();
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onNotebooksChange(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void refreshList(), 400);
    });
    return () => {
      alive.current = false;
      off();
      if (t) clearTimeout(t);
    };
  }, [refreshList]);

  const flushPending = useCallback(async () => {
    const entries = Object.entries(pending.current);
    pending.current = {};
    for (const [cellId, p] of entries) {
      clearTimeout(p.timer);
      await updateCell(cellId, { content: p.content });
    }
  }, []);

  const openCells = useCallback(async (notebookId: string) => {
    await flushPending();
    const res = await loadCells(notebookId);
    if (!alive.current) return;
    if (res.error) {
      setCellsError(res.error.toLowerCase());
      setCells([]);
    } else {
      setCellsError(null);
      const rows = res.data ?? [];
      setCells(rows);
      setDrafts(Object.fromEntries(rows.map((c) => [c.id, c.content])));
    }
  }, [flushPending]);

  useEffect(() => {
    if (selectedId) void openCells(selectedId);
    else {
      setCells([]);
      setDrafts({});
    }
    setEditingCell(null);
    setConfirmCell(null);
    setCellErrors({});
    setVersionsOpen(false);
    setRenaming(false);
  }, [selectedId, openCells]);

  // unmount: stop any stream and write what is still pending — never drop an edit.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const entries = Object.entries(pending.current);
      pending.current = {};
      for (const [cellId, p] of entries) {
        clearTimeout(p.timer);
        void updateCell(cellId, { content: p.content });
      }
    };
  }, []);

  /* ── notebooks ───────────────────────────────────────────────────────── */

  const create = async () => {
    if (!user || busy) return;
    setBusy(true);
    const res = await createNotebook(user.id, { title: newTitle, description: newDesc });
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the notebook could not be created", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setNewTitle("");
    setNewDesc("");
    setCreating(false);
    await refreshList();
    setSelectedId(res.data.id);
  };

  const clone = async (nb: Notebook) => {
    if (!user || busy) return;
    setBusy(true);
    const res = await cloneNotebook(user.id, nb);
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the copy was not made", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    await refreshList();
    setSelectedId(res.data.id);
    toast({ title: "copied", description: `"${res.data.title}" is in the list.` });
  };

  const remove = async (id: string) => {
    setConfirmNotebook(null);
    const res = await deleteNotebook(id);
    if (res.error) {
      toast({ title: "the notebook could not be removed", description: res.error, variant: "destructive" });
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await refreshList();
    toast({ title: "notebook removed" });
  };

  const startRename = () => {
    if (!selected) return;
    setRenameTitle(selected.title);
    setRenameDesc(selected.description);
    setRenaming(true);
  };

  const commitRename = async () => {
    if (!selected) return;
    const res = await renameNotebook(selected.id, { title: renameTitle, description: renameDesc });
    if (res.error) {
      toast({ title: "the name was not saved", description: res.error, variant: "destructive" });
      return;
    }
    setRenaming(false);
    await refreshList();
  };

  const exportNotebook = () => {
    if (!selected) return;
    const current = cells.map((c) => ({ ...c, content: drafts[c.id] ?? c.content }));
    download(exportFileName(selected.title), exportMarkdown(selected, current));
  };

  /* ── cells ───────────────────────────────────────────────────────────── */

  const add = async (type: CellType) => {
    if (!selected) return;
    const res = await addCell(selected.id, type, cells.length);
    if (res.error || !res.data) {
      toast({ title: "the cell was not added", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setCells((prev) => [...prev, res.data!]);
    setDrafts((prev) => ({ ...prev, [res.data!.id]: res.data!.content }));
    setEditingCell(res.data.id);
  };

  const edit = (cellId: string, content: string) => {
    setDrafts((prev) => ({ ...prev, [cellId]: content }));
    const prev = pending.current[cellId];
    if (prev) clearTimeout(prev.timer);
    pending.current[cellId] = {
      content,
      timer: setTimeout(async () => {
        delete pending.current[cellId];
        const res = await updateCell(cellId, { content });
        if (!alive.current) return;
        if (res.error) setCellErrors((e) => ({ ...e, [cellId]: `not saved: ${res.error!.toLowerCase()}` }));
        else {
          setCellErrors((e) => {
            if (!e[cellId]) return e;
            const next = { ...e };
            delete next[cellId];
            return next;
          });
          setCells((cs) => cs.map((c) => (c.id === cellId ? { ...c, content } : c)));
        }
      }, SAVE_DEBOUNCE_MS),
    };
  };

  const stopEditing = async (cellId: string) => {
    setEditingCell(null);
    const p = pending.current[cellId];
    if (!p) return;
    clearTimeout(p.timer);
    delete pending.current[cellId];
    const res = await updateCell(cellId, { content: p.content });
    if (!alive.current) return;
    if (res.error) setCellErrors((e) => ({ ...e, [cellId]: `not saved: ${res.error!.toLowerCase()}` }));
    else setCells((cs) => cs.map((c) => (c.id === cellId ? { ...c, content: p.content } : c)));
  };

  const removeCell = async (cellId: string) => {
    setConfirmCell(null);
    const p = pending.current[cellId];
    if (p) {
      clearTimeout(p.timer);
      delete pending.current[cellId];
    }
    const res = await deleteCell(cellId);
    if (res.error) {
      toast({ title: "the cell was not removed", description: res.error, variant: "destructive" });
      return;
    }
    const next = cells.filter((c) => c.id !== cellId).map((c, i) => ({ ...c, position: i }));
    setCells(next);
    await reorderCells(next);
  };

  const move = async (cellId: string, dir: -1 | 1) => {
    const idx = cells.findIndex((c) => c.id === cellId);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= cells.length) return;
    const next = [...cells];
    [next[idx], next[to]] = [next[to], next[idx]];
    const renumbered = next.map((c, i) => ({ ...c, position: i }));
    setCells(renumbered);
    const res = await reorderCells(renumbered);
    if (res.error) toast({ title: "the order was not saved", description: res.error, variant: "destructive" });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "copied" });
    } catch {
      toast({ title: "the clipboard is not available here", description: "select the text and copy it by hand.", variant: "destructive" });
    }
  };

  /* ── shepherd ────────────────────────────────────────────────────────── */

  const ask = async (cell: NotebookCell) => {
    if (running) return;
    const question = (drafts[cell.id] ?? cell.content).trim();
    if (!question) {
      setCellErrors((e) => ({ ...e, [cell.id]: "write the question first." }));
      return;
    }
    const p = pending.current[cell.id];
    if (p) {
      clearTimeout(p.timer);
      delete pending.current[cell.id];
      await updateCell(cell.id, { content: p.content });
    }
    setCellErrors((e) => {
      const next = { ...e };
      delete next[cell.id];
      return next;
    });
    setEditingCell(null);
    setRunning(cell.id);
    setLiveAnswer("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const started = performance.now();
    const context = promptContext(cells.map((c) => ({ ...c, content: drafts[c.id] ?? c.content })), cell);
    let full = "";
    let status: "ok" | "fail" = "ok";
    try {
      await streamChat({
        messages: [{ role: "user", content: question }],
        mode: "chat",
        depth: "standard",
        signal: ctrl.signal,
        brainContext: context
          ? { prompt: `this question is a cell in the operator's notebook. the cells above it, in order:\n\n${context}`, fileContents: [] }
          : null,
        onDelta: (t) => {
          full += t;
          if (alive.current) setLiveAnswer(full);
        },
        onReplace: (t) => {
          full = t;
          if (alive.current) setLiveAnswer(full);
        },
        onDone: () => undefined,
      });
      if (!full.trim()) {
        status = "fail";
        if (alive.current) setCellErrors((e) => ({ ...e, [cell.id]: "no answer came back." }));
      }
    } catch (e) {
      if (!(ctrl.signal.aborted && full.trim())) {
        status = "fail";
        if (alive.current) setCellErrors((er) => ({ ...er, [cell.id]: describeModelFailure(e) }));
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
    if (full.trim()) {
      const saved = await updateCell(cell.id, { output: full });
      if (alive.current) {
        setCells((cs) => cs.map((c) => (c.id === cell.id ? { ...c, output: full } : c)));
        if (saved.error) setCellErrors((e) => ({ ...e, [cell.id]: `the answer is shown but was not saved: ${saved.error!.toLowerCase()}` }));
      }
    }
    if (alive.current) {
      setRunning(null);
      setLiveAnswer("");
    }
    void emitPull({
      organ: "notebooks",
      capability: "prompt",
      fromSurface: "notebooks",
      status,
      latencyMs: performance.now() - started,
      quote: cellTitle({ cell_type: "prompt", content: question }),
      meta: { notebook_id: cell.notebook_id, answered: Boolean(full.trim()), context_chars: context.length },
    });
  };

  const stop = () => abortRef.current?.abort();

  useEffect(() => {
    if (liveRef.current) liveRef.current.scrollTop = liveRef.current.scrollHeight;
  }, [liveAnswer]);

  /* ── versions ────────────────────────────────────────────────────────── */

  const openVersions = async () => {
    if (!selected) return;
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError(null);
    const res = await listVersions(selected.id);
    if (!alive.current) return;
    setVersionsLoading(false);
    if (res.error) setVersionsError(res.error.toLowerCase());
    else setVersions(res.data ?? []);
  };

  const keepVersion = async () => {
    if (!selected || busy) return;
    await flushPending();
    setBusy(true);
    const current = cells.map((c) => ({ ...c, content: drafts[c.id] ?? c.content }));
    const res = await saveVersion(selected, current, versionSummary);
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the version was not saved", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setVersionSummary("");
    setVersions((v) => [res.data!, ...v]);
    await refreshList();
    toast({ title: `v${res.data.version} kept` });
  };

  const restore = async (v: NotebookVersion) => {
    if (!selected || busy) return;
    setConfirmRestore(null);
    await flushPending();
    setBusy(true);
    const current = cells.map((c) => ({ ...c, content: drafts[c.id] ?? c.content }));
    const res = await restoreVersion(selected, current, v);
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the version was not restored", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setCells(res.data);
    setDrafts(Object.fromEntries(res.data.map((c) => [c.id, c.content])));
    await refreshList();
    await openVersions();
    toast({ title: `restored v${v.version}`, description: "the cells before the restore were kept as a version too." });
  };

  /* ── surfaces ────────────────────────────────────────────────────────── */

  const newButton = (
    <button onClick={() => setCreating(true)} className={v2 ? v2ActionClass : PRIMARY_BTN} disabled={!!loadError}>
      <Plus className="h-3.5 w-3.5" /> new notebook
    </button>
  );

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center gap-2 p-6 text-xs font-extralight text-muted-foreground" aria-busy="true">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading this device's notebooks…
      </div>
    );
  }

  const listPane = (
    <aside className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-border/20 md:w-72 md:shrink-0 md:border-r`} aria-label="notebooks">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loadError ? (
          <div role="alert" className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs font-light text-foreground">
            <p>{loadError}</p>
            <button onClick={() => void refreshList()} className={QUIET_BTN}>try again</button>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs font-extralight text-muted-foreground">no notebooks yet.</p>
            <p className="mt-1 text-[11px] font-extralight text-muted-foreground/60">a notebook is a column of cells: notes, code, and questions shepherd answers in place. everything stays on this device.</p>
            <button onClick={() => setCreating(true)} className={`${QUIET_BTN} mt-4`}><Plus className="h-3.5 w-3.5" /> new notebook</button>
          </div>
        ) : (
          <ul className="space-y-1">
            {notebooks.map((nb) => (
              <li key={nb.id}>
                <div className={`flex items-center gap-1 rounded-xl pr-1 transition-colors ${selectedId === nb.id ? "bg-foreground/10" : "hover:bg-foreground/5"}`}>
                  <button onClick={() => setSelectedId(nb.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left" aria-current={selectedId === nb.id ? "true" : undefined}>
                    <p className={`truncate text-xs font-light ${selectedId === nb.id ? "text-foreground" : "text-muted-foreground"}`}>{nb.title}</p>
                    <p className="mt-0.5 text-[10px] font-extralight text-muted-foreground/50">
                      v{nb.version} · {new Date(nb.updated_at ?? nb.created_at).toLocaleDateString()}
                    </p>
                  </button>
                  <button onClick={() => void clone(nb)} className={ICON_BTN} aria-label={`copy ${nb.title}`} disabled={busy}><Copy className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setConfirmNotebook(nb.id)} className={`${ICON_BTN} hover:text-red-300`} aria-label={`delete ${nb.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {confirmNotebook === nb.id && (
                  <div className="mt-1">
                    <InlineConfirm text={`delete "${nb.title}" and its cells and versions from this device?`} onYes={() => void remove(nb.id)} onNo={() => setConfirmNotebook(null)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );

  const detailPane = (
    <section className={`${selectedId ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`} aria-label="notebook">
      {selected ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
            {/* notebook header */}
            <div className="flex flex-wrap items-start gap-2">
              <button onClick={() => setSelectedId(null)} className={`${ICON_BTN} md:hidden`} aria-label="back to the list"><ChevronLeft className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <div className="space-y-2">
                    <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} className={INPUT} maxLength={LIMITS.title} aria-label="notebook title" onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") setRenaming(false); }} autoFocus />
                    <input value={renameDesc} onChange={(e) => setRenameDesc(e.target.value)} className={INPUT} maxLength={LIMITS.description} placeholder="what this notebook is for (optional)" aria-label="notebook description" onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") setRenaming(false); }} />
                    <div className="flex gap-2">
                      <button onClick={() => void commitRename()} className={QUIET_BTN}><Check className="h-3.5 w-3.5" /> save</button>
                      <button onClick={() => setRenaming(false)} className={QUIET_BTN}>cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="truncate text-base font-extralight tracking-wide text-foreground">{selected.title}</h2>
                    <p className="mt-0.5 text-xs font-extralight text-muted-foreground">
                      {selected.description || "no description"} · v{selected.version} · {cells.length} {cells.length === 1 ? "cell" : "cells"}
                    </p>
                  </>
                )}
              </div>
              {!renaming && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={startRename} className={ICON_BTN} aria-label="rename notebook"><Pencil className="h-4 w-4" /></button>
                  <button onClick={exportNotebook} className={ICON_BTN} aria-label="download as markdown" disabled={cells.length === 0}><Download className="h-4 w-4" /></button>
                  <button onClick={() => (versionsOpen ? setVersionsOpen(false) : void openVersions())} className={ICON_BTN} aria-label="versions" aria-expanded={versionsOpen}><History className="h-4 w-4" /></button>
                </div>
              )}
            </div>

            {/* versions */}
            {versionsOpen && (
              <div className="space-y-3 rounded-xl border border-border/15 bg-card/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={versionSummary} onChange={(e) => setVersionSummary(e.target.value)} className={`${INPUT} min-w-0 flex-1`} maxLength={LIMITS.summary} placeholder="what changed (optional)" aria-label="version summary" onKeyDown={(e) => e.key === "Enter" && void keepVersion()} />
                  <button onClick={() => void keepVersion()} className={QUIET_BTN} disabled={busy || cells.length === 0}><Save className="h-3.5 w-3.5" /> keep as v{selected.version + 1}</button>
                </div>
                <p className="text-[11px] font-extralight text-muted-foreground/70">a version is a snapshot of the cells, kept on this device. restoring one keeps the current cells as a version first.</p>
                {versionsLoading ? (
                  <p className="text-xs font-extralight text-muted-foreground" aria-busy="true">reading versions…</p>
                ) : versionsError ? (
                  <div role="alert" className="flex flex-wrap items-center gap-2 text-xs font-light text-foreground">
                    <span>{versionsError}</span>
                    <button onClick={() => void openVersions()} className={QUIET_BTN}>try again</button>
                  </div>
                ) : versions.length === 0 ? (
                  <p className="text-xs font-extralight text-muted-foreground">no versions kept yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {versions.map((v) => (
                      <li key={v.id} className="rounded-lg border border-border/10 bg-card/20 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-light text-foreground">v{v.version}</span>
                          <span className="text-[10px] font-extralight text-muted-foreground/60">{new Date(v.created_at).toLocaleString()}</span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-extralight text-muted-foreground">{v.change_summary}</span>
                          {v.snapshot ? (
                            <button onClick={() => setConfirmRestore(v.id)} className={QUIET_BTN} disabled={busy}><RotateCcw className="h-3 w-3" /> restore</button>
                          ) : (
                            <span className="text-[10px] font-extralight text-muted-foreground/50">no snapshot</span>
                          )}
                        </div>
                        {confirmRestore === v.id && (
                          <div className="mt-2">
                            <InlineConfirm text={`replace the current cells with v${v.version}?`} yes="restore" onYes={() => void restore(v)} onNo={() => setConfirmRestore(null)} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {cellsError && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs font-light text-foreground">
                <span>the cells could not be read: {cellsError}</span>
                <button onClick={() => void openCells(selected.id)} className={QUIET_BTN}>try again</button>
              </div>
            )}

            {/* cells */}
            <ol className="space-y-3" aria-label="cells">
              {cells.map((cell, idx) => {
                const Icon = CELL_ICON[cell.cell_type];
                const isEditing = editingCell === cell.id;
                const isRunning = running === cell.id;
                const body = drafts[cell.id] ?? cell.content;
                const err = cellErrors[cell.id];
                const legacy = cell.cell_type !== "prompt" ? parseOutput(cell.output) : null;
                const showLegacy = legacy && legacy.kind === "table" && legacy.rows.length > 0;
                return (
                  <li key={cell.id} className="overflow-hidden rounded-2xl border border-border/10 bg-card/20">
                    <div className="flex flex-wrap items-center gap-1 border-b border-border/10 bg-foreground/[0.02] px-3 py-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
                      <span className="text-[10px] font-light tracking-widest text-muted-foreground">{cellLabel(cell.cell_type)}</span>
                      <span className="hidden text-[10px] font-extralight text-muted-foreground/50 sm:inline">· {CELL_HINT[cell.cell_type]}</span>
                      <div className="ml-auto flex items-center">
                        {cell.cell_type === "prompt" && (
                          isRunning ? (
                            <button onClick={stop} className={`${ICON_BTN} text-accent`} aria-label="stop shepherd"><Square className="h-3.5 w-3.5" /></button>
                          ) : (
                            <button onClick={() => void ask(cell)} className={`${ICON_BTN} text-accent`} aria-label="ask shepherd" disabled={!!running}><Play className="h-3.5 w-3.5" /></button>
                          )
                        )}
                        {(cell.cell_type === "code" || cell.cell_type === "sql") && (
                          <button onClick={() => void copyText(body)} className={ICON_BTN} aria-label="copy cell"><Copy className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => void move(cell.id, -1)} className={ICON_BTN} aria-label="move cell up" disabled={idx === 0}><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => void move(cell.id, 1)} className={ICON_BTN} aria-label="move cell down" disabled={idx === cells.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button onClick={() => (isEditing ? void stopEditing(cell.id) : setEditingCell(cell.id))} className={ICON_BTN} aria-label={isEditing ? "done editing" : "edit cell"} aria-pressed={isEditing}>
                          {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setConfirmCell(cell.id)} className={`${ICON_BTN} hover:text-red-300`} aria-label="delete cell"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="p-3 sm:p-4">
                      {confirmCell === cell.id && (
                        <div className="mb-3">
                          <InlineConfirm text="delete this cell?" onYes={() => void removeCell(cell.id)} onNo={() => setConfirmCell(null)} />
                        </div>
                      )}
                      {isEditing ? (
                        <textarea
                          value={body}
                          onChange={(e) => edit(cell.id, e.target.value)}
                          onBlur={() => void stopEditing(cell.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") void stopEditing(cell.id);
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && cell.cell_type === "prompt") void ask(cell);
                          }}
                          placeholder={cell.cell_type === "prompt" ? "ask shepherd something about this notebook…" : cell.cell_type === "text" ? "write in markdown…" : `${cell.cell_type}…`}
                          className={`min-h-[96px] w-full resize-y bg-transparent text-xs font-light text-foreground outline-none placeholder:text-muted-foreground/40 ${cell.cell_type === "text" || cell.cell_type === "prompt" ? "" : "font-mono"}`}
                          maxLength={LIMITS.cellContent}
                          aria-label={`${cellLabel(cell.cell_type)} cell`}
                          autoFocus
                        />
                      ) : body.trim() ? (
                        cell.cell_type === "text" ? (
                          <div className={PROSE} onDoubleClick={() => setEditingCell(cell.id)}><ReactMarkdown>{body}</ReactMarkdown></div>
                        ) : cell.cell_type === "prompt" ? (
                          <p className="whitespace-pre-wrap text-xs font-light text-foreground" onDoubleClick={() => setEditingCell(cell.id)}>{body}</p>
                        ) : (
                          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs font-light text-foreground/85" onDoubleClick={() => setEditingCell(cell.id)}>{body}</pre>
                        )
                      ) : (
                        <button onClick={() => setEditingCell(cell.id)} className="text-left text-xs font-extralight text-muted-foreground/60 hover:text-muted-foreground">
                          {cell.cell_type === "prompt" ? "empty — write a question, then press play." : "empty — click to write."}
                        </button>
                      )}

                      {cell.cell_type === "sql" && (
                        <p className="mt-2 text-[10px] font-extralight text-muted-foreground/60">no sql engine ships in this build, so nothing runs here. the query is kept as text; ask shepherd about it in a prompt cell.</p>
                      )}

                      {cell.cell_type === "prompt" && (isRunning || cell.output?.trim()) && (
                        <div ref={isRunning ? liveRef : undefined} className="mt-3 max-h-[60vh] overflow-y-auto border-t border-border/10 pt-3" aria-live={isRunning ? "polite" : undefined} aria-busy={isRunning || undefined}>
                          <p className="mb-1.5 text-[10px] font-light tracking-widest text-muted-foreground/60">shepherd</p>
                          {isRunning && !liveAnswer ? (
                            <p className="flex items-center gap-2 text-xs font-extralight text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</p>
                          ) : (
                            <div className={PROSE}><ReactMarkdown>{isRunning ? liveAnswer : cell.output ?? ""}</ReactMarkdown></div>
                          )}
                          {!isRunning && cell.output?.trim() && (
                            <button onClick={() => void copyText(cell.output ?? "")} className={`${QUIET_BTN} mt-2`}><Copy className="h-3 w-3" /> copy answer</button>
                          )}
                        </div>
                      )}

                      {showLegacy && legacy && <CellOutput env={legacy} />}

                      {err && (
                        <div role="alert" className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-border/20 bg-card/20 px-3 py-2 text-[11px] font-light text-foreground">
                          {/key|settings/i.test(err) && <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
                          <span className="min-w-0 flex-1">{err}</span>
                          {/key|settings/i.test(err) && <button onClick={openSettings} className={QUIET_BTN}>open settings</button>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* add cell */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-extralight text-muted-foreground/60">add a cell:</span>
              {CELL_TYPES.map((type) => {
                const Icon = CELL_ICON[type];
                return (
                  <button key={type} onClick={() => void add(type)} className={QUIET_BTN} title={CELL_HINT[type]}>
                    <Icon className="h-3 w-3" /> {type}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-xs text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-extralight text-muted-foreground">pick a notebook, or start one.</p>
            <p className="mt-1 text-[11px] font-extralight text-muted-foreground/60">text renders as markdown, prompt cells are answered by shepherd, code and sql are kept as text. versions are snapshots you keep on purpose.</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {v2 ? (
        <V2Action>{newButton}</V2Action>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/20 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-sm font-light text-foreground">asherin.notebooks</h1>
            <p className="mt-0.5 text-[11px] font-extralight text-muted-foreground">cells of notes, code and questions for shepherd, kept on this device.</p>
          </div>
          {newButton}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {listPane}
        {detailPane}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 p-4 backdrop-blur-sm sm:items-center" onClick={() => setCreating(false)} role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="nb-new-title" className="w-full max-w-md space-y-3 rounded-2xl border border-border/20 bg-card/95 p-5 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 id="nb-new-title" className="text-sm font-light text-foreground">new notebook</h3>
              <button onClick={() => setCreating(false)} className={ICON_BTN} aria-label="close"><X className="h-4 w-4" /></button>
            </div>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="title" className={INPUT} maxLength={LIMITS.title} aria-label="title" onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") setCreating(false); }} autoFocus />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="what it is for (optional)" className={INPUT} maxLength={LIMITS.description} aria-label="description" onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") setCreating(false); }} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className={QUIET_BTN}>cancel</button>
              <button onClick={() => void create()} className={PRIMARY_BTN} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebooksView;
