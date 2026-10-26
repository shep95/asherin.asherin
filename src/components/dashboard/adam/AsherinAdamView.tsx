// asherin.adam — the live globe, as a room.
//
// The console is a separate static bundle under /adam/ (built from the ADAM
// checkout, pruned to what runs without a server). It owns a whole page —
// fixed element ids, body-level overlays, its own stylesheet and capture
// guard — so it lives in a same-origin iframe rather than in this tree.
// Same-origin is required: the globe keeps its settings in localStorage and
// IndexedDB, and this room reads its boot state and hands it places through
// the frame's window. The frame is a page boundary, not a trust boundary:
// the bundle runs with this origin's authority (docs/narratives/asherin.adam.md).
// No `sandbox` attribute: a sandbox that keeps same-origin and scripts is
// documented as equivalent to none, so it would add only a console warning.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPendingContacts,
  clearPendingVenues,
  getPendingContacts,
  getPendingVenues,
} from "@/lib/cloudIntel/mapBridge";
import { emitPull } from "@/lib/connect/emitPull";

const FRAME_SRC = "/adam/index.html";
const BLURB =
  "a live globe on this device — imagery, terrain, earthquakes, recent satellite passes. what leaves: map tiles, and only the places and weather you ask for.";
/** After this long the veil says why it is still up; the frame keeps loading. */
const SLOW_AFTER_MS = 15_000;
/** After this long without a globe the room says so; a late load still wins. */
const GIVE_UP_AFTER_MS = 60_000;
/** Places handed over by the google room, at most this many per plot. */
const MAX_PLOTS = 25;

type FrameState = "loading" | "slow" | "ready" | "failed";
type Failure = { reason: "webgl" | "absent" | "boot" | "timeout"; detail?: string };
type Place = { target: string; label: string };
type Plot = { state: "idle" | "plotting" | "done"; drawn?: number; missed?: number };

/** The annotation engine ADAM puts on its own window (src/annotations/index.js). */
type AdamAnnotations = {
  annotate: (
    specs: Array<{ type: "pin"; target: string; label: string }>,
    opts: { flyTo: boolean; clearPrevious: boolean },
  ) => Promise<{ drawn?: number; failed?: number }>;
};

function hasWebGl(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    // Hand the probe context straight back; browsers cap live contexts.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * What the google room left for the globe ("plot on map", "plot contacts"):
 * place strings only. Names stay as local pin labels; emails are never read.
 */
function readHandoff(): Place[] {
  const out: Place[] = [];
  for (const v of getPendingVenues() as Array<{ label?: unknown; physical?: unknown }>) {
    if (v?.physical === false || typeof v?.label !== "string" || !v.label.trim()) continue;
    out.push({ target: v.label.trim().slice(0, 160), label: v.label.trim().slice(0, 60) });
  }
  for (const c of getPendingContacts()) {
    if (typeof c?.location !== "string" || !c.location.trim()) continue;
    out.push({ target: c.location.trim().slice(0, 160), label: String(c.name || c.location).trim().slice(0, 60) });
  }
  return out.slice(0, MAX_PLOTS);
}

function clearHandoff() {
  clearPendingVenues();
  clearPendingContacts();
}

export default function AsherinAdamView() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FrameState>("loading");
  const [failure, setFailure] = useState<Failure | null>(null);
  // Read in the initializer (twice under strict mode, both before the clear).
  const [places, setPlaces] = useState<Place[]>(() => readHandoff());
  const [plot, setPlot] = useState<Plot>({ state: "idle" });

  const fail = useCallback((f: Failure) => {
    setFailure(f);
    setState("failed");
  }, []);

  // The hand-off is read once and leaves storage at once: contact names and
  // places must not sit in this browser waiting for a room that may not open.
  useEffect(() => {
    clearHandoff();
  }, []);

  // Boot clock for this attempt. Never a spinner forever, never a teardown of
  // a frame that is merely slow: the frame stays mounted behind the notice.
  useEffect(() => {
    if (!hasWebGl()) {
      fail({ reason: "webgl" });
      return;
    }
    const slow = window.setTimeout(() => setState((s) => (s === "loading" ? "slow" : s)), SLOW_AFTER_MS);
    const giveUp = window.setTimeout(() => {
      setState((s) => (s === "loading" || s === "slow" ? "failed" : s));
      setFailure((f) => f ?? { reason: "timeout" });
    }, GIVE_UP_AFTER_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(giveUp);
    };
  }, [attempt, fail]);

  // Leaving the room ends the globe: the frame is blanked before React drops
  // the node, so its render loop and workers stop with it.
  useEffect(() => {
    const frame = frameRef.current;
    return () => {
      try {
        if (frame) frame.src = "about:blank";
      } catch {
        /* the node is already gone */
      }
    };
  }, [attempt]);

  // ADAM reports a failed start in its own loader line ("Error: …", src/main.js).
  // Watch that line so a globe that loaded but cannot draw is named, not shown blank.
  const watchBoot = useCallback(
    (doc: Document) => {
      const status = doc.querySelector("#loading-screen .loader-status");
      if (!status) return () => {};
      const check = () => {
        const text = (status.textContent || "").trim();
        if (/^error\b/i.test(text)) fail({ reason: "boot", detail: text.replace(/^error:?\s*/i, "").slice(0, 160) });
      };
      const mo = new MutationObserver(check);
      mo.observe(status, { childList: true, characterData: true, subtree: true });
      check();
      return () => mo.disconnect();
    },
    [fail],
  );
  const stopWatch = useRef<() => void>(() => {});
  useEffect(() => () => stopWatch.current(), [attempt]);

  const onLoad = () => {
    const frame = frameRef.current;
    let doc: Document | null = null;
    try {
      doc = frame?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    // The frame fires load for any document, including a 404 or the app shell.
    // Only the console's own page counts as the globe being there.
    if (!doc?.getElementById("cesiumContainer")) {
      if (frame?.src && !frame.src.endsWith("about:blank")) fail({ reason: "absent" });
      return;
    }
    stopWatch.current();
    stopWatch.current = watchBoot(doc);
    // A late load rescues a timed-out attempt; the other failures unmount the frame.
    setFailure(null);
    setState("ready");
  };

  const retry = () => {
    stopWatch.current();
    setFailure(null);
    setState("loading");
    setAttempt((n) => n + 1);
  };

  const plotPlaces = async () => {
    const engine = (frameRef.current?.contentWindow as (Window & { __gevAnnotations?: AdamAnnotations }) | null)
      ?.__gevAnnotations;
    if (!engine?.annotate || !places.length) return;
    setPlot({ state: "plotting" });
    const started = performance.now();
    let drawn = 0;
    try {
      const r = await engine.annotate(
        places.map((p) => ({ type: "pin" as const, target: p.target, label: p.label })),
        { flyTo: true, clearPrevious: false },
      );
      drawn = Number(r?.drawn) || 0;
    } catch {
      drawn = 0;
    }
    setPlot({ state: "done", drawn, missed: Math.max(0, places.length - drawn) });
    // The one outbound step this room starts itself goes on the connect ledger:
    // counts only, never the place names.
    void emitPull({
      organ: "adam",
      capability: "plot-places",
      fromSurface: "google",
      status: drawn ? "ok" : "fail",
      latencyMs: performance.now() - started,
      meta: { asked: places.length, drawn },
    });
  };

  const failureCopy: Record<Failure["reason"], string> = {
    webgl: "this browser has no webgl, which the globe needs to draw. a recent desktop or phone browser with hardware acceleration on will open it.",
    absent: "the globe's files are not on this deployment — /adam did not answer with the console.",
    boot: "the globe loaded but could not start on this device.",
    timeout: "a minute passed and the globe did not answer. the first open fetches about 30 mb; a slow or blocked connection stops it here.",
  };
  const showFrame = failure?.reason !== "webgl" && failure?.reason !== "absent" && failure?.reason !== "boot";

  return (
    <div className="asherin-adam-room flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* on a phone the frame takes the room; the blurb returns with the width for it */}
      <header className="shrink-0 px-4 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-5">
        <h1 className="font-light tracking-tight text-xl text-white/90 sm:text-2xl">asherin.adam</h1>
        <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-white/50 sm:block">{BLURB}</p>
      </header>

      {places.length > 0 && plot.state !== "done" && (
        <div className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 sm:mx-6">
          <p className="min-w-0 flex-1 text-xs font-light leading-relaxed text-white/60">
            {places.length} place{places.length === 1 ? "" : "s"} came over from google. plotting looks each place name up at
            photon.komoot.io; names and emails stay here.
          </p>
          <button
            type="button"
            disabled={state !== "ready" || plot.state === "plotting"}
            onClick={() => void plotPlaces()}
            className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-light text-white/80 hover:bg-white/[0.08] disabled:opacity-40"
          >
            {plot.state === "plotting" ? "plotting…" : state === "ready" ? "plot them" : "plot once the globe is up"}
          </button>
          <button
            type="button"
            onClick={() => setPlaces([])}
            className="rounded-lg px-2 py-1.5 text-xs font-light text-white/45 hover:text-white/70"
          >
            dismiss
          </button>
        </div>
      )}
      {plot.state === "done" && (
        <p role="status" className="mx-4 mb-2 text-xs font-light text-white/50 sm:mx-6">
          plotted {plot.drawn} of {places.length}
          {plot.missed ? ` · ${plot.missed} could not be found by name` : ""}.
        </p>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden border-t border-white/10 bg-[#080808] sm:mx-6 sm:mb-6 sm:rounded-2xl sm:border">
        {showFrame && (
          <iframe
            key={attempt}
            ref={frameRef}
            src={FRAME_SRC}
            title="asherin.adam"
            allow="geolocation; fullscreen"
            referrerPolicy="same-origin"
            onLoad={onLoad}
            className="absolute inset-0 h-full w-full border-0 bg-[#080808]"
          />
        )}

        {(state === "loading" || state === "slow") && (
          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#080808]/85 backdrop-blur-sm"
          >
            <div className="px-6 text-center">
              <div className="mx-auto mb-4 h-10 w-10 rounded-full border border-white/15 border-t-white/70 motion-safe:animate-spin" />
              <p className="text-sm font-light tracking-wide text-white/60">bringing the globe up…</p>
              <p className="mt-1 text-xs font-light text-white/35">
                {state === "slow"
                  ? "still coming — the first open fetches about 30 mb of renderer; after that it is cached."
                  : "first open fetches the renderer once; after that it is cached."}
              </p>
            </div>
          </div>
        )}

        {state === "failed" && failure && (
          <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#080808]/90 p-6">
            <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
              <p className="text-sm font-light text-white/80">the globe could not be brought up here.</p>
              <p className="mt-2 text-xs font-light leading-relaxed text-white/45">{failureCopy[failure.reason]}</p>
              {failure.detail && (
                <p className="mt-2 break-words font-mono text-[11px] lowercase text-white/35">{failure.detail}</p>
              )}
              {failure.reason !== "webgl" && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-light text-white/75 hover:bg-white/[0.08]"
                  >
                    try again
                  </button>
                  <a
                    href={FRAME_SRC}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-light text-white/60 hover:bg-white/[0.05]"
                  >
                    open on its own
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
