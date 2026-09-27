// Dashboard appearance — the operator decides whether the workspace sits on a
// photograph or on a flat colour. Two modes, one source of truth, no second
// wallpaper system.
//
// Storage keys keep the historical `aureon_` prefix because existing installs
// already hold `aureon_wallpaper`; renaming them would silently reset every
// operator's surface. The user-visible speaker is asherin.

export type DashboardBgMode = "wallpaper" | "color";

export const APPEARANCE_EVENT = "asherin-dashboard-appearance";

export const BG_MODE_KEY = "aureon_dash_bg_mode";
export const BG_COLOR_KEY = "aureon_dash_bg_color";
export const BG_DIM_KEY = "aureon_dash_bg_dim";
export const WALLPAPER_KEY = "aureon_wallpaper";

export const DEFAULT_BG_COLOR = "#0B0B0D";
/** Glass veil over the flat colour so cards keep an edge. Never the 80% photo scrim. */
export const DEFAULT_DIM = 12;
export const MAX_DIM = 40;

export interface DashboardAppearance {
  mode: DashboardBgMode;
  color: string;
  /** 0–40, percent of black laid over the colour. */
  dim: number;
}

export interface CuratedSwatch {
  key: string;
  label: string;
  hex: string;
}

/** Dark-first, cinematic. No candy row. */
export const CURATED_SWATCHES: CuratedSwatch[] = [
  { key: "void", label: "void", hex: "#000000" },
  { key: "ink", label: "ink", hex: "#0B0B0D" },
  { key: "graphite", label: "graphite", hex: "#141417" },
  { key: "slate", label: "slate", hex: "#16191F" },
  { key: "warm-black", label: "warm black", hex: "#14100C" },
  { key: "amber-void", label: "amber void", hex: "#1A1409" },
  { key: "cool-black", label: "cool black", hex: "#0A0F16" },
  { key: "deep-green", label: "deep green", hex: "#08120E" },
  { key: "oxblood", label: "oxblood", hex: "#160A0C" },
  { key: "indigo-ash", label: "indigo ash", hex: "#0D0F1C" },
  { key: "bone", label: "bone", hex: "#E8E4DC" },
  { key: "paper", label: "paper", hex: "#F4F2ED" },
];

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Bounded, anchored, no backtracking class — safe on paste of arbitrary text. */
export function isValidHex(value: string): boolean {
  const v = value.trim();
  return v.length <= 7 && HEX_RE.test(v);
}

export function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (!isValidHex(v)) return null;
  if (v.length === 4) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return v.toUpperCase();
}

/** WCAG relative luminance, 0 (black) → 1 (white). */
export function hexLuminance(hex: string): number {
  const full = normalizeHex(hex) ?? DEFAULT_BG_COLOR;
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(full.slice(1, 3));
  const g = channel(full.slice(3, 5));
  const b = channel(full.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A light hex would leave asherin's pale type invisible. Rather than repaint
 * the whole token set, the page lays a readable dark scrim over light colours
 * so the operator still sees the tint they picked without white-on-white.
 */
export function isLightBackground(hex: string): boolean {
  return hexLuminance(hex) > 0.45;
}

function readNumber(raw: string | null, fallback: number): number {
  // Number(null) is 0, which would silently erase the default veil.
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DIM, Math.max(0, Math.round(n)));
}

export function readAppearance(): DashboardAppearance {
  try {
    const rawMode = localStorage.getItem(BG_MODE_KEY);
    const mode: DashboardBgMode = rawMode === "color" ? "color" : "wallpaper";
    const color = normalizeHex(localStorage.getItem(BG_COLOR_KEY) ?? "") ?? DEFAULT_BG_COLOR;
    return { mode, color, dim: readNumber(localStorage.getItem(BG_DIM_KEY), DEFAULT_DIM) };
  } catch {
    return { mode: "wallpaper", color: DEFAULT_BG_COLOR, dim: DEFAULT_DIM };
  }
}

/**
 * Write + broadcast in one move. Every caller that changes appearance goes
 * through here, so the dashboard never has to poll and never reloads.
 */
export function writeAppearance(patch: Partial<DashboardAppearance>): DashboardAppearance {
  const next = { ...readAppearance(), ...patch };
  if (patch.color) next.color = normalizeHex(patch.color) ?? next.color;
  next.dim = Math.min(MAX_DIM, Math.max(0, Math.round(next.dim)));
  try {
    localStorage.setItem(BG_MODE_KEY, next.mode);
    localStorage.setItem(BG_COLOR_KEY, next.color);
    localStorage.setItem(BG_DIM_KEY, String(next.dim));
  } catch {
    /* private-mode storage refusal must not break the live preview */
  }
  broadcastAppearance();
  return next;
}

export function broadcastAppearance(): void {
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

/** Hydration from the account row. Falsy/unknown values leave local state alone. */
export function hydrateAppearanceFromDb(
  mode: string | null | undefined,
  color: string | null | undefined,
): DashboardAppearance {
  const patch: Partial<DashboardAppearance> = {};
  if (mode === "color" || mode === "wallpaper") patch.mode = mode;
  const hex = color ? normalizeHex(color) : null;
  if (hex) patch.color = hex;
  return writeAppearance(patch);
}
