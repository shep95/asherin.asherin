import "./blobPolyfill";
import { describe, expect, it, vi } from "vitest";
import path from "path";
import JSZip from "jszip";
import {
  classifyFile, unsupportedReason, linesFromTextItems, cleanText, docxXmlToText, extractFile, combineText,
  safeFileName, formatChars, LIMITS, type ExtractEngines, type PdfDocLike,
} from "../extract";

// the browser build of pdfjs wants es2025 typed-array helpers node 22 lacks;
// the legacy build is the same reader with the polyfills. the worker runs
// in-process ("fake worker") from the package's own file.
vi.mock("pdfjs-dist", async () => {
  const legacy = await import("pdfjs-dist/legacy/build/pdf.mjs");
  legacy.GlobalWorkerOptions.workerSrc = path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  return legacy;
});

/** a one-page pdf with a real text layer, built by hand so the fixture is tiny. */
function miniPdf(text: string): ArrayBuffer {
  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out).buffer as ArrayBuffer;
}

const blob = (parts: BlobPart[], type: string) => new Blob(parts, { type });

/** a pdf stand-in whose pages are described by their text layer; "" means a scan. */
function fakePdf(pages: string[], renderable = true): ExtractEngines["openPdf"] {
  return async () => {
    const doc: PdfDocLike = {
      numPages: pages.length,
      async getPage(n) {
        const text = pages[n - 1];
        return {
          getTextContent: async () => ({ items: text ? [{ str: text, transform: [1, 0, 0, 1, 0, 100] }] : [] }),
          toImage: renderable ? async () => blob([`page-${n}`], "image/png") : undefined,
        };
      },
    };
    return doc;
  };
}

describe("classifyFile", () => {
  it("routes by mime first, then by extension", () => {
    expect(classifyFile("scan.pdf", "application/pdf")).toBe("pdf");
    expect(classifyFile("scan.PDF", "")).toBe("pdf");
    expect(classifyFile("photo.jpg", "image/jpeg")).toBe("image");
    expect(classifyFile("photo.png", "")).toBe("image");
    expect(classifyFile("notes.md", "")).toBe("text");
    expect(classifyFile("data.json", "application/json")).toBe("text");
    expect(classifyFile("diagram.svg", "image/svg+xml")).toBe("text");
    expect(classifyFile("letter.docx", "")).toBe("docx");
    expect(classifyFile("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
  });

  it("refuses what no device reader handles, with a reason", () => {
    expect(classifyFile("clip.mp4", "video/mp4")).toBe("unsupported");
    expect(classifyFile("photo.heic", "image/heic")).toBe("unsupported");
    expect(classifyFile("bundle.zip", "application/zip")).toBe("unsupported");
    expect(unsupportedReason("clip.mp4", "video/mp4")).toMatch(/audio and video/);
    expect(unsupportedReason("photo.heic", "image/heic")).toMatch(/heic/);
    expect(unsupportedReason("bundle.zip", "application/zip")).toMatch(/archives/);
    expect(unsupportedReason("thing.bin", "")).toMatch(/\.bin/);
  });
});

describe("linesFromTextItems", () => {
  it("joins items on one baseline and breaks on a new one", () => {
    const text = linesFromTextItems([
      { str: "first", transform: [1, 0, 0, 1, 10, 700] },
      { str: "line", transform: [1, 0, 0, 1, 40, 700] },
      { str: "second line", transform: [1, 0, 0, 1, 10, 680] },
      { str: "third", transform: [1, 0, 0, 1, 10, 660], hasEOL: true },
      { str: "fourth", transform: [1, 0, 0, 1, 10, 660] },
    ]);
    expect(text).toBe("first line\nsecond line\nthird\nfourth");
  });

  it("gives nothing for an empty layer", () => {
    expect(linesFromTextItems([])).toBe("");
  });
});

describe("cleanText", () => {
  it("drops nul bytes, unifies line endings and caps the length", () => {
    expect(cleanText("a\u0000b\r\nc\rd")).toEqual({ text: "ab\nc\nd", truncated: false });
    const big = "x".repeat(LIMITS.maxTextChars + 5);
    const out = cleanText(big);
    expect(out.truncated).toBe(true);
    expect(out.text).toHaveLength(LIMITS.maxTextChars);
  });
});

describe("docxXmlToText", () => {
  it("turns paragraphs into lines and decodes entities", () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Dear</w:t></w:r><w:r><w:t xml:space="preserve"> Sam &amp; co</w:t></w:r></w:p><w:p><w:r><w:t>a</w:t></w:r><w:tab/><w:r><w:t>b &#8212; &lt;c&gt;</w:t></w:r></w:p></w:body></w:document>`;
    expect(docxXmlToText(xml)).toBe("Dear Sam & co\na\tb — <c>");
  });
});

describe("extractFile", () => {
  it("decodes a text-like file as utf-8", async () => {
    const res = await extractFile(blob(["héllo\r\nworld"], "text/plain"), "note.txt");
    expect(res).toMatchObject({ status: "completed", method: "plain text", text: "héllo\nworld", truncated: false });
  });

  it("says empty for a file with only whitespace", async () => {
    const res = await extractFile(blob(["  \n\t"], "text/plain"), "blank.txt");
    expect(res.status).toBe("empty");
    expect(res.error).toMatch(/no text/);
  });

  it("refuses a zero-byte file and a file over the limit without reading it", async () => {
    expect((await extractFile(blob([], "text/plain"), "x.txt")).status).toBe("empty");
    const huge = { size: LIMITS.maxFileBytes + 1, type: "text/plain", arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" } as unknown as Blob;
    const res = await extractFile(huge, "big.txt");
    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/limit is 100 mb/);
  });

  it("reads a real pdf text layer through pdfjs", async () => {
    const res = await extractFile(blob([miniPdf("hello extract")], "application/pdf"), "mini.pdf");
    expect(res.status).toBe("completed");
    expect(res.method).toBe("pdf text layer");
    expect(res.pages).toBe(1);
    expect(res.ocrPages).toBe(0);
    expect(res.text).toContain("hello extract");
  });

  it("names a broken pdf instead of throwing", async () => {
    const res = await extractFile(blob(["%PDF-1.4 not really"], "application/pdf"), "broken.pdf");
    expect(res.status).toBe("failed");
    expect(res.error).toBe("this file is not a readable pdf");
  });

  it("reads a scanned page optically and keeps the text-layer pages as they are", async () => {
    const seen: string[] = [];
    const ocr = vi.fn(async (img: Blob) => {
      seen.push(await img.text());
      return "SCANNED WORDS";
    });
    const res = await extractFile(blob(["pdf"], "application/pdf"), "mixed.pdf", {
      engines: { openPdf: fakePdf(["a real text layer on page one", "", "page three text layer"]), ocr },
    });
    expect(ocr).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["page-2"]);
    expect(res.method).toBe("pdf text layer");
    expect(res.ocrPages).toBe(1);
    expect(res.text).toBe("a real text layer on page one\n\nSCANNED WORDS\n\npage three text layer");
    expect(res.error).toBe("1 scanned page read optically");
  });

  it("calls a fully scanned pdf 'pdf ocr' and stops after the ocr page budget", async () => {
    const pages = Array.from({ length: LIMITS.maxOcrPages + 3 }, () => "");
    const ocr = vi.fn(async () => "words");
    const res = await extractFile(blob(["pdf"], "application/pdf"), "scan.pdf", { engines: { openPdf: fakePdf(pages), ocr } });
    expect(ocr).toHaveBeenCalledTimes(LIMITS.maxOcrPages);
    expect(res.status).toBe("completed");
    expect(res.method).toBe("pdf text layer");
    expect(res.error).toMatch(/3 further scanned pages skipped/);
  });

  it("reports pages it cannot render rather than guessing", async () => {
    const ocr = vi.fn(async () => "never");
    const res = await extractFile(blob(["pdf"], "application/pdf"), "scan.pdf", { engines: { openPdf: fakePdf(["", ""], false), ocr } });
    expect(ocr).not.toHaveBeenCalled();
    expect(res.status).toBe("empty");
    expect(res.error).toMatch(/could not be rendered/);
  });

  it("sends an image straight to ocr and reports progress", async () => {
    const steps: number[] = [];
    const ocr = vi.fn(async (_img: Blob, onProgress?: (f: number) => void) => {
      onProgress?.(0.5);
      onProgress?.(1);
      return "  photo text  ";
    });
    const res = await extractFile(blob(["png"], "image/png"), "photo.png", {
      engines: { ocr },
      onProgress: (p) => {
        if (p.stage === "ocr" && typeof p.fraction === "number") steps.push(p.fraction);
      },
    });
    expect(res).toMatchObject({ status: "completed", method: "ocr", text: "photo text" });
    expect(steps).toEqual([0, 0.5, 1]);
  });

  it("explains an ocr engine that could not load", async () => {
    const ocr = vi.fn(async () => {
      throw new Error("Failed to fetch worker");
    });
    const res = await extractFile(blob(["png"], "image/png"), "photo.png", { engines: { ocr } });
    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/ocr engine could not load/);
  });

  it("reads a .docx through its document.xml", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>first paragraph</w:t></w:r></w:p><w:p><w:r><w:t>second</w:t></w:r></w:p></w:body></w:document>");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    const res = await extractFile(blob([data], ""), "letter.docx");
    expect(res).toMatchObject({ status: "completed", method: "docx", text: "first paragraph\nsecond" });
  });

  it("names a .docx that is not a zip", async () => {
    const res = await extractFile(blob(["not a zip"], ""), "letter.docx");
    expect(res.status).toBe("failed");
    expect(res.error).toBe("this file is not a readable .docx");
  });

  it("marks a kind with no reader as unsupported", async () => {
    const res = await extractFile(blob(["mp4"], "video/mp4"), "clip.mp4");
    expect(res.status).toBe("unsupported");
    expect(res.error).toMatch(/audio and video/);
  });
});

describe("output helpers", () => {
  it("combines only the files that produced text, in order, under a name banner", () => {
    const out = combineText([
      { file_name: "a.txt", extracted_text: "alpha" },
      { file_name: "b.pdf", extracted_text: null },
      { file_name: "c.png", extracted_text: "   " },
      { file_name: "d.docx", extracted_text: "delta" },
    ]);
    expect(out).toBe("=== a.txt ===\nalpha\n\n=== d.docx ===\ndelta");
    expect(combineText([])).toBe("");
  });

  it("makes a download name any file system accepts", () => {
    expect(safeFileName("session 1")).toBe("session-1");
    expect(safeFileName("  ../../etc/passwd  ")).toBe("etc-passwd");
    expect(safeFileName("///")).toBe("session");
    expect(safeFileName("x".repeat(100))).toHaveLength(60);
  });

  it("formats character counts the way the strip shows them", () => {
    expect(formatChars(0)).toBe("0 chars");
    expect(formatChars(999)).toBe("999 chars");
    expect(formatChars(4200)).toBe("4.2k chars");
    expect(formatChars(42_000)).toBe("42k chars");
    expect(formatChars(1_500_000)).toBe("1.5m chars");
  });
});
