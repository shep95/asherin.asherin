// asherin.arvision — configurable observable-event rules.
//
// The hard boundary this file enforces in code, not in copy: severity may be
// derived only from things that objectively happened in a place the operator is
// authorized to monitor. It may never be derived from how a person looks,
// stands, moves their face or eyes, what they appear to be, or any guess about
// what they intend. Those signals are rejected by name, and the rejection is
// tested.
//
// A rule is data: a subject, a threshold, a weight, a window. Operators tune
// them per site. Nothing here scores a person, and nothing here acts.

export type ObservableSignal =
  | "line_crossed"
  | "zone_dwell_exceeded"
  | "restricted_hours_presence"
  | "door_forced"
  | "door_held_open"
  | "object_left_behind"
  | "object_removed"
  | "crowd_density_exceeded"
  | "loitering_duration_exceeded"
  | "vehicle_in_pedestrian_zone"
  | "camera_obstructed"
  | "camera_moved"
  | "unregistered_radio_in_zone"
  | "radio_dwell_exceeded"
  // ---- signals produced by the on-device camera event engine --------------
  // every one of these is a measurement of where bodies and objects were, and
  // how they moved. none of them reads a face, a trait, or an intention.
  | "restricted_zone_entry"
  | "barrier_crossing"
  | "unusual_movement"
  | "prolonged_proximity"
  | "physical_contact_impulse"
  | "rapid_approach"
  | "chase_like_trajectory"
  | "person_on_ground";

/**
 * Signals that must never influence severity. Enforced at runtime — a rule
 * naming one of these is dropped and reported, so a future edit cannot quietly
 * reintroduce person profiling.
 */
export const FORBIDDEN_SIGNALS = [
  "body_language", "posture", "gait", "gaze", "facial_expression", "emotion",
  "clothing", "appearance", "age", "gender", "race", "ethnicity", "religion",
  "disability", "intent", "criminality", "suspicion", "threat_of_person",
  "nervousness", "aggression_prediction", "identity", "demographic",
] as const;

export type ForbiddenSignal = (typeof FORBIDDEN_SIGNALS)[number];

export interface SafetyRule {
  id: string;
  label: string;
  signal: ObservableSignal;
  /** applies only inside this zone; null means the whole authorized site. */
  zoneId: string | null;
  /** the objective threshold the signal must exceed, in the signal's own unit. */
  threshold: number;
  unit: string;
  /** contribution to severity when the rule fires, 0..1. */
  weight: number;
  /** repeat firings inside this window collapse into one incident. */
  dedupeWindowMs: number;
  enabled: boolean;
  /** operator's written reason this rule exists. */
  rationale: string;
}

export interface RuleFiring {
  ruleId: string;
  signal: ObservableSignal;
  value: number;
  atMs: number;
  zoneId: string | null;
  /** what produced the value: which camera, which scanner, which detector. */
  provenance: string;
}

export interface SeverityResult {
  score: number;
  band: "informational" | "review" | "priority";
  contributions: Array<{ ruleId: string; label: string; weight: number; detail: string }>;
  rejected: string[];
  statement: string;
}

export function isForbiddenSignal(name: string): boolean {
  const n = name.toLowerCase();
  return FORBIDDEN_SIGNALS.some((f) => n === f || n.includes(f));
}

/** Drops any rule naming a forbidden signal, and says so. */
export function sanitizeRules(rules: SafetyRule[]): { rules: SafetyRule[]; rejected: string[] } {
  const rejected: string[] = [];
  const kept = rules.filter((r) => {
    if (isForbiddenSignal(r.signal) || isForbiddenSignal(r.label)) {
      rejected.push(`rule "${r.label}" was refused: severity may not be derived from ${r.signal}`);
      return false;
    }
    return true;
  });
  return { rules: kept, rejected };
}

export function evaluateSeverity(rules: SafetyRule[], firings: RuleFiring[]): SeverityResult {
  const { rules: safe, rejected } = sanitizeRules(rules);
  const byId = new Map(safe.map((r) => [r.id, r]));
  const contributions: SeverityResult["contributions"] = [];
  let score = 0;

  const seen = new Set<string>();
  for (const f of firings) {
    const rule = byId.get(f.ruleId);
    if (!rule || !rule.enabled) continue;
    if (f.value < rule.threshold) continue;
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    score += rule.weight;
    contributions.push({
      ruleId: rule.id,
      label: rule.label,
      weight: rule.weight,
      detail: `${f.signal} reached ${f.value}${rule.unit} against a configured threshold of ${rule.threshold}${rule.unit}, reported by ${f.provenance}`,
    });
  }

  const clamped = Math.round(Math.min(1, score) * 100) / 100;
  const band = clamped >= 0.7 ? "priority" : clamped >= 0.35 ? "review" : "informational";
  return {
    score: clamped,
    band,
    contributions,
    rejected,
    statement:
      contributions.length === 0
        ? "no configured rule was exceeded"
        : "this score reflects configured thresholds that were objectively exceeded. it is not an assessment of any person, and it does not indicate intent, character or danger.",
  };
}

/** A conservative starting set. Operators edit these per site. */
export function defaultRules(): SafetyRule[] {
  return [
    { id: "after_hours", label: "presence during closed hours", signal: "restricted_hours_presence", zoneId: null, threshold: 1, unit: " event", weight: 0.4, dedupeWindowMs: 300_000, enabled: true, rationale: "the site is closed and no one is scheduled to be present" },
    { id: "door_held", label: "controlled door held open", signal: "door_held_open", zoneId: null, threshold: 30, unit: "s", weight: 0.35, dedupeWindowMs: 120_000, enabled: true, rationale: "a propped door defeats access control" },
    { id: "door_forced", label: "controlled door forced", signal: "door_forced", zoneId: null, threshold: 1, unit: " event", weight: 0.6, dedupeWindowMs: 120_000, enabled: true, rationale: "a forced door is a physical breach" },
    { id: "left_object", label: "object left behind in a monitored zone", signal: "object_left_behind", zoneId: null, threshold: 120, unit: "s", weight: 0.3, dedupeWindowMs: 600_000, enabled: true, rationale: "unattended items block egress and may be hazardous" },
    { id: "camera_blocked", label: "camera obstructed", signal: "camera_obstructed", zoneId: null, threshold: 20, unit: "s", weight: 0.35, dedupeWindowMs: 300_000, enabled: true, rationale: "a blinded camera is a coverage failure" },
    { id: "camera_moved", label: "camera moved from its surveyed pose", signal: "camera_moved", zoneId: null, threshold: 5, unit: "°", weight: 0.3, dedupeWindowMs: 300_000, enabled: true, rationale: "a moved camera invalidates every registered coordinate" },
    { id: "radio_dwell", label: "unregistered radio dwelling in a restricted zone", signal: "radio_dwell_exceeded", zoneId: null, threshold: 600, unit: "s", weight: 0.25, dedupeWindowMs: 900_000, enabled: false, rationale: "long presence of equipment not on the site allowlist is worth a look. disabled by default because address rotation makes dwell unreliable" },

    // ---- camera event engine ------------------------------------------------
    // these fire only from measurements taken on real frames by the on-device
    // models. with no camera attached, none of them can fire, and the console
    // says the detector is unavailable rather than showing a quiet, empty list.
    { id: "restricted_entry", label: "entry into a restricted zone", signal: "restricted_zone_entry", zoneId: null, threshold: 1, unit: " event", weight: 0.5, dedupeWindowMs: 120_000, enabled: true, rationale: "an administrator drew this area as one nobody should walk into while it is closed" },
    { id: "barrier_cross", label: "crossing over a barrier", signal: "barrier_crossing", zoneId: null, threshold: 1, unit: " event", weight: 0.6, dedupeWindowMs: 120_000, enabled: true, rationale: "going over a gate rather than through it defeats the boundary the gate exists to make" },
    { id: "unusual_motion", label: "sustained running in a walking-only zone", signal: "unusual_movement", zoneId: null, threshold: 2, unit: "s", weight: 0.25, dedupeWindowMs: 120_000, enabled: true, rationale: "running where the site expects walking is worth a look, whatever the reason turns out to be" },
    { id: "prolonged_proximity", label: "possible prolonged confrontation", signal: "prolonged_proximity", zoneId: null, threshold: 45, unit: "s", weight: 0.35, dedupeWindowMs: 300_000, enabled: true, rationale: "sustained close range with continuous movement between two tracks. a person decides what it was" },
    { id: "contact_impulse", label: "possible physical contact between two tracks", signal: "physical_contact_impulse", zoneId: null, threshold: 1, unit: " event", weight: 0.5, dedupeWindowMs: 120_000, enabled: true, rationale: "a sharp motion at contact range may need someone to look now rather than later" },
    { id: "crowd_formation", label: "crowd formation above the configured occupancy", signal: "crowd_density_exceeded", zoneId: null, threshold: 4, unit: " tracks", weight: 0.3, dedupeWindowMs: 300_000, enabled: true, rationale: "occupancy above the fire or egress limit for this area" },
    { id: "extended_dwell", label: "extended dwell in a monitored zone", signal: "zone_dwell_exceeded", zoneId: null, threshold: 300, unit: "s", weight: 0.25, dedupeWindowMs: 600_000, enabled: true, rationale: "long presence in a place people normally pass through" },
    { id: "rapid_approach", label: "rapid approach between two tracks", signal: "rapid_approach", zoneId: null, threshold: 1, unit: " event", weight: 0.3, dedupeWindowMs: 120_000, enabled: true, rationale: "two shapes closing fast is worth a glance at the live view" },
    { id: "chase_like", label: "sustained pursuit-like movement", signal: "chase_like_trajectory", zoneId: null, threshold: 3, unit: "s", weight: 0.4, dedupeWindowMs: 180_000, enabled: true, rationale: "two tracks running at a held separation. it reads the same whether they are running together or one is following" },
    { id: "person_on_ground", label: "person on the ground", signal: "person_on_ground", zoneId: null, threshold: 8, unit: "s", weight: 0.7, dedupeWindowMs: 180_000, enabled: true, rationale: "somebody may need help. this is the one event on this list where the right response is to send a person, not to review a clip later" },
  ];
}
