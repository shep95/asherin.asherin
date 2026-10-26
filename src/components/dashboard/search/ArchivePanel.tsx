// ASHER ARCHIVES — Full Human-Facing Search & Browse System
// Three intelligence pillars: Historical Intelligence, Lost Knowledge Recovery, Evolution Tracking
// Rich result cards: CVE, Exploit, Research, Forum, Historical Comparison
// Filters sidebar, Timeline view, Saved Searches, Export
import { useCallback, useState, useMemo } from "react";
import { fetchTimeout } from "@/lib/local/search/http";
import type { LucideIcon } from "lucide-react";
import {
  Search, Loader2, ExternalLink, FileText, Film, Music, Archive, Image as ImageIcon,
  Cpu, Globe, Play, History, Ghost, GitBranch, Calendar, LayoutGrid, LayoutList,
  Star, Download, ChevronLeft, ChevronRight, SlidersHorizontal, Clock, ArrowUpDown
} from "lucide-react";
import ArchiveFilterSidebar, { type ArchiveFilters } from "./archives/ArchiveFilterSidebar";
import ArchiveResultCard, { type ArchiveResult, type ResultType } from "./archives/ArchiveResultCard";
import ArchiveSavedSearches, { type SavedSearch } from "./archives/ArchiveSavedSearches";
import ArchiveExportPanel from "./archives/ArchiveExportPanel";

const IA = "https://archive.org";
const NOW_YEAR = new Date().getUTCFullYear();

type MediaType = "texts" | "movies" | "audio" | "image" | "software" | "web";
const MEDIA: { id: MediaType; label: string; icon: LucideIcon }[] = [
  { id: "texts", label: "books / papers", icon: FileText },
  { id: "movies", label: "video", icon: Film },
  { id: "audio", label: "audio", icon: Music },
  { id: "image", label: "images", icon: ImageIcon },
  { id: "software", label: "software", icon: Cpu },
  { id: "web", label: "web captures", icon: Globe },
];

type Pillar = "historical" | "lost" | "evolution";
const PILLARS: { id: Pillar; label: string; icon: LucideIcon; tip: string }[] = [
  { id: "historical", label: "historical intelligence", icon: History, tip: "entire history 1990 → present" },
  { id: "lost",       label: "lost knowledge",          icon: Ghost,   tip: "recover content DELETED from the live web" },
  { id: "evolution",  label: "evolution tracking",      icon: GitBranch, tip: "decade-by-decade mutation of a topic" },
];

const DECADES = [
  { from: 1990, to: 1999, label: "1990s" },
  { from: 2000, to: 2009, label: "2000s" },
  { from: 2010, to: 2019, label: "2010s" },
  { from: 2020, to: NOW_YEAR, label: "2020s" },
];

type ViewMode = "list" | "grid";
type SortBy = "relevance" | "date" | "source";

interface IaDoc {
  identifier: string;
  title?: string;
  description?: string | string[];
  creator?: string | string[];
  date?: string;
  mediatype?: string;
}

interface WaybackHit {
  original: string;
  timestamp: string;
  statuscode: string;
  mimetype: string;
  digest: string;
}

interface DecadeBucket {
  label: string;
  from: number;
  to: number;
  count: number;
  top: IaDoc[];
}

const DEFAULT_FILTERS: ArchiveFilters = { timeRange: "all", domains: [], sources: [], confidence: 0, fileTypes: [], languages: [] };

// Convert IA docs into rich ArchiveResult format for the new card UI
function docToResult(d: IaDoc, i: number): ArchiveResult {
  const desc = Array.isArray(d.description) ? d.description.join(" ") : (d.description || "");
  const cleanDesc = String(desc).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const creator = Array.isArray(d.creator) ? d.creator.join(", ") : (d.creator || "");
  const mt = d.mediatype || "texts";
  const typeMap: Record<string, ResultType> = { texts: "research", movies: "forum", audio: "forum", software: "exploit", web: "forum", image: "research" };
  return {
    id: d.identifier,
    type: typeMap[mt] || "research",
    title: d.title || d.identifier,
    subtitle: "",
    source: mt === "texts" ? "Internet Archive" : `Internet Archive (${mt})`,
    date: d.date ? String(d.date).slice(0, 10) : "Unknown",
    verified: true,
    confidence: 85,
    summary: cleanDesc.slice(0, 500) || "No description available.",
    tags: [mt],
    url: `${IA}/details/${d.identifier}`,
    authors: creator ? [creator] : undefined,
  };
}

const ArchivePanel = () => {
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState<Pillar>("historical");
  const [active, setActive] = useState<MediaType[]>(["texts", "movies", "audio"]);
  const [decade, setDecade] = useState<{ from: number; to: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [showFilters, setShowFilters] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [filters, setFilters] = useState<ArchiveFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const [docs, setDocs] = useState<IaDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [wayback, setWayback] = useState<WaybackHit[]>([]);
  const [evo, setEvo] = useState<DecadeBucket[]>([]);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTime, setSearchTime] = useState(0);
  const [previewing, setPreviewing] = useState<IaDoc | null>(null);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    try { return JSON.parse(localStorage.getItem("asher_archive_saved") || "[]"); } catch { return []; }
  });

  const persistSaved = (ss: SavedSearch[]) => { setSavedSearches(ss); localStorage.setItem("asher_archive_saved", JSON.stringify(ss)); };

  const getTimeRange = (): { from: number; to: number } | null => {
    if (filters.timeRange === "5y") return { from: NOW_YEAR - 5, to: NOW_YEAR };
    if (filters.timeRange === "1y") return { from: NOW_YEAR - 1, to: NOW_YEAR };
    if (filters.timeRange === "custom" && filters.customFrom && filters.customTo) return { from: Number(filters.customFrom), to: Number(filters.customTo) };
    if (decade) return decade;
    return null;
  };

  const buildIaUrl = (q: string, from: number | null, to: number | null, rows = 60) => {
    const mt = active.length ? `(${active.map((m) => `mediatype:${m}`).join(" OR ")})` : "";
    const parts = [`(${q})`];
    if (mt) parts.push(mt);
    if (from && to) parts.push(`date:[${from}-01-01 TO ${to}-12-31]`);
    const params = new URLSearchParams();
    params.set("q", parts.join(" AND "));
    ["identifier","title","description","creator","date","mediatype"].forEach((f) => params.append("fl[]", f));
    params.set("rows", String(rows));
    params.set("page", String(page));
    params.set("output", "json");
    params.set("sort[]", sortBy === "date" ? "date desc" : "downloads desc");
    return `${IA}/advancedsearch.php?${params.toString()}`;
  };

  const runHistorical = useCallback(async (q: string) => {
    const tr = getTimeRange();
    const url = buildIaUrl(q, tr?.from ?? 1990, tr?.to ?? NOW_YEAR, 60);
    // fetchTimeout rejects on a non-2xx or after the deadline, with a plain reason
    const r = await fetchTimeout(url, { timeoutMs: 15000 });
    const j = await r.json();
    setDocs(j?.response?.docs || []);
    setTotal(j?.response?.numFound || 0);
  }, [active, decade, filters, page, sortBy]);

  const runLost = useCallback(async (q: string) => {
    const looksLikeUrl = /[./]/.test(q) && !/\s/.test(q);
    const target = looksLikeUrl ? q.replace(/^https?:\/\//, "") : `*.${q.replace(/\s+/g, "")}.*`;
    const cdx = new URL("https://web.archive.org/cdx/search/cdx");
    cdx.searchParams.set("url", target);
    cdx.searchParams.set("output", "json");
    cdx.searchParams.set("limit", "200");
    cdx.searchParams.set("collapse", "urlkey");
    cdx.searchParams.set("filter", "statuscode:200");
    if (!looksLikeUrl) cdx.searchParams.set("matchType", "domain");
    const r = await fetchTimeout(cdx.toString(), { timeoutMs: 15000 });
    const rows: string[][] = await r.json();
    const [, ...data] = rows;
    const hits: WaybackHit[] = data.map((row) => ({
      original: row[2], timestamp: row[1], statuscode: row[4], mimetype: row[3], digest: row[5],
    }));
    const sample = hits.slice(0, 30);
    const dead = await Promise.all(sample.map(async (h) => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const live = await fetch(h.original, { method: "HEAD", mode: "no-cors", signal: ctl.signal });
        clearTimeout(t);
        return live.type === "opaque" ? null : h;
      } catch { return h; }
    }));
    setWayback(dead.filter(Boolean) as WaybackHit[]);
    setTotal(hits.length);
  }, []);

  const runEvolution = useCallback(async (q: string) => {
    const buckets = await Promise.all(DECADES.map(async (d) => {
      const r = await fetchTimeout(buildIaUrl(q, d.from, d.to, 5), { timeoutMs: 12000 }).catch(() => null);
      if (!r) return { ...d, count: 0, top: [] as IaDoc[] };
      const j = await r.json();
      return { ...d, count: j?.response?.numFound || 0, top: j?.response?.docs || [] };
    }));
    setEvo(buckets);
    setTotal(buckets.reduce((s, b) => s + b.count, 0));
  }, [active]);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const t0 = performance.now();
    setLoading(true); setError(null); setSearched(true);
    setDocs([]); setWayback([]); setEvo([]); setTotal(0);
    try {
      if (pillar === "historical") await runHistorical(q);
      else if (pillar === "lost") await runLost(q);
      else await runEvolution(q);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "search failed"); }
    finally { setLoading(false); setSearchTime(Math.round(performance.now() - t0)); }
  }, [pillar, runHistorical, runLost, runEvolution]);

  const results: ArchiveResult[] = useMemo(() => docs.map((d, i) => docToResult(d, i)), [docs]);

  const saveSearch = () => {
    if (!query.trim()) return;
    const exists = savedSearches.find(s => s.query === query);
    if (exists) return;
    const ss: SavedSearch = { id: crypto.randomUUID(), query, resultCount: total, lastViewed: "just now", alertOn: false };
    persistSaved([ss, ...savedSearches]);
  };

  const fmtTs = (ts: string) => `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`;

  const totalPages = Math.max(1, Math.ceil(total / 60));

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="rounded-2xl border border-accent/30 bg-accent/5 backdrop-blur-xl px-5 py-4 text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Archive className="h-6 w-6 text-accent" />
          <span className="text-sm font-light text-foreground tracking-wide">asher archives</span>
        </div>
        <p className="text-[10px] font-extralight text-muted-foreground/60 tracking-wide">
          the internet archive, read from this device — 1990–{NOW_YEAR}
        </p>
      </div>

      {/* Pillar selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PILLARS.map(({ id, label, icon: Icon, tip }) => {
          const on = pillar === id;
          return (
            <button
              key={id}
              onClick={() => { setPillar(id); setSearched(false); setDocs([]); setWayback([]); setEvo([]); setShowSaved(false); setShowExport(false); }}
              className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? "bg-accent/15 border-accent/40" : "bg-card/30 border-border/20 hover:border-border/40"}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${on ? "text-accent" : "text-muted-foreground/70"}`} />
                <span className={`text-[11px] font-light ${on ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              </div>
              <p className="text-[10px] font-extralight text-muted-foreground/60 mt-0.5">{tip}</p>
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); run(query); }}
        className="flex items-center gap-2 rounded-2xl border border-border/30 bg-card/40 backdrop-blur-xl px-4 py-3"
      >
        <Search className="h-5 w-5 text-muted-foreground/50 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            pillar === "lost"
              ? "domain or url whose deleted pages to recover (e.g. geocities.com)…"
              : pillar === "evolution"
                ? "topic to track across decades (e.g. neural networks, encryption)…"
                : "search the archive (e.g. buffer overflow apache, CIA reading room)…"
          }
          className="flex-1 bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
        <button type="submit" disabled={loading || !query.trim()} className="rounded-xl bg-accent/20 px-3 py-1.5 text-xs font-light text-accent hover:bg-accent/30 transition-colors disabled:opacity-30">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "search"}
        </button>
      </form>

      {/* Quick action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters(!showFilters)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] border transition-colors ${showFilters ? "bg-accent/10 border-accent/30 text-accent" : "bg-card/30 border-border/20 text-muted-foreground/60 hover:text-foreground"}`}>
          <SlidersHorizontal className="h-3 w-3" /> advanced search
        </button>
        {pillar === "evolution" && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] bg-card/30 border border-border/20 text-muted-foreground/60">
            <Calendar className="h-3 w-3" /> Timeline View
          </span>
        )}
        <button onClick={() => { setShowSaved(!showSaved); setShowExport(false); }} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] border transition-colors ${showSaved ? "bg-accent/10 border-accent/30 text-accent" : "bg-card/30 border-border/20 text-muted-foreground/60 hover:text-foreground"}`}>
          <Star className="h-3 w-3" /> saved searches
        </button>
      </div>

      {/* Saved searches panel */}
      {showSaved && (
        <ArchiveSavedSearches
          searches={savedSearches}
          onRun={(q) => { setQuery(q); setShowSaved(false); setTimeout(() => run(q), 50); }}
          onDelete={(id) => persistSaved(savedSearches.filter(s => s.id !== id))}
          onToggleAlert={(id) => persistSaved(savedSearches.map(s => s.id === id ? { ...s, alertOn: !s.alertOn } : s))}
        />
      )}

      {/* Export panel */}
      {showExport && (
        <ArchiveExportPanel resultCount={total} onExport={() => setShowExport(false)} onClose={() => setShowExport(false)} />
      )}

      {/* Decade scope (historical only) */}
      {pillar === "historical" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/50 mr-1 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Era
          </span>
          <button onClick={() => setDecade(null)} className={`px-2 py-0.5 rounded-md text-[10px] font-light tracking-wide border transition-colors ${!decade ? "bg-accent/20 border-accent/40 text-accent" : "bg-card/30 border-border/30 text-muted-foreground/60 hover:text-foreground"}`}>
            all (1990–{NOW_YEAR})
          </button>
          {DECADES.map((d) => (
            <button key={d.label} onClick={() => setDecade({ from: d.from, to: d.to })} className={`px-2 py-0.5 rounded-md text-[10px] font-light tracking-wide border transition-colors ${decade?.from === d.from ? "bg-accent/20 border-accent/40 text-accent" : "bg-card/30 border-border/30 text-muted-foreground/60 hover:text-foreground"}`}>
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* Media filters */}
      {pillar !== "lost" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/50 mr-1">media</span>
          {MEDIA.map(({ id, label, icon: Icon }) => {
            const on = active.includes(id);
            return (
              <button key={id} onClick={() => setActive((cur) => on ? cur.filter((x) => x !== id) : [...cur, id])} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-light tracking-wide border transition-colors ${on ? "bg-accent/20 border-accent/40 text-accent" : "bg-card/30 border-border/30 text-muted-foreground/60 hover:text-foreground"}`}>
                <Icon className="h-3 w-3" /> {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Results area */}
      {searched && (
        <div className={`flex gap-4 ${showFilters ? "" : ""}`}>
          {/* Filter sidebar */}
          {showFilters && pillar === "historical" && (
            <div className="w-52 shrink-0 hidden lg:block">
              <div className="sticky top-4 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm px-3 py-3">
                <ArchiveFilterSidebar filters={filters} onChange={setFilters} />
              </div>
            </div>
          )}

          {/* Main results */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Results header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] font-light text-muted-foreground/50">
                {loading
                  ? "searching the archive…"
                  : pillar === "lost"
                    ? `${wayback.length} dead-on-web items recovered from ${total.toLocaleString()} snapshots`
                    : pillar === "evolution"
                      ? `${total.toLocaleString()} records spanning ${DECADES.length} decades`
                      : `found ${total.toLocaleString()} results (${(searchTime / 1000).toFixed(2)} seconds)`}
              </p>
              <div className="flex items-center gap-2">
                {pillar === "historical" && !loading && docs.length > 0 && (
                  <>
                    <select value={sortBy} onChange={e => { setSortBy(e.target.value as SortBy); }} className="text-[10px] bg-card/40 border border-border/20 rounded px-2 py-0.5 text-muted-foreground outline-none">
                      <option value="relevance">relevance</option>
                      <option value="date">date</option>
                    </select>
                    <button onClick={() => setViewMode("list")} className={`p-1 rounded ${viewMode === "list" ? "text-accent" : "text-muted-foreground/40"}`}><LayoutList className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setViewMode("grid")} className={`p-1 rounded ${viewMode === "grid" ? "text-accent" : "text-muted-foreground/40"}`}><LayoutGrid className="h-3.5 w-3.5" /></button>
                    <button onClick={saveSearch} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-accent transition-colors"><Star className="h-3 w-3" /> save</button>
                    <button onClick={() => { setShowExport(true); setShowSaved(false); }} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-accent transition-colors"><Download className="h-3 w-3" /> export</button>
                  </>
                )}
              </div>
            </div>

            {error && <div className="text-[11px] text-destructive">{error}</div>}

            {loading && (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-24 rounded-xl border border-border/10 bg-card/20 animate-pulse" />)}</div>
            )}

            {/* Historical — rich cards */}
            {!loading && pillar === "historical" && results.length > 0 && (
              <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3"}>
                {results.map((r, i) => (
                  <ArchiveResultCard key={r.id} result={r} index={i + (page - 1) * 60} onSave={saveSearch} />
                ))}
              </div>
            )}

            {/* Lost Knowledge */}
            {!loading && pillar === "lost" && wayback.length > 0 && (
              <div className="space-y-2">
                {wayback.map((h) => {
                  const wb = `https://web.archive.org/web/${h.timestamp}/${h.original}`;
                  return (
                    <div key={h.timestamp + h.digest} className="rounded-xl border border-yellow-500/20 bg-card/30 overflow-hidden">
                      <div className="px-4 py-3 border-b border-border/10">
                        <div className="flex items-center gap-2">
                          <Ghost className="h-4 w-4 text-accent shrink-0" />
                          <p className="text-[12px] font-light text-foreground truncate flex-1">{h.original}</p>
                        </div>
                      </div>
                      <div className="px-4 py-2.5">
                        <p className="text-[10px] text-muted-foreground/60">
                          Snapshot · {fmtTs(h.timestamp)} · {h.mimetype} · status {h.statuscode}
                        </p>
                        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-1.5 mt-2">
                          <p className="text-[9px] text-yellow-400">◈ deleted from the live web — only the archive still holds it</p>
                        </div>
                      </div>
                      <div className="px-4 py-2 border-t border-border/10 flex items-center gap-3">
                        <a href={wb} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-accent/80 hover:text-accent">
                          <ExternalLink className="h-3 w-3" /> Recover snapshot
                        </a>
                        <button onClick={() => saveSearch()} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-accent ml-auto">
                          <Star className="h-3 w-3" /> Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Evolution Tracking */}
            {!loading && pillar === "evolution" && evo.length > 0 && (
              <div className="space-y-3">
                {evo.map((b) => {
                  const max = Math.max(...evo.map((x) => x.count), 1);
                  const pct = Math.round((b.count / max) * 100);
                  return (
                    <div key={b.label} className="rounded-xl border border-border/20 bg-card/30 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] font-light text-foreground w-14 shrink-0">{b.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-card/50 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-accent/40 to-accent/80 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground/70 w-20 text-right">{b.count.toLocaleString()} docs</span>
                      </div>
                      {b.top.length > 0 && (
                        <div className="mt-2 border-t border-border/10 pt-2">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1">top items</p>
                          <ul className="space-y-1">
                            {b.top.slice(0, 5).map((d) => (
                              <li key={d.identifier} className="text-[11px] font-extralight text-muted-foreground/80 truncate">
                                <a href={`${IA}/details/${d.identifier}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                                  • {d.title || d.identifier} {d.date ? <span className="text-muted-foreground/40">· {String(d.date).slice(0,10)}</span> : null}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!loading && searched && !error &&
              ((pillar === "historical" && docs.length === 0) ||
               (pillar === "lost" && wayback.length === 0) ||
               (pillar === "evolution" && evo.length === 0)) && (
              <div className="text-center py-12">
                <Archive className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-extralight text-muted-foreground">no results matched.</p>
              </div>
            )}

            {/* Pagination (historical) */}
            {!loading && pillar === "historical" && docs.length > 0 && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button onClick={() => { setPage(Math.max(1, page - 1)); run(query); }} disabled={page <= 1} className="p-1.5 rounded-lg border border-border/20 text-muted-foreground/50 hover:text-foreground disabled:opacity-30">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => { setPage(p); run(query); }} className={`w-7 h-7 rounded-lg text-[10px] transition-colors ${page === p ? "bg-accent/20 border border-accent/40 text-accent" : "border border-border/20 text-muted-foreground/50 hover:text-foreground"}`}>
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && <span className="text-[10px] text-muted-foreground/30">… {totalPages}</span>}
                <button onClick={() => { setPage(Math.min(totalPages, page + 1)); run(query); }} disabled={page >= totalPages} className="p-1.5 rounded-lg border border-border/20 text-muted-foreground/50 hover:text-foreground disabled:opacity-30">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video/audio preview overlay */}
      {previewing && (
        <>
          <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm" onClick={() => setPreviewing(null)} />
          <div className="fixed inset-4 sm:inset-10 z-50 rounded-2xl border border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
              <Play className="h-4 w-4 text-accent" />
              <p className="flex-1 text-xs font-light text-foreground truncate">{previewing.title || previewing.identifier}</p>
              <span className="text-[10px] text-muted-foreground/60">stream-only · cannot be downloaded</span>
              <button onClick={() => setPreviewing(null)} className="text-xs px-2 py-1 rounded-md hover:bg-foreground/10 text-muted-foreground hover:text-foreground">close</button>
            </div>
            <iframe src={`${IA}/embed/${previewing.identifier}`} className="flex-1 w-full bg-black" allow="autoplay; fullscreen" allowFullScreen title={previewing.title || previewing.identifier} />
          </div>
        </>
      )}
    </div>
  );
};

export default ArchivePanel;
