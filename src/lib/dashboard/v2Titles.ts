// Recognition over recall: the v.2 page title is the same lowercase word the
// rail already uses. No product essays, no "Cloud Intelligence Mesh —
// Maximum Tier", no ◎ costume. If a room is not listed the shell falls back
// to the raw view id, which is still honest.

import type { DashboardView } from "@/components/dashboard/types";

export interface V2Title {
  title: string;
  subtitle?: string;
  /** canvas rooms own their scroll: whiteboard, maps, ide. */
  canvas?: boolean;
}

const TITLES: Partial<Record<string, V2Title>> = {
  library: { title: "library", subtitle: "files asherin can search." },
  projects: { title: "projects", subtitle: "a room that scopes chat, files and memory." },
  memory: { title: "memory", subtitle: "rules asherin carries. credentials are refused." },
  "guardian-vault": { title: "vault", subtitle: "locked storage, sessions and factors." },
  whiteboard: { title: "whiteboard", canvas: true },
  settings: { title: "settings", subtitle: "account, appearance, security." },
  connect: { title: "connect", subtitle: "what actually ran, and what it is bound to." },
  "api-keys": { title: "connect", subtitle: "what actually ran, and what it is bound to." },
  teams: { title: "team", subtitle: "people, seats and billing for one workspace." },
  "asherin-defender": { title: "asherin.defender", subtitle: "your own device, watched honestly." },
  "asherin-arvision": { title: "asherin.arvision", canvas: true },
  "asherin-eye": { title: "asherin.eye", canvas: true },
  "asherin-health": { title: "asherin.health", subtitle: "your own anatomy, read from your own record.", canvas: true },
  "asherin-sentinel": { title: "asherin.sentinel", subtitle: "an ambient watch, honest about its reach." },
  google: { title: "google", subtitle: "your connected accounts, read on request." },
  investigations: { title: "investigations", subtitle: "research that keeps its sources, conflicts and gaps." },
  search: { title: "search", subtitle: "sourced search with credibility tiers." },
  "knowledge-vault": { title: "knowledge", subtitle: "private files asherin can cite." },
  azplen: { title: "asherin.data", subtitle: "datasets, analysis and charts." },
  zerlal: { title: "asherin.cyber", subtitle: "passive domain and infrastructure context." },
   zahten: { title: "zahten", subtitle: "build and publish an agent." },
   briefing: { title: "asherin.briefing", subtitle: "scheduled reading, sourced." },
   notebooks: { title: "notebooks", subtitle: "saved analysis sessions." },
   "file-scrapper": { title: "asherin.extract", subtitle: "pull text out of documents." },
  zali: { title: "asherin.design", subtitle: "design exploration." },
  gematria: { title: "gematria" },
  "vedic-astrology": { title: "vedic" },
  "pdf-generator": { title: "asherin.pages", subtitle: "one prompt, one file — page, deck or book." },
  ebook: { title: "asherin.pages", subtitle: "one prompt, one file — page, deck or book." },
  slideshow: { title: "asherin.pages", subtitle: "one prompt, one file — page, deck or book." },
   "pattern-analysis": { title: "patterns", subtitle: "recognition over a dataset." },
  snippets: { title: "asherin.snippets", subtitle: "saved code, ready when needed." },
  stats: { title: "asherin.activity", subtitle: "your usage and your recorded actions." },
  audit: { title: "asherin.activity", subtitle: "your usage and your recorded actions." },
  "bug-reports": { title: "bugs", subtitle: "what you reported, and its state." },
  community: { title: "community" },
};

export function v2TitleFor(view: DashboardView | string, fallback?: string): V2Title {
  const key = String(view);
  if (key.startsWith("agent:")) return { title: fallback?.toLowerCase() || "agent" };
  return TITLES[key] ?? { title: (fallback ?? key).toLowerCase() };
}
