// @ts-nocheck
// asherin.eye — 3d globe + live public spatial layers
// adapted from gods-eye-view (mit, © 2026 bilawal sidhu) for asherin.com glass.
// asherin.engine is composed here as location detection → globe pins, never a serp dump.
// never: palantir chrome, public "god's eye" costume, telegeography nc cables,
// leftover "paste a google key", radio hijack, pcap/web tap.

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { aircraftIcon, TRACKED_ICON_PX } from "./aircraftIcons";
import { classifyAircraft, CLASS_SCALE_2D } from "./aircraftClass";
import { cellBounds, gridMaturity, scoreAvoidance } from "./gridMath";
import { evaluate as evaluateShape, fitStroke, fmtArea, fmtM } from "./whiteboard";
import {
  bearingDeg,
  fmtBearing,
  fmtCoord,
  fmtRange,
  insideRing,
  midpoint,
  pathLengthM,
  rangeM,
} from "./measure";
// the truth layer: what each control actually is, how fresh each feed is, and
// what the selected object honestly carries. nothing on this globe is allowed
// to look more certain than its source.
import { capabilityFor, chipFor, limitationFor, stateFor, stateWord } from "./capability";
import { createHealthRegistry, healthLabel } from "./health";
import { buildInspector } from "./inspector";

const CESIUM_BASE = "https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/";
const SAT_JS = "https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js";
// the hangar is ours and it is local. the previous uri pointed at a cesium
// sample on a cdn tag that does not exist (404), which is why tracking a
// contact showed no airframe at all — the entity had a model that could never
// load. these glbs are authored in real metres, y-up, nose along +x, so they
// render at scale 1 and a 737 is a 737 next to a bell 206.
const HANGAR = {
  airliner: "/models/asherin-airliner.glb",
  widebody: "/models/asherin-widebody.glb",
  quadjet: "/models/asherin-widebody.glb",
  turboprop: "/models/asherin-turboprop.glb",
  bizjet: "/models/asherin-fastjet.glb",
  fastjet: "/models/asherin-fastjet.glb",
  light: "/models/asherin-light.glb",
  glider: "/models/asherin-glider.glb",
  uav: "/models/asherin-uav.glb",
  helicopter: "/models/asherin-helicopter.glb",
};
// verified by render, not by assumption: with these glbs a cesium enu heading
// of 0 puts the nose due north in a nadir view, so the compass track goes in
// raw. the old +90 was inherited from a sample airframe with a different
// authoring axis and turned every contact ninety degrees off its own path.
const MODEL_HEADING_OFFSET_DEG = 0;
// the airframe swap is a RANGE decision, not an altitude one. the old gate read
// camera height above the ellipsoid, so chasing a contact at cruise kept the
// camera 11 km up and the model stayed hidden while the hud claimed otherwise.
const TRACKED_MODEL_ENTER_M = 9000;
const TRACKED_MODEL_EXIT_M = 14000;
const HUB = "http://127.0.0.1:8768/log";
// loopback http — unreachable (mixed content) from an https page.
const HUB_REACHABLE = typeof window !== "undefined" && window.location.protocol === "http:";

// render styles only. "falsecolor" was called "flir" — it is an iron palette
// mapped onto the brightness of map imagery, with no infrared sensor anywhere
// in the path, so it no longer wears a thermal camera's name.
const STYLES = ["normal", "crt", "nvg", "falsecolor", "saturation", "noir"];
const GLOBES = ["osm", "dark", "sat"];

const LAYER_ROWS = [
  { id: "flights", label: "flights", honesty: "opensky · asherin.eye feed · live follow", keyed: false },
  { id: "military", label: "military flights", honesty: "adsb.lol mil · asherin.eye feed", keyed: false },
  { id: "ships", label: "ships", honesty: "aisstream needs a bound key", keyed: true },
  { id: "stations", label: "stations", honesty: "iss + tiangong · asherin.eye feed", keyed: false },
  { id: "quakes", label: "earthquakes", honesty: "usgs last 24h · asherin.eye feed", keyed: false },
  { id: "fires", label: "fires", honesty: "nasa firms needs a bound key", keyed: true },
  { id: "launches", label: "launches", honesty: "the spacedevs · asherin.eye feed", keyed: false },
  { id: "traffic", label: "traffic", honesty: "tomtom needs a bound key", keyed: true },
  { id: "cameras", label: "public cameras", honesty: "austin + tfl catalogs · no hijack", keyed: false },
  { id: "radio", label: "radio", honesty: "radio browser · asherin.eye feed", keyed: false },
  { id: "spaceweather", label: "space weather", honesty: "noaa kp index · asherin.eye feed", keyed: false },
  {
    id: "engine",
    label: "engine pins",
    honesty: "asherin.engine places on the globe · not a search results list",
    keyed: false,
  },
  {
    id: "sats",
    label: "satellites",
    honesty: "celestrak tle + sgp4 orbit rings · gev class · not a classified catalog",
    keyed: false,
  },
  {
    id: "atmo",
    label: "atmosphere",
    honesty: "nasa gibs ozone tiles + ionosphere shell scaled by noaa kp · schematic height, not a lab",
    keyed: false,
  },
  {
    id: "lands",
    label: "territories",
    honesty: "world-atlas countries · click a country to highlight · ice/amber glass · not a threat tint",
    keyed: false,
  },
  {
    id: "zones",
    label: "zones",
    honesty: "open-meteo air quality grid · green good · brown no/mid · red unhealthy · not a war overlay",
    keyed: false,
  },
  {
    id: "dark",
    label: "dark zones",
    honesty:
      "cells where our live public layers are sparse · missing public data is a signal · not an intercept blackout",
    keyed: false,
  },
  {
    id: "brittle",
    label: "fault lines",
    honesty: "osm power/port/air/hospital/mast + usgs quakes nearby · public brittle nodes · not an attack list",
    keyed: false,
  },
  {
    id: "future",
    label: "future land",
    honesty: "pb2002 plate edges · 50-200yr motion is meters · speculative cartography, not a new continent",
    keyed: false,
  },
  {
    id: "route",
    label: "unstable route",
    honesty: "osrm public road route re-costed by open-meteo wind/precip · routing + weather cost only, no prediction",
    keyed: false,
  },
  {
    id: "buildings",
    label: "city volumes",
    honesty:
      "openstreetmap footprints extruded · surveyed height where tagged, flat 8 m guess where not · a footprint is a map, not a floor plan",
    keyed: false,
  },
  {
    id: "avoid",
    label: "avoidance grid",
    honesty:
      "our own recorded ads-b density folded into 0.25° cells · a hole is only called a void when the ring around it is busy · young grid says unobserved, not avoided",
    keyed: false,
  },
];

// the sheet reads as four questions rather than one alphabet of chips.
const LAYER_GROUPS = [
  { id: "air", label: "air + orbit", ids: ["flights", "military", "stations", "launches", "sats", "traffic"] },
  { id: "earth", label: "earth", ids: ["quakes", "fires", "zones", "lands", "future", "brittle", "buildings"] },
  { id: "public", label: "public signals", ids: ["cameras", "radio", "spaceweather", "atmo", "engine", "ships"] },
  { id: "analysis", label: "analysis", ids: ["dark", "route", "avoid"] },
];


const LAYER_COLOR = {
  flights: "#fbbf24",
  military: "#34d399",
  stations: "#67e8f9",
  quakes: "#f87171",
  launches: "#fb7185",
  cameras: "#f472b6",
  radio: "#a78bfa",
  spaceweather: "#fde68a",
  engine: "#9ec9ff",
  sats: "#7dd3fc",
  atmo: "#a5f3fc",
  lands: "#9ec9ff",
  zones: "#86efac",
  dark: "#64748b",
  brittle: "#fb7185",
  future: "#fde68a",
  route: "#67e8f9",
  buildings: "#cbd5e1",
  avoid: "#f0abfc",
  brain: "#f0d08a",
};

// ── natural language → geospatial intent ─────────────────────────────────────
// A sentence only reaches the resolver when it reads like an INSTRUCTION about
// the world rather than a place name. "new delhi" is a place lookup and must
// stay one — round-tripping it through a model would cost a second and change
// nothing. "show me every mosque in karnataka" is an intent: a what, a where,
// and a way of finding it that no button on this rail encodes.
const INTENT_RE =
  /\b(show|find|mark|highlight|trace|list|plot|map|pull|where\s+(?:are|is|can)|which|how many|all\s+\w+\s+(?:in|near|around|within)|near|within|inside|owned by|hosted|servers?|databases?|open ports?|ip[s]?\b|asn|running|around this|from here)\b/i;

function looksLikeIntent(s) {
  const t = String(s || "").trim();
  if (t.length < 8) return false;
  if (t.split(/\s+/).length < 3) return false;
  return INTENT_RE.test(t);
}

const MISSIONS = [
  { id: "air", title: "air", layers: ["flights", "military"], fly: { lat: 40.64, lon: -73.78, alt: 280000 } },
  { id: "space", title: "space", layers: ["stations", "sats", "atmo"], fly: { lat: 28.57, lon: -80.65, alt: 4.2e6 } },
  { id: "earth", title: "earth watch", layers: ["quakes"], fly: { lat: 19.4, lon: -155.3, alt: 1.1e6 } },
  { id: "city", title: "city", layers: ["cameras", "radio"], fly: { lat: 51.5, lon: -0.12, alt: 420000 } },
];

const CAM_MODES = ["chase", "orbit", "nadir"];
const TOUR_SHOTS = [
  { lat: 20, lon: -30, alt: 1.9e7, heading: 25, pitch: -65, duration: 5 },
  { lat: 46, lon: 2, alt: 8e6, heading: 40, pitch: -52, duration: 5 },
  { lat: 35, lon: 139, alt: 4.2e6, heading: 22, pitch: -46, duration: 5 },
  { lat: 37.6, lon: -122.4, alt: 1.7e6, heading: 8, pitch: -40, duration: 5 },
];

const EYE_HUD_CSS = `
  /* eye-fit-any-screen — size from the pane, never vw/window.
     the globe canvas is transparent: the operator's own dashboard surface is
     the sky, so no cesium starfield is painted over their wallpaper. */
  .eye-root {
    position:absolute; inset:0; width:100%; height:100%; min-width:0; min-height:0;
    overflow:hidden; background:transparent; color-scheme:dark;
    container-type:size; container-name:eye;
    --ink: hsl(var(--foreground));
    --mute: hsl(var(--muted-foreground));
    --line: hsl(var(--foreground) / .10);
    --line-soft: hsl(var(--foreground) / .06);
    --pane: hsl(var(--background) / .72);
    --pane-deep: hsl(var(--background) / .86);
    --accent: hsl(var(--accent));
    --accent-ink: hsl(var(--accent-foreground));
    --r: clamp(0.9rem, 1.8cqi, 1.25rem);
    --pad: clamp(6px, 1.4cqi, 16px);
    --dock-h: clamp(168px, 30cqh, 268px);
    --safe-t: env(safe-area-inset-top, 0px);
    --safe-r: env(safe-area-inset-right, 0px);
    --safe-b: env(safe-area-inset-bottom, 0px);
    --safe-l: env(safe-area-inset-left, 0px);
    --fs: clamp(11px, 0.9cqi + 0.35cqh, 14px);
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    margin: 0; color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-weight: 200; letter-spacing: -.01em; font-size: var(--fs);
  }
  .eye-root, .eye-root * { box-sizing: border-box; }
  .eye-root * { scrollbar-width: thin; overscroll-behavior: contain; }
  #eye-stage { position:absolute; inset:0; background:transparent; width:100%; height:100%; min-width:0; min-height:0; }
  .eye-root .cesium-widget, .eye-root .cesium-viewer, .eye-root .cesium-widget canvas, .eye-root .cesium-viewer canvas {
    width:100% !important; height:100% !important; max-width:100%; max-height:100%;
    background:transparent !important;
  }
  .eye-root .cesium-viewer-bottom, .eye-root .cesium-viewer-toolbar, .eye-root .cesium-viewer-animationContainer,
  .eye-root .cesium-viewer-timelineContainer, .eye-root .cesium-credit-textContainer,
  .eye-root .cesium-credit-logoContainer, .eye-root .cesium-widget-credits { display:none !important; }
  /* no floating watermark over the globe — attribution lives in the layers sheet */

  .glass {
    background: var(--pane);
    backdrop-filter: blur(28px) saturate(1.05);
    -webkit-backdrop-filter: blur(28px) saturate(1.05);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: 0 24px 70px -34px rgba(0,0,0,.95), inset 0 1px 0 hsl(var(--foreground) / .04);
  }
  .lbl {
    font: 400 clamp(9px, .92cqi, 10px)/1 inherit; letter-spacing:.22em;
    text-transform:uppercase; color: hsl(var(--foreground) / .38);
  }

  .misb {
    position:absolute; top:calc(var(--pad) + var(--safe-t)); left:calc(var(--pad) + var(--safe-l)); z-index:8;
    padding: clamp(9px, 1.3cqi, 14px) clamp(11px, 1.6cqi, 17px); pointer-events:auto; min-width:0;
    max-width: min(300px, calc(100cqi - 2 * var(--pad) - 72px));
    font: 200 clamp(11px, 1.15cqi, 13px)/1.5 inherit; color: var(--ink);
  }
  .misb b {
    color: var(--ink); font-weight:300; letter-spacing:.16em; text-transform:uppercase;
    font-size: clamp(10px, 1cqi, 11px);
  }
  .misb .m { color: var(--mute); font-size: clamp(10px, 1.05cqi, 12px); overflow-wrap:anywhere; }
  .misb #hud-line { font-variant-numeric: tabular-nums; color: hsl(var(--foreground) / .62); }

  /* ── layers sheet: outer frame, inset inner frame, vertical spine ───────
     the frame is the drawn reference — an outer rounded rectangle, a hairline
     rail down the left carrying the panel word, and the controls living inside
     a second rounded rectangle set in from it. */
  .sheet {
    position:absolute; right:calc(var(--pad) + var(--safe-r)); top:calc(var(--pad) + var(--safe-t));
    bottom:calc(var(--dock-h) + var(--safe-b) + 10px); z-index:8;
    width: min(326px, 34cqi, calc(100% - 2 * var(--pad)));
    max-height: calc(100cqh - var(--dock-h) - var(--pad) * 2 - var(--safe-t) - var(--safe-b));
    padding: clamp(8px, 1.1cqi, 12px); overflow:hidden; pointer-events:auto;
    display:flex; flex-direction:column;
  }
  .sheet-frame {
    flex:1 1 auto; min-height:0; display:grid; grid-template-columns:22px minmax(0, 1fr);
    border:1px solid hsl(var(--foreground) / .16); border-radius:calc(var(--r) - 6px); overflow:hidden;
  }
  .sheet-spine {
    border-right:1px solid hsl(var(--foreground) / .16);
    display:flex; align-items:flex-start; justify-content:center; padding-top:12px;
    background: hsl(var(--foreground) / .02);
  }
  .sheet-spine span {
    writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg);
    font:400 clamp(8px, .85cqi, 9.5px)/1 inherit; letter-spacing:.32em; text-transform:uppercase;
    color: hsl(var(--foreground) / .32); white-space:nowrap;
  }
  .sheet-body {
    min-width:0; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch;
    padding: clamp(10px, 1.4cqi, 15px);
  }
  .sheet-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
  .sheet-close { display:none; border:0; background:transparent; color:var(--mute); cursor:pointer; font:300 12px/1 inherit; padding:6px 8px; }
  .sheet h2 {
    margin:0 0 10px; font:400 clamp(9px, .95cqi, 10px)/1 inherit; letter-spacing:.22em;
    text-transform:uppercase; color: hsl(var(--foreground) / .38);
  }
  .sheet-card {
    border:1px solid var(--line); border-radius:14px; padding:clamp(9px, 1.2cqi, 12px);
    background: hsl(var(--foreground) / .022); margin-bottom:10px;
  }
  .sheet-card > h2 { margin-bottom:9px; }
  .sheet .row {
    display:flex; justify-content:space-between; gap:10px; font-size:clamp(10px, 1.05cqi, 11px);
    padding:7px 0; border-bottom:1px solid var(--line-soft); min-width:0; color: hsl(var(--foreground) / .55);
  }
  .sheet .row:last-child { border-bottom:0; }
  .sheet .row span { min-width:0; overflow-wrap:anywhere; }
  .sheet .k { color: hsl(var(--foreground) / .34); flex:0 0 auto; }
  #globe-btns, #style-btns { display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr)); gap:6px; }
  .lgroup + .lgroup { margin-top:11px; }
  .lgroup-h {
    font:400 clamp(8px, .85cqi, 9.5px)/1 inherit; letter-spacing:.26em; text-transform:uppercase;
    color: hsl(var(--foreground) / .28); margin:0 0 7px; display:flex; align-items:center; gap:8px;
  }
  .lgroup-h::after { content:""; flex:1 1 auto; height:1px; background:var(--line-soft); }
  .lgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 6.6rem), 1fr)); gap:6px; }
  .grid, #mission-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 8.5rem), 1fr)); gap:8px; }
  #mission-grid button {
    border-radius:12px; padding:clamp(8px, 1.2cqi, 12px); border:1px solid var(--line);
    background: hsl(var(--foreground) / .03); color:var(--ink); cursor:pointer; text-transform:lowercase;
    min-height:40px; width:100%; font:300 clamp(11px, 1.1cqi, 13px)/1 inherit;
    transition: background .3s var(--ease), border-color .3s var(--ease);
  }
  #mission-grid button:hover { background: hsl(var(--foreground) / .07); border-color: hsl(var(--foreground) / .18); }

  .tog {
    display:flex; align-items:center; gap:8px; text-align:left; width:100%; min-height:34px;
    border:1px solid var(--line); border-radius:11px; padding:8px 10px; cursor:pointer;
    color: hsl(var(--foreground) / .6); font:300 clamp(10px, 1.05cqi, 11.5px)/1.25 inherit;
    background: hsl(var(--foreground) / .028);
    transition: color .3s var(--ease), border-color .3s var(--ease), background .3s var(--ease);
  }
  .tog::before {
    content:""; flex:0 0 auto; width:5px; height:5px; border-radius:2px;
    background: hsl(var(--foreground) / .22);
    transition: background .3s var(--ease), box-shadow .3s var(--ease);
  }
  .tog:hover { color: var(--ink); border-color: hsl(var(--foreground) / .22); background: hsl(var(--foreground) / .055); }
  .tog.on {
    background: hsl(var(--accent) / .12); color: var(--accent);
    border-color: hsl(var(--accent) / .4);
  }
  .tog.on::before { background: var(--accent); box-shadow: 0 0 8px hsl(var(--accent) / .65); }
  .tog.keyed { opacity:.44; }
  .tog.keyed::before { background: hsl(var(--foreground) / .12); }

  .contacts {
    position:absolute; left:calc(var(--pad) + var(--safe-l));
    top:calc(var(--pad) + var(--safe-t) + clamp(64px, 14cqh, 116px));
    bottom:calc(var(--dock-h) + var(--safe-b) + 10px); z-index:8;
    width:min(264px, 28cqi); padding:clamp(11px, 1.4cqi, 15px); overflow:auto; pointer-events:auto;
    -webkit-overflow-scrolling: touch;
  }
  .contacts[hidden] { display:none; }
  .contacts .hit {
    display:block; width:100%; text-align:left; border:0; background:transparent; color: hsl(var(--foreground) / .78);
    font:300 clamp(11px, 1.1cqi, 12px)/1.45 inherit; padding:8px 0; border-bottom:1px solid var(--line-soft); cursor:pointer;
    transition: color .25s var(--ease);
  }
  .contacts .hit:hover { color: var(--accent); }
  .contacts .hit span { color: hsl(var(--foreground) / .34); display:block; font-size:clamp(10px, 1cqi, 11px); }

  /* ── camera wall: agency-published frames, never a hijacked device ──── */
  .camwall {
    position:absolute; left:calc(var(--pad) + var(--safe-l));
    top:calc(var(--pad) + var(--safe-t) + clamp(64px, 14cqh, 116px));
    bottom:calc(var(--dock-h) + var(--safe-b) + 10px); z-index:9;
    width:min(392px, 38cqi); padding:clamp(11px, 1.4cqi, 15px);
    overflow:auto; pointer-events:auto; -webkit-overflow-scrolling:touch;
  }
  .camwall[hidden] { display:none; }
  .camwall-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .camwall h2 {
    margin:0 0 10px; font:400 clamp(9px, .95cqi, 10px)/1 inherit; letter-spacing:.22em;
    text-transform:uppercase; color: hsl(var(--foreground) / .38); overflow-wrap:anywhere;
  }
  #camwall-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr)); gap:8px; }
  .camcell {
    border:1px solid var(--line); border-radius:12px; overflow:hidden; background:hsl(var(--foreground) / .03);
    cursor:pointer; padding:0; text-align:left; color:var(--ink); width:100%; display:block;
    transition: border-color .3s var(--ease), transform .3s var(--ease);
  }
  .camcell:hover { border-color: hsl(var(--accent) / .42); transform: translateY(-1px); }
  .camcell.on { border-color: hsl(var(--accent) / .6); }
  .camcell .shot, #camwall-focus .shot {
    display:block; width:100%; aspect-ratio:16/9; object-fit:cover; background:hsl(var(--foreground) / .05);
  }
  .camcell .cap {
    display:block; padding:6px 8px 8px; font:300 clamp(9.5px, 1cqi, 11px)/1.35 inherit;
    color: hsl(var(--foreground) / .66); overflow-wrap:anywhere;
  }
  .camcell .cap i { display:block; font-style:normal; color: hsl(var(--foreground) / .32); }
  #camwall-focus { margin-bottom:10px; }
  #camwall-focus:empty { display:none; }
  #camwall-focus .shot { border-radius:12px; border:1px solid hsl(var(--accent) / .38); aspect-ratio:16/9; }
  #camwall-focus .meta {
    padding:7px 2px 0; font:300 clamp(10px, 1.05cqi, 11.5px)/1.45 inherit; color: hsl(var(--foreground) / .6);
    overflow-wrap:anywhere;
  }
  #camwall-focus .meta b { color: var(--accent); font-weight:400; }
  .camwall-foot {
    margin-top:10px; padding-top:8px; border-top:1px solid var(--line-soft);
    font:300 clamp(9.5px, 1cqi, 11px)/1.45 inherit; color: hsl(var(--foreground) / .34); overflow-wrap:anywhere;
  }

  #note {
    position:absolute; right:calc(var(--pad) + var(--safe-r));
    bottom:calc(var(--dock-h) + var(--safe-b) + 10px); z-index:8;
    padding:clamp(7px, 1.1cqi, 10px) clamp(10px, 1.4cqi, 14px);
    font:300 clamp(10px, 1.05cqi, 11.5px)/1.4 inherit; color:var(--mute);
    max-width:min(320px, calc(100cqi - 2 * var(--pad))); pointer-events:none;
  }
  #note:empty { display:none; }
  #trackbox { position:absolute; inset:0; z-index:5; pointer-events:none; width:100%; height:100%; }

  /* ── the dock: asherin.eye speaks through a conversation, and the
     navigation is the quiet rail underneath it ─────────────────────── */
  .eye-dock {
    position:absolute; left:50%; transform:translateX(-50%);
    bottom:calc(var(--pad) + var(--safe-b)); z-index:11;
    width:min(720px, calc(100cqi - 2 * var(--pad) - var(--safe-l) - var(--safe-r)));
    display:flex; flex-direction:column; min-width:0; pointer-events:auto;
    overflow:hidden;
  }
  .eye-dock .chat-log {
    overflow-y:auto; padding:12px 14px 4px; flex:1; min-height:0;
    max-height:min(30cqh, 210px); -webkit-overflow-scrolling:touch;
    display:flex; flex-direction:column; gap:9px;
  }
  .eye-dock .chat-log:empty { display:none; }
  .eye-dock .chat-log .me, .eye-dock .chat-log .bot {
    font:300 clamp(11px, 1.1cqi, 12.5px)/1.55 inherit; overflow-wrap:anywhere; max-width:88%;
    animation: eye-say .35s var(--ease) both;
  }
  .eye-dock .chat-log .me {
    align-self:flex-end; color: var(--accent-ink); background: hsl(var(--accent) / .92);
    border-radius:14px 14px 4px 14px; padding:7px 12px;
  }
  .eye-dock .chat-log .bot {
    align-self:flex-start; color: hsl(var(--foreground) / .82); white-space:pre-wrap;
    border-left:1px solid hsl(var(--accent) / .35); padding:1px 0 1px 11px;
  }
  @keyframes eye-say { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  .eye-dock .chat-row { display:flex; gap:8px; align-items:center; padding:10px 12px; min-width:0; }
  .eye-dock input {
    flex:1; min-width:0; border-radius:999px; border:1px solid var(--line);
    background: hsl(var(--foreground) / .04); color: var(--ink);
    padding:10px 15px; font:300 clamp(11px, 1.1cqi, 12.5px) inherit; outline:none;
    transition: border-color .3s var(--ease), background .3s var(--ease);
  }
  .eye-dock input::placeholder { color: hsl(var(--foreground) / .3); }
  .eye-dock input:focus { border-color: hsl(var(--accent) / .5); background: hsl(var(--foreground) / .06); }
  .eye-dock button.go {
    border:1px solid hsl(var(--accent) / .5); border-radius:999px; padding:9px 17px; cursor:pointer;
    background: hsl(var(--accent) / .16); color: var(--accent);
    font:400 clamp(10px, 1cqi, 11px)/1 inherit; letter-spacing:.18em; text-transform:uppercase;
    flex:0 0 auto; min-height:38px; transition: background .3s var(--ease);
  }
  .eye-dock button.go:hover { background: hsl(var(--accent) / .28); }

  .dock-nav {
    /* wraps so no control is ever hidden off the right edge of the dock */
    display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:0 12px 11px;
    scrollbar-width:none;
  }
  .dock-nav::-webkit-scrollbar { display:none; }
  .dock-sep { flex:0 0 auto; width:1px; height:16px; background: var(--line); margin:0 3px; }
  .dock-nav .cmd, .dock-nav .nav {
    flex:0 0 auto; white-space:nowrap; cursor:pointer;
    border:1px solid var(--line-soft); border-radius:999px; padding:7px 12px; min-height:34px;
    background: transparent; color: hsl(var(--foreground) / .48);
    font:300 clamp(10px, 1cqi, 11px)/1 inherit; letter-spacing:.04em;
    transition: color .3s var(--ease), border-color .3s var(--ease), background .3s var(--ease);
  }
  .dock-nav .cmd:hover, .dock-nav .nav:hover { color: var(--ink); border-color: hsl(var(--foreground) / .2); }
  .dock-nav .cmd.on, .dock-nav .nav.on {
    background: hsl(var(--accent) / .14); color: var(--accent); border-color: hsl(var(--accent) / .42);
  }

  #hover-card {
    position:absolute; z-index:12; display:none; pointer-events:none;
    min-width:min(160px, calc(100cqi - 16px)); max-width:min(240px, calc(100cqi - 16px));
    max-height:min(40cqh, 220px); overflow:auto;
    padding:clamp(9px, 1.2cqi, 12px); font:300 clamp(10px, 1.05cqi, 11px)/1.45 inherit; color:var(--ink);
    transform:translate(-50%, calc(-100% - 14px));
  }
  #hover-card.below { transform:translate(-50%, 14px); }
  #hover-card b { display:block; color:var(--accent); font-weight:400; margin-bottom:4px; overflow-wrap:anywhere; }
  #hover-card .m { color:var(--mute); overflow-wrap:anywhere; }

  /* selected-object inspector: click is persistent, hover stays a glance. */
  .inspect {
    position:absolute; z-index:13; display:none; flex-direction:column;
    right:calc(var(--pad) + var(--safe-r)); top:calc(var(--pad) + var(--safe-t) + 64px);
    width:min(320px, calc(100cqi - 2 * var(--pad))); max-height:min(52cqh, 460px);
    padding:clamp(10px, 1.3cqi, 14px); gap:8px; overflow:auto;
    font:300 clamp(10px, 1.05cqi, 11.5px)/1.5 inherit; color:var(--ink);
  }
  .inspect.open { display:flex; }
  .inspect-head { display:flex; align-items:flex-start; gap:8px; justify-content:space-between; }
  .inspect-head b { font-weight:400; color:var(--accent); overflow-wrap:anywhere; }
  .inspect .sub { color:var(--mute); letter-spacing:.04em; }
  .chip {
    display:inline-flex; align-items:center; gap:5px; align-self:flex-start;
    border:1px solid var(--line); border-radius:999px; padding:3px 9px;
    color:var(--mute); font-size:10px; letter-spacing:.05em;
  }
  .chip::before { content:""; width:6px; height:6px; border-radius:50%; background:hsl(var(--foreground) / .35); }
  .chip.live::before { background:#4ade80; }
  .chip.derived::before { background:#7dd3fc; }
  .chip.render::before { background:#c4b5fd; }
  .chip.stale::before { background:#fbbf24; }
  .chip.degraded::before { background:#f87171; }
  .chip.keyed::before { background:#a8a29e; }
  .inspect .f { display:flex; justify-content:space-between; gap:10px; border-top:1px solid var(--line-soft); padding-top:5px; }
  .inspect .f span:first-child { color:var(--mute); }
  .inspect .f.unknown span:last-child { color:hsl(var(--foreground) / .38); font-style:italic; }
  .inspect .acts { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
  .inspect .acts button {
    cursor:pointer; border:1px solid var(--line-soft); border-radius:999px; padding:6px 11px; min-height:32px;
    background:transparent; color:hsl(var(--foreground) / .6); font:300 10.5px/1 inherit; letter-spacing:.04em;
  }
  .inspect .acts button:hover:not(:disabled) { color:var(--ink); border-color:hsl(var(--foreground) / .22); }
  .inspect .acts button:disabled { opacity:.34; cursor:not-allowed; }
  .inspect .limit { color:var(--mute); border-top:1px solid var(--line-soft); padding-top:6px; }
  .eye-root :focus-visible { outline:1px solid var(--accent); outline-offset:2px; }

  /* layer rows carry their own provenance + freshness instead of one global note */
  .lstate { display:block; margin-top:3px; font-size:9.5px; letter-spacing:.03em; color:hsl(var(--foreground) / .38); text-transform:none; }
  .tog.bad { border-color:hsl(0 72% 62% / .45); }
  .tog.aged { border-color:hsl(38 92% 55% / .4); }

  .dock-group { display:flex; gap:6px; flex-wrap:wrap; }
  .tools-menu {
    display:flex; flex-wrap:wrap; gap:6px; width:100%; padding:8px 0 0; margin-top:2px;
    border-top:1px solid var(--line-soft);
  }
  .tools-menu[hidden] { display:none; }

  #glitch {
    position:absolute; inset:0; z-index:7; pointer-events:none; display:none;
    background:
      repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--accent) / .06) 3px),
      hsl(var(--background) / .12);
    mix-blend-mode: screen;
    animation: eye-glitch .28s linear;
  }
  @keyframes eye-glitch {
    0% { opacity:0; transform:translateX(0); }
    30% { opacity:1; transform:translateX(-6px); }
    60% { opacity:.7; transform:translateX(5px); }
    100% { opacity:0; transform:translateX(0); }
  }

  @container eye (max-width: 900px) {
    .sheet-close { display:inline-flex; }
    .misb { max-width: calc(100cqi - 2 * var(--pad) - 72px); }
    .sheet {
      display:none; left:calc(var(--pad) + var(--safe-l)); right:calc(var(--pad) + var(--safe-r));
      top:auto; width:auto; height:min(44cqh, 52%); bottom:calc(var(--dock-h) + var(--safe-b) + 8px);
    }
    .sheet.open { display:flex; flex-direction:column; }
    .sheet-frame { grid-template-columns: minmax(0, 1fr); }
    .sheet-spine { display:none; }
    .contacts, .camwall {
      left:calc(var(--pad) + var(--safe-l)); right:calc(var(--pad) + var(--safe-r));
      width:auto; top:calc(var(--pad) + var(--safe-t) + 64px); bottom:auto; height:min(40cqh, 300px);
    }
    .eye-dock { width:calc(100cqi - 2 * var(--pad) - var(--safe-l) - var(--safe-r)); }
    #note { max-width:calc(100cqi - 2 * var(--pad)); }
  }
  @container eye (max-height: 560px) {
    .misb { padding:7px 11px; }
    .eye-root { --dock-h: clamp(128px, 34cqh, 190px); }
    .eye-dock .chat-log { max-height:min(24cqh, 120px); }
    .sheet { max-height:calc(100cqh - var(--dock-h) - 12px); }
    .contacts, .camwall { top:calc(var(--pad) + 46px); }
  }
  @container eye (min-width: 1600px) {
    .sheet { width: min(340px, 22cqi); }
    .contacts { width: min(280px, 18cqi); }
    .eye-dock { width: min(820px, calc(100cqi - 2 * var(--pad))); }
  }
  @media (pointer: coarse) {
    .tog, .dock-nav .cmd, .dock-nav .nav, .go, .hit, .sheet-close, #mission-grid button { min-height:44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .eye-root *, .eye-root *::before, .eye-root *::after { animation-duration:.001ms !important; transition-duration:.001ms !important; }
  }
`;

function discoverMapsKey() {
  try {
    const env = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || import.meta.env?.VITE_CESIUM_ION_TOKEN || "";
    if (env)
      return {
        google: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
        ion: import.meta.env.VITE_CESIUM_ION_TOKEN || "",
      };
  } catch {}
  const keys = ["asherin_google_maps_key", "google_maps_api_key", "GOOGLE_MAPS_API_KEY", "cesium_ion_token"];
  const out = { google: "", ion: "" };
  try {
    for (const k of keys) {
      const v = localStorage.getItem(k) || "";
      if (!v) continue;
      if (/ion|cesium/i.test(k)) out.ion = v;
      else out.google = v;
    }
  } catch {}
  return out;
}

function keyBound() {
  const names = [
    "asherin_venice_key",
    "venice_api_key",
    "openai_api_key",
    "OPENAI_API_KEY",
    "gemini_api_key",
    "GEMINI_API_KEY",
    "anthropic_api_key",
    "asherin_openai_key",
    "asherin_gemini_key",
  ];
  try {
    for (const n of names) if (localStorage.getItem(n)) return true;
  } catch {}
  return false;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script fail " + src));
    document.head.appendChild(s);
  });
}

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

async function authedJson(path, body, ms = 20000) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("sign in to load live layers");
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  // a hung feed must say it timed out, never spin a layer forever.
  const ctl = new AbortController();
  const bell = setTimeout(() => ctl.abort(), ms);
  let r;
  try {
    r = await fetch(`${base}/functions/v1/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: key,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("that feed took too long. try again in a moment.");
    throw new Error("network refused that feed");
  } finally {
    clearTimeout(bell);
  }
  const text = await r.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`feed replied with ${r.status} and no json`);
  }
  if (!r.ok && !(j && Array.isArray(j.rows))) {
    throw new Error(String(j?.error || `feed failed with ${r.status}`).toLowerCase());
  }
  return j || {};
}

async function eyeFeed(feed, params = {}) {
  const j = await authedJson("asherin-eye-feed", { feed, params });
  if (j.error && !Array.isArray(j.rows)) throw new Error(j.error);
  return j;
}

// the resolver takes minutes-free work but overpass is a volunteer service and
// the plan can chain up to four sources, so the deadline here is generous and
// explicit rather than the default feed deadline.
async function eyeBrain(q, camera) {
  const j = await authedJson("asherin-eye-brain", { q, camera }, 90000);
  if (j.error) throw new Error(j.error);
  return j;
}


async function eyeTalk(messages) {
  try {
    const j = await authedJson("chat", { messages, organ: "eye", surface: "asherin.eye" });
    return j;
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

// airframe kind for the silhouette: the icao type designator when the feed
// carries one (adsb.lol `t`), else the opensky/ads-b emitter category. opensky's
// `origin` is a COUNTRY, never a type code, so it is deliberately not passed in.
function glyphClass(row) {
  return classifyAircraft({ typeCode: row?.type || "", category: row?.category });
}

// base billboard footprint in css px; each class scales against the airliner.
const FLEET_ICON_PX = 19;
const TRACKED_ICON_BUMP = 1.35;

function glyphSize(kind, isTracked) {
  const s = CLASS_SCALE_2D[kind] || 1;
  return Math.round(FLEET_ICON_PX * s * (isTracked ? TRACKED_ICON_BUMP : 1));
}

// every kind now has its own airframe, so the class is the class — no bucket.
function hangarClass(row) {
  return typeof row === "string" ? row : glyphClass(row);
}

function hangarModel(kind) {
  return HANGAR[kind] || HANGAR.airliner;
}

// the meshes are already life-sized. widebody and quadjet share one hull, so
// they get the only correction in the table.
function hangarScale(kind) {
  return kind === "widebody" ? 1.35 : kind === "quadjet" ? 1.45 : 1;
}

// chase distance has to follow the airframe. a hundred and forty metres behind
// a bell 206 is a speck; the same number behind a 787 is inside the wing.
const HANGAR_LENGTH_M = {
  widebody: 62, quadjet: 70, airliner: 37, turboprop: 27,
  bizjet: 16, fastjet: 17, light: 9, glider: 12, uav: 11, helicopter: 14,
};

function hangarViewFrom(C, kind) {
  const L = HANGAR_LENGTH_M[kind] || 37;
  return new C.Cartesian3(-L * 3.2, -L * 3.2, L * 1.2);
}

function reckon(sample, nowMs) {
  const dt = Math.max(0, Math.min(90, (nowMs - (sample.t || nowMs)) / 1000));
  const speed = Number(sample.speed || 0);
  const hdg = Number(sample.heading || 0);
  if (!speed || dt < 0.05) return { lat: sample.lat, lon: sample.lon, alt: sample.alt || 0, heading: hdg };
  const dist = speed * dt;
  const R = 6371000;
  const lat1 = (sample.lat * Math.PI) / 180;
  const lon1 = (sample.lon * Math.PI) / 180;
  const brng = (hdg * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) + Math.cos(lat1) * Math.sin(dist / R) * Math.cos(brng));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dist / R) * Math.cos(lat1),
      Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
    alt: sample.alt || 0,
    heading: hdg,
  };
}

function shaderFor(style, Cesium) {
  const time = () => performance.now() / 1000;
  const stages = {
    crt: `uniform sampler2D colorTexture; in vec2 v_textureCoordinates; uniform float time;
      void main() { vec2 uv=v_textureCoordinates; uv.x += sin(uv.y*80.0+time*6.0)*0.0015;
        vec4 s=texture(colorTexture,uv); vec3 c=s.rgb; float scan=0.88+0.12*sin(uv.y*720.0);
        c*=vec3(0.75,1.05,0.72)*scan; out_FragColor=vec4(c,s.a); }`,
    nvg: `uniform sampler2D colorTexture; in vec2 v_textureCoordinates;
      void main() { vec4 s=texture(colorTexture,v_textureCoordinates); vec3 c=s.rgb;
        float l=dot(c,vec3(0.3,0.59,0.11)); vec2 uv=v_textureCoordinates-0.5;
        float vig=smoothstep(0.85,0.15,length(uv));
        out_FragColor=vec4(vec3(0.05,l*1.35,0.08)*vig,s.a); }`,
    // iron palette over rendered map brightness. no sensor, no temperature.
    falsecolor: `uniform sampler2D colorTexture; in vec2 v_textureCoordinates;
      void main() { vec4 s=texture(colorTexture,v_textureCoordinates); vec3 c=s.rgb;
        float t=dot(c,vec3(0.3,0.59,0.11)); vec3 iron=mix(vec3(0.0,0.0,0.12),vec3(1.0,0.85,0.2),t);
        iron=mix(iron,vec3(1.0),smoothstep(0.7,1.0,t)); out_FragColor=vec4(iron,s.a); }`,
    saturation: `uniform sampler2D colorTexture; in vec2 v_textureCoordinates;
      void main() { vec4 s=texture(colorTexture,v_textureCoordinates); vec3 c=s.rgb;
        c=mix(vec3(dot(c,vec3(0.3,0.59,0.11))),c,1.6); c=clamp(c,0.0,1.0);
        out_FragColor=vec4(c,s.a); }`,
    noir: `uniform sampler2D colorTexture; in vec2 v_textureCoordinates;
      void main() { vec4 s=texture(colorTexture,v_textureCoordinates); vec3 c=s.rgb;
        float l=dot(c,vec3(0.3,0.59,0.11)); l=smoothstep(0.12,0.88,l);
        vec2 uv=v_textureCoordinates-0.5; float vig=smoothstep(0.9,0.2,length(uv));
        out_FragColor=vec4(vec3(l)*vig,s.a); }`,
  };
  const src = stages[style];
  if (!src) return null;
  return new Cesium.PostProcessStage({ fragmentShader: src, uniforms: { time } });
}

function kmBetween(Cesium, a, b) {
  return Cesium.Cartesian3.distance(a, b) / 1000;
}

function extractPlaces(text) {
  const out = [];
  const re = /(-?\d{1,2}\.\d{2,})\s*[, ]\s*(-?\d{1,3}\.\d{2,})/g;
  let m;
  while ((m = re.exec(text || ""))) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)
      out.push({ lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` });
  }
  return out;
}

const AsherinEyeView = () => {
  const hostRef = useRef(null);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    let dead = false;
    let viewer;
    let pollers = [];
    const cleanups = [];
    let stage;
    let tracked;
    let trail;
    // fleet track history: one polyline per contact, only for the contacts
    // nearest the camera so a 2 500-aircraft snapshot never becomes 2 500 lines.
    let trailsOn = false;
    const fleetTrails = {};
    const FLEET_TRAIL_MAX = 90;
    const FLEET_TRAIL_KM = 900;
    let modelOn = false;
    let camMode = "chase";
    let orbitHeading = 0;
    let atmoLayer = null;
    let lastAltBand = "";
    let hoverEnt = null;
    let paneWatch = null;
    let keyHandler = null;
    const fitGlobe = () => {
      try {
        viewer?.resize();
      } catch {}
      const box = root.querySelector(".eye-root") || root;
      const cv = root.querySelector("#trackbox");
      if (cv && box) {
        const w = Math.max(1, box.clientWidth);
        const h = Math.max(1, box.clientHeight);
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
        }
      }
    };
    const satRecs = {};
    const pathHist = {};
    const layerOn = {};
    let cmdMode = "place";
    LAYER_ROWS.forEach((l) => (layerOn[l.id] = false));
    const ds = {};
    const samples = {};
    const status = { photoreal: "pending", voice: "off", style: "normal", map: "osm" };
    // per-layer health. a poll that fails no longer disappears into a bare
    // catch — the layer chip goes red and says what broke, and the pins that
    // are still on screen stop pretending to be current.
    const health = createHealthRegistry();
    // one load token per layer: a slow answer that arrives after a newer one
    // must never repaint the older rows over the newer ones.
    const loadToken = {};
    // when the feed answers out of its own stale cache we record why, so the
    // chip can say "stale" even though the request itself succeeded.
    const upstreamStale = {};
    let selected = null;
    const chatLog = [];

    const html = `
      <style>${EYE_HUD_CSS}</style>
      <div class="eye-root">
        <div id="eye-stage"></div>
        <canvas id="trackbox"></canvas>
        <div class="glass misb">
          <div><b>asherin.eye</b></div>
          <div class="m" id="hud-line">loading globe…</div>
          <div class="m" id="hud-honesty"></div>
        </div>
        <div class="glass sheet" id="sheet">
          <div class="sheet-frame">
            <div class="sheet-spine"><span>asherin.eye</span></div>
            <div class="sheet-body">
              <div class="sheet-head">
                <h2>layers</h2>
                <button type="button" class="sheet-close" id="sheet-close">close</button>
              </div>
              <div class="sheet-card"><div id="layer-btns"></div></div>
              <div class="sheet-card">
                <h2>globe</h2>
                <div id="globe-btns"></div>
                <h2 style="margin-top:12px">look</h2>
                <div id="style-btns"></div>
              </div>
              <div class="sheet-card">
                <h2>first look</h2>
                <div class="grid" id="mission-grid"></div>
              </div>
              <div class="sheet-card">
                <h2>what these are</h2>
                <div class="row"><span class="k">photoreal 3d tiles</span><span id="pr-status">…</span></div>
                <div class="row"><span class="k">local 3d geometry</span><span>openstreetmap footprints extruded in the browser · generated blocks, not captured photogrammetry</span></div>
                <div class="row"><span class="k">cables</span><span>omitted · non-commercial license</span></div>
                <div class="row"><span class="k">airframe model</span><span>a model class picked from the icao type code or emitter category · a stand-in, never the exact geometry of that tail number</span></div>
                <div class="row"><span class="k">track box</span><span>a reticle drawn on the contact you selected · there is no object detector on this view</span></div>
                <div class="row"><span class="k">false colour</span><span>iron palette over the brightness of map imagery · no infrared sensor, no temperature anywhere here</span></div>
                <div class="row"><span class="k">green tint</span><span>a colour filter on the daylight render · not an image intensifier</span></div>
                <div class="row"><span class="k">place pins</span><span>a typed place resolved by a public geocoder and pinned · no search results page</span></div>
                <div class="row"><span class="k">place dossier</span><span>public indexes shown source by source · not deeds, not occupancy, not criminal records · unknown stays unknown</span></div>
                <div class="row"><span class="k">trail</span><span>fixes this session observed from ads-b, geodesic · track history draws the nearest 90 contacts</span></div>
                <div class="row"><span class="k">camera modes</span><span>chase · orbit · nadir · tour</span></div>
                <div class="row"><span class="k">satellites</span><span>celestrak tle propagated to now · accuracy decays with epoch age</span></div>
                <div class="row"><span class="k">atmosphere</span><span>gibs ozone imagery on a shell whose height is illustrative and scaled by the noaa kp index · not a measured profile</span></div>
                <div class="row"><span class="k">territories</span><span>cartographic outlines · disputed borders are not adjudicated here</span></div>
                <div class="row"><span class="k">coverage gaps</span><span>cells where the layers you enabled returned little public data · never a blackout, jamming or intercept finding</span></div>
                <div class="row"><span class="k">density grid</span><span>ads-b fixes this deployment recorded, per 0.25° cell · a thin cell means less was observed, not that aircraft avoid it</span></div>
                <div class="row"><span class="k">plate motion</span><span>pb2002 edges with published rates · metres per century, not a forecast of future coastlines</span></div>
                <div class="row"><span class="k">weather-weighted route</span><span>an osrm driving route re-costed by forecast wind and rain · no quantum or predictive routing exists here</span></div>
                <div class="row"><span class="k">public cameras</span><span>frames agencies publish openly · nothing is accessed without permission</span></div>
                <div class="row"><span class="k">photo pin</span><span>gps tags read in your browser from an image you supplied · a stripped photo stays unplaceable</span></div>
              </div>
              <div class="sheet-card" style="margin-bottom:0">
                <h2>attribution</h2>
                <div class="row"><span class="k">imagery</span><span>© esri world imagery · © carto · © openstreetmap contributors</span></div>
                <div class="row"><span class="k">engine</span><span>cesiumjs · satellite.js · public feeds named per layer</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="glass contacts" id="contacts" hidden>
          <h2>contacts · 250 km</h2>
          <div id="contact-list"></div>
        </div>
        <div class="glass camwall" id="camwall" hidden>
          <div class="camwall-head">
            <h2 id="camwall-title">street cameras</h2>
            <button type="button" class="sheet-close" id="camwall-close" style="display:block">close</button>
          </div>
          <div id="camwall-focus"></div>
          <div id="camwall-grid"></div>
          <div class="camwall-foot" id="camwall-foot"></div>
        </div>
        <div class="glass hover-card" id="hover-card"></div>
        <aside class="glass inspect" id="inspect" aria-label="selected object" hidden>
          <div class="inspect-head">
            <div>
              <b id="insp-title">nothing selected</b>
              <div class="sub" id="insp-kind"></div>
            </div>
            <button type="button" class="sheet-close" id="insp-close" style="display:block">close</button>
          </div>
          <span class="chip" id="insp-chip"></span>
          <div id="insp-fields"></div>
          <div class="acts" id="insp-acts"></div>
          <div class="limit" id="insp-limit"></div>
        </aside>
        <div id="glitch"></div>
        <input id="exif-file" type="file" accept="image/jpeg,image/jpg,image/png" hidden />
        <div class="glass note" id="note"></div>
        <div class="glass eye-dock" id="eye-dock">
          <div class="chat-log" id="chat-log"></div>
          <div class="chat-row">
            <input id="chat-in" type="text" placeholder="ask asherin.eye — or name a place" autocomplete="off" />
            <button type="button" class="go" id="chat-go">ask</button>
          </div>
          <div class="dock-nav" id="dock-nav">
            <button type="button" class="cmd on" id="cmd-place">place</button>
            <button type="button" class="cmd" id="cmd-property">property</button>
            <span class="dock-sep"></span>
            <button type="button" class="nav" id="btn-layers">layers</button>
            <button type="button" class="nav" id="btn-inspect" disabled title="select an object on the globe first">selected</button>
            <button type="button" class="nav" id="btn-measure">measure</button>
            <button type="button" class="nav" id="btn-draw">draw</button>
            <span class="dock-sep"></span>
            <span class="dock-group" id="track-group" hidden>
              <button type="button" class="nav" id="btn-chase">chase</button>
              <button type="button" class="nav" id="btn-orbit">orbit</button>
              <button type="button" class="nav" id="btn-nadir">nadir</button>
              <button type="button" class="nav" id="btn-cockpit">cockpit</button>
              <button type="button" class="nav" id="btn-trackbox" title="draws a reticle on the contact you selected · not an object detector">track box</button>
            </span>
            <button type="button" class="nav" id="btn-tools" aria-expanded="false" aria-controls="tools-menu">tools</button>
            <div class="tools-menu" id="tools-menu" hidden>
              <button type="button" class="nav" id="btn-contacts">contacts</button>
              <button type="button" class="nav" id="btn-camwall">cameras</button>
              <button type="button" class="nav" id="btn-tour">tour</button>
              <button type="button" class="nav" id="btn-clear-board">clear board</button>
              <button type="button" class="nav" id="btn-record">record</button>
              <button type="button" class="nav" id="btn-voice">voice</button>
              <button type="button" class="nav" id="btn-share">share</button>
              <button type="button" class="nav" id="btn-exif">pin photo</button>
              <button type="button" class="nav" id="btn-reset">reset globe</button>
            </div>
          </div>
        </div>
      </div>`;
    root.innerHTML = html;

    const $ = (id) => root.querySelector(id);
    const setNote = (t) => {
      const n = $("#note");
      if (n) n.textContent = t || "";
    };
    // cesium renamed wgs84ToWindowCoordinates → worldToWindowCoordinates; keep both
    // paths alive so the hover card projects on old and new engine builds alike.
    const toWindowXY = (cartesian) => {
      const st = window.Cesium?.SceneTransforms;
      if (!viewer || !st || !cartesian) return null;
      const fn = st.worldToWindowCoordinates || st.wgs84ToWindowCoordinates;
      if (typeof fn !== "function") return null;
      try {
        return fn.call(st, viewer.scene, cartesian) || null;
      } catch {
        return null;
      }
    };
    const setHud = () => {
      if (!viewer) return;
      const C = window.Cesium;
      const cam = viewer.camera;
      const carto = C.Cartographic.fromCartesian(cam.positionWC);
      const lat = C.Math.toDegrees(carto.latitude).toFixed(3);
      const lon = C.Math.toDegrees(carto.longitude).toFixed(3);
      const alt = Math.round(carto.height);
      $("#hud-line").textContent = `${lat} · ${lon} · ${alt} m · ${status.style} · ${status.map}`;
      const hangar = tracked && modelOn ? " · 3d airframe" : "";
      const modeBit = camMode !== "chase" ? ` · camera ${camMode}` : "";
      $("#hud-honesty").textContent = tracked
        ? `tracking ${tracked.label || "contact"}${hangar}${modeBit} · live trail from ads-b fixes`
        : "click a contact to track. chase / orbit / nadir move the camera. esc releases.";
      $("#pr-status").textContent = status.photoreal;
    };

    function applyStyle(name) {
      status.style = name;
      const C = window.Cesium;
      if (stage) {
        viewer.scene.postProcessStages.remove(stage);
        stage = null;
      }
      if (name !== "normal") {
        stage = shaderFor(name, C);
        if (stage) viewer.scene.postProcessStages.add(stage);
      }
      root.querySelectorAll("#style-btns .tog").forEach((b) => b.classList.toggle("on", b.dataset.style === name));
      writeShare();
    }

    function applyGlobe(kind) {
      const C = window.Cesium;
      status.map = kind;
      try {
        viewer.imageryLayers.removeAll();
        if (kind === "sat") {
          viewer.imageryLayers.addImageryProvider(
            new C.UrlTemplateImageryProvider({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              credit: "esri world imagery",
              maximumLevel: 19,
            }),
          );
          viewer.scene.globe.baseColor = C.Color.BLACK;
          viewer.scene.skyAtmosphere.show = false;
        } else if (kind === "dark") {
          viewer.imageryLayers.addImageryProvider(
            new C.UrlTemplateImageryProvider({
              url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              credit: "© carto · © osm",
            }),
          );
          viewer.scene.globe.baseColor = C.Color.fromCssColorString("#07080a");
          viewer.scene.skyAtmosphere.show = false;
        } else {
          viewer.imageryLayers.addImageryProvider(
            new C.UrlTemplateImageryProvider({
              url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              credit: "© openstreetmap",
            }),
          );
          viewer.scene.globe.baseColor = C.Color.BLUE;
          viewer.scene.skyAtmosphere.show = false;
        }
      } catch (e) {
        setNote("globe look failed · " + (e.message || e));
      }
      root.querySelectorAll("#globe-btns .tog").forEach((b) => b.classList.toggle("on", b.dataset.globe === kind));
      writeShare();
      setHud();
    }

    function writeShare() {
      if (!viewer) return;
      const C = window.Cesium;
      const cam = viewer.camera;
      const c = C.Cartographic.fromCartesian(cam.positionWC);
      const on = Object.keys(layerOn)
        .filter((k) => layerOn[k])
        .join(",");
      const hash = `#lat=${C.Math.toDegrees(c.latitude).toFixed(4)}&lon=${C.Math.toDegrees(c.longitude).toFixed(4)}&alt=${Math.round(c.height)}&heading=${C.Math.toDegrees(cam.heading).toFixed(1)}&pitch=${C.Math.toDegrees(cam.pitch).toFixed(1)}&style=${STYLES.indexOf(status.style) + 1}&layers=${on}&map=${status.map}`;
      try {
        history.replaceState(null, "", hash);
      } catch {}
    }

    function readShare() {
      const raw = location.hash.replace(/^#/, "");
      return Object.fromEntries(
        raw
          .split("&")
          .filter(Boolean)
          .map((x) => x.split("=")),
      );
    }

    function flyTo(lat, lon, alt) {
      viewer.camera.flyTo({
        destination: window.Cesium.Cartesian3.fromDegrees(lon, lat, alt),
        duration: 2.2,
      });
    }

    function dsFor(id) {
      if (!ds[id]) {
        ds[id] = new window.Cesium.CustomDataSource(id);
        viewer.dataSources.add(ds[id]);
      }
      return ds[id];
    }

    function clearDs(id) {
      if (ds[id]) ds[id].entities.removeAll();
      if (id === "flights" || id === "military") {
        Object.keys(samples).forEach((k) => {
          if (k.startsWith(id + ":")) delete samples[k];
        });
      }
    }

    // one place where the truth chip under a layer button is repainted, so the
    // sheet never disagrees with what the feed just did.
    function paintLayerState(id) {
      const snap = health.snapshot(id);
      const btn = root.querySelector(`#layer-btns .tog[data-layer="${id}"]`);
      if (!btn) return;
      const cap = capabilityFor(id);
      const state = stateFor(id, snap);
      const line = btn.querySelector(".lstate");
      if (line) {
        line.textContent =
          state === "requires_key"
            ? `${cap?.provider || "external"} · needs key`
            : `${cap?.provider || (cap?.origin === "render" ? "rendered here" : "computed here")} · ${stateWord(state)}${
                snap.freshness === "never" ? "" : ` · ${healthLabel(snap)}`
              }`;
      }
      btn.classList.toggle("bad", state === "degraded");
      btn.classList.toggle("aged", state === "stale");
      btn.title = `${cap?.limitation || ""}${snap.lastError ? ` · last error: ${snap.lastError}` : ""}`;
    }

    function paintAllLayerStates() {
      LAYER_ROWS.forEach((r) => paintLayerState(r.id));
    }

    /** every layer read goes through here: health in, stale answers dropped. */
    async function runLayerLoad(id, { quiet = false } = {}) {
      const token = (loadToken[id] = (loadToken[id] || 0) + 1);
      health.begin(id);
      paintLayerState(id);
      try {
        const rows = await loadLayer(id, () => loadToken[id] === token);
        if (loadToken[id] !== token) return null;
        health.ok(id, { rows: typeof rows === "number" ? rows : null });
        if (upstreamStale[id]) health.fail(id, upstreamStale[id]);
        paintLayerState(id);
        return rows;
      } catch (e) {
        if (loadToken[id] !== token) return null;
        health.fail(id, e);
        paintLayerState(id);
        // the first failure speaks; the retries stay quiet and let the chip carry it.
        if (!quiet && health.get(id).fails === 1) setNote(`${id}: ${e?.message || e}`);
        throw e;
      }
    }

    async function enableLayer(id, on) {
      layerOn[id] = on;
      root.querySelectorAll("#layer-btns .tog").forEach((b) => {
        if (b.dataset.layer === id) b.classList.toggle("on", on);
      });
      if (!on) {
        if (id === "atmo") clearAtmo();
        clearDs(id);
        health.reset(id);
        paintLayerState(id);
        return;
      }
      setNote(`loading ${id}…`);
      try {
        await runLayerLoad(id);
        setNote("");
      } catch {
        /* runLayerLoad already spoke once and marked the layer degraded */
      }
      writeShare();
    }

    function flightPositionProperty(eid) {
      const C = window.Cesium;
      return new C.CallbackProperty(() => {
        const s = samples[eid];
        if (!s) return undefined;
        const r = reckon(s, Date.now());
        return C.Cartesian3.fromDegrees(r.lon, r.lat, r.alt);
      }, false);
    }

    function flightOrientationProperty(eid) {
      const C = window.Cesium;
      return new C.CallbackProperty(() => {
        const s = samples[eid];
        if (!s) return undefined;
        const r = reckon(s, Date.now());
        const pos = C.Cartesian3.fromDegrees(r.lon, r.lat, r.alt);
        // roll comes from how fast the track itself is turning, so an aircraft
        // in a turn banks into it instead of sliding round flat like a decal.
        const roll = C.Math.toRadians(Math.max(-32, Math.min(32, (s.turnRate || 0) * 3.2)));
        const hpr = new C.HeadingPitchRoll(
          C.Math.toRadians(r.heading + MODEL_HEADING_OFFSET_DEG),
          0,
          roll,
        );
        return C.Transforms.headingPitchRollQuaternion(pos, hpr);
      }, false);
    }

    // screen-space glyph spin. rotating by raw compass heading is only correct
    // looking straight down; the moment the camera tilts, a north-up spin makes
    // every silhouette read as a card turned toward the viewer instead of an
    // aircraft on a track. so the nose is aimed along the track AS PROJECTED
    // ONTO THE SCREEN: take the position, take a point one kilometre ahead on
    // the same bearing, project both, and point the glyph down that vector.
    function flightRotationProperty(eid) {
      const C = window.Cesium;
      const scratchA = new C.Cartesian2();
      const scratchB = new C.Cartesian2();
      return new C.CallbackProperty(() => {
        const s = samples[eid];
        if (!s) return 0;
        const r = reckon(s, Date.now());
        const hdg = C.Math.toRadians(r.heading || 0);
        // one kilometre of "ahead" in degrees, latitude-corrected.
        const dLat = (Math.cos(hdg) * 1000) / 111320;
        const dLon = (Math.sin(hdg) * 1000) / (111320 * Math.max(0.08, Math.cos((r.lat * Math.PI) / 180)));
        const here = C.Cartesian3.fromDegrees(r.lon, r.lat, r.alt);
        const ahead = C.Cartesian3.fromDegrees(r.lon + dLon, r.lat + dLat, r.alt);
        const a = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, here, scratchA);
        const b = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, ahead, scratchB);
        // behind the horizon or off-projection: fall back to the flat compass
        // spin rather than snapping the glyph to due north.
        if (!a || !b) return -hdg;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) + Math.abs(dy) < 0.0001) return -hdg;
        // glyphs are drawn nose-up (screen -y); window y grows downward while
        // cesium's billboard rotation is counter-clockwise positive.
        return -Math.atan2(dx, -dy);
      }, false);
    }

    function upsertFlights(id, rows) {
      const C = window.Cesium;
      const src = dsFor(id);
      const seen = new Set();
      const color = LAYER_COLOR[id] || "#94a3b8";
      const now = Date.now();
      (rows || []).forEach((row, i) => {
        if (row.lat == null || row.lon == null) return;
        let alt = Number(row.alt || 0);
        if (alt > 20000) alt = alt * 0.3048;
        const eid = `${id}:${row.id || i}`;
        seen.add(eid);
        const kind = glyphClass(row);
        const klass = hangarClass(kind);
        const isTracked = tracked?.id === eid;
        // turn rate in degrees per second, from the previous fix. shortest-arc
        // so a 359° → 001° crossing is a two degree turn, not a 358 degree one.
        const prev = samples[eid];
        let turnRate = 0;
        if (prev) {
          const dt = Math.max(0.5, (now - (prev.t || now)) / 1000);
          const dh = (((Number(row.heading || 0) - Number(prev.heading || 0)) % 360) + 540) % 360 - 180;
          turnRate = Math.max(-6, Math.min(6, dh / dt));
        }
        samples[eid] = {
          turnRate,
          lat: Number(row.lat),
          lon: Number(row.lon),
          alt,
          speed: Number(row.speed || 0),
          heading: Number(row.heading || 0),
          t: now,
          label: row.label || id,
          kind,
          klass,
        };
        const hist = pathHist[eid] || (pathHist[eid] = []);
        const last = hist[hist.length - 1];
        if (!last || Math.abs(last.lat - Number(row.lat)) + Math.abs(last.lon - Number(row.lon)) > 0.00025) {
          hist.push({ lat: Number(row.lat), lon: Number(row.lon), alt, t: now });
          if (hist.length > 240) hist.splice(0, hist.length - 240);
        }
        const px = glyphSize(kind, isTracked);
        let ent = src.entities.getById(eid);
        if (!ent) {
          ent = src.entities.add({
            id: eid,
            name: row.label || id,
            position: flightPositionProperty(eid),
            orientation: flightOrientationProperty(eid),
            billboard: {
              image: aircraftIcon(kind, isTracked ? TRACKED_ICON_PX : undefined),
              width: px,
              height: px,
              // no alignedAxis: the glyph is spun in screen space by rotation,
              // so an axis lock would fight the track angle.
              rotation: flightRotationProperty(eid),
              color: C.Color.fromCssColorString(color),
              // from orbit a busy corridor collapses into one yellow smear, so
              // the silhouette shrinks with camera range instead of stacking.
              scaleByDistance: new C.NearFarScalar(3.0e5, 1.0, 1.4e7, 0.34),
              translucencyByDistance: new C.NearFarScalar(3.0e5, 1.0, 1.4e7, 0.62),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            model: {
              uri: hangarModel(kind),
              scale: hangarScale(kind),
              // a real airframe at real scale disappears from four kilometres
              // out, so it keeps a floor in pixels while staying life-sized up
              // close. no maximumScale: it must never grow past its own size.
              minimumPixelSize: 56,
              color: C.Color.fromCssColorString("#e8e4d8"),
              colorBlendMode: C.ColorBlendMode.HIGHLIGHT,
              colorBlendAmount: 0.55,
              show: false,
            },
            viewFrom: hangarViewFrom(C, kind),
            asherin: { kind: id, label: row.label || id, lat: row.lat, lon: row.lon, klass, airframe: kind },
          });
        } else {
          ent.name = row.label || id;
          ent.asherin = { kind: id, label: row.label || id, lat: row.lat, lon: row.lon, klass, airframe: kind };
          if (ent.model) {
            ent.model.uri = hangarModel(kind);
            ent.model.scale = hangarScale(kind);
          }
          if (ent.billboard) {
            ent.billboard.image = aircraftIcon(kind, isTracked ? TRACKED_ICON_PX : undefined);
            ent.billboard.width = px;
            ent.billboard.height = px;
          }
        }
      });
      src.entities.values.slice().forEach((e) => {
        if (!seen.has(e.id) && tracked?.id !== e.id) {
          src.entities.remove(e);
          dropTrail(e.id);
          delete pathHist[e.id];
        }
      });
    }

    function plotRows(id, rows, note) {
      const C = window.Cesium;
      if (id === "flights" || id === "military") {
        upsertFlights(id, rows);
        if (note) setNote(note);
        return;
      }
      const src = dsFor(id);
      src.entities.removeAll();
      const color = LAYER_COLOR[id] || "#94a3b8";
      (rows || []).forEach((row, i) => {
        if (row.lat == null || row.lon == null) return;
        const alt = Number(row.alt || 0);
        const mag = Number(row.mag || 0);
        const ent = {
          id: `${id}:${row.id || i}`,
          name: row.label || id,
          position: C.Cartesian3.fromDegrees(row.lon, row.lat, alt),
          asherin: {
            kind: id,
            label: row.label || id,
            lat: row.lat,
            lon: row.lon,
            url: row.url,
            image: row.image,
            note: row.note,
            video: row.video,
            credit: row.credit,
            city: row.city,
            roadway: row.roadway,
            direction: row.direction,
            km: row.km,
          },
        };
        if (id === "quakes") {
          ent.ellipse = {
            semiMajorAxis: 4000 + mag * 9000,
            semiMinorAxis: 4000 + mag * 9000,
            material: C.Color.fromCssColorString(color).withAlpha(0.55),
            height: 0,
          };
        } else if (id === "zones") {
          const band = String(row.band || "brown");
          const fill = band === "green" ? "#4ade80" : band === "red" ? "#f87171" : "#a8a29e";
          ent.ellipse = {
            semiMajorAxis: 28000,
            semiMinorAxis: 28000,
            material: C.Color.fromCssColorString(fill).withAlpha(0.28),
            height: 0,
            outline: true,
            outlineColor: C.Color.fromCssColorString(fill),
          };
        } else if (id === "dark") {
          ent.ellipse = {
            semiMajorAxis: 42000,
            semiMinorAxis: 42000,
            material: C.Color.fromCssColorString("#334155").withAlpha(0.35),
            height: 0,
          };
        } else {
          ent.point = {
            pixelSize: id === "stations" || id === "sats" ? 8 : 9,
            color: C.Color.fromCssColorString(color),
          };
        }
        if (id === "brittle" || id === "engine" || id === "cameras" || id === "sats" || id === "stations") {
          ent.label = {
            text: String(row.label || id).slice(0, 42),
            font: "11px Inter",
            fillColor: C.Color.fromCssColorString("#EDEAE4"),
            pixelOffset: new C.Cartesian2(0, -18),
            // outlined type instead of a filled chip: chip backgrounds
            // composite unpredictably against the transparent sky buffer.
            showBackground: false,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: C.Color.fromCssColorString("#07070A").withAlpha(0.9),
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          };
        }
        src.entities.add(ent);
      });
      if (note) setNote(note);
    }

    // ── camera wall ─────────────────────────────────────────────────────
    // a frame is only worth showing if it is the frame the agency is
    // publishing right now, so every tile re-requests its own still on a
    // cadence and carries the agency that owns it. nothing is hijacked;
    // these are open, published catalogues.
    let camRows = [];
    let camFocusId = null;
    let camTimer = null;
    const CAM_REFRESH_MS = 15_000;
    const CAM_TILES = 12;

    const camBust = (u) => (u ? u + (u.includes("?") ? "&" : "?") + "_t=" + Date.now() : "");

    function camWallOpen() {
      const el = $("#camwall");
      return el && !el.hidden;
    }

    function renderCamWall() {
      const grid = $("#camwall-grid");
      const focus = $("#camwall-focus");
      const foot = $("#camwall-foot");
      if (!grid) return;
      const live = camRows.filter((c) => c.image);
      if (!live.length) {
        grid.innerHTML = "";
        focus.innerHTML = "";
        foot.textContent = "no agency in this view publishes an open frame · turn on the cameras layer over california, new york, ontario, british columbia, austin, london or finland";
        return;
      }
      const chosen = live.find((c) => c.id === camFocusId) || null;
      focus.innerHTML = "";
      if (chosen) {
        const img = document.createElement("img");
        img.className = "shot";
        img.alt = chosen.label || "street camera frame";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = camBust(chosen.image);
        img.dataset.src = chosen.image;
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.innerHTML = "<b></b><span></span>";
        meta.querySelector("b").textContent = chosen.label || "camera";
        meta.querySelector("span").textContent =
          " · " +
          [chosen.roadway, chosen.direction, chosen.city, chosen.credit, Number.isFinite(chosen.km) ? chosen.km + " km" : ""]
            .filter(Boolean)
            .join(" · ");
        focus.append(img, meta);
      }
      grid.innerHTML = "";
      live.slice(0, CAM_TILES).forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "camcell" + (c.id === camFocusId ? " on" : "");
        const img = document.createElement("img");
        img.className = "shot";
        img.alt = c.label || "street camera frame";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = camBust(c.image);
        img.dataset.src = c.image;
        img.onerror = () => {
          // an agency frame that will not load is a dead view, not a black
          // rectangle pretending to be a street.
          b.remove();
        };
        const cap = document.createElement("span");
        cap.className = "cap";
        cap.textContent = (c.label || "camera").slice(0, 60);
        const sub = document.createElement("i");
        sub.textContent = [c.city, Number.isFinite(c.km) ? c.km + " km" : ""].filter(Boolean).join(" · ");
        cap.appendChild(sub);
        b.append(img, cap);
        b.onclick = () => {
          camFocusId = c.id;
          renderCamWall();
          flyToCamera(c);
        };
        grid.appendChild(b);
      });
      const credits = Array.from(new Set(live.map((c) => c.credit).filter(Boolean)));
      foot.textContent =
        live.length + " cameras with a live frame · refreshing every " + CAM_REFRESH_MS / 1000 + "s · " + credits.join(" · ");
    }

    function refreshCamFrames() {
      if (!camWallOpen() || document.hidden) return;
      root.querySelectorAll("#camwall img.shot").forEach((img) => {
        if (img.dataset.src) img.src = camBust(img.dataset.src);
      });
    }

    function flyToCamera(c) {
      const C = window.Cesium;
      if (!viewer || !C || !Number.isFinite(c?.lat) || !Number.isFinite(c?.lon)) return;
      viewer.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(c.lon, c.lat, 1200),
        duration: 1.1,
      });
    }

    function setCamWall(on, focusId) {
      const el = $("#camwall");
      if (!el) return;
      el.hidden = !on;
      $("#btn-camwall")?.classList.toggle("on", on);
      if (focusId) camFocusId = focusId;
      if (on) {
        $("#contacts").hidden = true;
        renderCamWall();
        if (!camTimer) camTimer = window.setInterval(refreshCamFrames, CAM_REFRESH_MS);
      } else if (camTimer) {
        window.clearInterval(camTimer);
        camTimer = null;
      }
    }

    function pinEngine(rows, flyFirst) {
      layerOn.engine = true;
      root.querySelectorAll("#layer-btns .tog").forEach((b) => {
        if (b.dataset.layer === "engine") b.classList.add("on");
      });
      const src = dsFor("engine");
      const C = window.Cesium;
      (rows || []).forEach((row, i) => {
        if (row.lat == null || row.lon == null) return;
        const id = `engine:${row.id || row.label || i}:${row.lat}:${row.lon}`;
        if (src.entities.getById(id)) return;
        const ent = {
          id,
          name: row.label || "place",
          position: C.Cartesian3.fromDegrees(row.lon, row.lat, Number(row.alt || 0)),
          point: {
            pixelSize: row.kind === "property" ? 13 : 11,
            color: C.Color.fromCssColorString(row.kind === "property" ? "#f0d08a" : "#9ec9ff"),
          },
          label: {
            text: String(row.label || "place").slice(0, 48),
            font: "12px Inter",
            fillColor: C.Color.fromCssColorString("#EDEAE4"),
            pixelOffset: new C.Cartesian2(0, -16),
            // outlined type instead of a filled chip: chip backgrounds
            // composite unpredictably against the transparent sky buffer.
            showBackground: false,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: C.Color.fromCssColorString("#07070A").withAlpha(0.9),
            outlineWidth: 3,
          },
          asherin: {
            kind: row.kind || "engine",
            label: row.label,
            lat: row.lat,
            lon: row.lon,
            note: row.note,
            intel: row.intel,
          },
        };
        const ring = Array.isArray(row.ring) ? row.ring : [];
        if (ring.length >= 3) {
          const flat = [];
          ring.forEach((p) => {
            const rlon = Number(p.lon ?? p[0]);
            const rlat = Number(p.lat ?? p[1]);
            if (Number.isFinite(rlon) && Number.isFinite(rlat)) {
              flat.push(rlon, rlat);
            }
          });
          if (flat.length >= 6) {
            ent.polygon = {
              hierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(flat)),
              material: C.Color.fromCssColorString("#f0d08a").withAlpha(0.28),
              outline: true,
              outlineColor: C.Color.fromCssColorString("#f0d08a"),
              height: 0,
            };
          }
        }
        src.entities.add(ent);
      });
      if (flyFirst && rows?.[0]) {
        const dest = Number(rows[0].flyAlt) || (rows[0].kind === "property" ? 420 : 18000);
        flyTo(rows[0].lat, rows[0].lon, dest);
      }
    }

    function kmBetween(aLat, aLon, bLat, bLon) {
      const R = 6371;
      const p1 = (aLat * Math.PI) / 180;
      const p2 = (bLat * Math.PI) / 180;
      const dLat = p2 - p1;
      const dLon = ((bLon - aLon) * Math.PI) / 180;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function setCmdMode(mode) {
      cmdMode = mode === "property" ? "property" : "place";
      const placeBtn = $("#cmd-place");
      const propBtn = $("#cmd-property");
      if (placeBtn) placeBtn.classList.toggle("on", cmdMode === "place");
      if (propBtn) propBtn.classList.toggle("on", cmdMode === "property");
      const input = $("#chat-in");
      if (input)
        input.placeholder =
          cmdMode === "property" ? "property address" : "ask asherin.eye — or name a place";
    }

    async function focusPropertyLayers(lat, lon) {
      const bits = [];
      if (layerOn.cameras) {
        try {
          const j = await eyeFeed("cameras");
          const near = (j.rows || []).filter((r) => r.lat != null && kmBetween(lat, lon, r.lat, r.lon) < 8);
          plotRows(
            "cameras",
            near,
            near.length
              ? `public cameras within 8km of this property · ${near.length}`
              : "public camera catalogs (austin/tfl) have no row this close · not a worldwide tap",
          );
          bits.push(near.length ? `public cameras ${near.length} within 8km` : "no catalog camera this close");
        } catch (e) {
          bits.push("cameras: " + String(e.message || e));
        }
      }
      if (layerOn.engine) bits.push("engine pin on this property");
      if (layerOn.flights) bits.push("flights still live around the camera");
      if (layerOn.quakes) bits.push("earthquakes still live");
      if (!bits.length) bits.push("no extra layers were on · toggle cameras or engine pins to compose them here");
      return bits;
    }

    function formatDossier(intel, layers, note) {
      const d = intel || {};
      return [
        `property · ${d.address || "unlabeled"}`,
        `- fly: z19-class rooftop (~420m), not a city glance`,
        `- quality: ${d.quality || "this is unsure"}`,
        `- owner: ${d.owner || "not on the public osm map"}`,
        `- occupant: ${d.occupant || "none mapped"}`,
        `- building: ${d.building || "no osm building tags"}`,
        `- census: ${d.census || "not a us census hit"}`,
        `- wikipedia: ${d.wikipedia || "none"}`,
        `- crime file: ${d.crime || "no live county court file in this feed"}`,
        `- layers: ${layers.join(" · ")}`,
        `- ${d.honesty || note || "public index only"}`,
      ].join("\n");
    }

    function flashGlitch() {
      const el = $("#glitch");
      if (!el) return;
      el.style.display = "block";
      window.setTimeout(() => {
        el.style.display = "none";
      }, 280);
    }

    function altitudeBand(h) {
      if (h < 80000) return "low";
      if (h < 400000) return "edge";
      if (h < 2000000) return "leo";
      return "high";
    }

    function tickGlitch() {
      if (!viewer) return;
      const h = viewer.camera.positionCartographic?.height ?? 0;
      const band = altitudeBand(h);
      if (lastAltBand && lastAltBand !== band) flashGlitch();
      lastAltBand = band;
    }

    function setHoverCard(ent, win) {
      const card = $("#hover-card");
      if (!card) return;
      if (!ent || !win) {
        card.style.display = "none";
        return;
      }
      const m = ent.asherin || {};
      // airframe is a read of the icao type code / emitter category, so it is
      // shown as a model class rather than a confirmed tail record.
      const frame = m.airframe ? ` · ${String(m.airframe)} model class` : "";
      // built as text nodes: a label, note or credit arrives from a public
      // feed and is untrusted string data, never markup.
      card.textContent = "";
      const title = document.createElement("b");
      title.textContent = String(ent.name || m.label || "asset").slice(0, 48);
      const where = document.createElement("div");
      where.className = "m";
      where.textContent = `${m.kind || ""}${frame} · ${Number(m.lat || 0).toFixed(3)}, ${Number(m.lon || 0).toFixed(3)}`;
      const note = document.createElement("div");
      note.className = "m";
      note.textContent = String(m.note || limitationFor(m.kind === "military" ? "military" : m.kind || "")).slice(0, 180);
      card.append(title, where, note);
      card.style.display = "block";
      const box = root.querySelector(".eye-root") || root;
      const cw = box.clientWidth || 1;
      const ch = box.clientHeight || 1;
      const pad = 10;
      const half = Math.min(120, cw * 0.42);
      let x = Number(win.x) || 0;
      let y = Number(win.y) || 0;
      x = Math.min(Math.max(x, pad + half), cw - pad - half);
      const below = y < 88;
      card.classList.toggle("below", below);
      y = Math.min(Math.max(y, pad + 8), ch - pad);
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    }

    function pinHoverCard() {
      if (!viewer) return;
      const ent =
        hoverEnt ||
        (tracked &&
          (() => {
            for (let i = 0; i < viewer.dataSources.length; i++) {
              const e = viewer.dataSources.get(i).entities.getById(tracked.id);
              if (e) return e;
            }
            return viewer.entities.getById(tracked?.id);
          })());
      if (!ent?.position) {
        if (!hoverEnt) setHoverCard(null);
        return;
      }
      const p = ent.position.getValue(viewer.clock.currentTime);
      if (!p) return;
      const win = toWindowXY(p);
      if (win) setHoverCard(ent, win);
    }

    // ── selected-object inspector ───────────────────────────────────────────
    // clicking used to only start a camera mode. now a click is a persistent
    // selection with one contextual panel: the fields the feed really sent, the
    // provenance and freshness of the layer behind it, and only the actions
    // that can actually run right now. a disabled action says why.
    function inspectorMeta(ent) {
      const m = { ...(ent.asherin || {}) };
      const s = samples[ent.id];
      if (s) {
        const r = reckon(s, Date.now());
        m.lat = r.lat;
        m.lon = r.lon;
        m.alt = s.alt;
        m.speed = s.speed;
        m.heading = s.heading;
      }
      if (!m.hex) {
        const tail = String(ent.id || "").split(":")[1] || "";
        if (/^[a-fA-F0-9]{6}$/.test(tail)) m.hex = tail.toLowerCase();
      }
      if (!m.label) m.label = ent.name;
      return m;
    }

    function renderInspector() {
      const panel = $("#inspect");
      if (!panel) return;
      const btn = $("#btn-inspect");
      if (!selected) {
        panel.hidden = true;
        panel.classList.remove("open");
        if (btn) {
          btn.disabled = true;
          btn.classList.remove("on");
          btn.title = "select an object on the globe first";
        }
        return;
      }
      const meta = inspectorMeta(selected);
      const kindId = meta.kind === "military" ? "military" : meta.kind;
      const model = buildInspector(meta, {
        health: kindId ? health.snapshot(kindId) : null,
        historyPoints: (pathHist[selected.id] || []).length,
        canMeasure: !!measureMode,
        canFly: !!viewer,
      });
      $("#insp-title").textContent = model.title;
      $("#insp-kind").textContent = model.kindLabel;
      const chip = $("#insp-chip");
      chip.textContent = model.chip;
      chip.className =
        "chip " +
        ({ live: "live", derived: "derived", visualization: "render", stale: "stale", degraded: "degraded", requires_key: "keyed" }[
          model.state
        ] || "");
      const fieldHost = $("#insp-fields");
      fieldHost.textContent = "";
      model.fields.forEach((f) => {
        const row = document.createElement("div");
        row.className = "f" + (f.unknown ? " unknown" : "");
        const k = document.createElement("span");
        k.textContent = f.k;
        const v = document.createElement("span");
        v.textContent = f.v;
        row.append(k, v);
        fieldHost.appendChild(row);
      });
      const acts = $("#insp-acts");
      acts.textContent = "";
      model.actions.forEach((a) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = a.label;
        b.disabled = !a.enabled;
        if (a.reason) b.title = a.reason;
        b.onclick = () => runInspectorAction(a.id, model, meta);
        acts.appendChild(b);
      });
      $("#insp-limit").textContent = model.limitation;
      panel.hidden = false;
      panel.classList.add("open");
      if (btn) {
        btn.disabled = false;
        btn.classList.add("on");
        btn.title = model.title;
      }
      const group = $("#track-group");
      if (group) group.hidden = !(meta.kind === "flights" || meta.kind === "military");
    }

    function selectEntity(ent) {
      selected = ent || null;
      renderInspector();
    }

    function closeInspector() {
      const panel = $("#inspect");
      if (panel) {
        panel.hidden = true;
        panel.classList.remove("open");
      }
      const btn = $("#btn-inspect");
      if (btn) btn.classList.remove("on");
    }

    async function runInspectorAction(id, model, meta) {
      const lat = Number(meta.lat);
      const lon = Number(meta.lon);
      if (id === "fly" && Number.isFinite(lat) && Number.isFinite(lon)) {
        flyTo(lat, lon, Math.max(2000, Number(meta.alt) || 0) + 12000);
        return;
      }
      if (id === "measure") {
        measurePts = [{ lat, lon }];
        setNote(`measuring from ${model.title} · click the second point`);
        return;
      }
      if (id === "nearby") {
        nearbyReport(lat, lon, model.title);
        return;
      }
      if (id === "track") {
        applyCamMode(camMode);
        return;
      }
      if (id === "history") {
        setTrails(true);
        setNote(`${model.title} · ${(pathHist[selected?.id] || []).length} fixes observed this session`);
        return;
      }
      if (id === "source" && model.url) {
        window.open(model.url, "_blank", "noopener,noreferrer");
      }
    }

    /** what the layers you already enabled hold within 50 km of a point. */
    function nearbyReport(lat, lon, title) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const found = [];
      Object.keys(ds).forEach((id) => {
        if (!layerOn[id]) return;
        let count = 0;
        ds[id].entities.values.forEach((e) => {
          const m = e.asherin;
          if (!m || !Number.isFinite(Number(m.lat))) return;
          if (rangeM({ lat, lon }, { lat: Number(m.lat), lon: Number(m.lon) }) <= 50_000) count += 1;
        });
        if (count) found.push(`${count} ${id}`);
      });
      const line = found.length
        ? `within 50 km of ${title}: ${found.join(" · ")} · only the layers you have enabled were searched`
        : `no entity from the layers you have enabled sits within 50 km of ${title} · this is not a statement about what is there`;
      setNote(line);
      chatLog.push({ role: "eye", text: line });
      paintChat();
    }


    function clearAtmo() {
      const C = window.Cesium;
      if (atmoLayer && viewer) {
        try {
          viewer.imageryLayers.remove(atmoLayer, true);
        } catch {}
        atmoLayer = null;
      }
      if (viewer) {
        ["iono-shell", "ozone-pane", "iono-pane"].forEach((id) => {
          const e = viewer.entities.getById(id);
          if (e) viewer.entities.remove(e);
        });
      }
    }

    async function loadAtmo() {
      const C = window.Cesium;
      clearAtmo();
      const cam = viewer.camera.positionCartographic;
      const lat = C.Math.toDegrees(cam.latitude);
      const lon = C.Math.toDegrees(cam.longitude);
      try {
        atmoLayer = viewer.imageryLayers.addImageryProvider(
          new C.UrlTemplateImageryProvider({
            url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMI_Aura_Ozone_DOAS_Total_Column_Daily/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
            credit: "nasa gibs omi ozone",
          }),
        );
        atmoLayer.alpha = 0.45;
      } catch (e) {
        setNote("ozone tiles missed · " + (e.message || e));
      }
      let kp = 3;
      try {
        const j = await eyeFeed("spaceweather");
        kp = Number(j.rows?.[0]?.kp) || 3;
      } catch {}
      const ionoH = 280000 + kp * 8000;
      viewer.entities.add({
        id: "iono-shell",
        name: "ionosphere shell",
        position: C.Cartesian3.fromDegrees(lon, lat, ionoH),
        ellipsoid: {
          radii: new C.Cartesian3(480000, 480000, 90000),
          material: C.Color.fromCssColorString("#67e8f9").withAlpha(0.08 + Math.min(0.18, kp / 80)),
          outline: true,
          outlineColor: C.Color.fromCssColorString("#67e8f9").withAlpha(0.35),
        },
        asherin: {
          kind: "atmo",
          label: `ionosphere schematic · kp ${kp}`,
          lat,
          lon,
          note: "height follows noaa kp · not a raytrace of the real f2 layer",
        },
      });
      viewer.entities.add({
        id: "ozone-pane",
        name: "ozone pane",
        rectangle: {
          coordinates: C.Rectangle.fromDegrees(lon - 7, lat - 5, lon + 7, lat + 5),
          height: 22000,
          material: C.Color.fromCssColorString("#9ec9ff").withAlpha(0.14),
          outline: true,
          outlineColor: C.Color.fromCssColorString("#9ec9ff").withAlpha(0.4),
        },
        asherin: {
          kind: "atmo",
          label: "ozone pane",
          lat,
          lon,
          note: "glass plane at tropopause class · gibs tiles on the globe are the measurement",
        },
      });
      setNote(
        `atmosphere · ozone tiles + iono shell at ~${Math.round(ionoH / 1000)} km · kp ${kp} · schematic, not a chemistry lab`,
      );
    }

    async function loadSats() {
      const C = window.Cesium;
      const sat = window.satellite;
      if (!sat) throw new Error("satellite.js not loaded");
      const j = await eyeFeed("sats");
      const src = dsFor("sats");
      src.entities.removeAll();
      Object.keys(satRecs).forEach((k) => delete satRecs[k]);
      const now = new Date();
      (j.rows || []).slice(0, 70).forEach((row, i) => {
        if (!row.tle1 || !row.tle2) return;
        let rec;
        try {
          rec = sat.twoline2satrec(String(row.tle1).trim(), String(row.tle2).trim());
        } catch {
          return;
        }
        const pv = sat.propagate(rec, now);
        if (!pv.position) return;
        const gd = sat.eciToGeodetic(pv.position, sat.gstime(now));
        const lat = sat.degreesLat(gd.latitude);
        const lon = sat.degreesLong(gd.longitude);
        const alt = gd.height * 1000;
        const eid = `sats:${row.id || i}`;
        satRecs[eid] = rec;
        const path = [];
        const periodMin = (2 * Math.PI) / rec.no;
        for (let s = 0; s < 72; s++) {
          const t = new Date(now.getTime() + (s / 72) * periodMin * 60000);
          const p2 = sat.propagate(rec, t);
          if (!p2.position) continue;
          const g2 = sat.eciToGeodetic(p2.position, sat.gstime(t));
          path.push(sat.degreesLong(g2.longitude), sat.degreesLat(g2.latitude), g2.height * 1000);
        }
        const footprint = Math.max(180000, alt * 0.35);
        src.entities.add({
          id: eid,
          name: row.label || "sat",
          position: C.Cartesian3.fromDegrees(lon, lat, alt),
          point: { pixelSize: 7, color: C.Color.fromCssColorString("#7dd3fc") },
          polyline:
            path.length >= 6
              ? {
                  positions: C.Cartesian3.fromDegreesArrayHeights(path),
                  width: 1.2,
                  material: C.Color.fromCssColorString("#7dd3fc").withAlpha(0.55),
                }
              : undefined,
          ellipse: {
            semiMajorAxis: footprint,
            semiMinorAxis: footprint,
            material: C.Color.fromCssColorString("#7dd3fc").withAlpha(0.08),
            height: 0,
            outline: true,
            outlineColor: C.Color.fromCssColorString("#7dd3fc").withAlpha(0.25),
          },
          label: {
            text: String(row.label || "sat").slice(0, 28),
            font: "11px Inter",
            fillColor: C.Color.fromCssColorString("#EDEAE4"),
            pixelOffset: new C.Cartesian2(0, -16),
            // outlined type instead of a filled chip: chip backgrounds
            // composite unpredictably against the transparent sky buffer.
            showBackground: false,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: C.Color.fromCssColorString("#07070A").withAlpha(0.9),
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          asherin: {
            kind: "sats",
            label: row.label,
            lat,
            lon,
            note: row.note || "celestrak orbit + coverage cone (elevation-class ellipse)",
          },
        });
      });
      setNote(j.note || "satellites · public tle orbits");
    }

    async function loadLands() {
      const C = window.Cesium;
      clearDs("lands");
      const src = dsFor("lands");
      const r = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json", {
        signal: AbortSignal.timeout(12000),
      });
      const topo = await r.json();
      const objects = topo.objects || {};
      const key = objects.countries ? "countries" : Object.keys(objects)[0];
      if (!key) throw new Error("world-atlas had no countries object");
      if (!window.topojson) {
        await loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js");
      }
      const geo = window.topojson.feature(topo, objects[key]);
      const dsx = await C.GeoJsonDataSource.load(geo, {
        stroke: C.Color.fromCssColorString("#9ec9ff").withAlpha(0.7),
        fill: C.Color.fromCssColorString("#9ec9ff").withAlpha(0.04),
        strokeWidth: 1.4,
      });
      dsx.entities.values.forEach((e, i) => {
        const name = e.name || e.properties?.name || e.properties?.NAME || "country";
        e.name = String(name).toLowerCase();
        e.asherin = { kind: "lands", label: e.name, note: "admin-0 outline · click to highlight · not a threat zone" };
        if (e.polygon) {
          e.polygon.material = C.Color.fromCssColorString("#9ec9ff").withAlpha(0.04);
          e.polygon.outlineColor = C.Color.fromCssColorString("#9ec9ff").withAlpha(0.55);
        }
      });
      viewer.dataSources.remove(src);
      ds.lands = dsx;
      viewer.dataSources.add(dsx);
      setNote("territories · click a country · ice glass, not a red-threat costume");
    }

    function highlightCountry(ent) {
      const C = window.Cesium;
      const src = ds.lands;
      if (!src) return;
      src.entities.values.forEach((e) => {
        if (!e.polygon) return;
        const on = e.id === ent.id;
        e.polygon.material = C.Color.fromCssColorString(on ? "#e8c56b" : "#9ec9ff").withAlpha(on ? 0.28 : 0.04);
        e.polygon.outlineColor = C.Color.fromCssColorString(on ? "#e8c56b" : "#9ec9ff");
      });
      hoverEnt = ent;
      pinHoverCard();
      setNote(`territory · ${ent.name} · public admin outline`);
    }

    function loadDark() {
      const C = window.Cesium;
      const cam = viewer.camera.positionCartographic;
      const lat = C.Math.toDegrees(cam.latitude);
      const lon = C.Math.toDegrees(cam.longitude);
      const counts = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const rlat = lat + dy * 4;
          const rlon = lon + dx * 5;
          let n = 0;
          for (let i = 0; i < viewer.dataSources.length; i++) {
            viewer.dataSources.get(i).entities.values.forEach((e) => {
              const m = e.asherin;
              if (!m || m.lat == null) return;
              if (Math.abs(m.lat - rlat) < 2.2 && Math.abs(m.lon - rlon) < 2.8) n += 1;
            });
          }
          if (n < 3) {
            counts.push({
              id: `dark-${dx}-${dy}`,
              label: n === 0 ? "no public points" : `${n} public points`,
              lat: rlat,
              lon: rlon,
              note: "sparse live public layers in this cell · not an internet-blackout claim · not intercept",
            });
          }
        }
      }
      plotRows(
        "dark",
        counts,
        counts.length
          ? `dark zones · ${counts.length} sparse cells around the camera`
          : "this view is dense with public points · no dark cell here",
      );
    }

    async function loadFuture() {
      const j = await eyeFeed("plates");
      const C = window.Cesium;
      const src = dsFor("future");
      src.entities.removeAll();
      (j.rows || []).forEach((row, i) => {
        const ring = Array.isArray(row.ring) ? row.ring : [];
        const flat = [];
        ring.forEach((p) => {
          if (Number.isFinite(p.lon) && Number.isFinite(p.lat)) flat.push(p.lon, p.lat);
        });
        if (flat.length < 4) return;
        src.entities.add({
          id: `future:${row.id || i}`,
          name: row.label || "plate edge",
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(flat),
            width: 2,
            material: C.Color.fromCssColorString("#fde68a").withAlpha(0.8),
            clampToGround: true,
          },
          asherin: { kind: "future", label: row.label, lat: row.lat, lon: row.lon, note: row.note },
        });
      });
      setNote(j.note || "plate edges · meters per century");
    }

    async function loadRoutePath(aLat, aLon, bLat, bLon) {
      const j = await eyeFeed("route", { alat: aLat, alon: aLon, blat: bLat, blon: bLon });
      const C = window.Cesium;
      const src = dsFor("route");
      src.entities.removeAll();
      const row = (j.rows || [])[0];
      const ring = Array.isArray(row?.ring) ? row.ring : [];
      const flat = [];
      ring.forEach((p) => {
        if (Number.isFinite(p.lon) && Number.isFinite(p.lat)) flat.push(p.lon, p.lat);
      });
      if (flat.length >= 4) {
        src.entities.add({
          id: "route:0",
          name: "unstable route",
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(flat),
            width: 3.2,
            material: C.Color.fromCssColorString("#67e8f9"),
            clampToGround: true,
          },
          asherin: { kind: "route", label: "unstable route", lat: aLat, lon: aLon, note: row.note },
        });
      }
      layerOn.route = true;
      setNote(row?.note || j.note || "public drive path");
      return j;
    }

    function jpegGps(buf) {
      const u8 = new Uint8Array(buf);
      if (u8[0] !== 0xff || u8[1] !== 0xd8) return null;
      let i = 2;
      while (i + 4 < u8.length) {
        if (u8[i] !== 0xff) break;
        const marker = u8[i + 1];
        const len = (u8[i + 2] << 8) | u8[i + 3];
        if (marker === 0xe1) {
          const start = i + 4;
          const head = String.fromCharCode(...u8.slice(start, start + 6));
          if (head.indexOf("Exif") < 0) {
            i += 2 + len;
            continue;
          }
          const tiff = start + 6;
          const le = u8[tiff] === 0x49;
          const u16 = (p) => (le ? u8[p] | (u8[p + 1] << 8) : (u8[p] << 8) | u8[p + 1]);
          const u32 = (p) =>
            le
              ? u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)
              : (u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
          const ifd0 = tiff + u32(tiff + 4);
          const n0 = u16(ifd0);
          let gpsOff = 0;
          for (let k = 0; k < n0; k++) {
            const p = ifd0 + 2 + k * 12;
            if (u16(p) === 0x8825) gpsOff = u32(p + 8);
          }
          if (!gpsOff) return { stripped: false, lat: null, lon: null };
          const gifd = tiff + gpsOff;
          const ng = u16(gifd);
          const tags = {};
          for (let k = 0; k < ng; k++) {
            const p = gifd + 2 + k * 12;
            tags[u16(p)] = { type: u16(p + 2), count: u32(p + 4), val: u32(p + 8) };
          }
          const rationals = (off, n) => {
            const out = [];
            for (let r = 0; r < n; r++) {
              const a = u32(off + r * 8);
              const b = u32(off + r * 8 + 4) || 1;
              out.push(a / b);
            }
            return out;
          };
          const dms = (tag) => {
            const t = tags[tag];
            if (!t) return null;
            const arr = rationals(tiff + t.val, 3);
            return arr[0] + arr[1] / 60 + arr[2] / 3600;
          };
          let lat = dms(2);
          let lon = dms(4);
          const latRef = tags[1] ? String.fromCharCode(tags[1].val & 0xff) : "N";
          const lonRef = tags[3] ? String.fromCharCode(tags[3].val & 0xff) : "E";
          if (latRef === "S") lat = -lat;
          if (lonRef === "W") lon = -lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { stripped: false, lat: null, lon: null };
          return { stripped: false, lat, lon };
        }
        if (marker === 0xda) break;
        i += 2 + len;
      }
      return { stripped: true, lat: null, lon: null };
    }

    async function pinOwnedPhoto(file) {
      const buf = await file.arrayBuffer();
      const gps = jpegGps(buf);
      if (!gps || gps.lat == null) {
        setNote(
          "no gps in this file · metadata stripped or not a jpeg with exif · geolocation from pixels is a separate ask",
        );
        chatLog.push({
          role: "eye",
          text: "no gps in that file. this is unsure. drop a jpeg you own that still has exif.",
        });
        paintChat();
        return;
      }
      pinEngine(
        [
          {
            id: "exif",
            label: (file.name || "photo").slice(0, 40),
            lat: gps.lat,
            lon: gps.lon,
            kind: "engine",
            note: "exif gps from a file you dropped · device/time stay on-disk in the organ, not a skip-trace",
          },
        ],
        true,
      );
      chatLog.push({ role: "eye", text: `pinned exif gps ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` });
      paintChat();
    }

    // ── city volumes ────────────────────────────────────────────────────────
    // footprints are a district-scale thing. asking overpass for a continent
    // would time out and would draw nothing legible anyway, so the layer says
    // plainly when the camera is too high instead of returning an empty box.
    let lastBuildingsKey = "";
    async function loadBuildings(force) {
      const C = window.Cesium;
      const carto = C.Cartographic.fromCartesian(viewer.camera.positionWC);
      const alt = carto.height;
      const lat = C.Math.toDegrees(carto.latitude);
      const lon = C.Math.toDegrees(carto.longitude);
      if (alt > 26000) {
        clearDs("buildings");
        lastBuildingsKey = "";
        setNote("city volumes want a district, not a continent · drop below ~26 km and they build themselves");
        return;
      }
      const key = `${lat.toFixed(3)}:${lon.toFixed(3)}`;
      if (!force && key === lastBuildingsKey) return;
      lastBuildingsKey = key;
      const span = alt > 12000 ? 0.014 : alt > 5000 ? 0.009 : 0.005;
      const j = await eyeFeed("buildings", { lat, lon, span });
      const src = dsFor("buildings");
      src.entities.removeAll();
      (j.rows || []).forEach((b) => {
        if (!Array.isArray(b.ring) || b.ring.length < 8) return;
        src.entities.add({
          id: `buildings:${b.id}`,
          name: b.label || "building",
          polygon: {
            hierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(b.ring)),
            extrudedHeight: Number(b.height) || 8,
            height: Number(b.base) || 0,
            perPositionHeight: false,
            material: b.estimated
              ? C.Color.fromCssColorString("#94a3b8").withAlpha(0.32)
              : C.Color.fromCssColorString("#cbd5e1").withAlpha(0.46),
            outline: true,
            outlineColor: C.Color.fromCssColorString("#e2e8f0").withAlpha(0.35),
          },
          description: `${b.label} · ${b.height} m ${b.estimated ? "(guessed, untagged)" : "(surveyed / storey count)"}`,
        });
      });
      setNote(j.note || `${(j.rows || []).length} footprints`);
      void emitPull({ organ: "eye", capability: "buildings", fromSurface: "asherin-eye", status: "ok" });
    }

    // ── avoidance grid ──────────────────────────────────────────────────────
    // reads back the shared density tally and paints only the cells that carry
    // a verdict. a young grid still draws, but it says out loud that a hole is
    // far more likely to be a gap in watching than a gap in flying.
    async function loadAvoidance() {
      const C = window.Cesium;
      const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
      const box = rect
        ? {
            south: C.Math.toDegrees(rect.south),
            north: C.Math.toDegrees(rect.north),
            west: C.Math.toDegrees(rect.west),
            east: C.Math.toDegrees(rect.east),
          }
        : { south: -90, north: 90, west: -180, east: 180 };
      const j = await authedJson("asherin-eye-record", { op: "grid", ...box, days: 7 });
      if (j.error) throw new Error(j.error);
      const cells = j.cells || [];
      if (!cells.length) {
        clearDs("avoid");
        setNote("no recorded grid here yet · turn the recorder on and the cells fill from what this tab actually watches");
        return;
      }
      const scored = scoreAvoidance(cells);
      const mat = gridMaturity(cells);
      const src = dsFor("avoid");
      src.entities.removeAll();
      let voids = 0;
      scored.forEach((c) => {
        if (c.verdict === "normal") return;
        if (c.verdict === "void") voids++;
        const b = cellBounds(c.cy, c.cx);
        const col =
          c.verdict === "void" ? "#f0abfc" : c.verdict === "thin" ? "#c4b5fd" : "#475569";
        src.entities.add({
          id: `avoid:${c.cy}:${c.cx}`,
          rectangle: {
            coordinates: C.Rectangle.fromDegrees(b.west, b.south, b.east, b.north),
            material: C.Color.fromCssColorString(col).withAlpha(c.verdict === "unobserved" ? 0.14 : 0.3),
            outline: true,
            outlineColor: C.Color.fromCssColorString(col).withAlpha(0.5),
            height: 0,
          },
          description:
            `${c.verdict} · ${c.samples} samples vs ring median ${c.ringMedian.toFixed(1)} · ` +
            `${Math.round(c.deficit * 100)}% below the ring · ${c.hours}h recorded`,
        });
      });
      setNote(`${voids} void cells · ${mat.note}`);
      void emitPull({ organ: "eye", capability: "avoidance", fromSurface: "asherin-eye", status: "ok" });
    }

    // ── recorder ────────────────────────────────────────────────────────────
    // the avoidance layer is worthless until something has been written down,
    // so the tab offers to contribute the contacts it is already displaying.
    // opt-in, throttled server-side, and the shared grid keeps counts only.
    let recordOn = false;
    let recordedTotal = 0;
    async function recordTick() {
      if (!recordOn) return;
      const rows = Object.entries(samples)
        .filter(([k]) => k.startsWith("flights:") || k.startsWith("military:"))
        .map(([k, s]) => ({
          // the entity key is `<layer>:<feed id>`; the feed id is the icao hex.
          id: k.slice(k.indexOf(":") + 1),
          label: s.label || null,
          lat: s.lat,
          lon: s.lon,
          alt: s.alt,
          speed: s.speed,
          heading: s.heading,
          kind: s.kind || null,
        }))
        .filter((r) => r.id && Number.isFinite(r.lat) && Number.isFinite(r.lon));
      if (!rows.length) return;
      const b = $("#btn-record");
      try {
        const j = await authedJson("asherin-eye-record", { op: "record", rows: rows.slice(0, 600) });
        // the function answers 200 with an { error } body on a write failure,
        // so a bare "did it throw" check would have called that a success.
        if (j.error) throw new Error(String(j.error));
        health.ok("recorder", { rows: j.recorded || 0 });
        if (j.recorded) {
          recordedTotal += j.recorded;
          if (b) {
            b.textContent = `recording · ${recordedTotal.toLocaleString()}`;
            b.classList.remove("bad");
            b.title = "opt-in · counts the contacts already on your screen into the shared density grid";
          }
        }
      } catch (e) {
        // a recorder outage must never break the globe, but it must never look
        // like a successful write either.
        health.fail("recorder", e);
        if (b) {
          b.textContent = "recorder degraded";
          b.classList.add("bad");
          b.title = `last write failed: ${health.get("recorder").lastError}`;
        }
        if (health.get("recorder").fails === 1) {
          setNote(`recorder: ${health.get("recorder").lastError} · nothing was written`);
        }
      }
    }

    // ── whiteboard ──────────────────────────────────────────────────────────
    // drawing on a globe is only worth anything if the shape becomes a question.
    // a freehand stroke is fitted to the simplest honest geometry, then asked
    // what live entities are standing inside it.
    let drawOn = false;
    let drawing = false;
    let strokePts = [];
    let boardCount = 0;

    function livePool() {
      const C = window.Cesium;
      const now = C.JulianDate.now();
      const pool = [];
      Object.entries(ds).forEach(([layer, source]) => {
        if (layer === "buildings" || layer === "avoid" || layer === "board") return;
        source.entities.values.forEach((ent) => {
          const p = ent.position?.getValue?.(now);
          if (!p) return;
          const carto = C.Cartographic.fromCartesian(p);
          if (!carto) return;
          pool.push({
            layer,
            id: String(ent.id),
            label: ent.name || String(ent.id),
            lat: C.Math.toDegrees(carto.latitude),
            lon: C.Math.toDegrees(carto.longitude),
            alt: carto.height,
          });
        });
      });
      return pool;
    }

    function screenToLonLat(x, y) {
      const C = window.Cesium;
      const cart = viewer.camera.pickEllipsoid(new C.Cartesian2(x, y), viewer.scene.globe.ellipsoid);
      if (!cart) return null;
      const carto = C.Cartographic.fromCartesian(cart);
      return { lat: C.Math.toDegrees(carto.latitude), lon: C.Math.toDegrees(carto.longitude) };
    }

    function setCameraLocked(locked) {
      const c = viewer.scene.screenSpaceCameraController;
      c.enableRotate = !locked;
      c.enableTranslate = !locked;
      c.enableTilt = !locked;
      c.enableLook = !locked;
    }

    function drawLiveStroke() {
      const C = window.Cesium;
      const src = dsFor("board");
      const id = "board:live";
      src.entities.removeById(id);
      if (strokePts.length < 2) return;
      src.entities.add({
        id,
        polyline: {
          positions: C.Cartesian3.fromDegreesArray(strokePts.flatMap((p) => [p.lon, p.lat])),
          width: 2,
          clampToGround: true,
          material: C.Color.fromCssColorString("#e8c56b").withAlpha(0.9),
        },
      });
    }

    function commitStroke() {
      const C = window.Cesium;
      const src = dsFor("board");
      src.entities.removeById("board:live");
      const shape = fitStroke(strokePts);
      strokePts = [];
      if (!shape) {
        setNote("that stroke was too short to be a shape · draw across the ground, not a tap");
        return;
      }
      boardCount += 1;
      const tag = `board:${boardCount}`;
      const ring = shape.ring.flatMap((p) => [p.lon, p.lat]);
      src.entities.add({
        id: tag,
        name: `${shape.kind} ${boardCount}`,
        polygon: {
          hierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(ring)),
          material: C.Color.fromCssColorString("#e8c56b").withAlpha(0.12),
          outline: true,
          outlineColor: C.Color.fromCssColorString("#e8c56b").withAlpha(0.75),
          classificationType: C.ClassificationType.TERRAIN,
        },
      });
      const verdict = evaluateShape(shape, livePool());
      const size =
        shape.kind === "circle" && shape.radiusM != null
          ? `radius ${fmtM(shape.radiusM)}`
          : `area ${fmtArea(shape.areaM2 || 0)}`;
      const line = `${shape.kind} ${boardCount} · ${size} · ${verdict.summary}`;
      setNote(line);
      chatLog.push({ role: "eye", text: line });
      paintChat();
      void emitPull({ organ: "eye", capability: "whiteboard", fromSurface: "asherin-eye", status: "ok" });
    }

    function bindWhiteboard() {
      const cv = viewer.canvas;
      cv.addEventListener("pointerdown", (e) => {
        if (!drawOn || e.button !== 0) return;
        drawing = true;
        strokePts = [];
        setCameraLocked(true);
        cv.setPointerCapture?.(e.pointerId);
        const p = screenToLonLat(e.offsetX, e.offsetY);
        if (p) strokePts.push(p);
      });
      cv.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const p = screenToLonLat(e.offsetX, e.offsetY);
        if (!p) return;
        const last = strokePts[strokePts.length - 1];
        if (last && Math.abs(last.lat - p.lat) + Math.abs(last.lon - p.lon) < 1e-5) return;
        strokePts.push(p);
        drawLiveStroke();
      });
      const end = () => {
        if (!drawing) return;
        drawing = false;
        setCameraLocked(false);
        commitStroke();
      };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      cv.addEventListener("pointerleave", end);
    }

    // ── measure: point · path · ring ────────────────────────────────────────
    // the overhead-frame look is not decoration. a fix, a route with leg
    // ranges, a ring with a radius call-out — each one is a question about the
    // ground answered in metres, and each stays selectable afterwards so the
    // property card can read it back.
    const MEASURE_ORDER = ["point", "path", "ring"];
    const MEASURE_HINT = {
      point: "measure · point · click the ground to drop a fix with its coordinates and elevation",
      path: "measure · path · click each turn, right-click or double-click to close · legs carry range and bearing",
      ring: "measure · ring · click the centre, then click the edge · reports radius, area and live contacts inside",
    };
    let measureMode = null;
    let measurePts = [];
    let measureCount = 0;

    const measureLabel = (id, at, text, tint) =>
      dsFor("board").entities.add({
        id,
        position: window.Cesium.Cartesian3.fromDegrees(at.lon, at.lat),
        label: {
          text,
          font: "500 12px ui-monospace, SFMono-Regular, monospace",
          fillColor: window.Cesium.Color.fromCssColorString(tint),
          showBackground: true,
          backgroundColor: window.Cesium.Color.fromCssColorString("#06070a").withAlpha(0.72),
          backgroundPadding: new window.Cesium.Cartesian2(7, 4),
          pixelOffset: new window.Cesium.Cartesian2(0, -14),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new window.Cesium.NearFarScalar(1e3, 1.0, 6e6, 0.55),
        },
      });

    function clearMeasureLive() {
      const src = dsFor("board");
      ["measure:live", "measure:live-label", "measure:live-ring"].forEach((id) => src.entities.removeById(id));
    }

    function drawMeasureLive(cursor) {
      const C = window.Cesium;
      const src = dsFor("board");
      clearMeasureLive();
      if (!cursor || !measurePts.length) return;
      if (measureMode === "path") {
        const chain = [...measurePts, cursor];
        src.entities.add({
          id: "measure:live",
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(chain.flatMap((p) => [p.lon, p.lat])),
            width: 2,
            clampToGround: true,
            material: new C.PolylineDashMaterialProperty({
              color: C.Color.fromCssColorString("#e8c56b").withAlpha(0.9),
            }),
          },
        });
        const leg = rangeM(measurePts[measurePts.length - 1], cursor);
        const total = pathLengthM(chain);
        measureLabel(
          "measure:live-label",
          cursor,
          `${fmtRange(leg)} · ${fmtBearing(bearingDeg(measurePts[measurePts.length - 1], cursor))}\ntotal ${fmtRange(total)}`,
          "#e8c56b",
        );
        return;
      }
      if (measureMode === "ring") {
        const centre = measurePts[0];
        const radius = rangeM(centre, cursor);
        if (radius < 1) return;
        src.entities.add({
          id: "measure:live-ring",
          position: C.Cartesian3.fromDegrees(centre.lon, centre.lat),
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: C.Color.fromCssColorString("#7fd6c8").withAlpha(0.08),
            outline: true,
            outlineColor: C.Color.fromCssColorString("#7fd6c8").withAlpha(0.85),
            outlineWidth: 2,
            classificationType: C.ClassificationType.TERRAIN,
          },
        });
        measureLabel("measure:live-label", cursor, `radius ${fmtRange(radius)}`, "#7fd6c8");
      }
    }

    function commitMeasure(kind, pts) {
      const C = window.Cesium;
      const src = dsFor("board");
      clearMeasureLive();
      measureCount += 1;
      const tag = `measure:${measureCount}`;
      let line = "";

      if (kind === "point") {
        const p = pts[0];
        const ground = viewer.scene.globe.getHeight(C.Cartographic.fromDegrees(p.lon, p.lat));
        line = `fix ${measureCount} · ${fmtCoord(p)}${Number.isFinite(ground) ? ` · ground ${Math.round(ground)} m` : ""}`;
        src.entities.add({
          id: tag,
          name: `fix ${measureCount}`,
          description: line,
          position: C.Cartesian3.fromDegrees(p.lon, p.lat),
          point: {
            pixelSize: 9,
            color: C.Color.fromCssColorString("#e8c56b"),
            outlineColor: C.Color.fromCssColorString("#06070a"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
        });
        measureLabel(`${tag}:label`, p, line, "#e8c56b");
      } else if (kind === "path") {
        const total = pathLengthM(pts);
        src.entities.add({
          id: tag,
          name: `path ${measureCount}`,
          description: `${pts.length - 1} legs · ${fmtRange(total)}`,
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(pts.flatMap((p) => [p.lon, p.lat])),
            width: 3,
            clampToGround: true,
            material: C.Color.fromCssColorString("#e8c56b").withAlpha(0.95),
          },
        });
        for (let i = 1; i < pts.length; i += 1) {
          const a = pts[i - 1];
          const b = pts[i];
          measureLabel(
            `${tag}:leg${i}`,
            midpoint(a, b),
            `${fmtRange(rangeM(a, b))} · ${fmtBearing(bearingDeg(a, b))}`,
            "#e8c56b",
          );
        }
        measureLabel(`${tag}:label`, pts[pts.length - 1], `path ${measureCount} · total ${fmtRange(total)}`, "#e8c56b");
        line = `path ${measureCount} · ${pts.length - 1} legs · total ${fmtRange(total)}`;
      } else {
        const centre = pts[0];
        const radius = rangeM(centre, pts[1]);
        const area = Math.PI * radius * radius;
        const inside = insideRing(centre, radius, livePool());
        src.entities.add({
          id: tag,
          name: `ring ${measureCount}`,
          description: `radius ${fmtRange(radius)} · ${inside.length} inside`,
          position: C.Cartesian3.fromDegrees(centre.lon, centre.lat),
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: C.Color.fromCssColorString("#7fd6c8").withAlpha(0.1),
            outline: true,
            outlineColor: C.Color.fromCssColorString("#7fd6c8").withAlpha(0.9),
            outlineWidth: 2,
            classificationType: C.ClassificationType.TERRAIN,
          },
        });
        const byLayer = inside.reduce((acc, c) => {
          acc[c.layer] = (acc[c.layer] || 0) + 1;
          return acc;
        }, {});
        const roster = Object.entries(byLayer)
          .map(([k, n]) => `${n} ${k}`)
          .join(" · ");
        line = `ring ${measureCount} · radius ${fmtRange(radius)} · area ${fmtArea(area)} · ${
          inside.length ? roster : "nothing live inside"
        }`;
        measureLabel(`${tag}:label`, pts[1], `radius ${fmtRange(radius)}`, "#7fd6c8");
      }

      setNote(line);
      chatLog.push({ role: "eye", text: line });
      paintChat();
      void emitPull({ organ: "eye", capability: `measure:${kind}`, fromSurface: "asherin-eye", status: "ok" });
    }

    function finishMeasurePath() {
      if (measureMode !== "path" || measurePts.length < 2) {
        measurePts = [];
        clearMeasureLive();
        return;
      }
      const pts = measurePts;
      measurePts = [];
      commitMeasure("path", pts);
    }

    function bindMeasure() {
      const cv = viewer.canvas;
      cv.addEventListener("click", (e) => {
        if (!measureMode || drawOn || e.button !== 0) return;
        const p = screenToLonLat(e.offsetX, e.offsetY);
        if (!p) {
          setNote("that click missed the globe · aim at ground, not sky");
          return;
        }
        if (measureMode === "point") {
          commitMeasure("point", [p]);
          return;
        }
        if (measureMode === "ring") {
          if (!measurePts.length) {
            measurePts = [p];
            setNote("ring centre set · click the edge");
            return;
          }
          const pts = [measurePts[0], p];
          measurePts = [];
          commitMeasure("ring", pts);
          return;
        }
        // clicking the last turn again closes the route — a double-click is a
        // pair of clicks in cesium, so this is also what makes dblclick work.
        const last = measurePts[measurePts.length - 1];
        if (last && rangeM(last, p) < Math.max(15, viewer.camera.positionCartographic.height / 900)) {
          finishMeasurePath();
          return;
        }
        measurePts.push(p);
        drawMeasureLive(p);
      });
      cv.addEventListener("dblclick", () => {
        if (measureMode === "path") finishMeasurePath();
      });
      cv.addEventListener("contextmenu", (e) => {
        if (measureMode !== "path" || !measurePts.length) return;
        e.preventDefault();
        finishMeasurePath();
      });
      cv.addEventListener("pointermove", (e) => {
        if (!measureMode || drawOn || !measurePts.length) return;
        const p = screenToLonLat(e.offsetX, e.offsetY);
        if (p) drawMeasureLive(p);
      });
      const onKey = (e) => {
        if (e.key !== "Escape" || !measureMode) return;
        measurePts = [];
        clearMeasureLive();
        setNote("measure cleared");
      };
      window.addEventListener("keydown", onKey);
      cleanups.push(() => window.removeEventListener("keydown", onKey));
    }

    // `alive` is the caller's freshness gate: if a newer read for the same
    // layer started while this one was in flight, we hand back without
    // repainting, so the older answer can never overwrite the newer one.
    async function loadLayer(id, alive = () => true) {
      if (id === "ships" || id === "fires" || id === "traffic") {
        throw new Error(LAYER_ROWS.find((x) => x.id === id).honesty);
      }
      if (id === "spaceweather") {
        const j = await eyeFeed("spaceweather");
        if (!alive()) return null;
        setNote(`planetary k-index ${j.rows?.[0]?.kp} · ${j.source || "noaa"}`);
        return j.rows?.length || 0;
      }
      if (id === "engine") {
        setNote("asherin.engine is the chat + pins. type a place. this is not a search results page.");
        return 0;
      }
      if (id === "sats") return (await loadSats()) ?? null;
      if (id === "atmo") return (await loadAtmo()) ?? null;
      if (id === "lands") return (await loadLands()) ?? null;
      if (id === "dark") return loadDark() ?? null;
      if (id === "future") return (await loadFuture()) ?? null;
      if (id === "route") {
        setNote("type route to <place> in chat · osrm public drive path + weather cost");
        return 0;
      }
      if (id === "buildings") return (await loadBuildings(true)) ?? null;
      if (id === "avoid") return (await loadAvoidance()) ?? null;
      const cam = viewer?.camera?.positionCartographic;
      const params = {};
      if (cam && window.Cesium) {
        params.lat = window.Cesium.Math.toDegrees(cam.latitude);
        params.lon = window.Cesium.Math.toDegrees(cam.longitude);
      }
      const feedName = id === "cameras" ? "cameras" : id === "zones" ? "airgrid" : id;
      const j = await eyeFeed(feedName, params);
      if (!alive()) return null;
      if (id === "cameras") {
        camRows = (j.rows || []).filter((r) => r && r.image);
        if (!camRows.some((c) => c.id === camFocusId)) camFocusId = camRows[0]?.id || null;
        setCamWall(true);
      }
      // an upstream that answered from its own stale cache is stale here too.
      upstreamStale[id] = j.fresh === false ? `upstream cache ${Math.round((j.ageMs || 0) / 1000)}s old` : null;
      const note = [j.note, j.fresh === false ? `stale ${Math.round((j.ageMs || 0) / 1000)}s` : ""]
        .filter(Boolean)
        .join(" · ");
      plotRows(id, j.rows, note);
      return (j.rows || []).length;
    }

    // ── track history ───────────────────────────────────────────────────────
    // history is what this session actually observed (plus the ads-b hex
    // backfill on the tracked contact) — never a synthesised great circle.
    function trailPositions(eid) {
      const C = window.Cesium;
      const hist = pathHist[eid] || [];
      const pts = hist.map((p) => C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt || 0));
      const s = samples[eid];
      if (s) {
        const r = reckon(s, Date.now());
        pts.push(C.Cartesian3.fromDegrees(r.lon, r.lat, r.alt || 0));
      }
      return pts;
    }

    function ensureTrail(eid, cssColor) {
      if (fleetTrails[eid]) return fleetTrails[eid];
      const C = window.Cesium;
      const base = C.Color.fromCssColorString(cssColor || "#fbbf24");
      const ent = viewer.entities.add({
        id: `eye-trail:${eid}`,
        polyline: {
          positions: new C.CallbackProperty(() => trailPositions(eid), false),
          width: 1.6,
          // occluded segments dim instead of vanishing under the terrain mesh.
          material: base.withAlpha(0.5),
          depthFailMaterial: base.withAlpha(0.22),
          arcType: C.ArcType.GEODESIC,
        },
      });
      fleetTrails[eid] = ent;
      return ent;
    }

    function dropTrail(eid) {
      const ent = fleetTrails[eid];
      if (!ent) return;
      try {
        viewer.entities.remove(ent);
      } catch {}
      delete fleetTrails[eid];
    }

    function clearFleetTrails() {
      Object.keys(fleetTrails).forEach(dropTrail);
    }

    function syncTrails() {
      if (!viewer) return;
      if (!trailsOn) {
        if (Object.keys(fleetTrails).length) clearFleetTrails();
        return;
      }
      const cam = viewer.camera.positionWC;
      const near = [];
      ["flights", "military"].forEach((id) => {
        const src = ds[id];
        if (!src || !layerOn[id]) return;
        src.entities.values.forEach((e) => {
          const hist = pathHist[e.id];
          if (!hist || hist.length < 2) return;
          const p = e.position?.getValue(viewer.clock.currentTime);
          if (!p) return;
          const km = kmBetween(window.Cesium, cam, p);
          if (km <= FLEET_TRAIL_KM) near.push({ id: e.id, km, color: LAYER_COLOR[id] });
        });
      });
      near.sort((a, b) => a.km - b.km);
      const keep = new Set(near.slice(0, FLEET_TRAIL_MAX).map((n) => n.id));
      near.slice(0, FLEET_TRAIL_MAX).forEach((n) => ensureTrail(n.id, n.color));
      Object.keys(fleetTrails).forEach((eid) => {
        if (!keep.has(eid)) dropTrail(eid);
      });
    }

    function setTrails(on) {
      trailsOn = !!on;
      const b = root.querySelector('[data-trails="1"]');
      if (b) b.classList.toggle("on", trailsOn);
      if (!trailsOn) clearFleetTrails();
      syncTrails();
      setNote(
        trailsOn
          ? `track history on · nearest ${FLEET_TRAIL_MAX} contacts within ${FLEET_TRAIL_KM} km · fixes this session`
          : "track history off",
      );
      void emitPull({
        organ: "eye",
        capability: "trails",
        fromSurface: "asherin-eye",
        status: "ok",
        quote: trailsOn ? "track history on" : "track history off",
      });
    }

    function trackEntity(ent) {
      tracked = { id: ent.id, label: ent.name, meta: ent.asherin || {} };
      const C = window.Cesium;
      if (trail) viewer.entities.remove(trail);
      trail = viewer.entities.add({
        polyline: {
          positions: new C.CallbackProperty(() => {
            const hist = pathHist[ent.id] || [];
            const pts = hist.map((p) => C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt));
            if (ent.position) {
              const p = ent.position.getValue(viewer.clock.currentTime);
              if (p) pts.push(p);
            }
            return pts;
          }, false),
          width: 2.6,
          material: C.Color.fromCssColorString("#fbbf24").withAlpha(0.85),
          depthFailMaterial: C.Color.fromCssColorString("#fbbf24").withAlpha(0.4),
          arcType: C.ArcType.GEODESIC,
        },
      });
      applyCamMode(camMode);
      refreshHangar();
      const icao = String(ent.id || "").split(":")[1] || "";
      if (/^[a-fA-F0-9]{4,8}$/.test(icao)) {
        eyeFeed("hex", { icao })
          .then((j) => {
            const extra = j.rows || [];
            const hist = pathHist[ent.id] || (pathHist[ent.id] = []);
            extra.forEach((row) => {
              if (row.lat == null || row.lon == null) return;
              hist.unshift({ lat: Number(row.lat), lon: Number(row.lon), alt: Number(row.alt || 0), t: 0 });
            });
            if (hist.length > 240) hist.splice(0, hist.length - 240);
          })
          .catch(() => {});
      }
      setHud();
    }

    function applyCamMode(mode) {
      camMode = CAM_MODES.includes(mode) ? mode : "chase";
      const C = window.Cesium;
      const ent =
        viewer?.trackedEntity ||
        (tracked &&
          (() => {
            for (let i = 0; i < viewer.dataSources.length; i++) {
              const e = viewer.dataSources.get(i).entities.getById(tracked.id);
              if (e) return e;
            }
            return null;
          })());
      if (!ent) {
        setNote("click a contact first");
        return;
      }
      if (camMode === "orbit") {
        viewer.trackedEntity = undefined;
        setNote("orbit · camera walks around the contact");
      } else if (camMode === "nadir") {
        ent.viewFrom = new C.Cartesian3(0, 0, 420);
        viewer.trackedEntity = undefined;
        viewer.trackedEntity = ent;
        setNote("nadir · looking down on the contact");
      } else {
        ent.viewFrom = new C.Cartesian3(-140, -50, 32);
        viewer.trackedEntity = undefined;
        viewer.trackedEntity = ent;
        setNote("chase · camera rides behind the contact");
      }
      setHud();
    }

    async function playTour() {
      if (!viewer) return;
      camMode = "chase";
      viewer.trackedEntity = undefined;
      setNote("tour · zip scene-director class · public camera path");
      const C = window.Cesium;
      for (const shot of TOUR_SHOTS) {
        if (dead) return;
        await new Promise((resolve) => {
          viewer.camera.flyTo({
            destination: C.Cartesian3.fromDegrees(shot.lon, shot.lat, shot.alt),
            orientation: {
              heading: C.Math.toRadians(shot.heading || 0),
              pitch: C.Math.toRadians(shot.pitch || -45),
              roll: 0,
            },
            duration: shot.duration || 4,
            complete: resolve,
          });
        });
      }
      setNote("tour ended");
    }

    function releaseTrack() {
      tracked = null;
      modelOn = false;
      selected = null;
      renderInspector();
      const group = $("#track-group");
      if (group) group.hidden = true;
      viewer.trackedEntity = undefined;
      if (trail) {
        viewer.entities.remove(trail);
        trail = null;
      }
      setHud();
    }

    // one place that answers "which entity is the tracked one", because three
    // call sites had each written their own slightly different search.
    function findTracked() {
      if (!tracked || !viewer) return null;
      if (viewer.trackedEntity && viewer.trackedEntity.id === tracked.id) return viewer.trackedEntity;
      for (let i = 0; i < viewer.dataSources.length; i++) {
        const e = viewer.dataSources.get(i).entities.getById(tracked.id);
        if (e) return e;
      }
      return viewer.entities.getById(tracked.id) || null;
    }

    function refreshHangar() {
      if (!viewer) return;
      const C = window.Cesium;
      // range from the camera to the tracked airframe — not the camera's
      // height. chasing a contact at cruise puts the camera eleven kilometres
      // up while sitting a hundred metres off the tail; height said "far",
      // the eye said "right there", and the model lost that argument.
      let want = false;
      if (tracked) {
        const ent = findTracked();
        const p = ent?.position?.getValue?.(viewer.clock.currentTime);
        if (p) {
          const m = C.Cartesian3.distance(viewer.camera.positionWC, p);
          want = modelOn ? m < TRACKED_MODEL_EXIT_M : m < TRACKED_MODEL_ENTER_M;
        }
      }
      modelOn = want;
      const srcIds = ["flights", "military"];
      srcIds.forEach((id) => {
        const src = ds[id];
        if (!src) return;
        src.entities.values.forEach((e) => {
          const isTracked = tracked && e.id === tracked.id;
          const close = isTracked && modelOn;
          if (e.model) e.model.show = close;
          if (e.billboard) e.billboard.show = !close;
        });
      });
    }

    function refreshContacts() {
      const list = $("#contact-list");
      if (!list || $("#contacts").hidden) return;
      const cam = viewer.camera.positionWC;
      const hits = [];
      for (let i = 0; i < viewer.dataSources.length; i++) {
        const d = viewer.dataSources.get(i);
        d.entities.values.forEach((e) => {
          if (!e.position) return;
          const p = e.position.getValue(viewer.clock.currentTime);
          if (!p) return;
          const km = kmBetween(window.Cesium, cam, p);
          if (km <= 250) hits.push({ e, km });
        });
      }
      hits.sort((a, b) => a.km - b.km);
      list.innerHTML =
        hits
          .slice(0, 40)
          .map(
            (h) =>
              `<button type="button" class="hit" data-id="${escText(String(h.e.id))}"><b>${escText(String(h.e.name || h.e.id).slice(0, 42))}</b><span>${h.km.toFixed(1)} km</span></button>`,
          )
          .join("") ||
        `<p style="color:var(--mute);font-size:12px">nothing inside 250 km. enable layers or fly lower.</p>`;
      list.querySelectorAll(".hit").forEach((b) => {
        b.onclick = () => {
          for (let i = 0; i < viewer.dataSources.length; i++) {
            const e = viewer.dataSources.get(i).entities.getById(b.dataset.id);
            if (e) trackEntity(e);
          }
        };
      });
    }

    function drawDetect(on) {
      const cv = $("#trackbox");
      if (!cv || !viewer) return;
      const box = root.querySelector(".eye-root") || root;
      cv.width = box.clientWidth;
      cv.height = box.clientHeight;
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!on || !tracked || !viewer.trackedEntity) return;
      const p = viewer.trackedEntity.position?.getValue(viewer.clock.currentTime);
      if (!p) return;
      const win = toWindowXY(p);
      if (!win) return;
      ctx.strokeStyle = "hsla(38,92%,50%,0.85)";
      ctx.lineWidth = 1.2;
      const s = 28;
      ctx.strokeRect(win.x - s, win.y - s, s * 2, s * 2);
      ctx.font = "11px Inter";
      ctx.fillStyle = "hsla(38,92%,70%,0.9)";
      ctx.fillText(tracked.label || "contact", win.x - s, win.y - s - 6);
    }

    function escText(s) {
      return String(s).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      );
    }

    function paintChat() {
      const log = $("#chat-log");
      if (!log) return;
      // escaped: model replies and place names are untrusted strings, never markup.
      log.innerHTML = chatLog
        .slice(-24)
        .map((m) => `<div class="${m.role === "user" ? "me" : "bot"}">${escText(String(m.text).slice(0, 1400))}</div>`)
        .join("");
      log.scrollTop = log.scrollHeight;
    }

    // ── natural language → geospatial intent resolution ─────────────────────
    // The sentence goes out with the camera position; a plan of tool calls
    // comes back already executed into rows. Nothing here trusts the model for
    // a coordinate — every pin drawn was returned by a public source, and every
    // step that refused is spoken as a refusal instead of being swallowed.
    async function resolveIntent(q) {
      const cam = viewer?.camera?.positionCartographic;
      const camera = cam
        ? {
            lat: window.Cesium.Math.toDegrees(cam.latitude),
            lon: window.Cesium.Math.toDegrees(cam.longitude),
          }
        : { lat: 0, lon: 0 };
      setNote("reading the intent · picking sources…");
      let j;
      try {
        j = await eyeBrain(q, camera);
      } catch (e) {
        chatLog.push({ role: "eye", text: `intent resolver: ${String(e.message || e).toLowerCase()}` });
        paintChat();
        setNote("");
        return true;
      }
      const rows = Array.isArray(j.rows) ? j.rows.filter((r) => r.lat != null && r.lon != null) : [];
      const steps = Array.isArray(j.steps) ? j.steps : [];
      const unresolved = Array.isArray(j.unresolved) ? j.unresolved : [];
      // nothing planned and nothing refused means the resolver had no read on
      // the sentence at all — hand it back to the place engine rather than
      // answering with an empty globe.
      if (!steps.length && !unresolved.length) {
        setNote("");
        return false;
      }

      if (rows.length) {
        plotRows("brain", rows, `${rows.length} resolved on the globe`);
        // the camera frames the spread, not the first pin: a nationwide answer
        // that flies to one mosque has hidden its own result.
        const focus = j.focus || { lat: rows[0].lat, lon: rows[0].lon };
        let spreadKm = 0;
        rows.forEach((r) => {
          spreadKm = Math.max(spreadKm, kmBetween(focus.lat, focus.lon, r.lat, r.lon));
        });
        flyTo(focus.lat, focus.lon, Math.max(6000, Math.min(4.5e6, spreadKm * 3400 + 12000)));
      } else {
        clearDs("brain");
        if (j.focus) flyTo(j.focus.lat, j.focus.lon, 120000);
      }

      const lines = [];
      if (j.say) lines.push(String(j.say));
      else if (j.summary) lines.push(String(j.summary));
      steps.forEach((s) => {
        lines.push(
          s.ok
            ? `· ${s.label} — ${s.count} · ${s.detail}`
            : `· ${s.label} — refused · ${s.detail}`,
        );
      });
      if (rows.length) lines.push(`${rows.length} point${rows.length === 1 ? "" : "s"} on the globe.`);
      unresolved.forEach((u) => lines.push(`· cannot: ${u}`));
      if ((j.sources || []).length) lines.push(`source: ${(j.sources || []).join(" · ")}`);
      chatLog.push({ role: "eye", text: lines.join("\n").toLowerCase().slice(0, 1400) });
      paintChat();
      setNote(rows.length ? `${rows.length} resolved · ${(j.sources || []).join(" · ")}` : "nothing public matched that");
      void emitPull({
        organ: "eye",
        capability: "intent-resolve",
        fromSurface: "asherin-eye",
        status: rows.length ? "ok" : "skip",
        quote: q.slice(0, 80),
      });
      return true;
    }

    async function handleChat(raw) {
      const q0 = String(raw || "").trim();
      if (!q0) return;
      chatLog.push({ role: "user", text: q0 });
      paintChat();
      const url = q0.match(/https?:\/\/[^\s]+/i);
      let q = q0;
      let wantProperty = cmdMode === "property";
      if (/^(route|path) to /i.test(q0)) {
        try {
          const dest = q0.replace(/^(route|path) to /i, "").trim();
          const cam = viewer?.camera?.positionCartographic;
          if (!cam) throw new Error("globe camera not ready");
          const aLat = window.Cesium.Math.toDegrees(cam.latitude);
          const aLon = window.Cesium.Math.toDegrees(cam.longitude);
          const places = await eyeFeed("places", { q: dest });
          const b = (places.rows || [])[0];
          if (!b?.lat) throw new Error("no public place to route to");
          const j = await loadRoutePath(aLat, aLon, b.lat, b.lon);
          flyTo(b.lat, b.lon, 48000);
          chatLog.push({ role: "eye", text: String(j.note || j.rows?.[0]?.note || "public drive path").toLowerCase() });
          paintChat();
          setNote("");
        } catch (e) {
          chatLog.push({ role: "eye", text: String(e.message || e).toLowerCase() });
          paintChat();
          setNote(String(e.message || e));
        }
        return;
      }
      if (/^(property|parcel|cadastre)\b/i.test(q)) {
        wantProperty = true;
        q = q.replace(/^(property|parcel|cadastre)\s+/i, "").trim() || q;
        setCmdMode("property");
      } else if (/^(go to|fly to|take me to)\s+/i.test(q)) {
        wantProperty = false;
        q = q.replace(/^(go to|fly to|take me to)\s+/i, "").trim();
        setCmdMode("place");
      }
      // the resolver owns any sentence that describes a thing to find rather
      // than a place to sit over. a url and the property command keep their
      // dedicated paths — both are already exact.
      if (!wantProperty && !url && looksLikeIntent(q)) {
        const handled = await resolveIntent(q);
        if (handled) return;
        // an unresolvable sentence still deserves the old place attempt rather
        // than a dead end.
      }
      setNote(wantProperty ? "property command · public dossier…" : "engine looking for places…");
      try {
        if (url) {
          const j = await eyeFeed("webmeta", { url: url[0] });
          const rows = j.rows || [];
          if (rows[0]?.lat) {
            pinEngine(rows, true);
            chatLog.push({
              role: "eye",
              text: `pinned public metadata for that url. ${rows[0].label || ""}`.toLowerCase(),
            });
          } else {
            chatLog.push({
              role: "eye",
              text: `public metadata read. no geo tag on the page. ${j.note || ""}`.toLowerCase(),
            });
          }
          paintChat();
          setNote("");
          return;
        }
        const feed = wantProperty ? "property" : "places";
        const j = await eyeFeed(feed, { q });
        const rows = j.rows || [];
        pinEngine(rows, true);
        void emitPull({
          organ: "eye",
          capability: wantProperty ? "property" : "engine-pin",
          fromSurface: "asherin-eye",
          status: rows.length ? "ok" : "skip",
          quote: q.slice(0, 80),
        });
        if (wantProperty && rows[0]?.lat != null) {
          const intel = j.dossier || rows[0].intel || {};
          const layers = await focusPropertyLayers(rows[0].lat, rows[0].lon);
          chatLog.push({ role: "eye", text: formatDossier(intel, layers, j.note).toLowerCase() });
          if (keyBound()) {
            const talk = await eyeTalk([
              {
                role: "system",
                content:
                  "you sit in asherin.eye. reply in lowercase. never dump a serp. property research is public-index only. do not invent owners, occupants, or crimes.",
              },
              {
                role: "user",
                content: `property dossier already pulled:\n${JSON.stringify(intel).slice(0, 800)}\noperator said: ${q}`,
              },
            ]);
            const text = talk.reply || talk.text || talk.message || "";
            if (text && !talk.error) chatLog.push({ role: "eye", text: String(text).slice(0, 500).toLowerCase() });
          }
        } else {
          let mouth = rows.length
            ? `pinned ${rows.length} place${rows.length === 1 ? "" : "s"} on the globe. asherin.engine finds locations; it does not dump search results here.`
            : "no public place matched. this is unsure.";
          if (keyBound()) {
            const talk = await eyeTalk([
              {
                role: "system",
                content:
                  "you sit in asherin.eye. reply in lowercase. never dump a search engine results page. if the user wants a place, name it and coords.",
              },
              { role: "user", content: q },
            ]);
            const text = talk.reply || talk.text || talk.message || talk.error || "";
            if (text && !talk.error) mouth = String(text).slice(0, 500);
            extractPlaces(String(text)).forEach((p) => pinEngine([{ ...p, id: "talk" }], false));
          } else {
            mouth += " connect a model key in connect if you want the mouth. places still pin without it.";
          }
          chatLog.push({ role: "eye", text: mouth.toLowerCase() });
        }
        paintChat();
        setNote("");
      } catch (e) {
        chatLog.push({ role: "eye", text: String(e.message || e).toLowerCase() });
        paintChat();
        setNote(String(e.message || e));
      }
    }

    async function boot() {
      window.CESIUM_BASE_URL = CESIUM_BASE;
      loadCss(CESIUM_BASE + "Widgets/widgets.css");
      await loadScript(CESIUM_BASE + "Cesium.js");
      await loadScript(SAT_JS);
      if (dead) return;
      const CesiumG = window.Cesium;
      window.Cesium = CesiumG;
      const keys = discoverMapsKey();
      if (keys.ion) CesiumG.Ion.defaultAccessToken = keys.ion;
      if (keys.google) CesiumG.GoogleMaps.defaultApiKey = keys.google;

      // cesium insists on a credit container; give it an off-screen sink so no
      // watermark is stamped over the globe. attribution is listed in the
      // layers sheet instead, which keeps the imagery licences honoured.
      const credit = document.createElement("div");
      credit.id = "cesium-credit-host";
      credit.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);opacity:0;";
      root.appendChild(credit);

      viewer = new CesiumG.Viewer("eye-stage", {
        timeline: false,
        animation: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        vrButton: false,
        selectionIndicator: false,
        infoBox: false,
        creditContainer: credit,
        terrain: undefined,
        // alpha buffer so the operator's own dashboard surface is the sky
        contextOptions: { webgl: { alpha: true, preserveDrawingBuffer: false } },
      });
      // no painted starfield: the room behind shows through instead.
      viewer.scene.backgroundColor = CesiumG.Color.TRANSPARENT;
      viewer.scene.skyBox.show = false;
      viewer.scene.sun.show = false;
      viewer.scene.moon.show = false;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      if (keys.ion) {
        try {
          viewer.terrainProvider = await CesiumG.createWorldTerrainAsync();
          status.photoreal = (status.photoreal || "") + " · world terrain bound";
        } catch {}
      }
      viewer.clock.shouldAnimate = true;
      try {
        paneWatch = new ResizeObserver(fitGlobe);
        paneWatch.observe(root.querySelector(".eye-root") || root);
        paneWatch.observe($("#eye-stage"));
      } catch {
        paneWatch = null;
      }
      window.visualViewport?.addEventListener("resize", fitGlobe);
      window.addEventListener("orientationchange", fitGlobe);
      fitGlobe();
      viewer.scene.preUpdate.addEventListener(() => {
        if (camMode !== "orbit" || !tracked) return;
        let ent = viewer.trackedEntity;
        if (!ent) {
          for (let i = 0; i < viewer.dataSources.length; i++) {
            const e = viewer.dataSources.get(i).entities.getById(tracked.id);
            if (e) {
              ent = e;
              break;
            }
          }
        }
        if (!ent?.position) return;
        const p = ent.position.getValue(viewer.clock.currentTime);
        if (!p) return;
        orbitHeading += 0.0035;
        viewer.camera.lookAt(p, new CesiumG.HeadingPitchRange(orbitHeading, CesiumG.Math.toRadians(-28), 560));
      });

      try {
        if (keys.google) {
          const tiles = await CesiumG.createGooglePhotorealistic3DTileset();
          viewer.scene.primitives.add(tiles);
          status.photoreal = "google photorealistic 3d tiles · streaming";
          status.map = "photoreal";
        } else {
          applyGlobe("sat");
          status.photoreal =
            "unavailable · needs a maps key bound in connect · showing flat satellite imagery, local geometry stays browser-extruded openstreetmap";
        }
      } catch (e) {
        applyGlobe("osm");
        status.photoreal = "photoreal tiles failed · fell back to the osm globe";
      }

      const layerHost = $("#layer-btns");
      // grouped, not a wall of chips: a layer is easier to find when it sits
      // under the question it answers.
      const groupGrid = {};
      LAYER_GROUPS.forEach((g) => {
        const block = document.createElement("div");
        block.className = "lgroup";
        const h = document.createElement("div");
        h.className = "lgroup-h";
        h.textContent = g.label;
        const grid = document.createElement("div");
        grid.className = "lgrid";
        block.appendChild(h);
        block.appendChild(grid);
        layerHost.appendChild(block);
        groupGrid[g.id] = grid;
      });
      const gridFor = (id) => groupGrid[LAYER_GROUPS.find((g) => g.ids.includes(id))?.id] || groupGrid.analysis;
      LAYER_ROWS.forEach((row) => {
        const b = document.createElement("button");
        b.type = "button";
        // a layer that needs a bound key is dimmed and says so, rather than
        // pretending to arm and then throwing at the operator.
        b.className = "tog" + (row.keyed ? " keyed" : "");
        b.dataset.layer = row.id;
        b.textContent = row.keyed ? `${row.label} · needs key` : row.label;
        b.title = row.honesty;
        // every layer carries its own provenance + freshness line, so a stale
        // or failed feed is visibly different from a live one at the toggle.
        const state = document.createElement("span");
        state.className = "lstate";
        b.appendChild(state);
        b.onclick = () => {
          if (row.keyed) {
            setNote(row.honesty);
            return;
          }
          void enableLayer(row.id, !layerOn[row.id]);
        };
        gridFor(row.id).appendChild(b);
      });
      paintAllLayerStates();
      {
        // track history is a rendering choice over the flight layers, not a
        // feed of its own — so it sits with the layers but carries no data id.
        const t = document.createElement("button");
        t.type = "button";
        t.className = "tog";
        t.dataset.trails = "1";
        t.textContent = "track history";
        t.title = "draws the path each aircraft has flown while you watched · nearest contacts only";
        t.onclick = () => setTrails(!trailsOn);
        groupGrid.analysis.appendChild(t);
      }
      const globeHost = $("#globe-btns");
      GLOBES.forEach((g) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tog" + (g === "sat" ? " on" : "");
        b.dataset.globe = g;
        b.textContent = g === "sat" ? "satellite" : g;
        b.onclick = () => applyGlobe(g);
        globeHost.appendChild(b);
      });
      const styleHost = $("#style-btns");
      STYLES.forEach((s, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tog" + (s === "normal" ? " on" : "");
        b.dataset.style = s;
        const cap = capabilityFor(`style:${s}`);
        b.textContent = `${i + 1} ${cap?.label || s}`;
        // every style is a render, and its tooltip says exactly that.
        b.title = cap?.limitation || "render only";
        b.onclick = () => applyStyle(s);
        styleHost.appendChild(b);
      });

      const handler = new CesiumG.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click) => {
        const picked = viewer.scene.pick(click.position);
        const ent = picked?.id;
        if (ent?.asherin?.kind === "lands") {
          highlightCountry(ent);
          selectEntity(ent);
          return;
        }
        if (ent?.asherin?.kind === "cameras") {
          const meta = ent.asherin;
          const key = String(ent.id).slice("cameras:".length);
          if (!camRows.some((c) => c.id === key) && meta.image) {
            camRows = [{ ...meta, id: key }, ...camRows];
          }
          setCamWall(true, key);
          hoverEnt = ent;
          selectEntity(ent);
          pinHoverCard();
          return;
        }
        if (ent && ent.asherin) {
          hoverEnt = ent;
          selectEntity(ent);
          trackEntity(ent);
          pinHoverCard();
        } else releaseTrack();
      }, CesiumG.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((mv) => {
        const picked = viewer.scene.pick(mv.endPosition);
        const ent = picked?.id;
        if (ent?.asherin) {
          hoverEnt = ent;
          setHoverCard(ent, mv.endPosition);
        } else if (!tracked) {
          hoverEnt = null;
          setHoverCard(null);
        }
      }, CesiumG.ScreenSpaceEventType.MOUSE_MOVE);

      function onKey(e) {
        // the dock is a text surface now — never steal digits from the composer.
        const t = e.target;
        const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
        if (typing) {
          if (e.key === "Escape") t.blur();
          return;
        }
        if (e.key === "Escape") releaseTrack();
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const n = Number(e.key);
        if (n >= 1 && n <= STYLES.length) applyStyle(STYLES[n - 1]);
      }
      keyHandler = onKey;
      document.addEventListener("keydown", keyHandler);

      $("#btn-cockpit").onclick = () => {
        if (!tracked) {
          setNote("click a contact first");
          return;
        }
        camMode = "chase";
        const ent = viewer.trackedEntity;
        if (ent) {
          ent.viewFrom = new CesiumG.Cartesian3(-80, -20, 18);
          viewer.trackedEntity = undefined;
          viewer.trackedEntity = ent;
        }
        setNote("cockpit · camera rides with the airframe. esc releases in place.");
      };
      $("#btn-chase").onclick = () => applyCamMode("chase");
      $("#btn-orbit").onclick = () => applyCamMode("orbit");
      $("#btn-nadir").onclick = () => applyCamMode("nadir");
      $("#btn-tour").onclick = () => playTour();
      const setSheetOpen = (on) => {
        $("#sheet")?.classList.toggle("open", on);
        $("#btn-layers")?.classList.toggle("on", on);
      };
      $("#btn-layers").onclick = () => {
        const on = !$("#sheet").classList.contains("open");
        setSheetOpen(on);
        if (on) $("#contacts").hidden = true;
      };
      $("#sheet-close").onclick = () => setSheetOpen(false);
      $("#camwall-close").onclick = () => setCamWall(false);
      $("#btn-camwall").onclick = async () => {
        if (camWallOpen()) {
          setCamWall(false);
          return;
        }
        setCamWall(true);
        if (!camRows.length) {
          setNote("pulling open agency camera catalogues in view…");
          try {
            await runLayerLoad("cameras");
            root.querySelectorAll("#layer-btns .tog").forEach((b) => {
              if (b.dataset.layer === "cameras") b.classList.add("on");
            });
            layerOn.cameras = true;
          } catch (e) {
            setNote(String(e?.message || e));
            renderCamWall();
          }
        }
      };
      cleanups.push(() => {
        if (camTimer) window.clearInterval(camTimer);
        camTimer = null;
      });
      $("#btn-contacts").onclick = () => {
        const el = $("#contacts");
        el.hidden = !el.hidden;
        if (!el.hidden) {
          setSheetOpen(false);
          setCamWall(false);
        }
        refreshContacts();
      };
      let detectOn = false;
      // this reticle follows the contact the operator selected. it is not an
      // object detector, and the label no longer implies one.
      $("#btn-trackbox").onclick = () => {
        detectOn = !detectOn;
        $("#btn-trackbox").classList.toggle("on", detectOn);
        setNote(
          detectOn
            ? "track box on · a reticle on the contact you selected · no object detection runs on this view"
            : "track box off",
        );
      };
      $("#insp-close").onclick = () => closeInspector();
      $("#btn-inspect").onclick = () => {
        const panel = $("#inspect");
        if (!selected) return;
        if (panel.classList.contains("open")) closeInspector();
        else renderInspector();
      };
      const toolsMenu = $("#tools-menu");
      $("#btn-tools").onclick = () => {
        const open = toolsMenu.hidden;
        toolsMenu.hidden = !open;
        $("#btn-tools").classList.toggle("on", open);
        $("#btn-tools").setAttribute("aria-expanded", String(open));
      };
      bindWhiteboard();
      $("#btn-draw").onclick = () => {
        drawOn = !drawOn;
        $("#btn-draw").classList.toggle("on", drawOn);
        viewer.canvas.style.cursor = drawOn ? "crosshair" : "";
        setNote(
          drawOn
            ? "draw on the ground · the stroke fits to a circle, box, corridor or polygon and then reports what live contacts stand inside it"
            : "",
        );
      };
      bindMeasure();
      $("#btn-measure").onclick = () => {
        const at = measureMode ? MEASURE_ORDER.indexOf(measureMode) + 1 : 0;
        measureMode = at >= MEASURE_ORDER.length ? null : MEASURE_ORDER[at];
        measurePts = [];
        clearMeasureLive();
        const btn = $("#btn-measure");
        btn.classList.toggle("on", !!measureMode);
        btn.textContent = measureMode ? `measure · ${measureMode}` : "measure";
        viewer.canvas.style.cursor = measureMode ? "crosshair" : drawOn ? "crosshair" : "";
        setNote(measureMode ? MEASURE_HINT[measureMode] : "measure off");
      };
      $("#btn-clear-board").onclick = () => {
        clearDs("board");
        measurePts = [];
        measureCount = 0;
        boardCount = 0;
        setNote("board cleared");
      };
      $("#btn-record").onclick = () => {
        recordOn = !recordOn;
        $("#btn-record").classList.toggle("on", recordOn);
        $("#btn-record").textContent = recordOn ? "recording · 0" : "record";
        setNote(
          recordOn
            ? "recording the contacts already on screen · your raw fixes stay yours, the shared grid keeps counts only · the avoidance layer needs about a week of this"
            : "recorder off",
        );
        if (recordOn) void recordTick();
      };
      $("#btn-share").onclick = async () => {
        writeShare();
        try {
          await navigator.clipboard.writeText(location.href);
          setNote("share link copied");
        } catch {
          setNote(location.href);
        }
      };
      $("#btn-exif").onclick = () => $("#exif-file")?.click();
      $("#exif-file").onchange = (e) => {
        const f = e.target.files?.[0];
        if (f) pinOwnedPhoto(f).catch((err) => setNote(String(err.message || err)));
        e.target.value = "";
      };
      $("#btn-reset").onclick = () => {
        releaseTrack();
        viewer.camera.flyTo({ destination: CesiumG.Cartesian3.fromDegrees(-40, 20, 1.8e7), duration: 2 });
      };
      $("#btn-voice").onclick = startVoice;

      $("#cmd-place").onclick = () => setCmdMode("place");
      $("#cmd-property").onclick = () => setCmdMode("property");
      const send = () => {
        const el = $("#chat-in");
        const v = el.value;
        el.value = "";
        handleChat(v);
      };
      $("#chat-go").onclick = send;
      $("#chat-in").onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      };
      chatLog.push({
        role: "eye",
        text: "asherin.eye is listening. name a place, ask about what is overhead, or say \u201croute to <place>\u201d. the rail below opens layers, camera and contacts.",
      });
      paintChat();

      const grid = $("#mission-grid");
      MISSIONS.forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = m.title;
        b.style.cssText = "";
        b.onclick = async () => {
          flyTo(m.fly.lat, m.fly.lon, m.fly.alt);
          for (const id of m.layers) await enableLayer(id, true);
        };
        grid.appendChild(b);
      });

      const share = readShare();
      if (share.lat && share.lon) {
        const alt = Number(share.alt) || 8e5;
        flyTo(Number(share.lat), Number(share.lon), alt);
        if (share.style) applyStyle(STYLES[Number(share.style) - 1 || 0] || "normal");
        if (share.map && GLOBES.includes(share.map)) applyGlobe(share.map);
        (share.layers || "")
          .split(",")
          .filter(Boolean)
          .forEach((id) => enableLayer(id, true));
      } else {
        viewer.camera.setView({ destination: CesiumG.Cartesian3.fromDegrees(-40, 20, 1.8e7) });
        void enableLayer("quakes", true);
      }

      pollers.push(
        setInterval(() => {
          if (document.hidden) return;
          setHud();
          refreshContacts();
          refreshHangar();
          drawDetect(detectOn);
          tickGlitch();
          pinHoverCard();
        }, 250),
      );
      pollers.push(setInterval(syncTrails, 1500));
      // the inspector is a slower surface than the render loop: one second is
      // enough for altitude and freshness to stay honest without re-laying out
      // the panel four times a second.
      pollers.push(
        setInterval(() => {
          if (document.hidden || !selected) return;
          renderInspector();
          paintAllLayerStates();
        }, 1000),
      );
      pollers.push(
        setInterval(() => {
          // a hidden tab burns quota and paints nothing; the chips carry the
          // gap when it comes back.
          if (document.hidden) return;
          if (layerOn.flights) runLayerLoad("flights", { quiet: true }).catch(() => {});
          if (layerOn.military) runLayerLoad("military", { quiet: true }).catch(() => {});
          
        }, 12000),
      );
      // the recorder is server-throttled to one write per 20 s per operator, so
      // the tab offers slightly slower than that and never busies the endpoint.
      pollers.push(setInterval(() => void recordTick(), 25000));
      // footprints follow the camera, but only once it has come to rest —
      // loading overpass on every frame of a fly-to would be a self-ddos.
      let settleTimer = null;
      const onSettle = () => {
        if (!layerOn.buildings) return;
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          loadBuildings(false).catch((e) => setNote(`buildings: ${e.message || e}`));
        }, 900);
      };
      viewer.camera.moveEnd.addEventListener(onSettle);
      cleanups.push(() => {
        if (settleTimer) clearTimeout(settleTimer);
        viewer.camera.moveEnd.removeEventListener(onSettle);
      });

      void emitPull({ organ: "eye", capability: "open", fromSurface: "asherin-eye", status: "ok" });
      setHud();
    }

    function startVoice() {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Rec) {
        setNote("voice unavailable in this browser");
        return;
      }
      const rec = new Rec();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.onresult = (ev) => {
        const t = (ev.results[0][0].transcript || "").toLowerCase();
        setNote("heard: " + t);
        LAYER_ROWS.forEach((row) => {
          if (t.includes(row.label) || t.includes(row.id)) enableLayer(row.id, true);
        });
        if (t.includes("reset")) $("#btn-reset").click();
        if (t.includes("cockpit")) $("#btn-cockpit").click();
        if (t.includes("dark")) applyGlobe("dark");
        if (t.includes("satellite") || t.includes("sat")) applyGlobe("sat");
        STYLES.forEach((s) => {
          if (t.includes(s)) applyStyle(s);
        });
        if (/property |parcel /.test(t)) {
          setCmdMode("property");
          handleChat(t.replace(/^(property|parcel)\s+/i, ""));
        } else if (/go to |fly to |take me/.test(t)) {
          setCmdMode("place");
          handleChat(t.replace(/^(go to|fly to|take me to)\s+/i, ""));
        }
      };
      rec.onerror = () => setNote("voice: unavailable");
      rec.start();
      status.voice = "listening";
    }

    boot().catch((e) => {
      const hud = $("#hud-line");
      if (hud) hud.textContent = "globe engine did not load";
      setNote("globe engine blocked. not a page bug in the hud — the page policy refused the cesium host.");
    });

    return () => {
      dead = true;
      pollers.forEach(clearInterval);
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      try {
        if (keyHandler) document.removeEventListener("keydown", keyHandler);
      } catch {}
      try {
        paneWatch?.disconnect();
      } catch {}
      try {
        window.visualViewport?.removeEventListener("resize", fitGlobe);
        window.removeEventListener("orientationchange", fitGlobe);
      } catch {}
      try {
        viewer?.destroy();
      } catch {}
      root.innerHTML = "";
    };
  }, []);

  return (
    <div ref={hostRef} className="asherin-eye-host relative h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden" />
  );
};

export default AsherinEyeView;
