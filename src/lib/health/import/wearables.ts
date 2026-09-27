// client-side import of continuous wearable/CGM data into WearableSeries. every parser
// here only reads text/xml already in the browser — nothing is uploaded by this module.
import type { WearableSeries } from "../store";
import type { Finding } from "../model";

const MAX_POINTS_PER_SERIES = 5000;

type SeriesKind = WearableSeries["kind"];

const HK_TYPE_MAP: Record<string, { kind: SeriesKind; unit: string }> = {
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { kind: "hrv", unit: "ms" },
  HKQuantityTypeIdentifierRestingHeartRate: { kind: "resting-heart-rate", unit: "bpm" },
  HKQuantityTypeIdentifierOxygenSaturation: { kind: "spo2", unit: "%" },
  HKQuantityTypeIdentifierRespiratoryRate: { kind: "respiration", unit: "breaths/min" },
  HKQuantityTypeIdentifierBodyMass: { kind: "weight", unit: "kg" },
  HKQuantityTypeIdentifierStepCount: { kind: "steps", unit: "steps" },
  HKQuantityTypeIdentifierBodyTemperature: { kind: "temperature", unit: "°C" },
  HKCategoryTypeIdentifierSleepAnalysis: { kind: "sleep", unit: "hours" },
};

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function parseDate(raw: string): number | null {
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return t;
  // some exports use "YYYY-MM-DD HH:MM:SS" without a T
  const t2 = Date.parse(raw.replace(" ", "T"));
  return Number.isNaN(t2) ? null : t2;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function dedupeSort(points: { t: string; v: number; tag?: string }[]): { t: string; v: number; tag?: string }[] {
  const map = new Map<string, { t: string; v: number; tag?: string }>();
  for (const p of points) map.set(p.t, p);
  return [...map.values()].sort((a, b) => a.t.localeCompare(b.t));
}

/** downsample to daily min/max/mean if a series exceeds the cap, so the tab keeps a
 * usable shape without holding every raw sample. */
function capSeries(points: { t: string; v: number; tag?: string }[]): { t: string; v: number; tag?: string }[] {
  if (points.length <= MAX_POINTS_PER_SERIES) return points;
  const byDay = new Map<string, number[]>();
  for (const p of points) {
    const day = p.t.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(p.v);
    byDay.set(day, arr);
  }
  const out: { t: string; v: number; tag?: string }[] = [];
  for (const [day, values] of byDay) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    out.push({ t: `${day}T00:00:00.000Z`, v: Number(mean.toFixed(2)), tag: "mean" });
    if (values.length > 1) {
      out.push({ t: `${day}T00:00:01.000Z`, v: min, tag: "min" });
      out.push({ t: `${day}T00:00:02.000Z`, v: max, tag: "max" });
    }
  }
  return dedupeSort(out).slice(-MAX_POINTS_PER_SERIES);
}

function guessKindFromHeader(name: string): SeriesKind | null {
  const n = name.toLowerCase();
  if (/hrv|sdnn/.test(n)) return "hrv";
  if (/resting.*heart|rhr/.test(n)) return "resting-heart-rate";
  if (/spo2|oxygen/.test(n)) return "spo2";
  if (/glucose|cgm|dexcom|libre/.test(n)) return "glucose";
  if (/step/.test(n)) return "steps";
  if (/temp/.test(n)) return "temperature";
  if (/resp/.test(n)) return "respiration";
  if (/weight|mass/.test(n)) return "weight";
  if (/sleep/.test(n)) return "sleep";
  return null;
}

interface CsvParse {
  series: WearableSeries[];
  skipped: string[];
}

async function parseGenericCsv(name: string, text: string, source: string): Promise<CsvParse> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const skipped: string[] = [];
  if (lines.length < 2) return { series: [], skipped: ["file has no data rows"] };
  const delim = detectDelimiter(lines[0]);
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/"/g, ""));

  const timeIdx = header.findIndex((h) => /time|date|timestamp/.test(h));
  if (timeIdx === -1) return { series: [], skipped: ["no timestamp column was found"] };

  // gather every other numeric-looking column as a candidate series.
  const valueCols = header
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => idx !== timeIdx && h.length > 0);

  const seriesByCol = new Map<number, { t: string; v: number }[]>();
  for (const { idx } of valueCols) seriesByCol.set(idx, []);

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const ts = parseDate(cols[timeIdx]?.trim().replace(/"/g, "") ?? "");
    if (ts === null) {
      if (skipped.length < 20) skipped.push(`row ${i + 1}: unreadable timestamp`);
      continue;
    }
    for (const { idx } of valueCols) {
      const raw = cols[idx]?.trim().replace(/"/g, "");
      if (!raw) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      seriesByCol.get(idx)!.push({ t: new Date(ts).toISOString(), v });
    }
    if (i % 3000 === 0) await tick();
  }

  const series: WearableSeries[] = [];
  for (const { h, idx } of valueCols) {
    const pts = seriesByCol.get(idx) ?? [];
    if (pts.length === 0) continue;
    const kind = guessKindFromHeader(h);
    if (!kind) {
      skipped.push(`column "${h}" could not be matched to a known series type and was left out`);
      continue;
    }
    const unitMatch = /\(([^)]+)\)/.exec(h);
    series.push({
      id: `wearable-${kind}-${Date.now()}-${idx}`,
      kind,
      source,
      unit: unitMatch?.[1] ?? "",
      points: capSeries(dedupeSort(pts)),
      importedAt: new Date().toISOString(),
    });
  }
  return { series, skipped };
}

async function parseAppleHealthXml(text: string, source: string): Promise<CsvParse> {
  const skipped: string[] = [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("xml parse error");
  } catch {
    return { series: [], skipped: ["that xml file could not be parsed"] };
  }
  const buckets = new Map<SeriesKind, { unit: string; points: { t: string; v: number }[] }>();

  const records = doc.getElementsByTagName("Record");
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const type = rec.getAttribute("type") ?? "";
    const mapping = HK_TYPE_MAP[type];
    if (!mapping) continue;
    const startDate = rec.getAttribute("startDate");
    const valueAttr = rec.getAttribute("value");
    if (!startDate) continue;
    const ts = parseDate(startDate);
    if (ts === null) continue;
    let v: number;
    if (mapping.kind === "sleep") {
      const endDate = rec.getAttribute("endDate");
      const end = endDate ? parseDate(endDate) : null;
      if (end === null) continue;
      v = Number(((end - ts) / 3_600_000).toFixed(2));
    } else {
      v = Number(valueAttr);
      if (!Number.isFinite(v)) continue;
    }
    const bucket = buckets.get(mapping.kind) ?? { unit: mapping.unit, points: [] };
    bucket.points.push({ t: new Date(ts).toISOString(), v });
    buckets.set(mapping.kind, bucket);
    if (i % 4000 === 0) await tick();
  }

  const series: WearableSeries[] = [];
  for (const [kind, bucket] of buckets) {
    series.push({
      id: `wearable-${kind}-${Date.now()}`,
      kind,
      source,
      unit: bucket.unit,
      points: capSeries(dedupeSort(bucket.points)),
      importedAt: new Date().toISOString(),
    });
  }
  if (series.length === 0) skipped.push("no recognised apple health quantity types were found");
  return { series, skipped };
}

export interface WearableParseResult {
  series: WearableSeries[];
  skipped: string[];
  error: string | null;
}

/** parse a wearable/CGM export file. detects apple health xml vs generic/branded csv. */
export async function parseWearableFile(name: string, text: string): Promise<WearableParseResult> {
  if (text.length === 0) return { series: [], skipped: [], error: "that file is empty." };
  const lower = name.toLowerCase();
  const isXml = lower.endsWith(".xml") || text.trimStart().startsWith("<?xml");
  const source = lower.includes("oura")
    ? "oura"
    : lower.includes("whoop")
      ? "whoop"
      : lower.includes("dexcom")
        ? "dexcom"
        : lower.includes("libre")
          ? "libre"
          : isXml
            ? "apple health"
            : "csv import";

  try {
    if (isXml) {
      const { series, skipped } = await parseAppleHealthXml(text, source);
      return { series, skipped, error: series.length === 0 ? "no readable series were found in that export." : null };
    }
    const { series, skipped } = await parseGenericCsv(name, text, source);
    return { series, skipped, error: series.length === 0 ? "no readable series were found in that file." : null };
  } catch {
    return { series: [], skipped: [], error: "that file could not be read." };
  }
}

// ---- analysis: baselines, trend, findings ----

export interface Baseline {
  mean: number;
  stdDev: number;
  n: number;
}

/** rolling personal baseline over the most recent window of points. */
export function rollingBaseline(series: WearableSeries, windowDays = 30): Baseline {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const values = series.points.filter((p) => new Date(p.t).getTime() >= cutoff).map((p) => p.v);
  if (values.length === 0) return { mean: 0, stdDev: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean: Number(mean.toFixed(2)), stdDev: Number(Math.sqrt(variance).toFixed(2)), n: values.length };
}

export type TrendDirection = "rising" | "falling" | "flat" | "unknown";

/** compares the most recent third of points against the earliest third. */
export function trendDirection(series: WearableSeries): TrendDirection {
  if (series.points.length < 6) return "unknown";
  const third = Math.max(1, Math.floor(series.points.length / 3));
  const early = series.points.slice(0, third).map((p) => p.v);
  const recent = series.points.slice(-third).map((p) => p.v);
  const earlyMean = early.reduce((a, b) => a + b, 0) / early.length;
  const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const span = Math.max(Math.abs(earlyMean), 1e-6);
  const change = (recentMean - earlyMean) / span;
  if (Math.abs(change) < 0.05) return "flat";
  return change > 0 ? "rising" : "falling";
}

/** how many standard deviations the latest point sits from the person's own baseline. */
export function deviationFromBaseline(series: WearableSeries): number | null {
  if (series.points.length === 0) return null;
  const baseline = rollingBaseline(series);
  if (baseline.n === 0 || baseline.stdDev === 0) return null;
  const latest = series.points[series.points.length - 1].v;
  return Number(((latest - baseline.mean) / baseline.stdDev).toFixed(2));
}

const KIND_LABEL: Record<SeriesKind, string> = {
  hrv: "heart rate variability",
  "resting-heart-rate": "resting heart rate",
  sleep: "sleep duration",
  spo2: "oxygen saturation",
  glucose: "glucose",
  steps: "step count",
  temperature: "body temperature",
  respiration: "respiratory rate",
  weight: "body weight",
};

const KIND_TERRITORY: Record<SeriesKind, string[]> = {
  hrv: ["heart", "brainstem"],
  "resting-heart-rate": ["heart"],
  sleep: ["hypothalamus", "pineal"],
  spo2: ["lung", "heart"],
  glucose: ["pancreas", "liver"],
  steps: ["muscle", "heart"],
  temperature: ["hypothalamus"],
  respiration: ["lung"],
  weight: ["muscle", "liver"],
};

/** deviation-from-personal-baseline findings, generated only from the person's own series. */
export function wearableFindings(series: WearableSeries[]): Finding[] {
  const out: Finding[] = [];
  for (const s of series) {
    if (s.points.length < 6) continue;
    const dev = deviationFromBaseline(s);
    if (dev === null || Math.abs(dev) < 1.5) continue;
    const direction = dev > 0 ? "elevated" : "low";
    const label = KIND_LABEL[s.kind];
    out.push({
      id: `wearable:${s.id}`,
      layer: "lab",
      label: `${label} is running ${direction} against your own recent baseline`,
      detail: `the latest reading sits ${Math.abs(dev).toFixed(1)} standard deviations ${direction === "elevated" ? "above" : "below"} your ${s.points.length}-point rolling baseline from ${s.source}.`,
      mechanism: "this compares you against yourself over time, not against a population reference — sustained shifts are more meaningful than one reading.",
      nextStep: "if this persists over several days, mention it to a clinician alongside how you have been sleeping, training and eating.",
      territoryKeys: KIND_TERRITORY[s.kind],
      direction,
      weight: Math.min(0.8, 0.3 + Math.abs(dev) * 0.1),
      source: `${s.source} · ${label}`,
    });
  }
  return out;
}
