/**
 * asherin.search — the sourced search room, running entirely on this device.
 *
 * the engine (src/lib/local/search) asks open indexes and any keyed engines
 * the operator added, tiers every hit through the truth graph, ranks by
 * relevance × credibility, and runs the deterministic fusion layer over the
 * corpus. shepherd is only invoked where a model is honestly needed: deep
 * search briefings and the intelligence suite.
 */
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Search, ArrowRight, Clock, X, Loader2, WifiOff, Network, Brain, Download, FileText, FileJson, FileSpreadsheet, Fingerprint, Radio } from "lucide-react";
import { exportPDF, exportCSV, exportJSON, exportMarkdown } from "@/lib/local/search/export";
import { runSearch, type FusionPayload } from "@/lib/local/search/engine";
import MessageQueuePanel from "../MessageQueuePanel";
import { emitPull } from "@/lib/connect/emitPull";
import { toast } from "@/hooks/use-toast";
import type { SearchMode, SearchFilters, SearchResult, PagePreview, FreshnessAlert, InstantAnswer, EngineReport } from "./types";
import SearchModeSelector from "./SearchModeSelector";
import SearchOperatorsPanel from "./SearchOperatorsPanel";
import QuerySuggestions from "./QuerySuggestions";
import InstantAnswerCard from "./InstantAnswerCard";
import SearchResultCard from "./SearchResultCard";

const FilterSidebar = lazy(() => import("./FilterSidebar"));
const PagePreviewPanel = lazy(() => import("./PagePreviewPanel"));
const DeepSearchPanel = lazy(() => import("./DeepSearchPanel"));
const IntelMapPanel = lazy(() => import("./IntelMapPanel"));
const IntelligenceSuitePanel = lazy(() => import("./intel/IntelligenceSuitePanel"));
const FusionPanel = lazy(() => import("./FusionPanel"));
const UrlIntelMapPanel = lazy(() => import("./UrlIntelMapPanel"));
const ArchivePanel = lazy(() => import("./ArchivePanel"));
const ResolvePanel = lazy(() => import("./ResolvePanel"));
const SourcesPanel = lazy(() => import("./SourcesPanel"));

// a pasted link is mapped, not searched. x.com/handle, https://example.com, www.foo.com/a/b
function detectUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname.includes(".")) return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  primary: "primary sources",
  breaking: "breaking coverage",
  analysis: "in-depth analysis",
  community: "community discussion",
  general: "results",
};

const OWN_INPUT_MODES: SearchMode[] = ["archive"];
const PANEL_MODES: SearchMode[] = ["archive"];

interface AsherinSearchViewProps {
  onSearchedChange?: (searched: boolean) => void;
}

const Fallback = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

const AsherinSearchView = ({ onSearchedChange }: AsherinSearchViewProps = {}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [grouped, setGrouped] = useState<Record<string, SearchResult[]>>({});
  const [instantAnswer, setInstantAnswer] = useState<InstantAnswer | null>(null);
  const [freshnessAlerts, setFreshnessAlerts] = useState<Record<string, FreshnessAlert>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [mode, setMode] = useState<SearchMode>("web");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [operatorOverrides, setOperatorOverrides] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [preview, setPreview] = useState<{ data: PagePreview; url: string } | null>(null);
  const [blockedDomains, setBlockedDomains] = useState<string[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [deepSearchQuery, setDeepSearchQuery] = useState<string | null>(null);
  const [intelMapOpen, setIntelMapOpen] = useState(false);
  const [intelSuiteOpen, setIntelSuiteOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queuedSearch, setQueuedSearch] = useState<string | null>(null);
  const [urlIntelTarget, setUrlIntelTarget] = useState<string | null>(null);
  const [fusion, setFusion] = useState<FusionPayload | null>(null);
  const [engines, setEngines] = useState<EngineReport[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [splitPct, setSplitPct] = useState(50);
  const splitPctRef = useRef(50);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const open = (intelMapOpen || intelSuiteOpen || resolveOpen) && searched && results.length > 0;
    document.body.classList.toggle("zophiel-panel-open", open);
    return () => {
      document.body.classList.remove("zophiel-panel-open");
    };
  }, [intelMapOpen, intelSuiteOpen, resolveOpen, searched, results.length]);

  const startResize = useCallback(() => {
    let raf = 0;
    let pendingPct = splitPctRef.current;
    const apply = () => {
      raf = 0;
      if (leftPanelRef.current) leftPanelRef.current.style.width = `${100 - pendingPct}%`;
      if (rightPanelRef.current) rightPanelRef.current.style.width = `${pendingPct}%`;
    };
    const onMove = (e: MouseEvent) => {
      const vw = window.innerWidth;
      pendingPct = Math.min(80, Math.max(20, ((vw - e.clientX) / vw) * 100));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      splitPctRef.current = pendingPct;
      setSplitPct(pendingPct);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    onSearchedChange?.(searched);
  }, [searched, onSearchedChange]);

  // a mode with its own input opens straight into its panel
  useEffect(() => {
    if (PANEL_MODES.includes(mode)) {
      setSearched(true);
      setShowSuggestions(false);
    }
  }, [mode]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("zophiel_recent_searches");
      if (saved) setRecentSearches(JSON.parse(saved));
      const blocked = localStorage.getItem("zophiel_blocked_domains");
      if (blocked) setBlockedDomains(JSON.parse(blocked));
    } catch {
      /* a corrupt entry is simply ignored */
    }
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const saveRecent = (q: string) => {
    const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 8);
    setRecentSearches(updated);
    try {
      localStorage.setItem("zophiel_recent_searches", JSON.stringify(updated));
    } catch {
      /* private mode */
    }
  };

  const blockDomain = (domain: string) => {
    const updated = [...new Set([...blockedDomains, domain])];
    setBlockedDomains(updated);
    try {
      localStorage.setItem("zophiel_blocked_domains", JSON.stringify(updated));
    } catch {
      /* private mode */
    }
    setResults((prev) => prev.filter((r) => !updated.some((d) => r.url.includes(d))));
  };

  const unblockDomain = (domain: string) => {
    const updated = blockedDomains.filter((d) => d !== domain);
    setBlockedDomains(updated);
    try {
      localStorage.setItem("zophiel_blocked_domains", JSON.stringify(updated));
    } catch {
      /* private mode */
    }
  };

  const search = useCallback(
    async (searchQuery?: string, modeOverride?: SearchMode, filtersOverride?: SearchFilters) => {
      const q = (searchQuery ?? query).trim();
      const m = modeOverride ?? mode;
      const f = filtersOverride ?? filters;
      if (!q) return;

      const asUrl = detectUrl(q);
      if (asUrl) {
        abortRef.current?.abort();
        setLoading(false);
        setUrlIntelTarget(asUrl);
        setSearched(true);
        setShowSuggestions(false);
        saveRecent(q);
        setResults([]);
        setGrouped({});
        setInstantAnswer(null);
        setDeepSearchQuery(null);
        return;
      }
      setUrlIntelTarget(null);

      if (m === "deep") {
        setSearched(true);
        setShowSuggestions(false);
        saveRecent(q);
        setDeepSearchQuery(q);
        return;
      }

      if (OWN_INPUT_MODES.includes(m)) {
        setSearched(true);
        setShowSuggestions(false);
        return;
      }

      if (!navigator.onLine) {
        setQueuedSearch(q);
        saveRecent(q);
        setSearched(true);
        setShowSuggestions(false);
        return;
      }

      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;

      setDeepSearchQuery(null);
      setSearched(true);
      setResults([]);
      setGrouped({});
      setInstantAnswer(null);
      setFreshnessAlerts({});
      setFusion(null);
      setLastError(null);
      setShowSuggestions(false);
      setSelectedIndex(-1);
      setQueuedSearch(null);
      saveRecent(q);
      setLoading(true);

      const start = performance.now();
      try {
        const res = await runSearch({ query: q, mode: m, filters: f, operatorOverrides, signal: ctl.signal });
        if (ctl.signal.aborted) return;
        const elapsed = Math.round(performance.now() - start);
        setSearchTime(elapsed);
        setEngines(res.engines);
        void emitPull({
          organ: "zophiel",
          capability: "search",
          fromSurface: "search",
          status: res.results.length ? "ok" : "skip",
          latencyMs: elapsed,
          // the trace names what came back, never what the operator typed
          quote: res.results[0]?.title ?? "no results",
          meta: { hits: res.results.length, mode: m, engines: res.engines.filter((e) => e.status === "ok").length },
        });
        const filtered = res.results.filter((r) => !blockedDomains.some((d) => r.url.includes(d)));
        setResults(filtered);
        setGrouped(res.grouped);
        setInstantAnswer(res.instantAnswer);
        setFreshnessAlerts(res.freshnessAlerts);
        setFusion(res.fusion);
        if (!filtered.length) {
          const failed = res.engines.filter((e) => e.status === "failed");
          const answered = res.engines.filter((e) => e.status === "ok" || e.status === "empty");
          if (!answered.length && failed.length) {
            setLastError(`no engine could be reached from this browser: ${failed.map((e) => `${e.label} (${e.reason})`).join(", ")}.`);
          }
        }
      } catch (e) {
        if (ctl.signal.aborted) return;
        const msg = e instanceof Error ? e.message : "search failed";
        setLastError(msg);
        void emitPull({ organ: "zophiel", capability: "search", fromSurface: "search", status: "fail", latencyMs: Math.round(performance.now() - start), quote: msg });
        toast({ title: "search failed", description: msg, variant: "destructive" });
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, mode, filters, operatorOverrides, blockedDomains, recentSearches],
  );

  // back online: the queued search runs itself
  useEffect(() => {
    if (online && queuedSearch) {
      const q = queuedSearch;
      setQueuedSearch(null);
      void search(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queuedSearch]);

  const changeMode = (next: SearchMode) => {
    setMode(next);
    setIntelMapOpen(false);
    setIntelSuiteOpen(false);
    setResolveOpen(false);
    // a different mode over the same words is a new question; ask it
    if (searched && query.trim() && !PANEL_MODES.includes(next) && !urlIntelTarget) void search(query, next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void search();
  };

  const handleSuggestionSelect = (suggestion: string, filterHint?: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    const hint = (filterHint || "").toLowerCase();
    let next: SearchFilters = filters;
    let nextMode: SearchMode = mode;
    if (hint === "week" || /7 days/.test(hint)) next = { ...filters, dateRange: "week" };
    else if (hint === "pdf" || /pdf/.test(hint)) next = { ...filters, fileType: "pdf" };
    else if (/\.gov/.test(hint)) next = { ...filters, domainInclude: ["gov"] };
    else if (/news/.test(hint)) nextMode = "news";
    if (next !== filters) setFilters(next);
    if (nextMode !== mode) setMode(nextMode);
    void search(suggestion, nextMode, next);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "?" && !typing) setShowShortcuts((s) => !s);
      if (e.key === "Escape") {
        setShowSuggestions(false);
        setShowShortcuts(false);
        setSourcesOpen(false);
        if (preview) setPreview(null);
      }
      if (searched && results.length > 0 && !typing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, -1));
        }
        if (e.key === "c" && selectedIndex >= 0) void navigator.clipboard.writeText(results[selectedIndex].url);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searched, results, selectedIndex, preview]);

  const clearRecent = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem("zophiel_recent_searches");
    } catch {
      /* noop */
    }
  };

  const hasGroups = Object.keys(grouped).length > 1;
  const canShowSidePanel = (intelMapOpen || intelSuiteOpen || resolveOpen) && searched && results.length > 0;
  const showingPanelMode = PANEL_MODES.includes(mode);
  const showStandardResults = !urlIntelTarget && !showingPanelMode && !deepSearchQuery;
  const answered = engines.filter((e) => e.status === "ok").length;
  const failed = engines.filter((e) => e.status === "failed").length;
  const exportItems = results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet, source: r.source, tier: r.tier, publishDate: r.publishDate }));
  const exportName = `asherin-search-${Date.now()}`;

  return (
    <div className="zophiel-aurora-shell flex h-full relative">
      {searched && !showingPanelMode && (
        <Suspense fallback={null}>
          <FilterSidebar filters={filters} onFiltersChange={(f) => setFilters(f)} blockedDomains={blockedDomains} onBlockDomain={blockDomain} onUnblockDomain={unblockDomain} />
        </Suspense>
      )}

      <div ref={leftPanelRef} className={`flex flex-col min-w-0 ${canShowSidePanel ? "flex-1 lg:flex-none" : "flex-1"}`} style={canShowSidePanel ? { width: `${100 - splitPct}%` } : undefined}>
        <div className={`flex-shrink-0 transition-all duration-500 ${searched ? "pt-3 sm:pt-4 pb-2 sm:pb-3" : "pt-[14vh] sm:pt-[20vh] pb-4 sm:pb-6"}`}>
          <div className="max-w-2xl mx-auto px-3 sm:px-6">
            {!searched && (
              <div className="mb-5 text-center">
                <h2 className="text-lg font-extralight tracking-wide text-foreground">asherin.search</h2>
                <p className="text-[11px] font-light text-muted-foreground/60 mt-1">sourced search with credibility tiers. every engine is asked from this device.</p>
              </div>
            )}

            <div className="mb-3">
              <SearchModeSelector active={mode} onChange={changeMode} />
            </div>

            {!OWN_INPUT_MODES.includes(mode) && (
              <form onSubmit={handleSubmit} className="relative">
                <div className="zophiel-aurora-pulse" aria-hidden />
                <div
                  className={`group flex items-center gap-2 rounded-2xl border ${!online ? "border-amber-500/30" : "border-foreground/15"} bg-background/50 backdrop-blur-2xl px-4 py-3.5 focus-within:border-foreground/40 focus-within:shadow-[0_0_0_1px_hsl(0_0%_100%/0.15),0_20px_60px_-20px_hsl(220_50%_60%/0.35)] transition-all duration-300`}
                >
                  {!online && <WifiOff className="h-4 w-4 text-amber-400/60 shrink-0" />}
                  <Search className="h-5 w-5 text-foreground/70 shrink-0 group-focus-within:text-foreground transition-colors" strokeWidth={1.5} />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setShowSuggestions(e.target.value.length > 1);
                    }}
                    onFocus={() => {
                      if (query.length > 1) setShowSuggestions(true);
                    }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={online ? (mode === "deep" ? "ask a question to research in depth…" : "search, or paste a link to map it…") : "offline — queued until you are back"}
                    aria-label="search"
                    className="flex-1 min-w-0 bg-transparent text-sm font-light tracking-wide text-foreground placeholder:text-muted-foreground/40 outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setShowSuggestions(false);
                        inputRef.current?.focus();
                      }}
                      className="shrink-0 p-1 rounded-lg text-muted-foreground/50 hover:text-foreground transition-colors"
                      aria-label="clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <SearchOperatorsPanel filters={filters} onFiltersChange={setFilters} onOperatorString={setOperatorOverrides} />
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="shrink-0 rounded-xl border border-foreground/20 bg-foreground/[0.08] px-3 sm:px-4 py-1.5 text-xs font-light tracking-wide text-foreground hover:bg-foreground/[0.14] hover:border-foreground/40 transition-all disabled:opacity-30"
                    aria-label="run search"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  </button>
                </div>
                {showSuggestions && query.length > 1 && <QuerySuggestions query={query} onSelect={handleSuggestionSelect} />}
              </form>
            )}

            {!searched && recentSearches.length > 0 && (
              <div className="mt-4 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-light tracking-wider text-muted-foreground/50 uppercase">recent</span>
                  <button onClick={clearRecent} className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                    clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recentSearches.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setQuery(s);
                        void search(s);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/20 bg-card/20 px-2.5 py-1 text-[11px] font-light text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <Clock className="h-3 w-3" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!searched && (
              <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-muted-foreground/40">
                <button onClick={() => setSourcesOpen(true)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                  <Radio className="h-3 w-3" /> sources &amp; keys
                </button>
                <span>·</span>
                <span>press ? for shortcuts</span>
              </div>
            )}
          </div>
        </div>

        {searched && (
          <div className="flex-1 overflow-y-auto">
            <div className={`${showingPanelMode || urlIntelTarget ? "max-w-6xl" : "max-w-2xl"} mx-auto px-3 sm:px-6 pb-8`}>
              <MessageQueuePanel items={queuedSearch ? [{ id: "search-queued", content: queuedSearch }] : []} onRemove={() => setQueuedSearch(null)} onClear={() => setQueuedSearch(null)} />

              {mode === "archive" && (
                <Suspense fallback={<Fallback />}>
                  <ArchivePanel />
                </Suspense>
              )}

              {deepSearchQuery && !showingPanelMode && (
                <Suspense fallback={null}>
                  <DeepSearchPanel query={deepSearchQuery} onClose={() => setDeepSearchQuery(null)} />
                </Suspense>
              )}

              {urlIntelTarget && (
                <Suspense fallback={null}>
                  <UrlIntelMapPanel url={urlIntelTarget} onClose={() => setUrlIntelTarget(null)} />
                </Suspense>
              )}

              {showStandardResults && (
                <>
                  {!loading && results.length > 0 && fusion && (
                    <Suspense fallback={null}>
                      <FusionPanel data={fusion} />
                    </Suspense>
                  )}

                  {!loading && engines.length > 0 && (
                    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                      <button onClick={() => setSourcesOpen(true)} className="text-[10px] font-light text-muted-foreground/50 hover:text-foreground transition-colors text-left" title="which engines answered">
                        {results.length} results · {searchTime}ms · {answered} of {engines.filter((e) => e.status !== "skipped").length} engines answered
                        {failed > 0 ? ` · ${failed} unreachable` : ""}
                      </button>
                      {results.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="relative group/export">
                            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border/30 bg-card/30 px-2.5 py-1 text-[11px] font-light tracking-wide text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors" title="export results">
                              <Download className="h-3.5 w-3.5" />
                              export
                            </button>
                            <div className="absolute right-0 top-full mt-1 hidden group-hover/export:block bg-card border border-border rounded-lg shadow-2xl z-50 py-1 min-w-[140px]">
                              <button onClick={() => exportPDF(`asherin.search — ${query}`, exportItems)} className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-muted">
                                <FileText className="h-3 w-3" /> pdf report
                              </button>
                              <button onClick={() => exportCSV(exportName, exportItems)} className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-muted">
                                <FileSpreadsheet className="h-3 w-3" /> csv
                              </button>
                              <button onClick={() => exportJSON(exportName, exportItems, { query, mode })} className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-muted">
                                <FileJson className="h-3 w-3" /> json
                              </button>
                              <button onClick={() => exportMarkdown(exportName, exportItems, { query, mode })} className="w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-muted">
                                <FileText className="h-3 w-3" /> markdown
                              </button>
                            </div>
                          </div>
                          <PanelToggle
                            active={intelMapOpen}
                            icon={<Network className="h-3.5 w-3.5" />}
                            label={intelMapOpen ? "close map" : "intel map"}
                            short="map"
                            title="entities and connections drawn from these results, no model involved"
                            onClick={() => {
                              setIntelMapOpen((v) => !v);
                              if (!intelMapOpen) {
                                setIntelSuiteOpen(false);
                                setResolveOpen(false);
                              }
                            }}
                          />
                          <PanelToggle
                            active={resolveOpen}
                            icon={<Fingerprint className="h-3.5 w-3.5" />}
                            label={resolveOpen ? "close resolve" : "resolve"}
                            short="xks"
                            title="selectors, identities, hop rings, timeline and exposure — derived only from these results"
                            onClick={() => {
                              setResolveOpen((v) => !v);
                              if (!resolveOpen) {
                                setIntelMapOpen(false);
                                setIntelSuiteOpen(false);
                              }
                            }}
                          />
                          <PanelToggle
                            active={intelSuiteOpen}
                            icon={<Brain className="h-3.5 w-3.5" />}
                            label={intelSuiteOpen ? "close intel" : "intel suite"}
                            short="intel"
                            title="shepherd reads the corpus: timeline, credibility, fact-check, narrative, gaps"
                            onClick={() => {
                              setIntelSuiteOpen((v) => !v);
                              if (!intelSuiteOpen) {
                                setIntelMapOpen(false);
                                setResolveOpen(false);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {instantAnswer && <InstantAnswerCard answer={instantAnswer} />}

                  {loading && (
                    <div className="space-y-4 animate-fade-in">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="rounded-xl border border-border/10 bg-card/20 p-4 space-y-2">
                          <div className="h-3 w-48 bg-foreground/5 rounded animate-pulse" />
                          <div className="h-2.5 w-32 bg-foreground/5 rounded animate-pulse" />
                          <div className="h-2.5 w-full bg-foreground/5 rounded animate-pulse" />
                          <div className="h-2.5 w-3/4 bg-foreground/5 rounded animate-pulse" />
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && results.length > 0 && hasGroups && (
                    <div className="space-y-6">
                      {Object.entries(grouped)
                        .filter(([, items]) => items.length > 0)
                        .map(([category, items]) => (
                          <div key={category}>
                            <h2 className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground/50 uppercase mb-3 flex items-center gap-2">
                              <span className="h-px flex-1 bg-border/20" />
                              {CATEGORY_LABELS[category] || category}
                              <span className="h-px flex-1 bg-border/20" />
                            </h2>
                            <div className="space-y-3">
                              {items
                                .filter((r) => !blockedDomains.some((d) => r.url.includes(d)))
                                .map((r, i) => (
                                  <SearchResultCard key={`${r.url}::${i}`} result={r} freshnessAlert={freshnessAlerts[r.url]} onPreview={(p) => setPreview({ data: p, url: r.url })} index={i} />
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {!loading && results.length > 0 && !hasGroups && (
                    <div className="space-y-3">
                      {results.map((r, i) => (
                        <SearchResultCard key={`${r.url}::${i}`} result={r} freshnessAlert={freshnessAlerts[r.url]} onPreview={(p) => setPreview({ data: p, url: r.url })} index={i} />
                      ))}
                    </div>
                  )}

                  {!loading && searched && results.length === 0 && (
                    <div className="text-center py-16 animate-fade-in">
                      <Search className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm font-extralight text-muted-foreground">{lastError ? "nothing came back." : "no results."}</p>
                      {lastError && <p className="text-[11px] font-light text-amber-400/80 mt-2 max-w-md mx-auto">{lastError}</p>}
                      {engines.length > 0 && (
                        <button onClick={() => setSourcesOpen(true)} className="mt-3 text-[11px] text-muted-foreground/60 hover:text-foreground underline underline-offset-2">
                          see which engines answered
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {canShowSidePanel && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            startResize();
          }}
          className="hidden lg:flex items-center justify-center w-1.5 cursor-col-resize group relative z-30"
          title="drag to resize"
        >
          <div className="h-full w-px bg-border/30 group-hover:bg-accent/60 transition-colors" />
          <div className="absolute h-12 w-1 rounded-full bg-foreground/20 group-hover:bg-accent/70 transition-colors" />
        </div>
      )}

      {resolveOpen && searched && results.length > 0 && (
        <div ref={rightPanelRef} className="fixed inset-0 z-40 bg-background animate-fade-in lg:static lg:z-auto lg:min-w-0 lg:bg-transparent" style={{ width: window.innerWidth >= 1024 ? `${splitPct}%` : undefined }}>
          <Suspense fallback={null}>
            <ResolvePanel query={query} results={results} onClose={() => setResolveOpen(false)} />
          </Suspense>
        </div>
      )}

      {intelMapOpen && searched && results.length > 0 && (
        <div
          ref={rightPanelRef}
          className="fixed inset-0 z-40 bg-background/40 backdrop-blur-2xl animate-fade-in lg:static lg:z-auto lg:min-w-0 lg:bg-transparent lg:backdrop-blur-none"
          style={{ width: window.innerWidth >= 1024 ? `${splitPct}%` : undefined }}
        >
          <Suspense fallback={null}>
            <IntelMapPanel query={query} results={results} onClose={() => setIntelMapOpen(false)} />
          </Suspense>
        </div>
      )}

      {intelSuiteOpen && searched && results.length > 0 && (
        <div ref={rightPanelRef} className="hidden lg:block min-w-0 animate-fade-in" style={{ width: `${splitPct}%` }}>
          <Suspense fallback={null}>
            <IntelligenceSuitePanel
              query={query}
              results={results}
              onClose={() => setIntelSuiteOpen(false)}
              onRunQuery={(q) => {
                setQuery(q);
                void search(q);
              }}
            />
          </Suspense>
        </div>
      )}

      {intelSuiteOpen && searched && results.length > 0 && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background animate-fade-in">
          <Suspense fallback={null}>
            <IntelligenceSuitePanel
              query={query}
              results={results}
              onClose={() => setIntelSuiteOpen(false)}
              onRunQuery={(q) => {
                setQuery(q);
                void search(q);
              }}
            />
          </Suspense>
        </div>
      )}

      {preview && (
        <Suspense fallback={null}>
          <PagePreviewPanel preview={preview.data} url={preview.url} onClose={() => setPreview(null)} />
        </Suspense>
      )}

      {sourcesOpen && (
        <Suspense fallback={null}>
          <SourcesPanel engines={engines} onClose={() => setSourcesOpen(false)} />
        </Suspense>
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="rounded-xl border border-border/30 bg-card/95 backdrop-blur-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">keyboard shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground" aria-label="close shortcuts">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ["/", "focus the search bar"],
                ["↑ ↓", "move through results"],
                ["c", "copy the selected url"],
                ["esc", "close panels"],
                ["?", "toggle this list"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{desc}</span>
                  <kbd className="rounded-md border border-border/30 bg-background/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PanelToggle = ({ active, icon, label, short, title, onClick }: { active: boolean; icon: React.ReactNode; label: string; short: string; title: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-light tracking-wide transition-colors ${
      active ? "border-accent/40 bg-accent/15 text-accent" : "border-border/30 bg-card/30 text-muted-foreground hover:text-foreground hover:border-border/50"
    }`}
    title={title}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
    <span className="sm:hidden">{short}</span>
  </button>
);

export default AsherinSearchView;
