// asherin.notebooks — the room's logic and its reads and writes, apart from the view.
//
// A notebook is an ordered list of cells kept on this device: text (markdown),
// prompt (a question shepherd answers in place), code and sql (both kept as
// text — no engine ships in this build). Versions are snapshots of the cells,
// saved on request and restorable. Nothing here schedules, shares or runs on
// a server; every function below reads or writes the device store through the
// PostgREST-shaped shim, and the pure helpers are exported so they can be
// tested without a DOM.

import { supabase } from "@/integrations/supabase/client";
import { onTableChange } from "@/lib/local/db";

export const NOTEBOOK_TABLE = "notebooks";
export const CELL_TABLE = "notebook_cells";
export const VERSION_TABLE = "notebook_versions";

export type CellType = "text" | "prompt" | "code" | "sql";

export const CELL_TYPES: CellType[] = ["text", "prompt", "code", "sql"];

export const LIMITS = {
  title: 120,
  description: 240,
  cellContent: 60_000,
  summary: 160,
  /** how much of the notebook travels with a prompt cell's question. */
  promptContext: 12_000,
  versionsShown: 50,
} as const;

export interface Notebook {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  version: number;
  tags: string[];
  created_at: string;
  updated_at: string | null;
}

export interface NotebookCell {
  id: string;
  notebook_id: string;
  cell_type: CellType;
  content: string;
  output: string | null;
  position: number;
  created_at?: string;
}

export interface NotebookVersion {
  id: string;
  notebook_id: string;
  version: number;
  change_summary: string;
  created_at: string;
  snapshot: { cells: SnapshotCell[] } | null;
}

export interface SnapshotCell {
  cell_type: CellType;
  content: string;
  output: string | null;
  position: number;
}

export interface StoreResult<T> {
  data: T | null;
  error: string | null;
}

/* ── pure helpers ───────────────────────────────────────────────────────── */

/**
 * Rows written by the hosted build used other cell types. A `query` cell was
 * sql; `visualization` and `data_source` cells held json or a binding and are
 * kept as code (text). Anything unknown is text so nothing is ever dropped.
 */
export function normalizeCellType(raw: unknown): CellType {
  const t = String(raw ?? "").toLowerCase();
  if (t === "text" || t === "prompt" || t === "code" || t === "sql") return t;
  if (t === "query") return "sql";
  if (t === "visualization" || t === "data_source") return "code";
  return "text";
}

export function normalizeCell(row: Record<string, unknown>): NotebookCell {
  return {
    id: String(row.id),
    notebook_id: String(row.notebook_id),
    cell_type: normalizeCellType(row.cell_type),
    content: typeof row.content === "string" ? row.content : "",
    output: typeof row.output === "string" ? row.output : null,
    position: typeof row.position === "number" ? row.position : Number(row.position ?? 0) || 0,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}

export function normalizeNotebook(row: Record<string, unknown>): Notebook {
  return {
    id: String(row.id),
    title: typeof row.title === "string" && row.title.trim() ? row.title : "untitled notebook",
    description: typeof row.description === "string" ? row.description : "",
    owner_id: String(row.owner_id ?? row.user_id ?? ""),
    version: typeof row.version === "number" ? row.version : Number(row.version ?? 1) || 1,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/** the label shown in a cell header. */
export function cellLabel(type: CellType): string {
  return type === "text" ? "markdown" : type;
}

/** a one-line name for a cell: type · first non-empty line, trimmed of markdown/comment markers. */
export function cellTitle(cell: Pick<NotebookCell, "cell_type" | "content">): string {
  const firstLine = (cell.content ?? "").split("\n").find((l) => l.trim()) ?? "";
  const clean = firstLine.replace(/^[-#/*\s>]+/, "").trim().slice(0, 60);
  return `${cellLabel(cell.cell_type)} · ${clean || "untitled cell"}`;
}

export function defaultContentFor(type: CellType): string {
  switch (type) {
    case "text": return "";
    case "prompt": return "";
    case "code": return "";
    case "sql": return "-- kept as text: nothing runs here\nselect * from data limit 25;";
  }
}

export function snapshotOf(cells: NotebookCell[]): { cells: SnapshotCell[] } {
  return {
    cells: [...cells]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ cell_type: c.cell_type, content: c.content, output: c.output, position: c.position })),
  };
}

/**
 * What shepherd sees besides the question: the cells above the prompt cell,
 * in order, bounded. Prompt cells contribute their question and their answer
 * so a later question can build on an earlier one.
 */
export function promptContext(cells: NotebookCell[], upTo: NotebookCell, limit: number = LIMITS.promptContext): string {
  const ordered = [...cells].sort((a, b) => a.position - b.position);
  const idx = ordered.findIndex((c) => c.id === upTo.id);
  const before = idx < 0 ? ordered.filter((c) => c.position < upTo.position) : ordered.slice(0, idx);
  const parts: string[] = [];
  for (const c of before) {
    const body = (c.content ?? "").trim();
    if (!body && !c.output?.trim()) continue;
    if (c.cell_type === "prompt") {
      parts.push(`question: ${body}${c.output?.trim() ? `\nanswer: ${c.output.trim()}` : ""}`);
    } else if (c.cell_type === "text") {
      parts.push(body);
    } else {
      parts.push(`\`\`\`${c.cell_type}\n${body}\n\`\`\``);
    }
  }
  const joined = parts.join("\n\n");
  if (joined.length <= limit) return joined;
  // keep the end: the cells nearest the question matter most.
  return `…\n${joined.slice(joined.length - limit)}`;
}

/** the markdown file a notebook exports to. */
export function exportMarkdown(nb: Pick<Notebook, "title" | "description">, cells: NotebookCell[]): string {
  const out: string[] = [`# ${nb.title}`];
  if (nb.description.trim()) out.push(nb.description.trim());
  for (const c of [...cells].sort((a, b) => a.position - b.position)) {
    const body = (c.content ?? "").trimEnd();
    if (c.cell_type === "text") out.push(body);
    else if (c.cell_type === "prompt") {
      out.push(`> ${body.split("\n").join("\n> ")}`);
      if (c.output?.trim()) out.push(c.output.trim());
    } else out.push(`\`\`\`${c.cell_type}\n${body}\n\`\`\``);
  }
  return out.filter((s) => s.trim()).join("\n\n") + "\n";
}

export function exportFileName(title: string, at = new Date()): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "notebook";
  return `${slug}-${at.toISOString().slice(0, 10)}.md`;
}

/** a model failure in the room's own words, never a raw stack. */
export function describeModelFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/abort/i.test(msg)) return "stopped.";
  if (/key|vault|settings|switched off/i.test(msg)) return msg.toLowerCase();
  if (/network|fetch|failed to|reached/i.test(msg)) return "the model could not be reached from this device. check the connection and try again.";
  if (/busy|rate/i.test(msg)) return "the model provider is busy right now. ask again in a moment.";
  return "shepherd could not answer that one. try again in a moment.";
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/* ── reads & writes (device store through the shim) ─────────────────────── */

type Rows = Record<string, unknown>[];

export async function listNotebooks(ownerId: string): Promise<StoreResult<Notebook[]>> {
  const { data, error } = await supabase.from(NOTEBOOK_TABLE).select("*").eq("owner_id", ownerId);
  if (error) return { data: null, error: error.message };
  const rows = ((data ?? []) as Rows).map(normalizeNotebook);
  rows.sort((a, b) => String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at)));
  return { data: rows, error: null };
}

export async function createNotebook(ownerId: string, input: { title: string; description?: string }): Promise<StoreResult<Notebook>> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(NOTEBOOK_TABLE)
    .insert({
      title: clip(input.title.trim(), LIMITS.title) || "untitled notebook",
      description: clip((input.description ?? "").trim(), LIMITS.description),
      owner_id: ownerId,
      version: 1,
      tags: [],
      updated_at: now,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "the notebook was not written" };
  return { data: normalizeNotebook(data as Record<string, unknown>), error: null };
}

export async function renameNotebook(id: string, patch: { title?: string; description?: string }): Promise<StoreResult<true>> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) values.title = clip(patch.title.trim(), LIMITS.title) || "untitled notebook";
  if (patch.description !== undefined) values.description = clip(patch.description.trim(), LIMITS.description);
  const { error } = await supabase.from(NOTEBOOK_TABLE).update(values).eq("id", id);
  return error ? { data: null, error: error.message } : { data: true, error: null };
}

async function touch(notebookId: string): Promise<void> {
  await supabase.from(NOTEBOOK_TABLE).update({ updated_at: new Date().toISOString() }).eq("id", notebookId);
}

export async function loadCells(notebookId: string): Promise<StoreResult<NotebookCell[]>> {
  const { data, error } = await supabase.from(CELL_TABLE).select("*").eq("notebook_id", notebookId).order("position", { ascending: true });
  if (error) return { data: null, error: error.message };
  return { data: ((data ?? []) as Rows).map(normalizeCell), error: null };
}

export async function addCell(notebookId: string, type: CellType, position: number, content = defaultContentFor(type)): Promise<StoreResult<NotebookCell>> {
  const { data, error } = await supabase
    .from(CELL_TABLE)
    .insert({ notebook_id: notebookId, cell_type: type, content: clip(content, LIMITS.cellContent), output: null, position })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "the cell was not written" };
  await touch(notebookId);
  return { data: normalizeCell(data as Record<string, unknown>), error: null };
}

export async function updateCell(cellId: string, patch: { content?: string; output?: string | null; cell_type?: CellType }): Promise<StoreResult<true>> {
  const values: Record<string, unknown> = {};
  if (patch.content !== undefined) values.content = clip(patch.content, LIMITS.cellContent);
  if (patch.output !== undefined) values.output = patch.output === null ? null : clip(patch.output, LIMITS.cellContent);
  if (patch.cell_type !== undefined) values.cell_type = patch.cell_type;
  const { data, error } = await supabase.from(CELL_TABLE).update(values).eq("id", cellId).select("notebook_id");
  if (error) return { data: null, error: error.message };
  const nbId = (data as Rows | null)?.[0]?.notebook_id;
  if (typeof nbId === "string") await touch(nbId);
  return { data: true, error: null };
}

export async function deleteCell(cellId: string): Promise<StoreResult<true>> {
  const { data, error } = await supabase.from(CELL_TABLE).delete().eq("id", cellId).select("notebook_id");
  if (error) return { data: null, error: error.message };
  const nbId = (data as Rows | null)?.[0]?.notebook_id;
  if (typeof nbId === "string") await touch(nbId);
  return { data: true, error: null };
}

/** rewrite positions 0..n-1 in the given order. */
export async function reorderCells(cells: NotebookCell[]): Promise<StoreResult<true>> {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].position === i) continue;
    const { error } = await supabase.from(CELL_TABLE).update({ position: i }).eq("id", cells[i].id);
    if (error) return { data: null, error: error.message };
  }
  return { data: true, error: null };
}

/** a notebook and everything that belongs to it; the shim has no cascade. */
export async function deleteNotebook(id: string): Promise<StoreResult<true>> {
  const cells = await supabase.from(CELL_TABLE).delete().eq("notebook_id", id);
  if (cells.error) return { data: null, error: cells.error.message };
  const versions = await supabase.from(VERSION_TABLE).delete().eq("notebook_id", id);
  if (versions.error) return { data: null, error: versions.error.message };
  const nb = await supabase.from(NOTEBOOK_TABLE).delete().eq("id", id);
  if (nb.error) return { data: null, error: nb.error.message };
  const still = await supabase.from(NOTEBOOK_TABLE).select("id").eq("id", id);
  if ((still.data ?? []).length > 0) return { data: null, error: "that notebook is still here — try again." };
  return { data: true, error: null };
}

export async function cloneNotebook(ownerId: string, source: Notebook): Promise<StoreResult<Notebook>> {
  const created = await createNotebook(ownerId, { title: `${source.title} (copy)`, description: source.description });
  if (!created.data) return created;
  const cells = await loadCells(source.id);
  if (cells.error) return { data: null, error: cells.error };
  for (const c of cells.data ?? []) {
    const { error } = await supabase.from(CELL_TABLE).insert({ notebook_id: created.data.id, cell_type: c.cell_type, content: c.content, output: c.output, position: c.position });
    if (error) return { data: null, error: error.message };
  }
  return created;
}

export async function listVersions(notebookId: string): Promise<StoreResult<NotebookVersion[]>> {
  const { data, error } = await supabase.from(VERSION_TABLE).select("*").eq("notebook_id", notebookId).order("version", { ascending: false }).limit(LIMITS.versionsShown);
  if (error) return { data: null, error: error.message };
  const rows = ((data ?? []) as Rows).map((r) => {
    const snap = r.snapshot as { cells?: unknown } | null | undefined;
    const cells = Array.isArray(snap?.cells)
      ? (snap!.cells as Record<string, unknown>[]).map((c, i) => ({
          cell_type: normalizeCellType(c.cell_type),
          content: typeof c.content === "string" ? c.content : "",
          output: typeof c.output === "string" ? c.output : null,
          position: typeof c.position === "number" ? c.position : i,
        }))
      : null;
    return {
      id: String(r.id),
      notebook_id: String(r.notebook_id),
      version: Number(r.version ?? 0) || 0,
      change_summary: typeof r.change_summary === "string" ? r.change_summary : "",
      created_at: typeof r.created_at === "string" ? r.created_at : new Date(0).toISOString(),
      snapshot: cells ? { cells } : null,
    } satisfies NotebookVersion;
  });
  return { data: rows, error: null };
}

/** snapshot the cells as the next version of the notebook. */
export async function saveVersion(nb: Notebook, cells: NotebookCell[], summary: string): Promise<StoreResult<NotebookVersion>> {
  const version = nb.version + 1;
  const { data, error } = await supabase
    .from(VERSION_TABLE)
    .insert({
      notebook_id: nb.id,
      version,
      changed_by: nb.owner_id,
      change_summary: clip(summary.trim(), LIMITS.summary) || `version ${version}`,
      snapshot: snapshotOf(cells),
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "the version was not written" };
  const bump = await supabase.from(NOTEBOOK_TABLE).update({ version, updated_at: new Date().toISOString() }).eq("id", nb.id);
  if (bump.error) return { data: null, error: bump.error.message };
  const row = data as Record<string, unknown>;
  return {
    data: {
      id: String(row.id),
      notebook_id: nb.id,
      version,
      change_summary: String(row.change_summary ?? ""),
      created_at: String(row.created_at ?? new Date().toISOString()),
      snapshot: snapshotOf(cells),
    },
    error: null,
  };
}

/**
 * Replace the cells with a version's snapshot. The current cells are saved as
 * a version first so a restore is itself reversible.
 */
export async function restoreVersion(nb: Notebook, current: NotebookCell[], target: NotebookVersion): Promise<StoreResult<NotebookCell[]>> {
  if (!target.snapshot) return { data: null, error: "this version has no snapshot to restore." };
  const keep = await saveVersion(nb, current, `before restoring v${target.version}`);
  if (keep.error) return { data: null, error: keep.error };
  const wipe = await supabase.from(CELL_TABLE).delete().eq("notebook_id", nb.id);
  if (wipe.error) return { data: null, error: wipe.error.message };
  for (const c of target.snapshot.cells) {
    const { error } = await supabase.from(CELL_TABLE).insert({ notebook_id: nb.id, cell_type: c.cell_type, content: c.content, output: c.output, position: c.position });
    if (error) return { data: null, error: error.message };
  }
  return loadCells(nb.id);
}

/** fires when another room (briefing's "notebook" button) writes a notebook. */
export function onNotebooksChange(cb: () => void): () => void {
  return onTableChange(NOTEBOOK_TABLE, cb);
}
