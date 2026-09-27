// eagle.eye — company, site, zone and authorized device configuration.
//
// Eagle Eye is a building security console. It operates cameras and sensors the
// company owns or is contractually authorized to operate, and every device
// carries the attestation that says which. There is no discovery of third party
// cameras here and there never will be: a console that quietly reaches other
// people's equipment is not a security product, it is an intrusion.
//
// Configuration is stored per operator on this device. Nothing is uploaded by
// this module.

import type { AuthorizedDevice, SiteConfig, SiteZone } from "./types";

const KEY = "asherin.arvision.site.v1";

export const AUTHORIZATION_BASES: Array<{ id: AuthorizedDevice["authorization"] extends null ? never : NonNullable<AuthorizedDevice["authorization"]>["basis"]; label: string }> = [
  { id: "owned", label: "owned by this company" },
  { id: "operated_under_contract", label: "operated under a service contract" },
  { id: "written_authorization", label: "written authorization from the owner" },
];

export const AUTHORIZATION_STATEMENT =
  "connect only cameras and sensors this company owns or is authorized in writing to operate. eagle.eye does not discover, access or decode third party equipment.";

export function emptySite(): SiteConfig {
  return {
    siteId: `site_${Date.now().toString(36)}`,
    companyName: "",
    siteName: "",
    zones: [],
    devices: [],
    acknowledgedAuthorizationAtMs: null,
  };
}

function isZone(v: unknown): v is SiteZone {
  const z = v as Partial<SiteZone>;
  return !!z && typeof z.id === "string" && typeof z.name === "string";
}

export function loadSite(): SiteConfig {
  if (typeof localStorage === "undefined") return emptySite();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySite();
    const parsed = JSON.parse(raw) as Partial<SiteConfig>;
    if (!parsed || typeof parsed.siteId !== "string") return emptySite();
    return {
      siteId: parsed.siteId,
      companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
      siteName: typeof parsed.siteName === "string" ? parsed.siteName : "",
      zones: Array.isArray(parsed.zones) ? parsed.zones.filter(isZone) : [],
      devices: Array.isArray(parsed.devices) ? (parsed.devices as AuthorizedDevice[]).filter((d) => d && typeof d.id === "string") : [],
      acknowledgedAuthorizationAtMs:
        typeof parsed.acknowledgedAuthorizationAtMs === "number" ? parsed.acknowledgedAuthorizationAtMs : null,
    };
  } catch {
    return emptySite();
  }
}

export function saveSite(site: SiteConfig): SiteConfig {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...site, devices: site.devices.map((d) => ({ ...d })) }));
    } catch {
      /* storage full or blocked — configuration simply does not persist */
    }
  }
  return site;
}

export function addZone(site: SiteConfig, zone: Omit<SiteZone, "id">): SiteConfig {
  const next: SiteConfig = {
    ...site,
    zones: [...site.zones, { ...zone, id: `zone_${Date.now().toString(36)}_${site.zones.length}` }],
  };
  return saveSite(next);
}

export function removeZone(site: SiteConfig, zoneId: string): SiteConfig {
  return saveSite({
    ...site,
    zones: site.zones.filter((z) => z.id !== zoneId),
    devices: site.devices.map((d) => (d.zoneId === zoneId ? { ...d, zoneId: null } : d)),
  });
}

export function authorizeDevice(site: SiteConfig, device: Omit<AuthorizedDevice, "id">): SiteConfig {
  return saveSite({
    ...site,
    devices: [...site.devices, { ...device, id: `dev_${Date.now().toString(36)}_${site.devices.length}` }],
  });
}

export function revokeDevice(site: SiteConfig, deviceId: string): SiteConfig {
  return saveSite({ ...site, devices: site.devices.filter((d) => d.id !== deviceId) });
}

export function acknowledgeAuthorization(site: SiteConfig): SiteConfig {
  return saveSite({ ...site, acknowledgedAuthorizationAtMs: Date.now() });
}

/** A device may go live only when the site is named and authorization attested. */
export function deviceReadiness(site: SiteConfig, device: AuthorizedDevice): { ready: boolean; reason: string } {
  if (!site.acknowledgedAuthorizationAtMs) {
    return { ready: false, reason: "the operator has not acknowledged the authorization statement for this site" };
  }
  if (!device.authorization) {
    return { ready: false, reason: "this device has no recorded authorization basis" };
  }
  return { ready: true, reason: "" };
}
