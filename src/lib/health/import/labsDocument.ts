// unit-aware normalisation of pasted lab reports, built on top of the existing
// parseLabText matcher. adds unit conversion, reference-range capture and a
// best-effort collection date, all from the text the person pasted — nothing invented.
import { parseLabText, labDef, type LabValue } from "../labs";

export interface NormalisedLabValue extends LabValue {
  rawValue: number;
  rawUnit?: string;
  refLow?: number;
  refHigh?: number;
}

export interface LabDocumentResult {
  values: NormalisedLabValue[];
  unrecognised: string[];
  collectedAt: string | null;
}

/** conversion factors into the unit each LabDef already uses. */
const UNIT_CONVERSIONS: Record<string, { to: string; factor: number }[]> = {
  glucose: [{ to: "mg/dL", factor: 18.0182 }], // mmol/L -> mg/dL
  hba1c: [],
  ldl: [{ to: "mg/dL", factor: 38.67 }], // mmol/L -> mg/dL
  hdl: [{ to: "mg/dL", factor: 38.67 }],
  triglycerides: [{ to: "mg/dL", factor: 88.57 }],
  "vitamin-d": [{ to: "ng/mL", factor: 0.4 }], // nmol/L -> ng/mL (divide by 2.5 == * 0.4)
  b12: [{ to: "pg/mL", factor: 0.738 }], // pmol/L -> pg/mL
  creatinine: [{ to: "mg/dL", factor: 0.0113 }], // umol/L -> mg/dL
};

const MMOL_UNITS = new Set(["mmol/l", "mmol/L"]);
const NMOL_UNITS = new Set(["nmol/l", "nmol/L"]);
const UMOL_UNITS = new Set(["umol/l", "µmol/l", "umol/L"]);
const PMOL_UNITS = new Set(["pmol/l", "pmol/L"]);

function detectUnitForLine(line: string): string | null {
  const m = line.match(/\b(mmol\/l|nmol\/l|umol\/l|µmol\/l|pmol\/l|mg\/dl|ng\/ml|pg\/ml|g\/dl|u\/l|iu\/l|%|miu\/l)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/** converts a raw value + detected unit into the unit LabDef expects for a given key. */
function convert(key: string, rawValue: number, rawUnit: string | null): { value: number; converted: boolean } {
  if (!rawUnit) return { value: rawValue, converted: false };
  const isMolar = MMOL_UNITS.has(rawUnit) || NMOL_UNITS.has(rawUnit) || UMOL_UNITS.has(rawUnit) || PMOL_UNITS.has(rawUnit);
  if (!isMolar) return { value: rawValue, converted: false };
  const rule = UNIT_CONVERSIONS[key]?.[0];
  if (!rule) return { value: rawValue, converted: false };
  return { value: Number((rawValue * rule.factor).toFixed(2)), converted: true };
}

/** captures a reference range like "70-99" or "70 - 99 mg/dL" near the matched value. */
function captureRefRange(line: string): { low?: number; high?: number } {
  const m = line.match(/\(?\s*([0-9]+(?:\.[0-9]+)?)\s*[-–to]{1,3}\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/);
  if (!m) return {};
  const low = Number(m[1]);
  const high = Number(m[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) return {};
  return { low, high };
}

const DATE_PATTERNS = [
  /\b(\d{4}-\d{2}-\d{2})\b/,
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
  /collected[:\s]+([a-z0-9,\s]+\d{4})/i,
  /date of (?:collection|service)[:\s]+([a-z0-9,\s]+\d{4})/i,
];

function detectCollectionDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const parsed = Date.parse(m[1].trim());
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
  }
  return null;
}

/** normalise a pasted lab report: reuses parseLabText for detection, then adds unit
 * conversion, reference-range capture, and a best-effort collection date. */
export function normaliseLabDocument(text: string): LabDocumentResult {
  const { values, unrecognised } = parseLabText(text);
  const lines = text.split(/\r?\n/);
  const collectedAt = detectCollectionDate(text);

  const normalised: NormalisedLabValue[] = values.map((v) => {
    const def = labDef(v.key);
    const matchingLine = lines.find((l) => def?.aliases.some((a) => l.toLowerCase().includes(a)) && l.includes(String(v.value)));
    const rawUnit = matchingLine ? detectUnitForLine(matchingLine) : null;
    const { value, converted } = convert(v.key, v.value, rawUnit);
    const range = matchingLine ? captureRefRange(matchingLine) : {};
    return {
      key: v.key,
      value,
      rawValue: v.value,
      rawUnit: converted ? rawUnit ?? undefined : undefined,
      refLow: range.low,
      refHigh: range.high,
    };
  });

  return { values: normalised, unrecognised, collectedAt };
}
