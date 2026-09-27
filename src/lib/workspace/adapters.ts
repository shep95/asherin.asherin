// real adapters — the only place the workspace touches a subsystem.
//
// Every adapter reads from something that already owned the data: the sensor
// fabric, the operator's stored camera poses, the investigation store, the
// geocoder. None of them acquires anything new, and none of them invents a
// row when the subsystem returned nothing.

import { sensorFabric } from "@/lib/fabric/fabric";
import type { FabricObservation, FabricSensor } from "@/lib/fabric/types";
import { loadPoses } from "@/lib/arvision/spatial3d/poses";
import { geocodeAddress, detectAddresses } from "@/lib/propertyIntent";
import { detectGeoIntent } from "@/lib/geoIntent";
import { listInvestigations, loadSnapshot } from "@/lib/investigation/persistence";
import type { InvestigationSnapshot } from "@/lib/investigation/types";
import type { LaneRunner } from "./orchestrator";
import type {
  EvidenceItem,
  MapPayload,
  TimelineItem,
  WorkspaceCapabilities,
  WorkspaceCard,
  WorkspaceProvenance,
} from "./types";
import { NO_CAPABILITIES } from "./types";

// ── capability probing ─────────────────────────────────────────────────────

export function probeCapabilities(opts: { hasResearchProvider: boolean }): WorkspaceCapabilities {
  const snap = sensorFabric().snapshot();
  const liveSensors = snap.sensors.filter((s) => s.health === "live" || s.health === "stale");
  const cameras = liveSensors.filter((s) => s.modality === "vision");
  const poses = loadPoses();
  const calibrated = Object.values(poses).filter(
    (p) => typeof p.latitude === "number" && typeof p.longitude === "number",
  );

  return {
    ...NO_CAPABILITIES,
    research: opts.hasResearchProvider,
    researchReason: opts.hasResearchProvider ? undefined : NO_CAPABILITIES.researchReason,
    geocoding: typeof fetch === "function",
    geocodingReason: typeof fetch === "function" ? undefined : "no network client available in this session",
    cameras: cameras.length > 0,
    camerasReason: cameras.length ? undefined : "no authorized camera has published a frame into the fabric",
    fabric: snap.observations.length > 0,
    fabricReason: snap.observations.length
      ? undefined
      : "no sensor has published an observation into the fabric on this device",
    evidenceStore: false,
    evidenceStoreReason: "no long-term evidence store is configured, so only in-session references exist",
    spatialCalibration: calibrated.length > 0,
    spatialCalibrationReason: calibrated.length
      ? undefined
      : "no camera has an operator-measured position, so observations cannot be plotted",
  };
}

// ── sensor lane ────────────────────────────────────────────────────────────

function fabricProvenance(o: FabricObservation): WorkspaceProvenance {
  return {
    origin: "fabric",
    label: `${o.provenance.subsystem}/${o.provenance.sensorId}`,
    observedAt: new Date(o.atMs).toISOString(),
    confidence: typeof (o as { confidence?: { value?: number } }).confidence?.value === "number"
      ? (o as { confidence?: { value?: number } }).confidence!.value!
      : null,
  };
}

function observationTitle(o: FabricObservation): string {
  switch (o.type) {
    case "visual_track":
      return "visual track";
    case "visual_event":
      return "visual event";
    case "radio_sighting":
      return "radio sighting";
    case "radio_region":
      return "radio region";
    case "audio_event":
      return "audio event";
    case "speech_event":
      return "speech event";
    case "coverage_gap":
      return "coverage gap";
    case "location_fix":
      return "location fix";
    case "service_health":
      return "service health";
  }
}


function inWindow(atMs: number, w?: { fromMs: number; toMs: number } | null) {
  return !w || (atMs >= w.fromMs && atMs <= w.toMs);
}

export function sensorCardRunner(window?: { fromMs: number; toMs: number } | null): LaneRunner {
  return {
    kind: "cards",
    emptyReason: "the fabric holds no observation in this window",
    run: async () => {
      const snap = sensorFabric().snapshot();
      const cards: WorkspaceCard[] = snap.observations
        .filter((o) => inWindow(o.atMs, window))
        .slice(-24)
        .reverse()
        .map((o) => ({
          id: o.id,
          kind: o.type === "visual_track" ? ("track" as const) : ("event" as const),
          title: observationTitle(o),
          subtitle: new Date(o.atMs).toLocaleTimeString(),
          fields: [
            { label: "sensor", value: o.provenance.sensorId },
            { label: "subsystem", value: o.provenance.subsystem },
            {
              label: "clock",
              value:
                o.provenance.sourceClockMs === null
                  ? "source asserts no clock"
                  : `skew ${o.provenance.clockSkewMs ?? 0}ms`,
            },
          ],
          provenance: fabricProvenance(o),
          anchor: { atMs: o.atMs, trackId: o.type === "visual_track" ? o.id : undefined },
        }));
      return cards.length ? { kind: "cards", cards } : null;
    },
  };
}

function cameraCard(s: FabricSensor): WorkspaceCard {
  const pose = loadPoses()[s.id];
  const hasPose = typeof pose?.latitude === "number" && typeof pose?.longitude === "number";
  return {
    id: s.id,
    kind: "camera",
    title: s.label,
    subtitle: s.health,
    fields: [
      { label: "modality", value: s.modality },
      { label: "health", value: `${s.health}${s.healthDetail ? ` — ${s.healthDetail}` : ""}` },
      { label: "position", value: hasPose ? `${pose!.latitude}, ${pose!.longitude}` : "not measured" },
    ],
    provenance: {
      origin: "fabric",
      label: s.id,
      observedAt: s.lastObservationMs ? new Date(s.lastObservationMs).toISOString() : null,
    },
    anchor: hasPose ? { cameraId: s.id, lat: pose!.latitude!, lng: pose!.longitude! } : { cameraId: s.id },
    unresolved: hasPose ? undefined : ["no operator-measured position, so this camera cannot be plotted"],
  };
}

export const cameraRunner: LaneRunner = {
  kind: "cameras",
  emptyReason: "no authorized camera is registered in this session",
  run: async () => {
    const snap = sensorFabric().snapshot();
    const cams = snap.sensors.filter((s) => s.modality === "vision").map(cameraCard);
    return cams.length ? { kind: "cameras", cameras: cams } : null;
  },
};

export function sensorTimelineRunner(window?: { fromMs: number; toMs: number } | null): LaneRunner {
  return {
    kind: "timeline",
    emptyReason: "the fabric holds no timestamped observation in this window",
    run: async () => {
      const snap = sensorFabric().snapshot();
      const items: TimelineItem[] = snap.observations
        .filter((o) => inWindow(o.atMs, window))
        .slice(-60)
        .map((o) => ({
          id: o.id,
          atMs: o.atMs,
          label: observationTitle(o),
          detail: `${o.provenance.subsystem} · ${o.provenance.sensorId}`,
          provenance: fabricProvenance(o),
        }))
        .sort((a, b) => a.atMs - b.atMs);
      return items.length ? { kind: "timeline", items } : null;
    },
  };
}

export const sensorMapRunner: LaneRunner = {
  kind: "map",
  emptyReason: "no camera or observation carries a measured coordinate, so nothing can be plotted",
  run: async () => {
    const snap = sensorFabric().snapshot();
    const poses = loadPoses();
    const map: MapPayload = { markers: [], tracks: [], center: null, zoom: 17, unplotted: [] };
    for (const s of snap.sensors) {
      const p = poses[s.id];
      if (typeof p?.latitude === "number" && typeof p?.longitude === "number") {
        map.markers.push({
          id: s.id,
          kind: "camera",
          label: s.label,
          lat: p.latitude,
          lng: p.longitude,
          provenance: { origin: "operator-pose", label: `${s.id} measured by ${p.measuredBy}` },
        });
      } else {
        map.unplotted.push({ label: s.label, reason: "no operator-measured position" });
      }
    }
    if (map.markers.length) map.center = { lat: map.markers[0].lat, lng: map.markers[0].lng };
    return map.markers.length || map.unplotted.length ? { kind: "map", map } : null;
  },
};

export const evidenceRunner: LaneRunner = {
  kind: "evidence",
  emptyReason: "no stored evidence artefact is retrievable in this session",
  run: async () => {
    const snap = sensorFabric().snapshot();
    const items: EvidenceItem[] = snap.observations.slice(-12).map((o) => ({
      id: o.id,
      label: observationTitle(o),
      kind: o.type,
      atMs: o.atMs,
      provenance: fabricProvenance(o),
      mediaAvailable: false,
      mediaUnavailableReason: "no long-term recording store is configured, so only the observation record exists",
    }));
    return items.length ? { kind: "evidence", items } : null;
  },
};

// ── research lane ──────────────────────────────────────────────────────────

async function currentSnapshot(conversationId: string | null): Promise<InvestigationSnapshot | null> {
  const list = await listInvestigations(20);
  const match =
    (conversationId && list.find((i) => i.conversationId === conversationId)) || list[0] || null;
  if (!match) return null;
  return loadSnapshot(match.id);
}

export function researchCardRunner(conversationId: string | null): LaneRunner {
  return {
    kind: "cards",
    emptyReason: "no investigation has produced a corroborated entity yet",
    run: async () => {
      const snap = await currentSnapshot(conversationId);
      if (!snap) return null;
      const cards: WorkspaceCard[] = snap.entities.slice(0, 30).map((e) => {
        const src = snap.sources.find((s) => s.id === (e as unknown as { sourceId?: string }).sourceId);
        return {
          id: e.id,
          kind: ((e as unknown as { kind?: string }).kind === "organization" ? "company" : "entity") as WorkspaceCard["kind"],
          title: (e as unknown as { name?: string }).name || "unnamed entity",
          subtitle: (e as unknown as { kind?: string }).kind,
          fields: [
            { label: "type", value: String((e as unknown as { kind?: string }).kind ?? "unknown") },
            {
              label: "confidence",
              value:
                typeof (e as unknown as { confidence?: number }).confidence === "number"
                  ? String((e as unknown as { confidence?: number }).confidence)
                  : "unscored",
            },
          ],
          provenance: {
            origin: "investigation",
            label: src ? (src as unknown as { domain?: string }).domain || "source" : "investigation record",
            url: src ? (src as unknown as { url?: string }).url ?? null : null,
            confidence: (e as unknown as { confidence?: number }).confidence ?? null,
          },
          anchor: { entityId: e.id },
        };
      });
      return cards.length ? { kind: "cards", cards } : null;
    },
  };
}

export function researchGraphRunner(conversationId: string | null): LaneRunner {
  return {
    kind: "graph",
    emptyReason: "no resolved relationship exists in this investigation yet",
    run: async () => {
      const snap = await currentSnapshot(conversationId);
      if (!snap) return null;
      const nodes = snap.entities.slice(0, 40).map((e) => ({
        id: e.id,
        label: (e as unknown as { name?: string }).name || "unnamed",
        kind: "entity" as const,
      }));
      const ids = new Set(nodes.map((n) => n.id));
      const edges = snap.relationships
        .filter((r) => {
          const rr = r as unknown as { fromEntityId?: string; toEntityId?: string };
          return ids.has(rr.fromEntityId || "") && ids.has(rr.toEntityId || "");
        })
        .slice(0, 80)
        .map((r) => {
          const rr = r as unknown as {
            id: string;
            fromEntityId: string;
            toEntityId: string;
            kind?: string;
            confidence?: number;
          };
          return {
            id: rr.id,
            from: rr.fromEntityId,
            to: rr.toEntityId,
            label: rr.kind || "related to",
            confidence: rr.confidence ?? null,
          };
        });
      return nodes.length ? { kind: "graph", graph: { nodes, edges } } : null;
    },
  };
}

export function researchTimelineRunner(conversationId: string | null): LaneRunner {
  return {
    kind: "timeline",
    emptyReason: "the investigation holds no dated event yet",
    run: async () => {
      const snap = await currentSnapshot(conversationId);
      if (!snap) return null;
      const items: TimelineItem[] = snap.timeline
        .map((t) => {
          const tt = t as unknown as { id: string; occurredAt?: string; label?: string; summary?: string };
          const ms = tt.occurredAt ? Date.parse(tt.occurredAt) : NaN;
          if (!Number.isFinite(ms)) return null;
          return {
            id: tt.id,
            atMs: ms,
            label: tt.label || tt.summary || "event",
            detail: tt.summary,
            provenance: { origin: "investigation", label: "investigation timeline", observedAt: tt.occurredAt ?? null },
          } as TimelineItem;
        })
        .filter((x): x is TimelineItem => !!x)
        .sort((a, b) => a.atMs - b.atMs);
      return items.length ? { kind: "timeline", items } : null;
    },
  };
}

/** geographic lane: geocodes places actually named in the message or entities. */
export function geocodeMapRunner(message: string, extraPlaces: string[] = []): LaneRunner {
  return {
    kind: "map",
    emptyReason: "no place named in this request could be resolved to a coordinate",
    run: async (signal) => {
      const geo = detectGeoIntent(message);
      const named = [
        ...detectAddresses(message).map((a) => a.raw),
        ...(geo?.place ? [geo.place] : []),
        ...extraPlaces,
      ].slice(0, 6);
      const map: MapPayload = { markers: [], tracks: [], center: null, zoom: 13, unplotted: [] };
      for (const place of named) {
        if (signal.aborted) break;
        const g = await geocodeAddress(place);
        if (!g) {
          map.unplotted.push({ label: place, reason: "the public geocoder returned no match" });
          continue;
        }
        map.markers.push({
          id: `geo-${map.markers.length}-${place.slice(0, 24)}`,
          kind: "location",
          label: g.formatted,
          lat: g.lat,
          lng: g.lng,
          provenance: { origin: "geocoder", label: "public geocoder", url: null },
        });
      }
      if (map.markers.length) map.center = { lat: map.markers[0].lat, lng: map.markers[0].lng };
      return map.markers.length || map.unplotted.length ? { kind: "map", map } : null;
    },
  };
}
