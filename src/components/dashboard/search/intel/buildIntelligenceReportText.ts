// buildIntelligenceReportText.ts — deterministic .txt intelligence report
// compiled from a live search result set. Used by the IntelligenceSuitePanel
// "Download Report" button. Pure client-side — no AI call, no network — so
// the report generates instantly for the operator without spending credits.
//
// Rationale for going deterministic: the AI-driven Intelligence Suite tabs
// (temporal, credibility, factcheck, narrative, investigative) are opt-in
// and each runs on demand. The downloadable report must always work, even
// if the operator never opened those tabs, so we synthesise the report
// from the raw results + query + tier map. The five AI panels stay as the
// live-interactive layer; this file is the exportable snapshot layer.

import type { SearchResult } from "../types";

export interface ReportInputs {
  query: string;
  results: SearchResult[];
  /** Optional cached data from the AI panels (temporal, etc.). Included when present. */
  aiSections?: Record<string, unknown>;
}

function line(char = "─", len = 72): string { return char.repeat(len); }
function header(title: string): string {
  return `\n${line("═")}\n  ${title.toUpperCase()}\n${line("═")}\n`;
}
function sub(title: string): string {
  return `\n${line("─")}\n  ${title}\n${line("─")}\n`;
}

function safeDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function tierGroup(results: SearchResult[]) {
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results) {
    const t = r.tierLabel || (r.tier != null ? `Tier ${r.tier}` : "Uncategorised");
    (groups[t] ||= []).push(r);
  }
  return groups;
}

function topDomains(results: SearchResult[]): { domain: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of results) {
    const d = safeDomain(r.url);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));
}

/**
 * Assemble the .txt report body. Structured for skim-reading in a text editor:
 * fixed-width divider rules, numbered sections, one source per line block.
 */
export function buildIntelligenceReportText(input: ReportInputs): string {
  const { query, results } = input;
  const now = new Date();
  const iso = now.toISOString();
  const local = now.toLocaleString();

  const groups = tierGroup(results);
  const domains = topDomains(results);
  const paywalled = results.filter((r) => (r as { isPaywalled?: boolean }).isPaywalled).length;

  const out: string[] = [];

  // ── COVER ───────────────────────────────────────────────────────
  out.push(line("═"));
  out.push("  ZOPHIEL · INTELLIGENCE REPORT");
  out.push("  House Of Asher · asherin.search");
  out.push(line("═"));
  out.push("");
  out.push(`  QUERY        : ${query || "(empty)"}`);
  out.push(`  GENERATED    : ${local}`);
  out.push(`  ISO          : ${iso}`);
  out.push(`  RESULTS      : ${results.length}`);
  out.push(`  DOMAINS      : ${domains.length}`);
  out.push(`  PAYWALLED    : ${paywalled}`);
  out.push("");

  // ── EXECUTIVE SUMMARY ──────────────────────────────────────────
  out.push(header("Executive Summary"));
  out.push(
`  asherin.search returned ${results.length} source${results.length === 1 ? "" : "s"}
  across ${domains.length} unique domain${domains.length === 1 ? "" : "s"} for the operator query:

      "${query}"

  Sources are grouped below by credibility tier and by domain frequency.
  This report is deterministic (no LLM summarisation) — every claim is
  anchored to an underlying URL that the operator can independently verify.`
  );

  // ── TIER BREAKDOWN ─────────────────────────────────────────────
  out.push(header("Source Tier Breakdown"));
  for (const [tier, rs] of Object.entries(groups).sort()) {
    out.push(`  · ${tier.padEnd(28)} ${rs.length} source${rs.length === 1 ? "" : "s"}`);
  }

  // ── DOMAIN FREQUENCY ───────────────────────────────────────────
  out.push(header("Top Domains (by mention count)"));
  for (const d of domains) {
    out.push(`  · ${d.domain.padEnd(40)} ${String(d.count).padStart(3, " ")}`);
  }

  // ── FULL SOURCE LIST ───────────────────────────────────────────
  out.push(header("Full Source List"));
  results.forEach((r, i) => {
    out.push(`  [${String(i + 1).padStart(3, "0")}] ${r.title || "(no title)"}`);
    out.push(`        URL    : ${r.url}`);
    out.push(`        SOURCE : ${r.source || safeDomain(r.url)}`);
    if (r.tierLabel) out.push(`        TIER   : ${r.tierLabel}`);
    if (r.publishDate) out.push(`        DATE   : ${r.publishDate}`);
    if (r.snippet) {
      const snippet = r.snippet.replace(/\s+/g, " ").slice(0, 260);
      out.push(`        SNIP   : ${snippet}${r.snippet.length > 260 ? "…" : ""}`);
    }
    out.push("");
  });

  // ── AI PANELS (if operator ran them) ──────────────────────────
  if (input.aiSections && Object.keys(input.aiSections).length > 0) {
    out.push(header("AI-Assisted Analysis (cached)"));
    for (const [name, payload] of Object.entries(input.aiSections)) {
      out.push(sub(name));
      try {
        out.push(JSON.stringify(payload, null, 2));
      } catch {
        out.push("(unserialisable payload)");
      }
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────
  out.push("");
  out.push(line("═"));
  out.push("  END OF REPORT · asherin.search · House Of Asher");
  out.push(line("═"));
  out.push("");

  return out.join("\n");
}

/** Trigger a browser download for the report text. */
export function downloadIntelligenceReport(input: ReportInputs): void {
  const text = buildIntelligenceReportText(input);
  const safeQuery = (input.query || "report").replace(/[^a-z0-9-]+/gi, "-").slice(0, 60);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `asherin-search-intel-${safeQuery}-${stamp}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
