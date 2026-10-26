/**
 * shepherd — the reference datasets.
 *
 * Two further shepherd documents ship with the app beside the doctrine:
 * the aesthetic psychology dataset (58 research records, each with a design
 * rule, its limit and a quality gate) and the universal software
 * architecture dataset (narrative-to-code, the repair taxonomy, 100 domains,
 * 28 profiles, 50 senior patterns, 80 anti-patterns). Neither is part of
 * who shepherd is, so neither goes on every turn; both are retrievable, so a
 * question about an interface, a layout, a bug, an architecture or a repair
 * can be answered in the datasets' own words.
 */
import aesthetic from "./datasets/aesthetic_psychology.txt?raw";
import architecture from "./datasets/software_architecture.txt?raw";
import type { DoctrineSection } from "./shepherdBrain";

export const AESTHETIC_DATASET: string = aesthetic.replace(/\r\n?/g, "\n");
export const ARCHITECTURE_DATASET: string = architecture.replace(/\r\n?/g, "\n");

/** one section per research record; the preamble (purpose, legend, root model) is one section of its own. */
export function parseAestheticRecords(text: string = AESTHETIC_DATASET): DoctrineSection[] {
  const lines = text.split("\n");
  const out: DoctrineSection[] = [];
  let title = "aesthetic psychology — preamble";
  let start = 1;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) out.push({ title, body, line: start });
  };
  for (let i = 0; i < lines.length; i++) {
    const m = /^RECORD (\d+) \| ([^|]+) \| (.+)$/.exec(lines[i].trim());
    if (m) {
      flush();
      title = `aesthetic record ${m[1]} — ${m[2].trim()} — ${m[3].trim()}`;
      start = i + 1;
      buf = [];
    } else {
      buf.push(lines[i]);
    }
  }
  flush();
  return out;
}

/**
 * the architecture dataset is organised by upper-case headings (PART …,
 * DOMAIN FAMILY: …, ANTIPATTERN FAMILY: …, FIVE QUESTIONS, …). each heading
 * opens a section; the part title is carried into its families so a hit on
 * "anti-pattern" also reads as such.
 */
export function parseArchitectureSections(text: string = ARCHITECTURE_DATASET): DoctrineSection[] {
  const lines = text.split("\n");
  const out: DoctrineSection[] = [];
  let part = "";
  let title = "software architecture — preamble";
  let start = 1;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) out.push({ title, body, line: start });
  };
  const isHeading = (t: string, prev: string) =>
    t.length > 3 && t.length < 90 && !prev.trim() && /^[A-Z][A-Z0-9 —&/:,().-]*$/.test(t) && !/^[A-Z]{2}-\d{3}/.test(t);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const prev = i > 0 ? lines[i - 1] : "";
    if (isHeading(t, prev)) {
      flush();
      if (/^PART /.test(t)) part = t;
      title = (part && t !== part ? `${part} · ${t}` : t).toLowerCase();
      start = i + 1;
      buf = [];
    } else {
      buf.push(lines[i]);
    }
  }
  flush();
  return out;
}

let cached: DoctrineSection[] | null = null;
/** every retrievable dataset section, parsed once. */
export function datasetSections(): DoctrineSection[] {
  if (!cached) cached = [...parseAestheticRecords(), ...parseArchitectureSections()];
  return cached;
}
