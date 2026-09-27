// asherin.arvision — passive radio awareness types.
//
// A bluetooth low energy device that is powered on broadcasts short packets to
// anyone in earshot. Listening to that broadcast is observation, exactly like
// hearing a fire alarm in a corridor. This subsystem never goes further than
// that: it does not pair, connect, authenticate, read characteristics, decrypt,
// or attempt to defeat address randomization. Everything below is derived from
// packets that were freely transmitted, or it is left unknown.
//
// The second discipline this file encodes: an estimate is only as good as the
// receivers that produced it. One antenna and a signal strength number cannot
// place a radio in a room, and the types make that impossible to pretend.

export type BleAddressType =
  | "public"
  | "random_static"
  | "random_resolvable"
  | "random_nonresolvable"
  | "unknown";

/** A receiver. Position is optional because most installations have one dongle. */
export interface BleScanner {
  id: string;
  label: string;
  /** metres in the site frame. null when the operator never surveyed it. */
  position: { x: number; y: number; z: number } | null;
  /** operator declared survey accuracy of that position, metres. */
  positionAccuracyM: number | null;
  /** rssi a reference transmitter produced at one metre, measured not assumed. */
  txRefDbm: number | null;
  /** path loss exponent measured for this space. */
  pathLossN: number | null;
  /** true only when txRef and pathLoss were measured for this receiver. */
  calibrated: boolean;
  zoneId: string | null;
  lastObservationMs: number | null;
  health: "live" | "stale" | "unavailable";
  /** which adapter published it. */
  adapter: string;
}

/** One advertisement, exactly as an authorized scanner reported it. */
export interface BleObservation {
  scannerId: string;
  /** timestamp asserted by the scanner. */
  atMs: number;
  /** timestamp this tab received it — the pair exposes clock skew. */
  receivedAtMs: number;
  address: string | null;
  addressType: BleAddressType;
  rssi: number;
  txPower: number | null;
  localName: string | null;
  serviceUuids: string[];
  /** bluetooth SIG company identifiers present in the manufacturer field. */
  manufacturerIds: number[];
  /** service data keys only — payload bytes are not stored. */
  serviceDataKeys: string[];
  appearance: number | null;
  provenance: string;
}

export type BleCategory =
  | "unknown"
  | "phone"
  | "wearable"
  | "audio"
  | "computer"
  | "beacon"
  | "tracker_tag"
  | "peripheral"
  | "medical"
  | "sensor"
  | "vehicle";

export interface BleClassification {
  category: BleCategory;
  vendor: string | null;
  /** 0..1, derived from how many independent broadcast facts agreed. */
  confidence: number;
  /** every line explains which broadcast fact produced the conclusion. */
  evidence: string[];
}

export type BleLocalizationMode = "none" | "range_only" | "multilateration";

export interface BleLocalization {
  mode: BleLocalizationMode;
  /** metres in the site frame. only ever set in multilateration mode. */
  position: { x: number; y: number; z: number } | null;
  /** metres from the single receiver, range only mode. */
  rangeM: number | null;
  /** radius of the uncertainty sphere in metres. */
  uncertaintyM: number | null;
  scannerCount: number;
  evidence: string[];
  /** printed verbatim when the mode is none. */
  limitation: string;
}

export interface BleTimelineEvent {
  id: string;
  atMs: number;
  kind:
    | "first_seen"
    | "classification_changed"
    | "localization_changed"
    | "zone_entered"
    | "zone_left"
    | "confidence_changed"
    | "address_rotated"
    | "lost"
    | "returned";
  detail: string;
  /** which scanners and which adapter produced the fact behind this line. */
  provenance: string;
}

export interface BleDeviceRecord {
  /** stable association key. an address when the platform exposed a stable one,
   *  otherwise a pseudonym derived from non sensitive broadcast characteristics. */
  key: string;
  pseudonymous: boolean;
  /** short readable handle for the operator. never a real world identity. */
  handle: string;
  addresses: string[];
  addressType: BleAddressType;
  classification: BleClassification;
  localization: BleLocalization;
  lastRssi: number;
  firstSeenMs: number;
  lastSeenMs: number;
  observations: number;
  scannerIds: string[];
  zoneId: string | null;
  /** operator supplied label from the authorized allowlist. */
  knownLabel: string | null;
  timeline: BleTimelineEvent[];
  /** true when the freshest observation is older than the staleness window. */
  stale: boolean;
  /** ms difference between scanner clock and this tab, worst recent sample. */
  clockSkewMs: number;
}

export interface BleAllowlistEntry {
  /** matched against the record key or any observed address. */
  match: string;
  label: string;
  note: string;
}
