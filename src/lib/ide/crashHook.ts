// ============================================================
// IDE Crash Hook — parses terminal output / runtime logs for
// real crashes (stack traces, exceptions, panics) and returns
// a structured CrashEvent. Used by IdeTerminal + AureonIdeView
// to auto-open the failing file and push the context into AI chat.
// ============================================================

export interface CrashEvent {
  raw: string;
  /** File path mentioned in the trace (best-effort). */
  file: string | null;
  /** 1-indexed line number, if extractable. */
  line: number | null;
  /** Column if available. */
  column: number | null;
  /** Error type / class (e.g. TypeError, ReferenceError). */
  type: string | null;
  /** Human message after the error type. */
  message: string;
}

// Patterns ordered from most specific to most permissive.
const PATTERNS: Array<{ kind: string; re: RegExp; extract: (m: RegExpMatchArray) => Partial<CrashEvent> }> = [
  // JS V8/Chromium:  TypeError: foo is not a function\n    at handler (src/App.tsx:42:13)
  {
    kind: "js-v8",
    re: /([A-Z][a-zA-Z]*Error|Error|Exception):\s*([^\n]+)[\s\S]*?at[^(]*\(?([^\s():]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt)):(\d+)(?::(\d+))?\)?/,
    extract: (m) => ({ type: m[1], message: m[2], file: m[3], line: Number(m[4]), column: m[5] ? Number(m[5]) : null }),
  },
  // Python:  File "main.py", line 45, in <module>\n  ...\nValueError: bad
  {
    kind: "python",
    re: /File\s+"([^"]+\.py)",\s+line\s+(\d+)[\s\S]*?\n\s*([A-Z][a-zA-Z]*(?:Error|Exception)):\s*([^\n]+)/,
    extract: (m) => ({ file: m[1], line: Number(m[2]), type: m[3], message: m[4] }),
  },
  // Generic file:line:col with message on same line
  {
    kind: "generic",
    re: /([^\s():]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|c|cpp|h)):(\d+)(?::(\d+))?[^\n]*?\b(error|Error|Exception|Panic|fatal)\b[^\n]*/,
    extract: (m) => ({ file: m[1], line: Number(m[2]), column: m[3] ? Number(m[3]) : null, type: m[4], message: m[0] }),
  },
  // Rust panic
  {
    kind: "rust-panic",
    re: /thread '[^']+' panicked at ([^:]+):(\d+):(\d+):\s*([^\n]+)/,
    extract: (m) => ({ file: m[1], line: Number(m[2]), column: Number(m[3]), type: "panic", message: m[4] }),
  },
  // Bare unhandled exception with no location
  {
    kind: "bare",
    re: /\b(Uncaught|Unhandled)\b[^\n]*?([A-Z][a-zA-Z]*Error|Error|Exception):\s*([^\n]+)/,
    extract: (m) => ({ type: m[2], message: m[3] }),
  },
];

export function detectCrash(text: string): CrashEvent | null {
  if (!text) return null;
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const partial = p.extract(m);
      return {
        raw: text.slice(Math.max(0, (m.index ?? 0) - 50), (m.index ?? 0) + m[0].length + 200),
        file: partial.file ?? null,
        line: partial.line ?? null,
        column: partial.column ?? null,
        type: partial.type ?? null,
        message: (partial.message ?? "").trim() || "Crash detected",
      };
    }
  }
  return null;
}

/** Build a structured AI prompt from a CrashEvent + surrounding file content. */
export function buildCrashPrompt(evt: CrashEvent, fileSnippet?: { name: string; content: string; startLine: number }): string {
  const lines = [
    "[CRASH HOOK — auto-detected runtime error]",
    `Type: ${evt.type ?? "unknown"}`,
    `Message: ${evt.message}`,
    evt.file ? `Location: ${evt.file}:${evt.line ?? "?"}${evt.column ? ":" + evt.column : ""}` : "Location: unknown",
    "",
    "Raw output:",
    "```",
    evt.raw,
    "```",
  ];
  if (fileSnippet) {
    lines.push("", `Surrounding code (${fileSnippet.name}, from line ${fileSnippet.startLine}):`, "```", fileSnippet.content, "```");
  }
  lines.push(
    "",
    "Diagnose the root cause (not just the symptom), then propose the minimal correct fix as a full replacement code block."
  );
  return lines.join("\n");
}
