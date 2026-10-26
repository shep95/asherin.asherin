// Multi-format export — pdf / csv / json / markdown — generated on the device.
import jsPDF from 'jspdf';

export interface ExportItem {
  title: string;
  url?: string;
  snippet?: string;
  source?: string;
  tier?: number;
  publishDate?: string;
}

function download(filename: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportJSON(name: string, items: ExportItem[], meta: Record<string, unknown> = {}) {
  download(`${name}.json`, JSON.stringify({ exported_at: new Date().toISOString(), name, item_count: items.length, metadata: meta, items }, null, 2), 'application/json');
}

export function toCsv(items: ExportItem[]): string {
  const headers: (keyof ExportItem)[] = ['title', 'url', 'source', 'tier', 'publishDate', 'snippet'];
  const escape = (v: unknown) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
  const rows = items.map((i) => headers.map((h) => escape(i[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function exportCSV(name: string, items: ExportItem[]) {
  download(`${name}.csv`, toCsv(items), 'text/csv');
}

export function toMarkdown(title: string, items: ExportItem[], meta: Record<string, unknown> = {}): string {
  const lines = [`# ${title}`, '', `exported ${new Date().toISOString()} · ${items.length} items`, ''];
  for (const [k, v] of Object.entries(meta)) lines.push(`- ${k}: ${String(v)}`);
  if (Object.keys(meta).length) lines.push('');
  items.forEach((i, n) => {
    lines.push(`## ${n + 1}. ${i.title}`);
    if (i.url) lines.push(`<${i.url}>`);
    const facts = [i.source, i.tier ? `tier ${i.tier}` : '', i.publishDate].filter(Boolean).join(' · ');
    if (facts) lines.push(`_${facts}_`);
    if (i.snippet) lines.push('', i.snippet);
    lines.push('');
  });
  return lines.join('\n');
}

export function exportMarkdown(name: string, items: ExportItem[], meta: Record<string, unknown> = {}) {
  download(`${name}.md`, toMarkdown(name, items, meta), 'text/markdown');
}

export function exportPDF(title: string, items: ExportItem[]) {
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth() - 28;
  let y = 18;
  doc.setFontSize(14);
  doc.text(title.slice(0, 90), 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.text(`exported ${new Date().toISOString()} · ${items.length} items`, 14, y);
  y += 8;
  items.forEach((i, n) => {
    if (y > 270) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(10);
    const t = doc.splitTextToSize(`${n + 1}. ${i.title}`, width);
    doc.text(t, 14, y);
    y += t.length * 5;
    doc.setFontSize(8);
    if (i.url) {
      const u = doc.splitTextToSize(i.url, width);
      doc.text(u, 14, y);
      y += u.length * 4;
    }
    if (i.snippet) {
      const s = doc.splitTextToSize(i.snippet.slice(0, 400), width);
      doc.text(s, 14, y);
      y += s.length * 4;
    }
    y += 4;
  });
  doc.save(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
}
