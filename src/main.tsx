import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary, { attemptChunkRecovery } from "./components/RootErrorBoundary";
import "./index.css";
import { initDorkGuard } from "./lib/dorkGuard";
import { bootLoopGuard } from "./lib/bootLoopGuard";
import { migrateLegacyStorageKeys } from "./lib/storageKeyMigration";
import { initScrollPerf } from "./lib/perf/scrollPerf";
import { installConsoleGuard } from "./lib/consoleGuard";

// Production console goes quiet before anything else can speak into it.
installConsoleGuard();

// If this tab has reloaded itself several times in a row, stop every automatic
// reload for the rest of the session and let the page show its error instead.
bootLoopGuard();

// Carry pre-rename `asherin_*` localStorage values over to `aureon_*` before
// anything reads them, so personas/preferences survive the rename.
migrateLegacyStorageKeys();

// noindex on private routes, scrub token-shaped query params, tighten referrer.
initDorkGuard();

// Strip per-frame backdrop-filter re-sampling app-wide and pause decorative
// blurred motion during scroll. Must run before first paint.
initScrollPerf();

// Offline shell: the service worker caches the wasm the vedic room needs.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// A rejected dynamic import outside a render pass never reaches a boundary;
// catch it here so a stale deploy self-heals instead of blanking the tab.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (reason instanceof Error) attemptChunkRecovery(reason);
});

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary scope="root">
    <App />
  </RootErrorBoundary>,
);
