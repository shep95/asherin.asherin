// Asherin Cloud Intelligence → Map bridge.
//
// Turns the intelligence substrate (contacts, venues, signals, security events)
// into map-ready GeoJSON features. Every feature carries a provenance tag so
// the map can always answer: where did this coordinate come from?

import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/asher/directions";
import type { Venue } from "@/lib/cloudIntel/movement";

export type CloudEntityKind = "contact" | "venue" | "security" | "relationship";

export interface CloudMapFeature {
  id: string;
  kind: CloudEntityKind;
  lat: number;
  lng: number;
  label: string;
  caption: string;
  confidence: number; // 0–1
  source: string;
  sourceUrl?: string;
  occurredAt?: string;
  payload: Record<string, any>;
  /** Dossier / report identifiers that can be opened in the right-hand panel. */
  dossierId?: string;
  subjectEmail?: string;
  subjectName?: string;
  /** For relationship edges, the target coordinate. */
  to?: LatLng;
  /** For relationship edges, the target label. */
  toLabel?: string;
}

export interface CloudMapLayer {
  contacts: CloudMapFeature[];
  venues: CloudMapFeature[];
  security: CloudMapFeature[];
  relationships: CloudMapFeature[];
}

export interface CloudMapQuery {
  contacts?: boolean;
  venues?: boolean;
  security?: boolean;
  relationships?: boolean;
  limit?: number;
  sinceDays?: number;
}

export interface VenueInput {
  label: string;
  address?: string;
  lat?: number;
  lng?: number;
  visits?: number;
  totalHours?: number;
  nextPredicted?: string;
  confidence?: number;
  source?: string;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface GeocodeCache {
  address: string;
  lat: number;
  lng: number;
  display: string;
}

const geoCache = new Map<string, GeocodeCache | null>();

const clean = (raw: string): string =>
  raw.replace(/\s+/g, " ").replace(/\bhttps?:\/\/\S+/gi, "").trim();

async function geocode(address: string): Promise<GeocodeCache | null> {
  const key = clean(address).toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key) ?? null;

  try {
    const url = `${NOMINATIM}/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(clean(address))}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("nominatim_failed");
    const hits = (await r.json()) as Array<any>;
    if (!hits?.length) {
      geoCache.set(key, null);
      return null;
    }
    const h = hits[0];
    const out: GeocodeCache = {
      address: key,
      lat: parseFloat(h.lat),
      lng: parseFloat(h.lon),
      display: h.display_name || clean(address),
    };
    geoCache.set(key, out);
    return out;
  } catch (e) {
    console.error("[cloudMapBridge] geocode failed:", e);
    geoCache.set(key, null);
    return null;
  }
}

/** Extract every location string from a dossier payload. */
function locationsFromDossier(dossier: Record<string, any>): string[] {
  const out = new Set<string>();
  const push = (v: any) => {
    if (typeof v === "string" && v.length > 3) out.add(v);
  };
  const walk = (obj: any, depth = 0) => {
    if (!obj || depth > 8) return;
    if (Array.isArray(obj)) {
      obj.forEach((item) => walk(item, depth + 1));
    } else if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        const kl = k.toLowerCase();
        if (
          kl.includes("address") ||
          kl.includes("location") ||
          kl.includes("venue") ||
          kl.includes("city") ||
          kl.includes("country") ||
          kl.includes("place") ||
          kl.includes("coordinates") ||
          kl === "lat" ||
          kl === "lng" ||
          kl === "latitude" ||
          kl === "longitude"
        ) {
          push(v);
        } else if (typeof v === "object") {
          walk(v, depth + 1);
        }
      }
    }
  };
  walk(dossier);
  return [...out].filter(Boolean);
}

/** Prefer explicit lat/lng in a dossier when present. */
function explicitLatLng(dossier: Record<string, any>): LatLng | null {
  const pick = (obj: any): LatLng | null => {
    if (!obj || typeof obj !== "object") return null;
    const lat = Number(
      obj.latitude ?? obj.lat ?? obj?.location?.latitude ?? obj?.coordinates?.lat ?? obj?.coordinates?.latitude ?? NaN
    );
    const lng = Number(
      obj.longitude ?? obj.lng ?? obj?.location?.longitude ?? obj?.coordinates?.lng ?? obj?.coordinates?.longitude ?? NaN
    );
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    return null;
  };
  if (!dossier || typeof dossier !== "object") return null;
  return pick(dossier) || pick(dossier.location) || pick(dossier.coordinates) || null;
}

async function contactFeatures(userId: string, limit: number): Promise<CloudMapFeature[]> {
  const out: CloudMapFeature[] = [];
  const { data: dossiers } = await supabase
    .from("mesh_dossiers")
    .select("id, subject_name, subject_email, relationship, dossier, confidence, source_account, built_at")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("priority", { ascending: false })
    .limit(limit);

  if (!dossiers) return out;

  for (const d of dossiers) {
    const dossier = (d.dossier || {}) as Record<string, any>;
    const explicit = explicitLatLng(dossier);
    if (explicit) {
      out.push({
        id: `dossier-${d.id}`,
        kind: "contact",
        lat: explicit.lat,
        lng: explicit.lng,
        label: d.subject_name || "Unknown contact",
        caption: `Explicit coordinates in dossier${d.source_account ? ` · ${d.source_account}` : ""}`,
        confidence: Math.min(1, Math.max(0.3, Number(d.confidence) || 0.7)),
        source: "mesh_dossier",
        dossierId: d.id,
        subjectEmail: d.subject_email,
        subjectName: d.subject_name,
        payload: dossier,
      });
      continue;
    }

    const locations = locationsFromDossier(dossier);
    if (!locations.length) continue;

    for (const loc of locations.slice(0, 2)) {
      const g = await geocode(loc);
      if (!g) continue;
      out.push({
        id: `dossier-${d.id}-${g.lat.toFixed(4)}-${g.lng.toFixed(4)}`,
        kind: "contact",
        lat: g.lat,
        lng: g.lng,
        label: d.subject_name || "Unknown contact",
        caption: `Derived from dossier location: ${g.display}${d.source_account ? ` · ${d.source_account}` : ""}`,
        confidence: Math.min(0.75, Math.max(0.25, (Number(d.confidence) || 0.5) * 0.8)),
        source: "mesh_dossier_geocoded",
        dossierId: d.id,
        subjectEmail: d.subject_email,
        subjectName: d.subject_name,
        payload: { locationHint: loc, dossier },
      });
    }
  }

  return out;
}

export async function venueFeatures(venues: VenueInput[]): Promise<CloudMapFeature[]> {
  const out: CloudMapFeature[] = [];
  for (const v of venues) {
    let lat = v.lat;
    let lng = v.lng;
    let caption = `${v.visits ?? 0} visits · ${v.totalHours ?? 0}h scheduled`;
    let source = v.source || "calendar_prophet";
    if (v.nextPredicted) caption += ` · next predicted ${new Date(v.nextPredicted).toLocaleDateString()}`;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (!v.address) continue;
      const g = await geocode(v.address);
      if (!g) continue;
      lat = g.lat;
      lng = g.lng;
      caption += ` · geocoded: ${g.display}`;
      source = "calendar_prophet_geocoded";
    }

    out.push({
      id: `venue-${v.label}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      kind: "venue",
      lat,
      lng,
      label: v.label,
      caption,
      confidence: Math.min(1, Math.max(0.3, v.confidence ?? 0.6)),
      source,
      payload: v,
    });
  }
  return out;
}

export async function pendingVenueFeatures(venues: Venue[]): Promise<CloudMapFeature[]> {
  const inputs: VenueInput[] = venues.map((v) => ({
    label: v.label,
    address: v.label,
    visits: v.visits.length,
    totalHours: v.totalHours,
    nextPredicted: v.nextExpectedAt ? new Date(v.nextExpectedAt).toISOString() : undefined,
    confidence: v.patternConfidence / 100,
    source: "calendar_prophet",
  }));
  return venueFeatures(inputs);
}


async function securityFeatures(sinceDays: number): Promise<CloudMapFeature[]> {
  const out: CloudMapFeature[] = [];
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();

  const { data: securityEvents } = await supabase
    .from("security_events")
    .select("id, event_type, severity, source_ip, geo_country, geo_city, metadata, created_at, detection_rule, action_taken")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!securityEvents) return out;

  for (const e of securityEvents) {
    const metadata = (e.metadata || {}) as Record<string, any>;
    const explicit = explicitLatLng(metadata);
    const locations = explicit ? [] : locationsFromDossier(metadata);
    const locationStrings = [
      explicit ? null : e.geo_city && e.geo_country ? `${e.geo_city}, ${e.geo_country}` : null,
      e.geo_country,
      locations.length ? locations[0] : null,
    ].filter(Boolean) as string[];

    const resolve = async (): Promise<LatLng | null> => {
      if (explicit) return explicit;
      for (const addr of locationStrings) {
        const g = await geocode(addr);
        if (g) return { lat: g.lat, lng: g.lng };
      }
      return null;
    };

    const pos = await resolve();
    if (!pos) continue;

    out.push({
      id: `sec-${e.id}`,
      kind: "security",
      lat: pos.lat,
      lng: pos.lng,
      label: e.event_type || "Security event",
      caption: `${e.event_type} · severity ${e.severity ?? "unknown"}${e.source_ip ? ` · IP ${e.source_ip}` : ""}${e.geo_city ? ` · ${e.geo_city}, ${e.geo_country || ""}` : ""} · ${e.detection_rule} → ${e.action_taken}${e.created_at ? ` · ${new Date(e.created_at).toLocaleString()}` : ""}`,
      confidence: 0.7,
      source: "security_events",
      occurredAt: e.created_at,
      payload: e as unknown as Record<string, any>,
    });
  }

  return out;
}

async function signalFeatures(userId: string, sinceDays: number): Promise<CloudMapFeature[]> {
  const out: CloudMapFeature[] = [];
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();

  const { data: signals } = await supabase
    .from("google_signals")
    .select("id, source, kind, actor_email, actor_name, subject, snippet, metadata, occurred_at")
    .eq("user_id", userId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (!signals) return out;

  for (const s of signals) {
    const metadata = (s.metadata || {}) as Record<string, any>;
    const locations = locationsFromDossier(metadata);
    if (!locations.length) continue;
    const g = await geocode(locations[0]);
    if (!g) continue;
    out.push({
      id: `sig-${s.id}`,
      kind: "security",
      lat: g.lat,
      lng: g.lng,
      label: s.actor_name || s.actor_email || s.source,
      caption: `${s.kind} · ${s.subject || s.snippet || ""}`.trim(),
      confidence: 0.5,
      source: `google_signals:${s.source}`,
      occurredAt: s.occurred_at,
      subjectEmail: s.actor_email,
      subjectName: s.actor_name,
      payload: s as unknown as Record<string, any>,
    });
  }

  return out;
}

function relationshipFeatures(contacts: CloudMapFeature[]): CloudMapFeature[] {
  const out: CloudMapFeature[] = [];
  const grouped = new Map<string, CloudMapFeature[]>();
  for (const c of contacts) {
    if (!c.dossierId) continue;
    const list = grouped.get(c.dossierId) || [];
    list.push(c);
    grouped.set(c.dossierId, list);
  }

  for (const [, list] of grouped) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      out.push({
        id: `rel-${a.id}-${b.id}`,
        kind: "relationship",
        lat: a.lat,
        lng: a.lng,
        to: { lat: b.lat, lng: b.lng },
        label: "Inferred link",
        toLabel: b.label,
        caption: `${a.label} ↔ ${b.label}`,
        confidence: 0.4,
        source: "relationship_inferred",
        payload: { a, b },
      });
    }
  }
  return out;
}

export async function loadCloudMapLayer(q: CloudMapQuery = {}): Promise<CloudMapLayer> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return { contacts: [], venues: [], security: [], relationships: [] };

  const [contacts, venues, securityEvents, signalEvents] = await Promise.all([
    q.contacts !== false ? contactFeatures(userId, q.limit ?? 50) : Promise.resolve([]),
    q.venues ? venueFeatures([]) : Promise.resolve([]),
    q.security ? securityFeatures(q.sinceDays ?? 30) : Promise.resolve([]),
    q.security ? signalFeatures(userId, q.sinceDays ?? 30) : Promise.resolve([]),
  ]);

  const security = [...securityEvents, ...signalEvents];
  const relationships = q.relationships !== false && contacts.length > 0
    ? relationshipFeatures(contacts)
    : [];

  return { contacts, venues, security, relationships };
}

const PENDING_VENUES_KEY = "asher-cloud-venues-pending";
const PENDING_CONTACTS_KEY = "asher-cloud-contacts-pending";

export function setPendingVenues(venues: Venue[]) {
  try {
    localStorage.setItem(PENDING_VENUES_KEY, JSON.stringify(venues));
  } catch {}
}

export function getPendingVenues(): Venue[] {
  try {
    const raw = localStorage.getItem(PENDING_VENUES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearPendingVenues() {
  try {
    localStorage.removeItem(PENDING_VENUES_KEY);
  } catch {}
}

export interface PendingContact {
  name: string;
  email?: string;
  location?: string;
  organization?: string;
  source?: string;
}

export function setPendingContacts(contacts: PendingContact[]) {
  try {
    localStorage.setItem(PENDING_CONTACTS_KEY, JSON.stringify(contacts));
  } catch {}
}

export function getPendingContacts(): PendingContact[] {
  try {
    const raw = localStorage.getItem(PENDING_CONTACTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearPendingContacts() {
  try {
    localStorage.removeItem(PENDING_CONTACTS_KEY);
  } catch {}
}

export async function pendingContactFeatures(contacts: PendingContact[]): Promise<CloudMapFeature[]> {
  const out: CloudMapFeature[] = [];
  for (const c of contacts) {
    if (!c.location) continue;
    const g = await geocode(c.location);
    if (!g) continue;
    out.push({
      id: `pending-contact-${c.email || c.name}-${g.lat.toFixed(4)}-${g.lng.toFixed(4)}`,
      kind: "contact",
      lat: g.lat,
      lng: g.lng,
      label: c.name,
      caption: `${c.organization || "Contact"} · ${c.location}${c.email ? ` · ${c.email}` : ""}`,
      confidence: 0.65,
      source: c.source || "cloud_intelligence_pending",
      subjectEmail: c.email,
      subjectName: c.name,
      payload: c,
    });
  }
  return out;
}


export function clearCloudMapCache() {
  geoCache.clear();
}
