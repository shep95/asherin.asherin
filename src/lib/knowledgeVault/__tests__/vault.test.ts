// asherin.knowledge — the store, the grounded answer, the web reader and the
// display helpers, against the real on-device shim (fake-indexeddb) with the
// model and the network mocked.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ askModel: vi.fn(async () => "[1] mocked") }));
vi.mock("@/lib/local/keys", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/local/keys")>();
  return { ...real, getActiveModel: vi.fn(async () => null), hasProviderKey: vi.fn(async () => false) };
});

import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/lib/local/auth";
import { CHUNKS, SOURCES, addSource, deleteSource, listSources, normaliseSource } from "../store";
import { ANSWER, answerFromPassages, buildAnswerPrompt, modelReady, parseCitations, stripBadCitations } from "../answer";
import { htmlToText, normaliseUrl, readWebPage, readerToText } from "../web";
import { composeKnowledgeContext, findContradictions, highlightSegments, ingestText, resetVaultIndex, retrieveVault, type VaultPassage } from "../vault";

const uid = () => getLocalUser().id;

async function wipe() {
  await supabase.from(CHUNKS).delete().eq("user_id", uid());
  await supabase.from(SOURCES).delete().eq("user_id", uid());
  resetVaultIndex();
}

const passage = (n: number, content: string, sourceName = "notes", sourceId = `s${n}`): VaultPassage => ({
  n, chunkId: `c${n}`, chunkIndex: 0, sourceId, sourceName, content, relevance: 1, matched: [],
});

describe("store — sources and passages on this device", () => {
  beforeEach(wipe);

  it("stores a text source with its passages, masks credentials, and recounts passages on read", async () => {
    const text = `the api key is sk-abcdefghijklmnopqrstuvwxyz1234 and the backup runs nightly.\n\n${"retention is thirty days. ".repeat(60)}`;
    const r = await addSource(uid(), { name: " my/notes.txt ", sourceType: "text", text, method: "plain text" });
    expect(r.error).toBeNull();
    expect(r.source?.name).toBe("my_notes.txt");
    expect(r.source?.status).toBe("indexed");
    expect(r.chunks).toBeGreaterThan(1);
    const { chunks } = await (async () => {
      const { data } = await supabase.from(CHUNKS).select("*").eq("source_id", r.source!.id);
      return { chunks: data as Array<{ content: string; chunk_index: number }> };
    })();
    expect(chunks.length).toBe(r.chunks);
    expect(chunks.some((c) => c.content.includes("sk-abcdefghijklmnopqrstuvwxyz1234"))).toBe(false);
    expect(chunks.some((c) => c.content.includes("[masked key]"))).toBe(true);
    const { sources, error } = await listSources(uid());
    expect(error).toBeNull();
    expect(sources).toHaveLength(1);
    expect(sources[0].chunk_count).toBe(r.chunks);
  });

  it("marks a source with no text as empty rather than guessing", async () => {
    const r = await addSource(uid(), { name: "blank", sourceType: "text", text: "  \n\n ", method: "plain text" });
    expect(r.error).toBeNull();
    expect(r.source?.status).toBe("empty");
    expect(r.chunks).toBe(0);
    expect(r.source?.error_message).toMatch(/no text to index/);
  });

  it("deletes a source and every passage of it, and proves the delete", async () => {
    const a = await addSource(uid(), { name: "a", sourceType: "text", text: "alpha ".repeat(300), method: "plain text" });
    const b = await addSource(uid(), { name: "b", sourceType: "text", text: "beta ".repeat(300), method: "plain text" });
    const d = await deleteSource(uid(), a.source!.id);
    expect(d.error).toBeNull();
    expect(d.removedChunks).toBe(a.chunks);
    const { sources } = await listSources(uid());
    expect(sources.map((s) => s.id)).toEqual([b.source!.id]);
    const { data } = await supabase.from(CHUNKS).select("id").eq("user_id", uid());
    expect((data ?? []).length).toBe(b.chunks);
  });

  it("refuses a missing identity plainly", async () => {
    expect((await addSource("", { name: "x", sourceType: "text", text: "y", method: "plain text" })).error).toMatch(/no identity/);
    expect((await listSources("")).error).toMatch(/no identity/);
  });

  it("reads a hosted-era row as failed with a reason, never as indexed", () => {
    const hosted = { id: "1", name: "old", source_type: "youtube", status: "indexed", chunk_count: 12, created_at: "2025-01-01T00:00:00Z" };
    const legacy = normaliseSource(hosted as unknown as Parameters<typeof normaliseSource>[0], 0);
    expect(legacy.status).toBe("failed");
    expect(legacy.chunk_count).toBe(0);
    expect(legacy.source_type).toBe("text");
    expect(legacy.error_message).toMatch(/hosted era/);
    const fresh = normaliseSource({ id: "2", name: "new", source_type: "url", status: "indexed", method: "web page", url: "https://x.y/z", created_at: "2026-01-01T00:00:00Z" }, 3);
    expect(fresh.status).toBe("indexed");
    expect(fresh.origin).toBe("https://x.y/z");
  });
});

describe("retrieveVault + composeKnowledgeContext — end to end on the shim", () => {
  beforeEach(wipe);

  it("finds the passage, numbers it, and invalidates the index when the corpus changes", async () => {
    const empty = await retrieveVault(uid(), "backup window");
    expect(empty.passages).toEqual([]);
    expect(empty.indexed).toBe(0);
    await ingestText(uid(), "ops runbook", "the backup window opens at two in the morning and closes at four.\n\nthe kitchen rota changes every monday.");
    const r = await retrieveVault(uid(), "when does the backup window open");
    expect(r.error).toBeUndefined();
    expect(r.indexed).toBeGreaterThan(0);
    expect(r.passages[0].n).toBe(1);
    expect(r.passages[0].sourceName).toBe("ops runbook");
    expect(r.passages[0].content).toContain("backup window");
    expect(r.passages[0].relevance).toBe(1);
    const ctx = await composeKnowledgeContext(uid(), "when does the backup window open");
    expect(ctx.brief).toContain("[k1] ops runbook");
    expect((await composeKnowledgeContext(uid(), "zebra migration patterns")).brief).toBe("");
  });
});

describe("answer — grounding contract", () => {
  it("builds a prompt with numbered passages and the question", () => {
    const p = buildAnswerPrompt("what is kept?", [passage(1, "thirty days of snapshots."), passage(2, "logs for ninety days.")]);
    expect(p).toContain("[1] notes\nthirty days of snapshots.");
    expect(p).toContain("[2] notes\nlogs for ninety days.");
    expect(p).toContain("question: what is kept?");
    expect(buildAnswerPrompt("q", Array.from({ length: 12 }, (_, i) => passage(i + 1, "x")))).not.toContain(`[${ANSWER.maxPassages + 1}]`);
  });

  it("keeps only citations that point at a passage it was given", () => {
    expect(parseCitations("snapshots last thirty days [1] and logs ninety [2]; see [7] and [0]", 2)).toEqual([1, 2]);
    expect(stripBadCitations("kept thirty days [1], invented [9].", 2)).toBe("kept thirty days [1], invented.");
  });

  it("answers through the injected ask, refuses with no passages, and names a timeout or an error", async () => {
    const good = await answerFromPassages("q", [passage(1, "a"), passage(2, "b")], async () => "a says so [1]. b too [2]. nonsense [5].");
    expect(good.error).toBeNull();
    expect(good.text).toBe("a says so [1]. b too [2]. nonsense.");
    expect(good.cited).toEqual([1, 2]);
    const none = await answerFromPassages("q", []);
    expect(none.error).toMatch(/no passage/);
    const failed = await answerFromPassages("q", [passage(1, "a")], async () => { throw new Error("No saved key for openai"); });
    expect(failed.text).toBe("");
    expect(failed.error).toBe("no saved key for openai");
    const blank = await answerFromPassages("q", [passage(1, "a")], async () => "   ");
    expect(blank.error).toMatch(/returned nothing/);
  });

  it("stays quiet when no model key is present", async () => {
    expect(await modelReady()).toBe(false);
  });
});

describe("web — reading a page from this device", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("normalises addresses and refuses what is not http(s)", () => {
    expect(normaliseUrl("example.com/a b")).toBe("https://example.com/a%20b");
    expect(normaliseUrl("http://localhost:8080/x")).toBe("http://localhost:8080/x");
    expect(normaliseUrl("ftp://example.com")).toBeNull();
    expect(normaliseUrl("https://user:pw@example.com")).toBeNull();
    expect(normaliseUrl("not a url")).toBeNull();
    expect(normaliseUrl("")).toBeNull();
  });

  it("reduces html to prose: chrome removed, main preferred, blocks on their own lines", () => {
    const { text, title } = htmlToText(`<html><head><title>a page</title><style>p{}</style></head><body><nav>menu</nav><main><h1>heading</h1><p>first&nbsp;para</p><script>x()</script><ul><li>one</li><li>two</li></ul></main><footer>foot</footer></body></html>`);
    expect(title).toBe("a page");
    expect(text).toBe("heading\n\nfirst para\n\none\n\ntwo");
  });

  it("keeps the title and body of a reader answer", () => {
    const { text, title } = readerToText("Title: the article\nURL Source: https://x\n\nMarkdown Content:\nhello **world**\n");
    expect(title).toBe("the article");
    expect(text).toBe("hello **world**");
  });

  it("reports a cors refusal as blocked, an http status, an empty page, and only uses the reader on consent", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const blocked = await readWebPage("https://example.com", false);
    expect(blocked.ok).toBe(false);
    expect(blocked.failure).toBe("blocked");
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe("https://example.com/");

    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    expect((await readWebPage("https://example.com", false)).failure).toBe("http");

    globalThis.fetch = vi.fn(async () => new Response("<html><body><script>only()</script></body></html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await readWebPage("https://example.com", false)).failure).toBe("empty");

    globalThis.fetch = vi.fn(async () => new Response("Title: t\n\nMarkdown Content:\nbody text", { status: 200, headers: { "content-type": "text/plain" } })) as unknown as typeof fetch;
    const viaReader = await readWebPage("https://example.com/post", true);
    expect(viaReader.ok).toBe(true);
    expect(viaReader.method).toBe("web reader");
    expect(viaReader.title).toBe("t");
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toBe("https://r.jina.ai/https://example.com/post");
    expect((await readWebPage("nonsense", true)).failure).toBe("bad-url");
  });

  it("reads a directly readable html page", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<!doctype html><html><head><title>ok</title></head><body><article><p>readable prose here.</p></article></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as unknown as typeof fetch;
    const r = await readWebPage("example.com", false);
    expect(r.ok).toBe(true);
    expect(r.method).toBe("web page");
    expect(r.text).toBe("readable prose here.");
    expect(r.title).toBe("ok");
  });
});

describe("display helpers", () => {
  it("highlights words that share a stem with the question and nothing else", () => {
    const segs = highlightSegments("The backups ran; snapshots were kept.", "backup snapshot");
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["backups", "snapshots"]);
    expect(segs.map((s) => s.text).join("")).toBe("The backups ran; snapshots were kept.");
    expect(highlightSegments("plain", "the of")).toEqual([{ text: "plain", hit: false }]);
  });

  it("flags opposite polarity across sources only when the subject overlaps strongly", () => {
    const a = passage(1, "the nightly backup retention window keeps thirty snapshot days", "runbook", "s1");
    const b = passage(2, "the nightly backup retention window never keeps thirty snapshot days", "memo", "s2");
    const c = passage(3, "the nightly backup retention window never keeps thirty snapshot days", "runbook", "s1");
    const d = passage(4, "kitchen rota is not posted on mondays", "house", "s3");
    const out = findContradictions([a, b, c, d]);
    expect(out).toEqual([{ a: 1, b: 2, reason: expect.stringContaining("runbook vs memo") }]);
  });
});
