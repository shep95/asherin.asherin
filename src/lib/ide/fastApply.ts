// Fast Apply — parses SEARCH/REPLACE blocks (Void/Aider style) and applies them
// to file contents, producing a list of hunks that can be previewed as a diff.
//
// Block format the AI must emit:
//
//   <<<<<<< SEARCH
//   exact existing code
//   =======
//   new code
//   >>>>>>> REPLACE
//
// Multiple blocks per file are supported. Whitespace must match exactly.

export interface FastApplyBlock {
  search: string;
  replace: string;
  /** index of the SEARCH match in the original content, -1 if not found */
  matchIndex: number;
}

export interface FastApplyResult {
  ok: boolean;
  blocks: FastApplyBlock[];
  /** Final patched content. If any block failed to match, equals the original. */
  patched: string;
  /** Human-readable error if !ok. */
  error?: string;
}

const BLOCK_RE =
  /<{5,}\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n={5,}\s*\r?\n([\s\S]*?)\r?\n>{5,}\s*REPLACE/g;

export function parseFastApplyBlocks(text: string): { search: string; replace: string }[] {
  const out: { search: string; replace: string }[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    out.push({ search: m[1], replace: m[2] });
  }
  return out;
}

export function applyFastApply(original: string, raw: string): FastApplyResult {
  const parsed = parseFastApplyBlocks(raw);
  if (parsed.length === 0) {
    return { ok: false, blocks: [], patched: original, error: "No SEARCH/REPLACE blocks found." };
  }
  let working = original;
  const blocks: FastApplyBlock[] = [];
  for (const p of parsed) {
    const idx = working.indexOf(p.search);
    blocks.push({ ...p, matchIndex: idx });
    if (idx === -1) {
      return {
        ok: false,
        blocks,
        patched: original,
        error: `SEARCH block did not match. Block: "${p.search.slice(0, 60)}…"`,
      };
    }
    working = working.slice(0, idx) + p.replace + working.slice(idx + p.search.length);
  }
  return { ok: true, blocks, patched: working };
}

/** Compute a tiny line-based diff for preview rendering. */
export interface DiffLine {
  type: "ctx" | "add" | "del";
  text: string;
  oldNum?: number;
  newNum?: number;
}

export function computeDiff(oldText: string, newText: string, contextLines = 2): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  // Myers-lite via LCS table — fine for typical file sizes.
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0, oNum = 1, nNum = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i], oldNum: oNum++, newNum: nNum++ });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i], oldNum: oNum++ });
      i++;
    } else {
      out.push({ type: "add", text: b[j], newNum: nNum++ });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++], oldNum: oNum++ });
  while (j < m) out.push({ type: "add", text: b[j++], newNum: nNum++ });

  // Collapse long runs of context to keep the preview compact.
  const compact: DiffLine[] = [];
  let run: DiffLine[] = [];
  const flushRun = (atEnd: boolean) => {
    if (run.length <= contextLines * 2 + 1) {
      compact.push(...run);
    } else {
      compact.push(...run.slice(0, contextLines));
      compact.push({ type: "ctx", text: `… ${run.length - contextLines * 2} unchanged lines …` });
      if (!atEnd) compact.push(...run.slice(-contextLines));
    }
    run = [];
  };
  for (const line of out) {
    if (line.type === "ctx") {
      run.push(line);
    } else {
      flushRun(false);
      compact.push(line);
    }
  }
  flushRun(true);
  return compact;
}
