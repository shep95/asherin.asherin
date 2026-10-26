import "./blobPolyfill";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ACCEPTED_EXTENSIONS, MAX_ROWS, MAX_UPLOAD_BYTES, parseDataFile, parseSqlText, sniffDelimited } from "../parse";

const file = (name: string, body: string | ArrayBuffer, type = "text/plain") => new File([body], name, { type });

describe("asherin.data parser", () => {
  it("reads a csv with a header, trims cells and turns blanks into null", async () => {
    const p = await parseDataFile(file("sales.csv", "region,revenue,closed_at\nnorth, 1200 ,2026-01-04\nsouth,,2026-01-11\n"));
    expect(p.kind).toBe("table");
    expect(p.columns).toEqual(["region", "revenue", "closed_at"]);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].revenue).toBe("1200");
    expect(p.rows[1].revenue).toBeNull();
    expect(p.method).toBe("csv");
    expect(p.truncated).toBe(false);
  });

  it("reads a tsv with the tab delimiter forced", async () => {
    const p = await parseDataFile(file("t.tsv", "a\tb\n1\t2\n"));
    expect(p.columns).toEqual(["a", "b"]);
    expect(p.rows[0]).toEqual({ a: "1", b: "2" });
    expect(p.method).toBe("tsv");
  });

  it("stops a big csv at the row cap and says so", async () => {
    const lines = ["id,v"];
    for (let i = 0; i < MAX_ROWS + 25; i++) lines.push(`${i},${i % 7}`);
    const p = await parseDataFile(file("big.csv", lines.join("\n")));
    expect(p.rows).toHaveLength(MAX_ROWS);
    expect(p.truncated).toBe(true);
    expect(p.warnings.some((w) => w.includes("50,000"))).toBe(true);
  });

  it("keeps a prose .txt as a document and a delimited .txt as a table", async () => {
    const prose = await parseDataFile(file("notes.txt", "the quarter closed well.\nmargins held, churn fell.\nwatch the north region next month.\n"));
    expect(prose.kind).toBe("document");
    expect(prose.text).toContain("margins held");
    const table = await parseDataFile(file("export.txt", "city;value\nrome;3\nparis;4\n"));
    expect(table.kind).toBe("table");
    expect(table.columns).toEqual(["city", "value"]);
  });

  it("sniffs a delimiter only when the lines agree", async () => {
    expect((await sniffDelimited("a,b\n1,2\n3,4")).table).toBe(true);
    expect((await sniffDelimited("one line only")).table).toBe(false);
    expect((await sniffDelimited("hello, world\nthis is prose, with commas, sometimes\nand sometimes not")).table).toBe(false);
  });

  it("reads a json array, newline-delimited json and the first array inside an object", async () => {
    const arr = await parseDataFile(file("a.json", JSON.stringify([{ a: 1, b: { c: 2 } }, { a: 2 }]), "application/json"));
    expect(arr.rows).toEqual([{ a: 1, b: '{"c":2}' }, { a: 2, b: null }]);
    const nd = await parseDataFile(file("b.ndjson", '{"a":1}\n{"a":2}\nnot json\n'));
    expect(nd.rows).toHaveLength(2);
    expect(nd.warnings[0]).toContain("1 line(s) were not valid json");
    const obj = await parseDataFile(file("c.json", JSON.stringify({ meta: 1, records: [{ x: "y" }] })));
    expect(obj.rows).toEqual([{ x: "y" }]);
    expect(obj.warnings[0]).toContain('"records"');
  });

  it("refuses invalid json in plain words", async () => {
    await expect(parseDataFile(file("bad.json", "[1, 2"))).rejects.toThrow("not valid json");
  });

  it("reads the first sheet of a workbook and reports skipped sheets", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["name", "qty"], ["bolt", 4], ["nut", 9]]), "parts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"], [1]]), "other");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const p = await parseDataFile(file("parts.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    expect(p.columns).toEqual(["name", "qty"]);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].name).toBe("bolt");
    expect(p.warnings[0]).toContain("1 other sheet(s)");
  });

  it("reads insert statements out of a sql dump and picks the largest table", () => {
    const sql = `CREATE TABLE t (a int);
INSERT INTO "orders" (id, item, note) VALUES (1, 'bolt', 'it''s fine'), (2, 'nut', NULL);
INSERT INTO tags (id) VALUES (1);`;
    const p = parseSqlText(sql);
    expect(p.method).toBe("sql:orders");
    expect(p.rows).toEqual([{ id: "1", item: "bolt", note: "it's fine" }, { id: "2", item: "nut", note: null }]);
    expect(p.warnings[0]).toContain("2 tables");
    expect(() => parseSqlText("CREATE TABLE t (a int);")).toThrow("no insert statements");
  });

  it("keeps markdown as a document", async () => {
    const p = await parseDataFile(file("readme.md", "# title\n\nbody\n"));
    expect(p.kind).toBe("document");
    expect(p.text).toContain("# title");
  });

  it("refuses what it cannot read, before touching the bytes", async () => {
    await expect(parseDataFile(file("x.docx", "zip"))).rejects.toThrow(".docx is not one of the formats");
    await expect(parseDataFile(file("empty.csv", ""))).rejects.toThrow("the file is empty");
    await expect(parseDataFile(file("head.csv", "a,b\n"))).rejects.toThrow("no rows were found");
    const huge = { name: "big.csv", size: MAX_UPLOAD_BYTES + 1, text: async () => "", slice: () => new Blob([]) } as unknown as File;
    await expect(parseDataFile(huge)).rejects.toThrow("the limit is 100 mb");
  });

  it("lists exactly the formats it routes", () => {
    expect(ACCEPTED_EXTENSIONS).toEqual([".csv", ".tsv", ".xlsx", ".xls", ".json", ".ndjson", ".parquet", ".pdf", ".png", ".jpg", ".jpeg", ".sql", ".txt", ".md"]);
  });
});
