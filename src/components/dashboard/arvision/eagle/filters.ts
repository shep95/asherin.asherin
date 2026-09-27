// eagle.eye — render palettes.
//
// every variant here is a *palette* applied to the same captured pixels, never a
// new measurement. the thermal palette maps visible-light luminance through an iron
// ramp: it is a contrast rendering, not an infrared temperature reading, and
// the evidence manifest says so in words. the low-light palette applies gain and
// gamma to pixels that were actually captured — it does not hallucinate detail.
// the edge palette is a sobel pass used to make posture and carried-object
// outlines legible in a printed report.

export type FilterMode = "clean" | "colorized" | "thermal" | "spectral" | "lowlight" | "edge";
export type PaletteMode = FilterMode;

export const FILTER_MODES: Array<{ id: FilterMode; label: string; note: string }> = [
  { id: "clean", label: "optical palette", note: "unmodified optical frame straight off the sensor" },
  { id: "colorized", label: "colorized palette", note: "the optical hud's working view — per-channel auto-levels, saturation and a light unsharp pass on the real pixels, so people, clothing and carried objects stay legible for a reviewer" },
  { id: "spectral", label: "spectral palette", note: "channel-ratio material map — living tissue, coated synthetics and wet surfaces separate; not a calibrated infrared band" },
  { id: "thermal", label: "thermal palette", note: "visible-light luminance mapped to an iron palette — not an infrared temperature reading" },
  { id: "lowlight", label: "low-light palette", note: "gain and gamma lift on the captured pixels — no detail is invented" },
  { id: "edge", label: "edge palette", note: "sobel outline pass for posture and carried-object legibility in print" },
];
export const PALETTE_MODES = FILTER_MODES;


/** 256-entry iron palette, r,g,b triplets. built once. */
const IRON: Uint8ClampedArray = (() => {
  const stops: Array<[number, number, number, number]> = [
    [0.0, 0, 0, 12],
    [0.22, 42, 0, 92],
    [0.42, 138, 20, 108],
    [0.6, 214, 66, 52],
    [0.78, 246, 152, 18],
    [0.92, 254, 226, 92],
    [1.0, 255, 255, 246],
  ];
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const k = (t - a[0]) / span;
    out[i * 3] = a[1] + (b[1] - a[1]) * k;
    out[i * 3 + 1] = a[2] + (b[2] - a[2]) * k;
    out[i * 3 + 2] = a[3] + (b[3] - a[3]) * k;
  }
  return out;
})();

function luma(r: number, g: number, b: number): number {
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) | 0;
}

/** iron-palette map of per-pixel luminance, auto-levelled across the frame. */
export function applyThermal(src: ImageData): ImageData {
  const d = src.data;
  const n = d.length;
  let lo = 255;
  let hi = 0;
  const lum = new Uint8ClampedArray(n / 4);
  for (let p = 0, i = 0; p < n; p += 4, i++) {
    const v = luma(d[p], d[p + 1], d[p + 2]);
    lum[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(1, hi - lo);
  const out = new ImageData(src.width, src.height);
  const o = out.data;
  for (let p = 0, i = 0; p < n; p += 4, i++) {
    const v = (((lum[i] - lo) * 255) / span) | 0;
    const c = (v < 0 ? 0 : v > 255 ? 255 : v) * 3;
    o[p] = IRON[c];
    o[p + 1] = IRON[c + 1];
    o[p + 2] = IRON[c + 2];
    o[p + 3] = 255;
  }
  return out;
}

/** gain + gamma lift, weighted toward the green channel the sensor reads best. */
export function applyLowLight(src: ImageData, gain = 2.1, gamma = 0.62): ImageData {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, 255 * Math.pow(Math.min(1, (i / 255) * gain), gamma));
  }
  const out = new ImageData(src.width, src.height);
  const d = src.data;
  const o = out.data;
  for (let p = 0; p < d.length; p += 4) {
    const v = lut[luma(d[p], d[p + 1], d[p + 2])];
    o[p] = v * 0.32;
    o[p + 1] = v;
    o[p + 2] = v * 0.38;
    o[p + 3] = 255;
  }
  return out;
}

/** sobel magnitude, inverted to dark-on-light so it survives printing. */
export function applyEdge(src: ImageData): ImageData {
  const { width: w, height: h } = src;
  const d = src.data;
  const gray = new Float32Array(w * h);
  for (let p = 0, i = 0; p < d.length; p += 4, i++) gray[i] = luma(d[p], d[p + 1], d[p + 2]);
  const out = new ImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255;
        o[i * 4 + 3] = 255;
        continue;
      }
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const m = Math.min(255, Math.hypot(gx, gy));
      const v = 255 - m;
      o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v;
      o[i * 4 + 3] = 255;
    }
  }
  return out;
}

/** channel-ratio material map — the same pass the optical hud runs, so the two
 * rooms read a scene identically. it separates surfaces whose red-to-visible
 * and green-to-red ratios differ (tissue and foliage run warm, most coated
 * synthetics run cold, glass and standing water lift the middle). it is derived
 * from the camera's own three channels — not a calibrated infrared band. */
export function applySpectral(src: ImageData): ImageData {
  const { width: w, height: h } = src;
  const d = src.data;
  const n = w * h;
  const lum = new Float32Array(n);
  const nd = new Float32Array(n);
  const wd = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const vis = (g + b) / 2;
    nd[i] = (r - vis) / (r + vis + 0.004);
    wd[i] = (g - r) / (g + r + 0.004);
  }
  const out = new ImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      const edge = x > 0 && x < w - 1 && y > 0 && y < h - 1
        ? Math.min(0.5, (Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w])) * 0.85)
        : 0;
      const base = 0.15 + 0.68 * Math.pow(lum[i], 0.85);
      let cr = base, cg = base, cb = base;
      const warm = nd[i], cool = -nd[i], wet = wd[i];
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
  return out;
}

/** colorized — the optical hud's working view.
 *
 * this is the same three channels the sensor handed back, made legible: each
 * channel is stretched between its own 1st and 99th percentile so a dim or
 * colour-cast room stops hiding clothing and carried objects, saturation is
 * lifted a little around the pixel's own luminance, and a light unsharp pass
 * recovers edge definition the jpeg path softens. no pixel is invented and no
 * spatial detail is synthesised — a reviewer is looking at what the camera saw,
 * printed properly. */
export function applyColorized(src: ImageData, saturation = 1.22, sharpen = 0.5): ImageData {
  const { width: w, height: h } = src;
  const d = src.data;
  const n = w * h;
  // per-channel percentile levels from a histogram (cheap, order-independent).
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let p = 0; p < d.length; p += 4) {
    hist[0][d[p]]++; hist[1][d[p + 1]]++; hist[2][d[p + 2]]++;
  }
  const cut = Math.max(1, Math.round(n * 0.01));
  const lut: Uint8ClampedArray[] = [];
  for (let c = 0; c < 3; c++) {
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[c][i]; if (acc >= cut) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[c][i]; if (acc >= cut) { hi = i; break; } }
    if (hi - lo < 8) { lo = 0; hi = 255; }
    const span = hi - lo || 1;
    const t = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) t[i] = ((i - lo) * 255) / span;
    lut.push(t);
  }

  const levelled = new Uint8ClampedArray(n * 3);
  for (let p = 0, i = 0; p < d.length; p += 4, i += 3) {
    const r = lut[0][d[p]], g = lut[1][d[p + 1]], b = lut[2][d[p + 2]];
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    levelled[i] = l + (r - l) * saturation;
    levelled[i + 1] = l + (g - l) * saturation;
    levelled[i + 2] = l + (b - l) * saturation;
  }

  const out = new ImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      const s = i * 3;
      const inner = x > 0 && y > 0 && x < w - 1 && y < h - 1;
      for (let c = 0; c < 3; c++) {
        const v = levelled[s + c];
        if (!inner || sharpen <= 0) { o[p + c] = v; continue; }
        const blur = (
          levelled[(i - w) * 3 + c] + levelled[(i + w) * 3 + c] +
          levelled[(i - 1) * 3 + c] + levelled[(i + 1) * 3 + c]
        ) / 4;
        o[p + c] = v + (v - blur) * sharpen;
      }
      o[p + 3] = 255;
    }
  }
  return out;
}

export function applyFilter(src: ImageData, mode: FilterMode): ImageData {
  switch (mode) {
    case "colorized": return applyColorized(src);
    case "thermal": return applyThermal(src);
    case "spectral": return applySpectral(src);
    case "lowlight": return applyLowLight(src);
    case "edge": return applyEdge(src);
    default: return src;
  }
}


/** draw a source (video or canvas) into a fresh canvas at a bounded size. */
export function grabCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxWidth = 1280,
): HTMLCanvasElement {
  const scale = width > maxWidth ? maxWidth / width : 1;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width * scale));
  c.height = Math.max(1, Math.round(height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (ctx) ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

export function filteredCanvas(base: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  if (mode === "clean") return base;
  const ctx = base.getContext("2d", { willReadFrequently: true });
  if (!ctx) return base;
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const octx = out.getContext("2d");
  if (!octx) return base;
  octx.putImageData(applyFilter(ctx.getImageData(0, 0, base.width, base.height), mode), 0, 0);
  return out;
}
