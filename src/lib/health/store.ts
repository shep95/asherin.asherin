// the health record is held on this device only. it is never uploaded by this room, which
// is the single most important property of a health surface a person will actually use.
import type { LabValue } from "./labs";
import type { MedicationEntry } from "./medications";
import type { GeneEntry } from "./genetics";
import type { ExposureEntry, FamilyEntry, NutritionEntry, SurgeryEntry } from "./records";
import type { PainReport } from "./pain";
import type { SymptomEntry } from "./symptoms";
import type { Finding } from "./model";
import type { PhotoRead } from "./photoRead";

/** which reference body the room draws and reasons against. */
export type ReferenceSex = "male" | "female";

export interface HealthSettings {
  referenceSex: ReferenceSex;
  /** plain language by default; anatomical shows the formal terms alongside. */
  detailLevel: "plain" | "anatomical";
  /** life phase used by the aging layer. null means "use my age if it is known". */
  lifePhase: string | null;
}

export const DEFAULT_SETTINGS: HealthSettings = {
  referenceSex: "male",
  detailLevel: "plain",
  lifePhase: null,
};

/** a saved reading of the whole record at a moment, so change can be shown over time. */
export interface TimelineSnapshot {
  id: string;
  at: string;
  label: string;
  note?: string;
  findings: Finding[];
  metrics: Record<string, number>;
}

/** an imported wearable/continuous series. every point carries the source it came from. */
export interface WearableSeries {
  id: string;
  kind:
    | "hrv"
    | "resting-heart-rate"
    | "sleep"
    | "spo2"
    | "glucose"
    | "steps"
    | "temperature"
    | "respiration"
    | "weight";
  source: string;
  unit: string;
  points: { t: string; v: number; tag?: string }[];
  importedAt: string;
}

/** one recorded live-sensor session (device contact only — never synthesised). */
export interface LiveSessionRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  mode: "focus" | "rest" | "meditation" | "sleep" | "open";
  /** which signals actually had a device behind them for this session. */
  sources: string[];
  metrics: Record<string, number>;
  /** metrics captured during the pre-session baseline window, before recording began. */
  baseline: Record<string, number>;
  events: { at: string; kind: string; detail: string }[];
  summary: string;
}

export interface HealthRecord {
  version: 1;
  updatedAt: string;
  settings: HealthSettings;
  labs: LabValue[];
  medications: MedicationEntry[];
  genes: GeneEntry[];
  nutrition: NutritionEntry[];
  exposures: ExposureEntry[];
  surgeries: SurgeryEntry[];
  family: FamilyEntry[];
  pain: PainReport[];
  symptoms: SymptomEntry[];
  herbs: string[];
  /** free-form photograph read-outs: what the person handed over and what came back. */
  photoReads: PhotoRead[];
  snapshots: TimelineSnapshot[];
  wearables: WearableSeries[];
  sessions: LiveSessionRecord[];
}

export const EMPTY_RECORD: HealthRecord = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  settings: DEFAULT_SETTINGS,
  labs: [],
  medications: [],
  genes: [],
  nutrition: [],
  exposures: [],
  surgeries: [],
  family: [],
  pain: [],
  symptoms: [],
  herbs: [],
  photoReads: [],
  snapshots: [],
  wearables: [],
  sessions: [],
};


const KEY_PREFIX = "asherin.health.record";

function storageKey(scope: string | null): string {
  return scope ? `${KEY_PREFIX}.${scope}` : KEY_PREFIX;
}

export function loadRecord(scope: string | null): HealthRecord {
  if (typeof localStorage === "undefined") return EMPTY_RECORD;
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return EMPTY_RECORD;
    const parsed = JSON.parse(raw) as Partial<HealthRecord>;
    if (parsed.version !== 1) return EMPTY_RECORD;
    // older records carry fields from earlier builds; merge defaults so a
    // saved record still opens instead of resetting.
    return {
      ...EMPTY_RECORD,
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      photoReads: parsed.photoReads ?? [],
      snapshots: parsed.snapshots ?? [],
      wearables: parsed.wearables ?? [],
      sessions: parsed.sessions ?? [],
      version: 1,
    };
  } catch {
    return EMPTY_RECORD;
  }
}

export function saveRecord(scope: string | null, record: HealthRecord): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify({ ...record, updatedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearRecord(scope: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    /* storage may be blocked; the in-memory record still applies for this session. */
  }
}

export function exportRecord(record: HealthRecord): string {
  return JSON.stringify(record, null, 2);
}

export function importRecord(text: string): { record: HealthRecord | null; error: string | null } {
  try {
    const parsed = JSON.parse(text) as Partial<HealthRecord>;
    if (parsed.version !== 1) return { record: null, error: "that file is not an asherin.health export." };
    return {
      record: {
        ...EMPTY_RECORD,
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      photoReads: parsed.photoReads ?? [],
        snapshots: parsed.snapshots ?? [],
        wearables: parsed.wearables ?? [],
        sessions: parsed.sessions ?? [],
        version: 1,
      },
      error: null,
    };
  } catch {
    return { record: null, error: "that file could not be read as json." };
  }
}

export function recordCount(record: HealthRecord): number {
  return (
    record.labs.length +
    record.medications.length +
    record.genes.length +
    record.nutrition.length +
    record.exposures.length +
    record.surgeries.length +
    record.family.length +
    record.pain.length +
    record.symptoms.length +
    record.herbs.length +
    record.snapshots.length +
    record.wearables.length +
    record.sessions.length
  );
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}
