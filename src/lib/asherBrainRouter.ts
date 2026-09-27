// ASHER BRAIN ROUTER — "Scout" agent in the Aureon swarm.
// Given a user prompt + short recent history, it picks the most relevant
// brains from the asher_brains vault and returns only those for injection
// into ASHER AI's context. Mirrors the "Haiku Router → Sonnet Architect"
// pattern from the Zophiel dossier (Section III): a cheap, deterministic
// pre-filter narrows the search space before the heavy model runs.
//
// Scoring is hybrid:
//   1. Hard category routing (URL/code/map keywords map to categories).
//   2. Token overlap between prompt and brain (name + description + sample).
//   3. Tag boost from explicit prompt directives like "use rome" or "@zophiel".
//
// No external AI call here — keeps routing instant, free, and offline-safe.
import { supabase } from "@/integrations/supabase/client";
import type { AsherBrainCategory } from "./asherBrains";

export interface BrainManifestEntry {
  id: string;
  name: string;
  category: AsherBrainCategory;
  description: string;
  sample: string;       // first ~400 chars of content for scoring
  size: number;         // full content length (for budget)
}

export interface RoutedBrain {
  name: string;
  category: string;
  content: string;
  score: number;
  reason: string;
}

export interface SwarmRouteResult {
  brains: RoutedBrain[];
  totalScanned: number;
  selectedCategories: AsherBrainCategory[];
  budgetUsed: number;
  rationale: string;
}

// ---------- Category triggers (hard routing) ----------
const CATEGORY_TRIGGERS: Record<AsherBrainCategory, RegExp[]> = {
  coding:      [/\b(code|debug|stack|trace|function|class|api|typescript|python|rust|sql|regex|edge function|build error|compile|crash|exception)\b/i],
  map:         [/\b(map|geoint|location|coordinate|satellite|terrain|recon|osint|address|gps|lat|lon|country|city|region)\b/i],
  personality: [/\b(tone|voice|persona|attitude|style|how should you|behave|sound like|character)\b/i],
  azplen:      [/\b(azplen|intel synth|synthesis|cross-?refer|dossier|brief|report)\b/i],
  zali:        [/\b(zali|zanoem|design|simulate|fea|thermal|render|geometry|mesh|stress|cad)\b/i],
  general:     [], // fallback
};

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being",
  "of","in","on","at","to","for","with","by","from","as","that","this","it",
  "i","you","we","they","he","she","my","your","our","their","what","how",
  "why","when","where","who","which","do","does","did","can","could","should",
  "would","will","just","also","into","over","than","then","so","if","not",
  "no","yes","please","need","want","use","using","make","get","give",
]);

const tokenize = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
};

// ---------- Step 1: Pull lightweight manifest (cheap) ----------
export const loadBrainManifest = async (): Promise<BrainManifestEntry[]> => {
  const { data, error } = await supabase
    .from("asher_brains")
    .select("id, name, category, description, content")
    .eq("is_active", true)
    .limit(200);
  if (error || !data) return [];
  return (data as Array<{ id: string; name: string; category: AsherBrainCategory; description: string; content: string }>).map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    description: b.description ?? "",
    sample: (b.content ?? "").slice(0, 400),
    size: (b.content ?? "").length,
  }));
};

// ---------- Step 2: Score & rank ----------
const scoreBrain = (
  brain: BrainManifestEntry,
  promptTokens: Set<string>,
  triggeredCats: Set<AsherBrainCategory>,
  explicitNames: string[],
): { score: number; reason: string } => {
  let score = 0;
  const reasons: string[] = [];

  // Explicit @mention or "use X" by name → massive boost
  const nameLower = brain.name.toLowerCase();
  for (const en of explicitNames) {
    if (nameLower.includes(en) || en.includes(nameLower)) {
      score += 100;
      reasons.push(`@${brain.name}`);
      break;
    }
  }

  // Category match
  if (triggeredCats.has(brain.category)) {
    score += 25;
    reasons.push(`cat:${brain.category}`);
  }

  // Personality brains = ambient identity → always small floor so voice is consistent
  if (brain.category === "personality") {
    score += 8;
  }

  // Token overlap with name + description + sample
  const haystack = `${brain.name} ${brain.description} ${brain.sample}`.toLowerCase();
  const haystackTokens = tokenize(haystack);
  let overlap = 0;
  for (const t of promptTokens) {
    if (haystackTokens.has(t)) overlap++;
  }
  if (overlap > 0) {
    score += overlap * 6;
    reasons.push(`tokens:${overlap}`);
  }

  return { score, reason: reasons.join(" · ") || "ambient" };
};

// Detect explicit "use rome", "@zophiel", "load anti spiral" cues
const extractExplicitNames = (prompt: string): string[] => {
  const out: string[] = [];
  const at = prompt.match(/@([a-z0-9_-]{3,40})/gi);
  if (at) for (const m of at) out.push(m.slice(1).toLowerCase());
  const verbed = prompt.match(/\b(?:use|load|invoke|call|with|via)\s+([a-z][a-z0-9 _-]{2,40})/gi);
  if (verbed) {
    for (const m of verbed) {
      const tail = m.split(/\s+/).slice(1).join(" ").trim().toLowerCase();
      if (tail) out.push(tail);
    }
  }
  return out;
};

const detectCategories = (prompt: string): Set<AsherBrainCategory> => {
  const triggered = new Set<AsherBrainCategory>();
  for (const [cat, patterns] of Object.entries(CATEGORY_TRIGGERS) as [AsherBrainCategory, RegExp[]][]) {
    if (patterns.some((p) => p.test(prompt))) triggered.add(cat);
  }
  // Personality is implicit on every prompt (ambient voice)
  triggered.add("personality");
  return triggered;
};

// ---------- Step 3: Public router API ----------
export interface RouteOptions {
  /** Max brains to inject (default 6). */
  topK?: number;
  /** Total content character budget (default 60_000). Brains are added until budget hit. */
  charBudget?: number;
  /** Optional recent assistant/user turns to widen the context window. */
  recentMessages?: { role: string; content: string }[];
}

export const routeBrainsForPrompt = async (
  prompt: string,
  opts: RouteOptions = {},
): Promise<SwarmRouteResult | null> => {
  const topK = opts.topK ?? 6;
  const budget = opts.charBudget ?? 60_000;

  const manifest = await loadBrainManifest();
  if (!manifest.length) return null;

  // Combine prompt with last 2 turns of context for better routing
  const widened = [prompt, ...(opts.recentMessages ?? []).slice(-2).map((m) => m.content)].join("\n");
  const promptTokens = tokenize(widened);
  const triggeredCats = detectCategories(widened);
  const explicitNames = extractExplicitNames(widened);

  const scored = manifest
    .map((b) => ({ brain: b, ...scoreBrain(b, promptTokens, triggeredCats, explicitNames) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    // Fallback: load top personality brains so ASHER still has identity
    const fallback = manifest
      .filter((b) => b.category === "personality")
      .slice(0, 3);
    if (!fallback.length) return null;
    // Re-fetch full content for fallback
    const ids = fallback.map((f) => f.id);
    const { data } = await supabase
      .from("asher_brains")
      .select("name, category, content")
      .in("id", ids);
    return {
      brains: (data ?? []).map((b: any) => ({
        name: b.name, category: b.category, content: b.content,
        score: 5, reason: "ambient personality fallback",
      })),
      totalScanned: manifest.length,
      selectedCategories: ["personality"],
      budgetUsed: (data ?? []).reduce((n: number, b: any) => n + (b.content?.length ?? 0), 0),
      rationale: "No prompt-specific match — loaded ambient personality brains.",
    };
  }

  // Pick top K under budget — re-fetch full content only for chosen brains
  const chosenIds = scored.slice(0, topK).map((s) => s.brain.id);
  const { data: full, error } = await supabase
    .from("asher_brains")
    .select("id, name, category, content")
    .in("id", chosenIds);
  if (error || !full) return null;

  const fullById = new Map<string, { name: string; category: string; content: string }>(
    (full as any[]).map((r) => [r.id, { name: r.name, category: r.category, content: r.content ?? "" }]),
  );

  const out: RoutedBrain[] = [];
  let used = 0;
  const cats = new Set<AsherBrainCategory>();
  for (const s of scored.slice(0, topK)) {
    const f = fullById.get(s.brain.id);
    if (!f) continue;
    let content = f.content;
    // If a single brain is huge, truncate so one doesn't eat the whole budget
    const remaining = budget - used;
    if (remaining <= 500) break;
    if (content.length > remaining) {
      content = content.slice(0, remaining - 80) + "\n…[truncated by router for budget]";
    }
    used += content.length;
    cats.add(s.brain.category);
    out.push({
      name: f.name,
      category: f.category,
      content,
      score: s.score,
      reason: s.reason,
    });
  }

  const rationale = `Scanned ${manifest.length} brains · matched ${scored.length} · selected ${out.length} (${[...cats].join(", ") || "general"}) · ${used.toLocaleString()} chars`;

  return {
    brains: out,
    totalScanned: manifest.length,
    selectedCategories: [...cats],
    budgetUsed: used,
    rationale,
  };
};
