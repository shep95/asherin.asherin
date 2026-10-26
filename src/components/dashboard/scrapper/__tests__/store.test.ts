import "./blobPolyfill";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET, FILES, SESSIONS, addFile, createSession, deleteFile, deleteSession, getFile, listFiles, listSessions, loadBlob,
  markExtracting, normaliseStatus, recomputeTotals, renameSession, saveExtraction,
} from "../store";
import type { ExtractResult } from "../extract";

const uid = "33333333-3333-4333-8333-333333333333";

const done = (text: string): ExtractResult => ({
  status: "completed", text, method: "plain text", truncated: false, pages: 0, ocrPages: 0, error: null,
});

async function wipe() {
  await supabase.from(FILES).delete().eq("user_id", uid);
  await supabase.from(SESSIONS).delete().eq("user_id", uid);
}

describe("asherin.extract store", () => {
  beforeEach(wipe);

  it("creates, lists newest-first, renames and deletes a session", async () => {
    const a = await createSession(uid, "session 1");
    const b = await createSession(uid, "session 2");
    expect(a.session?.total_files).toBe(0);
    expect(a.session?.updated_at).toBeTruthy();
    await renameSession(a.session!.id, "renamed");
    const { sessions } = await listSessions(uid);
    expect(sessions.map((s) => s.name)).toEqual(["renamed", "session 2"]);
    expect(await deleteSession(b.session!.id)).toEqual({ removedFiles: 0, error: null });
    expect((await listSessions(uid)).sessions).toHaveLength(1);
  });

  it("stores the bytes under a random path and the original name on the row", async () => {
    const { session } = await createSession(uid, "s");
    const file = new File(["hello"], "my notes (final).txt", { type: "text/plain" });
    const { file: row, error } = await addFile(uid, session!.id, file);
    expect(error).toBeNull();
    expect(row?.status).toBe("queued");
    expect(row?.file_name).toBe("my notes (final).txt");
    expect(row?.storage_path).toMatch(new RegExp(`^${uid}/${session!.id}/[0-9a-f-]{36}$`));
    // fake-indexeddb cannot structured-clone a jsdom Blob, so the bytes
    // themselves only round-trip in a browser; here the record and the name do.
    const back = await loadBlob(row!);
    expect(back?.name).toBe("my notes (final).txt");
    expect(back?.type).toBe("text/plain");
    expect(await getFile(row!.id)).toMatchObject({ id: row!.id, status: "queued" });
  });

  it("gives an unsupported kind a row and a reason but no blob", async () => {
    const { session } = await createSession(uid, "s");
    const { file: row } = await addFile(uid, session!.id, new File(["mp4"], "clip.mp4", { type: "video/mp4" }), { unsupported: "audio and video carry no text layer" });
    expect(row?.status).toBe("unsupported");
    expect(row?.error).toBe("audio and video carry no text layer");
    expect(row?.storage_path).toBe("");
    expect(await loadBlob(row!)).toBeNull();
    const { data: keys } = await supabase.storage.from(BUCKET).list(`${uid}/${session!.id}`);
    expect(keys).toHaveLength(0);
    expect(await deleteFile(row!)).toBeNull();
  });

  it("saves a pass onto the row and keeps the session totals current", async () => {
    const { session } = await createSession(uid, "s");
    const { file: a } = await addFile(uid, session!.id, new File(["aaaa"], "a.txt", { type: "text/plain" }));
    const { file: b } = await addFile(uid, session!.id, new File(["bb"], "b.txt", { type: "text/plain" }));
    await markExtracting(a!.id);
    expect((await getFile(a!.id))?.status).toBe("extracting");
    const saved = await saveExtraction(a!.id, done("four"));
    expect(saved).toMatchObject({ status: "completed", extracted_text: "four", text_chars: 4, method: "plain text" });
    await saveExtraction(b!.id, { ...done(""), status: "empty", error: "the file holds no text" });
    const totals = await recomputeTotals(session!.id);
    expect(totals).toMatchObject({ total_files: 2, total_text_length: 4 });
    const { files } = await listFiles(session!.id);
    expect(files.map((f) => f.status)).toEqual(["completed", "empty"]);
    expect(files[1].extracted_text).toBeNull();
  });

  it("deleting a session removes its blobs and its file rows too (no cascade in the local store)", async () => {
    const { session } = await createSession(uid, "s");
    const { file: row } = await addFile(uid, session!.id, new File(["x"], "x.txt", { type: "text/plain" }));
    expect(await deleteSession(session!.id)).toEqual({ removedFiles: 1, error: null });
    expect((await listFiles(session!.id)).files).toHaveLength(0);
    expect(await getFile(row!.id)).toBeNull();
    expect((await supabase.storage.from(BUCKET).download(row!.storage_path)).data).toBeNull();
  });

  it("reads hosted-era statuses as this edition's", () => {
    expect(normaliseStatus("uploaded")).toBe("queued");
    expect(normaliseStatus(undefined)).toBe("queued");
    expect(normaliseStatus("extracting")).toBe("extracting");
    expect(normaliseStatus("completed")).toBe("completed");
    expect(normaliseStatus("failed")).toBe("failed");
  });
});
