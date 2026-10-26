// asherin.data — exports are files the operator saves; nothing is uploaded.

import type { DataRow } from "./types";

export function safeFileName(name: string, fallback = "asherin-data"): string {
  const s = name.toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || fallback;
}

export function downloadText(fileName: string, text: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // safari aborts a download whose url is revoked in the same tick
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(columns: string[], rows: DataRow[]): string {
  const head = columns.map(csvCell).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(","));
  return [head, ...body].join("\r\n");
}
