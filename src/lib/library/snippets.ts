// one home for saved code.
//
// The artifact runtime and the snippets room used to keep code in two separate
// places. They now write to the same owner-scoped store, so anything an
// artifact produced can be found where every other saved snippet lives.

import { supabase } from "@/integrations/supabase/client";

export interface SavableFile {
  path: string;
  content: string;
  language?: string;
}

const EXT_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  html: "html",
  css: "css",
  json: "json",
  sh: "bash",
  sql: "sql",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  xml: "xml",
};

export function languageOf(file: SavableFile): string {
  if (file.language) return file.language;
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANGUAGE[ext] ?? "plaintext";
}

export interface SaveResult {
  saved: number;
  error?: string;
}

/**
 * Store artifact files as snippets. Nothing is written for a signed-out
 * session, and empty files are skipped rather than saved as blanks.
 */
export async function saveFilesAsSnippets(
  files: SavableFile[],
  opts: { title: string; tags?: string[] } = { title: "artifact" },
): Promise<SaveResult> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user?.id;
  if (!user) return { saved: 0, error: "sign in to save code" };

  const rows = files
    .filter((f) => f.content.trim().length > 0)
    .slice(0, 40)
    .map((f) => ({
      user_id: user,
      folder_id: null as string | null,
      title: `${opts.title.slice(0, 60)} · ${f.path}`.slice(0, 160),
      language: languageOf(f),
      content: f.content,
      tags: Array.from(new Set(["artifact", ...(opts.tags ?? [])])).slice(0, 8),
    }));

  if (!rows.length) return { saved: 0, error: "nothing in these files to save" };

  const { error } = await supabase.from("code_snippets").insert(rows);
  if (error) return { saved: 0, error: error.message };
  return { saved: rows.length };
}
