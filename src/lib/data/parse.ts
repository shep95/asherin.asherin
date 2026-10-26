// asherin.data — file parsing.
// everything is parsed on this device before a single byte reaches a model:
// an unreadable file must fail here, cheaply, with a plain english reason, and
// a large file must stop at a stated row cap instead of freezing the tab.

import type { DataRow, ParsedFile, DataCellValue } from "./types";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** rows kept per version. a bigger file is read up to here and the cap is
 *  reported; nothing past it is profiled or stored. */
export const MAX_ROWS = 50_000;
/** pages read out of a pdf before the reader stops and says so. */
export const MAX_PDF_PAGES = 400;
/** characters kept from a document before it is cut and the cut is reported. */
export const MAX_DOCUMENT_CHARS = 1_000_000;

export const ACCEPTED_EXTENSIONS = [
  ".csv", ".tsv", ".xlsx", ".xls", ".json", ".ndjson", ".parquet",
  ".pdf", ".png", ".jpg", ".jpeg", ".sql", ".txt", ".md",
];

const ROW_CAP_WARNING = `the file holds more than ${MAX_ROWS.toLocaleString()} rows; the first ${MAX_ROWS.toLocaleString()} were read and the rest were left out`;

function coerce(value: unknown): DataCellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value).trim();
  if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "n/a" || s === "-") return null;
  return s;
}

export function normaliseRows(raw: Record<string, unknown>[]): { columns: string[]; rows: DataRow[] } {
  const columns: string[] = [];
  for (const r of raw.slice(0, 500)) {
    for (const k of Object.keys(r)) if (k !== "" && !columns.includes(k)) columns.push(k);
  }
  const rows = raw.map((r) => {
    const out: DataRow = {};
    for (const c of columns) out[c] = coerce(r[c]);
    return out;
  });
  return { columns, rows };
}

export function tableToText(columns: string[], rows: DataRow[], limit = 400): string {
  const head = columns.join(" | ");
  const body = rows.slice(0, limit).map((r) => columns.map((c) => String(r[c] ?? "")).join(" | "));
  return [head, ...body].join("\n");
}

function cutDocument(text: string): { text: string; cut: boolean } {
  const clean = text.split("\u0000").join("").replace(/\r\n?/g, "\n");
  if (clean.length <= MAX_DOCUMENT_CHARS) return { text: clean, cut: false };
  return { text: clean.slice(0, MAX_DOCUMENT_CHARS), cut: true };
}

function document(text: string, method: string, warnings: string[] = []): ParsedFile {
  const { text: body, cut } = cutDocument(text);
  if (cut) warnings.push(`the text was cut at ${(MAX_DOCUMENT_CHARS / 1_000_000).toFixed(1)}m characters`);
  return { kind: "document", columns: [], rows: [], text: body, warnings, method, truncated: cut };
}

/* ── delimited text ────────────────────────────────────────────────────── */

/** streams the file through papaparse in chunks (the reader yields between
 *  chunks, so the tab stays responsive) and aborts once the row cap is hit. */
async function parseCsv(file: File, delimiter?: string): Promise<ParsedFile> {
  const Papa = (await import("papaparse")).default;
  const raw: Record<string, unknown>[] = [];
  const errors: { row?: number; message: string }[] = [];
  let capped = false;
  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      delimiter,
      chunk(results, parser) {
        for (const e of results.errors ?? []) if (errors.length < 5) errors.push(e);
        for (const r of results.data ?? []) {
          if (!r || typeof r !== "object") continue;
          if (raw.length >= MAX_ROWS) { capped = true; break; }
          raw.push(r);
        }
        if (capped) parser.abort();
      },
      complete: () => resolve(),
      error: (err: Error) => reject(new Error(`the file could not be read: ${err.message}`)),
    });
  });
  const warnings = errors.map((e) => `row ${e.row ?? "?"}: ${e.message.replace(/^[A-Z]/, (m) => m.toLowerCase())}`);
  if (capped) warnings.push(ROW_CAP_WARNING);
  const { columns, rows } = normaliseRows(raw);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: delimiter === "\t" ? "tsv" : "csv", truncated: capped };
}

/** a .txt file is a table only when its first lines agree on a delimiter and
 *  a field count; otherwise it is prose and is kept as a document. */
export async function sniffDelimited(head: string): Promise<{ table: boolean; delimiter?: string }> {
  const Papa = (await import("papaparse")).default;
  const lines = head.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { table: false };
  const res = Papa.parse<string[]>(head, { preview: 30, skipEmptyLines: "greedy" });
  const delimiter = res.meta.delimiter;
  if (!delimiter || res.meta.aborted) return { table: false };
  const counts = (res.data ?? []).map((r) => r.length).filter((n) => n > 0);
  if (counts.length < 2) return { table: false };
  const width = counts[0];
  if (width < 2) return { table: false };
  const agree = counts.filter((n) => n === width).length / counts.length;
  return agree >= 0.8 ? { table: true, delimiter } : { table: false };
}

async function parseText(file: File): Promise<ParsedFile> {
  const head = await file.slice(0, 64 * 1024).text();
  const sniff = await sniffDelimited(head);
  if (sniff.table) return parseCsv(file, sniff.delimiter);
  return document(await file.text(), "text");
}

/* ── workbooks ─────────────────────────────────────────────────────────── */

async function parseSheet(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  // sheetRows bounds how much of each sheet is materialised: the cap plus one
  // header row plus one sentinel row that tells us the sheet went on.
  const wb = XLSX.read(buf, { type: "array", cellDates: true, sheetRows: MAX_ROWS + 2 });
  const warnings: string[] = [];
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("the workbook has no sheets in it");
  if (wb.SheetNames.length > 1) {
    warnings.push(`only the first sheet ("${sheetName}") was read; ${wb.SheetNames.length - 1} other sheet(s) were skipped`);
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null, raw: false });
  const truncated = raw.length > MAX_ROWS;
  if (truncated) warnings.push(ROW_CAP_WARNING);
  const { columns, rows } = normaliseRows(truncated ? raw.slice(0, MAX_ROWS) : raw);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: "xlsx", truncated };
}

/* ── json ──────────────────────────────────────────────────────────────── */

function flatten(raw: unknown[]): Record<string, unknown>[] {
  return raw.map((r) => {
    if (r === null || typeof r !== "object" || Array.isArray(r)) return { value: r };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      out[k] = v && typeof v === "object" ? JSON.stringify(v) : v;
    }
    return out;
  });
}

async function parseJson(file: File): Promise<ParsedFile> {
  const text = (await file.text()).trim();
  if (!text) throw new Error("the file is empty");
  let raw: unknown[] = [];
  const warnings: string[] = [];
  let capped = false;
  const parse = (s: string): unknown => {
    try { return JSON.parse(s); } catch { throw new Error("the file is not valid json"); }
  };
  if (text.startsWith("[")) {
    const parsed = parse(text);
    raw = Array.isArray(parsed) ? parsed : [parsed];
  } else if (text.startsWith("{") && /\}\s*\n\s*\{/.test(text)) {
    // newline-delimited json: one object per line, read up to the cap
    let skipped = 0;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (raw.length >= MAX_ROWS) { capped = true; break; }
      try { raw.push(JSON.parse(t)); } catch { skipped++; }
    }
    if (skipped) warnings.push(`${skipped} line(s) were not valid json and were skipped`);
  } else {
    const parsed = parse(text) as Record<string, unknown>;
    if (parsed === null || typeof parsed !== "object") throw new Error("the json is a single value, not records");
    // a single object: look for the first array of objects inside it.
    const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]) && typeof (parsed[k] as unknown[])[0] === "object");
    raw = arrayKey ? (parsed[arrayKey] as unknown[]) : [parsed];
    if (arrayKey) warnings.push(`the records were read from the "${arrayKey}" array`);
  }
  if (raw.length > MAX_ROWS) { raw = raw.slice(0, MAX_ROWS); capped = true; }
  if (capped) warnings.push(ROW_CAP_WARNING);
  const { columns, rows } = normaliseRows(flatten(raw));
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: "json", truncated: capped };
}

/* ── parquet (hyparquet, pure js — no wasm) ────────────────────────────── */

async function parseParquet(file: File): Promise<ParsedFile> {
  const { parquetReadObjects, parquetMetadata } = await import("hyparquet");
  const buf = await file.arrayBuffer();
  let total = 0;
  try {
    total = Number(parquetMetadata(buf).num_rows);
  } catch {
    throw new Error("this is not a parquet file the reader understands");
  }
  const raw = (await parquetReadObjects({ file: buf, rowEnd: Math.min(total, MAX_ROWS) })) as Record<string, unknown>[];
  const truncated = total > MAX_ROWS;
  const warnings = truncated ? [ROW_CAP_WARNING] : [];
  const { columns, rows } = normaliseRows(raw);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: "parquet", truncated };
}

/* ── documents ─────────────────────────────────────────────────────────── */

async function parsePdf(file: File): Promise<ParsedFile> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // the worker is an asset of this build, served from the app's own origin
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/password/i.test(m)) throw new Error("this pdf is password-protected; remove the password and upload it again");
    throw new Error("this file is not a pdf the reader understands");
  }
  const warnings: string[] = [];
  const pages: string[] = [];
  let chars = 0;
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  try {
    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      let line = "";
      const out: string[] = [];
      for (const item of content.items as { str: string; transform?: number[] }[]) {
        const y = item.transform?.[5] ?? lastY ?? 0;
        if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line.trim()); line = ""; }
        line += item.str + " ";
        lastY = y;
      }
      if (line.trim()) out.push(line.trim());
      const text = out.join("\n");
      pages.push(text);
      chars += text.length;
      if (chars >= MAX_DOCUMENT_CHARS) break;
    }
  } finally {
    await task.destroy().catch(() => undefined);
  }
  if (doc.numPages > MAX_PDF_PAGES) warnings.push(`the pdf has ${doc.numPages} pages; the first ${MAX_PDF_PAGES} were read`);
  const text = pages.join("\n\n");
  if (text.trim().length < 40) {
    warnings.push("this pdf carries almost no text layer — it is probably a scan. asherin.extract reads scans optically.");
  }
  return document(text, "pdf", warnings);
}

async function parseImage(file: File, onProgress?: (pct: number) => void): Promise<ParsedFile> {
  const { createWorker } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100));
      },
    });
  } catch {
    throw new Error("the text reader could not load — it needs one network fetch the first time; check the connection and try again");
  }
  try {
    const { data } = await worker.recognize(file);
    const text = (data.text ?? "").trim();
    return document(text, "image-ocr", text.length < 20 ? ["no readable text was found in this image"] : []);
  } finally {
    await worker.terminate();
  }
}

/* ── sql dumps ─────────────────────────────────────────────────────────── */

/** reads INSERT INTO statements out of a sql dump into rows.
 *  schema-only dumps and dialect-specific syntax are reported, not guessed at. */
export function parseSqlText(text: string): ParsedFile {
  const warnings: string[] = [];
  const insertRe = /insert\s+into\s+[`"[]?([\w.]+)[`"\]]?\s*\(([^)]+)\)\s*values\s*(.+?);/gis;
  const byTable = new Map<string, { columns: string[]; rows: Record<string, unknown>[] }>();
  let m: RegExpExecArray | null;
  let capped = false;
  while ((m = insertRe.exec(text)) !== null) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim().replace(/^[`"[]|[`"\]]$/g, ""));
    const tupleRe = /\(((?:[^()']|'(?:[^']|'')*')*)\)/g;
    let t: RegExpExecArray | null;
    const entry = byTable.get(table) ?? { columns: cols, rows: [] };
    while ((t = tupleRe.exec(m[3])) !== null) {
      if (entry.rows.length >= MAX_ROWS) { capped = true; break; }
      const values: string[] = [];
      let cur = "";
      let inStr = false;
      const body = t[1];
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (inStr) {
          if (ch === "'" && body[i + 1] === "'") { cur += "'"; i++; }
          else if (ch === "'") inStr = false;
          else cur += ch;
        } else if (ch === "'") inStr = true;
        else if (ch === ",") { values.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      values.push(cur.trim());
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => { row[c] = values[i] === "NULL" ? null : values[i]; });
      entry.rows.push(row);
    }
    byTable.set(table, entry);
  }
  if (byTable.size === 0) {
    throw new Error("no insert statements were found in this dump, so there are no rows to read");
  }
  const [tableName, first] = [...byTable.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length)[0];
  if (byTable.size > 1) {
    warnings.push(`the dump holds ${byTable.size} tables; the largest one ("${tableName}") was loaded. upload the dump again to load another table.`);
  }
  if (capped) warnings.push(ROW_CAP_WARNING);
  const { columns, rows } = normaliseRows(first.rows);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: `sql:${tableName}`, truncated: capped };
}

/* ── entry ─────────────────────────────────────────────────────────────── */

export function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export async function parseDataFile(file: File, onProgress?: (pct: number) => void): Promise<ParsedFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`this file is ${(file.size / 1_048_576).toFixed(1)} mb and the limit is 100 mb`);
  }
  if (file.size === 0) throw new Error("the file is empty");
  const ext = extensionOf(file.name);
  let parsed: ParsedFile;
  if (ext === ".csv") parsed = await parseCsv(file);
  else if (ext === ".tsv") parsed = await parseCsv(file, "\t");
  else if (ext === ".txt") parsed = await parseText(file);
  else if (ext === ".xlsx" || ext === ".xls") parsed = await parseSheet(file);
  else if (ext === ".json" || ext === ".ndjson") parsed = await parseJson(file);
  else if (ext === ".parquet") parsed = await parseParquet(file);
  else if (ext === ".pdf") parsed = await parsePdf(file);
  else if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") parsed = await parseImage(file, onProgress);
  else if (ext === ".sql") parsed = parseSqlText(await file.text());
  else if (ext === ".md") parsed = document(await file.text(), "text");
  else {
    throw new Error(`${ext || "this file type"} is not one of the formats asherin.data reads: ${ACCEPTED_EXTENSIONS.join(", ")}`);
  }
  if (parsed.kind === "table" && parsed.rows.length === 0) {
    throw new Error("no rows were found in this file");
  }
  if (parsed.kind === "document" && !parsed.text.trim()) {
    throw new Error("no text was found in this file");
  }
  return parsed;
}
