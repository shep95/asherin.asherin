// ZANOEM SSE parser — spec-correct enough to handle real Server-Sent Events
// coming out of the `zali-chat` edge function.
//
// Bugs we intentionally fix vs. the naive `buffer.split("\n")` loop:
//  1. SSE events terminate on `\n\n`, not `\n`. A `data:` line flushed at
//     exactly a chunk boundary was previously dropped.
//  2. A single event can carry multiple `data:` lines that must be
//     concatenated with `\n`.
//  3. `data: [DONE]` is a valid marker regardless of surrounding whitespace.
//  4. `\r\n` chunk endings must be normalized.
//
// The stream helper drives a reader end-to-end and calls `onToken` for
// every text delta the OpenAI-compatible payload emits. AbortSignal is
// respected so upstream cancellation (unmount, Stop button) tears the
// reader down promptly.

export interface SseChatOptions {
  onToken: (delta: string) => void;
  signal?: AbortSignal;
}

/** Drain an SSE response body into token deltas. Resolves when [DONE] or EOF. */
export async function readOpenAiSseStream(
  body: ReadableStream<Uint8Array>,
  opts: SseChatOptions,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const flushEvent = (raw: string) => {
    // An event is a group of lines; join every `data:` line with `\n`.
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.replace(/\r$/, "");
      if (trimmed.startsWith("data:")) {
        dataLines.push(trimmed.slice(5).replace(/^ /, ""));
      }
      // (event:/id:/retry: are ignored — this endpoint doesn't use them)
    }
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n").trim();
    if (!payload) return;
    if (payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) opts.onToken(delta);
    } catch {
      /* keep-alive comment or malformed frame — ignore */
    }
  };

  const onAbort = () => {
    try { reader.cancel(); } catch { /* ignore */ }
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (opts.signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. `\r\n\r\n` is normalized first.
      buf = buf.replace(/\r\n/g, "\n");
      let sep: number;
      // eslint-disable-next-line no-cond-assign
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        flushEvent(raw);
      }
    }
    // Flush any trailing partial event (no final blank line).
    if (buf.trim().length > 0) flushEvent(buf);
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
