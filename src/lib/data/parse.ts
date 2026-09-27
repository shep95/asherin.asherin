// asherin.data — file parsing.
// Everything is parsed on the device before a single byte reaches an ai call:
// an unreadable file must fail here, cheaply, with a plain english reason.

import type { DataRow, ParsedFile, DataCellValue } from "./types";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Rows kept in the queryable store per version. Beyond this the file is
 *  profiled in full but only the first slice is retained for row-level reads. */
export const MAX_ROWS = 50_000;

export const ACCEPTED_EXTENSIONS = [
  ".csv", ".tsv", ".xlsx", ".xls", ".json", ".ndjson", ".parquet",
  ".pdf", ".png", ".jpg", ".jpeg", ".sql", ".txt", ".md",
];

function coerce(value: unknown): DataCellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "n/a" || s === "-") return null;
  return s;
}

function normaliseRows(raw: Record<string, unknown>[]): { columns: string[]; rows: DataRow[] } {
  const columns: string[] = [];
  for (const r of raw.slice(0, 500)) {
    for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  }
  const rows = raw.map((r) => {
    const out: DataRow = {};
    for (const c of columns) out[c] = coerce(r[c]);
    return out;
  });
  return { columns, rows };
}

function tableToText(columns: string[], rows: DataRow[], limit = 400): string {
  const head = columns.join(" | ");
  const body = rows.slice(0, limit).map((r) => columns.map((c) => String(r[c] ?? "")).join(" | "));
  return [head, ...body].join("\n");
}

async function parseCsv(file: File, delimiter?: string): Promise<ParsedFile> {
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    delimiter,
  });
  const warnings = (res.errors ?? []).slice(0, 5).map((e) => `row ${e.row ?? "?"}: ${e.message}`);
  const raw = (res.data ?? []).filter((r) => r && typeof r === "object");
  const truncated = raw.length > MAX_ROWS;
  const { columns, rows } = normaliseRows(truncated ? raw.slice(0, MAX_ROWS) : raw);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: "csv", truncated };
}

async function parseSheet(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const warnings: string[] = [];
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("the workbook has no sheets in it");
  if (wb.SheetNames.length > 1) {
    warnings.push(`only the first sheet ("${sheetName}") was read; ${wb.SheetNames.length - 1} other sheet(s) were skipped`);
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null, raw: false });
  const truncated = raw.length > MAX_ROWS;
  const { columns, rows } = normaliseRows(truncated ? raw.slice(0, MAX_ROWS) : raw);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: "xlsx", truncated };
}

async function parseJson(file: File): Promise<ParsedFile> {
  const text = (await file.text()).trim();
  let raw: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (text.startsWith("[")) {
    const parsed = JSON.parse(text);
    raw = Array.isArray(parsed) ? parsed : [parsed];
  } else if (text.includes("\n") && text.startsWith("{")) {
    // newline delimited json
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { raw.push(JSON.parse(t)); } catch { warnings.push("a line was not valid json and was skipped"); }
    }
  } else {
    const parsed = JSON.parse(text);
    // A single object: look for the first array of objects inside it.
    const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]) && typeof parsed[k][0] === "object");
    raw = arrayKey ? parsed[arrayKey] : [parsed];
    if (arrayKey) warnings.push(`the records were read from the "${arrayKey}" array`);
  }
  const flat = raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r ?? {})) {
      out[k] = v && typeof v === "object" ? JSON.stringify(v) : v;
    }
    return out;
  });
  const truncated = flat.length > MAX_ROWS;
  const { columns, rows } = normaliseRows(truncated ? flat.slice(0, MAX_ROWS) : flat);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: "json", truncated };
}

async function parseParquet(file: File): Promise<ParsedFile> {
  const { parquetReadObjects } = await import("hyparquet");
  const buf = await file.arrayBuffer();
  const raw = (await parquetReadObjects({ file: buf })) as Record<string, unknown>[];
  const truncated = raw.length > MAX_ROWS;
  const { columns, rows } = normaliseRows(truncated ? raw.slice(0, MAX_ROWS) : raw);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings: [], method: "parquet", truncated };
}

async function parsePdf(file: File): Promise<ParsedFile> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    const out: string[] = [];
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line.trim()); line = ""; }
      line += item.str + " ";
      lastY = y;
    }
    if (line.trim()) out.push(line.trim());
    pages.push(out.join("\n"));
  }
  const text = pages.join("\n\n");
  const warnings = text.trim().length < 40
    ? ["this pdf carries almost no text layer — it is probably a scan. upload it as an image so the text can be read optically."]
    : [];
  return { kind: "document", columns: [], rows: [], text, warnings, method: "pdf", truncated: false };
}

async function parseImage(file: File, onProgress?: (pct: number) => void): Promise<ParsedFile> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(file);
    const text = (data.text ?? "").trim();
    return {
      kind: "document",
      columns: [], rows: [], text,
      warnings: text.length < 20 ? ["no readable text was found in this image"] : [],
      method: "image-ocr",
      truncated: false,
    };
  } finally {
    await worker.terminate();
  }
}

/** Reads INSERT INTO statements out of a sql dump into rows.
 *  Schema-only dumps and dialect-specific syntax are reported, not guessed at. */
async function parseSqlDump(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const warnings: string[] = [];
  const insertRe = /insert\s+into\s+[`"[]?([\w.]+)[`"\]]?\s*\(([^)]+)\)\s*values\s*(.+?);/gis;
  const byTable = new Map<string, { columns: string[]; rows: Record<string, unknown>[] }>();
  let m: RegExpExecArray | null;
  while ((m = insertRe.exec(text)) !== null) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim().replace(/^[`"[]|[`"\]]$/g, ""));
    const tupleRe = /\(((?:[^()']|'(?:[^']|'')*')*)\)/g;
    let t: RegExpExecArray | null;
    const entry = byTable.get(table) ?? { columns: cols, rows: [] };
    while ((t = tupleRe.exec(m[3])) !== null) {
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
    throw new Error("no INSERT statements were found in this dump, so there are no rows to read");
  }
  const [tableName, first] = [...byTable.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length)[0];
  if (byTable.size > 1) {
    warnings.push(`the dump holds ${byTable.size} tables; the largest one ("${tableName}") was loaded. upload the dump again to load another table.`);
  }
  const truncated = first.rows.length > MAX_ROWS;
  const { columns, rows } = normaliseRows(truncated ? first.rows.slice(0, MAX_ROWS) : first.rows);
  return { kind: "table", columns, rows, text: tableToText(columns, rows), warnings, method: `sql:${tableName}`, truncated };
}

export async function parseDataFile(file: File, onProgress?: (pct: number) => void): Promise<ParsedFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`this file is ${(file.size / 1_048_576).toFixed(1)} mb and the limit is 100 mb`);
  }
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));
  let parsed: ParsedFile;
  if (ext === ".csv" || ext === ".txt") parsed = await parseCsv(file);
  else if (ext === ".tsv") parsed = await parseCsv(file, "\t");
  else if (ext === ".xlsx" || ext === ".xls") parsed = await parseSheet(file);
  else if (ext === ".json" || ext === ".ndjson") parsed = await parseJson(file);
  else if (ext === ".parquet") parsed = await parseParquet(file);
  else if (ext === ".pdf") parsed = await parsePdf(file);
  else if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") parsed = await parseImage(file, onProgress);
  else if (ext === ".sql") parsed = await parseSqlDump(file);
  else if (ext === ".md") {
    parsed = { kind: "document", columns: [], rows: [], text: await file.text(), warnings: [], method: "text", truncated: false };
  } else {
    throw new Error(`${ext || "this file type"} is not one of the formats asherin.data reads: ${ACCEPTED_EXTENSIONS.join(", ")}`);
  }
  if (parsed.truncated) {
    parsed.warnings.push(`only the first ${MAX_ROWS.toLocaleString()} rows were loaded into the queryable store`);
  }
  if (parsed.kind === "table" && parsed.rows.length === 0) {
    throw new Error("no rows were found in this file");
  }
  return parsed;
}
