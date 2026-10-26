import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { kvGet } from "@/lib/local/db";
import {
  T, createAlertRule, createWorkspace, deleteSource, ingest, listAlertRules, listDictionary, listQueries, listSources, listVersions,
  listWorkspaceVersions, listWorkspaces, loadVersionRows, logQuery, recordAlertEvent, rowsKey, saveDefinition, saveReport, listReports,
} from "../store";
import { buildDatasetProfile, buildQualityReport } from "../validate";
import type { AnswerBlocks, DataRow } from "../types";

const rows: DataRow[] = [
  { region: "north", revenue: "1200", units: 3 },
  { region: "south", revenue: "800", units: 2 },
];
const columns = ["region", "revenue", "units"];
const profile = buildDatasetProfile(columns, rows);
const quality = buildQualityReport(columns, rows, profile.columns);

async function wipe() {
  for (const t of Object.values(T)) await supabase.from(t).delete().neq("id", "");
}

describe("asherin.data store", () => {
  beforeEach(wipe);

  it("creates a workspace with empty directions and the default theme", async () => {
    const ws = await createWorkspace("  mine  ");
    expect(ws.name).toBe("mine");
    expect(ws.instructions).toBe("");
    expect(ws.theme).toEqual({ id: "asherin" });
    expect((await listWorkspaces()).map((w) => w.id)).toEqual([ws.id]);
  });

  it("stores a version as one kv record and reads it back", async () => {
    const ws = await createWorkspace("w");
    const res = await ingest({ workspace_id: ws.id, source_name: "sales", kind: "table", file_name: "sales.csv", columns, rows, quality, profile });
    expect(res.version).toBe(1);
    expect(res.rows_stored).toBe(2);
    expect(await kvGet(rowsKey(res.version_id))).toEqual(rows);
    expect(await loadVersionRows(res.version_id)).toEqual(rows);
    expect(await loadVersionRows(res.version_id, 1, 1)).toEqual([rows[1]]);
    const [src] = await listSources(ws.id);
    expect(src.name).toBe("sales");
    expect(src.status).toBe("ready");
    expect(src.last_sync_at).toBeTruthy();
    const [v] = await listVersions(src.id);
    expect(v.row_count).toBe(2);
    expect(v.columns).toEqual(columns);
    expect(v.text).toBeNull();
  });

  it("numbers a second version and keeps edited definitions across it", async () => {
    const ws = await createWorkspace("w");
    const first = await ingest({ workspace_id: ws.id, source_name: "sales", kind: "table", columns, rows, quality, profile });
    const dict = await listDictionary(first.source_id);
    expect(dict.map((d) => d.column_name)).toEqual(columns);
    await saveDefinition(dict.find((d) => d.column_name === "units")!.id, "items shipped");
    const wider = [...columns, "note"];
    const widerRows = rows.map((r) => ({ ...r, note: "x" }));
    const p2 = buildDatasetProfile(wider, widerRows);
    const second = await ingest({ workspace_id: ws.id, source_id: first.source_id, kind: "table", columns: wider, rows: widerRows, quality: buildQualityReport(wider, widerRows, p2.columns), profile: p2 });
    expect(second.version).toBe(2);
    const after = await listDictionary(first.source_id);
    expect(after.find((d) => d.column_name === "units")?.definition).toBe("items shipped");
    expect(after.some((d) => d.column_name === "note")).toBe(true);
    const map = await listWorkspaceVersions(ws.id);
    expect(map[first.source_id].map((v) => v.version)).toEqual([2, 1]);
  });

  it("keeps a document's text on the version row and stores no rows", async () => {
    const ws = await createWorkspace("w");
    const res = await ingest({ workspace_id: ws.id, source_name: "memo", kind: "document", columns: [], rows: [], text: "hello", quality: buildQualityReport([], [], []), profile: buildDatasetProfile([], [], "hello") });
    const [v] = await listVersions(res.source_id);
    expect(v.text).toBe("hello");
    expect(await kvGet(rowsKey(res.version_id))).toBeUndefined();
    await expect(loadVersionRows(res.version_id)).rejects.toThrow("not on this device");
  });

  it("deleting a source removes its rows, versions, dictionary, rules and events", async () => {
    const ws = await createWorkspace("w");
    const res = await ingest({ workspace_id: ws.id, source_name: "sales", kind: "table", columns, rows, quality, profile });
    const rule = await createAlertRule({ workspace_id: ws.id, source_id: res.source_id, name: "n", kind: "threshold", spec: { metric: "units", aggregate: "sum", operator: ">", threshold: 1, sigma: 3 } });
    expect(rule.active).toBe(true);
    expect(await recordAlertEvent({ workspace_id: ws.id, rule_id: rule.id, version_id: res.version_id, message: "m", metric: "units", value: 5 })).toBe(true);
    expect(await recordAlertEvent({ workspace_id: ws.id, rule_id: rule.id, version_id: res.version_id, message: "m", metric: "units", value: 5 })).toBe(false);
    await deleteSource(res.source_id);
    expect(await listSources(ws.id)).toEqual([]);
    expect(await listVersions(res.source_id)).toEqual([]);
    expect(await listDictionary(res.source_id)).toEqual([]);
    expect(await listAlertRules(ws.id)).toEqual([]);
    expect(await kvGet(rowsKey(res.version_id))).toBeUndefined();
    const { data: events } = await supabase.from(T.alertEvents).select("id").eq("rule_id", rule.id);
    expect(events).toEqual([]);
  });

  it("logs questions newest first and keeps reports", async () => {
    const ws = await createWorkspace("w");
    const answer = { finding: "north leads", confidence: "high" } as AnswerBlocks;
    await logQuery(ws.id, null, "who leads?", answer);
    await new Promise((r) => setTimeout(r, 5));
    await logQuery(ws.id, null, "and then?", { ...answer, confidence: "low" });
    const log = await listQueries(ws.id);
    expect(log.map((q) => q.question)).toEqual(["and then?", "who leads?"]);
    const rep = await saveReport({ workspace_id: ws.id, source_id: null, name: "r", template: "overview", markdown: "# r" });
    expect((await listReports(ws.id))[0].id).toBe(rep.id);
  });
});
