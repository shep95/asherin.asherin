// Client half of the public visit ledger.
//
// The browser sends only what the edge cannot know: which path it navigated
// to, its own referrer, its clock zone, its locale, how long the page took to
// become interactive, and how long it was actually looked at. Identity,
// geography and crawler classification are all decided server-side.

import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "asherin_visit_session";

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function loadMs(): number | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return null;
    const v = nav.domContentLoadedEventEnd || nav.responseEnd;
    return v > 0 ? Math.round(v) : null;
  } catch {
    return null;
  }
}

async function post(payload: Record<string, unknown>): Promise<{ id?: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("analytics-collect", { body: payload });
    if (error) return null;
    return (data ?? null) as { id?: string } | null;
  } catch {
    return null;
  }
}

let currentId: string | null = null;
let enteredAt = 0;
let flushed = false;

/** Closes the previous view with its dwell time, then opens a new one. */
export async function recordView(path: string): Promise<void> {
  await flushDwell();

  currentId = null;
  flushed = false;
  enteredAt = Date.now();

  const res = await post({
    action: "view",
    path,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    session: sessionId(),
    timezone: (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { return null; }
    })(),
    locale: typeof navigator !== "undefined" ? navigator.language : null,
    load_ms: loadMs(),
  });

  currentId = res?.id ?? null;
}

/** Time on page. Safe to call repeatedly; only the first close per view sends. */
export async function flushDwell(): Promise<void> {
  if (!currentId || flushed) return;
  const dwell = Date.now() - enteredAt;
  if (dwell < 250) return;
  flushed = true;
  await post({ action: "dwell", id: currentId, dwell_ms: dwell, load_ms: loadMs() });
}

/** A completed sign-up, attributed to the view the visitor was on. */
export async function recordSignup(): Promise<void> {
  if (!currentId) return;
  await post({ action: "goal", id: currentId, goal: "signup" });
}
