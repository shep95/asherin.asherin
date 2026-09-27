// eagle.eye — thermal path.
//
// the correction this module exists for: colouring an ordinary rgb preview with
// an iron palette is a *picture*, not a measurement. a real thermal path is
//
//   sensor stream -> raw magnitude per pixel -> calibration -> temperature -> palette
//
// so the first job here is deciding which of those two paths a given camera can
// actually support, and never letting the second path wear the first one's
// clothes.
//
// what a browser can and cannot reach, stated plainly: getUserMedia hands back
// decoded 8-bit frames. it does not expose a Y16 radiometric stream, and there
// is no web api for a vendor's per-pixel temperature array. so:
//
//  - a usb/uvc thermal imager (boson, lepton, infiray/topdon, xtherm, seek,
//    flir one on android, hikmicro, guide) appears as its own video input. when
//    its stream is monochrome, every pixel is the sensor's own thermal magnitude
//    scaled to 8 bits — that is a genuine thermal signal, not visible light, and
//    two known reference points turn it into a temperature scale.
//  - when the imager outputs an already-palettized stream, the device has
//    consumed the magnitude itself; we pass its own colours through and refuse
//    to print temperatures, because inverting a vendor palette is guesswork.
//  - an ordinary webcam has no thermal signal at all. its "thermal" rendering
//    stays an estimate, labelled everywhere, with no numbers attached.
//
// the readout is only ever as good as the two references the operator gives it,
// and this module says so rather than implying factory calibration.

export type ThermalPath = "sensor" | "palettized" | "estimate";

export interface ThermalCalibration {
  /** 0-255 sensor magnitude at the cold reference */
  rawLow: number;
  /** measured temperature at that reference, celsius */
  tempLow: number;
  rawHigh: number;
  tempHigh: number;
}

export interface ThermalFrameStats {
  /** true when the stream carries no colour — the sensor's own magnitude */
  monochrome: boolean;
  minRaw: number;
  maxRaw: number;
  meanRaw: number;
  centreRaw: number;
}

const THERMAL_HINTS = [
  "thermal", "therm", "flir", "boson", "lepton", "seek", "infiray", "topdon",
  "hikmicro", "hti", "xtherm", "guide sensmart", "uni-t", "uti", "ircam",
  "radiometric", "lwir", "infrared",
];

/** a video input whose name matches a known thermal imager or says so outright. */
export function looksThermal(label: string): boolean {
  const l = label.toLowerCase();
  return THERMAL_HINTS.some((h) => l.includes(h));
}

/** how colourful the frame is decides whether raw magnitude survived the device. */
export function frameStats(src: ImageData): ThermalFrameStats {
  const d = src.data;
  const n = d.length;
  let min = 255;
  let max = 0;
  let sum = 0;
  let chroma = 0;
  let count = 0;
  // sample on a stride: a 256x192 imager is 49k pixels, and a quarter of them
  // answers the colour question with no visible cost in the render loop.
  for (let p = 0; p < n; p += 16) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    const v = (r * 0.2126 + g * 0.7152 + b * 0.0722) | 0;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    chroma += Math.max(r, g, b) - Math.min(r, g, b);
    count++;
  }
  const cx = src.width >> 1;
  const cy = src.height >> 1;
  const cp = (cy * src.width + cx) * 4;
  const centreRaw = (d[cp] * 0.2126 + d[cp + 1] * 0.7152 + d[cp + 2] * 0.0722) | 0;
  return {
    monochrome: count > 0 && chroma / count < 12,
    minRaw: min,
    maxRaw: max,
    meanRaw: count > 0 ? sum / count : 0,
    centreRaw,
  };
}

/** which of the three paths this camera and this frame can honestly support. */
export function resolvePath(deviceLooksThermal: boolean, stats: ThermalFrameStats | null): ThermalPath {
  if (!deviceLooksThermal) return "estimate";
  if (!stats) return "sensor";
  return stats.monochrome ? "sensor" : "palettized";
}

export const DEFAULT_CALIBRATION: ThermalCalibration = { rawLow: 40, tempLow: 20, rawHigh: 210, tempHigh: 37 };

/** two-point linear scale from sensor magnitude to celsius. */
export function rawToTemp(raw: number, cal: ThermalCalibration): number {
  const span = cal.rawHigh - cal.rawLow;
  if (Math.abs(span) < 1) return Number.NaN;
  const t = cal.tempLow + ((raw - cal.rawLow) * (cal.tempHigh - cal.tempLow)) / span;
  return Math.round(t * 10) / 10;
}

export function calibrationUsable(cal: ThermalCalibration): boolean {
  return Math.abs(cal.rawHigh - cal.rawLow) >= 1 && Math.abs(cal.tempHigh - cal.tempLow) >= 0.5;
}

/** 256-entry iron ramp, the ramp real imagers use: black cold to white hot. */
const IRON: Uint8ClampedArray = (() => {
  const stops: Array<[number, number, number]> = [
    [0, 0, 4], [62, 8, 96], [186, 26, 62], [255, 128, 0], [255, 226, 110], [255, 255, 250],
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

export interface ThermalRender {
  image: ImageData;
  stats: ThermalFrameStats;
  /** celsius, only when a usable calibration was supplied on a sensor stream */
  minTemp: number | null;
  maxTemp: number | null;
  centreTemp: number | null;
}

/**
 * sensor path. the incoming monochrome frame *is* the magnitude, so no
 * brightness cosmetics are applied: raw stays raw, the calibration turns it
 * into celsius, and the palette is a display of that scale — the numbers do not
 * come from the colours, the colours come from the numbers.
 */
export function renderSensorThermal(src: ImageData, cal: ThermalCalibration | null): ThermalRender {
  const stats = frameStats(src);
  const d = src.data;
  const out = new ImageData(src.width, src.height);
  const o = out.data;
  for (let p = 0; p < d.length; p += 4) {
    const raw = (d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722) | 0;
    const c = (raw < 0 ? 0 : raw > 255 ? 255 : raw) * 3;
    o[p] = IRON[c];
    o[p + 1] = IRON[c + 1];
    o[p + 2] = IRON[c + 2];
    o[p + 3] = 255;
  }
  const usable = cal !== null && calibrationUsable(cal);
  return {
    image: out,
    stats,
    minTemp: usable ? rawToTemp(stats.minRaw, cal) : null,
    maxTemp: usable ? rawToTemp(stats.maxRaw, cal) : null,
    centreTemp: usable ? rawToTemp(stats.centreRaw, cal) : null,
  };
}

export const PATH_NOTE: Record<ThermalPath, string> = {
  sensor: "thermal sensor stream — pixel values are the imager's own magnitude; temperatures come from your two reference points, not from a factory calibration",
  palettized: "this imager already applied its own palette, so its colours pass through untouched. temperatures are withheld: reversing a vendor palette would be a guess.",
  estimate: "no thermal sensor on this camera — this is a visible-light estimate rendered on the iron ramp. it measures nothing, cannot see through walls, and ordinary glass blocks it exactly as it blocks a real long-wave imager.",
};

export const PATH_LABEL: Record<ThermalPath, string> = {
  sensor: "thermal sensor",
  palettized: "imager palette",
  estimate: "visible-light estimate",
};
