// asherin.arvision — evidence gated radio localization.
//
// The honest physics: received signal strength is a noisy, reflection-ridden
// proxy for distance. One receiver hearing one advertisement can say "somewhere
// within roughly this many metres of this antenna" and nothing more. A door, a
// body, a filing cabinet or a hand over a phone moves the reading by tens of
// decibels. Drawing a tight box on a camera from one antenna is fiction.
//
// So the mode is decided by the receivers, never by the wish for a marker:
//   • no surveyed receiver              -> none, and the reason is printed
//   • one surveyed receiver             -> range only, a radius, no bearing
//   • two surveyed receivers            -> range only, because the solution is
//                                          a circle, not a point
//   • three or more calibrated surveyed -> multilateration with a residual
//     receivers with fresh observations    derived uncertainty radius

import type { BleLocalization, BleObservation, BleScanner } from "./types";

/** An observation older than this is not evidence about where anything is now. */
export const OBSERVATION_STALE_MS = 15_000;
/** Scanner clocks beyond this offset are not trusted for fusion. */
export const CLOCK_SKEW_LIMIT_MS = 5_000;

export function rssiToMeters(rssi: number, txRefDbm: number, pathLossN: number): number {
  if (!Number.isFinite(rssi) || !Number.isFinite(txRefDbm)) return NaN;
  const n = Math.min(4.5, Math.max(1.6, pathLossN));
  return Math.max(0.1, Math.min(120, Math.pow(10, (txRefDbm - rssi) / (10 * n))));
}

/** Range uncertainty grows with distance and with sample spread. */
function rangeUncertainty(distanceM: number, samples: number[], pathLossN: number): number {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  const sigmaDb = Math.max(3, Math.sqrt(variance));
  // differentiate the path loss model: dd/dRSSI = d * ln(10) / (10n)
  const perDb = (distanceM * Math.LN10) / (10 * Math.min(4.5, Math.max(1.6, pathLossN)));
  return Math.round(Math.max(0.5, perDb * sigmaDb) * 10) / 10;
}

interface Anchor {
  scanner: BleScanner;
  distanceM: number;
  samples: number[];
}

function buildAnchors(observations: BleObservation[], scanners: Map<string, BleScanner>, nowMs: number): {
  anchors: Anchor[];
  rejected: string[];
} {
  const grouped = new Map<string, BleObservation[]>();
  const rejected: string[] = [];
  for (const o of observations) {
    if (nowMs - o.receivedAtMs > OBSERVATION_STALE_MS) continue;
    if (Math.abs(o.receivedAtMs - o.atMs) > CLOCK_SKEW_LIMIT_MS) {
      rejected.push(`scanner ${o.scannerId} was excluded: its clock differs from this session by ${Math.round(Math.abs(o.receivedAtMs - o.atMs) / 1000)}s`);
      continue;
    }
    const list = grouped.get(o.scannerId) ?? [];
    list.push(o);
    grouped.set(o.scannerId, list);
  }

  const anchors: Anchor[] = [];
  for (const [scannerId, list] of grouped) {
    const scanner = scanners.get(scannerId);
    if (!scanner) {
      rejected.push(`observations from ${scannerId} were excluded: that scanner is not in the authorized scanner list`);
      continue;
    }
    const samples = list.slice(-8).map((o) => o.rssi);
    if (!scanner.calibrated || scanner.txRefDbm === null || scanner.pathLossN === null) {
      rejected.push(`${scanner.label} cannot produce a distance: it has no measured one metre reference or path loss exponent`);
      continue;
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    anchors.push({ scanner, distanceM: rssiToMeters(avg, scanner.txRefDbm, scanner.pathLossN), samples });
  }
  return { anchors, rejected };
}

/** Gauss-Newton least squares on the sphere equations, seeded at the centroid. */
function solve(anchors: Anchor[]): { position: { x: number; y: number; z: number }; residualM: number } | null {
  const positioned = anchors.filter((a) => a.scanner.position);
  if (positioned.length < 3) return null;
  let x = positioned.reduce((s, a) => s + a.scanner.position!.x, 0) / positioned.length;
  let y = positioned.reduce((s, a) => s + a.scanner.position!.y, 0) / positioned.length;
  let z = positioned.reduce((s, a) => s + a.scanner.position!.z, 0) / positioned.length;

  for (let iter = 0; iter < 40; iter += 1) {
    let gx = 0, gy = 0, gz = 0, hx = 0, hy = 0, hz = 0;
    for (const a of positioned) {
      const p = a.scanner.position!;
      const dx = x - p.x, dy = y - p.y, dz = z - p.z;
      const r = Math.max(0.05, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const err = r - a.distanceM;
      const w = 1 / Math.max(0.5, a.distanceM);
      gx += w * err * (dx / r); gy += w * err * (dy / r); gz += w * err * (dz / r);
      hx += w; hy += w; hz += w;
    }
    const step = 0.6;
    const nx = x - (step * gx) / Math.max(1e-6, hx);
    const ny = y - (step * gy) / Math.max(1e-6, hy);
    const nz = z - (step * gz) / Math.max(1e-6, hz);
    const moved = Math.hypot(nx - x, ny - y, nz - z);
    x = nx; y = ny; z = nz;
    if (moved < 1e-4) break;
  }

  let sq = 0;
  for (const a of positioned) {
    const p = a.scanner.position!;
    const r = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2);
    sq += (r - a.distanceM) ** 2;
  }
  return { position: { x, y, z }, residualM: Math.sqrt(sq / positioned.length) };
}

export function localizeDevice(
  observations: BleObservation[],
  scanners: Map<string, BleScanner>,
  nowMs: number = Date.now(),
): BleLocalization {
  const { anchors, rejected } = buildAnchors(observations, scanners, nowMs);
  const evidence = [...rejected];

  if (anchors.length === 0) {
    return {
      mode: "none",
      position: null,
      rangeM: null,
      uncertaintyM: null,
      scannerCount: 0,
      evidence,
      limitation:
        "no calibrated scanner produced a fresh observation of this device, so neither a range nor a position can be stated",
    };
  }

  const positioned = anchors.filter((a) => a.scanner.position);
  if (positioned.length >= 3) {
    const solved = solve(anchors);
    if (solved) {
      const surveyError = Math.max(...positioned.map((a) => a.scanner.positionAccuracyM ?? 1));
      const spread = Math.max(
        ...positioned.map((a) => rangeUncertainty(a.distanceM, a.samples, a.scanner.pathLossN ?? 2.4)),
      );
      const uncertaintyM = Math.round((Math.hypot(solved.residualM, surveyError, spread * 0.5)) * 10) / 10;
      evidence.push(
        `${positioned.length} calibrated surveyed scanners contributed distances: ${positioned
          .map((a) => `${a.scanner.label} ${a.distanceM.toFixed(1)}m`)
          .join(", ")}`,
        `least squares residual ${solved.residualM.toFixed(2)}m, worst survey accuracy ${surveyError.toFixed(1)}m`,
      );
      return {
        mode: "multilateration",
        position: solved.position,
        rangeM: null,
        uncertaintyM,
        scannerCount: positioned.length,
        evidence,
        limitation: "",
      };
    }
  }

  const nearest = anchors.reduce((a, b) => (a.distanceM <= b.distanceM ? a : b));
  const uncertaintyM = rangeUncertainty(nearest.distanceM, nearest.samples, nearest.scanner.pathLossN ?? 2.4);
  evidence.push(
    `${nearest.scanner.label} measured a mean received strength of ${(
      nearest.samples.reduce((a, b) => a + b, 0) / nearest.samples.length
    ).toFixed(1)} dBm across ${nearest.samples.length} advertisements`,
  );
  return {
    mode: "range_only",
    position: null,
    rangeM: Math.round(nearest.distanceM * 10) / 10,
    uncertaintyM,
    scannerCount: anchors.length,
    evidence,
    limitation:
      anchors.length >= 2
        ? "two receivers narrow this to a ring, not a point. three surveyed calibrated receivers are required before a position may be drawn"
        : "a single receiver gives distance without direction. no position marker may be drawn from it",
  };
}
