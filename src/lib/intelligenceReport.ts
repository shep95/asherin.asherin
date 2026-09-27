/**
 * INTELLIGENCE REPORT ARTIFACT
 * ---------------------------------------------------------------------------
 * Turns an assistant answer into a branded, plain-text intelligence report the
 * operator can download as a .txt file.
 *
 * Design constraints:
 *  - Deterministic. No model call, no network. The report is a pure function of
 *    the message text, so the file always matches what is on screen.
 *  - Plain text only. Markdown control characters are resolved into typographic
 *    structure (rules, indents, numbered sections) because a .txt is read in a
 *    monospace viewer with no renderer.
 *  - Lossless links. A URL that only lived inside `[label](url)` would vanish in
 *    a naive strip, so links are rendered as `label <url>` and never dropped.
 *  - Fixed 78-column measure: fits every terminal, mail client and printout.
 */

export const REPORT_BRAND_TAGS = "#houseofasher #zia";
const COLS = 78;
const RULE = "=".repeat(COLS);
const THIN = "-".repeat(COLS);

/**
 * Does this turn ask for a report *as a file*?
 * Two independent signals must both fire — a report noun and a file/deliverable
 * cue — so ordinary phrasing like "give me an intelligence report" in the chat
 * body does not spawn a spurious download card on every analytical answer.
 */
const REPORT_NOUN =
  /\b(intel(?:ligence)?\s+(?:report|brief(?:ing)?|dossier|summary|assessment)|dossier|situation\s+report|sitrep|threat\s+assessment|intel\s+package|after[-\s]?action\s+report)\b/i;
const FILE_CUE =
  /\b(\.txt|txt\s+file|text\s+file|as\s+a\s+file|in\s+a\s+file|download(?:able)?|export|attach(?:ment|ed)?|save\s+(?:it|this|as)|generate\s+a\s+file|write\s+(?:it\s+)?to\s+a\s+file|document\s+file)\b/i;

export function wantsIntelReportFile(text: string): boolean {
  if (!text) return false;
  const t = text.slice(0, 2000);
  return REPORT_NOUN.test(t) && FILE_CUE.test(t);
}

/** Filesystem-safe slug; never empty, never longer than 48 chars. */
function slug(input: string): string {
  const s = (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "intelligence-report";
}

/** Deterministic, collision-resistant reference code derived from the content. */
function referenceCode(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

/** Hard-wrap a paragraph at COLS, honouring an indent, without breaking words. */
function wrap(text: string, indent = ""): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const width = Math.max(20, COLS - indent.length);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line.length) {
      line = w;
    } else if (line.length + 1 + w.length <= width) {
      line += ` ${w}`;
    } else {
      out.push(indent + line);
      line = w;
    }
  }
  if (line) out.push(indent + line);
  return out;
}

/** Resolve inline markdown to plain text while preserving every URL. */
function inline(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt, url) => `[image: ${alt || "untitled"} <${url}>]`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label, url) => `${label} <${url}>`)
    .replace(/`{3,}/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[ \t]+$/g, "");
}

/** Markdown body -> typographic plain-text body. Code fences are preserved verbatim. */
function renderBody(markdown: string): string[] {
  const src = (markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let sectionNo = 0;
  let inFence = false;
  let paragraph: string[] = [];
  // Block kind of the previous emitted element — a change of kind gets a blank
  // separator line so lists, quotes, code and tables never fuse into one slab.
  let lastKind = "";
  const sep = (kind: string) => {
    if (lastKind && lastKind !== kind && out.length && out[out.length - 1] !== "") out.push("");
    lastKind = kind;
  };

  const flush = () => {
    if (!paragraph.length) return;
    out.push(...wrap(inline(paragraph.join(" "))));
    out.push("");
    paragraph = [];
  };

  for (const raw of src) {
    const line = raw.replace(/\t/g, "    ");

    if (/^\s*```/.test(line)) {
      flush();
      sep("code");
      inFence = !inFence;
      out.push(inFence ? "    +-- CODE ".padEnd(COLS, "-") : "    " + "-".repeat(COLS - 4));
      continue;
    }
    if (inFence) {
      out.push("    " + line.replace(/\s+$/, ""));
      continue;
    }

    if (!line.trim()) { flush(); continue; }

    // Headings become numbered, ruled sections so structure survives in a .txt.
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const depth = h[1].length;
      const title = inline(h[2]).trim();
      if (depth <= 2) {
        sectionNo += 1;
        out.push(THIN);
        out.push(`${String(sectionNo).padStart(2, "0")}.  ${title.toUpperCase()}`);
        out.push(THIN, "");
      } else {
        out.push(`    ${title.toUpperCase()}`, "");
      }
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flush(); out.push(THIN, ""); continue; }

    // Tables are left structurally intact — realigning them loses column meaning.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      sep("table");
      out.push("    " + inline(line.trim()));
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      flush();
      sep("bullet");
      const depth = Math.floor(bullet[1].length / 2);
      const marker = depth === 0 ? "  * " : "    ".repeat(depth) + "  - ";
      const wrapped = wrap(inline(bullet[2]), " ".repeat(marker.length));
      if (wrapped.length) {
        out.push(marker + wrapped[0].trimStart(), ...wrapped.slice(1));
      }
      continue;
    }

    const numbered = line.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/);
    if (numbered) {
      flush();
      sep("numbered");
      const marker = `  ${numbered[2]}. `;
      const wrapped = wrap(inline(numbered[3]), " ".repeat(marker.length));
      if (wrapped.length) {
        out.push(marker + wrapped[0].trimStart(), ...wrapped.slice(1));
      }
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flush();
      sep("quote");
      for (const l of wrap(inline(quote[1]), "")) out.push("  | " + l);
      continue;
    }

    paragraph.push(line.trim());
  }
  flush();
  if (inFence) out.push("    " + "-".repeat(COLS - 4));

  // Collapse runs of blank lines so the file never looks padded.
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === ""));
}

/** Best-effort subject line: the first heading, else the first sentence. */
function deriveSubject(markdown: string, fallback: string): string {
  const heading = markdown.match(/^\s{0,3}#{1,3}\s+(.+)$/m)?.[1];
  const candidate = heading || markdown.replace(/[#*`>_-]/g, " ").split(/(?<=[.!?])\s|\n/)[0] || "";
  const clean = inline(candidate).replace(/\s+/g, " ").trim();
  return (clean.length >= 4 ? clean : fallback).slice(0, 96);
}

export interface IntelReportInput {
  /** The assistant answer, in markdown. */
  content: string;
  /** The operator's request that produced it — recorded as the tasking line. */
  request?: string;
  /** Conversation title, used as the subject fallback. */
  conversationTitle?: string;
  /** Message timestamp; defaults to now. */
  timestamp?: number | string | Date;
  /** Cited source URLs, if the turn carried any. */
  sources?: { title?: string; url?: string }[];
}

export interface IntelReportArtifact {
  filename: string;
  text: string;
  bytes: number;
  subject: string;
  reference: string;
}

/** Build the branded, downloadable intelligence report. Pure and deterministic. */
export function buildIntelReport(input: IntelReportInput): IntelReportArtifact {
  const content = (input.content || "").trim();
  const when = input.timestamp ? new Date(input.timestamp) : new Date();
  const stamp = Number.isFinite(when.getTime()) ? when : new Date();
  const iso = stamp.toISOString();
  const subject = deriveSubject(content, input.conversationTitle || "Intelligence Report");
  const reference = referenceCode(`${iso}|${subject}|${content.slice(0, 4000)}`);

  const header = [
    RULE,
    centre("H O U S E   O F   A S H E R"),
    centre("ASHERIN INTELLIGENCE DIRECTORATE"),
    RULE,
    "",
    pad("REPORT", "INTELLIGENCE REPORT"),
    pad("SUBJECT", subject),
    pad("REFERENCE", `HOA-${stamp.getUTCFullYear()}-${reference}`),
    pad("GENERATED", `${iso.replace("T", " ").replace(/\.\d+Z$/, "")} UTC`),
    pad("LOCAL", stamp.toLocaleString()),
    pad("HANDLING", "OPERATOR EYES ONLY — verify before dissemination"),
    ...(input.request ? wrapField("TASKING", input.request.replace(/\s+/g, " ").trim()) : []),
    "",
    RULE,
    "",
  ];

  const body = renderBody(content);

  const sources = (input.sources || []).filter((s) => s && s.url);
  const sourceBlock = sources.length
    ? [
        "",
        THIN,
        "SOURCES CITED",
        THIN,
        "",
        ...sources.slice(0, 60).flatMap((s, i) => {
          const label = (s.title || s.url || "").replace(/\s+/g, " ").trim().slice(0, 120);
          const marker = `  [${String(i + 1).padStart(2, "0")}] `;
          const wrapped = wrap(label, " ".repeat(marker.length));
          return [
            marker + (wrapped[0] || "").trimStart(),
            ...wrapped.slice(1),
            " ".repeat(marker.length) + s.url,
          ];
        }),
      ]
    : [];

  const footer = [
    "",
    RULE,
    centre(REPORT_BRAND_TAGS),
    centre("Generated by ASHERIN · House of Asher"),
    centre("Assessments are analytical products, not verified fact."),
    RULE,
    "",
  ];

  const text = [...header, ...body, ...sourceBlock, ...footer].join("\n");
  const filename = `houseofasher-intel-${slug(subject)}-${iso.slice(0, 10)}.txt`;

  return {
    filename,
    text,
    bytes: new TextEncoder().encode(text).length,
    subject,
    reference,
  };
}

function centre(s: string): string {
  const t = s.slice(0, COLS);
  const left = Math.max(0, Math.floor((COLS - t.length) / 2));
  return " ".repeat(left) + t;
}

function pad(label: string, value: string): string {
  return `${(label + ":").padEnd(12, " ")}${value}`;
}

function wrapField(label: string, value: string): string[] {
  const first = `${(label + ":").padEnd(12, " ")}`;
  const wrapped = wrap(value, " ".repeat(first.length));
  if (!wrapped.length) return [];
  return [first + wrapped[0].trimStart(), ...wrapped.slice(1)];
}

/** Human-readable size for the artifact card. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
