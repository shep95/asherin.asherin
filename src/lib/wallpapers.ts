// Wallpapers ship as WebP (1920w, ~80KB avg) plus a 360w thumbnail variant
// served from /public/wallpapers/. Previously the picker loaded twenty 2-3MB
// PNGs (~48MB) on open; the thumb variants drop that to ~120KB total.
// Full wallpaper bundle: 47MB PNG -> 2MB WebP after conversion.

export interface WallpaperOption {
  key: string;
  label: string;
  src: string;   // full-resolution background (WebP, ≤1920w)
  thumb: string; // picker thumbnail (WebP, 360w)
}

const url = (file: string) => `/wallpapers/${file}`;

const entry = (key: string, label: string, file: string): WallpaperOption => ({
  key,
  label,
  src: url(`${file}.webp`),
  thumb: url(`${file}.thumb.webp`),
});

export const ALL_WALLPAPERS: WallpaperOption[] = [
  entry("default", "Original", "hero-bg"),
  entry("raven", "Raven", "wallpaper-raven"),
  entry("eclipse", "Eclipse", "wallpaper-eclipse"),
  entry("glitch", "Glitch", "wallpaper-glitch"),
  entry("aureon", "Aureon", "wallpaper-aureon"),
  entry("seraph", "Seraph", "wallpaper-seraph"),
  entry("prophet", "Prophet", "wallpaper-prophet"),
  entry("nexus", "Nexus", "wallpaper-nexus"),
  entry("sentinel", "Sentinel", "wallpaper-sentinel"),
  entry("inferno", "Inferno", "wallpaper-inferno"),
  entry("sorrow", "Sorrow", "wallpaper-sorrow"),
  entry("silhouette", "Silhouette", "wallpaper-silhouette"),
  entry("phantom", "Phantom", "wallpaper-phantom"),
  entry("abyss", "Abyss", "wallpaper-abyss"),
  entry("stealth", "Stealth", "wallpaper-stealth"),
  entry("static", "Static", "wallpaper-static"),
  entry("mane", "Mane", "wallpaper-mane"),
  entry("impact", "Impact", "wallpaper-impact"),
  entry("oracle", "Oracle", "wallpaper-oracle"),
  entry("ascend", "Ascend", "wallpaper-ascend"),
  entry("cosmos", "Cosmos", "wallpaper-cosmos"),
];

export const getWallpaperSrc = (key: string, fallback?: string): string => {
  const wp = ALL_WALLPAPERS.find((w) => w.key === key);
  return wp?.src || fallback || ALL_WALLPAPERS[0].src;
};

export const getWallpaperThumb = (key: string): string => {
  const wp = ALL_WALLPAPERS.find((w) => w.key === key);
  return wp?.thumb || ALL_WALLPAPERS[0].thumb;
};
