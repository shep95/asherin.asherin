// IDE Pain Point #2 + #20: AI suggestions are "almost right but not quite".
// Lightweight validator that catches the obvious classes of errors BEFORE
// AI-generated code is shown to the user. Runs entirely in-browser (no network)
// so it's safe for both the asherin code workspace and Asher IDE (AsherCodeModule).

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  line: number;
  message: string;
  rule: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** 0–100. >=80 is "show to user", <80 means flag with warning badge. */
  confidence: number;
  /** Human-readable headline e.g. "Looks good" / "Has 3 errors" */
  headline: string;
}

/**
 * Validate a code string for the given language.
 * Cheap heuristic checks that catch the bulk of "almost-right" AI mistakes:
 * - bracket / brace / paren balance
 * - unterminated strings & template literals
 * - obvious TS/JSX gotchas (missing imports, undefined React in JSX)
 * - hallucinated package names (very heuristic, only flags as warning)
 * - leftover ``` fences from raw model output
 */
export function validateCode(content: string, language: string = "tsx"): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lang = language.toLowerCase();
  const lines = content.split("\n");

  // 1. Stripped fences leftover
  if (/^\s*```/m.test(content)) {
    issues.push({ severity: "error", line: lines.findIndex(l => /^\s*```/.test(l)) + 1, message: "Code still contains markdown ``` fences — model output not cleaned.", rule: "stray-fence" });
  }

  // 2. Bracket balance
  const openers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closers = new Set([")", "]", "}"]);
  const stack: { ch: string; line: number }[] = [];
  let inStr: false | '"' | "'" | "`" = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];
    const lineNo = content.slice(0, i).split("\n").length;
    if (inLine) { if (ch === "\n") inLine = false; continue; }
    if (inBlock) { if (ch === "*" && next === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = false;
      continue;
    }
    if (ch === "/" && next === "/") { inLine = true; continue; }
    if (ch === "/" && next === "*") { inBlock = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (openers[ch]) stack.push({ ch, line: lineNo });
    else if (closers.has(ch)) {
      const top = stack.pop();
      if (!top || openers[top.ch] !== ch) {
        issues.push({ severity: "error", line: lineNo, message: `Unmatched ${ch}`, rule: "unbalanced-bracket" });
      }
    }
  }
  if (inStr) issues.push({ severity: "error", line: lines.length, message: `Unterminated ${inStr === "`" ? "template literal" : "string"}`, rule: "unterminated-string" });
  for (const open of stack) issues.push({ severity: "error", line: open.line, message: `Unclosed ${open.ch}`, rule: "unbalanced-bracket" });

  // 3. JSX/TSX heuristics
  if (lang === "tsx" || lang === "jsx" || lang === "ts" || lang === "js") {
    const usesJsx = /<[A-Za-z][^>]*?>/.test(content) && /(return|=>|\()\s*</.test(content);
    if (usesJsx && !/from\s+["']react["']/.test(content) && !/import\s+React/.test(content)) {
      // React 17+ doesn't strictly need it, downgrade to info.
      issues.push({ severity: "info", line: 1, message: "JSX detected but no React import (OK for React 17+ automatic runtime).", rule: "jsx-react-import" });
    }
    // Common AI hallucinated imports
    const halluc = /from\s+["']@?(react-icons-pro|@material\/[a-z-]+|tailwind-react|shadcn|@shadcn|@anthropic\/sdk-react)["']/.exec(content);
    if (halluc) issues.push({ severity: "warning", line: lineOf(content, halluc.index), message: `Possibly hallucinated package: ${halluc[1]}`, rule: "hallucinated-import" });
  }

  // 4. Empty file
  if (content.trim().length === 0) {
    issues.push({ severity: "warning", line: 1, message: "Generated file is empty.", rule: "empty" });
  }

  // 5. Very short responses to a code request — likely a refusal or bad output
  if (content.trim().length > 0 && content.trim().length < 20 && !/^\s*(\/\/|\/\*)/.test(content)) {
    issues.push({ severity: "warning", line: 1, message: "Response is suspiciously short — may be incomplete.", rule: "too-short" });
  }

  const errors = issues.filter(i => i.severity === "error").length;
  const warnings = issues.filter(i => i.severity === "warning").length;
  const confidence = Math.max(0, Math.min(100, 100 - errors * 25 - warnings * 8));
  const ok = errors === 0;
  const headline = ok
    ? warnings === 0
      ? "Looks good"
      : `${warnings} warning${warnings === 1 ? "" : "s"}`
    : `${errors} error${errors === 1 ? "" : "s"}${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`;

  return { ok, issues, confidence, headline };
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/**
 * Same idea but for a multi-file code patch: validate every file and return aggregate.
 */
export function validateFiles(files: { path: string; content: string }[]): {
  ok: boolean;
  confidence: number;
  perFile: { path: string; result: ValidationResult }[];
} {
  const perFile = files.map(f => {
    const ext = f.path.split(".").pop() ?? "tsx";
    return { path: f.path, result: validateCode(f.content, ext) };
  });
  const ok = perFile.every(f => f.result.ok);
  const confidence = perFile.length === 0 ? 100 : Math.round(perFile.reduce((s, f) => s + f.result.confidence, 0) / perFile.length);
  return { ok, confidence, perFile };
}
