import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  addCell, cellTitle, cloneNotebook, createNotebook, deleteCell, deleteNotebook, describeModelFailure, exportFileName,
  exportMarkdown, listNotebooks, listVersions, loadCells, normalizeCellType, promptContext, renameNotebook, reorderCells,
  restoreVersion, saveVersion, updateCell, type NotebookCell,
} from "../notebookStore";

const owner = "33333333-3333-4333-8333-333333333333";

const cell = (over: Partial<NotebookCell>): NotebookCell => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  notebook_id: "nb",
  cell_type: "text",
  content: "",
  output: null,
  position: 0,
  ...over,
});

describe("notebook cells — pure helpers", () => {
  it("maps the hosted build's cell types onto the four the room keeps", () => {
    expect(normalizeCellType("text")).toBe("text");
    expect(normalizeCellType("prompt")).toBe("prompt");
    expect(normalizeCellType("query")).toBe("sql");
    expect(normalizeCellType("visualization")).toBe("code");
    expect(normalizeCellType("data_source")).toBe("code");
    expect(normalizeCellType(undefined)).toBe("text");
    expect(normalizeCellType("nonsense")).toBe("text");
  });

  it("names a cell by its type and first line, without markdown or comment markers", () => {
    expect(cellTitle({ cell_type: "text", content: "\n\n# Findings so far\nbody" })).toBe("markdown · Findings so far");
    expect(cellTitle({ cell_type: "sql", content: "-- count rows\nselect 1" })).toBe("sql · count rows");
    expect(cellTitle({ cell_type: "prompt", content: "" })).toBe("prompt · untitled cell");
  });

  it("gives shepherd only the cells above the question, answers included, in order", () => {
    const cells = [
      cell({ id: "a", position: 0, cell_type: "text", content: "notes first" }),
      cell({ id: "b", position: 1, cell_type: "prompt", content: "why?", output: "because." }),
      cell({ id: "c", position: 2, cell_type: "code", content: "x = 1" }),
      cell({ id: "d", position: 3, cell_type: "prompt", content: "and now?" }),
      cell({ id: "e", position: 4, cell_type: "text", content: "below — must not appear" }),
    ];
    const ctx = promptContext(cells, cells[3]);
    expect(ctx).toContain("notes first");
    expect(ctx).toContain("question: why?\nanswer: because.");
    expect(ctx).toContain("```code\nx = 1\n```");
    expect(ctx).not.toContain("below");
    expect(ctx.indexOf("notes first")).toBeLessThan(ctx.indexOf("x = 1"));
  });

  it("bounds the context and keeps the end nearest the question", () => {
    const cells = [
      cell({ id: "a", position: 0, content: "A".repeat(500) }),
      cell({ id: "b", position: 1, content: "Z".repeat(500) }),
      cell({ id: "q", position: 2, cell_type: "prompt", content: "?" }),
    ];
    const ctx = promptContext(cells, cells[2], 300);
    expect(ctx.startsWith("…")).toBe(true);
    expect(ctx.length).toBeLessThanOrEqual(302);
    expect(ctx).toContain("Z");
    expect(ctx).not.toContain("A");
  });

  it("exports markdown with questions quoted and code fenced", () => {
    const md = exportMarkdown({ title: "study", description: "a test" }, [
      cell({ position: 1, cell_type: "sql", content: "select 1" }),
      cell({ position: 0, cell_type: "prompt", content: "what\nis this", output: "an answer" }),
    ]);
    expect(md.startsWith("# study\n\na test\n\n> what\n> is this\n\nan answer\n\n```sql\nselect 1\n```")).toBe(true);
    expect(exportFileName("My Study!!", new Date("2026-10-25T10:00:00Z"))).toBe("my-study-2026-10-25.md");
  });

  it("describes a model failure in the room's words", () => {
    expect(describeModelFailure(new DOMException("x", "AbortError"))).toBe("stopped.");
    expect(describeModelFailure(new Error("No saved key for openai. add one in settings → ai keys."))).toBe("no saved key for openai. add one in settings → ai keys.");
    expect(describeModelFailure(new Error("Failed to fetch"))).toMatch(/could not be reached/);
    expect(describeModelFailure(new Error("TypeError: undefined is not a function"))).toBe("shepherd could not answer that one. try again in a moment.");
  });
});

describe("notebook store — on the device", () => {
  it("creates, fills, versions, restores and removes a notebook, with no orphans left", async () => {
    const created = await createNotebook(owner, { title: "  trial  ", description: "d" });
    expect(created.error).toBeNull();
    const nb = created.data!;
    expect(nb.title).toBe("trial");
    expect(nb.version).toBe(1);
    expect(nb.updated_at).toBeTruthy();

    const listed = await listNotebooks(owner);
    expect(listed.data?.map((n) => n.id)).toContain(nb.id);

    const c1 = await addCell(nb.id, "text", 0, "# hello");
    const c2 = await addCell(nb.id, "prompt", 1, "why?");
    const c3 = await addCell(nb.id, "sql", 2);
    expect(c1.error ?? c2.error ?? c3.error).toBeNull();
    expect(c3.data!.content).toMatch(/kept as text/);

    expect((await updateCell(c2.data!.id, { output: "because" })).error).toBeNull();
    expect((await updateCell(c1.data!.id, { content: "# hello again" })).error).toBeNull();
    let cells = (await loadCells(nb.id)).data!;
    expect(cells.map((c) => c.content)).toEqual(["# hello again", "why?", c3.data!.content]);
    expect(cells[1].output).toBe("because");

    const fresh = (await listNotebooks(owner)).data!.find((n) => n.id === nb.id)!;
    const v2 = await saveVersion(fresh, cells, "first keep");
    expect(v2.error).toBeNull();
    expect(v2.data!.version).toBe(2);
    expect((await listNotebooks(owner)).data!.find((n) => n.id === nb.id)!.version).toBe(2);

    // change the notebook after the snapshot
    expect((await deleteCell(c3.data!.id)).error).toBeNull();
    cells = (await loadCells(nb.id)).data!;
    expect(cells).toHaveLength(2);
    const reordered = [cells[1], cells[0]];
    expect((await reorderCells(reordered)).error).toBeNull();
    cells = (await loadCells(nb.id)).data!;
    expect(cells[0].cell_type).toBe("prompt");

    // restore v2: three cells back, and the pre-restore state kept as v3
    const nb2 = (await listNotebooks(owner)).data!.find((n) => n.id === nb.id)!;
    const versions = (await listVersions(nb.id)).data!;
    expect(versions.map((v) => v.version)).toEqual([2]);
    const restored = await restoreVersion(nb2, cells, versions[0]);
    expect(restored.error).toBeNull();
    expect(restored.data!.map((c) => c.cell_type)).toEqual(["text", "prompt", "sql"]);
    const after = (await listVersions(nb.id)).data!;
    expect(after.map((v) => v.version)).toEqual([3, 2]);
    expect(after[0].change_summary).toBe("before restoring v2");
    expect(after[0].snapshot!.cells.map((c) => c.cell_type)).toEqual(["prompt", "text"]);

    expect((await renameNotebook(nb.id, { title: "renamed" })).error).toBeNull();
    expect((await listNotebooks(owner)).data!.find((n) => n.id === nb.id)!.title).toBe("renamed");

    // delete cascades: cells and versions go with the notebook
    expect((await deleteNotebook(nb.id)).error).toBeNull();
    expect((await listNotebooks(owner)).data!.find((n) => n.id === nb.id)).toBeUndefined();
    expect((await supabase.from("notebook_cells").select("id").eq("notebook_id", nb.id)).data).toHaveLength(0);
    expect((await supabase.from("notebook_versions").select("id").eq("notebook_id", nb.id)).data).toHaveLength(0);
  });

  it("clones a notebook with its cells", async () => {
    const nb = (await createNotebook(owner, { title: "source" })).data!;
    await addCell(nb.id, "text", 0, "one");
    await addCell(nb.id, "code", 1, "two");
    const copy = await cloneNotebook(owner, nb);
    expect(copy.error).toBeNull();
    expect(copy.data!.title).toBe("source (copy)");
    const cells = (await loadCells(copy.data!.id)).data!;
    expect(cells.map((c) => c.content)).toEqual(["one", "two"]);
    expect(cells.every((c) => c.notebook_id === copy.data!.id)).toBe(true);
  });

  it("reads rows the hosted build wrote, with legacy cell types normalised", async () => {
    const nb = (await createNotebook(owner, { title: "legacy" })).data!;
    await supabase.from("notebook_cells").insert([
      { notebook_id: nb.id, cell_type: "query", content: "select 1", position: 0, output: '{"kind":"error","text":"kernel offline"}' },
      { notebook_id: nb.id, cell_type: "visualization", content: "{}", position: 1 },
    ]);
    const cells = (await loadCells(nb.id)).data!;
    expect(cells.map((c) => c.cell_type)).toEqual(["sql", "code"]);
  });
});
