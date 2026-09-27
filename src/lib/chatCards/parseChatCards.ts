export type CreamSpecies = "intelligence" | "resume" | "convo" | "brief";

export type CreamNode = { id: string; label: string; detail?: string; ring?: 0 | 1 | 2 };
export type CreamEdge = { from: string; to: string; label?: string };
export type CreamEvent = { date: string; label: string; description?: string };
export type CreamSection = { heading: string; body: string };
export type CreamJob = { org: string; title: string; dates: string; bullets: string[] };

export type CreamDoc = {
  species: CreamSpecies;
  title: string;
  subtitle?: string;
  classification?: string;
  contact?: string;
  sections: CreamSection[];
  nodes?: CreamNode[];
  edges?: CreamEdge[];
  events?: CreamEvent[];
  jobs?: CreamJob[];
  turns?: { who: "you" | "asherin"; text: string }[];
};

export type CreamIntent = { hit: boolean; species: CreamSpecies };

const W = 612;
const H = 792;
const M = 54;

const PAPER = { r: 0.9647, g: 0.9412, b: 0.8941 };
const INK = { r: 0.231, g: 0.184, b: 0.157 };
const GOLD = { r: 0.769, g: 0.639, b: 0.416 };
const CLAY = { r: 0.757, g: 0.498, b: 0.353 };
const SAGE = { r: 0.431, g: 0.506, b: 0.424 };
const ROSE = { r: 0.71, g: 0.42, b: 0.42 };
const BRONZE = { r: 0.651, g: 0.486, b: 0.322 };
const DUST = { r: 0.604, g: 0.545, b: 0.486 };

function topicAccent(title: string): { r: number; g: number; b: number } {
  const t = title.toLowerCase();
  if (/cyber|vuln|grain|hack/.test(t)) return SAGE;
  if (/shop|letter|store|retail/.test(t)) return CLAY;
  if (/court|legal|warrant|arrest/.test(t)) return INK;
  if (/family|person|household/.test(t)) return ROSE;
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 33 + title.charCodeAt(i)) >>> 0;
  return [GOLD, CLAY, SAGE, BRONZE, ROSE][h % 5];
}

export function detectCreamPdfIntent(text: string): CreamIntent {
  const low = String(text || "").toLowerCase();
  if (
    !/\bpdf\b/.test(low) &&
    !/creamy/.test(low) &&
    !/turn this (intelligence|intel|convo|conversation|resume|report|chat)/.test(low)
  ) {
    return { hit: false, species: "brief" };
  }
  const asks =
    /turn this .{0,40}into .{0,20}pdf/.test(low) ||
    /turn this (intelligence|intel|convo|conversation|resume|report|chat)/.test(low) ||
    /\bcreamy pdf\b/.test(low) ||
    /\b(intelligence|intel) (report )?pdf\b/.test(low) ||
    /\bresume pdf\b/.test(low) ||
    /\bpdf (file|report|resume|packet)\b/.test(low) ||
    /put (this|it) in a creamy/.test(low) ||
    /make .{0,20}(a )?creamy/.test(low);
  if (!asks) return { hit: false, species: "brief" };
  let species: CreamSpecies = "brief";
  if (/\bresume\b|\bcv\b/.test(low)) species = "resume";
  else if (/\bconvo\b|conversation|this chat|this thread/.test(low)) species = "convo";
  else if (/intelligence|intel file|dossier|empire|osint|background check|packet/.test(low)) species = "intelligence";
  return { hit: true, species };
}

function stripFences(s: string): string {
  return String(s || "")
    .replace(/```card:[a-z0-9-]+[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
}

function splitSections(md: string): CreamSection[] {
  const src = stripFences(md);
  const parts = src.split(/\n(?=#{1,3}\s+)/);
  const out: CreamSection[] = [];
  for (const p of parts) {
    const m = p.match(/^(#{1,3})\s+(.+)\n?([\s\S]*)$/);
    if (m) out.push({ heading: m[2].trim().slice(0, 120), body: m[3].trim().slice(0, 6000) });
    else if (p.trim()) out.push({ heading: "", body: p.trim().slice(0, 6000) });
  }
  return out.slice(0, 24);
}

export function creamDocFromConvo(messages: { role: string; content: string }[], species: CreamSpecies): CreamDoc {
  const lastAsst = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const body = String(lastAsst?.content || "");
  const userText = String(lastUser?.content || "");
  let sp = species;
  if (sp === "brief") {
    if (/ASHERIN EMPIRE INTELLIGENCE FILE|classification block|OSINT/i.test(body)) sp = "intelligence";
    else if (/\b(experience|education|skills)\b/i.test(body) && /resume|cv/i.test(userText + body)) sp = "resume";
  }
  const title =
    (body.match(/^#{1,2}\s+(.+)$/m) || [])[1]?.trim() ||
    userText
      .replace(/turn this .{0,80}$/i, "")
      .trim()
      .slice(0, 90) ||
    (sp === "intelligence" ? "ASHERIN EMPIRE INTELLIGENCE FILE" : sp === "resume" ? "resume" : "brief");

  const doc: CreamDoc = {
    species: sp,
    title: title.slice(0, 120),
    sections: splitSections(body).filter((s) => s.body || s.heading),
    turns: messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-24)
      .map((m) => ({
        who: m.role === "user" ? ("you" as const) : ("asherin" as const),
        text: stripFences(m.content).slice(0, 1800),
      })),
  };

  const classif = body.match(/primary INT[^\n]{0,200}/i);
  if (classif) doc.classification = classif[0].slice(0, 280);
  if (sp === "intelligence" && !doc.classification) {
    doc.classification = "OSINT · PAI · facts vs this is unsure · report written by asherin";
    doc.subtitle = "asherin empire intelligence file";
  }
  if (sp === "resume") {
    const contact = body.match(
      /(\+?\d[\d\s().-]{8,}\d)|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|asherin\.com|linkedin\.com\/in\/[^\s)]+/gi,
    );
    if (contact) doc.contact = [...new Set(contact)].slice(0, 4).join("  ·  ");
  }
  return doc;
}

export function mergeCreamPayload(base: CreamDoc, payload: Record<string, unknown>): CreamDoc {
  const d: CreamDoc = { ...base };
  const sp = String(payload.species || "");
  if (sp === "intelligence" || sp === "resume" || sp === "convo" || sp === "brief") d.species = sp;
  if (typeof payload.title === "string" && payload.title.trim()) d.title = payload.title.slice(0, 120);
  if (typeof payload.subtitle === "string") d.subtitle = payload.subtitle.slice(0, 200);
  if (typeof payload.classification === "string") d.classification = payload.classification.slice(0, 400);
  if (typeof payload.contact === "string") d.contact = payload.contact.slice(0, 240);
  if (Array.isArray(payload.sections)) {
    d.sections = payload.sections
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({ heading: String(s.heading || "").slice(0, 120), body: String(s.body || "").slice(0, 6000) }))
      .filter((s) => s.heading || s.body)
      .slice(0, 24);
  }
  if (Array.isArray(payload.nodes)) {
    d.nodes = payload.nodes
      .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
      .map((n, i) => ({
        id: String(n.id || `n${i}`).slice(0, 40),
        label: String(n.label || "").slice(0, 80),
        detail: String(n.detail || "").slice(0, 120),
        ring: (Number(n.ring) === 1 ? 1 : Number(n.ring) === 2 ? 2 : 0) as 0 | 1 | 2,
      }))
      .filter((n) => n.label)
      .slice(0, 18);
  }
  if (Array.isArray(payload.edges)) {
    d.edges = payload.edges
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => ({
        from: String(e.from || "").slice(0, 40),
        to: String(e.to || "").slice(0, 40),
        label: String(e.label || "").slice(0, 40),
      }))
      .filter((e) => e.from && e.to)
      .slice(0, 24);
  }
  if (Array.isArray(payload.events)) {
    d.events = payload.events
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => ({
        date: String(e.date || "").slice(0, 40),
        label: String(e.label || "").slice(0, 120),
        description: String(e.description || "").slice(0, 240),
      }))
      .filter((e) => e.date && e.label)
      .slice(0, 24);
  }
  if (Array.isArray(payload.jobs)) {
    d.jobs = payload.jobs
      .filter((j): j is Record<string, unknown> => !!j && typeof j === "object")
      .map((j) => ({
        org: String(j.org || "").slice(0, 80),
        title: String(j.title || "").slice(0, 80),
        dates: String(j.dates || "").slice(0, 40),
        bullets: Array.isArray(j.bullets) ? j.bullets.map((b) => String(b).slice(0, 200)).slice(0, 6) : [],
      }))
      .filter((j) => j.org || j.title)
      .slice(0, 12);
  }
  if (Array.isArray(payload.turns)) {
    d.turns = payload.turns
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t))
      .map((t) => ({
        who: String(t.who) === "you" ? ("you" as const) : ("asherin" as const),
        text: String(t.text || "").slice(0, 1800),
      }))
      .filter((t) => t.text)
      .slice(0, 24);
  }
  return d;
}

function esc(s: string): string {
  return winAnsi(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function winAnsi(s: string): string {
  let o = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 9) o += " ";
    else if (c === 10 || c === 13) o += ch;
    else if (c >= 32 && c <= 126) o += ch;
    else if (c >= 160 && c <= 255) o += ch;
    else o += "?";
  }
  return o;
}

function wrap(text: string, widthPt: number, size: number): string[] {
  const max = Math.max(18, Math.floor(widthPt / (size * 0.48)));
  const lines: string[] = [];
  for (const para of winAnsi(text).split(/\n+/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (next.length > max && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
  }
  return lines.slice(0, 400);
}

type RGB = { r: number; g: number; b: number };

class Pages {
  streams: string[] = [];
  private buf: string[] = [];
  y = H - 64;
  accent: RGB = GOLD;

  begin() {
    this.buf = [];
    this.y = H - 64;
    this.cmd(`${PAPER.r.toFixed(3)} ${PAPER.g.toFixed(3)} ${PAPER.b.toFixed(3)} rg`);
    this.cmd(`0 0 ${W} ${H} re f`);
    this.cmd(`${INK.r.toFixed(3)} ${INK.g.toFixed(3)} ${INK.b.toFixed(3)} rg`);
  }
  cmd(s: string) {
    this.buf.push(s);
  }
  rgb(c: RGB, fill = true) {
    this.cmd(`${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)} ${fill ? "rg" : "RG"}`);
  }
  rule(x1: number, y: number, x2: number, c: RGB = this.accent) {
    this.rgb(c, false);
    this.cmd("0.7 w");
    this.cmd(`${x1.toFixed(1)} ${y.toFixed(1)} m ${x2.toFixed(1)} ${y.toFixed(1)} l S`);
    this.rgb(INK);
  }
  text(str: string, x: number, y: number, size: number, font: "F1" | "F2" = "F1") {
    this.cmd(`BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(str)}) Tj ET`);
  }
  circle(x: number, y: number, r: number, c: RGB) {
    const k = 0.5522847498 * r;
    this.rgb(c);
    this.cmd(`${(x + r).toFixed(1)} ${y.toFixed(1)} m`);
    this.cmd(
      `${(x + r).toFixed(1)} ${(y + k).toFixed(1)} ${(x + k).toFixed(1)} ${(y + r).toFixed(1)} ${x.toFixed(1)} ${(y + r).toFixed(1)} c`,
    );
    this.cmd(
      `${(x - k).toFixed(1)} ${(y + r).toFixed(1)} ${(x - r).toFixed(1)} ${(y + k).toFixed(1)} ${(x - r).toFixed(1)} ${y.toFixed(1)} c`,
    );
    this.cmd(
      `${(x - r).toFixed(1)} ${(y - k).toFixed(1)} ${(x - k).toFixed(1)} ${(y - r).toFixed(1)} ${x.toFixed(1)} ${(y - r).toFixed(1)} c`,
    );
    this.cmd(
      `${(x + k).toFixed(1)} ${(y - r).toFixed(1)} ${(x + r).toFixed(1)} ${(y - k).toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} c f`,
    );
    this.rgb(INK);
  }
  need(h: number) {
    if (this.y - h < 56) this.flush();
  }
  flush() {
    this.streams.push(this.buf.join("\n"));
    this.begin();
  }
  finish(): string[] {
    if (this.buf.length) this.streams.push(this.buf.join("\n"));
    this.buf = [];
    return this.streams;
  }
}

function drawIntel(p: Pages, d: CreamDoc) {
  p.rgb(p.accent);
  p.text("ASHERIN EMPIRE INTELLIGENCE FILE", M, p.y, 9, "F2");
  p.y -= 18;
  p.rgb(INK);
  p.text(d.title, M, p.y, 16, "F2");
  p.y -= 10;
  p.rule(M, p.y, W - M);
  p.y -= 18;
  if (d.classification) {
    p.rgb(DUST);
    for (const line of wrap(d.classification, W - 2 * M, 9)) {
      p.need(12);
      p.text(line, M, p.y, 9);
      p.y -= 12;
    }
    p.rgb(INK);
    p.y -= 6;
  }
  let n = 1;
  for (const sec of d.sections) {
    p.need(36);
    const head = sec.heading || `section ${n}`;
    p.text(`${n}.  ${head}`, M, p.y, 11, "F2");
    p.y -= 14;
    for (const line of wrap(sec.body, W - 2 * M, 10)) {
      p.need(13);
      p.text(line, M, p.y, 10);
      p.y -= 13;
    }
    p.y -= 8;
    n++;
  }
}

function drawResume(p: Pages, d: CreamDoc) {
  p.text(d.title, M, p.y, 20, "F2");
  p.y -= 8;
  p.rule(M, p.y, W - M, BRONZE);
  p.y -= 16;
  if (d.contact) {
    p.rgb(DUST);
    p.text(d.contact, M, p.y, 9);
    p.rgb(INK);
    p.y -= 18;
  }
  if (d.jobs && d.jobs.length) {
    p.text("experience", M, p.y, 10, "F2");
    p.y -= 14;
    for (const j of d.jobs) {
      p.need(28);
      p.text(`${j.title}${j.org ? "  ·  " + j.org : ""}`, M, p.y, 11, "F2");
      p.y -= 12;
      if (j.dates) {
        p.rgb(DUST);
        p.text(j.dates, M, p.y, 9);
        p.rgb(INK);
        p.y -= 12;
      }
      for (const b of j.bullets) {
        for (const line of wrap("·  " + b, W - 2 * M, 10)) {
          p.need(13);
          p.text(line, M, p.y, 10);
          p.y -= 13;
        }
      }
      p.y -= 8;
    }
  }
  for (const sec of d.sections) {
    p.need(28);
    if (sec.heading) {
      p.text(sec.heading.toLowerCase(), M, p.y, 10, "F2");
      p.y -= 14;
    }
    for (const line of wrap(sec.body, W - 2 * M, 10)) {
      p.need(13);
      p.text(line, M, p.y, 10);
      p.y -= 13;
    }
    p.y -= 8;
  }
}

function drawConvo(p: Pages, d: CreamDoc) {
  p.text(d.title || "conversation", M, p.y, 14, "F2");
  p.y -= 8;
  p.rule(M, p.y, W - M, DUST);
  p.y -= 18;
  for (const t of d.turns || []) {
    p.need(28);
    p.rgb(t.who === "you" ? CLAY : SAGE);
    p.text(t.who, M, p.y, 9, "F2");
    p.rgb(INK);
    p.y -= 13;
    for (const line of wrap(t.text, W - 2 * M, 10)) {
      p.need(13);
      p.text(line, M, p.y, 10);
      p.y -= 13;
    }
    p.y -= 10;
  }
}

function drawBrief(p: Pages, d: CreamDoc) {
  p.text(d.title, M, p.y, 16, "F2");
  p.y -= 8;
  p.rule(M, p.y, W - M);
  p.y -= 18;
  if (d.subtitle) {
    p.rgb(DUST);
    p.text(d.subtitle, M, p.y, 10);
    p.rgb(INK);
    p.y -= 16;
  }
  for (const sec of d.sections) {
    if (sec.heading) {
      p.need(24);
      p.text(sec.heading, M, p.y, 11, "F2");
      p.y -= 14;
    }
    for (const line of wrap(sec.body, W - 2 * M, 10)) {
      p.need(13);
      p.text(line, M, p.y, 10);
      p.y -= 13;
    }
    p.y -= 8;
  }
}

function drawBubbles(p: Pages, d: CreamDoc) {
  const nodes = d.nodes;
  if (!nodes || nodes.length < 2) return;
  p.flush();
  p.y = H - 72;
  p.text("graph", M, p.y, 11, "F2");
  p.y -= 20;
  const colors = [p.accent, SAGE, CLAY, GOLD, ROSE, BRONZE, DUST];
  const seed = nodes.find((n) => n.ring === 0) || nodes[0];
  const others = nodes.filter((n) => n.id !== seed.id).slice(0, 10);
  const cx = W / 2;
  const cy = 420;
  p.circle(cx, cy, 36, p.accent);
  p.rgb(PAPER);
  p.text(seed.label.slice(0, 14), cx - 28, cy - 3, 8, "F2");
  p.rgb(INK);
  others.forEach((n, i) => {
    const a = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * 150;
    const y = cy + Math.sin(a) * 110;
    p.rgb(p.accent, false);
    p.cmd("0.6 w");
    p.cmd(`${cx.toFixed(1)} ${cy.toFixed(1)} m ${x.toFixed(1)} ${y.toFixed(1)} l S`);
    p.circle(x, y, 22, colors[i % colors.length]);
    p.rgb(PAPER);
    p.text(n.label.slice(0, 12), x - 20, y - 3, 7);
    p.rgb(INK);
  });
}

function drawTimeline(p: Pages, d: CreamDoc) {
  const ev = d.events;
  if (!ev || !ev.length) return;
  p.flush();
  p.y = H - 72;
  p.text("timeline", M, p.y, 11, "F2");
  p.y -= 18;
  p.rule(M, p.y, W - M, p.accent);
  p.y -= 16;
  for (const e of ev) {
    p.need(28);
    p.rgb(p.accent);
    p.circle(M + 4, p.y + 3, 3, p.accent);
    p.rgb(INK);
    p.text(e.date, M + 14, p.y, 9, "F2");
    p.text(e.label, M + 90, p.y, 10);
    p.y -= 12;
    if (e.description) {
      for (const line of wrap(e.description, W - 2 * M - 20, 9)) {
        p.need(12);
        p.rgb(DUST);
        p.text(line, M + 14, p.y, 9);
        p.y -= 12;
      }
      p.rgb(INK);
    }
    p.y -= 6;
  }
}

function assemblePdf(streams: string[]): Uint8Array {
  const objs: string[] = [];
  objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  const pageIds: number[] = [];
  let id = 3;
  const contentIds: number[] = [];
  for (let i = 0; i < streams.length; i++) {
    pageIds.push(id);
    contentIds.push(id + 1);
    id += 2;
  }
  const fontA = id;
  const fontB = id + 1;
  const kids = pageIds.map((n) => `${n} 0 R`).join(" ");
  objs.push(`2 0 obj << /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >> endobj\n`);
  streams.forEach((stream, i) => {
    const pid = pageIds[i];
    const cid = contentIds[i];
    objs.push(
      `${pid} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${cid} 0 R /Resources << /Font << /F1 ${fontA} 0 R /F2 ${fontB} 0 R >> >> >> endobj\n`,
    );
    const bytes = new TextEncoder().encode(stream);
    objs.push(`${cid} 0 obj << /Length ${bytes.length} >> stream\n${stream}\nendstream\nendobj\n`);
  });
  objs.push(`${fontA} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> endobj\n`);
  objs.push(`${fontB} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >> endobj\n`);

  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (const o of objs) {
    offsets.push(body.length);
    body += o;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export function compileCreamPdf(doc: CreamDoc): { bytes: Uint8Array; filename: string; pages: number } {
  const p = new Pages();
  p.accent = doc.species === "resume" ? BRONZE : doc.species === "convo" ? SAGE : topicAccent(doc.title);
  p.begin();
  if (doc.species === "intelligence") drawIntel(p, doc);
  else if (doc.species === "resume") drawResume(p, doc);
  else if (doc.species === "convo") drawConvo(p, doc);
  else drawBrief(p, doc);
  if (doc.species === "intelligence" || doc.species === "brief") drawBubbles(p, doc);
  if (doc.species === "intelligence" || doc.species === "resume") drawTimeline(p, doc);
  if (doc.species === "resume" && doc.nodes && doc.nodes.length) drawBubbles(p, doc);
  const streams = p.finish();
  const numbered = streams.map((s, i) => {
    const tag =
      doc.species === "intelligence"
        ? "asherin empire intelligence file"
        : doc.species === "resume"
          ? doc.title.toLowerCase()
          : doc.species === "convo"
            ? "conversation"
            : "brief";
    return (
      s +
      `\n${DUST.r.toFixed(3)} ${DUST.g.toFixed(3)} ${DUST.b.toFixed(3)} rg\nBT /F1 8 Tf ${M} 36 Td (${esc(tag)}) Tj ET\nBT /F1 8 Tf ${W - M - 18} 36 Td (${i + 1}) Tj ET\n`
    );
  });
  const bytes = assemblePdf(numbered.length ? numbered : streams);
  const slug = (doc.title || doc.species)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return { bytes, filename: `${slug || "asherin"}-cream.pdf`, pages: numbered.length };
}

function toPdfBlob(bytes: Uint8Array): Blob {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: "application/pdf" });
}

export function creamPdfObjectUrl(doc: CreamDoc): { url: string; filename: string; pages: number } {
  const { bytes, filename, pages } = compileCreamPdf(doc);
  const url = URL.createObjectURL(toPdfBlob(bytes));
  return { url, filename, pages };
}

export function hasCreamPdfFence(content: string): boolean {
  return /```card:cream-pdf/i.test(content || "");
}

export function creamDocFromPayload(payload: Record<string, unknown>, fallback?: CreamDoc): CreamDoc {
  const species = (["intelligence", "resume", "convo", "brief"] as CreamSpecies[]).includes(
    payload.species as CreamSpecies,
  )
    ? (payload.species as CreamSpecies)
    : fallback?.species || "brief";
  const base: CreamDoc =
    fallback ||
    ({
      species,
      title: String(payload.title || "brief"),
      sections: [],
    } as CreamDoc);
  return mergeCreamPayload(base, payload);
}

export function downloadCreamPdf(doc: CreamDoc) {
  const { bytes, filename } = compileCreamPdf(doc);
  const url = URL.createObjectURL(toPdfBlob(bytes));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Generalized "Card Protocol" parser for Aureon / Asher assistant streams.
// The model emits fenced blocks of the form:
//
//   ```card:<type>
//   { ...json payload... }
//   ```
//
// This walker splits assistant content into text + card segments in the
// order they appear. The legacy ```gematria fence is preserved as an alias
// for card:gematria so older streams still render.
//
// Design notes (flaw taxonomy applied):
//  - Regex is built fresh per call (no stateful /g lastIndex bugs).
//  - Payload JSON is best-effort; malformed payload → segment dropped, not thrown.
//  - Unknown card `type` values become inert `unknown` segments so the UI can
//    show a soft "unsupported card" chip instead of leaking raw JSON.
//  - Max payload size guard (8 KB) blocks accidental prompt-injection of huge
//    blobs into the render layer.

export type CardType =
  // Gematria family (domain-specific)
  | "gematria"
  | "gematria-compare"
  | "number-lookup"
  // Symbolic-exegesis family
  | "symbolic"
  | "symbolic-spine"
  // Universal shape-based cards
  | "info"
  | "entity"
  | "relationship"
  | "timeline"
  | "comparison"
  | "stat"
  | "quote"
  | "sources"
  | "list"
  | "warning"
  // Identity-resolution rack (person sweeps)
  | "candidates"
  | "cream-pdf";

export interface CardSegment {
  type: "card";
  cardType: CardType;
  payload: Record<string, unknown>;
}
export interface UnknownCardSegment {
  type: "card-unknown";
  rawType: string;
}
export interface TextSegment {
  type: "text";
  value: string;
}

export type ChatSegment = TextSegment | CardSegment | UnknownCardSegment;

// Payload guard is generous: universal cards may carry markdown descriptions
// and long timelines, so raise the ceiling from 8 KB → 32 KB.
const MAX_PAYLOAD_BYTES = 96 * 1024;
const KNOWN: ReadonlySet<CardType> = new Set([
  "gematria",
  "gematria-compare",
  "number-lookup",
  "symbolic",
  "symbolic-spine",
  "info",
  "entity",
  "relationship",
  "timeline",
  "comparison",
  "stat",
  "quote",
  "sources",
  "list",
  "warning",
  "candidates",
  "cream-pdf",
]);

/** Split assistant `content` into ordered text / card segments. */
export function parseChatCards(content: string): ChatSegment[] {
  const src = content ?? "";
  if (!src) return [{ type: "text", value: "" }];
  // Cheap short-circuit: no fences at all → single text segment.
  if (src.indexOf("```") === -1) return [{ type: "text", value: src }];

  // Match either the new `card:<type>` fence OR the legacy `gematria` fence.
  // Group 1 = new type (may be undefined). Group 2 = body.
  const re = /```(?:card:([a-z0-9-]+)|gematria)\s*\n?([\s\S]*?)```/gi;

  const out: ChatSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ type: "text", value: src.slice(last, m.index) });

    const rawType = (m[1] || "gematria").toLowerCase();
    const body = (m[2] || "").trim();

    last = m.index + m[0].length;

    if (body.length > MAX_PAYLOAD_BYTES) continue; // silently drop giant payloads

    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      // Back-compat: legacy gematria fence sometimes contained raw phrase text.
      if (rawType === "gematria") {
        const phrase = body.split("\n")[0].trim();
        if (phrase) payload = { phrase };
      }
    }

    if (!payload) continue;

    if (KNOWN.has(rawType as CardType)) {
      out.push({ type: "card", cardType: rawType as CardType, payload });
    } else {
      out.push({ type: "card-unknown", rawType });
    }
  }

  if (last < src.length) out.push({ type: "text", value: src.slice(last) });
  return out;
}
