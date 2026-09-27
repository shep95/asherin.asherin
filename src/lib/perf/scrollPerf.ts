/**
 * scrollPerf — two runtime switches that buy back frame budget.
 *
 * 1) `perf-lite` on <html>
 *    The marketing shell already proved that stripping `backdrop-filter`
 *    removes 15-40 blur re-samples per scroll frame with no visual loss,
 *    because the translucent background colour alone carries the glass look.
 *    That class was only ever mounted on nine landing pages; the dashboard —
 *    which holds the overwhelming majority of translucent panels — never got
 *    it. This mounts the same switch at the document root so every surface in
 *    the app inherits it. Individual elements can opt back in with
 *    `.perf-keep-blur` when a real blur is load-bearing (e.g. a modal veil
 *    over live content).
 *
 * 2) `data-scrolling` on <html>
 *    A continuously animating blurred gradient behind scrollable content
 *    forces a composite + blur pass on frames the browser is already spending
 *    on scroll. Decorative motion is worth nothing mid-scroll — nobody is
 *    looking at a 14s breathe cycle while the page is moving — so it is paused
 *    while scrolling and resumed shortly after the page comes to rest.
 *
 * Both are idempotent and safe to call more than once; both are no-ops during
 * SSR/prerender where `document` does not exist.
 */

const SCROLL_IDLE_MS = 180;

let installed = false;

export function initScrollPerf(): void {
  if (installed) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  installed = true;

  const root = document.documentElement;
  root.classList.add("perf-lite");

  let idleTimer: number | undefined;
  let marked = false;

  const settle = () => {
    idleTimer = undefined;
    marked = false;
    root.removeAttribute("data-scrolling");
  };

  const onScroll = () => {
    if (!marked) {
      marked = true;
      root.setAttribute("data-scrolling", "");
    }
    if (idleTimer !== undefined) window.clearTimeout(idleTimer);
    // A trailing timer (not a rAF loop) keeps this listener at ~zero cost:
    // the scroll handler itself does one attribute write per gesture, not
    // one per frame.
    idleTimer = window.setTimeout(settle, SCROLL_IDLE_MS);
  };

  // `capture: true` catches scroll on inner containers too — the dashboard
  // scrolls its own panes, not just the window — and `passive` guarantees the
  // listener can never block the scroll thread.
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });

  // A tab hidden mid-gesture never fires the trailing scroll event that would
  // clear the flag, which would otherwise leave decorative motion frozen on
  // return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && marked) {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      settle();
    }
  });
}
