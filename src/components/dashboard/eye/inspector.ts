/**
 * asherin.eye — selected-entity inspector model.
 *
 * Clicking a contact used to only start a camera mode; everything else about
 * it lived in a hover card that vanished. This builds one contextual model per
 * entity kind: the fields the feed actually delivered, the provenance of the
 * layer it came from, and the actions that can genuinely run right now. A
 * field that the source did not send is absent — never filled with a plausible
 * looking value, never labelled "unknown" when the source simply was not asked.
 */

import { capabilityFor, chipFor, limitationFor, stateFor, type CapabilityState } from "./capability";
import type { FeedSnapshot } from "./health";

export interface InspectorField {
  k: string;
  v: string;
  /** set when the source was asked and had nothing */
  unknown?: boolean;
}

export interface InspectorAction {
  id: string;
  label: string;
  enabled: boolean;
  /** why it is disabled — shown instead of letting the operator find out by clicking */
  reason?: string;
}

export interface InspectorModel {
  title: string;
  kind: string;
  kindLabel: string;
  state: CapabilityState;
  chip: string;
  fields: InspectorField[];
  actions: InspectorAction[];
  limitation: string;
  /** external link the source published, when it published one */
  url?: string;
  image?: string;
}

export interface EntityMeta {
  kind?: string;
  label?: string;
  lat?: number | null;
  lon?: number | null;
  url?: string;
  image?: string;
  note?: string;
  credit?: string;
  city?: string;
  roadway?: string;
  direction?: string;
  km?: number;
  /** aircraft */
  callsign?: string;
  hex?: string;
  type?: string;
  category?: string;
  alt?: number | null;
  speed?: number | null;
  heading?: number | null;
  origin?: string;
  ground?: boolean;
  /** quake */
  mag?: number | null;
  depth?: number | null;
  at?: string | number;
  /** satellite */
  epoch?: string | number;
  group?: string;
  /** derived cell */
  samples?: number;
  contacts?: number;
  ringMedian?: number;
  hours?: number;
  [k: string]: unknown;
}

export interface InspectorContext {
  /** health of the layer that produced this entity */
  health?: FeedSnapshot | null;
  /** does this session hold observed fixes for the entity */
  historyPoints?: number;
  /** is a measurement mode available right now */
  canMeasure?: boolean;
  /** is the globe able to fly (viewer alive) */
  canFly?: boolean;
}

const KIND_LABEL: Record<string, string> = {
  flights: "aircraft · ads-b contact",
  military: "aircraft · military ads-b contact",
  sats: "satellite · propagated from tle",
  stations: "crewed station · published ephemeris",
  quakes: "earthquake · usgs event",
  cameras: "public camera · agency published frame",
  radio: "broadcast station · registered location",
  brittle: "mapped infrastructure node",
  launches: "launch pad · scheduled event",
  engine: "place pin · geocoded",
  lands: "territory outline",
  dark: "coverage gap cell · derived",
  avoid: "observation density cell · derived",
  zones: "air quality cell · modelled",
  buildings: "building footprint · extruded",
};

const n = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function push(fields: InspectorField[], k: string, v: unknown, suffix = "") {
  if (v === null || v === undefined || v === "") return;
  fields.push({ k, v: `${v}${suffix}` });
}

function isoish(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().replace("T", " ").slice(0, 19) + "z";
}

export function buildInspector(meta: EntityMeta, ctx: InspectorContext = {}): InspectorModel {
  const kind = String(meta.kind || "unknown");
  const capId = kind === "military" ? "military" : kind;
  const state = stateFor(capId, ctx.health);
  const fields: InspectorField[] = [];

  const lat = n(meta.lat);
  const lon = n(meta.lon);
  if (lat !== null && lon !== null) {
    push(fields, "position", `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }

  if (kind === "flights" || kind === "military") {
    push(fields, "callsign", meta.callsign || meta.label);
    push(fields, "icao hex", meta.hex);
    push(fields, "type", meta.type);
    push(fields, "category", meta.category);
    push(fields, "altitude", n(meta.alt) === null ? null : Math.round(n(meta.alt) as number), " m");
    push(fields, "ground speed", n(meta.speed) === null ? null : Math.round(n(meta.speed) as number), " kt");
    push(fields, "heading", n(meta.heading) === null ? null : Math.round(n(meta.heading) as number), "°");
    push(fields, "origin country", meta.origin);
    if (meta.ground) push(fields, "state", "on ground");
    if (!meta.type) {
      fields.push({ k: "type", v: "not broadcast by this contact", unknown: true });
    }
    push(fields, "observed fixes", ctx.historyPoints || null);
  } else if (kind === "quakes") {
    push(fields, "magnitude", n(meta.mag));
    push(fields, "depth", n(meta.depth) === null ? null : n(meta.depth), " km");
    push(fields, "time", isoish(meta.at));
  } else if (kind === "sats" || kind === "stations") {
    push(fields, "catalogue group", meta.group);
    const epoch = isoish(meta.epoch);
    if (epoch) {
      push(fields, "tle epoch", epoch);
      push(fields, "shown position", "propagated to now from that epoch");
    } else {
      fields.push({ k: "tle epoch", v: "not exposed by this feed", unknown: true });
    }
  } else if (kind === "cameras") {
    push(fields, "agency", meta.credit);
    push(fields, "roadway", meta.roadway);
    push(fields, "direction", meta.direction);
    push(fields, "city", meta.city);
    push(fields, "distance", n(meta.km) === null ? null : n(meta.km), " km");
  }

  push(fields, "source note", meta.note);
  if (ctx.health) {
    push(fields, "feed", `${ctx.health.provider || "public source"} · ${ctx.health.freshness}`);
  }

  const canFly = ctx.canFly !== false && lat !== null && lon !== null;
  const isContact = kind === "flights" || kind === "military";
  const actions: InspectorAction[] = [
    { id: "fly", label: "fly here", enabled: canFly, reason: canFly ? undefined : "this entity carries no coordinate" },
    {
      id: "measure",
      label: "measure from here",
      enabled: !!ctx.canMeasure && lat !== null && lon !== null,
      reason: ctx.canMeasure ? undefined : "turn measure on first",
    },
    {
      id: "nearby",
      label: "what is nearby",
      enabled: lat !== null && lon !== null,
      reason: lat === null ? "no coordinate to search around" : undefined,
    },
    {
      id: "track",
      label: "camera modes",
      enabled: isContact,
      reason: isContact ? undefined : "camera modes follow moving contacts only",
    },
    {
      id: "history",
      label: "track history",
      enabled: isContact && (ctx.historyPoints || 0) > 1,
      reason: !isContact
        ? "history is kept for moving contacts only"
        : (ctx.historyPoints || 0) > 1
          ? undefined
          : "no second fix observed yet this session",
    },
    {
      id: "source",
      label: "open source page",
      enabled: !!meta.url,
      reason: meta.url ? undefined : "this source published no link",
    },
  ];

  return {
    title: String(meta.label || meta.callsign || kind),
    kind,
    kindLabel: KIND_LABEL[kind] || capabilityFor(capId)?.label || kind,
    state,
    chip: chipFor(capId, ctx.health),
    fields,
    actions,
    limitation: limitationFor(capId),
    url: meta.url,
    image: meta.image,
  };
}
