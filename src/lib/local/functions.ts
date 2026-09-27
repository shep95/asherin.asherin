/**
 * `supabase.functions.invoke` replacement.
 *
 * The hosted build had ~150 edge functions. A handful had a device-side
 * answer (key presence, notifications, analytics no-ops) and those are
 * implemented here. Everything else needed a server organ — third-party
 * scanners, paid indexes, mail — and answers with one honest, structured
 * error the rooms already know how to show: "kernel offline".
 */

import { listProviderKeys, getPrefs } from "./keys";

export class FunctionsError extends Error {
  name = "FunctionsHttpError";
  context: Response;
  constructor(message: string, status = 503, body?: unknown) {
    super(message);
    const payload = body ?? { error: message, code: "LOCAL_ONLY" };
    this.context = new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  }
}

type Handler = (body: unknown) => Promise<unknown>;

const ok = async () => ({ ok: true });

const HANDLERS: Record<string, Handler> = {
  "key-status": async () => {
    const keys = await listProviderKeys();
    const prefs = await getPrefs();
    return {
      providers: keys.map((k) => ({
        provider: k.provider,
        present: true,
        active: k.is_active,
        selected: prefs.active_provider === k.provider,
        updated_at: k.updated_at,
      })),
      active_provider: prefs.active_provider,
      active_model: prefs.active_model,
    };
  },
  "analytics-collect": ok,
  "security-notify": ok,
  "intel-notify": ok,
  "session-context": async () => ({ context: null }),
  "sentinel-beacon": ok,
  purge: async () => ({ purged: 0 }),
};

export function localOnlyMessage(name: string): string {
  return `${name} needs a server-side organ and asherin is running locally on this device — kernel offline for this tool.`;
}

export const localFunctions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke<T = any>(name: string, opts?: { body?: unknown; headers?: Record<string, string>; method?: string }) {
    const h = HANDLERS[name];
    if (!h) {
      return { data: null as T | null, error: new FunctionsError(localOnlyMessage(name), 503) };
    }
    try {
      const data = (await h(opts?.body)) as T;
      return { data, error: null as FunctionsError | null };
    } catch (e) {
      return { data: null as T | null, error: new FunctionsError(e instanceof Error ? e.message : String(e), 500) };
    }
  },
  setAuth() {
    /* no session to set */
  },
};
