import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  addReport,
  addSummary,
  countByType,
  digestFor,
  exportFilename,
  filterReports,
  normalizeReport,
  readReports,
  readSummaries,
  removeReport,
  setReportStatus,
  summaryPrompt,
  toExportBundle,
  toMarkdown,
  type BugReport,
} from "./bugLog";

const uid = "55555555-5555-4555-8555-555555555555";
const report = (over: Partial<BugReport> = {}): BugReport => ({
  id: "r1",
  user_id: uid,
  type: "bug",
  title: "chat loses the draft on refresh",
  description: "type, refresh, the text is gone.",
  severity: "high",
  status: "open",
  created_at: "2026-10-25T10:00:00.000Z",
  updated_at: "2026-10-25T10:00:00.000Z",
  ...over,
});

describe("asherin.bugs — pure", () => {
  it("normalises a hosted-era row with no status instead of crashing on it", () => {
    const r = normalizeReport({ id: "x", user_id: uid, type: "feature", title: "t", description: "d", severity: "medium", created_at: "2026-01-01T00:00:00.000Z" });
    expect(r.status).toBe("open");
    expect(r.updated_at).toBe("2026-01-01T00:00:00.000Z");
    expect(normalizeReport({ type: "nonsense", severity: "huge", status: "weird" }).type).toBe("bug");
    expect(normalizeReport({ severity: "huge" }).severity).toBe("medium");
    expect(normalizeReport({ status: "weird" }).status).toBe("open");
  });

  it("filters by type and status", () => {
    const rows = [report(), report({ id: "r2", type: "feature", status: "resolved" }), report({ id: "r3", status: "dismissed" })];
    expect(filterReports(rows, { type: "all", status: "all" })).toHaveLength(3);
    expect(filterReports(rows, { type: "bug", status: "all" }).map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(filterReports(rows, { type: "all", status: "resolved" }).map((r) => r.id)).toEqual(["r2"]);
    expect(countByType(rows)).toEqual({ bugs: 2, features: 1 });
  });

  it("the digest clips descriptions, caps the count, and shows severity only for bugs", () => {
    const long = report({ id: "long", description: "x".repeat(1000) });
    const rows = [long, report({ id: "f", type: "feature", title: "export as pdf", description: "" })];
    const d = digestFor(rows);
    expect(d.split("\n")).toHaveLength(2);
    expect(d).toContain("[bug · high · open]");
    expect(d).toContain("[request · open] export as pdf");
    expect(d).not.toContain("x".repeat(401));
    expect(d).toContain("…");
    expect(digestFor(Array.from({ length: 80 }, (_, i) => report({ id: String(i) }))).split("\n")).toHaveLength(60);
    expect(summaryPrompt(d)).toMatch(/^summarize this log/);
    expect(summaryPrompt(d)).toContain(d);
  });

  it("markdown export carries every entry, the device prefix and the summaries", () => {
    const md = toMarkdown(
      [report(), report({ id: "r2", type: "feature", title: "export as pdf", description: "one file." })],
      [{ id: "s1", summary: "one high bug, one request.", report_ids: ["r1", "r2"], bug_count: 1, feature_count: 1, created_at: "2026-10-25T11:00:00.000Z" }],
      { deviceId: "abcdef12-0000-4000-8000-000000000000", exportedAt: new Date("2026-10-25T12:00:00.000Z") },
    );
    expect(md).toContain("# asherin.bugs — export");
    expect(md).toContain("device abcdef12.");
    expect(md).toContain("2 entries: 1 bugs, 1 requests");
    expect(md).toContain("## chat loses the draft on refresh");
    expect(md).toContain("bug · high · open · logged 2026-10-25 10:00 utc");
    expect(md).toContain("request · open");
    expect(md).toContain("## shepherd summaries");
    expect(md).toContain("one high bug, one request.");
    expect(md).not.toContain("abcdef12-0000");
  });

  it("empty markdown export says so instead of rendering nothing", () => {
    const md = toMarkdown([], [], { deviceId: "abcdef12", exportedAt: new Date("2026-10-25T12:00:00.000Z") });
    expect(md).toContain("_no entries._");
    expect(md).not.toContain("## shepherd summaries");
  });

  it("json bundle and filename are stable", () => {
    const b = toExportBundle([report()], [], { deviceId: "dev", exportedAt: new Date("2026-10-25T12:00:00.000Z") });
    expect(b.format).toBe("asherin-bugs-export");
    expect(b.reports).toHaveLength(1);
    expect(exportFilename("md", new Date(2026, 9, 5))).toBe("asherin-bugs-2026-10-05.md");
    expect(exportFilename("json", new Date(2026, 0, 1))).toBe("asherin-bugs-2026-01-01.json");
  });
});

describe("asherin.bugs — the local store", () => {
  it("writes an entry with an explicit open status and reads it back newest first", async () => {
    const a = await addReport(uid, { type: "bug", title: "  first  ", description: "d1", severity: "critical" });
    expect(a.status).toBe("open");
    expect(a.title).toBe("first");
    const b = await addReport(uid, { type: "feature", title: "second", description: "d2", severity: "high" });
    expect(b.severity).toBe("low");
    const rows = await readReports(uid);
    expect(rows.map((r) => r.title)).toEqual(["second", "first"]);
  });

  it("refuses an empty title or description", async () => {
    await expect(addReport(uid, { type: "bug", title: "   ", description: "d", severity: "low" })).rejects.toThrow(/title/);
    await expect(addReport(uid, { type: "bug", title: "t", description: "  ", severity: "low" })).rejects.toThrow(/description/);
  });

  it("changes status, removes an entry, and keeps a summary tied to the entries it read", async () => {
    const rows = await readReports(uid);
    const first = rows.find((r) => r.title === "first")!;
    await setReportStatus(first.id, "resolved");
    const after = await readReports(uid);
    expect(after.find((r) => r.id === first.id)?.status).toBe("resolved");
    expect(after.find((r) => r.id === first.id)?.updated_at > first.updated_at).toBe(true);

    const s = await addSummary(uid, "one resolved bug, one request.", after);
    expect(s.report_ids).toEqual(after.map((r) => r.id));
    expect(s.bug_count).toBe(1);
    expect(s.feature_count).toBe(1);
    expect((await readSummaries(uid))[0].summary).toBe("one resolved bug, one request.");

    await removeReport(first.id);
    expect((await readReports(uid)).map((r) => r.id)).not.toContain(first.id);
    const { data } = await supabase.from("bug_reports").select("id").eq("id", first.id);
    expect(data).toHaveLength(0);
  });

  it("reads a hosted-era row with no status without throwing", async () => {
    await supabase.from("bug_reports").insert({ user_id: uid, type: "bug", title: "old", description: "legacy", severity: "medium" } as never);
    const rows = await readReports(uid);
    expect(rows.find((r) => r.title === "old")?.status).toBe("open");
  });
});
