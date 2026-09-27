// asherin.arvision — safety hub.
//
// One tab-level object holding what the radio scanners heard, what the
// configured rules fired on, which detectors are actually alive, and whether
// evidence has anywhere real to go. The registry feeds it from the edge bridge;
// the UI subscribes to it. Nothing enters it that a hardware adapter did not
// report, and every unavailable capability is stated rather than hidden behind
// an empty list.

import { BleTracker, LOST_AFTER_MS } from "../ble/tracker";
import type { BleAllowlistEntry, BleDeviceRecord, BleObservation, BleScanner, BleTimelineEvent } from "../ble/types";
import {
  createDetector,
  falsePositiveRate,
  heartbeat,
  recordFiring,
  sweepDetectors,
  type DetectorHealth,
} from "./detectors";
import {
  applyRetention,
  captureEvidence,
  DEFAULT_BUFFER_OPTIONS,
  RollingFrameBuffer,
  UNCONFIGURED_STORAGE,
  type EvidenceBundle,
  type EvidenceFrame,
  type EvidenceStorage,
} from "./evidenceCapture";
import { IncidentStore, type Incident, type ReviewState } from "./incidents";
import { defaultRules, evaluateSeverity, sanitizeRules, type RuleFiring, type SafetyRule } from "./rules";

export interface SafetySnapshot {
  scanners: BleScanner[];
  devices: BleDeviceRecord[];
  radioTimeline: BleTimelineEvent[];
  incidents: Incident[];
  detectors: DetectorHealth[];
  rules: SafetyRule[];
  rejectedRules: string[];
  bundles: EvidenceBundle[];
  storage: { configured: boolean; detail: string; retentionMs: number };
  bufferFrames: number;
  /** printed when no authorized scanner has ever reported. */
  radioAvailability: string;
  atMs: number;
}

const ALLOWLIST_KEY = "arvision.safety.allowlist.v1";
const RULES_KEY = "arvision.safety.rules.v1";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be denied; the session still works in memory */
  }
}

export class SafetyHub {
  private tracker = new BleTracker();
  private incidentStore = new IncidentStore();
  private detectors = new Map<string, DetectorHealth>();
  private buffer = new RollingFrameBuffer(DEFAULT_BUFFER_OPTIONS);
  private storage: EvidenceStorage = UNCONFIGURED_STORAGE;
  private bundles: EvidenceBundle[] = [];
  private rules: SafetyRule[] = [];
  private allowlist: BleAllowlistEntry[] = [];
  private listeners = new Set<(s: SafetySnapshot) => void>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sawScanner = false;

  constructor() {
    this.allowlist = loadJson<BleAllowlistEntry[]>(ALLOWLIST_KEY, []);
    this.rules = loadJson<SafetyRule[]>(RULES_KEY, defaultRules());
    this.tracker.setOptions({ allowlist: this.allowlist });
  }

  subscribe(fn: (s: SafetySnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  snapshot(): SafetySnapshot {
    const { rules, rejected } = sanitizeRules(this.rules);
    const fpCounts = this.incidentStore.falsePositiveCounts();
    return {
      scanners: this.tracker.scannerList(),
      devices: this.tracker.devicesList(),
      radioTimeline: this.tracker.timelineList(),
      incidents: this.incidentStore.list(),
      detectors: [...this.detectors.values()].map((d) => ({ ...d, falsePositives: fpCounts[d.id] ?? d.falsePositives })),
      rules,
      rejectedRules: rejected,
      bundles: this.bundles,
      storage: { configured: this.storage.configured, detail: this.storage.detail, retentionMs: this.storage.retentionMs },
      bufferFrames: this.buffer.size(),
      radioAvailability: this.sawScanner
        ? ""
        : "no authorized bluetooth scanner has reported. passive radio awareness requires an edge scanner published over the sensor bridge — a browser tab cannot prove which receiver heard a packet or where that receiver stands, so it is not accepted as a source.",
      atMs: Date.now(),
    };
  }

  // ---- ingestion from the edge bridge -------------------------------------

  setScanners(scanners: BleScanner[]) {
    scanners.forEach((s) => this.tracker.upsertScanner(s));
    this.sawScanner = this.sawScanner || scanners.length > 0;
    this.emit();
  }

  ingestObservation(o: BleObservation) {
    const rec = this.tracker.ingest(o);
    if (rec) this.emit();
  }

  reportDetector(payload: { detectorId: string; label?: string; runtime?: string; expectedIntervalMs?: number; atMs: number; note?: string }) {
    const existing =
      this.detectors.get(payload.detectorId) ??
      createDetector(
        payload.detectorId,
        payload.label ?? payload.detectorId,
        payload.runtime ?? "edge node",
        payload.expectedIntervalMs ?? 10_000,
      );
    this.detectors.set(payload.detectorId, heartbeat(existing, payload.atMs, payload.note));
    this.emit();
  }

  setStorage(payload: { configured: boolean; detail: string; retentionMs: number; put?: EvidenceStorage["put"] }) {
    this.storage = payload.configured
      ? { configured: true, detail: payload.detail, retentionMs: payload.retentionMs, put: payload.put }
      : { ...UNCONFIGURED_STORAGE, detail: payload.detail || UNCONFIGURED_STORAGE.detail };
    this.emit();
  }

  // ---- evidence -----------------------------------------------------------

  pushFrame(frame: EvidenceFrame) {
    if (this.buffer.push(frame)) {
      // frame count is UI-visible but far too chatty to emit on; the sweep
      // publishes it on its own cadence instead.
    }
  }

  bufferSettings() {
    return this.buffer.settings();
  }

  configureBuffer(options: Partial<typeof DEFAULT_BUFFER_OPTIONS>) {
    this.buffer.configure(options);
    this.emit();
  }

  // ---- rules and incidents ------------------------------------------------

  setRules(rules: SafetyRule[]) {
    this.rules = rules;
    saveJson(RULES_KEY, rules);
    this.emit();
  }

  getRules(): SafetyRule[] {
    return this.rules.slice();
  }

  /** A detector reports that an objective threshold was crossed. */
  async report(firing: RuleFiring, detectorId: string): Promise<Incident | null> {
    const rule = this.rules.find((r) => r.id === firing.ruleId);
    if (!rule || !rule.enabled) return null;
    const severity = evaluateSeverity(this.rules, [firing]);
    if (severity.contributions.length === 0) return null;

    const det = this.detectors.get(detectorId) ?? createDetector(detectorId, detectorId, "edge node", 10_000);
    this.detectors.set(detectorId, recordFiring(det, firing.atMs));

    const { incident, created } = this.incidentStore.record(firing, severity, rule.dedupeWindowMs, {
      label: rule.label,
      detectorId,
    });

    if (created) {
      this.incidentStore.attachEvidence(incident.id, null, "requested", "capturing the buffered frames around this trigger");
      const outcome = await captureEvidence(this.buffer, incident.id, firing.atMs, this.storage);
      if (outcome.ok && outcome.bundle) {
        this.bundles = applyRetention([outcome.bundle, ...this.bundles].slice(0, 50), Date.now());
        this.incidentStore.attachEvidence(incident.id, outcome.bundle.id, "stored", outcome.detail);
      } else {
        this.incidentStore.attachEvidence(incident.id, null, "unavailable", outcome.reason ?? outcome.detail);
      }
    }
    this.emit();
    return incident;
  }

  review(id: string, state: ReviewState, by: string, note?: string) {
    const inc = this.incidentStore.review(id, state, by, Date.now(), note);
    if (inc) this.emit();
    return inc;
  }

  bundle(id: string): EvidenceBundle | null {
    return this.bundles.find((b) => b.id === id) ?? null;
  }

  deleteBundle(id: string) {
    this.bundles = this.bundles.filter((b) => b.id !== id);
    const inc = this.incidentStore.list().find((i) => i.evidenceId === id);
    if (inc) this.incidentStore.attachEvidence(inc.id, null, "unavailable", "an operator deleted this evidence bundle");
    this.emit();
  }

  // ---- allowlist ----------------------------------------------------------

  setAllowlist(entries: BleAllowlistEntry[]) {
    this.allowlist = entries;
    saveJson(ALLOWLIST_KEY, entries);
    this.tracker.setOptions({ allowlist: entries });
    this.emit();
  }

  getAllowlist(): BleAllowlistEntry[] {
    return this.allowlist.slice();
  }

  observationsFor(key: string) {
    return this.tracker.observationsFor(key);
  }

  detectorRate(id: string): number | null {
    const d = this.detectors.get(id);
    return d ? falsePositiveRate(d) : null;
  }

  start(intervalMs = 3000) {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      this.tracker.sweep(now);
      const swept = sweepDetectors([...this.detectors.values()], now);
      swept.forEach((d) => this.detectors.set(d.id, d));
      this.incidentStore.prune(now);
      this.bundles = applyRetention(this.bundles, now);
      this.emit();
    }, intervalMs);
  }

  stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  reset() {
    this.tracker.clear();
    this.incidentStore.clear();
    this.buffer.clear();
    this.bundles = [];
    this.emit();
  }
}

export const LOST_AFTER = LOST_AFTER_MS;

let singleton: SafetyHub | null = null;
export function safetyHub(): SafetyHub {
  if (!singleton) singleton = new SafetyHub();
  return singleton;
}
