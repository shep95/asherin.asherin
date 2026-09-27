// asherin — sentinel -> shared fabric.
//
// Sentinel keeps everything it already had: its channels, its capture engines,
// its account timeline, its gap semantics, its alerts, its companion. This
// bridge is read-only with respect to all of it. It subscribes where sentinel
// already broadcasts, normalizes what arrives, and publishes it into the fabric
// so ArVision and Eagle Eye can see the same events on the same clock.
//
// Nothing here starts a microphone, a radio or a geolocation watch. If sentinel
// is not running, the fabric shows sentinel's lanes as unavailable with
// sentinel's own reason, which is the honest state and not an empty list.

import { listChannels, subscribeChannelIngest, subscribeChannels } from "@/lib/sentinel/audio/channels";
import { subscribeSentinel, type SentinelState } from "@/lib/sentinel/alwaysOn";
import type { AmbientEvent } from "@/lib/sentinel/audio/sync";
import type { LocationFix } from "@/lib/sentinel/location/geo";
import type { RadioRecord } from "@/lib/sentinel/radio/environment";
import { sensorFabric } from "../fabric";
import { provenance } from "../clock";
import { zoneFor } from "../zoneBinding";
import type { FabricObservation } from "../types";

const LANE_PREFIX = "sentinel-lane:";
export const SENTINEL_LOCAL_RADIO = "sentinel-radio:this-device";
export const SENTINEL_LOCAL_LOCATION = "sentinel-location:this-device";

const publishedEvents = new Set<string>();

function laneSensorId(channelId: string) {
  return `${LANE_PREFIX}${channelId}`;
}

/** The lane roster, exactly as sentinel currently reports it. */
function syncChannels() {
  const fabric = sensorFabric();
  const channels = listChannels();
  for (const c of channels) {
    const id = laneSensorId(c.config.id);
    const bound = zoneFor(id);
    fabric.upsertSensor({
      id,
      label: c.config.label,
      modality: "audio",
      subsystem: "sentinel",
      capabilities: [
        "voice activity detection and speech capture",
        "acoustic transient classification (door, glass-shaped impact, movement, vehicle)",
        c.config.translateTo ? `translation into ${c.config.translateTo}` : "no translation configured",
      ],
      limitations: [
        "audio only — a microphone cannot say who made a sound or where in a room it happened",
        "a browser tab cannot hold this input open once the tab is closed; the desktop companion owns that",
        c.inputPresent ? "bound input is present on this machine" : "the bound input is not currently enumerable on this machine",
      ],
      authorization: "operator_device",
      health: c.listening ? "live" : c.gapOpen ? "stale" : c.inputPresent ? "unavailable" : "error",
      healthDetail: c.listening
        ? "capturing"
        : c.gapOpen
          ? "coverage gap is open on this lane — capture stopped and the hole is recorded"
          : c.inputPresent
            ? "input present, watch not started"
            : "the bound input is absent from this machine",
      siteId: null,
      zoneId: bound?.zoneId ?? null,
      lastObservationMs: c.config.lastAliveAt,
      spatiallyRegistered: false,
    });
  }
}

/** Account timeline rows arriving live from a lane's ingest response. */
function publishAmbient(channelId: string, events: AmbientEvent[]) {
  const fabric = sensorFabric();
  const sensorId = laneSensorId(channelId);
  const label = listChannels().find((c) => c.config.id === channelId)?.config.label ?? "sentinel lane";
  const bound = zoneFor(sensorId);

  for (const ev of events) {
    if (publishedEvents.has(ev.id)) continue;
    publishedEvents.add(ev.id);
    if (publishedEvents.size > 2000) publishedEvents.clear();

    const atMs = Date.parse(ev.started_at);
    if (!Number.isFinite(atMs)) continue;
    const base = {
      siteId: null,
      zoneId: bound?.zoneId ?? null,
      zoneLabel: bound?.zoneLabel ?? null,
      channelId,
    };

    let obs: FabricObservation | null = null;
    if (ev.kind === "sound") {
      obs = {
        ...base,
        id: `ae_${ev.id}`,
        type: "audio_event",
        modality: "audio",
        atMs,
        tag: ev.tag ?? "unclassified impact",
        durationMs: ev.duration_ms,
        evidence: (ev.meta?.evidence as Record<string, number | string>) ?? {},
        provenance: provenance({
          sensorId,
          sensorLabel: label,
          subsystem: "sentinel",
          adapter: "sentinel acoustic transient classifier",
          kind: "model_inference",
          sourceClockMs: atMs,
          note: "the measured acoustic shape of a transient. it names a shape, not a cause and not a person.",
        }),
        confidence: { value: ev.confidence, basis: "confidence reported by the sentinel classifier alongside its measured features" },
        summary: `${ev.tag ?? "unclassified impact"} on ${label}`,
      };
    } else if (ev.kind === "speech") {
      obs = {
        ...base,
        id: `se_${ev.id}`,
        type: "speech_event",
        modality: "audio",
        atMs,
        speakerId: ev.speaker_id,
        transcriptPresent: Boolean(ev.transcript),
        durationMs: ev.duration_ms,
        provenance: provenance({
          sensorId,
          sensorLabel: label,
          subsystem: "sentinel",
          adapter: "sentinel voice pipeline",
          kind: "model_inference",
          sourceClockMs: atMs,
          note: "a turn of speech was captured on this lane. the transcript itself stays in the sentinel timeline and is not copied here.",
        }),
        confidence: { value: ev.confidence, basis: "confidence carried by the sentinel turn" },
        summary: `speech turn on ${label}`,
      };
    } else if (ev.kind === "gap") {
      obs = {
        ...base,
        id: `cg_${ev.id}`,
        type: "coverage_gap",
        modality: "audio",
        atMs,
        reason: ev.tag ?? "capture stopped",
        untilMs: ev.duration_ms ? atMs + ev.duration_ms : null,
        provenance: provenance({
          sensorId,
          sensorLabel: label,
          subsystem: "sentinel",
          adapter: "sentinel channel liveness",
          kind: "raw_observation",
          sourceClockMs: atMs,
          note: "this lane was not listening. silence in this window means nothing was heard because nothing was captured.",
        }),
        confidence: { value: null, basis: "a gap is a recorded fact about coverage, not a measurement of the world" },
        summary: `coverage gap on ${label}: ${ev.tag ?? "capture stopped"}`,
      };
    }
    if (obs) fabric.publish(obs);
  }
}

/**
 * The bluetooth environment ledger's current view of one radio, published from
 * the sentinel room that already owns that ledger. This device is one receiver
 * with no surveyed position, so the fabric gets a sighting and never a place.
 */
export function publishSentinelRadio(record: RadioRecord, label: string, source: string) {
  const fabric = sensorFabric();
  fabric.upsertSensor({
    id: SENTINEL_LOCAL_RADIO,
    label: "this device — bluetooth receiver",
    modality: "radio",
    subsystem: "sentinel",
    capabilities: ["passive advertisement reception on this machine's own radio"],
    limitations: [
      "one antenna with no surveyed position: rssi cannot become a location, only a rough range",
      "randomized addresses rotate, so a returning radio may look like a new one",
      "a broadcast never identifies a person",
    ],
    authorization: "operator_device",
    health: "live",
    healthDetail: `packets arriving via ${source}`,
    siteId: null,
    zoneId: zoneFor(SENTINEL_LOCAL_RADIO)?.zoneId ?? null,
    lastObservationMs: record.lastSeen,
    spatiallyRegistered: false,
  });

  const bound = zoneFor(SENTINEL_LOCAL_RADIO);
  fabric.publish({
    id: `srs_${record.key}_${record.lastSeen}`,
    type: "radio_sighting",
    modality: "radio",
    atMs: record.lastSeen,
    siteId: null,
    zoneId: bound?.zoneId ?? null,
    zoneLabel: bound?.zoneLabel ?? null,
    receiverId: SENTINEL_LOCAL_RADIO,
    deviceKey: record.key,
    handle: label,
    rssi: record.rssi,
    estimatedRangeM: record.meters,
    addressRandomized: record.randomized,
    vendor: record.classification.brand ?? null,
    category: record.classification.category ?? null,
    provenance: provenance({
      sensorId: SENTINEL_LOCAL_RADIO,
      sensorLabel: "this device — bluetooth receiver",
      subsystem: "sentinel",
      adapter: `sentinel bluetooth environment ledger (${source})`,
      kind: "raw_observation",
      sourceClockMs: record.lastSeen,
      note: "presence in range of this one antenna. the range figure is an estimate from signal strength with a wide error, not a measured distance.",
    }),
    confidence: { value: null, basis: "signal strength is not a probability; the ledger reports what it received" },
    summary: `${label} in range of this device at ${record.rssi ?? "unknown"} dBm`,
  });
}

export function publishSentinelLocation(fix: LocationFix, place: string | null) {
  const fabric = sensorFabric();
  fabric.upsertSensor({
    id: SENTINEL_LOCAL_LOCATION,
    label: "this device — location",
    modality: "location",
    subsystem: "sentinel",
    capabilities: ["platform location fixes with their own reported accuracy"],
    limitations: [
      "accuracy is whatever the platform reports; an ip estimate is city level and vpn-sensitive",
      "no floor or vertical level is resolved from a horizontal fix",
    ],
    authorization: "operator_device",
    health: "live",
    healthDetail: fix.note,
    siteId: null,
    zoneId: null,
    lastObservationMs: fix.at,
    spatiallyRegistered: false,
  });

  fabric.publish({
    id: `loc_${fix.at}`,
    type: "location_fix",
    modality: "location",
    atMs: fix.at,
    siteId: null,
    zoneId: null,
    zoneLabel: null,
    lat: fix.lat,
    lon: fix.lon,
    accuracyM: fix.accuracyM,
    source: fix.source,
    place,
    provenance: provenance({
      sensorId: SENTINEL_LOCAL_LOCATION,
      sensorLabel: "this device — location",
      subsystem: "sentinel",
      adapter: `location source: ${fix.source}`,
      kind: fix.source === "gps" ? "raw_observation" : "derived_estimate",
      sourceClockMs: fix.at,
      note: fix.note,
    }),
    confidence: { value: null, basis: `platform reported ${fix.accuracyM}m accuracy at 68% confidence` },
    summary: `${place ?? "position"} · ±${Math.round(fix.accuracyM)}m via ${fix.source}`,
  });
}

/** The always-on daemon's own legs, so the console can show why a lane is dark. */
function publishDaemonState(state: SentinelState) {
  const fabric = sensorFabric();
  fabric.upsertSensor({
    id: "sentinel-daemon",
    label: "sentinel always-on watch",
    modality: "service",
    subsystem: "sentinel",
    capabilities: ["background bluetooth leg", "area risk leg", "watchdog re-arm"],
    limitations: ["a browser tab cannot guarantee background execution; the desktop companion owns that"],
    authorization: "operator_device",
    health: state.armed ? (state.scanning || state.positioned ? "live" : "stale") : "unavailable",
    healthDetail: state.armed
      ? state.blocked ?? `radio ${state.scanning ? "streaming" : "idle"}, position ${state.positioned ? "acquired" : "not acquired"}`
      : "the operator disarmed the watch",
    siteId: null,
    zoneId: null,
    lastObservationMs: state.lastFlushAt,
    spatiallyRegistered: false,
  });
}

let booted = false;
const offs: Array<() => void> = [];

export function bootSentinelFabric() {
  if (booted) return;
  booted = true;
  syncChannels();
  offs.push(subscribeChannels(syncChannels));
  offs.push(subscribeChannelIngest((channelId, result) => publishAmbient(channelId, result.events ?? [])));
  offs.push(subscribeSentinel(publishDaemonState));
}

export function shutdownSentinelFabric() {
  offs.splice(0).forEach((off) => off());
  booted = false;
}
