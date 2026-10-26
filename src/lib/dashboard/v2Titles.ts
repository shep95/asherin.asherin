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
  library: { title: "library", subtitle: "files shepherd can search." },
  projects: { title: "projects", subtitle: "a workspace with its own files, directions and conversations." },
  memory: { title: "asherin.vault", subtitle: "what shepherd has learned from your conversations, held on this device." },
  "guardian-vault": { title: "guardian vault", subtitle: "the key vault, sealed items and the device trail." },
  whiteboard: { title: "whiteboard", canvas: true },
  settings: { title: "settings", subtitle: "how asherin looks and works on this device." },
  connect: { title: "connect", subtitle: "what actually ran, and what it is bound to." },
  "api-keys": { title: "connect", subtitle: "what actually ran, and what it is bound to." },
  teams: { title: "team", subtitle: "people, seats and billing for one workspace." },
  "asherin-defender": { title: "asherin.defender", subtitle: "your own device, watched honestly." },
  "asherin-arvision": { title: "asherin.arvision", canvas: true },
  "asherin-adam": { title: "asherin.adam", canvas: true },
  "asherin-health": { title: "asherin.health", subtitle: "your own anatomy, read from your own record.", canvas: true },
  "asherin-sentinel": { title: "asherin.sentinel", subtitle: "an ambient watch, honest about its reach." },
  google: { title: "asherin.google", subtitle: "google desks; no account can be connected on this device yet." },
  search: { title: "search", subtitle: "sourced search with credibility tiers." },
  "knowledge-vault": { title: "asherin.knowledge", subtitle: "your documents, indexed on this device and cited." },
  azplen: { title: "asherin.data", subtitle: "datasets, analysis and charts." },
  zerlal: { title: "asherin.cyber", subtitle: "passive domain and infrastructure context." },
  zahten: { title: "asherin.agents", subtitle: "build and publish an agent that runs on this device." },
   briefing: { title: "asherin.briefing", subtitle: "a written briefing from what you watch, on request." },
  notebooks: { title: "asherin.notebooks", subtitle: "cells of notes, code and questions for shepherd, kept on this device." },
   "file-scrapper": { title: "asherin.extract", subtitle: "pull text out of documents." },
  zali: { title: "asherin.design", subtitle: "projects, specs, materials and a viewport, with shepherd." },
  "vedic-astrology": { title: "asherin.vedic", subtitle: "your sidereal chart, computed on this device." },
  "pdf-generator": { title: "asherin.pages", subtitle: "one prompt, one file — page, deck or book." },
  ebook: { title: "asherin.pages", subtitle: "one prompt, one file — page, deck or book." },
  slideshow: { title: "asherin.pages", subtitle: "one prompt, one file — page, deck or book." },
  snippets: { title: "asherin.snippets", subtitle: "saved code, ready when needed." },
  stats: { title: "asherin.activity", subtitle: "your usage and your recorded actions." },
  audit: { title: "asherin.activity", subtitle: "your usage and your recorded actions." },
  "bug-reports": { title: "asherin.bugs", subtitle: "what broke and what you want, logged on this device." },
};

export function v2TitleFor(view: DashboardView | string, fallback?: string): V2Title {
  const key = String(view);
  if (key.startsWith("agent:")) return { title: fallback?.toLowerCase() || "agent" };
  return TITLES[key] ?? { title: (fallback ?? key).toLowerCase() };
}
