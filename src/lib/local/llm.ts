/**
 * Direct browser → model-provider calls with the device-held key.
 *
 * Nothing sits between this tab and the provider the operator chose: no relay,
 * no logging hop, no server. Streaming uses each provider's own SSE shape and
 * normalises to text deltas.
 */

export interface LlmImage {
  mime: string;
  base64: string;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: LlmImage[];
}

export interface LlmRequest {
  provider: string;
  model: string;
  apiKey: string;
  messages: LlmMessage[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  maxTokens?: number;
  temperature?: number;
  /** Ask for a JSON object where the provider supports it. */
  json?: boolean;
}

export class LlmError extends Error {
  status: number;
  code: "AUTH" | "RATE_LIMIT" | "UPSTREAM_BUSY" | "BAD_REQUEST" | "NETWORK" | "UNSUPPORTED" | "UNKNOWN";
  retryAfterMs?: number;
  constructor(message: string, status: number, code: LlmError["code"], retryAfterMs?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** OpenAI-compatible chat/completions bases. Local runtimes need no key. */
export const OPENAI_COMPAT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  venice: "https://api.venice.ai/api/v1",
  perplexity: "https://api.perplexity.ai",
  groq: "https://api.groq.com/openai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  cohere: "https://api.cohere.com/compatibility/v1",
  sarvam: "https://api.sarvam.ai/v1",
  krutrim: "https://cloud.olakrutrim.com/v1",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  moonshot: "https://api.moonshot.ai/v1",
  baidu: "https://qianfan.baidubce.com/v2",
  minimax: "https://api.minimax.io/v1",
  maritaca: "https://chat.maritaca.ai/api",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

export const LOCAL_RUNTIMES = new Set(["ollama", "lmstudio"]);

export const DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4.1",
  anthropic: "claude-sonnet-4-5",
  google: "gemini-2.5-flash",
  xai: "grok-3",
  mistral: "mistral-large-3",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
  venice: "qwen-3-6-plus",
  perplexity: "sonar",
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3.2",
  lmstudio: "local-model",
};

export function isSupportedProvider(provider: string): boolean {
  return provider === "anthropic" || provider === "google" || provider in OPENAI_COMPAT_BASE;
}

export function providerNeedsKey(provider: string): boolean {
  return !LOCAL_RUNTIMES.has(provider);
}

function classify(status: number, body: string): LlmError {
  const msg = (() => {
    try {
      const j = JSON.parse(body);
      return j?.error?.message || j?.message || j?.error || body;
    } catch {
      return body;
    }
  })();
  const text = String(msg).slice(0, 400) || `HTTP ${status}`;
  if (status === 401 || status === 403) return new LlmError(text, status, "AUTH");
  if (status === 429) return new LlmError(text, status, "RATE_LIMIT", 4000);
  if (status === 502 || status === 503 || status === 504 || status === 529) return new LlmError(text, status, "UPSTREAM_BUSY", 2500);
  if (status >= 400 && status < 500) return new LlmError(text, status, "BAD_REQUEST");
  return new LlmError(text, status, "UNKNOWN");
}

async function readSse(resp: Response, onEvent: (data: string) => void, signal?: AbortSignal): Promise<void> {
  if (!resp.body) return;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) continue;
      if (line.startsWith("data:")) onEvent(line.slice(5).trim());
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith("data:")) onEvent(tail.slice(5).trim());
}

/* ── openai-compatible ──────────────────────────────────────────────────── */

function openaiContent(m: LlmMessage): unknown {
  if (!m.images?.length) return m.content;
  return [
    { type: "text", text: m.content || " " },
    ...m.images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
  ];
}

async function streamOpenAiCompat(req: LlmRequest, base: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;
  if (req.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://asherin.com";
    headers["X-Title"] = "asherin";
  }
  const body: Record<string, unknown> = {
    model: req.model,
    stream: true,
    messages: req.messages.map((m) => ({ role: m.role, content: openaiContent(m) })),
  };
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (req.json && req.provider !== "venice") body.response_format = { type: "json_object" };

  let resp: Response;
  try {
    resp = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: req.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new LlmError(
      LOCAL_RUNTIMES.has(req.provider)
        ? `${req.provider} is not reachable at ${base}. start it, and allow this origin (for ollama: OLLAMA_ORIGINS=*).`
        : `could not reach ${req.provider}. check your connection, or the provider may not allow browser calls.`,
      0,
      "NETWORK",
    );
  }
  if (!resp.ok) throw classify(resp.status, await resp.text().catch(() => ""));

  let full = "";
  const ctype = resp.headers.get("content-type") || "";
  if (!ctype.includes("text/event-stream")) {
    const j = await resp.json().catch(() => null);
    const text = j?.choices?.[0]?.message?.content ?? "";
    const out = typeof text === "string" ? text : Array.isArray(text) ? text.map((p: { text?: string }) => p?.text || "").join("") : "";
    if (out) req.onDelta?.(out);
    return out;
  }
  await readSse(
    resp,
    (data) => {
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        if (j?.error) throw new LlmError(String(j.error?.message || j.error), 500, "UNKNOWN");
        const d = j?.choices?.[0]?.delta;
        let t = d?.content ?? "";
        if (Array.isArray(t)) t = t.map((p: { text?: string }) => p?.text || "").join("");
        if (typeof t === "string" && t) {
          full += t;
          req.onDelta?.(t);
        }
      } catch (e) {
        if (e instanceof LlmError) throw e;
        /* partial frame */
      }
    },
    req.signal,
  );
  return full;
}

/* ── anthropic ──────────────────────────────────────────────────────────── */

async function streamAnthropic(req: LlmRequest): Promise<string> {
  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: m.images?.length
        ? [
            ...m.images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mime, data: im.base64 } })),
            { type: "text", text: m.content || " " },
          ]
        : m.content || " ",
    }));
  // Anthropic requires alternation starting with a user turn.
  const merged: typeof turns = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) {
      const a = typeof last.content === "string" ? [{ type: "text", text: last.content }] : (last.content as unknown[]);
      const b = typeof t.content === "string" ? [{ type: "text", text: t.content }] : (t.content as unknown[]);
      last.content = [...a, ...b] as never;
    } else merged.push({ ...t });
  }
  if (!merged.length || merged[0].role !== "user") merged.unshift({ role: "user", content: "(continue)" });

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": req.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 8192,
        stream: true,
        ...(system ? { system } : {}),
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        messages: merged,
      }),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new LlmError("could not reach anthropic. check your connection.", 0, "NETWORK");
  }
  if (!resp.ok) throw classify(resp.status, await resp.text().catch(() => ""));
  let full = "";
  await readSse(
    resp,
    (data) => {
      try {
        const j = JSON.parse(data);
        if (j?.type === "error") throw new LlmError(String(j.error?.message || "anthropic error"), 500, "UNKNOWN");
        if (j?.type === "content_block_delta" && j.delta?.type === "text_delta" && typeof j.delta.text === "string") {
          full += j.delta.text;
          req.onDelta?.(j.delta.text);
        }
      } catch (e) {
        if (e instanceof LlmError) throw e;
      }
    },
    req.signal,
  );
  return full;
}

/* ── google gemini ──────────────────────────────────────────────────────── */

async function streamGemini(req: LlmRequest): Promise<string> {
  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        { text: m.content || " " },
        ...(m.images ?? []).map((im) => ({ inlineData: { mimeType: im.mime, data: im.base64 } })),
      ],
    }));
  const model = encodeURIComponent(req.model);
  let resp: Response;
  try {
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": req.apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          ...(req.temperature != null ? { temperature: req.temperature } : {}),
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new LlmError("could not reach google ai. check your connection.", 0, "NETWORK");
  }
  if (!resp.ok) throw classify(resp.status, await resp.text().catch(() => ""));
  let full = "";
  await readSse(
    resp,
    (data) => {
      try {
        const j = JSON.parse(data);
        if (j?.error) throw new LlmError(String(j.error?.message || "gemini error"), 500, "UNKNOWN");
        const parts = j?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p && typeof p.text === "string" && p.text) {
              full += p.text;
              req.onDelta?.(p.text);
            }
          }
        }
      } catch (e) {
        if (e instanceof LlmError) throw e;
      }
    },
    req.signal,
  );
  return full;
}

/* ── entry points ───────────────────────────────────────────────────────── */

export async function streamLlm(req: LlmRequest): Promise<string> {
  const model = req.model || DEFAULT_MODEL[req.provider] || "";
  const r = { ...req, model };
  if (!model) throw new LlmError(`pick a model for ${req.provider} in settings → ai keys.`, 400, "BAD_REQUEST");
  if (req.provider === "anthropic") return streamAnthropic(r);
  if (req.provider === "google") return streamGemini(r);
  const base = OPENAI_COMPAT_BASE[req.provider];
  if (base) return streamOpenAiCompat(r, base);
  throw new LlmError(
    `${req.provider} has no direct browser api. route it through openrouter, or run it locally with ollama or lm studio.`,
    400,
    "UNSUPPORTED",
  );
}

/** Non-streaming convenience with light retry on congestion. */
export async function completeLlm(req: Omit<LlmRequest, "onDelta">, attempts = 3): Promise<string> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await streamLlm(req);
    } catch (e) {
      last = e;
      const transient = e instanceof LlmError && (e.code === "RATE_LIMIT" || e.code === "UPSTREAM_BUSY");
      if (!transient || req.signal?.aborted || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, (e.retryAfterMs ?? 1500) * (i + 1) + Math.random() * 400));
    }
  }
  throw last;
}

/** Pull the first JSON object out of a model reply. */
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const startArr = c.indexOf("[");
    const s = start >= 0 && (startArr < 0 || start < startArr) ? start : startArr;
    if (s < 0) continue;
    for (let end = c.length; end > s; end--) {
      const ch = c[end - 1];
      if (ch !== "}" && ch !== "]") continue;
      try {
        return JSON.parse(c.slice(s, end)) as T;
      } catch {
        /* keep shrinking */
      }
    }
  }
  return null;
}
