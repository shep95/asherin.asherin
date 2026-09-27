/**
 * Console posture for a production build.
 *
 * The build already strips every console.* call (vite esbuild `drop`), so the
 * tab's console carries nothing about the app. Two things remain worth doing:
 *
 *  1. Say, once and plainly, that pasting code here is how accounts and keys
 *     get stolen ("self-xss"). The message is the guard; nothing here tries to
 *     detect or fight devtools, which is both futile and hostile to the person
 *     whose device this is.
 *  2. Make the console methods inert afterwards so third-party code (map
 *     tiles, model SDKs, extensions) cannot spray internals either.
 *
 * Development builds keep the console intact.
 */
export function installConsoleGuard(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === "undefined" || typeof console === "undefined") return;
  try {
    const warn = console.warn.bind(console);
    warn(
      "%cstop.",
      "font: 600 40px/1 system-ui, sans-serif; color: #e5e5e5; background: #050505; padding: 6px 12px;",
    );
    warn(
      "%cthis is a browser feature for developers. if someone told you to paste something here, it is an attempt to take your keys and your data. close this panel.",
      "font: 14px/1.5 system-ui, sans-serif; color: #a3a3a3;",
    );
    const noop = () => undefined;
    const quiet: (keyof Console)[] = [
      "log", "info", "debug", "trace", "table", "dir", "dirxml", "group", "groupCollapsed", "groupEnd",
      "time", "timeEnd", "timeLog", "count", "countReset", "profile", "profileEnd", "assert", "warn", "error",
    ];
    for (const k of quiet) {
      try {
        Object.defineProperty(console, k, { value: noop, writable: false, configurable: false });
      } catch {
        /* locked by the host */
      }
    }
    // React DevTools hooks the renderer through this global; an inert stub
    // keeps the component tree from being walked by an extension.
    const hookKey = "__REACT_DEVTOOLS_GLOBAL_HOOK__";
    const w = window as unknown as Record<string, unknown>;
    if (!w[hookKey]) {
      Object.defineProperty(w, hookKey, {
        value: { isDisabled: true, supportsFiber: true, inject: noop, onCommitFiberRoot: noop, onCommitFiberUnmount: noop, renderers: new Map() },
        writable: false,
        configurable: false,
      });
    }
  } catch {
    /* never let the guard break boot */
  }
}
