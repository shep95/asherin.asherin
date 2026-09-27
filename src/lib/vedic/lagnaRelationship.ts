// Classify the relationship between two Vedic Lagnas (Rising Signs).
// Returns: "soulmate" | "friend" | "enemy" | "neutral"
// Logic blends:
//   • Same sign           → soulmate (twin lagna)
//   • Trinal (1-5-9)      → soulmate (same element, deepest harmony)
//   • Sextile (3-11)      → friend
//   • Opposite (7th)      → friend (complement / partnership axis)
//   • Sign-lord friendship (Parashari planetary friendship) → friend
//   • Sign-lord enmity                                       → enemy
//   • 6-8 / 2-12 axes (shadashtaka, dwirdwadasha)            → enemy
//   • everything else                                         → neutral

import { rashis } from "@/data/nakshatraData";

export type LagnaRelation = "soulmate" | "friend" | "enemy" | "neutral";

// Parashari natural friendships between planetary lords.
const FRIENDS: Record<string, string[]> = {
  Sun:     ["Moon", "Mars", "Jupiter"],
  Moon:    ["Sun", "Mercury"],
  Mars:    ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus:   ["Mercury", "Saturn"],
  Saturn:  ["Mercury", "Venus"],
};
const ENEMIES: Record<string, string[]> = {
  Sun:     ["Venus", "Saturn"],
  Moon:    [],
  Mars:    ["Mercury"],
  Mercury: ["Moon"],
  Jupiter: ["Mercury", "Venus"],
  Venus:   ["Sun", "Moon"],
  Saturn:  ["Sun", "Moon", "Mars"],
};

// Find a sign index (0-11) by display name like "Mesha (Aries)" or "Mesha".
export function signIndexFromName(name: string | undefined | null): number {
  if (!name) return -1;
  const norm = name.trim().toLowerCase();
  return rashis.findIndex(
    (r) => r.name.toLowerCase() === norm || r.name.toLowerCase().startsWith(norm) || norm.startsWith(r.name.split(" ")[0].toLowerCase()),
  );
}

export function classifyLagnaRelation(aSignIdx: number, bSignIdx: number): LagnaRelation {
  if (aSignIdx < 0 || bSignIdx < 0) return "neutral";

  // 1-based house distance from A → B (1..12)
  const dist = ((bSignIdx - aSignIdx + 12) % 12) + 1;
  const reverse = ((aSignIdx - bSignIdx + 12) % 12) + 1;

  // Soulmate: identical or trinal (1, 5, 9 from each other)
  if (dist === 1 || dist === 5 || dist === 9) return "soulmate";

  // Hard enemy axes first (override lord checks)
  if (dist === 6 || dist === 8 || reverse === 6 || reverse === 8) return "enemy";
  if (dist === 2 || dist === 12) return "enemy"; // dwirdwadasha (mutual 2/12)

  // Friendly axes
  if (dist === 7) return "friend";        // opposite — partnership axis
  if (dist === 3 || dist === 11) return "friend";

  // Fallback: planetary lord friendship between the two Lagna lords
  const a = rashis[aSignIdx]?.ruler;
  const b = rashis[bSignIdx]?.ruler;
  if (a && b) {
    if (a === b) return "friend";
    if (FRIENDS[a]?.includes(b) && FRIENDS[b]?.includes(a)) return "friend";
    if (ENEMIES[a]?.includes(b) || ENEMIES[b]?.includes(a)) return "enemy";
  }

  return "neutral";
}

export function relationColorClass(rel: LagnaRelation): string {
  switch (rel) {
    case "soulmate": return "text-[#ff4fd8] drop-shadow-[0_0_6px_rgba(255,79,216,0.55)]"; // neon pink
    case "friend":   return "text-emerald-400";
    case "enemy":    return "text-red-500";
    default:         return "text-foreground/95";
  }
}

export function relationLabel(rel: LagnaRelation): string {
  switch (rel) {
    case "soulmate": return "Soulmate Lagna";
    case "friend":   return "Friend Lagna";
    case "enemy":    return "Enemy Lagna";
    default:         return "Neutral Lagna";
  }
}
