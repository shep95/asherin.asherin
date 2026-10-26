// library — bounded on-device extraction, masking, ranked content search, and
// the add → read → find → assign → delete loop against the real shim.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/lib/local/auth";
import {
  LIBRARY_TABLE,
  LIBRARY_BUCKET,
  MAX_TEXT_CHARS,
  MAX_TEXT_BYTES,
  MAX_PDF_BYTES,
  TEXT_STATUS_LABEL,
  maskCredentials,
  readFileText,
  extractionKind,
  searchTerms,
  snippetFor,
  ingestFile,
  listLibrary,
  searchLibrary,
  assignProject,
  deleteLibraryFile,
  openLibraryFile,
  retryExtract,
  resumePendingExtraction,
  type LibraryFile,
} from "@/lib/library/library";

const uid = () => getLocalUser().id;

// jsdom has no object urls; the browser does. the preview revokes what it creates.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => `blob:test/${Math.random()}`;
  URL.revokeObjectURL = () => {};
}

const textFile = (name: string, body: string, type = "text/plain") => new File([body], name, { type });

/** a File whose reported size is `size` without allocating it. */
const hugeFile = (name: string, type: string, size: number) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const settle = () => new Promise((r) => setTimeout(r, 30));

async function wipe() {
  await supabase.from(LIBRARY_TABLE).delete().eq("user_id", uid());
}

describe("maskCredentials", () => {
  it("masks keys, bearer tokens, jwts and private keys before indexing", () => {
    const raw = [
      "key sk-abcdefghijklmnopqrstuvwxyz1234",
      "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      "password = hunter2hunter2",
      "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      "AKIA_ABCDEFGHIJKLMNOPQRST",
    ].join("\n");
    const out = maskCredentials(raw);
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(out).not.toContain("hunter2hunter2");
    expect(out).not.toContain("MIIE");
    expect(out).not.toContain("AKIA_ABCDEFGHIJKLMNOPQRST");
    expect(out).toContain("[masked key]");
    expect(out).toContain("[masked private key]");
    expect(out).toMatch(/password: \[masked\]/);
  });

  it("leaves ordinary prose alone", () => {
    const s = "the quarterly report mentions revenue and a password policy.";
    expect(maskCredentials(s)).toBe(s);
  });
});

describe("readFileText — bounded, on this device", () => {
  it("reads text-like files and marks them ok", async () => {
    const r = await readFileText(textFile("notes.txt", "hello library"));
    expect(r).toEqual({ status: "ok", text: "hello library" });
  });

  it("chooses the reader from the name and the declared type", () => {
    expect(extractionKind("a.pdf", "")).toBe("pdf");
    expect(extractionKind("a.bin", "application/pdf")).toBe("pdf");
    expect(extractionKind("a.md", "")).toBe("text");
    expect(extractionKind("a.json", "application/json")).toBe("text");
    expect(extractionKind("a.png", "image/png")).toBe("none");
    expect(extractionKind("a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("none");
  });

  it("marks images and spreadsheets unsupported rather than guessing", async () => {
    expect((await readFileText(textFile("a.png", "\x89PNG", "image/png"))).status).toBe("unsupported");
  });

  it("marks whitespace-only text as empty", async () => {
    expect((await readFileText(textFile("blank.txt", "  \n\t "))).status).toBe("empty");
  });

  it("reads only the first MAX_TEXT_BYTES of a text file and caps at MAX_TEXT_CHARS", async () => {
    const big = "a".repeat(MAX_TEXT_BYTES + 5000);
    const r = await readFileText(textFile("big.txt", big));
    expect(r.status).toBe("ok");
    expect(r.text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(r.text.length).toBe(MAX_TEXT_CHARS);
  });

  it("refuses to parse a pdf above MAX_PDF_BYTES and says so", async () => {
    const pdf = vi.fn(async () => "never called");
    const r = await readFileText(hugeFile("huge.pdf", "application/pdf", MAX_PDF_BYTES + 1), "huge.pdf", { pdf });
    expect(r.status).toBe("too_large");
    expect(pdf).not.toHaveBeenCalled();
    expect(TEXT_STATUS_LABEL.too_large).toMatch(/too large/);
  });

  it("uses the pdf reader for pdfs and masks what it returns", async () => {
    const pdf = vi.fn(async () => "page one sk-abcdefghijklmnopqrstuvwxyz1234 page two");
    const r = await readFileText(textFile("doc.pdf", "%PDF-1.4", "application/pdf"), "doc.pdf", { pdf });
    expect(r.status).toBe("ok");
    expect(r.text).toContain("[masked key]");
    expect(pdf).toHaveBeenCalledTimes(1);
  });

  it("reports a reader that throws as failed, not as a crash", async () => {
    const pdf = vi.fn(async () => { throw new Error("corrupt"); });
    const r = await readFileText(textFile("bad.pdf", "%PDF", "application/pdf"), "bad.pdf", { pdf });
    expect(r.status).toBe("failed");
  });

  it("strips nul bytes", async () => {
    const r = await readFileText(textFile("n.txt", "a\u0000b"));
    expect(r.text).toBe("ab");
  });
});

describe("search terms and snippets", () => {
  it("lowercases, dedupes, drops one-letter terms and caps at eight", () => {
    expect(searchTerms("  TLS tls a handshake ")).toEqual(["tls", "handshake"]);
    expect(searchTerms("a b c d e f g h i j k l".replace(/\b(\w)\b/g, "$1$1"))).toHaveLength(8);
  });

  it("returns a masked passage around the first term, or null", () => {
    const body = `${"x".repeat(200)} the handshake failed with token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk after`;
    const snip = snippetFor(body, ["handshake"]);
    expect(snip).toContain("handshake");
    expect(snip).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(snippetFor(body, ["absent"])).toBeNull();
    expect(snippetFor("", ["x"])).toBeNull();
  });
});

describe("the library loop on the device shim", () => {
  beforeEach(wipe);

  it("rejects a file the validator refuses, without writing a row", async () => {
    const r = await ingestFile(uid(), textFile("run.sh", "echo hi", "text/plain"), null);
    expect(r.file).toBeNull();
    expect(r.error).toMatch(/blocked file type/);
    expect(await listLibrary(uid())).toHaveLength(0);
  });

  it("add → row pending → read on device → searchable by content, with a snippet", async () => {
    const updates: LibraryFile[] = [];
    const r = await ingestFile(uid(), textFile("tls-notes.txt", "the handshake renegotiation failed under load"), null, (f) => updates.push(f));
    expect(r.error).toBeUndefined();
    expect(r.file?.text_status).toBe("pending");
    expect(r.file?.file_name).toBe("tls-notes.txt");
    await settle();
    expect(updates.at(-1)?.text_status).toBe("ok");
    expect(updates.at(-1)?.text_chars).toBeGreaterThan(0);

    const listed = await listLibrary(uid());
    expect(listed).toHaveLength(1);
    expect(listed[0].text_status).toBe("ok");
    expect("extracted_text" in listed[0]).toBe(false);

    const hits = await searchLibrary(uid(), "renegotiation");
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("renegotiation");
    expect(hits[0].file_name).toBe("tls-notes.txt");

    const byName = await searchLibrary(uid(), "tls notes");
    expect(byName).toHaveLength(1);
    expect(await searchLibrary(uid(), "zzzz")).toHaveLength(0);
    expect(await searchLibrary(uid(), "x")).toHaveLength(0);
  });

  it("every term must appear, across name and text; name hits rank first", async () => {
    await ingestFile(uid(), textFile("alpha.txt", "nothing about the subject here"), null);
    await ingestFile(uid(), textFile("notes.txt", "alpha protocol details"), null);
    await settle();
    const hits = await searchLibrary(uid(), "alpha");
    expect(hits.map((h) => h.file_name)).toEqual(["alpha.txt", "notes.txt"]);
    const both = await searchLibrary(uid(), "alpha protocol");
    expect(both.map((h) => h.file_name)).toEqual(["notes.txt"]);
  });

  it("punctuation in a query is literal, never a filter expression", async () => {
    await ingestFile(uid(), textFile("q.txt", "value (a,b) is 100% fine"), null);
    await settle();
    expect(await searchLibrary(uid(), "(a,b)")).toHaveLength(1);
    expect(await searchLibrary(uid(), "100%")).toHaveLength(1);
    expect(await searchLibrary(uid(), "file_name.ilike.%q%")).toHaveLength(0);
  });

  it("scopes search and listing to a project, and assign moves a file", async () => {
    const a = await ingestFile(uid(), textFile("one.txt", "shared term"), "proj-1");
    const b = await ingestFile(uid(), textFile("two.txt", "shared term"), null);
    await settle();
    expect((await listLibrary(uid(), "proj-1")).map((f) => f.id)).toEqual([a.file!.id]);
    expect(await searchLibrary(uid(), "shared", "proj-1")).toHaveLength(1);
    await assignProject(b.file!.id, "proj-1");
    expect(await listLibrary(uid(), "proj-1")).toHaveLength(2);
    await assignProject(b.file!.id, null);
    expect(await listLibrary(uid(), "proj-1")).toHaveLength(1);
  });

  it("indexed text is masked, and the stored bytes can be opened", async () => {
    const r = await ingestFile(uid(), textFile("env.txt", "api_key = sk-abcdefghijklmnopqrstuvwxyz1234 rest"), null);
    await settle();
    const { data } = await supabase.from(LIBRARY_TABLE).select("extracted_text").eq("id", r.file!.id).single();
    const indexed = (data as { extracted_text: string }).extracted_text;
    expect(indexed).not.toContain("abcdefghijklmnopqrstuvwxyz1234");
    expect(indexed).toContain("[masked key]");
    // the blob store hands back the Blob it was given (storage.ts toBlob); its
    // bytes do not survive fake-indexeddb's structured clone, so only the
    // handle is asserted here.
    const opened = await openLibraryFile(r.file!);
    expect(opened).not.toBeNull();
    expect(opened!.url).toMatch(/^blob:/);
    opened!.revoke();
  });

  it("delete removes the row and the blob, proven by re-read", async () => {
    const r = await ingestFile(uid(), textFile("gone.txt", "bye"), null);
    await settle();
    await deleteLibraryFile(r.file!);
    expect(await listLibrary(uid())).toHaveLength(0);
    const { data } = await supabase.storage.from(LIBRARY_BUCKET).download(r.file!.storage_path);
    expect(data).toBeNull();
    expect(await openLibraryFile(r.file!)).toBeNull();
  });

  it("a row left pending is read again at mount", async () => {
    const r = await ingestFile(uid(), textFile("stale.txt", "finished later"), null);
    await settle();
    await supabase.from(LIBRARY_TABLE).update({ text_status: "pending", text_chars: 0, extracted_text: null } as never).eq("id", r.file!.id);
    const rows = await listLibrary(uid());
    expect(rows[0].text_status).toBe("pending");
    const seen: LibraryFile[] = [];
    const n = await resumePendingExtraction(rows, (f) => seen.push(f));
    expect(n).toBe(1);
    expect(seen[0].text_status).toBe("ok");
    expect((await listLibrary(uid()))[0].text_status).toBe("ok");
  });

  it("retry on a missing blob marks the row failed instead of hanging", async () => {
    const r = await ingestFile(uid(), textFile("lost.txt", "x"), null);
    await settle();
    await supabase.storage.from(LIBRARY_BUCKET).remove([r.file!.storage_path]);
    expect(await retryExtract(r.file!)).toEqual({ status: "failed", chars: 0 });
    expect((await listLibrary(uid()))[0].text_status).toBe("failed");
  });

  it("listLibrary throws on a store error instead of returning a false empty list", async () => {
    const spy = vi.spyOn(supabase, "from").mockImplementationOnce(() => {
      throw new Error("Store unavailable");
    });
    await expect(listLibrary(uid())).rejects.toThrow();
    spy.mockRestore();
  });
});
