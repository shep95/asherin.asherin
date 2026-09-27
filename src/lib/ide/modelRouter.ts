// IDE Pain Point #21: No model choice / smart routing.
// Maps a coding task to the best-suited model. Uses lightweight keyword
// heuristics (no extra LLM call), with a manual override path.

export type IdeModelId =
  | "google/gemini-2.5-pro"
  | "google/gemini-2.5-flash"
  | "openai/gpt-5"
  | "openai/gpt-5-mini"
  | "openai/gpt-5.2";

export type IdeTaskKind =
  | "frontend-ui"      // React, Tailwind, JSX
  | "backend-logic"    // Node, Deno, complex algorithms
  | "data-sql"         // SQL, schema, migrations
  | "docs-writing"     // README, docstrings, prose
  | "math-algorithms"  // numerical / DSA
  | "refactor"         // restructuring existing code
  | "debug-explain"    // error explanation
  | "general";

export interface RoutingDecision {
  task: IdeTaskKind;
  model: IdeModelId;
  reason: string;
  alternatives: IdeModelId[];
}

const PREFS: Record<IdeTaskKind, { model: IdeModelId; alts: IdeModelId[]; reason: string }> = {
  "frontend-ui":      { model: "openai/gpt-5",        alts: ["google/gemini-2.5-pro", "openai/gpt-5-mini"], reason: "Strong with React, Tailwind, JSX." },
  "backend-logic":    { model: "google/gemini-2.5-pro", alts: ["openai/gpt-5", "openai/gpt-5.2"],            reason: "Deep reasoning for complex backend flows." },
  "data-sql":         { model: "openai/gpt-5",        alts: ["google/gemini-2.5-pro"],                     reason: "Best at SQL dialects + schema design." },
  "docs-writing":     { model: "google/gemini-2.5-pro", alts: ["openai/gpt-5-mini"],                       reason: "Long-form prose quality." },
  "math-algorithms":  { model: "openai/gpt-5.2",      alts: ["google/gemini-2.5-pro", "openai/gpt-5"],     reason: "Strongest pure-reasoning model." },
  "refactor":         { model: "google/gemini-2.5-pro", alts: ["openai/gpt-5"],                            reason: "Large context window for whole-file refactors." },
  "debug-explain":    { model: "openai/gpt-5-mini",   alts: ["google/gemini-2.5-flash"],                   reason: "Fast + clear plain-English explanations." },
  "general":          { model: "google/gemini-2.5-flash", alts: ["openai/gpt-5-mini"],                    reason: "Balanced default." },
};

const KEYWORDS: { task: IdeTaskKind; words: RegExp }[] = [
  { task: "frontend-ui",     words: /\b(react|jsx|tsx|tailwind|css|component|button|form|modal|dialog|hover|animation|page|layout|ui|ux)\b/i },
  { task: "backend-logic",   words: /\b(api|endpoint|route|server|express|fastify|deno|edge function|webhook|cron|queue|worker|microservice)\b/i },
  { task: "data-sql",        words: /\b(sql|select|insert|update|delete|join|index|migration|schema|postgres|supabase|rls|table|view)\b/i },
  { task: "docs-writing",    words: /\b(readme|docs?|documentation|comment|jsdoc|docstring|explain|describe|tutorial)\b/i },
  { task: "math-algorithms", words: /\b(algorithm|complexity|big o|sort|graph|tree|hash|cache|optimi[sz]e|recursion|dynamic programming|bfs|dfs)\b/i },
  { task: "refactor",        words: /\b(refactor|cleanup|reorgani[sz]e|extract|rename|simplify|deduplicate|dry|consolidate)\b/i },
  { task: "debug-explain",   words: /\b(error|bug|crash|fix|debug|why is|what does|stack trace|exception|undefined|null)\b/i },
];

export function routeTask(prompt: string, manualOverride?: IdeModelId): RoutingDecision {
  if (manualOverride) {
    return { task: "general", model: manualOverride, reason: "Manual override.", alternatives: [] };
  }
  const matched = KEYWORDS.find(k => k.words.test(prompt));
  const task: IdeTaskKind = matched?.task ?? "general";
  const pref = PREFS[task];
  return { task, model: pref.model, reason: pref.reason, alternatives: pref.alts };
}

export const TASK_LABELS: Record<IdeTaskKind, string> = {
  "frontend-ui": "Frontend / UI",
  "backend-logic": "Backend logic",
  "data-sql": "Data / SQL",
  "docs-writing": "Docs / writing",
  "math-algorithms": "Math / algorithms",
  "refactor": "Refactor",
  "debug-explain": "Debug / explain",
  "general": "General",
};
