/**
 * Bounded network primitives for the device-side search engine.
 *
 * Every call carries its own AbortController deadline, and a failure is an
 * HttpFailure with a plain reason, so one slow or refused index can never
 * take the whole fan-out down with it. Nothing here logs the operator's query.
 */

export interface HttpOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

export class HttpFailure extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'HttpFailure';
    this.status = status;
  }
}

/** Fetch with a hard deadline. Rejects with HttpFailure on timeout, refusal or a non-2xx. */
export async function fetchTimeout(url: string, opts: HttpOpts = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
  const onOuter = () => ctl.abort();
  opts.signal?.addEventListener('abort', onOuter, { once: true });
  try {
    const resp = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: ctl.signal,
      // Cookies and credentials never ride along to a third-party index.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!resp.ok) throw new HttpFailure(`http ${resp.status}`, resp.status);
    return resp;
  } catch (e) {
    if (e instanceof HttpFailure) throw e;
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError') throw new HttpFailure(opts.signal?.aborted ? 'cancelled' : 'timed out');
    // A CORS refusal, DNS failure or offline device all land here as TypeError.
    throw new HttpFailure('unreachable from this browser (network or cors)');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuter);
  }
}

export async function getJson<T>(url: string, opts: HttpOpts = {}): Promise<T> {
  const resp = await fetchTimeout(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers ?? {}) } });
  return (await resp.json()) as T;
}

export async function getText(url: string, opts: HttpOpts = {}): Promise<string> {
  const resp = await fetchTimeout(url, opts);
  return resp.text();
}

/** Run tasks with a concurrency cap. Results keep input order; failures become null. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
