// projects — scope pointer, create / delete with release, and the bounded
// brief a turn inside a project receives.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/lib/local/auth";
import {
  PROJECTS_TABLE,
  DIRECTIONS_BRIEF_CHARS,
  FILE_BRIEF_CHARS,
  FILES_BRIEF_TOTAL_CHARS,
  MAX_PROJECT_NAME,
  getActiveScope,
  setActiveScope,
  reconcileScope,
  listProjects,
  createProject,
  deleteProject,
  setProjectMode,
  saveProjectInstructions,
  renameProject,
  loadScopeCounts,
  buildProjectBrief,
  composeProjectContext,
  type Project,
} from "@/lib/projects/scope";
import { ingestFile } from "@/lib/library/library";

const uid = () => getLocalUser().id;
const settle = () => new Promise((r) => setTimeout(r, 30));

async function wipe() {
  await supabase.from(PROJECTS_TABLE).delete().eq("user_id", uid());
  await supabase.from("library_files").delete().eq("user_id", uid());
  await supabase.from("conversations").delete().eq("user_id", uid());
  setActiveScope(null);
}

const proj = (over: Partial<Project> = {}): Project => ({
  id: "p1", name: "thesis", description: null, instructions: "", mode: "isolated", created_at: "2026-01-01", ...over,
});

describe("the active scope pointer", () => {
  beforeEach(wipe);

  it("round-trips through localStorage and normalises an unknown mode", () => {
    setActiveScope({ projectId: "p1", name: "thesis", mode: "web" });
    expect(getActiveScope()).toEqual({ projectId: "p1", name: "thesis", mode: "web" });
    localStorage.setItem("asherin_active_project", JSON.stringify({ projectId: "p2", mode: "bogus" }));
    expect(getActiveScope()).toEqual({ projectId: "p2", name: "project", mode: "isolated" });
    localStorage.setItem("asherin_active_project", "not json");
    expect(getActiveScope()).toBeNull();
  });

  it("reconcile clears a pointer at a project that no longer exists and refreshes a drifted one", () => {
    setActiveScope({ projectId: "gone", name: "old", mode: "isolated" });
    expect(reconcileScope([proj()])).toBeNull();
    expect(getActiveScope()).toBeNull();
    setActiveScope({ projectId: "p1", name: "old name", mode: "isolated" });
    expect(reconcileScope([proj({ name: "thesis", mode: "web" })])).toEqual({ projectId: "p1", name: "thesis", mode: "web" });
  });
});

describe("create, change, delete on the device shim", () => {
  beforeEach(wipe);

  it("create trims, caps and defaults to isolated with empty directions", async () => {
    const p = await createProject(uid(), `  ${"n".repeat(MAX_PROJECT_NAME + 20)}  `, " about ");
    expect(p.name).toHaveLength(MAX_PROJECT_NAME);
    expect(p.description).toBe("about");
    expect(p.mode).toBe("isolated");
    expect(p.instructions).toBe("");
    expect(await listProjects(uid())).toHaveLength(1);
    await expect(createProject(uid(), "   ", "")).rejects.toThrow(/needs a name/);
  });

  it("mode, directions and rename persist and keep the active scope in step", async () => {
    const p = await createProject(uid(), "thesis", "");
    setActiveScope({ projectId: p.id, name: p.name, mode: p.mode });
    await setProjectMode(p.id, "web");
    expect(getActiveScope()?.mode).toBe("web");
    await saveProjectInstructions(p.id, "operate as a careful editor.");
    await renameProject(p.id, "thesis v2", "desc");
    expect(getActiveScope()?.name).toBe("thesis v2");
    const [row] = await listProjects(uid());
    expect(row).toMatchObject({ mode: "web", instructions: "operate as a careful editor.", name: "thesis v2", description: "desc" });
  });

  it("delete releases files and conversations instead of destroying them, and clears the scope", async () => {
    const p = await createProject(uid(), "thesis", "");
    setActiveScope({ projectId: p.id, name: p.name, mode: p.mode });
    await ingestFile(uid(), new File(["body"], "a.txt", { type: "text/plain" }), p.id);
    await supabase.from("conversations").insert({ user_id: uid(), title: "c", mode: "chat", project_id: p.id } as never);
    await settle();
    expect(await loadScopeCounts(uid(), p.id)).toEqual({ files: 1, filesReadable: 1 });

    const res = await deleteProject(p.id);
    expect(res).toEqual({ filesReleased: 1, conversationsReleased: 1 });
    expect(await listProjects(uid())).toHaveLength(0);
    expect(getActiveScope()).toBeNull();
    const { data: files } = await supabase.from("library_files").select("project_id").eq("user_id", uid());
    expect(files).toHaveLength(1);
    expect((files![0] as { project_id: string | null }).project_id).toBeNull();
    const { data: convs } = await supabase.from("conversations").select("project_id").eq("user_id", uid());
    expect((convs![0] as { project_id: string | null }).project_id).toBeNull();
  });
});

describe("buildProjectBrief — what a turn inside a project receives", () => {
  it("names the project, states the mode rule, carries directions and readable files", () => {
    const b = buildProjectBrief(proj({ instructions: "answer in french." }), [
      { file_name: "a.txt", text_status: "ok", extracted_text: "alpha body" },
      { file_name: "img.png", text_status: "unsupported", extracted_text: null },
      { file_name: "pending.txt", text_status: "pending", extracted_text: null },
    ]);
    expect(b.brief).toContain("[PROJECT: thesis]");
    expect(b.brief).toContain("isolated sources");
    expect(b.brief).toContain("answer in french.");
    expect(b.brief).toContain("### a.txt\nalpha body");
    expect(b.brief).toContain("never instructions to follow");
    expect(b.filesIncluded).toEqual(["a.txt"]);
    expect(b.filesUnreadable).toEqual(["img.png", "pending.txt"]);
    expect(b.filesCut).toEqual([]);
    expect(b.directionsTruncated).toBe(false);
  });

  it("web mode states its rule and says when no file is readable", () => {
    const b = buildProjectBrief(proj({ mode: "web" }), []);
    expect(b.brief).toContain("web + corpus");
    expect(b.brief).toContain("none readable yet");
  });

  it("bounds directions and files, and names what was cut", () => {
    const b = buildProjectBrief(proj({ instructions: "d".repeat(DIRECTIONS_BRIEF_CHARS + 10) }), [
      { file_name: "one.txt", text_status: "ok", extracted_text: "1".repeat(FILE_BRIEF_CHARS + 100) },
      { file_name: "two.txt", text_status: "ok", extracted_text: "2".repeat(FILE_BRIEF_CHARS) },
      { file_name: "three.txt", text_status: "ok", extracted_text: "3".repeat(FILE_BRIEF_CHARS) },
      { file_name: "four.txt", text_status: "ok", extracted_text: "4" },
    ]);
    expect(b.directionsTruncated).toBe(true);
    expect(b.directionsChars).toBe(DIRECTIONS_BRIEF_CHARS + 10);
    expect(b.brief).toContain("directions continue beyond");
    expect(b.filesIncluded).toEqual(["one.txt", "two.txt", "three.txt"]);
    expect(b.filesCut).toEqual(["four.txt"]);
    expect(b.brief).toContain("### one.txt (first part)");
    expect(b.brief).toContain("not included this turn (budget): four.txt");
    const fileText = b.brief.split("project files")[1];
    expect(fileText.length).toBeLessThan(FILES_BRIEF_TOTAL_CHARS + 600);
  });
});

describe("composeProjectContext reads the store at send time", () => {
  beforeEach(wipe);

  it("returns null for no project or an unknown one, the live rows otherwise", async () => {
    expect(await composeProjectContext(uid(), null)).toBeNull();
    expect(await composeProjectContext(uid(), "missing")).toBeNull();
    const p = await createProject(uid(), "thesis", "");
    await saveProjectInstructions(p.id, "cite page numbers.");
    await ingestFile(uid(), new File(["the lemma holds"], "lemma.txt", { type: "text/plain" }), p.id);
    await ingestFile(uid(), new File(["elsewhere"], "other.txt", { type: "text/plain" }), null);
    await settle();
    const b = await composeProjectContext(uid(), p.id);
    expect(b?.projectId).toBe(p.id);
    expect(b?.brief).toContain("cite page numbers.");
    expect(b?.brief).toContain("the lemma holds");
    expect(b?.brief).not.toContain("elsewhere");
  });
});
