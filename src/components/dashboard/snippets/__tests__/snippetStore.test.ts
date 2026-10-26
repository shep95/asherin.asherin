import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  createFolder, createSnippet, deleteFolder, deleteSnippet, effectiveFolder, exportMarkdown, extensionFor, filterSnippets,
  loadAll, normalizeLanguage, parseTags, renameFolder, snippetFileName, updateSnippet, type CodeSnippet,
} from "../snippetStore";

const uid = "44444444-4444-4444-8444-444444444444";

const snip = (over: Partial<CodeSnippet>): CodeSnippet => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  folder_id: null,
  title: "t",
  language: "plaintext",
  content: "",
  tags: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("snippets — pure helpers", () => {
  it("parses tags: trimmed, lowercased, deduped, capped", () => {
    expect(parseTags(" React, hooks ,, react\nutil ")).toEqual(["react", "hooks", "util"]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
    expect(parseTags("")).toEqual([]);
  });

  it("knows its languages and their file extensions", () => {
    expect(normalizeLanguage("TypeScript")).toBe("typescript");
    expect(normalizeLanguage("brainfuck")).toBe("plaintext");
    expect(extensionFor("python")).toBe("py");
    expect(extensionFor("nope")).toBe("txt");
    expect(snippetFileName({ title: "Fetch With Retry!", language: "typescript" })).toBe("fetch-with-retry.ts");
  });

  it("searches title, tags, language and code; scopes by folder otherwise; never hides an orphan", () => {
    const folders = new Set(["f1"]);
    const rows = [
      snip({ id: "a", title: "debounce", language: "javascript", content: "function debounce(fn)", tags: ["util"] }),
      snip({ id: "b", title: "query", language: "sql", content: "select count(*) from t", folder_id: "f1" }),
      snip({ id: "c", title: "ghost", folder_id: "gone-folder", content: "orphan" }),
    ];
    const ids = (xs: CodeSnippet[]) => xs.map((s) => s.id);
    expect(ids(filterSnippets(rows, { search: "COUNT", folderId: null, folderIds: folders }))).toEqual(["b"]);
    expect(ids(filterSnippets(rows, { search: "util", folderId: "f1", folderIds: folders }))).toEqual(["a"]);
    expect(ids(filterSnippets(rows, { search: "sql", folderId: null, folderIds: folders }))).toEqual(["b"]);
    expect(ids(filterSnippets(rows, { search: "", folderId: "f1", folderIds: folders }))).toEqual(["b"]);
    expect(ids(filterSnippets(rows, { search: "", folderId: null, folderIds: folders }))).toEqual(["a", "b", "c"]);
    expect(effectiveFolder(rows[2], folders)).toBeNull();
  });

  it("exports every snippet grouped by folder, fencing code that contains fences", () => {
    const md = exportMarkdown(
      [
        snip({ title: "loose", language: "bash", content: "echo hi" }),
        snip({ title: "in f", folder_id: "f1", language: "markdown", content: "```js\nx\n```", tags: ["docs"] }),
      ],
      [{ id: "f1", name: "docs", created_at: "" }],
    );
    expect(md).toContain("## unfiled\n\n### loose\n\n```bash\necho hi\n```");
    expect(md).toContain("## docs\n\n### in f\ntags: docs\n\n````markdown\n```js\nx\n```\n````");
  });
});

describe("snippets store — on the device", () => {
  it("folders and snippets: create, edit, move, unfile on folder delete, delete proven", async () => {
    const f = await createFolder(uid, "  utils ");
    expect(f.error).toBeNull();
    expect(f.data!.name).toBe("utils");
    expect((await createFolder(uid, "   ")).error).toBe("give the folder a name.");

    const s = await createSnippet(uid, { title: "debounce", language: "JavaScript", content: "fn", tags: "Util, util", folder_id: f.data!.id });
    expect(s.error).toBeNull();
    expect(s.data!.language).toBe("javascript");
    expect(s.data!.tags).toEqual(["util"]);
    expect(s.data!.updated_at).toBeTruthy();
    expect(Number.isNaN(new Date(s.data!.updated_at).getTime())).toBe(false);
    expect((await createSnippet(uid, { title: " ", language: "sql", content: "", tags: "", folder_id: null })).error).toBe("give the snippet a title.");

    await new Promise((r) => setTimeout(r, 5));
    const upd = await updateSnippet(s.data!.id, { content: "fn2", tags: "a,b" });
    expect(upd.error).toBeNull();
    expect(upd.data!.content).toBe("fn2");
    expect(upd.data!.tags).toEqual(["a", "b"]);
    expect(upd.data!.updated_at > s.data!.updated_at).toBe(true);

    expect((await renameFolder(f.data!.id, "helpers")).error).toBeNull();
    let all = (await loadAll(uid)).data!;
    expect(all.folders.find((x) => x.id === f.data!.id)!.name).toBe("helpers");
    expect(all.snippets.find((x) => x.id === s.data!.id)!.folder_id).toBe(f.data!.id);

    expect((await deleteFolder(f.data!.id)).error).toBeNull();
    all = (await loadAll(uid)).data!;
    expect(all.folders.find((x) => x.id === f.data!.id)).toBeUndefined();
    expect(all.snippets.find((x) => x.id === s.data!.id)!.folder_id).toBeNull();

    expect((await deleteSnippet(s.data!.id)).error).toBeNull();
    expect((await supabase.from("code_snippets").select("id").eq("id", s.data!.id)).data).toHaveLength(0);
  });

  it("lists newest-updated first and tolerates rows written without updated_at", async () => {
    await supabase.from("code_snippets").insert({ user_id: uid, title: "old", language: "python", content: "x", tags: ["z"], folder_id: null, created_at: "2020-01-01T00:00:00.000Z" });
    const fresh = await createSnippet(uid, { title: "new", language: "go", content: "y", tags: [], folder_id: null });
    const all = (await loadAll(uid)).data!;
    const old = all.snippets.find((s) => s.title === "old")!;
    expect(old.updated_at).toBe("2020-01-01T00:00:00.000Z");
    expect(all.snippets.findIndex((s) => s.id === fresh.data!.id)).toBeLessThan(all.snippets.findIndex((s) => s.id === old.id));
  });
});
