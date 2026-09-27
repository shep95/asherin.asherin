import { toObservations, type Observation, type SurfaceSpec } from "./deepDive";

// Adapters that turn Google's heterogeneous record shapes into the single
// Observation contract the inference engine consumes. Keeping every mapper here
// means a change in an upstream payload shape is fixed in one file rather than
// hunted across twenty module components.
//
// Every mapper is defensive: upstream records arrive from a network boundary,
// fields are frequently absent, and toObservations() already discards any row
// whose timestamp cannot be coerced. A malformed record costs one observation,
// never the surface.

/** Gmail message header lookup — headers arrive as an array of {name,value}. */
const header = (msg: any, name: string): string | null => {
  const hs = msg?.payload?.headers ?? msg?.headers;
  if (Array.isArray(hs)) {
    const hit = hs.find((h: any) => String(h?.name ?? "").toLowerCase() === name.toLowerCase());
    if (hit?.value) return String(hit.value);
  }
  const direct = msg?.[name.toLowerCase()];
  return direct ? String(direct) : null;
};

/** Extracts a bare address from "Display Name <user@host>" forms. */
export const emailAddress = (raw: string | null): string | null => {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  const addr = (m ? m[1] : raw).trim().toLowerCase();
  return addr.includes("@") ? addr : null;
};

/** The sending domain is the correspondent that matters for concentration. */
export const emailDomain = (addr: string | null): string | null => {
  if (!addr) return null;
  const at = addr.lastIndexOf("@");
  return at === -1 ? null : addr.slice(at + 1) || null;
};

/**
 * Gmail messages. Entity is the sender address, because "who" is the axis every
 * detector reasons over: concentration, novelty, dormancy and clocking are all
 * statements about correspondents, not about individual messages.
 */
export const gmailObservations = (messages: any[]): Observation[] =>
  toObservations(messages ?? [], (m: any) => {
    const from = emailAddress(header(m, "From"));
    const tags: string[] = [];
    if (m?.isUnread) tags.push("unread");
    if (Array.isArray(m?.labelIds)) tags.push(...m.labelIds.map((l: any) => String(l).toLowerCase()));
    return {
      ts: m?.internalDate ?? m?.date ?? header(m, "Date"),
      entity: from ?? emailDomain(emailAddress(header(m, "From"))) ?? "unknown sender",
      label: header(m, "Subject") ?? "(no subject)",
      tags,
    };
  });

/** Gmail grouped by sending domain rather than individual address. */
export const gmailDomainObservations = (messages: any[]): Observation[] =>
  toObservations(messages ?? [], (m: any) => ({
    ts: m?.internalDate ?? m?.date ?? header(m, "Date"),
    entity: emailDomain(emailAddress(header(m, "From"))) ?? "unknown domain",
    label: header(m, "Subject") ?? "(no subject)",
  }));

/**
 * Drive files. Magnitude is byte size so the magnitude detector can surface
 * outsized artefacts; entity is the owner, which is what makes an unexpected
 * collaborator visible.
 */
export const driveObservations = (files: any[]): Observation[] =>
  toObservations(files ?? [], (f: any) => {
    const owner = f?.owners?.[0]?.emailAddress ?? f?.lastModifyingUser?.emailAddress ?? "you";
    const tags: string[] = [];
    if (f?.shared) tags.push("shared");
    if (f?.trashed) tags.push("trashed");
    if (f?.mimeType) tags.push(String(f.mimeType));
    return {
      ts: f?.modifiedTime ?? f?.createdTime,
      entity: String(owner).toLowerCase(),
      label: f?.name ?? "(untitled)",
      magnitude: f?.quotaBytesUsed ?? f?.size,
      tags,
    };
  });

/** Drive grouped by file type — reveals format concentration and novelty. */
export const driveMimeObservations = (files: any[]): Observation[] =>
  toObservations(files ?? [], (f: any) => ({
    ts: f?.modifiedTime ?? f?.createdTime,
    entity: String(f?.mimeType ?? "unknown/type").replace("application/vnd.google-apps.", "google-"),
    label: f?.name ?? "(untitled)",
    magnitude: f?.quotaBytesUsed ?? f?.size,
  }));

/**
 * Calendar events. Magnitude is duration in minutes, so the magnitude detector
 * flags the meeting that consumed an unreasonable share of a day. All-day
 * events carry a date-only start and are still valid observations.
 */
export const calendarObservations = (events: any[]): Observation[] =>
  toObservations(events ?? [], (e: any) => {
    const startRaw = e?.start?.dateTime ?? e?.start?.date ?? e?.start;
    const endRaw = e?.end?.dateTime ?? e?.end?.date ?? e?.end;
    let minutes: number | null = null;
    const s = Date.parse(String(startRaw));
    const en = Date.parse(String(endRaw));
    if (Number.isFinite(s) && Number.isFinite(en) && en > s) minutes = (en - s) / 60000;

    // The organiser is the entity: it answers "whose time is this actually".
    const organiser = e?.organizer?.email ?? e?.creator?.email ?? "self";
    const tags: string[] = [];
    if (e?.attendees?.length) tags.push(`attendees:${e.attendees.length}`);
    if (e?.recurringEventId) tags.push("recurring");
    if (e?.start?.date && !e?.start?.dateTime) tags.push("all-day");

    return {
      ts: startRaw,
      entity: String(organiser).toLowerCase(),
      label: e?.summary ?? "(busy)",
      magnitude: minutes,
      tags,
    };
  });

/** Calendar grouped by event title — surfaces recurring commitments. */
export const calendarTitleObservations = (events: any[]): Observation[] =>
  toObservations(events ?? [], (e: any) => ({
    ts: e?.start?.dateTime ?? e?.start?.date ?? e?.start,
    entity: String(e?.summary ?? "(busy)").trim().toLowerCase().slice(0, 60),
    label: e?.summary ?? "(busy)",
  }));

/** YouTube watch/like items grouped by channel. */
export const youtubeObservations = (items: any[]): Observation[] =>
  toObservations(items ?? [], (v: any) => {
    const sn = v?.snippet ?? v;
    return {
      ts: sn?.publishedAt ?? v?.contentDetails?.videoPublishedAt,
      entity: sn?.videoOwnerChannelTitle ?? sn?.channelTitle ?? "unknown channel",
      label: sn?.title ?? "(untitled video)",
      magnitude: v?.statistics?.viewCount,
    };
  });

/** Google Fit sessions/points. Magnitude is the measured value. */
export const fitObservations = (points: any[]): Observation[] =>
  toObservations(points ?? [], (p: any) => ({
    ts: p?.startTimeMillis ?? p?.startTimeNanos ?? p?.startTime ?? p?.modifiedTimeMillis,
    entity: p?.dataTypeName ?? p?.activityType ?? p?.name ?? "metric",
    label: p?.name ?? p?.dataTypeName ?? "measurement",
    magnitude: p?.value?.[0]?.intVal ?? p?.value?.[0]?.fpVal ?? p?.steps ?? p?.value,
  }));

/** Contacts — entity is the person, timestamp their last interaction. */
export const contactObservations = (contacts: any[]): Observation[] =>
  toObservations(contacts ?? [], (c: any) => ({
    ts: c?.lastInteraction ?? c?.updated ?? c?.metadata?.sources?.[0]?.updateTime,
    entity:
      c?.email ??
      c?.emailAddresses?.[0]?.value ??
      c?.names?.[0]?.displayName ??
      c?.name ??
      "unknown contact",
    label: c?.names?.[0]?.displayName ?? c?.name ?? c?.email ?? "contact",
  }));

/**
 * OAuth scope grants, one observation per (account, scope). There is no natural
 * event stream here, so the grant/sync time stands in: what matters on this
 * surface is which permissions appeared recently and which accounts stopped
 * reporting, both of which the novelty and dormancy detectors read directly.
 */
export const scopeObservations = (
  accounts: Array<{ google_email?: string; scopes?: string[] | null; last_sync_at?: string | null; created_at?: string | null }>
): Observation[] => {
  const rows: Array<{ ts: unknown; entity: string; label: string }> = [];
  for (const acc of accounts ?? []) {
    const ts = acc?.last_sync_at ?? acc?.created_at;
    for (const scope of acc?.scopes ?? []) {
      const short = String(scope).split("/").pop() ?? String(scope);
      rows.push({ ts, entity: short, label: `${short} — ${acc?.google_email ?? "account"}` });
    }
  }
  return toObservations(rows, (r) => r);
};

/** Convenience builder so modules declare a spec in one readable call. */
export const surface = (
  module: string,
  connected: boolean,
  opts: Partial<SurfaceSpec> & Pick<SurfaceSpec, "unit" | "unitPlural" | "entityNoun" | "entityNounPlural">
): SurfaceSpec => ({ module, connected, ...opts });
