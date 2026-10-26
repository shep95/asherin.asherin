// asherin.extract — on-device text extraction.
//
// Everything here runs in the browser. A pdf is read through pdfjs; a page
// whose text layer is empty (a scan) is rendered to a canvas and read
// optically with tesseract; an image goes straight to tesseract; a docx is
// unzipped and its paragraphs read; anything text-like is decoded as utf-8.
// Nothing about the file leaves the device. The one off-device fetch is the
// ocr engine itself (tesseract core + the english model) from cdn.jsdelivr.net
// the first time an image or a scan is read; the image is never sent anywhere.
//
// The engines are injectable so the orchestration can be unit-tested without
// a worker or a wasm runtime.

export type FileKind = "pdf" | "image" | "text" | "docx" | "unsupported";

export type ExtractMethod = "pdf text layer" | "pdf ocr" | "ocr" | "plain text" | "docx";

export type ExtractStatus = "completed" | "empty" | "unsupported" | "failed";

export interface ExtractResult {
  status: ExtractStatus;
  text: string;
  method: ExtractMethod | null;
  /** true when the text hit LIMITS.maxTextChars and was cut. */
  truncated: boolean;
  /** pages seen (pdf only). */
  pages: number;
  /** pages that needed ocr (pdf only). */
  ocrPages: number;
  /** operator-facing reason when status is failed / unsupported / empty. */
  error: string | null;
}

export interface ExtractProgress {
  stage: "reading" | "pages" | "ocr";
  /** 0..1 when known. */
  fraction?: number;
  page?: number;
  pages?: number;
}

export interface PdfTextItem {
  str: string;
  /** pdfjs transform matrix; index 5 is the baseline y. */
  transform?: number[];
  hasEOL?: boolean;
}

export interface PdfPageLike {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  /** render the page to an image for ocr; absent when no canvas exists. */
  toImage?(scale: number): Promise<Blob | null>;
}

export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy?(): Promise<void> | void;
}

export interface ExtractEngines {
  openPdf: (data: ArrayBuffer) => Promise<PdfDocLike>;
  ocr: (image: Blob, onProgress?: (fraction: number) => void) => Promise<string>;
  readDocx: (data: ArrayBuffer) => Promise<string>;
}

export interface ExtractOptions {
  onProgress?: (p: ExtractProgress) => void;
  engines?: Partial<ExtractEngines>;
}

export const LIMITS = {
  /** a file above this is refused before it is stored. */
  maxFileBytes: 100 * 1024 * 1024,
  /** text kept per file; the rest is cut and the row says so. */
  maxTextChars: 1_000_000,
  /** scanned pages read optically per pdf; later scans are skipped, not guessed. */
  maxOcrPages: 20,
  /** a page whose text layer is shorter than this is treated as a scan. */
  scanThresholdChars: 20,
  /** canvas scale for page ocr: 1.5 ≈ 108 dpi, enough for print type. */
  ocrScale: 1.5,
  /** the preview panel shows this much; the download holds everything. */
  previewChars: 200_000,
} as const;

export const MAX_FILE_BYTES_LABEL = "100 mb";

const TEXT_EXT = new Set([
  "txt", "text", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson", "yaml", "yml", "xml", "html", "htm",
  "svg", "log", "rtf", "srt", "vtt", "ics", "tex", "bib", "rst", "adoc", "org",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp",
  "cs", "php", "sh", "bash", "zsh", "ps1", "sql", "toml", "ini", "cfg", "conf", "env", "properties", "gradle",
  "dockerfile", "makefile", "lock",
]);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff", "pnm", "pbm", "pgm", "ppm"]);
const IMAGE_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif", "image/tiff",
  "image/x-portable-anymap", "image/x-portable-bitmap", "image/x-portable-graymap", "image/x-portable-pixmap",
]);

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase();
}

/** decide how a file will be read from its name and declared mime. */
export function classifyFile(name: string, mime: string): FileKind {
  const ext = extensionOf(name);
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m === DOCX_MIME || ext === "docx") return "docx";
  if (m === "image/svg+xml") return "text";
  if (IMAGE_MIME.has(m) || (m === "" || m === "application/octet-stream" ? IMAGE_EXT.has(ext) : false)) return "image";
  if (m.startsWith("image/") && IMAGE_EXT.has(ext)) return "image";
  if (m.startsWith("text/") || TEXT_EXT.has(ext) || m === "application/json" || m.endsWith("+json") || m.endsWith("+xml") || m === "application/xml") {
    return "text";
  }
  return "unsupported";
}

/** one honest sentence for a kind that has no reader on a device. */
export function unsupportedReason(name: string, mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("audio/") || m.startsWith("video/")) return "audio and video carry no text layer this device can read";
  if (m.startsWith("image/")) return `${extensionOf(name)} images cannot be read optically here — export as png or jpg first`;
  if (/zip|compressed|tar|rar|7z/.test(m) || /^(zip|rar|7z|tar|gz)$/.test(extensionOf(name))) return "archives are not opened — upload the files inside";
  return `no text reader for .${extensionOf(name)} on this device`;
}

/* ───────────────────────── text shaping ───────────────────────── */

/** rebuild lines from pdfjs text items by their baseline; a new baseline is a new line. */
export function linesFromTextItems(items: PdfTextItem[]): string {
  const out: string[] = [];
  let line = "";
  let lastY: number | null = null;
  for (const it of items) {
    const y = it.transform?.[5];
    if (typeof y === "number" && lastY !== null && Math.abs(y - lastY) > 2) {
      out.push(line.trimEnd());
      line = "";
    }
    if (it.str) line += (line && !line.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
    if (it.hasEOL) {
      out.push(line.trimEnd());
      line = "";
      lastY = null;
      continue;
    }
    if (typeof y === "number") lastY = y;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out.join("\n").replace(/[ \t]+\n/g, "\n").trim();
}

/** nul bytes gone, line endings unified, the cap applied. */
export function cleanText(raw: string): { text: string; truncated: boolean } {
  const cleaned = raw.split("\u0000").join("").replace(/\r\n?/g, "\n");
  if (cleaned.length <= LIMITS.maxTextChars) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, LIMITS.maxTextChars), truncated: true };
}

/** read word/document.xml: paragraphs become lines, tabs stay tabs, markup goes. */
export function docxXmlToText(xml: string): string {
  const body = xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(body).replace(/\t+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/* ───────────────────────── default engines ───────────────────────── */

async function openPdfWithPdfjs(data: ArrayBuffer): Promise<PdfDocLike> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // the worker is an asset of this build, served from the app's own origin
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  return {
    numPages: doc.numPages,
    async getPage(n) {
      const page = await doc.getPage(n);
      return {
        getTextContent: async () => (await page.getTextContent()) as unknown as { items: PdfTextItem[] },
        async toImage(scale) {
          if (typeof document === "undefined") return null;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
          canvas.width = 0;
          canvas.height = 0;
          return blob;
        },
      };
    },
    destroy: () => task.destroy(),
  };
}

type OcrWorker = {
  recognize: (image: Blob) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

let ocrWorker: Promise<OcrWorker> | null = null;
let ocrIdleTimer: ReturnType<typeof setTimeout> | null = null;
let ocrProgress: ((fraction: number) => void) | null = null;
const OCR_IDLE_MS = 60_000;

async function getOcrWorker(): Promise<OcrWorker> {
  if (!ocrWorker) {
    ocrWorker = (async () => {
      const { createWorker } = await import("tesseract.js");
      // the worker script ships with this build (own origin); it pulls the
      // wasm core and the english model from cdn.jsdelivr.net, which the csp allows.
      const workerPath = (await import("tesseract.js/dist/worker.min.js?url")).default;
      const w = await createWorker("eng", 1, {
        workerPath,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") ocrProgress?.(m.progress);
        },
      });
      return w as unknown as OcrWorker;
    })();
    ocrWorker.catch(() => {
      ocrWorker = null;
    });
  }
  return ocrWorker;
}

function scheduleOcrRelease() {
  if (ocrIdleTimer) clearTimeout(ocrIdleTimer);
  ocrIdleTimer = setTimeout(() => {
    void releaseOcrWorker();
  }, OCR_IDLE_MS);
}

/** terminate the ocr worker now; the next image starts a fresh one. */
export async function releaseOcrWorker(): Promise<void> {
  if (ocrIdleTimer) {
    clearTimeout(ocrIdleTimer);
    ocrIdleTimer = null;
  }
  const w = ocrWorker;
  ocrWorker = null;
  if (!w) return;
  try {
    await (await w).terminate();
  } catch {
    /* already gone */
  }
}

async function ocrWithTesseract(image: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  const worker = await getOcrWorker();
  ocrProgress = onProgress ?? null;
  try {
    const { data } = await worker.recognize(image);
    return data.text ?? "";
  } finally {
    ocrProgress = null;
    scheduleOcrRelease();
  }
}

async function readDocxWithJszip(data: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("this .docx has no word/document.xml inside it");
  return docxXmlToText(await entry.async("string"));
}

const DEFAULT_ENGINES: ExtractEngines = {
  openPdf: openPdfWithPdfjs,
  ocr: ocrWithTesseract,
  readDocx: readDocxWithJszip,
};

/* ───────────────────────── the pass ───────────────────────── */

function result(partial: Partial<ExtractResult> & Pick<ExtractResult, "status">): ExtractResult {
  return { text: "", method: null, truncated: false, pages: 0, ocrPages: 0, error: null, ...partial };
}

function finish(raw: string, method: ExtractMethod, extra: Partial<ExtractResult> = {}): ExtractResult {
  const { text, truncated } = cleanText(raw);
  if (!text.trim()) {
    return result({
      status: "empty",
      method,
      error: method === "ocr" || method === "pdf ocr" ? "no readable text was found optically" : "the file holds no text",
      ...extra,
    });
  }
  return result({ status: "completed", text, method, truncated, ...extra });
}

function describeError(err: unknown, kind: FileKind): string {
  const name = err instanceof Error ? err.name : "";
  const msg = (err instanceof Error ? err.message : String(err ?? "")).trim();
  if (kind === "pdf") {
    if (name === "PasswordException" || /password/i.test(msg)) return "this pdf is password-protected — remove the password and upload it again";
    if (name === "InvalidPDFException" || /invalid pdf/i.test(msg)) return "this file is not a readable pdf";
    if (/worker|network|fetch|import/i.test(msg)) return "the pdf reader could not start — reload and try again";
  }
  if (kind === "image" || /tesseract|ocr/i.test(msg)) {
    if (/network|fetch|load|import|worker|wasm/i.test(msg)) return "the ocr engine could not load — it needs one network fetch the first time; check the connection and retry";
    return "the image could not be read optically";
  }
  if (kind === "docx" && /zip|central directory|end of data/i.test(msg)) return "this file is not a readable .docx";
  const low = msg ? msg.charAt(0).toLowerCase() + msg.slice(1) : "unknown error";
  return `extraction failed: ${low.slice(0, 160)}`;
}

async function extractPdf(file: Blob, engines: ExtractEngines, onProgress?: (p: ExtractProgress) => void): Promise<ExtractResult> {
  onProgress?.({ stage: "reading" });
  const doc = await engines.openPdf(await file.arrayBuffer());
  try {
    const pages = doc.numPages;
    const out: string[] = [];
    let total = 0;
    let ocrPages = 0;
    let scansSkipped = 0;
    let scansUnrenderable = 0;
    for (let i = 1; i <= pages && total < LIMITS.maxTextChars; i++) {
      onProgress?.({ stage: "pages", page: i, pages, fraction: (i - 1) / pages });
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = linesFromTextItems(content.items ?? []);
      if (text.length < LIMITS.scanThresholdChars) {
        if (ocrPages >= LIMITS.maxOcrPages) {
          scansSkipped++;
        } else if (!page.toImage) {
          scansUnrenderable++;
        } else {
          const image = await page.toImage(LIMITS.ocrScale);
          if (!image) {
            scansUnrenderable++;
          } else {
            onProgress?.({ stage: "ocr", page: i, pages, fraction: 0 });
            const read = await engines.ocr(image, (f) => onProgress?.({ stage: "ocr", page: i, pages, fraction: f }));
            ocrPages++;
            if (read.trim()) text = read.trim();
          }
        }
      }
      out.push(text);
      total += text.length + 2;
    }
    const method: ExtractMethod = ocrPages > 0 && ocrPages === pages ? "pdf ocr" : "pdf text layer";
    const notes: string[] = [];
    if (ocrPages > 0 && method === "pdf text layer") notes.push(`${ocrPages} scanned page${ocrPages === 1 ? "" : "s"} read optically`);
    if (scansSkipped > 0) notes.push(`${scansSkipped} further scanned page${scansSkipped === 1 ? "" : "s"} skipped — ocr stops after ${LIMITS.maxOcrPages} pages per pdf`);
    if (scansUnrenderable > 0) notes.push(`${scansUnrenderable} page${scansUnrenderable === 1 ? "" : "s"} had no text layer and could not be rendered here`);
    const res = finish(out.join("\n\n"), method, { pages, ocrPages });
    if (notes.length) res.error = notes.join("; ");
    return res;
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Read one file's text on this device. Never throws: every outcome is a
 * status the interface can name.
 */
export async function extractFile(file: Blob & { name?: string; type: string }, name: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const engines: ExtractEngines = { ...DEFAULT_ENGINES, ...(opts.engines ?? {}) };
  const kind = classifyFile(name, file.type);
  if (file.size === 0) return result({ status: "empty", error: "the file is empty (0 bytes)" });
  if (file.size > LIMITS.maxFileBytes) {
    return result({ status: "failed", error: `this file is ${(file.size / 1_048_576).toFixed(1)} mb and the limit is ${MAX_FILE_BYTES_LABEL}` });
  }
  try {
    switch (kind) {
      case "text":
        opts.onProgress?.({ stage: "reading" });
        return finish(await file.text(), "plain text");
      case "docx":
        opts.onProgress?.({ stage: "reading" });
        return finish(await engines.readDocx(await file.arrayBuffer()), "docx");
      case "image": {
        opts.onProgress?.({ stage: "ocr", fraction: 0 });
        const text = await engines.ocr(file, (f) => opts.onProgress?.({ stage: "ocr", fraction: f }));
        return finish(text.trim(), "ocr");
      }
      case "pdf":
        return await extractPdf(file, engines, opts.onProgress);
      default:
        return result({ status: "unsupported", error: unsupportedReason(name, file.type) });
    }
  } catch (err) {
    return result({ status: "failed", error: describeError(err, kind) });
  }
}

/* ───────────────────────── output ───────────────────────── */

export interface CombinableFile {
  file_name: string;
  extracted_text: string | null;
}

/** the single txt: one block per file that produced text, in upload order. */
export function combineText(files: CombinableFile[]): string {
  return files
    .filter((f) => f.extracted_text && f.extracted_text.trim())
    .map((f) => `=== ${f.file_name} ===\n${f.extracted_text}`)
    .join("\n\n");
}

/** a download name that survives every file system: letters, digits, dash, dot. */
export function safeFileName(name: string, fallback = "session"): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return base || fallback;
}

export function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k chars`;
  return `${(n / 1_000_000).toFixed(1)}m chars`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}
