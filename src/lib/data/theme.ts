// asherin.data — visual theme layer for charts and reports.
// Tokens are semantic; a preset only remaps token values, so every chart,
// dashboard and export moves together and contrast stays checkable.

export interface DataTheme {
  id: string;
  label: string;
  /** hsl triplets, matching the css custom property format used app-wide. */
  series: string[];
  surface: string;
  ink: string;
  muted: string;
  grid: string;
  positive: string;
  negative: string;
}

export const DATA_THEMES: DataTheme[] = [
  {
    id: "asherin",
    label: "asherin",
    series: ["43 74% 66%", "0 0% 88%", "205 45% 62%", "24 55% 60%", "150 30% 58%", "280 25% 68%", "0 0% 62%", "12 55% 58%"],
    surface: "0 0% 6%",
    ink: "0 0% 92%",
    muted: "0 0% 58%",
    grid: "0 0% 18%",
    positive: "150 45% 55%",
    negative: "6 60% 58%",
  },
  {
    id: "graphite",
    label: "graphite",
    series: ["0 0% 92%", "0 0% 74%", "0 0% 58%", "0 0% 46%", "0 0% 40%", "0 0% 84%", "0 0% 66%", "0 0% 52%"],
    surface: "0 0% 5%",
    ink: "0 0% 94%",
    muted: "0 0% 60%",
    grid: "0 0% 16%",
    positive: "0 0% 88%",
    negative: "0 0% 52%",
  },
  {
    id: "signal",
    label: "signal",
    series: ["190 70% 60%", "43 74% 66%", "330 45% 65%", "150 40% 58%", "255 40% 68%", "20 60% 62%", "95 35% 58%", "0 0% 78%"],
    surface: "210 25% 7%",
    ink: "0 0% 95%",
    muted: "210 12% 62%",
    grid: "210 18% 18%",
    positive: "150 50% 55%",
    negative: "355 60% 62%",
  },
  {
    id: "paper",
    label: "paper (light exports)",
    series: ["215 45% 38%", "28 60% 45%", "150 35% 34%", "340 40% 45%", "260 32% 45%", "195 45% 38%", "40 45% 42%", "0 0% 35%"],
    surface: "40 20% 97%",
    ink: "0 0% 12%",
    muted: "0 0% 38%",
    grid: "40 10% 85%",
    positive: "150 45% 32%",
    negative: "355 55% 45%",
  },
];

export function getTheme(id: string): DataTheme {
  return DATA_THEMES.find((t) => t.id === id) ?? DATA_THEMES[0];
}

/** Applies the theme's tokens to a container so charts inside it re-colour. */
export function themeStyle(theme: DataTheme): React.CSSProperties {
  const style: Record<string, string> = {
    "--data-surface": theme.surface,
    "--data-ink": theme.ink,
    "--data-muted": theme.muted,
    "--data-grid": theme.grid,
    "--data-positive": theme.positive,
    "--data-negative": theme.negative,
  };
  theme.series.forEach((s, i) => { style[`--data-series-${i + 1}`] = s; });
  return style as React.CSSProperties;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function luminance(triplet: string): number {
  const [h, s, l] = triplet.replace(/%/g, "").split(/\s+/).map(Number);
  const [r, g, b] = hslToRgb(h || 0, s || 0, l || 0).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two hsl triplets. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

export interface ContrastCheck { series: number; ratio: number; passes: boolean }

/** Each series colour must stay legible against the theme surface (3:1 for
 *  graphical objects under WCAG 1.4.11). Failures are shown, not hidden. */
export function checkThemeContrast(theme: DataTheme): ContrastCheck[] {
  return theme.series.map((c, i) => {
    const ratio = contrastRatio(c, theme.surface);
    return { series: i + 1, ratio, passes: ratio >= 3 };
  });
}
