// Client-side companion to the server's per-key adaptive rate-limit brain.
//
// The edge function (via zophielByokRouter.callByokJsonWithRetry) already waits
// out provider rate limits within a single invocation. If the provider stays
// rate-limited past the server's retry budget, the edge returns HTTP 429 with a
// structured `{ error: "RATE_LIMITED", retryAfterMs }` body. This helper
// consumes that signal so users don't have to click "Retry" — the request
// auto-resumes when the key's cooldown expires, per key, per session.
//
// Usage:
//   const data = await invokeWithByokRetry("zerlal-scan", { body });
//   → on 429, waits retryAfterMs (+jitter), retries up to `maxAutoResumes`.
//
// Rules:
//  - 429 with `retryAfterMs` → auto-retry (per-key cooldown honored server-side).
//  - 403 BYOK_REQUIRED → surface immediately (user must add a key).
//  - other errors → surface immediately.

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isToolApiEnabled, recordAiCall, readUsage } from "@/lib/usage/ledger";

export interface InvokeOpts {
  body?: unknown;
  headers?: Record<string, string>;
  /** Max automatic resumes after a terminal 429. Default 3. */
  maxAutoResumes?: number;
  /** Whether to show a toast on the first auto-resume. Default true. */
  silent?: boolean;
  /** Which room/tool this call belongs to — used for the usage ledger and for
   *  the owner's per-tool off switch. When omitted the call is neither gated
   *  nor recorded (we never guess which tool spent the money). */
  tool?: string;
}

export class ToolApiDisabledError extends Error {
  tool: string;
  code = "TOOL_API_DISABLED";
  constructor(tool: string) {
    super(`${tool} has its API turned off in settings`);
    this.tool = tool;
  }
}

// Per-key cooldown mirror: if one call for a key just got rate-limited, any
// other call in the tab waits it out too instead of piling on.
const clientCooldowns = new Map<string, number>();

function keyTag(body: unknown): string {
  const b = body as { byok?: { provider?: string; apiKey?: string } } | undefined;
  if (!b?.byok?.apiKey) return "__platform__";
  return `${b.byok.provider || "?"}:${b.byok.apiKey.slice(-6)}`;
}

async function respectClientCooldown(tag: string) {
  const until = clientCooldowns.get(tag);
  if (!until) return;
  const wait = until - Date.now();
  if (wait <= 0) { clientCooldowns.delete(tag); return; }
  await new Promise((r) => setTimeout(r, Math.min(wait, 90_000)));
  clientCooldowns.delete(tag);
}

export async function invokeWithByokRetry<T = unknown>(
  functionName: string,
  opts: InvokeOpts = {},
): Promise<T> {
  const max = opts.maxAutoResumes ?? 3;
  const tag = keyTag(opts.body);
  const provider = (opts.body as any)?.byok?.provider ?? null;

  // Owner's off switch is checked before anything leaves the browser, so a
  // disabled tool genuinely stops spending instead of spending quietly.
  if (opts.tool && !(await isToolApiEnabled(opts.tool))) {
    void recordAiCall({ tool: opts.tool, provider, functionName, status: "blocked" });
    throw new ToolApiDisabledError(opts.tool);
  }

  for (let attempt = 0; attempt <= max; attempt++) {
    await respectClientCooldown(tag);

    const { data, error } = await supabase.functions.invoke(functionName, {
      body: opts.body,
      headers: opts.headers,
    });

    if (!error) {
      if (opts.tool) {
        const u = readUsage(data);
        void recordAiCall({
          tool: opts.tool,
          provider,
          model: u.model,
          functionName,
          promptTokens: u.prompt,
          completionTokens: u.completion,
          status: "ok",
        });
      }
      return data as T;
    }

    // supabase-js v2 exposes the raw response on `error.context` for non-2xx.
    let status: number | undefined;
    let payload: any = null;
    try {
      const ctx: any = (error as any).context;
      status = ctx?.status;
      if (ctx?.body && typeof ctx.body?.getReader === "function") {
        // ReadableStream — best-effort parse
        const txt = await new Response(ctx.body).text();
        try { payload = JSON.parse(txt); } catch { payload = { message: txt }; }
      } else if (typeof ctx?.text === "function") {
        const txt = await ctx.text();
        try { payload = JSON.parse(txt); } catch { payload = { message: txt }; }
      }
    } catch { /* ignore */ }

    const isRateLimited = status === 429 || payload?.error === "RATE_LIMITED";
    if (isRateLimited && attempt < max) {
      const waitMs = Math.max(1_000, Math.min(90_000, Number(payload?.retryAfterMs) || 15_000));
      clientCooldowns.set(tag, Date.now() + waitMs);
      if (!opts.silent && attempt === 0) {
        toast.info(`AI key rate-limited — auto-resuming in ${Math.ceil(waitMs / 1000)}s`);
      }
      await new Promise((r) => setTimeout(r, waitMs + Math.random() * 400));
      continue;
    }

    // Many of our functions answer with `{ error: "<sentence a person reads>" }`
    // and no `message` field. Reading only `message` threw that sentence away
    // and left the user with supabase-js's generic "Edge Function returned a
    // non-2xx status code" — the failure was explained, then discarded on the
    // way to the screen. Prefer any human sentence the function actually sent.
    const fromPayload =
      (typeof payload?.message === "string" && payload.message) ||
      (typeof payload?.error === "string" && payload.error !== payload?.code ? payload.error : "") ||
      (typeof payload?.detail === "string" && payload.detail) ||
      "";
    const msg = fromPayload || (error as Error).message || "Request failed";
    const err: any = new Error(msg);
    err.status = status;
    err.code = payload?.error;
    err.payload = payload;
    if (opts.tool) {
      void recordAiCall({ tool: opts.tool, provider, functionName, status: "error" });
    }
    throw err;
  }

  throw new Error("byok_invoke_exhausted");
}
