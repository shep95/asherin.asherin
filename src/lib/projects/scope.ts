// Project scope — one workspace that binds Memory, Library, briefings and pins.
//
// A project is a scope, not a folder. When a project is active the chat is told
// which corpus it may ground on, and in isolated mode it must refuse anything
// the corpus does not support. Scope is per-user and read from the database on
// every use, so a stale localStorage id can never widen access to another
// user's project.

import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";

export type ProjectMode = "isolated" | "web";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  /** Standing directions applied to every conversation inside this project. */
  instructions: string;
  mode: ProjectMode;
  created_at: string;
}

/** Standing directions are unlimited — no client or server length cap. */
export const MAX_PROJECT_INSTRUCTIONS = null;

export interface ProjectScope {
  projectId: string;
  name: string;
  mode: ProjectMode;
}

const KEY = "asherin_active_project";
const EVENT = "asherin:project-scope";

export function getActiveScope(): ProjectScope | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.projectId || typeof parsed.projectId !== "string") return null;
    return {
      projectId: parsed.projectId,
      name: String(parsed.name ?? "Project"),
      mode: parsed.mode === "web" ? "web" : "isolated",
    };
  } catch {
    return null;
  }
}

export function setActiveScope(scope: ProjectScope | null): void {
  try {
    if (scope) localStorage.setItem(KEY, JSON.stringify(scope));
    else localStorage.removeItem(KEY);
  } catch { /* private mode — scope stays in-memory for this view only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: scope }));
  void emitPull({
    organ: "chat", capability: "project-scope", fromSurface: "projects",
    status: scope ? "ok" : "skip",
    quote: scope?.name ?? "scope cleared",
    meta: { project_id: scope?.projectId ?? "", mode: scope?.mode ?? "off" },
  });
}

export function onScopeChange(fn: (s: ProjectScope | null) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent).detail ?? null);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

const PROJECT_COLS = "id,name,description,instructions,mode,created_at";

export async function listProjects(userId: string): Promise<Project[]> {
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Project[]).map((p) => ({ ...p, instructions: p.instructions ?? "" }));
}

export async function setProjectMode(projectId: string, mode: ProjectMode): Promise<void> {
  await supabase.from("projects").update({ mode } as never).eq("id", projectId);
  const active = getActiveScope();
  if (active?.projectId === projectId) setActiveScope({ ...active, mode });
}

/**
 * Standing directions for a project. Stored server-side and read back under the
 * caller's own session on every turn — the client never ships the text into the
 * model, so a tampered local copy cannot change how a project behaves.
 */
export async function saveProjectInstructions(projectId: string, instructions: string): Promise<void> {
  const trimmed = instructions;
  const { error } = await supabase
    .from("projects")
    .update({ instructions: trimmed } as never)
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  void emitPull({
    organ: "chat", capability: "project-directions", fromSurface: "projects", status: "ok",
    meta: { project_id: projectId, chars: trimmed.length },
  });
}

export async function renameProject(projectId: string, name: string, description: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ name: name.trim(), description: description.trim() } as never)
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  const active = getActiveScope();
  if (active?.projectId === projectId) setActiveScope({ ...active, name: name.trim() });
}

export interface ScopeCounts {
  files: number;
  filesReadable: number;
  memories: number;
}

/** Counts are read with the caller's own session — RLS keeps them owner-only. */
export async function loadScopeCounts(userId: string, projectId: string): Promise<ScopeCounts> {
  const [files, readable, mem] = await Promise.all([
    supabase.from("library_files").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("project_id", projectId),
    supabase.from("library_files").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("project_id", projectId).eq("text_status", "ok"),
    // The vault is account-wide, not per project — it follows the operator
    // across every workspace, so this count is not project-filtered.
    supabase.from("organism_vault").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("enabled", true),
  ]);
  return {
    files: files.count ?? 0,
    filesReadable: readable.count ?? 0,
    memories: mem.count ?? 0,
  };
}
