// asherin.knowledge — text shaping and chunking, pure and on-device.
//
// A source is cut into passages the operator can be pointed at: each chunk
// carries its character offsets into the source text so a citation can open
// the exact span. Paragraph boundaries are respected where they exist; a
// paragraph longer than the target is split at sentence ends; a run with no
// sentence ends is cut at the hard cap.

export const CHUNK = {
  /** aim for this many characters per passage. */
  target: 900,
  /** never exceed this many characters in one passage. */
  max: 1400,
  /** characters of the previous passage carried into the next one. */
  overlap: 120,
  /** a source is cut at this many characters; the row says so. */
  maxSourceChars: 400_000,
  /** passages per source — a bound on the index, not a quality knob. */
  maxChunks: 2_000,
} as const;

export interface Chunk {
  index: number;
  content: string;
  /** character offsets into the cleaned source text, [start, end). */
  start: number;
  end: number;
}

/** nul bytes dropped, line endings unified, runs of blank lines collapsed, cut at the cap. */
export function cleanSourceText(raw: string): { text: string; truncated: boolean } {
  const unified = raw.split("\u0000").join("").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const truncated = unified.length > CHUNK.maxSourceChars;
  return { text: truncated ? unified.slice(0, CHUNK.maxSourceChars) : unified, truncated };
}

/** [start, end) spans of paragraphs (blank-line separated), empty ones skipped. */
function paragraphSpans(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /\n\s*\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (text.slice(last, m.index).trim()) out.push([last, m.index]);
    last = m.index + m[0].length;
  }
  if (text.slice(last).trim()) out.push([last, text.length]);
  return out;
}

/** [start, end) spans of sentences inside [from, to). */
function sentenceSpans(text: string, from: number, to: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const slice = text.slice(from, to);
  const re = /[.!?]["')\]]*\s+|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) {
    const end = m.index + m[0].length;
    if (slice.slice(last, end).trim()) out.push([from + last, from + end]);
    last = end;
  }
  if (slice.slice(last).trim()) out.push([from + last, to]);
  return out;
}

/** Cut one span into pieces no longer than CHUNK.max, at whitespace where possible. */
function hardCut(text: string, from: number, to: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let s = from;
  while (to - s > CHUNK.max) {
    let cut = text.lastIndexOf(" ", s + CHUNK.max);
    if (cut <= s + CHUNK.max / 2) cut = s + CHUNK.max;
    out.push([s, cut]);
    s = cut;
  }
  if (to > s) out.push([s, to]);
  return out;
}

/**
 * Cut a cleaned source into passages. Deterministic: the same text always
 * gives the same chunks, so a re-index reproduces the same citations.
 */
export function chunkText(text: string): Chunk[] {
  // units: paragraphs, with long paragraphs split into sentences, then hard-cut.
  const units: Array<[number, number]> = [];
  for (const [ps, pe] of paragraphSpans(text)) {
    if (pe - ps <= CHUNK.max) { units.push([ps, pe]); continue; }
    const sentences = sentenceSpans(text, ps, pe);
    for (const [ss, se] of sentences) {
      if (se - ss <= CHUNK.max) units.push([ss, se]);
      else units.push(...hardCut(text, ss, se));
    }
  }

  const chunks: Chunk[] = [];
  let cur: [number, number] | null = null;
  const flush = () => {
    if (!cur) return;
    const content = text.slice(cur[0], cur[1]).trim();
    if (content) chunks.push({ index: chunks.length, content, start: cur[0], end: cur[1] });
    cur = null;
  };
  for (const [us, ue] of units) {
    if (chunks.length >= CHUNK.maxChunks) break;
    if (!cur) { cur = [us, ue]; continue; }
    if (ue - cur[0] <= CHUNK.target) { cur[1] = ue; continue; }
    // the next unit would push past the target: close this passage and start
    // the next one a little before the unit so a sentence split across the
    // boundary is still findable in both.
    const closedStart = cur[0];
    const closedEnd = cur[1];
    flush();
    let start = Math.max(closedEnd - CHUNK.overlap, closedStart + 1);
    const space = text.indexOf(" ", start);
    if (space >= 0 && space < us) start = space + 1;
    // the overlap never pushes a passage past the hard cap.
    if (ue - start > CHUNK.max) start = us;
    cur = [Math.min(start, us), ue];
  }
  flush();
  // trim content offsets so start/end point at the trimmed text.
  for (const c of chunks) {
    const raw = text.slice(c.start, c.end);
    const lead = raw.length - raw.trimStart().length;
    c.start += lead;
    c.end = c.start + c.content.length;
  }
  return chunks;
}

/* ───────────────────────── tokens ───────────────────────── */

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "he", "her", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "my", "of", "on", "or", "our", "she", "that", "the", "their", "then",
  "there", "these", "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who", "why",
  "will", "with", "you", "your", "about", "do", "does", "did", "can", "could", "would", "should", "say", "says",
  "tell", "me", "us", "them", "than", "so", "not", "no", "yes", "any", "all", "some", "just", "also", "very",
]);

/** light stemming: enough to match plurals and verb forms, never a dictionary. */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ness") && w.length > 5) return w.slice(0, -4);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("ly") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** lowercase, letters/digits only, stop words dropped, stemmed. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}
