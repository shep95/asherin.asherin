// IDE Pain Point #1 + #18: AI doesn't understand project context.
// Build a compact "project memory" map from a flat list of files that can be
// shoved into the AI system prompt without blowing the context window.
//
// Strategy:
//  1) File map (paths + first-line summary, no full content).
//  2) Top symbols per file (exports, components, hooks).
//  3) Detected conventions: indent, quotes, semis, common deps.
//  4) "Most relevant N" files for a given user query (token-cheap matching).

export interface ProjectFile {
  path: string;
  content: string;
  language?: string;
}

export interface ProjectIndex {
  fileMap: { path: string; summary: string; symbols: string[] }[];
  conventions: ProjectConventions;
  totalFiles: number;
  totalLines: number;
  generatedAt: number;
}

export interface ProjectConventions {
  indent: "  " | "    " | "\t";
  quotes: "'" | '"' | "`";
  semis: boolean;
  framework: "react" | "vue" | "svelte" | "vanilla" | "node" | "unknown";
  language: "ts" | "js" | "mixed";
  styling: "tailwind" | "css-modules" | "styled-components" | "vanilla" | "unknown";
  topImports: string[];
}

const SKIP_DIRS = /\b(node_modules|\.git|dist|build|coverage|\.next|\.cache)\b/;

export function buildProjectIndex(files: ProjectFile[]): ProjectIndex {
  const usable = files.filter(f => !SKIP_DIRS.test(f.path) && f.content && f.content.length < 200_000);
  const fileMap = usable.map(f => ({
    path: f.path,
    summary: summarizeFile(f.content),
    symbols: extractSymbols(f.content),
  }));
  const conventions = detectConventions(usable);
  const totalLines = usable.reduce((s, f) => s + (f.content.split("\n").length || 0), 0);
  return { fileMap, conventions, totalFiles: usable.length, totalLines, generatedAt: Date.now() };
}

function summarizeFile(content: string): string {
  const lines = content.split("\n").slice(0, 30);
  // Prefer first JSDoc/comment block.
  const docMatch = content.match(/\/\*\*([\s\S]{0,400}?)\*\//);
  if (docMatch) return docMatch[1].replace(/\n\s*\*\s?/g, " ").trim().slice(0, 160);
  // Fallback: first non-import non-blank line.
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith("import") || t.startsWith("//") || t.startsWith("/*")) continue;
    return t.slice(0, 160);
  }
  return "(no description)";
}

function extractSymbols(content: string): string[] {
  const out = new Set<string>();
  const patterns: RegExp[] = [
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+\{\s*([^}]+)\}/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      m[1].split(/\s*,\s*/).forEach(s => {
        const clean = s.replace(/\s+as\s+.*/, "").trim();
        if (clean && /^[A-Za-z_$]/.test(clean)) out.add(clean);
      });
      if (out.size > 12) break;
    }
  }
  return Array.from(out).slice(0, 12);
}

function detectConventions(files: ProjectFile[]): ProjectConventions {
  let tabIndent = 0, twoSpace = 0, fourSpace = 0;
  let single = 0, double = 0;
  let withSemi = 0, noSemi = 0;
  const importCounts = new Map<string, number>();
  let hasReact = false, hasVue = false, hasSvelte = false, hasNode = false;
  let tsCount = 0, jsCount = 0;
  let tailwind = false, cssModules = false, styledComp = false;

  for (const f of files) {
    const c = f.content;
    if (f.path.endsWith(".ts") || f.path.endsWith(".tsx")) tsCount++;
    else if (f.path.endsWith(".js") || f.path.endsWith(".jsx")) jsCount++;
    if (/^\t/m.test(c)) tabIndent++;
    if (/^ {2}\S/m.test(c)) twoSpace++;
    if (/^ {4}\S/m.test(c)) fourSpace++;
    single += (c.match(/'/g) || []).length;
    double += (c.match(/"/g) || []).length;
    withSemi += (c.match(/;\s*$/gm) || []).length;
    noSemi += (c.match(/[^;{}\s]\s*$/gm) || []).length;
    if (/from\s+['"]react['"]/.test(c)) hasReact = true;
    if (/from\s+['"]vue['"]/.test(c)) hasVue = true;
    if (/\.svelte/.test(f.path)) hasSvelte = true;
    if (/require\(/.test(c) || /process\.env/.test(c)) hasNode = true;
    if (/className=|@tailwind|@apply/.test(c)) tailwind = true;
    if (/\.module\.css/.test(f.path) || /styles\.[a-z]+/.test(c)) cssModules = true;
    if (/styled\./.test(c)) styledComp = true;
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(c)) !== null) {
      const pkg = m[1].startsWith(".") ? null : m[1].split("/").slice(0, m[1].startsWith("@") ? 2 : 1).join("/");
      if (pkg) importCounts.set(pkg, (importCounts.get(pkg) || 0) + 1);
    }
  }
  const topImports = Array.from(importCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);

  return {
    indent: tabIndent > Math.max(twoSpace, fourSpace) ? "\t" : fourSpace > twoSpace ? "    " : "  ",
    quotes: single > double ? "'" : '"',
    semis: withSemi > noSemi,
    framework: hasReact ? "react" : hasVue ? "vue" : hasSvelte ? "svelte" : hasNode ? "node" : "vanilla",
    language: tsCount > 0 && jsCount > 0 ? "mixed" : tsCount > 0 ? "ts" : "js",
    styling: tailwind ? "tailwind" : cssModules ? "css-modules" : styledComp ? "styled-components" : "vanilla",
    topImports,
  };
}

/** Pick the N most relevant files for an AI query. Token-cheap keyword overlap. */
export function pickRelevantFiles(index: ProjectIndex, files: ProjectFile[], query: string, n = 6): ProjectFile[] {
  const q = query.toLowerCase();
  const tokens = new Set(q.split(/[^a-z0-9]+/i).filter(t => t.length > 2));
  const scored = files
    .filter(f => !SKIP_DIRS.test(f.path))
    .map(f => {
      let score = 0;
      const lc = f.path.toLowerCase();
      for (const t of tokens) {
        if (lc.includes(t)) score += 5;
        if (f.content.toLowerCase().includes(t)) score += 1;
      }
      // Slight bonus for shorter files (more focused context).
      if (f.content.length < 4000) score += 2;
      return { f, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.f);
  return scored;
}

/** Render index as a compact system-prompt string. */
export function renderIndexForPrompt(index: ProjectIndex, relevant: ProjectFile[] = []): string {
  const conv = index.conventions;
  const map = index.fileMap.slice(0, 80).map(f => `- ${f.path}${f.symbols.length ? ` [${f.symbols.slice(0, 5).join(", ")}]` : ""}`).join("\n");
  const rel = relevant.length
    ? `\n\nRelevant files for this request (use these patterns, do not invent new ones):\n` +
      relevant.map(f => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`).join("\n\n")
    : "";
  return [
    `PROJECT CONVENTIONS (match these exactly):`,
    `- Language: ${conv.language}, Framework: ${conv.framework}, Styling: ${conv.styling}`,
    `- Indent: ${conv.indent === "\t" ? "tabs" : `${conv.indent.length} spaces`}, Quotes: ${conv.quotes}, Semicolons: ${conv.semis}`,
    `- Common imports: ${conv.topImports.join(", ") || "(none detected)"}`,
    ``,
    `PROJECT FILES (${index.totalFiles} files, ${index.totalLines} lines):`,
    map,
    rel,
  ].join("\n");
}
