// @ts-nocheck
// asherin.arvision — transferred from asherin organ HUD
// source: skills/aureon/arvision/operator-arvision.html + aureon-arvision-intel.py
// identity: localStorage this-box only. packet: download fallback. rf: web-bluetooth pick.
// never: Clearview, DMV owner, A2DP sniff, private NVR, thermal fake.

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";

const HUD_CSS = `
  .arv-root { position:absolute; inset:0; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; background:#000; color-scheme:dark; container-type:size; container-name:arv; }

  .arv-root {
    --bg: hsl(var(--background));
    --ink: hsl(var(--foreground));
    --mute: hsl(var(--muted-foreground));
    --line: hsl(var(--border));
    --accent: hsl(var(--accent));
    --accent-ink: hsl(var(--accent-foreground));
    --ok: hsl(var(--accent));
    --warn: hsl(var(--accent));
    --r: 1rem;
  }
  .arv-root, .arv-root * { box-sizing: border-box; }
  .arv-root * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  .arv-root *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  .arv-root {
    margin: 0; height: 100%; background: var(--bg); color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-weight: 300; letter-spacing: -.01em; color-scheme: dark; overflow: hidden;
  }
  #stage { position: absolute; inset: 0; background: #000; }
  #cam, #hud { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #cam.mirror { transform: scaleX(-1); }
  #hud { pointer-events: none; }
  .glass {
    background: hsl(var(--card) / .62);
    backdrop-filter: blur(24px) saturate(1.2);
    -webkit-backdrop-filter: blur(24px) saturate(1.2);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: 0 18px 50px -24px rgba(0,0,0,.9);
  }
  .misb {
    position: absolute; top: 16px; left: 16px; z-index: 8;
    padding: 12px 16px; pointer-events: auto; min-width: 0; max-width: min(280px, calc(100% - 80px));
    font: 300 12px/1.5 inherit; color: var(--ink);
  }
  .misb b { color: var(--accent); font-weight: 500; }
  .misb .m { color: var(--mute); font-size: 11px; }
  .compass {
    position: absolute; top: 16px; right: 16px; z-index: 8;
    width: clamp(48px, 12cqi, 56px); height: clamp(48px, 12cqi, 56px); border-radius: 14px; padding: 0; cursor: pointer;
    background: hsl(var(--card) / .62);
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    border: 1px solid var(--line);
  }
  .compass svg { width: 100%; height: 100%; }
  .compass svg text { fill: hsl(var(--accent)); }
  .compass svg polygon { fill: hsl(var(--foreground)); }
  .compass svg rect { fill: hsl(var(--accent)); }
  .compass svg circle { stroke: hsl(var(--border)); }
  .compass.dim { opacity: .45; }
  .layers { display: none !important; }
  .tog {
    border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; cursor: pointer;
    color: var(--mute); font: 400 12px/1 inherit; background: hsl(var(--card) / .55);
    backdrop-filter: blur(20px); transition: color .15s ease, background .15s ease, border-color .15s ease;
  }
  .tog:hover { color: var(--ink); border-color: hsl(var(--accent) / .4); }
  .tog.on { background: hsl(var(--accent)); color: var(--accent-ink); border-color: transparent; }
  .sheet {
    position: absolute; right: 16px; top: 116px; bottom: 110px; z-index: 8;
    width: min(280px, 32cqi, calc(100% - 24px)); padding: 16px; overflow: auto; pointer-events: auto;
  }
  .sheet .fold { display:flex; align-items:center; justify-content:space-between; width:100%; border:0; background:transparent; color: var(--mute); font: 400 13px/1.2 inherit; letter-spacing: .02em; text-transform: lowercase; cursor:pointer; padding:0 0 8px; text-align:left; }
  .sheet.folded { height: 48px; overflow: hidden; top: auto; }
  .sheet h2 { margin: 0 0 10px; font: 400 13px/1.2 inherit; letter-spacing: .02em; text-transform: lowercase; color: var(--mute); }
  .sheet .row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
  .sheet .k { color: var(--mute); }
  .sheet .v { text-align: right; }
  .sheet .list { margin-top: 10px; font-size: 12px; color: var(--mute); line-height: 1.5; }
  .talk {
    position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
    z-index: 9; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    padding: 10px 12px; width: min(980px, calc(100% - 16px)); max-width: calc(100% - 16px); justify-content: center;
  }
  .talk button {
    border: 1px solid transparent; border-radius: 999px; padding: 10px 16px; cursor: pointer;
    background: hsl(var(--accent)); color: var(--accent-ink); font: 500 13px/1 inherit;
    transition: opacity .15s ease;
  }
  .talk button:hover { opacity: .88; }
  .talk button.ghost { background: hsl(var(--muted) / .6); color: var(--ink); border-color: var(--line); }
  #gate {
    position: absolute; inset: 0; z-index: 20; display: grid; place-items: center;
    background: hsl(var(--background) / .78); backdrop-filter: blur(18px);
  }
  #gate[hidden] { display: none; }
  #gate .card { padding: 28px 32px; max-width: min(420px, calc(100% - 24px)); width: min(420px, calc(100% - 24px)); text-align: center; }
  #gate p { color: var(--mute); font-size: 14px; line-height: 1.6; }
  #gate button {
    border: 0; border-radius: 999px; padding: 12px 20px; cursor: pointer;
    background: hsl(var(--accent)); color: var(--accent-ink); font: 500 14px inherit;
  }
  #note {
    position: absolute; left: 16px; bottom: 110px; z-index: 8;
    padding: 10px 14px; font-size: 12px; color: var(--mute); max-width: min(320px, calc(100% - 24px));
    pointer-events: none;
  }
  #inbox {
    position: absolute; left: 16px; top: 116px; bottom: 110px; z-index: 10;
    width: min(280px, 34cqi, calc(100% - 24px)); padding: 14px; overflow: auto; pointer-events: auto;
  }
  #inbox[hidden] { display: none; }
  #inbox h2 { margin: 0 0 10px; font: 400 13px/1.2 inherit; letter-spacing: .02em; text-transform: lowercase; color: var(--mute); }
  #inbox .shot { width: 100%; border-radius: 10px; margin: 0 0 10px; border: 1px solid var(--line); display: block; }
  #inbox .meta { font-size: 11px; color: var(--mute); margin: -6px 0 12px; }
  /* tablet — keep the desktop frame, tighten every gutter and panel */
  @container arv (max-width: 1100px) {
    .misb { top: 12px; left: 12px; padding: 10px 12px; font-size: 11px; max-width: min(240px, calc(100% - 72px)); }
    .compass { top: 12px; right: 12px; }
    .layers {
      top: 12px; left: 268px; right: clamp(64px, 12cqi, 108px); transform: none;
      width: auto; max-width: none; gap: 6px;
      flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; -webkit-overflow-scrolling: touch;
    }
    .tog { flex: 0 0 auto; }
    .tog { padding: 7px 10px; font-size: 11px; }
    .sheet { right: 12px; top: 104px; bottom: 104px; width: min(248px, 34cqi); padding: 12px; }
    #inbox { left: 12px; top: 104px; bottom: 104px; width: min(248px, 34cqi); padding: 12px; }
    #note { left: 12px; bottom: 100px; max-width: min(260px, calc(100% - 20px)); }
    .talk { bottom: 14px; padding: 8px 10px; gap: 6px; }
    .talk button { padding: 9px 13px; font-size: 12px; }
  }

  /* phone — stack the chrome: reading panels, then layer strip, then talk bar */
  @container arv (max-width: 780px) {
    .misb {
      top: 8px; left: 8px; right: clamp(52px, 16cqi, 76px);
      width: auto; max-width: none; padding: 8px 10px; font: 300 11px/1.45 inherit;
    }
    .misb .m { font-size: 10px; }
    .compass { top: 8px; right: 8px; width: clamp(38px, 13cqi, 48px); height: clamp(38px, 13cqi, 48px); }

    .layers {
      top: auto; bottom: calc(62px + env(safe-area-inset-bottom, 0px));
      left: 8px; right: 8px; transform: none; width: auto; max-width: none;
      flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto;
      -webkit-overflow-scrolling: touch; padding-bottom: 2px; gap: 6px;
    }
    .tog { flex: 0 0 auto; padding: 7px 11px; font-size: 11px; }

    .sheet, #inbox {
      left: 8px; right: 8px; width: auto; max-width: none;
      top: auto; bottom: calc(108px + env(safe-area-inset-bottom, 0px));
      max-height: min(38cqh, 300px); padding: 12px; overflow: auto;
    }
    .sheet .row { font-size: 11px; padding: 5px 0; }

    #note {
      left: 8px; right: 8px; max-width: none;
      bottom: calc(108px + env(safe-area-inset-bottom, 0px)); padding: 8px 10px; font-size: 11px;
    }

    .talk {
      left: 8px; right: 8px; bottom: calc(10px + env(safe-area-inset-bottom, 0px));
      transform: none; width: auto; max-width: none;
      flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto;
      -webkit-overflow-scrolling: touch; padding: 8px; gap: 6px;
    }
    .talk button { flex: 0 0 auto; padding: 9px 13px; font-size: 12px; }
    #gate .card { padding: 20px 18px; }
    #gate p { font-size: 13px; }
  }

  /* short / landscape phone — nothing may eat the frame */
  @container arv (max-height: 560px) {
    .compass { width: 40px; height: 40px; }
    .sheet, #inbox { max-height: 46cqh; padding: 10px; }
    .talk { padding: 6px 8px; gap: 6px; }
    .talk button { padding: 8px 12px; }
  }

  /* spectral filter — the second view of the same frame.
     the primary view fills the stage. the other one lives in the rounded box in
     the bottom left corner and can be tapped to take the stage. both carry the
     same overlay, so nothing is lost in the swap. */
  .arv-root { --pipW: clamp(112px, 21cqi, 188px); }
  #spec { position: absolute; inset: 0; width: 100%; height: 100%; }
  #spec[hidden] { display: none; }
  #pip {
    position: absolute; left: 16px; bottom: 108px; z-index: 9;
    width: var(--pipW); padding: 0; overflow: hidden; cursor: pointer;
    border-radius: 18px; border: 1px solid var(--line);
    background: hsl(var(--card) / .62);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 18px 50px -24px rgba(0,0,0,.9);
    display: block; text-align: left;
  }
  #pip:hover { border-color: hsl(var(--accent) / .45); }
  #pip[hidden] { display: none; }
  #pip .pipwrap { position: relative; width: 100%; background: #000; overflow: hidden; }
  #pip canvas { display: block; width: 100%; height: 100%; }
  #pip .piplab {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 6px 9px; font: 400 10px/1.2 inherit; letter-spacing: .04em;
    color: var(--mute); text-transform: lowercase;
  }
  #pip .piplab b { color: var(--ink); font-weight: 400; }
  #pip .piplab span { color: hsl(var(--accent)); }
  #specsw {
    position: absolute; left: 16px; bottom: 74px; z-index: 9;
    display: inline-flex; align-items: center; gap: 6px; padding: 3px;
    border-radius: 999px; border: 1px solid var(--line);
    background: hsl(var(--card) / .62);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  }
  #specsw button {
    border: 0; border-radius: 999px; padding: 5px 10px; cursor: pointer;
    background: transparent; color: var(--mute); font: 400 11px/1 inherit;
    text-transform: lowercase; transition: background .15s ease, color .15s ease;
  }
  #specsw button.on { background: hsl(var(--accent)); color: var(--accent-ink); }
  #note { bottom: calc(126px + var(--pipW) * 0.62); }

  @container arv (max-width: 780px) {
    #pip { left: 8px; bottom: calc(104px + env(safe-area-inset-bottom, 0px)); border-radius: 14px; }
    #specsw { left: 8px; bottom: calc(70px + env(safe-area-inset-bottom, 0px)); }
    #note { bottom: calc(120px + var(--pipW) * 0.62 + env(safe-area-inset-bottom, 0px)); }
  }
  @container arv (max-height: 560px) {
    .arv-root { --pipW: clamp(92px, 16cqi, 132px); }
  }

`;
const HUD_BODY =
  '<div id="stage">\n  <video id="cam" playsinline autoplay muted></video>\n  <canvas id="spec" hidden></canvas>\n  <canvas id="hud"></canvas>\n</div>\n<div class="glass misb" id="misb"></div>\n<button type="button" class="compass dim" id="compass" title="device compass">\n  <svg viewBox="0 0 88 88" aria-hidden="true">\n    <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>\n    <g id="rose" transform="rotate(0 44 44)">\n      <polygon points="44,10 48,44 44,40 40,44" fill="#fff"/>\n      <text x="44" y="22" text-anchor="middle" fill="#9ec9ff" font-size="9" font-family="inherit">N</text>\n    </g>\n    <rect x="42" y="6" width="4" height="10" rx="2" fill="#7ee0c6"/>\n  </svg>\n</button>\n<div class="layers" id="layers"></div>\n<div class="glass sheet" id="sheet"></div>\n<div class="glass inbox" id="inbox" hidden></div>\n<div class="glass talk" id="talk"></div>\n<button type="button" id="pip" title="tap to put this view on the full screen">\n  <div class="pipwrap"><canvas id="pipc"></canvas></div>\n  <div class="piplab"><b id="piplabel">spectral filter</b><span>swap</span></div>\n</button>\n<div id="specsw" role="group" aria-label="primary view">\n  <button type="button" id="swcolor">colorized</button>\n  <button type="button" id="swspec">spectral</button>\n  <button type="button" id="swtherm">thermal</button>\n</div>\n<div id="note"></div>\n<div id="gate">\n  <div class="glass card">\n    <p>allow the camera. you should see yourself with AR overlays.</p>\n    <button type="button" id="allow">open camera</button>\n  </div>\n</div>\n<canvas id="work" hidden></canvas>';


function bootArvision(wrap, root, emitPull) {
  let dead = false;
  const offs = [];
  const $ = (id) => wrap.querySelector("#" + id);
  const cam = $("cam");
  const hud = $("hud");
  const ctx = hud.getContext("2d");
  const work = $("work");
  const wctx = work.getContext("2d", { willReadFrequently: true });
  const layersEl = $("layers");
  const sheetEl = $("sheet");
  const talkEl = $("talk");
  const misbEl = $("misb");
  const noteEl = $("note");
  const rose = $("rose");
  const compassBtn = $("compass");
  const specEl = $("spec");
  const specCtx = specEl.getContext("2d");
  const pipEl = $("pip");
  const pipWrap = pipEl.querySelector(".pipwrap");
  const pipCanvas = $("pipc");
  const pipCtx = pipCanvas.getContext("2d");
  const pipLabel = $("piplabel");
  const swColor = $("swcolor");
  const swSpec = $("swspec");
  const swTherm = $("swtherm");

  // the spectral pass runs on a small copy of the frame and is blown back up.
  // reading pixels is the expensive part, so the analysis buffer stays small and
  // shrinks further if the frame rate starts paying for it.
  const specSrc = document.createElement("canvas");
  const specSrcCtx = specSrc.getContext("2d", { willReadFrequently: true });
  const specOut = document.createElement("canvas");
  const specOutCtx = specOut.getContext("2d");


  const layers = {
    reticle: true,
    grid: true,
    horizon: true,
    peaking: false,
    motion: true,
    mesh: false,
    objects: true,
    pose: false,
    rf: true,
    identity: true,
    classify: true,
  };

  const S = {
    stream: null,
    halted: false,
    devices: [],
    deviceId: null,
    facing: "user",
    mirror: true,
    torch: false,
    frozen: false,
    freezeBitmap: null,
    heading: null,
    headingSrc: "none",
    beta: null,
    gamma: null,
    lat: null,
    lon: null,
    acc: null,
    geoSrc: "none",
    fps: 0,
    frames: 0,
    fpsT: performance.now(),
    lastGray: null,
    motion: 0,
    luma: 0,
    contrast: 0,
    edges: 0,
    hist: new Array(8).fill(0),
    objects: [],
    faces: 0,
    poseOn: false,
    blend: "",
    barcodes: [],
    ocr: "",
    obstruction: [],
    models: { face: null, pose: null, obj: null, cls: null, status: "loading" },
    hfov: null,
    rec: null,
    recChunks: [],
    flipping: false,
    rf: { tracks: [], wifi: [], engine: "", n: 0 },
    rfPick: 0,
    identity: { enrolled: false, status: "unenrolled", label: null, cosine: null },
    enrollBank: [],
    classes: [],
    intel: null,
    lastIntel: 0,
    lastOcr: 0,
    lastLm: null,
    lastAhash: "",
    clsTick: 0,
    lastShot: 0,
    sensitivity: "high",
    inbox: [],
    inboxOpen: false,
    deviceLog: [],
    personTags: {},
    // which view owns the full screen. the other one sits in the corner box.
    primary: "color",
    specW: 384,
    specSeen: 0,
  };


  function layerChips() {
    layersEl.innerHTML = "";
    Object.keys(layers).forEach((k) => {
      const b = document.createElement("button");
      b.className = "tog" + (layers[k] ? " on" : "");
      b.textContent = k;
      b.onclick = () => {
        layers[k] = !layers[k];
        layerChips();
      };
      layersEl.appendChild(b);
    });
  }

  function talkBtns() {
    const spec = [
      ["flip cam", "ghost", flipCam],
      [
        "shot",
        "ghost",
        () => {
          shotInbox();
          S.inboxOpen = true;
          const box = $("inbox");
          if (box) {
            box.hidden = false;
            paintInbox();
          }
        },
      ],
      ["record", "ghost", toggleRec],
    ];
    talkEl.innerHTML = "";
    spec.forEach(([label, cls, fn]) => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = label;
      b.type = "button";
      b.onclick = fn;
      talkEl.appendChild(b);
    });
  }

  function selfieMirror() {
    return !!(S.mirror && S.facing === "user");
  }

  function applyMirror() {
    cam.classList.toggle("mirror", selfieMirror());
    hud.classList.remove("mirror");
  }

  // ── spectral filter ──────────────────────────────────────────────────────
  // the camera hands back three overlapping colour channels. two surfaces that
  // look alike to the eye rarely sit at the same ratio across those channels:
  // living tissue and vegetation push the long channel well above the short
  // ones, most painted synthetics and coated metal fall the other way, glass and
  // standing water lift the middle. the filter isolates that difference and
  // paints it, so the frame reads as a material map instead of a picture. it is
  // derived from the camera's own channels — it is not a calibrated infrared
  // sensor, and the room says that rather than implying a band it cannot see.
  function coverFit(vw, vh, dw, dh) {
    const scale = Math.max(dw / vw, dh / vh);
    const w = vw * scale;
    const h = vh * scale;
    return [(dw - w) / 2, (dh - h) / 2, w, h];
  }

  function drawFrameInto(c2d, source, dw, dh, mirror) {
    const [vw, vh] = videoSize(source);
    if (!vw || !vh) return;
    const fit = coverFit(vw, vh, dw, dh);
    c2d.save();
    if (mirror) {
      c2d.translate(dw, 0);
      c2d.scale(-1, 1);
    }
    try {
      c2d.drawImage(source, fit[0], fit[1], fit[2], fit[3]);
    } catch (_) {}
    c2d.restore();
  }

  // shared downsample + readback for the filtered views. returns null when the
  // frame is not drawable yet (camera still warming up) or the readback is
  // blocked — the callers treat that as "keep last frame", never as an error.
  function readFrame(src) {
    const [vw, vh] = videoSize(src);
    if (!vw || !vh) return null;
    const aw = Math.max(96, Math.round(S.specW));
    const ah = Math.max(72, Math.round((aw * vh) / vw));
    if (specSrc.width !== aw || specSrc.height !== ah) {
      specSrc.width = aw;
      specSrc.height = ah;
      specOut.width = aw;
      specOut.height = ah;
    }
    try {
      specSrcCtx.drawImage(src, 0, 0, aw, ah);
      return { img: specSrcCtx.getImageData(0, 0, aw, ah), aw, ah };
    } catch (_) {
      return null;
    }
  }

  // iron palette — the same ramp real thermal imagers use, so anyone who has
  // used one reads this frame correctly: black cold, through purple and red,
  // to white hot. precomputed once; the per-pixel pass is then a table lookup.
  const IRON = (() => {
    const stops = [
      [0, 0, 4],
      [62, 8, 96],
      [186, 26, 62],
      [255, 128, 0],
      [255, 226, 110],
      [255, 255, 250],
    ];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * (stops.length - 1);
      const s = Math.min(stops.length - 2, Math.floor(t));
      const f = t - s;
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[s][c] + (stops[s + 1][c] - stops[s][c]) * f;
    }
    return lut;
  })();

  function buildSpectral(src) {
    const fr = readFrame(src);
    if (!fr) return false;
    const { img, aw, ah } = fr;
    const d = img.data;
    const n = aw * ah;
    const lum = new Float32Array(n);
    const nd = new Float32Array(n);
    const wd = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p] / 255;
      const g = d[p + 1] / 255;
      const b = d[p + 2] / 255;
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const vis = (g + b) / 2;
      nd[i] = (r - vis) / (r + vis + 0.004);
      wd[i] = (g - r) / (g + r + 0.004);
    }
    const out = specOutCtx.createImageData(aw, ah);
    const o = out.data;
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const i = y * aw + x;
        const p = i * 4;
        // a material boundary is where the ratio flips, not where the light does
        const edge =
          x > 0 && x < aw - 1 && y > 0 && y < ah - 1
            ? Math.min(0.5, (Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + aw] - lum[i - aw])) * 0.85)
            : 0;
        const base = 0.15 + 0.68 * Math.pow(lum[i], 0.85);
        let cr = base;
        let cg = base;
        let cb = base;
        const warm = nd[i];
        const cool = -nd[i];
        const wet = wd[i];
        if (warm > 0.055) {
          const k = Math.min(1, (warm - 0.055) * 3.4);
          cr = base + k * (0.94 - base) * 0.85;
          cg = base + k * (0.64 - base) * 0.6;
          cb = base * (1 - 0.45 * k);
        } else if (cool > 0.045) {
          const k = Math.min(1, (cool - 0.045) * 3.8);
          cb = base + k * (0.95 - base) * 0.8;
          cg = base + k * (0.8 - base) * 0.55;
          cr = base * (1 - 0.4 * k);
        } else if (wet > 0.05 && lum[i] > 0.3) {
          const k = Math.min(1, (wet - 0.05) * 3.2);
          cb = base + k * (1 - base) * 0.55;
          cg = base + k * (0.92 - base) * 0.45;
          cr = base + k * (0.72 - base) * 0.25;
        }
        o[p] = Math.round(Math.min(1, cr + edge) * 255);
        o[p + 1] = Math.round(Math.min(1, cg + edge) * 255);
        o[p + 2] = Math.round(Math.min(1, cb + edge) * 255);
        o[p + 3] = 255;
      }
    }
    specOutCtx.putImageData(out, 0, 0);
    return true;
  }

  // thermal estimate — a phone or laptop camera sees visible light, not the
  // long-wave infrared a real thermal camera measures. so this maps frame
  // brightness (with a small lift for surfaces whose long channel runs hot,
  // the closest a visible sensor gets to a warmth cue) onto the iron palette
  // above. the frame then reads the way a thermal image does — bright bodies
  // against a cool ground, hot spots popping out of machinery — and is
  // labelled an estimate everywhere it appears: it cannot measure temperature,
  // cannot see through ordinary walls, and common glass is just as much a
  // barrier here as it is to a real long-wave thermal camera.
  function buildThermal(src) {
    const fr = readFrame(src);
    if (!fr) return false;
    const { img, aw, ah } = fr;
    const d = img.data;
    const n = aw * ah;
    const t = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p] / 255;
      const g = d[p + 1] / 255;
      const b = d[p + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const warm = Math.max(0, r - (g + b) / 2) * 0.22;
      t[i] = Math.min(1, Math.pow(lum, 0.8) + warm);
    }
    const out = specOutCtx.createImageData(aw, ah);
    const o = out.data;
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const i = y * aw + x;
        const p = i * 4;
        // thermal frames are soft; a faint edge lift keeps silhouettes legible
        // without turning the pass back into a photo
        const edge =
          x > 0 && x < aw - 1 && y > 0 && y < ah - 1
            ? Math.min(0.16, (Math.abs(t[i + 1] - t[i - 1]) + Math.abs(t[i + aw] - t[i - aw])) * 0.6)
            : 0;
        const v = Math.max(0, Math.min(255, Math.round((t[i] + edge) * 255)));
        o[p] = IRON[v * 3];
        o[p + 1] = IRON[v * 3 + 1];
        o[p + 2] = IRON[v * 3 + 2];
        o[p + 3] = 255;
      }
    }
    specOutCtx.putImageData(out, 0, 0);
    // the scale bar a real imager draws: hot at the top, cold at the bottom
    const barH = Math.round(ah * 0.62);
    const barW = Math.max(3, Math.round(aw * 0.014));
    const bx = aw - barW - 3;
    const by = Math.round((ah - barH) / 2);
    for (let yy = 0; yy < barH; yy++) {
      const v = Math.round(255 * (1 - yy / Math.max(1, barH - 1)));
      specOutCtx.fillStyle = "rgb(" + IRON[v * 3] + "," + IRON[v * 3 + 1] + "," + IRON[v * 3 + 2] + ")";
      specOutCtx.fillRect(bx, by + yy, barW, 1);
    }
    specOutCtx.strokeStyle = "rgba(255,255,255,.35)";
    specOutCtx.lineWidth = 1;
    specOutCtx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
    return true;
  }

  const MODE_NAMES = { color: "colorized", spectral: "spectral filter", thermal: "thermal estimate" };

  function paintSpectral(src, w, h) {
    const live = !!(src && (src.readyState >= 2 || src.width));
    const primary = MODE_NAMES[S.primary] ? S.primary : "color";
    // the corner box carries the colorized frame unless colorized is already
    // on the stage — then it shows the spectral filter. it stays a two-view
    // swap; the thermal estimate takes the stage from the switch, not the pip.
    const pipMode = primary === "color" ? "spectral" : "color";
    // adaptive cost — the pixel read is the expensive part of the pass
    if (S.fps && S.fps < 20 && S.specW > 256) S.specW = 256;
    else if (S.fps > 40 && S.specW < 384) S.specW = 384;
    const filterMode = primary !== "color" ? primary : pipMode;
    const ok =
      live && filterMode !== "color"
        ? filterMode === "thermal"
          ? buildThermal(src)
          : buildSpectral(src)
        : false;
    S.specSeen = ok ? S.specSeen + 1 : 0;
    const dpr = Math.min(devicePixelRatio || 1, 2);

    specEl.hidden = primary === "color";
    if (primary !== "color") {
      const sw = Math.max(1, Math.round(w * dpr));
      const sh = Math.max(1, Math.round(h * dpr));
      if (specEl.width !== sw || specEl.height !== sh) {
        specEl.width = sw;
        specEl.height = sh;
      }
      specEl.style.width = w + "px";
      specEl.style.height = h + "px";
      specCtx.setTransform(1, 0, 0, 1, 0, 0);
      specCtx.fillStyle = "#000";
      specCtx.fillRect(0, 0, sw, sh);
      if (ok) drawFrameInto(specCtx, specOut, sw, sh, selfieMirror());
    }

    // the corner box carries whichever view is not on the stage, at the stage's
    // own aspect, so the overlay lands on the same pixels in both places
    const pw = Math.max(1, pipWrap.clientWidth || 1);
    const ph = Math.max(1, Math.round(pw * (h / Math.max(1, w))));
    if (pipWrap.style.height !== ph + "px") pipWrap.style.height = ph + "px";
    const cw = Math.max(1, Math.round(pw * dpr));
    const ch = Math.max(1, Math.round(ph * dpr));
    if (pipCanvas.width !== cw || pipCanvas.height !== ch) {
      pipCanvas.width = cw;
      pipCanvas.height = ch;
    }
    pipCtx.setTransform(1, 0, 0, 1, 0, 0);
    pipCtx.fillStyle = "#000";
    pipCtx.fillRect(0, 0, cw, ch);
    if (pipMode === "color") {
      if (live) drawFrameInto(pipCtx, src, cw, ch, selfieMirror());
    } else if (ok) {
      drawFrameInto(pipCtx, specOut, cw, ch, selfieMirror());
    }
    try {
      pipCtx.drawImage(hud, 0, 0, cw, ch);
    } catch (_) {}

    pipLabel.textContent = MODE_NAMES[pipMode];
    swColor.classList.toggle("on", primary === "color");
    swSpec.classList.toggle("on", primary === "spectral");
    swTherm.classList.toggle("on", primary === "thermal");
    swColor.setAttribute("aria-pressed", String(primary === "color"));
    swSpec.setAttribute("aria-pressed", String(primary === "spectral"));
    swTherm.setAttribute("aria-pressed", String(primary === "thermal"));
  }

  function setPrimary(mode) {
    if (!MODE_NAMES[mode]) return;
    S.primary = mode;
  }

  pipEl.onclick = () => setPrimary(S.primary === "color" ? "spectral" : "color");
  swColor.onclick = () => setPrimary("color");
  swSpec.onclick = () => setPrimary("spectral");
  swTherm.onclick = () => setPrimary("thermal");



  function note(t) {
    noteEl.textContent = t || "";
  }

  async function listCams() {
    const all = await navigator.mediaDevices.enumerateDevices();
    S.devices = all.filter((d) => d.kind === "videoinput");
  }

  async function haltCam(why) {
    S.halted = true;
    try {
      if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    S.stream = null;
    try {
      cam.srcObject = null;
    } catch (_) {}
    note("asherin.arvision halted — this box, not the feed. " + String(why || ""));
    try {
      emitPull({
        organ: "arvision",
        capability: "camera-open",
        fromSurface: "asherin-arvision",
        status: "fail",
        quote: String(why || "halt").slice(0, 160),
      });
    } catch (_) {}
  }

  async function startCam(deviceId, isRetry, exactFacing) {
    if (S.halted && !isRetry) {
      note("camera halted — tap cam to retry once");
      return false;
    }
    S.halted = false;
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
    const ladders = [];
    if (exactFacing) {
      // mobile flip: the facing side is the requirement, not a hint
      ladders.push({ facingMode: { exact: S.facing }, width: { ideal: 1280 }, height: { ideal: 720 } });
      ladders.push({ facingMode: { exact: S.facing } });
    }
    if (deviceId) {
      ladders.push({ deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } });
      ladders.push({ deviceId: { ideal: deviceId } });
    }
    ladders.push({ facingMode: S.facing, width: { ideal: 1280 }, height: { ideal: 720 } });
    ladders.push({ facingMode: S.facing });
    if (!exactFacing) ladders.push(true);
    let lastErr = null;
    for (let i = 0; i < ladders.length; i++) {
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: ladders[i], audio: false });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const name = e && e.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          note("camera permission blocked on this box");
          await haltCam(name);
          return false;
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          if (exactFacing) continue;
          note("no camera on this box");
          await haltCam(name);
          return false;
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
          if (!isRetry) {
            await new Promise((r) => setTimeout(r, 300));
            return startCam(deviceId, true, exactFacing);
          }
          if (exactFacing) continue;
          note("camera in use on this box — CANNOT_RESOLVE");
          await haltCam(name);
          return false;
        }
      }
    }
    if (!S.stream) {
      // an exact-facing attempt failing is not a dead box; the caller falls back
      if (exactFacing) return false;
      await haltCam((lastErr && (lastErr.name || lastErr.message)) || "getUserMedia failed");
      return false;
    }
    cam.srcObject = S.stream;
    try {
      await cam.play();
    } catch (_) {}
    await listCams();
    const _track = S.stream.getVideoTracks()[0];
    S.deviceId = _track.getSettings().deviceId || deviceId;
    const s = _track.getSettings();
    if (s.facingMode) S.facing = s.facingMode;
    S.torch = false;
    // field of view is only real when the track reports a focal length. an
    // assumed 54 degrees looked like a measurement and was not one, so an
    // uncalibrated lens now reports nothing at all.
    if (s.width && s.focalLength) {
      S.hfov = (2 * Math.atan(s.width / 2 / s.focalLength) * 180) / Math.PI;
      S.hfovSource = "reported focal length";
    } else {
      S.hfov = null;
      S.hfovSource = "not reported by this camera";
    }

    applyMirror();
    $("gate").hidden = true;
    note("");
    try {
      enableHeading();
    } catch (_) {}
    try {
      emitPull({
        organ: "arvision",
        capability: "camera-open",
        fromSurface: "asherin-arvision",
        status: "ok",
        quote: S.facing,
      });
    } catch (_) {}
    return true;
  }

  async function flipCam() {
    if (S.flipping) return;
    S.flipping = true;
    const prevFacing = S.facing;
    const prevMirror = S.mirror;
    const prevDevice = S.deviceId;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
    try {
      await listCams();
      const ids = S.devices.map((d) => d.deviceId).filter(Boolean);
      const next = S.facing === "user" ? "environment" : "user";
      S.facing = next;
      S.mirror = next === "user";
      S.halted = false;

      if (isMobile) {
        // phones commonly hide or recycle device ids; request the opposite side directly
        if (await startCam(null, false, true)) {
          applyMirror();
          return;
        }
      }
      if (ids.length >= 2) {
        // fall back to the enumerated device when the browser rejects facingMode
        const i = Math.max(0, ids.indexOf(prevDevice));
        const nid = ids[(i + 1) % ids.length];
        if (await startCam(nid, false, false)) {
          S.mirror = S.facing === "user";
          applyMirror();
          return;
        }
      }

      // restore the previous camera if the requested side is unavailable
      S.facing = prevFacing;
      S.mirror = prevMirror;
      S.halted = false;
      note(ids.length < 2 ? "only one camera on this box" : "camera flip refused on this box");
      await startCam(prevDevice || null, false, false);
      applyMirror();
    } finally {
      S.flipping = false;
    }
  }

  async function toggleTorch() {
    const track = S.stream && S.stream.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities && track.getCapabilities();
    if (!caps || !caps.torch) {
      note("torch not on this camera");
      return;
    }
    S.torch = !S.torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: S.torch }] });
    } catch {
      note("torch refused");
      S.torch = false;
    }
  }

  function freeze() {
    S.frozen = !S.frozen;
    if (S.frozen) {
      const c = document.createElement("canvas");
      c.width = cam.videoWidth || 1280;
      c.height = cam.videoHeight || 720;
      c.getContext("2d").drawImage(cam, 0, 0);
      S.freezeBitmap = c;
      scanBarcodes(c);
      note("frozen — packet / reverse / ocr");
      shotInbox();
      runOcr().then(() => runIntel());
    } else {
      S.freezeBitmap = null;
      S.ocr = "";
      note("");
    }
  }

  function stillCanvas() {
    if (S.frozen && S.freezeBitmap) return S.freezeBitmap;
    const c = document.createElement("canvas");
    c.width = cam.videoWidth || 1280;
    c.height = cam.videoHeight || 720;
    c.getContext("2d").drawImage(cam, 0, 0);
    return c;
  }

  function reverseSearch() {
    const c = stillCanvas();
    c.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "arvision-still.png";
      a.click();
      window.open("https://yandex.com/images/", "_blank", "noopener");
      window.open("https://www.google.com/search?tbm=isch&q=upload", "_blank", "noopener");
      window.open("https://tineye.com/", "_blank", "noopener");
      note("still saved — drop it into the reverse tabs (InVID workflow)");
    }, "image/png");
  }

  async function runOcr() {
    note("ocr…");
    try {
      if (!window.Tesseract) {
        await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
      }
      const c = stillCanvas();
      const Tess = window.Tesseract;
      const { data } = await Tess.recognize(c, "eng", { logger: () => {} });
      S.ocr = ((data && data.text) || "").trim().slice(0, 400);
      note(S.ocr ? "ocr ready" : "ocr empty");
      runIntel();
    } catch (e) {
      S.ocr = "";
      note("ocr CANNOT_RESOLVE");
    }
  }

  async function scanBarcodes(src) {
    S.barcodes = [];
    if (!("BarcodeDetector" in window)) return;
    try {
      const det = new BarcodeDetector({ formats: ["qr_code", "aztec", "data_matrix", "pdf417", "code_128", "ean_13"] });
      const hits = await det.detect(src);
      S.barcodes = (hits || [])
        .map((h) => h.rawValue)
        .filter(Boolean)
        .slice(0, 6);
    } catch (_) {}
  }

  function lmEmbed(lm) {
    if (!lm || !lm.length) return [];
    let cx = 0,
      cy = 0;
    for (let i = 0; i < lm.length; i++) {
      cx += lm[i].x;
      cy += lm[i].y;
    }
    cx /= lm.length;
    cy /= lm.length;
    const pts = [];
    for (let i = 0; i < lm.length; i += 2) {
      pts.push(lm[i].x - cx, lm[i].y - cy);
    }
    let s = 0;
    for (const v of pts) s += v * v;
    const n = Math.sqrt(s) || 1;
    return pts.map((v) => v / n);
  }

  function cosine(a, b) {
    const n = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++) d += a[i] * b[i];
    return d;
  }

  function faceAhash(src, lm) {
    if (!lm || !lm.length) return "";
    let minx = 1,
      miny = 1,
      maxx = 0,
      maxy = 0;
    lm.forEach((p) => {
      minx = Math.min(minx, p.x);
      miny = Math.min(miny, p.y);
      maxx = Math.max(maxx, p.x);
      maxy = Math.max(maxy, p.y);
    });
    const [vw, vh] = videoSize(src);
    const sx = minx * vw,
      sy = miny * vh,
      sw = Math.max(8, (maxx - minx) * vw),
      sh = Math.max(8, (maxy - miny) * vh);
    work.width = 8;
    work.height = 8;
    wctx.drawImage(src, sx, sy, sw, sh, 0, 0, 8, 8);
    const img = wctx.getImageData(0, 0, 8, 8).data;
    const ys = [];
    for (let i = 0; i < img.length; i += 4) ys.push(img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let bits = 0n;
    ys.forEach((y, i) => {
      if (y >= mean) bits |= 1n << BigInt(i);
    });
    return bits.toString(16).padStart(16, "0");
  }

  function matchLocal(embed, ahash) {
    const bank = S.enrollBank || [];
    if (!bank.length) return { match: false, status: "unenrolled", cosine: null };
    let best = -1,
      bestH = 64;
    bank.forEach((s) => {
      const c = cosine(embed, s.embed || []);
      if (c > best) best = c;
      if (ahash && s.ahash && ahash.length === s.ahash.length) {
        try {
          const h = (BigInt("0x" + ahash) ^ BigInt("0x" + s.ahash)).toString(2).split("1").length - 1;
          if (h < bestH) bestH = h;
        } catch (_) {}
      }
    });
    const cosineHit = best >= 0.86;
    const hashHit = ahash && bestH <= 18;
    const hit = cosineHit || hashHit;
    return { match: hit, status: hit ? "operator" : "unknown-local", cosine: best, hamming: bestH };
  }

  const IDKEY = "asherin-arvision-identity";
  async function loadIdentity() {
    try {
      const j = JSON.parse(localStorage.getItem(IDKEY) || "{}");
      S.enrollBank = j.samples || [];
      S.identity.enrolled = !!(j.samples && j.samples.length);
      S.identity.label = j.label || "operator";
      if (!S.identity.enrolled) S.identity.status = "unenrolled";
    } catch (_) {}
  }

  async function enrollMe() {
    if (!S.models.face) {
      note("face model not live — wait for mesh, or models blocked");
      return;
    }
    if (!S.lastLm) {
      note("no face to enroll — look at the camera, mesh on");
      return;
    }
    note("enrolling you on this box… hold still");
    const shots = [];
    for (let i = 0; i < 4; i++) {
      if (S.lastLm) {
        shots.push({ embed: lmEmbed(S.lastLm), ahash: S.lastAhash || "", ts: new Date().toISOString() });
      }
      await new Promise((r) => setTimeout(r, 280));
    }
    if (!shots.length) {
      note("enroll miss — no face lock");
      return;
    }
    try {
      const prev = JSON.parse(localStorage.getItem(IDKEY) || "{}");
      const samples = [...(prev.samples || []), ...shots].slice(-8);
      localStorage.setItem(
        IDKEY,
        JSON.stringify({
          label: "operator",
          samples,
          enrolled_at: prev.enrolled_at || new Date().toISOString(),
          product: "asher.arvision",
          scope: "this-box-operator-only",
        }),
      );
      await loadIdentity();
      S.identity.status = "operator";
      S.identity.match = true;
      note(
        "enrolled · local only · " +
          samples.length +
          " sample" +
          (samples.length > 1 ? "s" : "") +
          " · look at cam to match",
      );
    } catch {
      note("enroll miss");
    }
  }

  const MAKES = {
    tesla: "TESLA",
    honda: "HONDA",
    toyota: "TOYOTA",
    ford: "FORD",
    chevrolet: "CHEVROLET",
    chevy: "CHEVROLET",
    bmw: "BMW",
    mercedes: "MERCEDES-BENZ",
    benz: "MERCEDES-BENZ",
    audi: "AUDI",
    volkswagen: "VOLKSWAGEN",
    vw: "VOLKSWAGEN",
    hyundai: "HYUNDAI",
    kia: "KIA",
    nissan: "NISSAN",
    mazda: "MAZDA",
    subaru: "SUBARU",
    lexus: "LEXUS",
    jeep: "JEEP",
    ram: "RAM",
    gmc: "GMC",
    dodge: "DODGE",
    volvo: "VOLVO",
    porsche: "PORSCHE",
    rivian: "RIVIAN",
    lucid: "LUCID",
    genesis: "GENESIS",
    acura: "ACURA",
    infiniti: "INFINITI",
    cadillac: "CADILLAC",
    lincoln: "LINCOLN",
    buick: "BUICK",
    chrysler: "CHRYSLER",
    mitsubishi: "MITSUBISHI",
    jaguar: "JAGUAR",
    mini: "MINI",
    fiat: "FIAT",
    polestar: "POLESTAR",
    ferrari: "FERRARI",
    hummer: "GMC",
  };
  const PLATE_STOP = new Set([
    "THE",
    "AND",
    "FOR",
    "YOU",
    "ARE",
    "NOT",
    "THIS",
    "THAT",
    "WITH",
    "FROM",
    "HAVE",
    "YOUR",
    "WILL",
    "WHAT",
    "WHEN",
    "WHERE",
    "BEEN",
    "WERE",
    "THEY",
    "HTTP",
    "HTTPS",
    "WWW",
    "COM",
    "OCR",
    "NULL",
    "TRUE",
    "FALSE",
    "FACE",
    "POSE",
  ]);
  async function runIntel() {
    const now = performance.now();
    if (now - S.lastIntel < 2500 && S.intel) return;
    S.lastIntel = now;
    note("frame intel…");
    try {
      const ocr = String(S.ocr || "");
      const blob = (ocr + " " + (S.barcodes || []).join(" ")).toUpperCase();
      const objects = (S.objects || []).map((o) => String(o.name || "").toLowerCase());
      const classes = (S.classes || []).map((c) => String(c.name || "").toLowerCase());
      const vins = [];
      const vinRe = /\b([A-HJ-NPR-Z0-9]{17})\b/g;
      let vm;
      while ((vm = vinRe.exec(blob))) {
        const v = vm[1];
        if (/\d/.test(v) && /[A-Z]/.test(v) && vins.indexOf(v) < 0) vins.push(v);
      }
      const plates = [];
      const plateRe =
        /\b([A-Z]{1,3}[-\s]?\d{2,4}[-\s]?[A-Z]{0,3}|\d{1,3}[-\s]?[A-Z]{2,3}[-\s]?\d{1,4}|[A-Z]{2}[-\s]?\d{2}[-\s]?[A-Z]{2}|[A-Z]{3}[-\s]?\d{3,4})\b/g;
      let pm;
      while ((pm = plateRe.exec(blob))) {
        const p = pm[1].replace(/[-\s]/g, "");
        if (
          p.length < 5 ||
          p.length > 8 ||
          PLATE_STOP.has(p) ||
          p === p.replace(/\D/g, "") ||
          p === p.replace(/\d/g, "")
        )
          continue;
        if (vins.indexOf(p) < 0 && plates.indexOf(p) < 0) plates.push(p);
      }
      const makes = [];
      const hay = (ocr + " " + classes.join(" ") + " " + objects.join(" ")).toLowerCase();
      Object.keys(MAKES).forEach((tok) => {
        if (new RegExp("\\b" + tok + "\\b").test(hay) && makes.indexOf(MAKES[tok]) < 0) makes.push(MAKES[tok]);
      });
      const vinRows = [];
      for (const vin of vins.slice(0, 2)) {
        try {
          const r = await fetch(
            "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + encodeURIComponent(vin) + "?format=json",
          );
          const j = await r.json();
          const row = (j.Results && j.Results[0]) || {};
          const keep = {};
          ["Make", "Model", "ModelYear", "VehicleType", "BodyClass", "PlantCountry", "FuelTypePrimary"].forEach((k) => {
            if (row[k] && row[k] !== "Not Applicable") keep[k] = row[k];
          });
          vinRows.push({ ok: true, vin, decode: keep, source: "NHTSA vPIC", this_is_unsure: !keep.Make });
          if (keep.Make && makes.indexOf(String(keep.Make).toUpperCase()) < 0)
            makes.push(String(keep.Make).toUpperCase());
        } catch (_) {
          vinRows.push({ ok: false, vin, this_is_unsure: true });
        }
      }
      const plateHits = [];
      for (const p of plates.slice(0, 3)) {
        let rdw = { skipped: true };
        if (p.length === 6) {
          try {
            const rr = await fetch("https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=" + encodeURIComponent(p));
            const rows = await rr.json();
            rdw =
              rows && rows[0]
                ? { ok: true, hit: true, vehicle: rows[0], owner: "CANNOT_RESOLVE", source: "RDW opendata NL" }
                : { ok: false, hit: false, source: "RDW opendata NL" };
          } catch (_) {
            rdw = { ok: false };
          }
        }
        plateHits.push({ plate: p, rdw, owner: "CANNOT_RESOLVE" });
      }
      const carIn = [
        "car",
        "truck",
        "bus",
        "motorcycle",
        "vehicle",
        "sports car",
        "minivan",
        "jeep",
        "convertible",
      ].some((n) => objects.indexOf(n) >= 0 || classes.indexOf(n) >= 0);
      const vinOk = vinRows.find((row) => row.ok && row.decode && row.decode.Make);
      let guess = null,
        unsure = true,
        models = [];
      if (vinOk) {
        const d = vinOk.decode;
        models = d.Model ? [d.Model] : [];
        guess = [d.Make, d.Model, d.ModelYear].filter(Boolean).join(" ");
        unsure = false;
      } else if (makes[0]) {
        guess = makes[0];
      }
      S.intel = {
        ok: true,
        product: "asher.arvision",
        organ: "frame-intel",
        car: {
          in_frame: carIn,
          guess,
          makes,
          models,
          this_is_unsure: unsure,
          source: vinOk ? "NHTSA vPIC VIN" : "ocr-badge + class",
        },
        plates: plateHits,
        vins: vinRows,
        public_cameras: { cameras: [], private_feed: "CANNOT_RESOLVE" },
      };
      const plate = plateHits[0] && plateHits[0].plate;
      note(
        guess || plate ? "intel · " + [guess, plate].filter(Boolean).join(" · ") : "intel stored · public index only",
      );
    } catch {
      note("intel miss");
    }
  }

  function maybeAutoIntel() {
    const names = (S.objects || []).map((o) => String(o.name || "").toLowerCase());
    const vehicle = names.some((n) => ["car", "truck", "bus", "motorcycle"].includes(n));
    const now = performance.now();
    if (vehicle && now - S.lastOcr > 14000 && !S.frozen) {
      S.lastOcr = now;
      runOcr();
    }
  }

  function toggleRec() {
    if (S.rec) {
      S.rec.stop();
      S.rec = null;
      return;
    }
    if (!S.stream) return;
    S.recChunks = [];
    const rec = new MediaRecorder(S.stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
    });
    rec.ondataavailable = (e) => {
      if (e.data.size) S.recChunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(S.recChunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "arvision.webm";
      a.click();
      note("clip saved");
    };
    rec.start();
    S.rec = rec;
    note("recording");
  }

  async function savePacket() {
    const c = stillCanvas();
    const still = c.toDataURL("image/jpeg", 0.72);
    const packet = {
      product: "asher.arvision",
      ts: new Date().toISOString(),
      schema: "ASHERIN VISUAL INTELLIGENCE REPORT",
      A_ENVIRONMENTAL_GRID: {
        sensor_lat: S.lat,
        sensor_lon: S.lon,
        sensor_acc_m: S.acc,
        geo_src: S.geoSrc,
        heading_deg: S.heading,
        heading_src: S.headingSrc,
        beta: S.beta,
        gamma: S.gamma,
        hfov_deg: S.hfov,
        resolution: [cam.videoWidth, cam.videoHeight],
        fps: S.fps,
        facing: S.facing,
        note: "device GNSS is sensor position — not scene geocode unless votes exist",
      },
      B_PRIMARY_ANALYSIS: {
        luma: S.luma,
        contrast: S.contrast,
        motion: S.motion,
        edge_density: S.edges,
        faces: S.faces,
        objects: S.objects,
        barcodes: S.barcodes,
        ocr: S.ocr,
        blendshapes: S.blend,
      },
      C_SITUATIONAL_INTELLIGENCE: {
        obstruction: S.obstruction,
        scene_location: S.ocr ? "signage votes present — confirm before lock" : "CANNOT_RESOLVE",
        this_is_unsure: true,
      },
      D_ANOMALY_REPORT: { motion_spike: S.motion > 0.18, dark: S.luma < 0.12, blown: S.luma > 0.88 },
      E_OBSTRUCTION_LOG: S.obstruction,
      OVERALL_CONFIDENCE: "not scored — no calibrated inference backend is attached to this capture",
      misb_analog: misbFields(),
      identity: S.identity,
      classes: S.classes,
      frame_intel: S.intel,
      still_jpeg: still,
    };
    try {
      const r = await fetch("/api/packet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(packet),
      });
      const j = await r.json();
      note(j.ok ? "packet saved in asherin" : "packet miss");
    } catch {
      const a = document.createElement("a");
      a.href = "data:application/json," + encodeURIComponent(JSON.stringify(packet));
      a.download = "arvision-packet.json";
      a.click();
      note("packet downloaded (api miss)");
    }
  }

  function misbFields() {
    return {
      unix: Date.now() * 1000,
      zulu: new Date().toISOString(),
      SensorLatitude: S.lat,
      SensorLongitude: S.lon,
      PlatformHeading: S.heading,
      PlatformPitch: S.beta,
      PlatformRoll: S.gamma,
      HorizontalFOV: S.hfov,
      HorizontalFOVSource: S.hfovSource || "not reported by this camera",
      FrameCenter: "CANNOT_RESOLVE unless outdoor GNSS+horizon+signage",
      analog: true,
      standard: "MISB ST 0601 field names — device IMU/GNSS analog, not airborne KLV",
    };
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function loadModels() {
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
      const vision = await mod.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
      );
      const base = { delegate: "GPU" };
      try {
        S.models.face = await mod.FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            ...base,
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
      } catch {
        S.models.face = await mod.FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
      }
      try {
        S.models.pose = await mod.PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch (_) {}
      try {
        S.models.obj = await mod.ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          scoreThreshold: 0.18,
          maxResults: 16,
        });
      } catch (_) {}
      try {
        S.models.cls = await mod.ImageClassifier.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          maxResults: 8,
          scoreThreshold: 0.08,
        });
      } catch (_) {}
      S.models.connectors = {
        faceOval: mod.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        leftEye: mod.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        rightEye: mod.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        lips: mod.FaceLandmarker.FACE_LANDMARKS_LIPS,
        pose: mod.PoseLandmarker.POSE_CONNECTIONS,
      };
      S.models.status = "live";
    } catch (e) {
      S.models.status = "native-only";
      note("models blocked — native intel still on");
    }
  }

  function nativeIntel(src) {
    const w = 160,
      h = 90;
    work.width = w;
    work.height = h;
    wctx.drawImage(src, 0, 0, w, h);
    const img = wctx.getImageData(0, 0, w, h).data;
    let sum = 0,
      sum2 = 0,
      edge = 0;
    const hist = new Array(8).fill(0);
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const y = (img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114) / 255;
      gray[p] = y;
      sum += y;
      sum2 += y * y;
      hist[Math.min(7, (y * 8) | 0)]++;
    }
    const n = w * h;
    S.luma = sum / n;
    S.contrast = Math.sqrt(Math.max(0, sum2 / n - S.luma * S.luma));
    S.hist = hist.map((v) => v / n);
    if (S.lastGray && S.lastGray.length === gray.length) {
      let sad = 0;
      for (let i = 0; i < gray.length; i++) sad += Math.abs(gray[i] - S.lastGray[i]);
      S.motion = sad / n;
    }
    S.lastGray = gray;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = gray[i + 1] - gray[i - 1];
        const gy = gray[i + w] - gray[i - w];
        if (Math.abs(gx) + Math.abs(gy) > 0.35) edge++;
      }
    }
    S.edges = edge / n;
    const obs = [];
    if (S.luma < 0.12) obs.push("dark");
    if (S.luma > 0.88) obs.push("blown highlights");
    if (S.motion > 0.22) obs.push("motion blur risk");
    if (S.edges < 0.01) obs.push("low edge / defocus or empty");
    if (S.frozen) obs.push("frozen still");
    S.obstruction = obs;
  }

  function coverMap(nx, ny, vw, vh, cw, ch) {
    let x, y;
    if (!vw || !vh) {
      x = nx * cw;
      y = ny * ch;
    } else {
      const va = vw / vh,
        ca = cw / ch;
      let scale, ox, oy;
      if (ca > va) {
        scale = ch / vh;
        ox = (cw - vw * scale) / 2;
        oy = 0;
      } else {
        scale = cw / vw;
        ox = 0;
        oy = (ch - vh * scale) / 2;
      }
      x = ox + nx * vw * scale;
      y = oy + ny * vh * scale;
    }
    if (selfieMirror()) x = cw - x;
    return [x, y];
  }

  function videoSize(src) {
    return [src.videoWidth || src.width || 1280, src.videoHeight || src.height || 720];
  }

  function drawConnect(landmarks, conns, color, W, H, vw, vh) {
    if (!conns || !landmarks) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const c of conns) {
      const a = landmarks[c.start];
      const b = landmarks[c.end];
      if (!a || !b) continue;
      const p = coverMap(a.x, a.y, vw, vh, W, H);
      const q = coverMap(b.x, b.y, vw, vh, W, H);
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
  }

  function loop() {
    const src = S.frozen && S.freezeBitmap ? S.freezeBitmap : cam;
    if (dead) return;
    const rw = Math.max(1, root.clientWidth || wrap.clientWidth || innerWidth);
    const rh = Math.max(1, root.clientHeight || wrap.clientHeight || innerHeight);
    const W = (hud.width = rw * devicePixelRatio);
    const H = (hud.height = rh * devicePixelRatio);
    hud.style.width = rw + "px";
    hud.style.height = rh + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const w = rw,
      h = rh;
    ctx.clearRect(0, 0, w, h);

    if (src && (src.readyState >= 2 || src.width)) nativeIntel(src);

    const now = performance.now();
    S.frames++;
    if (now - S.fpsT > 500) {
      S.fps = Math.round((S.frames * 1000) / (now - S.fpsT));
      S.frames = 0;
      S.fpsT = now;
    }

    if (layers.grid) {
      ctx.strokeStyle = "rgba(158,201,255,.18)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((w * i) / 3, 0);
        ctx.lineTo((w * i) / 3, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, (h * i) / 3);
        ctx.lineTo(w, (h * i) / 3);
        ctx.stroke();
      }
    }

    if (layers.reticle) {
      ctx.strokeStyle = "rgba(245,247,251,.55)";
      ctx.lineWidth = 1.25;
      const cx = w / 2,
        cy = h / 2,
        r = 18;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 36, cy);
      ctx.lineTo(cx - 8, cy);
      ctx.moveTo(cx + 8, cy);
      ctx.lineTo(cx + 36, cy);
      ctx.moveTo(cx, cy - 36);
      ctx.lineTo(cx, cy - 8);
      ctx.moveTo(cx, cy + 8);
      ctx.lineTo(cx, cy + 36);
      ctx.stroke();
    }

    if (layers.horizon && S.beta != null) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(((-S.gamma || 0) * Math.PI) / 180);
      const y = (S.beta / 90) * (h * 0.35);
      ctx.strokeStyle = "rgba(126,224,198,.7)";
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.restore();
    }

    if (layers.peaking && S.lastGray) {
      ctx.fillStyle = "rgba(158,201,255,.28)";
      const pw = work.width,
        ph = work.height;
      for (let y = 1; y < ph - 1; y += 2) {
        for (let x = 1; x < pw - 1; x += 2) {
          const i = y * pw + x;
          const gx = S.lastGray[i + 1] - S.lastGray[i - 1];
          const gy = S.lastGray[i + pw] - S.lastGray[i - pw];
          if (Math.abs(gx) + Math.abs(gy) > 0.45) {
            const px = (x / pw) * w;
            ctx.fillRect(selfieMirror() ? w - px - 3 : px, (y / ph) * h, 3, 3);
          }
        }
      }
    }

    if (layers.motion && S.motion > 0.04) {
      ctx.fillStyle = "rgba(232,197,107,.12)";
      ctx.fillRect(0, 0, w, 6);
    }

    const ts = now;
    S.objects = [];
    S.faces = 0;
    S.poseOn = false;
    S.blend = "";

    const [vw, vh] = videoSize(src);
    const canDetect = src && (src.videoWidth || src.width) && !S.frozen;
    if (S.models.face && layers.mesh && canDetect) {
      try {
        const res = S.models.face.detectForVideo(src, ts);
        const lms = res.faceLandmarks || [];
        S.faces = lms.length;
        const C = S.models.connectors || {};
        lms.forEach((lm, fi) => {
          drawConnect(lm, C.faceOval, "rgba(158,201,255,.85)", w, h, vw, vh);
          drawConnect(lm, C.leftEye, "rgba(126,224,198,.9)", w, h, vw, vh);
          drawConnect(lm, C.rightEye, "rgba(126,224,198,.9)", w, h, vw, vh);
          drawConnect(lm, C.lips, "rgba(245,247,251,.7)", w, h, vw, vh);
          if (fi === 0) {
            S.lastLm = lm;
            if (S.frames % 8 === 0) S.lastAhash = faceAhash(src, lm);
            const embed = lmEmbed(lm);
            const hit = matchLocal(embed, S.lastAhash);
            S.identity.status = hit.status;
            S.identity.match = hit.match;
            S.identity.cosine = hit.cosine;
            if (layers.identity) {
              const top = lm.reduce((a, p) => (p.y < a.y ? p : a), lm[0]);
              const p = coverMap(top.x, top.y, vw, vh, w, h);
              const tag = hit.match
                ? "YOU · operator"
                : hit.status === "unenrolled"
                  ? "face · tap enroll me"
                  : "unknown · local only";
              ctx.fillStyle = "rgba(11,16,24,.72)";
              ctx.fillRect(p[0] - 4, p[1] - 22, 150, 16);
              ctx.fillStyle = hit.match ? "#7ee0c6" : "#f5f7fb";
              ctx.font = "11px Segoe UI, sans-serif";
              ctx.fillText(tag, p[0], p[1] - 10);
            }
          }
        });
        const bs = res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
        if (bs) {
          const top = bs
            .filter((c) => c.score > 0.45)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          S.blend = top
            .map((c) => c.categoryName.replace("faceBlendshapes_", "") + " " + c.score.toFixed(2))
            .join(" · ");
        }
      } catch (_) {}
    }

    if (S.models.pose && layers.pose && canDetect) {
      try {
        const res = S.models.pose.detectForVideo(src, ts + 1);
        const lms = res.landmarks || [];
        if (lms[0]) {
          S.poseOn = true;
          drawConnect(lms[0], (S.models.connectors || {}).pose, "rgba(158,201,255,.55)", w, h, vw, vh);
        }
      } catch (_) {}
    }

    if (S.models.obj && layers.objects && canDetect) {
      try {
        const res = S.models.obj.detectForVideo(src, ts + 2);
        const minScore = S.sensitivity === "high" ? 0.18 : S.sensitivity === "field" ? 0.32 : 0.5;
        const dets = (res.detections || []).filter(
          (d) => ((d.categories && d.categories[0] && d.categories[0].score) || 0) >= minScore,
        );
        S.objects = dets.map((d) => {
          const cat = (d.categories && d.categories[0]) || {};
          const bb = d.boundingBox || {};
          const p = coverMap(bb.originX / vw, bb.originY / vh, vw, vh, w, h);
          const q = coverMap((bb.originX + bb.width) / vw, (bb.originY + bb.height) / vh, vw, vh, w, h);
          const bx = Math.min(p[0], q[0]),
            by = Math.min(p[1], q[1]);
          const bw = Math.abs(q[0] - p[0]),
            bh = Math.abs(q[1] - p[1]);
          ctx.strokeStyle = "rgba(158,201,255,.8)";
          ctx.strokeRect(bx, by, bw, bh);
          ctx.fillStyle = "rgba(11,16,24,.72)";
          const label = (cat.categoryName || "?") + " " + Math.round((cat.score || 0) * 100) + "%";
          ctx.fillRect(bx, by - 16, Math.min(160, bw), 16);
          ctx.fillStyle = "#f5f7fb";
          ctx.font = "11px Segoe UI, sans-serif";
          ctx.fillText(label, bx + 4, by - 4);
          return { name: cat.categoryName, score: cat.score, x: bx, y: by, w: bw, h: bh };
        });
        drawHonest(S.objects, w, h);
      } catch (_) {}
    }

    if (S.models.cls && layers.classify && canDetect) {
      S.clsTick++;
      if (S.clsTick % 10 === 0) {
        try {
          const cres = S.models.cls.classifyForVideo(src, ts + 3);
          const cats = (cres.classifications && cres.classifications[0] && cres.classifications[0].categories) || [];
          S.classes = cats.slice(0, 5).map((c) => ({ name: c.categoryName, score: c.score }));
        } catch (_) {}
      }
    }

    maybeAutoIntel();
    if (!S.frozen && now - S.lastShot > 8000 && cam.readyState >= 2) shotInbox();

    if (layers.rf) drawRf(w, h);
    drawIntelChips(w, h);

    if (S.barcodes.length) {
      ctx.fillStyle = "rgba(126,224,198,.9)";
      ctx.font = "12px Segoe UI, sans-serif";
      ctx.fillText("id " + S.barcodes[0].slice(0, 48), 24, h - 24);
    }

    paintMisb();
    paintSheet();
    // both views last, once the overlay for this frame is complete
    paintSpectral(src, w, h);
    requestAnimationFrame(loop);

  }

  function row(k, v) {
    return '<div class="row"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>";
  }
  function list(t) {
    return '<div class="list">' + esc(t) + "</div>";
  }

  function paintMisb() {
    const lat = S.lat != null ? S.lat.toFixed(5) : "CANNOT_RESOLVE";
    const lon = S.lon != null ? S.lon.toFixed(5) : "CANNOT_RESOLVE";
    const hdg = S.heading != null ? Math.round(S.heading) + "°" : "no mag";
    const fov = S.hfov ? Math.round(S.hfov) + "° measured" : "fov not reported";
    misbEl.innerHTML =
      "<b>" +
      new Date().toISOString().slice(11, 19) +
      "Z</b>" +
      "<div>" +
      lat +
      " · " +
      lon +
      "</div>" +
      '<div class="m">hdg ' +
      hdg +
      " · fov " +
      fov +
      " · " +
      S.fps +
      " fps · " +
      S.models.status +
      "</div>" +
      '<div class="m">ST 0601 analog · sensor ≠ scene · rf ' +
      (S.rf.n || 0) +
      "</div>";
  }

  function paintSheet() {
    const names = [];
    for (let i = 0; i < S.objects.length && names.length < 6; i++) {
      if (S.objects[i].name) names.push(S.objects[i].name);
    }
    const cls = [];
    const classes = S.classes || [];
    for (let i = 0; i < classes.length && cls.length < 3; i++) cls.push(classes[i].name);
    const who =
      (S.identity.status || "—") + (S.identity.cosine != null ? " · " + Number(S.identity.cosine).toFixed(3) : "");
    const car =
      (S.intel && S.intel.car && (S.intel.car.guess || (S.intel.car.in_frame ? "in frame · unsure" : "none"))) ||
      "none";
    const plate = (S.intel && S.intel.plates && S.intel.plates[0] && S.intel.plates[0].plate) || "none";
    const folded = sheetEl.classList.contains("folded");
    let html =
      '<button type="button" class="fold" id="sheet-fold">' +
      (folded ? "live intel ·" : "live intel") +
      "</button>" +
      '<button type="button" class="fold" id="sens-cycle">sens · ' +
      (S.sensitivity || "high") +
      "</button>" +
      row("view", MODE_NAMES[S.primary] || "colorized") +
      row("luma", S.luma.toFixed(2)) +

      row("contrast", S.contrast.toFixed(2)) +
      row("motion", S.motion.toFixed(3)) +
      row("edges", S.edges.toFixed(3)) +
      row("faces", String(S.faces)) +
      row("pose", S.poseOn ? "on" : "off") +
      row("who", who) +
      row("inbox", (S.inbox || []).length + " overlay shots") +
      row("objects", names.join(", ") || "none") +
      row("what", cls.join(", ") || "classifier…") +
      row("car", car) +
      row("plate", plate) +
      row("ids", S.barcodes[0] ? S.barcodes[0].slice(0, 18) : "none") +
      list(S.blend || "") +
      list(S.obstruction.join(" · ") || "clear") +
      list(S.ocr ? S.ocr.slice(0, 180) : "ocr on freeze / auto on car") +
      list("spectral filter: separates materials by how differently they sit across the camera's own colour channels. it is not a calibrated infrared sensor and does not read heat.") +
      list("thermal estimate: maps this camera's brightness onto an iron palette — bright reads warm, dark reads cool. a phone camera cannot measure infrared radiation or temperature, so this is a visualization, not a thermometer. it cannot see through ordinary walls, and common glass is opaque to real long-wave thermal too — a true thermal camera pointed at a window reads the glass surface and its reflections, not what is behind it.") +
      list("scene geocode: CANNOT_RESOLVE until ≥3 visual votes") +

      list("headphones music: CANNOT_RESOLVE unless MCS GATT · A2DP intercept refused") +
      list("open apps / tabs / SMS / in-app DMs on another phone: CANNOT_RESOLVE · no implant") +
      list("laptop screen: CANNOT_RESOLVE · no implant") +
      list("private camera feed: CANNOT_RESOLVE · public DOT / your URL only") +
      list("hvac / ac radio: CANNOT_RESOLVE · see it ≠ connect · no implant");
    const log = S.deviceLog || [];
    for (let i = 0; i < log.length && i < 6; i++) {
      const d = log[i];
      html += row(
        (d.person || d.brand || "bt").slice(0, 14),
        (d.name || "").slice(0, 12) + (d.battery != null ? " " + d.battery + "%" : ""),
      );
    }
    const cams = (S.intel && S.intel.public_cameras && S.intel.public_cameras.cameras) || [];
    for (let i = 0; i < cams.length && i < 3; i++)
      html += list("public cam · " + esc((cams[i].name || "").slice(0, 40)));
    html += list("rf engine " + (S.rf.engine || "…") + " · " + S.rf.n + " emitters");
    const tracks = S.rf.tracks || [];
    for (let i = 0; i < tracks.length && i < 8; i++) {
      const t = tracks[i];
      html += row(
        t.mode === "rf_occluded" ? "ghost" : t.mode,
        ((t.name || t.class || t.id || "").slice(0, 22) + " " + (t.rssi || "")).trim(),
      );
    }
    const wifi = S.rf.wifi || [];
    for (let i = 0; i < wifi.length && i < 3; i++)
      html += list(esc(wifi[i].ssid || "ssid") + " · " + String(wifi[i].auth || "").slice(0, 16));
    sheetEl.innerHTML = html;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function drawHonest(objs) {
    const map = {
      laptop: "laptop screen: CANNOT_RESOLVE",
      tv: "private feed: CANNOT_RESOLVE",
      "cell phone": "their camera: CANNOT_RESOLVE",
      keyboard: "typed text: CANNOT_RESOLVE",
    };
    (objs || []).forEach((o) => {
      const msg = map[String(o.name || "").toLowerCase()];
      if (!msg || !o.w) return;
      ctx.fillStyle = "rgba(232,197,107,.92)";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.fillText(msg, o.x + 4, o.y + o.h + 14);
    });
  }

  function drawIntelChips(w, h) {
    const car = S.intel && S.intel.car && S.intel.car.guess;
    const plate = S.intel && S.intel.plates && S.intel.plates[0];
    const vin = S.intel && S.intel.vins && S.intel.vins[0] && S.intel.vins[0].decode;
    let y = h - 96;
    const chip = (txt, ok) => {
      ctx.fillStyle = ok ? "rgba(8,14,12,.7)" : "rgba(18,14,8,.7)";
      ctx.fillRect(24, y, Math.min(420, 18 + txt.length * 7.2), 20);
      ctx.fillStyle = ok ? "#7ee0c6" : "#e8c56b";
      ctx.font = "11px Segoe UI, sans-serif";
      ctx.fillText(txt, 32, y + 14);
      y -= 24;
    };
    if (vin && (vin.Make || vin.Model))
      chip("VIN · " + [vin.Make, vin.Model, vin.ModelYear].filter(Boolean).join(" "), true);
    if (plate && plate.plate) chip("plate · " + plate.plate + " · owner CANNOT_RESOLVE", false);
    if (car) chip("car · " + car + (S.intel.car.this_is_unsure ? " · unsure" : ""), !S.intel.car.this_is_unsure);
    (S.classes || []).slice(0, 2).forEach((c) => chip("class · " + c.name, false));
  }

  const TECH = new Set(["cell phone", "laptop", "tv", "remote", "keyboard", "mouse", "clock", "microwave"]);

  function drawRf(w, h) {
    const tracks = S.rf.tracks || [];
    const fused = tracks.filter(
      (t) => t.mode === "fused_in_frame" || t.mode === "fused_on_person" || t.mode === "in_front_or_on_body",
    );
    const ghost = tracks.filter((t) => t.mode === "rf_occluded");
    const techBoxes = (S.objects || []).filter((o) => TECH.has(String(o.name || "").toLowerCase()) && o.w);
    fused.slice(0, 5).forEach((t, i) => {
      const box = techBoxes[i] || techBoxes[0];
      let x = w * 0.62,
        y = 90 + i * 70,
        bw = 210,
        bh = 58;
      if (box) {
        x = box.x;
        y = box.y + box.h + 4;
        bw = Math.max(180, box.w);
      }
      paintEmitter(x, y, bw, 58, t, false);
    });
    ghost.slice(0, 6).forEach((t, i) => {
      const x = 16;
      const y = 108 + i * 66;
      paintEmitter(x, y, 236, 58, t, true);
    });
  }

  function paintEmitter(x, y, bw, bh, t, ghost) {
    ctx.save();
    ctx.strokeStyle = ghost ? "rgba(232,197,107,.85)" : "rgba(126,224,198,.9)";
    ctx.setLineDash(ghost ? [5, 4] : []);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, bw, bh);
    ctx.fillStyle = ghost ? "rgba(18,14,8,.55)" : "rgba(8,14,12,.55)";
    ctx.fillRect(x, y, bw, bh);
    ctx.setLineDash([]);
    ctx.fillStyle = "#f5f7fb";
    ctx.font = "600 12px Segoe UI, sans-serif";
    const title = (t.name || t.class || "emitter").slice(0, 26);
    ctx.fillText(title, x + 8, y + 16);
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.fillStyle = "rgba(245,247,251,.7)";
    const rng = (t.range && t.range.band) || "";
    ctx.fillText((t.class || "") + " · " + (t.rssi != null ? t.rssi + " dBm" : "no rssi"), x + 8, y + 32);
    const g = t.gatt || {};
    const media = g.media && g.media.track_title && g.media.track_title !== "CANNOT_RESOLVE" ? g.media.track_title : "";
    const gtxt = media || g.manufacturer || g.model || (t.manufacturer && t.manufacturer[0]) || t.probe || "";
    const extra =
      t.class === "audio" && !media ? "music CANNOT_RESOLVE" : ghost ? "RF ONLY · structure analog · " : "IN FRAME · ";
    ctx.fillText(extra + String(gtxt).slice(0, 28), x + 8, y + 48);
    ctx.restore();
  }

  async function pollRf() {
    if (!S.rf.engine) S.rf.engine = "browser";
  }

  const LOGKEY = "asherin-arvision-device-log";
  const INBOXKEY = "asherin-arvision-inbox";
  const TAGKEY = "asherin-arvision-person-tags";

  function loadLogs() {
    try {
      S.deviceLog = JSON.parse(localStorage.getItem(LOGKEY) || "[]");
    } catch {
      S.deviceLog = [];
    }
    try {
      S.inbox = JSON.parse(localStorage.getItem(INBOXKEY) || "[]");
    } catch {
      S.inbox = [];
    }
    try {
      S.personTags = JSON.parse(localStorage.getItem(TAGKEY) || "{}");
    } catch {
      S.personTags = {};
    }
  }

  function persistLog() {
    try {
      localStorage.setItem(LOGKEY, JSON.stringify((S.deviceLog || []).slice(0, 80)));
    } catch (_) {}
  }

  function persistInbox() {
    try {
      localStorage.setItem(INBOXKEY, JSON.stringify((S.inbox || []).slice(0, 24)));
    } catch (_) {}
  }

  function utf8(dv) {
    if (!dv) return "";
    try {
      return new TextDecoder("utf-8")
        .decode(dv)
        .replace(/\u0000/g, "")
        .trim();
    } catch {
      return "";
    }
  }

  async function readGatt(server) {
    const out = { battery: null, manufacturer: "", model: "", firmware: "", serial: "", media: "" };
    const trySvc = async (uuid, char, parse) => {
      try {
        const s = await server.getPrimaryService(uuid);
        const c = await s.getCharacteristic(char);
        const v = await c.readValue();
        return parse(v);
      } catch {
        return null;
      }
    };
    const bat = await trySvc("battery_service", "battery_level", (v) => v.getUint8(0));
    if (typeof bat === "number") out.battery = bat;
    out.manufacturer = (await trySvc("device_information", "manufacturer_name_string", utf8)) || "";
    out.model = (await trySvc("device_information", "model_number_string", utf8)) || "";
    out.firmware = (await trySvc("device_information", "firmware_revision_string", utf8)) || "";
    out.serial = (await trySvc("device_information", "serial_number_string", utf8)) || "";
    try {
      const s = await server.getPrimaryService("0000184d-0000-1000-8000-00805f9b34fb");
      const c = await s.getCharacteristic("00002ba6-0000-1000-8000-00805f9b34fb");
      out.media = utf8(await c.readValue());
    } catch (_) {}
    return out;
  }

  function cannotResolveComms() {
    return {
      apps_open: "CANNOT_RESOLVE",
      tabs_open: "CANNOT_RESOLVE",
      phone_number: "CANNOT_RESOLVE",
      sms: "CANNOT_RESOLVE",
      in_app_messages: "CANNOT_RESOLVE",
      social_handles: "CANNOT_RESOLVE unless you type them on tag person",
      why: "browser bluetooth only sees public GATT. tabs / SMS / DMs need the device owner or MDM — not a webcam.",
    };
  }

  async function probeStrongest() {
    const bt = navigator.bluetooth;
    if (!bt || !bt.requestDevice) {
      note("bluetooth picker not in this browser — companion for live ads");
      return;
    }
    note("pick a bluetooth device…");
    try {
      const dev = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "battery_service",
          "device_information",
          "generic_access",
          "0000184d-0000-1000-8000-00805f9b34fb",
        ],
      });
      let gatt = {};
      if (dev.gatt) {
        try {
          const server = await dev.gatt.connect();
          gatt = await readGatt(server);
        } catch (_) {}
      }
      const person = (S.personTags && S.personTags[dev.id]) || "";
      const row = {
        ts: new Date().toISOString(),
        id: dev.id,
        name: dev.name || "unnamed",
        brand: gatt.manufacturer || "",
        model: gatt.model || "",
        battery: gatt.battery,
        firmware: gatt.firmware || "",
        serial: gatt.serial || "",
        media: gatt.media || "",
        person,
        person_info: person ? S.personTags[dev.id + ":info"] || "" : "",
        ...cannotResolveComms(),
      };
      S.rf.tracks = [
        {
          id: dev.id,
          name: dev.name || "bt",
          class: "bluetooth",
          mode: "in_front_or_on_body",
          probe: "picked",
          gatt: {
            manufacturer: gatt.manufacturer,
            model: gatt.model,
            battery: gatt.battery,
            media: { track_title: gatt.media || "CANNOT_RESOLVE" },
          },
        },
      ];
      S.rf.n = 1;
      S.rf.engine = "web-bluetooth";
      S.deviceLog = [row, ...(S.deviceLog || []).filter((x) => x.id !== dev.id)].slice(0, 80);
      persistLog();
      const bat = gatt.battery != null ? gatt.battery + "%" : "battery hidden";
      note(
        "bt · " +
          (dev.name || "unnamed") +
          " · " +
          (gatt.manufacturer || "brand CANNOT_RESOLVE") +
          " · " +
          bat +
          (person ? " · " + person : ""),
      );
    } catch (e) {
      note("bt pick miss");
    }
  }

  function tagPerson() {
    const t = (S.rf.tracks || [])[0];
    if (!t || !t.id) {
      note("probe rf first — then tag who owns that radio");
      return;
    }
    const who = window.prompt(
      "who is connected to this device? (your tag, this box only)",
      (S.personTags && S.personTags[t.id]) || "",
    );
    if (who == null) return;
    const info =
      window.prompt(
        "anything you already know (handles, number you typed — not intercepted)",
        (S.personTags && S.personTags[t.id + ":info"]) || "",
      ) || "";
    S.personTags = S.personTags || {};
    S.personTags[t.id] = who.trim();
    S.personTags[t.id + ":info"] = info.trim();
    try {
      localStorage.setItem(TAGKEY, JSON.stringify(S.personTags));
    } catch (_) {}
    S.deviceLog = (S.deviceLog || []).map((d) =>
      d.id === t.id ? { ...d, person: who.trim(), person_info: info.trim() } : d,
    );
    persistLog();
    note("tagged · " + (who.trim() || "cleared") + " · this box only");
  }

  function overlayCanvas() {
    const c = document.createElement("canvas");
    const rw = Math.max(1, hud.clientWidth || root.clientWidth || 1280);
    const rh = Math.max(1, hud.clientHeight || root.clientHeight || 720);
    c.width = rw;
    c.height = rh;
    const x = c.getContext("2d");
    const vw = cam.videoWidth || rw,
      vh = cam.videoHeight || rh;
    const va = vw / vh,
      ca = rw / rh;
    let dw, dh, ox, oy;
    if (ca > va) {
      dh = rh;
      dw = rh * va;
      ox = (rw - dw) / 2;
      oy = 0;
    } else {
      dw = rw;
      dh = rw / va;
      ox = 0;
      oy = (rh - dh) / 2;
    }
    x.fillStyle = "#000";
    x.fillRect(0, 0, rw, rh);
    // a still is of the view that is actually on the stage, spectral included
    const source = S.primary === "spectral" && specOut.width ? specOut : cam;
    try {
      if (selfieMirror()) {
        x.save();
        x.translate(rw, 0);
        x.scale(-1, 1);
        x.drawImage(source, rw - ox - dw, oy, dw, dh);
        x.restore();
      } else {
        x.drawImage(source, ox, oy, dw, dh);
      }
    } catch (_) {}

    try {
      x.drawImage(hud, 0, 0, rw, rh);
    } catch (_) {}
    return c;
  }

  function shotInbox() {
    if (!cam || cam.readyState < 2) return;
    try {
      const data = overlayCanvas().toDataURL("image/jpeg", 0.62);
      S.lastShot = performance.now();
      const rec = {
        ts: new Date().toISOString(),
        jpeg: data,
        who: S.identity.status || "",
        rf: ((S.rf.tracks || [])[0] && (S.rf.tracks[0].name || S.rf.tracks[0].id)) || "",
        person: ((S.rf.tracks || [])[0] && S.personTags && S.personTags[S.rf.tracks[0].id]) || "",
      };
      S.inbox = [rec, ...(S.inbox || [])].slice(0, 24);
      persistInbox();
      if (S.inboxOpen) paintInbox();
    } catch (_) {}
  }

  function toggleInbox() {
    S.inboxOpen = !S.inboxOpen;
    const el = $("inbox");
    if (!el) return;
    el.hidden = !S.inboxOpen;
    if (S.inboxOpen) paintInbox();
  }

  function paintInbox() {
    const el = $("inbox");
    if (!el) return;
    const rows = S.inbox || [];
    let html = "<h2>overlay inbox · this box</h2>";
    if (!rows.length) {
      html += '<div class="list">empty — freeze or wait ~8s while the camera is live</div>';
    } else {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        html +=
          '<img class="shot" alt="overlay still" src="' +
          r.jpeg +
          '" /><div class="meta">' +
          esc(r.ts.slice(11, 19)) +
          "Z · " +
          esc(r.who || "—") +
          " · " +
          esc(r.person || r.rf || "") +
          "</div>";
      }
    }
    el.innerHTML = html;
  }

  function applyHeading(deg, src) {
    if (typeof deg !== "number" || Number.isNaN(deg)) return;
    S.heading = ((deg % 360) + 360) % 360;
    S.headingSrc = src;
    const dim = src === "none" || src === "alpha-unsure";
    compassBtn.classList.toggle("dim", dim);
    if (rose) rose.setAttribute("transform", "rotate(" + -S.heading + " 44 44)");
  }
  async function enableHeading() {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (_) {}
    try {
      const Sensor = window.AbsoluteOrientationSensor;
      if (Sensor && !S._absOri) {
        const sensor = new Sensor({ frequency: 20 });
        sensor.addEventListener("reading", () => {
          const q = sensor.quaternion;
          if (!q) return;
          const x = q[0],
            y = q[1],
            z = q[2],
            w = q[3];
          const yaw = (Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180) / Math.PI;
          applyHeading(yaw, "absolute-orientation");
        });
        sensor.start();
        S._absOri = sensor;
        offs.push(() => {
          try {
            sensor.stop();
          } catch (_) {}
        });
      }
    } catch (_) {}
  }
  function sensors() {
    if (navigator.geolocation) {
      // the watch is registered once and must be released with the rest of the
      // sensors: left running it keeps the receiver awake after the view is
      // gone and starves any later position request on the same page
      const watchId = navigator.geolocation.watchPosition(
        (p) => {
          S.lat = p.coords.latitude;
          S.lon = p.coords.longitude;
          S.acc = p.coords.accuracy;
          S.geoSrc = "gnss";
          if (typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading) && p.coords.heading >= 0) {
            if (S.headingSrc !== "webkitCompassHeading" && S.headingSrc !== "absolute-orientation") {
              applyHeading(p.coords.heading, "gnss-heading");
            }
          }
        },
        () => {
          S.geoSrc = "denied";
        },
        { enableHighAccuracy: true, maximumAge: 2000 },
      );
      offs.push(() => {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (_) {}
      });
    }

    const onOri = (e) => {
      S.beta = e.beta;
      S.gamma = e.gamma;
      const abs = e.webkitCompassHeading;
      if (typeof abs === "number" && !Number.isNaN(abs)) applyHeading(abs, "webkitCompassHeading");
      else if (e.absolute && typeof e.alpha === "number") applyHeading((360 - e.alpha) % 360, "absolute-alpha");
      else if (typeof e.alpha === "number") applyHeading((360 - e.alpha) % 360, "alpha-unsure");
    };
    window.addEventListener("deviceorientationabsolute", onOri, true);
    window.addEventListener("deviceorientation", onOri, true);
    offs.push(function () {
      window.removeEventListener("deviceorientationabsolute", onOri, true);
      window.removeEventListener("deviceorientation", onOri, true);
    });
    compassBtn.onclick = () => {
      enableHeading().catch(() => {});
    };
    enableHeading().catch(() => {});
    if (sheetEl && !sheetEl._foldBound) {
      sheetEl._foldBound = true;
      sheetEl.addEventListener("click", (ev) => {
        const id = ev.target && ev.target.id;
        if (id === "sheet-fold") sheetEl.classList.toggle("folded");
        if (id === "sens-cycle") {
          S.sensitivity = S.sensitivity === "high" ? "field" : S.sensitivity === "field" ? "low" : "high";
        }
      });
    }
  }

  $("allow").onclick = () =>
    startCam().catch((e) => {
      haltCam(String((e && (e.name || e.message)) || e));
    });
  layerChips();
  talkBtns();
  sensors();
  startCam().catch((e) => {
    haltCam(String((e && (e.name || e.message)) || e));
  });
  loadModels();
  loadIdentity();
  loadLogs();
  const rfTimer = setInterval(pollRf, 450);
  pollRf();
  requestAnimationFrame(loop);
  return function cleanup() {
    dead = true;
    clearInterval(rfTimer);
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    offs.forEach((fn) => fn());
  };
}

const OpticalHudView = () => {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = "";
    const style = document.createElement("style");
    style.setAttribute("data-arvision-hud", "1");
    style.textContent = HUD_CSS;
    const wrap = document.createElement("div");
    wrap.className = "arv-root";
    wrap.innerHTML = HUD_BODY;
    root.appendChild(style);
    root.appendChild(wrap);
    const cleanup = bootArvision(wrap, root, emitPull) || (() => {});
    return () => {
      try {
        cleanup();
      } catch (_) {}
      root.innerHTML = "";
    };
  }, []);
  return <div ref={rootRef} className="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-black" />;
};

export default OpticalHudView;
