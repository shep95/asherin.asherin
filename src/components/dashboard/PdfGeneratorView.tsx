import { useCallback, useRef, useState } from "react";
import { streamChat } from "@/lib/ai";

type Paper = "cream" | "white" | "night";
type Face = "cormorant" | "fraunces" | "newsreader" | "instrument" | "jost";
type Size = "letter" | "a4" | "book";

type PageDoc = {
  title: string;
  lede: string;
  body: string;
  paper: Paper;
  font: Face;
  size: Size;
};

type Chip = { label: string; p: string };
type Bubble = {
  role: "me" | "ai";
  text?: string;
  thought?: string;
  rec?: string;
  chips?: Chip[];
};

const PAGES_BRAIN =
  "you are the mouth for asherin.pages. job: a custom-styled pdf from scratch (type, grid, margins). not chat-with-pdf. not html2canvas. not an encyclopedia. never define what a pdf is. never Recommend: use a pdf when. reply with one short thought paragraph about how this letter looks, then one recommend sentence, then a fenced json block tagged page with keys title, lede, body, paper (cream|white|night), font (cormorant|fraunces|newsreader|instrument|jost), size (letter|a4|book). optional chips as a json array tagged chips of {label,p}. quiet file is default. never wallpaper mall. never stamp a font name on the letter.";

const PAPER: Record<Paper, { bg: string; ink: string }> = {
  cream: { bg: "#f3eee4", ink: "#1c1915" },
  white: { bg: "#fafafa", ink: "#161616" },
  night: { bg: "#12110f", ink: "#efe8d8" },
};

const FACE: Record<Face, string> = {
  cormorant: '"Cormorant Garamond", Georgia, serif',
  fraunces: "Fraunces, Georgia, serif",
  newsreader: "Newsreader, Georgia, serif",
  instrument: '"Instrument Serif", Georgia, serif',
  jost: "Jost, Inter, sans-serif",
};

const ASPECT: Record<Size, string> = {
  letter: "8.5 / 11",
  a4: "210 / 297",
  book: "6 / 9",
};

// width ÷ height — used to keep the sheet inside the viewport on both axes
const RATIO: Record<Size, number> = { letter: 8.5 / 11, a4: 210 / 297, book: 6 / 9 };

const CREAM_LETTER: PageDoc = {
  title: "look a little closer",
  lede: "a page that starts blank — not a website printed.",
  body: "type sits on a grid. margins hold. quiet file is default.",
  paper: "cream",
  font: "cormorant",
  size: "letter",
};

const emptyDoc = (): PageDoc => ({
  title: "",
  lede: "",
  body: "",
  paper: "cream",
  font: "cormorant",
  size: "letter",
});

function parseFence(src: string, tag: string): string | null {
  const re = new RegExp("```" + tag + "\\s*([\\s\\S]*?)```", "i");
  const m = src.match(re);
  return m ? m[1].trim() : null;
}

function looksLikeEncyclopedia(s: string) {
  return /universal document|perfect choice for reports|it is a standard, a format|Recommend:\s*use a pdf when|can be read on any device/i.test(
    s,
  );
}

function tryJson(s: string): Partial<PageDoc> | null {
  try {
    return JSON.parse(s) as Partial<PageDoc>;
  } catch {
    return null;
  }
}

function extractPageJson(src: string): Partial<PageDoc> | null {
  const raw = parseFence(src, "page") || parseFence(src, "json");
  if (raw) {
    const j = tryJson(raw);
    if (j && (j.title || j.lede || j.body || j.paper || j.font || j.size)) return j;
  }
  const m = src.match(/\{[^{}]*"title"\s*:[^{}]+\}/);
  if (m) {
    const j = tryJson(m[0]);
    if (j && (j.title || j.body)) return j;
  }
  return null;
}

function applyPage(j: Partial<PageDoc>, prev: PageDoc): PageDoc {
  const doc = { ...prev };
  if (j.title) doc.title = String(j.title).slice(0, 120);
  if (j.lede) doc.lede = String(j.lede).slice(0, 400);
  if (j.body) doc.body = String(j.body);
  if (j.paper === "cream" || j.paper === "white" || j.paper === "night") doc.paper = j.paper;
  if (j.font && j.font in FACE) doc.font = j.font;
  if (j.size === "letter" || j.size === "a4" || j.size === "book") doc.size = j.size;
  return doc;
}

function localSeed(t: string, prev: PageDoc): PageDoc {
  const low = t.toLowerCase();
  let d = { ...prev };
  const empty = !d.title && !d.body;
  const wantsPage = /cream|letter|page|pdf|font|serif|modern|title|look a little closer|quiet|type sits/.test(low);
  if (empty && wantsPage) d = { ...CREAM_LETTER };
  if (/cream/.test(low)) d.paper = "cream";
  if (/white paper|white page/.test(low)) d.paper = "white";
  if (/night|dark paper/.test(low)) d.paper = "night";
  if (/fraunces/.test(low)) d.font = "fraunces";
  else if (/newsreader/.test(low)) d.font = "newsreader";
  else if (/instrument/.test(low)) d.font = "instrument";
  else if (/\bjost\b|sans/.test(low)) d.font = "jost";
  else if (/cormorant/.test(low)) d.font = "cormorant";
  else if (/modern/.test(low)) d.font = "instrument";
  if (/\ba4\b/.test(low)) d.size = "a4";
  if (/\bbook\b/.test(low)) d.size = "book";
  return d;
}

function parseReply(src: string, prev: PageDoc): { thought: string; rec: string; doc: PageDoc; chips: Chip[] } {
  let doc = { ...prev };
  const j = extractPageJson(src);
  if (j) doc = applyPage(j, prev);
  let chips: Chip[] = [];
  const chipRaw = parseFence(src, "chips");
  if (chipRaw) {
    try {
      const arr = JSON.parse(chipRaw) as Chip[];
      if (Array.isArray(arr)) chips = arr.filter((c) => c?.label && c?.p).slice(0, 4);
    } catch {
      chips = [];
    }
  }
  const stripped = src.replace(/```[\s\S]*?```/g, "").trim();
  const encyclopedia = looksLikeEncyclopedia(stripped);
  const fallbackThought = doc.title
    ? "cream paper. type on a grid. say if a line feels wrong."
    : "the page is type on a grid. quiet file is default.";
  const fallbackRec = "say how it looks if it feels wrong.";
  if (encyclopedia) {
    return { thought: fallbackThought, rec: fallbackRec, doc, chips };
  }
  const parts = stripped.split(/\n+/).filter(Boolean);
  const thoughtRaw = (parts[0] || "").trim();
  const recRaw = (parts[1] || "").trim();
  const thought =
    thoughtRaw && thoughtRaw.length <= 280 && !/^recommend:/i.test(thoughtRaw) ? thoughtRaw : fallbackThought;
  const rec = recRaw && recRaw.length <= 220 && !looksLikeEncyclopedia(recRaw) ? recRaw : fallbackRec;
  return { thought, rec, doc, chips };
}

function packUserTurn(t: string, d: PageDoc) {
  return [
    PAGES_BRAIN,
    "current page json:",
    JSON.stringify(d),
    "job: typeset. mutate the json. never define pdf as a format. never encyclopedia.",
    "user:",
    t,
  ].join("\n\n");
}

/* ---------- pdf writer: the file must be the letter, not a generic sheet ---------- */

const MEDIA: Record<Size, [number, number]> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
  book: [432, 648],
};

// base-14 pairs: serif faces map to Times, jost maps to Helvetica.
const BASE14: Record<Face, { roman: string; italic: string; bold: string; css: string }> = {
  cormorant: { roman: "Times-Roman", italic: "Times-Italic", bold: "Times-Bold", css: "'Times New Roman', serif" },
  fraunces: { roman: "Times-Roman", italic: "Times-Italic", bold: "Times-Bold", css: "'Times New Roman', serif" },
  newsreader: { roman: "Times-Roman", italic: "Times-Italic", bold: "Times-Bold", css: "'Times New Roman', serif" },
  instrument: { roman: "Times-Roman", italic: "Times-Italic", bold: "Times-Bold", css: "'Times New Roman', serif" },
  jost: { roman: "Helvetica", italic: "Helvetica-Oblique", bold: "Helvetica-Bold", css: "Helvetica, Arial, sans-serif" },
};

// smart punctuation → latin-1 safe; anything else outside latin-1 is dropped rather than corrupting the xref.
function toLatin1(s: string) {
  return s
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0000-\u00FF]/g, "");
}

// keep the emitted file pure ascii so string length == byte length (xref offsets stay honest).
function pdfEscape(s: string) {
  let out = "";
  for (const ch of toLatin1(s)) {
    const c = ch.charCodeAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (c < 32 || c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += ch;
  }
  return out;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function widthOf(text: string, size: number, css: string, style: "" | "italic " | "bold ") {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * size * 0.5; // headless fallback: coarse but never NaN
  measureCtx.font = `${style}${size}px ${css}`;
  return measureCtx.measureText(text).width;
}

function wrapToWidth(s: string, max: number, size: number, css: string, style: "" | "italic " | "bold ") {
  const words = toLatin1(s).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (cur && widthOf(next, size, css, style) > max) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const f3 = (n: number) => n.toFixed(3);

type Block = { text: string; size: number; leading: number; style: "" | "italic " | "bold "; gapBefore: number; alpha: number };

function buildQuietPdf(doc: PageDoc) {
  const [pw, ph] = MEDIA[doc.size];
  const face = BASE14[doc.font];
  const paper = PAPER[doc.paper];
  const [br, bg, bb] = hexToRgb(paper.bg);
  const [ir, ig, ib] = hexToRgb(paper.ink);

  const mx = pw * 0.12;
  const mtop = ph * 0.11;
  const mbot = ph * 0.12;
  const colW = pw - mx * 2;
  const titleSize = Math.max(20, Math.min(34, pw * 0.042));

  const blocks: Block[] = [];
  if (doc.title) blocks.push({ text: doc.title, size: titleSize, leading: titleSize * 1.12, style: "", gapBefore: 0, alpha: 1 });
  if (doc.lede) blocks.push({ text: doc.lede, size: 12, leading: 17, style: "italic ", gapBefore: titleSize * 0.6, alpha: 0.7 });
  for (const para of (doc.body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    blocks.push({ text: para, size: 11.5, leading: 19, style: "", gapBefore: 14, alpha: 1 });
  }
  if (!blocks.length) blocks.push({ text: "untitled", size: titleSize, leading: titleSize * 1.12, style: "", gapBefore: 0, alpha: 1 });

  const fontKey = (s: Block["style"]) => (s === "italic " ? "/F2" : s === "bold " ? "/F3" : "/F1");

  // lay out into pages: text never runs off the sheet.
  const pages: string[][] = [];
  let cmds: string[] = [];
  let y = ph - mtop;
  let lastAlpha = -1;
  const newPage = () => {
    pages.push(cmds);
    cmds = [];
    y = ph - mtop;
    lastAlpha = -1;
  };
  for (const b of blocks) {
    // measured body column stays readable on wide sheets
    const maxW = b.size <= 12 ? Math.min(colW, b.size * 34) : colW;
    const lines = wrapToWidth(b.text, maxW, b.size, face.css, b.style);
    if (!lines.length) continue;
    y -= b.gapBefore;
    for (const ln of lines) {
      if (y - b.leading < mbot) newPage();
      if (b.alpha !== lastAlpha) {
        const a = b.alpha;
        cmds.push(`${f3(ir + (br - ir) * (1 - a))} ${f3(ig + (bg - ig) * (1 - a))} ${f3(ib + (bb - ib) * (1 - a))} rg`);
        lastAlpha = a;
      }
      cmds.push("BT", `${fontKey(b.style)} ${f3(b.size)} Tf`, `${f3(mx)} ${f3(y - b.size)} Td`, `(${pdfEscape(ln)}) Tj`, "ET");
      y -= b.leading;
    }
  }
  pages.push(cmds);

  const bgCmd = `${f3(br)} ${f3(bg)} ${f3(bb)} rg\n0 0 ${f3(pw)} ${f3(ph)} re f\n`;
  const streams = pages.map((c) => bgCmd + c.join("\n"));

  // object layout: 1 catalog, 2 pages, 3-5 fonts, then page + content pairs
  const firstPage = 6;
  const kids = streams.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${face.roman} /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${face.italic} /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${face.bold} /Encoding /WinAnsiEncoding >>`,
  ];
  streams.forEach((s, i) => {
    const contentRef = firstPage + i * 2 + 1;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f3(pw)} ${f3(ph)}] /Contents ${contentRef} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> >>`,
    );
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  });

  let body = "%PDF-1.4\n";
  const offs = [0];
  objs.forEach((o, i) => {
    offs.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) body += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}

function slug(s: string) {
  return (
    toLatin1(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

export default function PdfGeneratorView() {
  const [doc, setDoc] = useState<PageDoc>(emptyDoc);
  const [msgs, setMsgs] = useState<Bubble[]>([
    {
      role: "ai",
      thought: "a page is type on a grid. pictures are plates. fonts live in the file. quiet file is default.",
      rec: "say what the page is. then say how it looks if it feels wrong.",
      chips: [
        {
          label: "create · cream letter",
          p: "a cream letter. quiet serif. title: look a little closer. a page that starts blank — not a website printed. type sits on a grid. margins hold.",
        },
        { label: "find a font", p: "find a heavier serif like cormorant. use fraunces for the title." },
      ],
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef(doc);
  const msgsRef = useRef(msgs);
  docRef.current = doc;
  msgsRef.current = msgs;
  const ink = PAPER[doc.paper];

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setDraft("");
      setMsgs((m) => [...m, { role: "me", text: t }]);
      const seeded = localSeed(t, docRef.current);
      docRef.current = seeded;
      setDoc(seeded);
      setBusy(true);
      const hist: { role: "user" | "assistant"; content: string }[] = [];
      for (const m of msgsRef.current.slice(-6)) {
        if (m.role === "me" && m.text) hist.push({ role: "user", content: m.text });
        if (m.role === "ai") {
          const a = [m.thought, m.rec].filter(Boolean).join("\n");
          if (a) hist.push({ role: "assistant", content: a });
        }
      }
      hist.push({ role: "user", content: packUserTurn(t, seeded) });
      let acc = "";
      try {
        await streamChat({
          messages: hist,
          mode: "chat",
          depth: "shallow",
          brainContext: { prompt: PAGES_BRAIN, fileContents: [] }, // pages-mouth: brain in the user turn; seed the letter locally so the figure is never blank.
          onDelta: (chunk) => {
            acc += chunk;
          },
          onDone: () => {},
        });
        const parsed = parseReply(acc, docRef.current);
        docRef.current = parsed.doc;
        setDoc(parsed.doc);
        setMsgs((m) => [...m, { role: "ai", thought: parsed.thought, rec: parsed.rec, chips: parsed.chips }]);
      } catch (e) {
        setMsgs((m) => [
          ...m,
          {
            role: "ai",
            thought: "the mouth missed this pass. the letter on the right stayed.",
            rec: e instanceof Error ? e.message : "say it again.",
          },
        ]);
      }
      setBusy(false);
      box.current?.focus();
    },
    [busy],
  );

  const download = () => {
    try {
      const blob = buildQuietPdf(docRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(docRef.current.title || "page")}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a); // firefox needs the anchor in the tree
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); // revoke after the browser has read the blob
    } catch (e) {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          thought: "the compile failed before the file left the page.",
          rec: e instanceof Error ? e.message : "say it again.",
        },
      ]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/15 px-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-light tracking-[0.04em] text-foreground">pages</h1>
          <p className="truncate text-[11px] font-extralight text-muted-foreground/70">
            prompt a page. quiet file. you keep the pdf.
          </p>
        </div>
        <span className="hidden text-[10px] tracking-[0.14em] text-muted-foreground/75 sm:inline">quiet file</span>
        <button
          type="button"
          onClick={download}
          disabled={!doc.title && !doc.body}
          className="rounded-[10px] bg-accent px-3 py-1.5 text-xs text-accent-foreground disabled:opacity-40"
        >
          compile pdf →
        </button>
      </header>
      <section className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(180px,48dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(280px,34%)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="order-2 flex min-h-0 min-w-0 flex-col border-t border-border/15 lg:order-1 lg:border-r lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            {msgs.map((m, i) =>
              m.role === "me" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[92%] rounded-2xl border border-border/20 bg-foreground/15 px-3.5 py-2.5 text-[13px] font-light leading-relaxed">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl border border-border/20 bg-background/90 px-3.5 py-2.5 text-[13px] font-light leading-relaxed">
                    {m.thought && (
                      <details className="mb-2 border-b border-border/18 pb-2" open={i === msgs.length - 1}>
                        <summary className="cursor-pointer text-[10px] tracking-[0.16em] text-muted-foreground/70">
                          thought
                        </summary>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{m.thought}</p>
                      </details>
                    )}
                    <p>{m.rec}</p>
                    {!!m.chips?.length && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {m.chips.map((c) => (
                          <button
                            key={c.label}
                            type="button"
                            className="rounded-full border border-border/28 bg-card/45 px-2.5 py-1.5 text-[11px] text-muted-foreground"
                            onClick={() => send(c.p)}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && <p className="text-[11px] tracking-[0.16em] text-muted-foreground/60">setting type…</p>}
          </div>
          <form
            className="flex shrink-0 items-end gap-2 border-t border-border/15 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={box}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="make a page. find a font. or rewrite a line."
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-border/20 bg-card/30 px-3 py-2 text-sm font-light outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <button type="submit" className="rounded-xl bg-foreground px-3 py-2 text-sm text-background">
              →
            </button>
          </form>
        </div>
        <div
          className="order-1 flex min-h-0 min-w-0 items-center justify-center p-3 lg:order-2 lg:p-4"
          style={{ containerType: "size" }} // gives the sheet a height to measure against
        >
          <article
            className="overflow-hidden shadow-2xl"
            style={{
              aspectRatio: ASPECT[doc.size],
              width: `min(100%, ${RATIO[doc.size].toFixed(4)} * 100cqh)`, // fits on both axes; ratio never distorts
              height: "auto",
              background: ink.bg,
              color: ink.ink,
              fontFamily: FACE[doc.font],
              padding: "11% 12% 12%",
              containerType: "inline-size", // cqw units in the type scale resolve to 0 without a container
            }}
          >
            {doc.title || doc.body ? (
              <>
                <h2 className="text-[clamp(22px,4.2cqw,34px)] font-normal leading-[1.08] tracking-[-0.015em] lowercase">
                  {doc.title}
                </h2>
                {doc.lede ? (
                  <p className="mt-[4%] text-[clamp(11px,1.6cqw,13px)] italic leading-relaxed opacity-70">{doc.lede}</p>
                ) : null}
                {doc.body
                  ? doc.body
                      .split(/\n{2,}/)
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .map((p, i) => (
                        <p
                          key={i}
                          className="mt-[5%] max-w-[34em] text-[clamp(11px,1.5cqw,12.5px)] leading-[1.65] first-of-type:mt-[5%]"
                        >
                          {p}
                        </p>
                      ))
                  : null}
              </>
            ) : (
              <p className="grid h-full place-items-center text-[13px] tracking-wide opacity-30">
                say what the page is
              </p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
