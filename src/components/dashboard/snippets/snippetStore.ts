// asherin.snippets — saved code on this device: folders, snippets, search, copy, export.
//
// The pure helpers (tags, filtering, export) are exported so they can be
// tested without a DOM; the reads and writes go through the PostgREST-shaped
// shim to IndexedDB. Folders are flat: the hosted schema had a parent_id but
// the room never drew a tree, so a nested folder was invisible. Deleting a
// folder unfiles its snippets (the shim has no foreign keys to do it).

import { supabase } from "@/integrations/supabase/client";
import { onTableChange } from "@/lib/local/db";

export const FOLDER_TABLE = "code_folders";
export const SNIPPET_TABLE = "code_snippets";

export const LANGUAGES = [
  "plaintext", "javascript", "typescript", "python", "html", "css",
  "json", "bash", "sql", "rust", "go", "java", "c", "cpp", "ruby",
  "php", "swift", "kotlin", "yaml", "markdown", "xml",
] as const;

export const LIMITS = { title: 160, folder: 80, tags: 12, tag: 40, content: 200_000 } as const;

const EXT: Record<string, string> = {
  plaintext: "txt", javascript: "js", typescript: "ts", python: "py", html: "html", css: "css",
  json: "json", bash: "sh", sql: "sql", rust: "rs", go: "go", java: "java", c: "c", cpp: "cpp",
  ruby: "rb", php: "php", swift: "swift", kotlin: "kt", yaml: "yaml", markdown: "md", xml: "xml",
};

export interface CodeFolder {
  id: string;
  name: string;
  created_at: string;
}

export interface CodeSnippet {
  id: string;
  folder_id: string | null;
  title: string;
  language: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface StoreResult<T> {
  data: T | null;
  error: string | null;
}

/* ── pure helpers ───────────────────────────────────────────────────────── */

/** "a, b ,, A" → ["a", "b"]: trimmed, lowercased, deduped, capped. */
export function parseTags(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,\n]/);
  const out: string[] = [];
  for (const p of parts) {
    const t = String(p).trim().toLowerCase().slice(0, LIMITS.tag);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

export function normalizeLanguage(raw: unknown): string {
  const l = String(raw ?? "").toLowerCase().trim();
  return (LANGUAGES as readonly string[]).includes(l) ? l : "plaintext";
}

export function extensionFor(language: string): string {
  return EXT[normalizeLanguage(language)] ?? "txt";
}

export function normalizeSnippet(row: Record<string, unknown>): CodeSnippet {
  const created = typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString();
  return {
    id: String(row.id),
    folder_id: typeof row.folder_id === "string" ? row.folder_id : null,
    title: typeof row.title === "string" && row.title.trim() ? row.title : "untitled",
    language: normalizeLanguage(row.language),
    content: typeof row.content === "string" ? row.content : "",
    tags: Array.isArray(row.tags) ? parseTags(row.tags.map(String)) : [],
    created_at: created,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : created,
  };
}

export function normalizeFolder(row: Record<string, unknown>): CodeFolder {
  return {
    id: String(row.id),
    name: typeof row.name === "string" && row.name.trim() ? row.name : "untitled folder",
    created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
  };
}

/**
 * Search is case-insensitive over title, tags, language and content. With a
 * query the whole store is searched; without one the active folder scopes the
 * list (null = everything). A snippet whose folder no longer exists counts as
 * unfiled so nothing is ever invisible.
 */
export function filterSnippets(
  snippets: CodeSnippet[],
  opts: { search: string; folderId: string | null; folderIds: Set<string> },
): CodeSnippet[] {
  const q = opts.search.trim().toLowerCase();
  if (q) {
    return snippets.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.language.includes(q) ||
      s.tags.some((t) => t.includes(q)) ||
      s.content.toLowerCase().includes(q),
    );
  }
  if (opts.folderId === null) return snippets;
  return snippets.filter((s) => effectiveFolder(s, opts.folderIds) === opts.folderId);
}

/** the folder a snippet is shown under: its own, or none if that folder is gone. */
export function effectiveFolder(s: CodeSnippet, folderIds: Set<string>): string | null {
  return s.folder_id && folderIds.has(s.folder_id) ? s.folder_id : null;
}

export function snippetFileName(s: Pick<CodeSnippet, "title" | "language">): string {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "snippet";
  return `${slug}.${extensionFor(s.language)}`;
}

/** every snippet as one markdown file, grouped by folder. */
export function exportMarkdown(snippets: CodeSnippet[], folders: CodeFolder[]): string {
  const ids = new Set(folders.map((f) => f.id));
  const groups: { name: string; items: CodeSnippet[] }[] = [];
  const unfiled = snippets.filter((s) => effectiveFolder(s, ids) === null);
  if (unfiled.length) groups.push({ name: "unfiled", items: unfiled });
  for (const f of folders) {
    const items = snippets.filter((s) => s.folder_id === f.id);
    if (items.length) groups.push({ name: f.name, items });
  }
  const out: string[] = ["# asherin.snippets", `exported ${new Date().toISOString().slice(0, 10)} · ${snippets.length} ${snippets.length === 1 ? "snippet" : "snippets"}`];
  for (const g of groups) {
    out.push(`## ${g.name}`);
    for (const s of g.items) {
      const fence = s.content.includes("```") ? "````" : "```";
      out.push(`### ${s.title}${s.tags.length ? `\ntags: ${s.tags.join(", ")}` : ""}\n\n${fence}${s.language === "plaintext" ? "" : s.language}\n${s.content}\n${fence}`);
    }
  }
  return out.join("\n\n") + "\n";
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/* ── reads & writes ─────────────────────────────────────────────────────── */

type Rows = Record<string, unknown>[];

export async function loadAll(userId: string): Promise<StoreResult<{ folders: CodeFolder[]; snippets: CodeSnippet[] }>> {
  const [f, s] = await Promise.all([
    supabase.from(FOLDER_TABLE).select("*").eq("user_id", userId).order("created_at"),
    supabase.from(SNIPPET_TABLE).select("*").eq("user_id", userId),
  ]);
  if (f.error) return { data: null, error: f.error.message };
  if (s.error) return { data: null, error: s.error.message };
  const snippets = ((s.data ?? []) as Rows).map(normalizeSnippet);
  snippets.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { data: { folders: ((f.data ?? []) as Rows).map(normalizeFolder), snippets }, error: null };
}

export async function createFolder(userId: string, name: string): Promise<StoreResult<CodeFolder>> {
  const clean = clip(name.trim(), LIMITS.folder);
  if (!clean) return { data: null, error: "give the folder a name." };
  const { data, error } = await supabase.from(FOLDER_TABLE).insert({ user_id: userId, name: clean, parent_id: null }).select().single();
  if (error || !data) return { data: null, error: error?.message ?? "the folder was not written" };
  return { data: normalizeFolder(data as Record<string, unknown>), error: null };
}

export async function renameFolder(id: string, name: string): Promise<StoreResult<true>> {
  const clean = clip(name.trim(), LIMITS.folder);
  if (!clean) return { data: null, error: "give the folder a name." };
  const { error } = await supabase.from(FOLDER_TABLE).update({ name: clean }).eq("id", id);
  return error ? { data: null, error: error.message } : { data: true, error: null };
}

/** remove the folder; its snippets become unfiled, never lost. */
export async function deleteFolder(id: string): Promise<StoreResult<true>> {
  const unfile = await supabase.from(SNIPPET_TABLE).update({ folder_id: null }).eq("folder_id", id);
  if (unfile.error) return { data: null, error: unfile.error.message };
  const { error } = await supabase.from(FOLDER_TABLE).delete().eq("id", id);
  return error ? { data: null, error: error.message } : { data: true, error: null };
}

export async function createSnippet(
  userId: string,
  input: { title: string; language: string; content: string; tags: string | string[]; folder_id: string | null },
): Promise<StoreResult<CodeSnippet>> {
  const title = clip(input.title.trim(), LIMITS.title);
  if (!title) return { data: null, error: "give the snippet a title." };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(SNIPPET_TABLE)
    .insert({
      user_id: userId,
      folder_id: input.folder_id,
      title,
      language: normalizeLanguage(input.language),
      content: clip(input.content, LIMITS.content),
      tags: parseTags(input.tags),
      updated_at: now,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "the snippet was not written" };
  return { data: normalizeSnippet(data as Record<string, unknown>), error: null };
}

export async function updateSnippet(
  id: string,
  patch: Partial<Pick<CodeSnippet, "title" | "language" | "content" | "folder_id">> & { tags?: string | string[] },
): Promise<StoreResult<CodeSnippet>> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = clip(patch.title.trim(), LIMITS.title);
    if (!t) return { data: null, error: "give the snippet a title." };
    values.title = t;
  }
  if (patch.language !== undefined) values.language = normalizeLanguage(patch.language);
  if (patch.content !== undefined) values.content = clip(patch.content, LIMITS.content);
  if (patch.tags !== undefined) values.tags = parseTags(patch.tags);
  if (patch.folder_id !== undefined) values.folder_id = patch.folder_id;
  const { data, error } = await supabase.from(SNIPPET_TABLE).update(values).eq("id", id).select();
  if (error) return { data: null, error: error.message };
  const row = (data as Rows | null)?.[0];
  if (!row) return { data: null, error: "that snippet is no longer here." };
  return { data: normalizeSnippet(row), error: null };
}

export async function deleteSnippet(id: string): Promise<StoreResult<true>> {
  const { error } = await supabase.from(SNIPPET_TABLE).delete().eq("id", id);
  if (error) return { data: null, error: error.message };
  const still = await supabase.from(SNIPPET_TABLE).select("id").eq("id", id);
  if ((still.data ?? []).length > 0) return { data: null, error: "that snippet is still here — try again." };
  return { data: true, error: null };
}

/** fires when another surface (the artifact runtime's "save as snippets") writes here. */
export function onSnippetsChange(cb: () => void): () => void {
  const offs = [onTableChange(SNIPPET_TABLE, cb), onTableChange(FOLDER_TABLE, cb)];
  return () => offs.forEach((off) => off());
}

/** copy with a fallback for contexts where the async clipboard is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
