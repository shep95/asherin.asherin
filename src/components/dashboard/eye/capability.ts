/**
 * asherin.eye — capability truth model.
 *
 * Every control and layer in the eye answers one question before it draws
 * anything: what is this, actually? A false-colour shader is a render. A box
 * around the contact you already picked is a render. An ads-b position from
 * opensky is a public feed. A plate-motion arrow is cartography. The globe is
 * allowed to look cinematic; it is not allowed to imply a sensor it does not
 * have.
 *
 * This module is the single place those answers live, so the label under a
 * button, the chip in the layers sheet and the line in the inspector cannot
 * drift apart from each other.
 */

/** What kind of thing produced the pixels. */
export type CapabilityOrigin =
  /** fetched from a named public source, drawn close to as-received */
  | "public_feed"
  /** computed by this app from data it fetched or observed */
  | "derived"
  /** a picture: shader, silhouette, extrusion, symbol. no measurement. */
  | "render"
  /** supplied by the operator (uploaded photo, drawn shape, typed place) */
  | "operator"
  /** language model output, only ever used to choose sources, never coordinates */
  | "model";

/** Runtime truth state, shown at the point of use. */
export type CapabilityState =
  /** a public source answered recently */
  | "live"
  /** computed from real inputs, correctness bounded by those inputs */
  | "derived"
  /** a picture only — carries no measurement */
  | "visualization"
  /** cannot run until a key/config is bound */
  | "requires_key"
  /** last attempt failed; anything on screen is older than it looks */
  | "degraded"
  /** answered once, but not recently enough to trust as current */
  | "stale"
  /** not wired to anything in this build */
  | "unavailable";

export interface Capability {
  id: string;
  label: string;
  /** the state this capability has when everything is working */
  base: Exclude<CapabilityState, "degraded" | "stale">;
  origin: CapabilityOrigin;
  /** named upstream, or null when nothing external is involved */
  provider: string | null;
  /** how the value came to exist, when it is not a straight passthrough */
  derivation?: string;
  /** the sentence that stops the feature from being read as more than it is */
  limitation: string;
  /** milliseconds after a good read at which the value stops being current */
  staleAfterMs?: number;
}

const cap = (c: Capability): Capability => c;

/**
 * Layers, render styles and controls. Ids match the layer ids and the dom ids
 * used by the eye view so a chip can be looked up from whatever is on screen.
 */
export const EYE_CAPABILITIES: Record<string, Capability> = {
  // ── air + orbit ──────────────────────────────────────────────────────────
  flights: cap({
    id: "flights",
    label: "flights",
    base: "live",
    origin: "public_feed",
    provider: "opensky network",
    limitation: "coverage is volunteer receivers; an empty area means unheard, not empty sky",
    staleAfterMs: 45_000,
  }),
  military: cap({
    id: "military",
    label: "military flights",
    base: "live",
    origin: "public_feed",
    provider: "adsb.lol military filter",
    limitation: "only aircraft broadcasting ads-b on a public military hex range",
    staleAfterMs: 60_000,
  }),
  stations: cap({
    id: "stations",
    label: "stations",
    base: "live",
    origin: "public_feed",
    provider: "iss + tiangong ephemeris",
    limitation: "propagated positions, not telemetry from the station",
    staleAfterMs: 120_000,
  }),
  launches: cap({
    id: "launches",
    label: "launches",
    base: "live",
    origin: "public_feed",
    provider: "the space devs",
    limitation: "published schedules; launch times move without notice",
    staleAfterMs: 3_600_000,
  }),
  sats: cap({
    id: "sats",
    label: "satellites",
    base: "derived",
    origin: "derived",
    provider: "celestrak tle",
    derivation: "sgp4 propagation of a published tle to the current clock",
    limitation: "accuracy decays with tle epoch age; not a classified catalogue",
    staleAfterMs: 86_400_000,
  }),
  traffic: cap({
    id: "traffic",
    label: "traffic",
    base: "requires_key",
    origin: "public_feed",
    provider: "tomtom",
    limitation: "needs a bound tomtom key before anything can be requested",
  }),
  ships: cap({
    id: "ships",
    label: "ships",
    base: "requires_key",
    origin: "public_feed",
    provider: "aisstream",
    limitation: "needs a bound aisstream key before anything can be requested",
  }),

  // ── earth ────────────────────────────────────────────────────────────────
  quakes: cap({
    id: "quakes",
    label: "earthquakes",
    base: "live",
    origin: "public_feed",
    provider: "usgs last 24h",
    limitation: "magnitudes are revised after publication",
    staleAfterMs: 900_000,
  }),
  fires: cap({
    id: "fires",
    label: "fires",
    base: "requires_key",
    origin: "public_feed",
    provider: "nasa firms",
    limitation: "needs a bound firms key before anything can be requested",
  }),
  zones: cap({
    id: "zones",
    label: "air quality",
    base: "live",
    origin: "public_feed",
    provider: "open-meteo air quality",
    limitation: "modelled grid values, not a reading from a station on that street",
    staleAfterMs: 3_600_000,
  }),
  lands: cap({
    id: "lands",
    label: "territories",
    base: "live",
    origin: "public_feed",
    provider: "world-atlas admin outlines",
    limitation: "cartographic borders; disputed boundaries are not adjudicated here",
  }),
  future: cap({
    id: "future",
    label: "plate motion",
    base: "visualization",
    origin: "render",
    provider: "pb2002 plate boundaries",
    derivation: "boundary edges drawn with published motion rates extrapolated linearly",
    limitation: "motion arrows over a century are metres — this is not a forecast of future coastlines",
  }),
  brittle: cap({
    id: "brittle",
    label: "infrastructure nodes",
    base: "live",
    origin: "public_feed",
    provider: "openstreetmap + usgs",
    limitation: "mapped public infrastructure tags; not a criticality or target assessment",
    staleAfterMs: 3_600_000,
  }),
  buildings: cap({
    id: "buildings",
    label: "city volumes",
    base: "derived",
    origin: "derived",
    provider: "openstreetmap footprints",
    derivation: "footprints extruded to a tagged height, or a flat 8 m where untagged",
    limitation: "a footprint is a map outline, never a floor plan or an interior",
    staleAfterMs: 3_600_000,
  }),

  // ── public signals ───────────────────────────────────────────────────────
  cameras: cap({
    id: "cameras",
    label: "public cameras",
    base: "live",
    origin: "public_feed",
    provider: "published agency camera catalogues",
    limitation: "only cameras an agency publishes openly; nothing is accessed without permission",
    staleAfterMs: 120_000,
  }),
  radio: cap({
    id: "radio",
    label: "radio stations",
    base: "live",
    origin: "public_feed",
    provider: "radio-browser",
    limitation: "listed broadcast streams at their registered location — not detected transmitters",
    staleAfterMs: 3_600_000,
  }),
  spaceweather: cap({
    id: "spaceweather",
    label: "space weather",
    base: "live",
    origin: "public_feed",
    provider: "noaa planetary k-index",
    limitation: "a global index, not a local field measurement",
    staleAfterMs: 3_600_000,
  }),
  atmo: cap({
    id: "atmo",
    label: "atmosphere",
    base: "visualization",
    origin: "render",
    provider: "nasa gibs ozone tiles + noaa kp",
    derivation: "ozone imagery over a shell whose height is schematic and scaled by the kp index",
    limitation: "shell height is illustrative, not a measured ionospheric profile",
    staleAfterMs: 3_600_000,
  }),
  engine: cap({
    id: "engine",
    label: "place pins",
    base: "derived",
    origin: "derived",
    provider: "public geocoders",
    derivation: "a typed place resolved by a geocoder and pinned",
    limitation: "a pin is where a public index says the name is, not a confirmed address",
  }),

  // ── analysis ─────────────────────────────────────────────────────────────
  dark: cap({
    id: "dark",
    label: "coverage gaps",
    base: "derived",
    origin: "derived",
    derivation: "cells where the layers currently enabled returned few or no public points",
    provider: null,
    limitation:
      "a gap is missing public data in this session — never a blackout, jamming or intercept finding",
  }),
  route: cap({
    id: "route",
    label: "weather-weighted route",
    base: "derived",
    origin: "derived",
    provider: "osrm + open-meteo",
    derivation: "a public driving route re-costed by forecast wind and precipitation",
    limitation: "an ordinary road route with a weather weight; no quantum or predictive routing exists here",
  }),
  avoid: cap({
    id: "avoid",
    label: "observation density grid",
    base: "derived",
    origin: "derived",
    provider: null,
    derivation: "ads-b fixes this deployment recorded, tallied into 0.25° cells and compared to their own ring",
    limitation:
      "a thin cell means this system observed less there — it is not evidence that aircraft avoid the area",
  }),

  // ── render styles ────────────────────────────────────────────────────────
  "style:normal": cap({
    id: "style:normal",
    label: "normal",
    base: "visualization",
    origin: "render",
    provider: null,
    limitation: "no post-processing",
  }),
  "style:crt": cap({
    id: "style:crt",
    label: "crt",
    base: "visualization",
    origin: "render",
    provider: null,
    limitation: "scanline shader over the rendered globe",
  }),
  "style:nvg": cap({
    id: "style:nvg",
    label: "green tint",
    base: "visualization",
    origin: "render",
    provider: null,
    limitation: "a green tint of the daylight render — no image intensifier, no low-light sensor",
  }),
  "style:falsecolor": cap({
    id: "style:falsecolor",
    label: "false colour",
    base: "visualization",
    origin: "render",
    provider: null,
    derivation: "an iron palette mapped onto the brightness of the rendered map imagery",
    limitation: "thermal-style colours only — no infrared sensor, no temperature anywhere in this view",
  }),
  "style:saturation": cap({
    id: "style:saturation",
    label: "saturation",
    base: "visualization",
    origin: "render",
    provider: null,
    limitation: "colour boost on the render",
  }),
  "style:noir": cap({
    id: "style:noir",
    label: "noir",
    base: "visualization",
    origin: "render",
    provider: null,
    limitation: "monochrome contrast curve on the render",
  }),

  // ── controls ─────────────────────────────────────────────────────────────
  trackbox: cap({
    id: "trackbox",
    label: "track box",
    base: "visualization",
    origin: "render",
    provider: null,
    derivation: "a reticle drawn at the screen position of the contact you selected",
    limitation: "it follows your selection — there is no object detector running on this view",
  }),
  hangar: cap({
    id: "hangar",
    label: "airframe model",
    base: "visualization",
    origin: "render",
    provider: null,
    derivation: "a model class chosen from the icao type designator or emitter category",
    limitation: "a class stand-in — never the exact geometry of that tail number",
  }),
  photorealGoogle: cap({
    id: "photorealGoogle",
    label: "photoreal 3d tiles",
    base: "requires_key",
    origin: "public_feed",
    provider: "google photorealistic 3d tiles",
    limitation: "streams only when a maps key is bound; otherwise the globe uses flat satellite imagery",
  }),
  localGeometry: cap({
    id: "localGeometry",
    label: "local 3d geometry",
    base: "derived",
    origin: "derived",
    provider: "openstreetmap",
    derivation: "extruded footprints generated in the browser",
    limitation: "generated blocks, not captured photogrammetry",
  }),
  property: cap({
    id: "property",
    label: "place dossier",
    base: "derived",
    origin: "derived",
    provider: "openstreetmap · wikipedia · us census",
    derivation: "public index records collected per source and shown per source",
    limitation:
      "public indexes only — not deeds, not occupancy, not criminal records, and an unknown field stays unknown",
  }),
  recorder: cap({
    id: "recorder",
    label: "density recorder",
    base: "derived",
    origin: "operator",
    provider: null,
    derivation: "opt-in: the ads-b contacts already on your screen are counted into the shared grid",
    limitation: "off by default; the shared grid keeps per-cell counts, and retention is not published here",
  }),
  intent: cap({
    id: "intent",
    label: "geospatial intent",
    base: "derived",
    origin: "model",
    provider: "asherin-eye-brain",
    derivation: "a sentence is turned into a plan of public-source lookups, which are then executed",
    limitation: "the model picks sources; every coordinate drawn came back from a public source, never from the model",
  }),
  exif: cap({
    id: "exif",
    label: "photo pin",
    base: "derived",
    origin: "operator",
    provider: null,
    derivation: "gps tags read in the browser from an image you supplied",
    limitation: "reads only what the file carries; a stripped photo stays unplaceable",
  }),
};

/** Words the eye is never allowed to use about itself. */
export const FORBIDDEN_CLAIMS = [
  "thermal sensing",
  "thermal sensor",
  "infrared sensor",
  "temperature reading",
  "object detection",
  "blackout detection",
  "intercept",
  "jamming detected",
  "transmitter detected",
  "exact owner",
  "deed",
  "criminal record",
  "threat detection",
  "quantum routing",
  "avoiding",
  "future coastline",
];

export function capabilityFor(id: string): Capability | null {
  return EYE_CAPABILITIES[id] || null;
}

export interface HealthLike {
  status?: "idle" | "loading" | "ok" | "error" | "stale";
  lastError?: string | null;
}

/**
 * Runtime state = what the capability is, corrected by what actually happened.
 * A missing key outranks everything: it cannot be stale if it never ran.
 */
export function stateFor(id: string, health?: HealthLike | null): CapabilityState {
  const c = capabilityFor(id);
  if (!c) return "unavailable";
  if (c.base === "requires_key") return "requires_key";
  if (health?.status === "error") return "degraded";
  if (health?.status === "stale") return "stale";
  return c.base as CapabilityState;
}

const STATE_WORD: Record<CapabilityState, string> = {
  live: "live",
  derived: "derived",
  visualization: "render only",
  requires_key: "needs key",
  degraded: "degraded",
  stale: "stale",
  unavailable: "unavailable",
};

export function stateWord(state: CapabilityState): string {
  return STATE_WORD[state] || state;
}

/** Compact chip text: provider or derivation, then the honest state. */
export function chipFor(id: string, health?: HealthLike | null): string {
  const c = capabilityFor(id);
  if (!c) return "unavailable";
  const state = stateFor(id, health);
  const who = c.provider || (c.origin === "render" ? "rendered here" : "computed here");
  return `${who} · ${stateWord(state)}`;
}

/** One-line honesty sentence used for tooltips and inspector footers. */
export function limitationFor(id: string): string {
  return capabilityFor(id)?.limitation || "not wired to a source in this build";
}
