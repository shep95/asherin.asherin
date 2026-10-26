// asherin.pages — deck kind: the shapes and the parser the deck generator uses.
// pure: no react, no dom, so the parsing of shepherd's answer is unit-testable.

/** bounds: the prompt carries at most this much of the notes; a pasted file over this is refused before it is read. */
export const DECK_LIMITS = { promptChars: 8000, fileBytes: 2 * 1024 * 1024, maxSlides: 40 } as const;

export interface Slide {
  id: string;
  title: string;
  body: string;
  layout: "title" | "content" | "two-column" | "bullets" | "quote";
}

export const LAYOUTS: { value: Slide["layout"]; label: string }[] = [
  { value: "title", label: "title slide" },
  { value: "content", label: "content" },
  { value: "two-column", label: "two column" },
  { value: "bullets", label: "bullets" },
  { value: "quote", label: "quote" },
];

const LAYOUT_SET = new Set<string>(LAYOUTS.map((l) => l.value));

/**
 * shepherd answers with a json array of slides. anything else — prose, a
 * truncated array, objects without strings — is reduced to what is actually
 * usable, never invented. returns [] when nothing usable came back.
 */
export function parseSlides(raw: string, stamp = Date.now()): Slide[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Slide[] = [];
  parsed.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const s = item as Record<string, unknown>;
    const title = typeof s.title === "string" ? s.title : "";
    const body = typeof s.body === "string" ? s.body : "";
    if (!title && !body) return;
    const layout = typeof s.layout === "string" && LAYOUT_SET.has(s.layout) ? (s.layout as Slide["layout"]) : "content";
    out.push({ id: `sl-${i}-${stamp}`, title, body, layout });
  });
  return out.slice(0, DECK_LIMITS.maxSlides);
}
