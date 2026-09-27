import Papa from "papaparse";
import type { DataRow, ParsedFile } from "@/lib/data/types";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, parseDataFile } from "@/lib/data/parse";

export const ACATALEPSY_EXTENSIONS = [...ACCEPTED_EXTENSIONS, ".geojson", ".xml", ".log", ".yaml", ".yml"];
export const FORMAT_GROUPS = {
  tables: ["csv", "tsv", "xlsx", "xls", "parquet"],
  structured: ["json", "ndjson", "geojson", "xml", "yaml", "yml", "sql"],
  documents: ["pdf", "txt", "md", "log"],
  images: ["png", "jpg", "jpeg"],
  "not readable here": ["sqlite", "db", "avro", "orc", "sav", "dta", "sas7bdat", "shp", "dbf", "pptx", "docx"],
} as const;

const normalize = (raw: Record<string, unknown>[]): ParsedFile => {
  const columns = [...new Set(raw.slice(0, 500).flatMap(Object.keys))];
  const rows: DataRow[] = raw.slice(0, 50_000).map((r) => Object.fromEntries(columns.map((c) => {
    const v = r[c];
    return [c, v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : typeof v === "number" || typeof v === "boolean" ? v : String(v)];
  })));
  return { kind: "table", columns, rows, text: Papa.unparse(rows.slice(0, 400)), warnings: raw.length > 50_000 ? ["only the first 50,000 rows are available for interactive inspection"] : [], method: "structured-text", truncated: raw.length > 50_000 };
};

function parseGeoJson(text: string): ParsedFile {
  const data = JSON.parse(text) as { type?: string; features?: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }[] };
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("this geojson is not a feature collection");
  return normalize(data.features.map((f) => {
    const point = f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates as number[] : [];
    return { ...(f.properties ?? {}), longitude: point[0] ?? null, latitude: point[1] ?? null, geometry_type: f.geometry?.type ?? null };
  }));
}

function parseXml(text: string): ParsedFile {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("the xml is not well formed");
  const root = doc.documentElement;
  const candidates = [...root.children];
  if (!candidates.length) return normalize([{ [root.tagName]: root.textContent?.trim() ?? "" }]);
  const rows = candidates.map((node) => Object.fromEntries([...node.children].map((child) => [child.tagName, child.textContent?.trim() ?? ""])));
  return normalize(rows);
}

function parseSimpleYaml(text: string): ParsedFile {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const rows: Record<string, unknown>[] = [];
  let current: Record<string, unknown> = {};
  for (const line of lines) {
    if (/^\s*-\s+/.test(line) && Object.keys(current).length) { rows.push(current); current = {}; }
    const pair = line.replace(/^\s*-\s*/, "").match(/^([^:]+):\s*(.*)$/);
    if (pair) current[pair[1].trim()] = pair[2].trim().replace(/^['"]|['"]$/g, "");
  }
  if (Object.keys(current).length) rows.push(current);
  if (!rows.length) throw new Error("no flat yaml records were found; nested yaml is not read in this browser version");
  return normalize(rows);
}

export async function parseLocalFile(file: File, onProgress?: (pct: number) => void): Promise<ParsedFile> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`this file is ${(file.size / 1_048_576).toFixed(1)} mb; the local limit is 100 mb`);
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ACATALEPSY_EXTENSIONS.includes(ext)) throw new Error(`${ext || "this format"} is not readable here yet. the file was not uploaded or retained.`);
  if (ext === ".geojson") return parseGeoJson(await file.text());
  if (ext === ".xml") return parseXml(await file.text());
  if (ext === ".yaml" || ext === ".yml") return parseSimpleYaml(await file.text());
  if (ext === ".log") return parseDataFile(new File([await file.text()], file.name.replace(/\.log$/i, ".txt"), { type: "text/plain" }), onProgress);
  return parseDataFile(file, onProgress);
}

export function parsePastedTable(text: string): File {
  const delimiter = text.includes("\t") ? "\t" : ",";
  return new File([text], delimiter === "\t" ? "pasted-table.tsv" : "pasted-table.csv", { type: "text/plain" });
}