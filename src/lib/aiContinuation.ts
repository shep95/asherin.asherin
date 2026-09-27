const CONTINUATION_TAIL_CHARS = 2200;

export const MAX_STREAM_CONTINUATIONS = 5;

export type ContinuationStitchStrategy =
  | "empty"
  | "contained"
  | "prefix"
  | "tail-anchor"
  | "line-anchor"
  | "overlap"
  | "restart-replace"
  | "restart-no-progress"
  | "append";

function longestSuffixPrefixOverlap(left: string, right: string, max = 12000): number {
  const a = left.slice(-max);
  const b = right.slice(0, max);
  const limit = Math.min(a.length, b.length);
  for (let size = limit; size >= 40; size -= 1) {
    if (a.slice(a.length - size) === b.slice(0, size)) return size;
  }
  return 0;
}

function firstMeaningfulLine(text: string): string {
  return (text.split(/\r?\n/).find((line) => line.trim().length > 8) || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function looksLikeRestart(existing: string, continuation: string): boolean {
  const left = firstMeaningfulLine(existing);
  const right = firstMeaningfulLine(continuation);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.length >= 40 && right.length >= 40 && (left.startsWith(right.slice(0, 40)) || right.startsWith(left.slice(0, 40)));
}

export function stitchAiContinuation(existing: string, continuation: string): { text: string; delta: string; strategy: ContinuationStitchStrategy } {
  if (!continuation) return { text: existing, delta: "", strategy: "empty" };

  if (existing.includes(continuation)) {
    return { text: existing, delta: "", strategy: "contained" };
  }

  if (continuation.startsWith(existing)) {
    const delta = continuation.slice(existing.length);
    return { text: continuation, delta, strategy: "prefix" };
  }

  // When a provider restarts from the beginning, find the already-visible tail
  // inside the new answer and append only the unseen suffix after that anchor.
  for (const size of [5000, 3200, 2200, 1400, 900, 520, 280, 140, 80]) {
    if (existing.length < size) continue;
    const tail = existing.slice(-size);
    const idx = continuation.indexOf(tail);
    if (idx !== -1) {
      const delta = continuation.slice(idx + tail.length);
      return { text: existing + delta, delta, strategy: "tail-anchor" };
    }
  }

  if (looksLikeRestart(existing, continuation) && continuation.length > existing.length) {
    return { text: continuation, delta: "", strategy: "restart-replace" };
  }

  // Tail anchors can miss if the model reformats nearby whitespace. Fall back
  // to the last distinctive source line from the visible answer.
  const tailLines = existing
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length >= 24)
    .slice(-80)
    .reverse();
  for (const line of tailLines) {
    const idx = continuation.lastIndexOf(line);
    if (idx !== -1) {
      const delta = continuation.slice(idx + line.length);
      if (delta) return { text: existing + delta, delta, strategy: "line-anchor" };
    }
  }

  const overlap = longestSuffixPrefixOverlap(existing, continuation);
  if (overlap > 0) {
    const delta = continuation.slice(overlap);
    return { text: existing + delta, delta, strategy: "overlap" };
  }

  if (looksLikeRestart(existing, continuation)) {
    return { text: existing, delta: "", strategy: "restart-no-progress" };
  }

  const separator = existing.endsWith("\n") || continuation.startsWith("\n") ? "" : "\n";
  const delta = separator + continuation;
  return { text: existing + delta, delta, strategy: "append" };
}

export function buildExactContinuationPrompt(accumulated: string): string {
  const tail = accumulated.slice(-CONTINUATION_TAIL_CHARS);
  return [
    "The previous answer was cut off by the output limit.",
    "Continue from the exact next character after the tail below.",
    "Do NOT restart from the beginning. Do NOT repeat any completed code. Do NOT summarize.",
    "If the tail ends inside a function, continue inside that function and finish the remaining collision logic, loop, render, exports, and closing fences.",
    "Close every open code fence / JSON object / source file before ending.",
    "",
    "TAIL TO CONTINUE AFTER:",
    "```text",
    tail,
    "```",
  ].join("\n");
}