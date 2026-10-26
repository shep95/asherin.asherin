import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Filter,
  X,
  Trash2,
  Calendar,
  Shield,
  Globe2,
  FileType,
  Languages,
  MapPin,
  Type,
  Plus,
  ListFilter,
  EyeOff,
  ArrowDownUp,
  Bookmark,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Search,
  Tag,
} from "lucide-react";
import type { SearchFilters, SourceTier } from "./types";

interface FilterProfile {
  name: string;
  filters: SearchFilters;
}

const DEFAULT_PROFILES: FilterProfile[] = [
  { name: "Research Mode",  filters: { credibilityMin: 2, fileType: "pdf", sortBy: "credibility" } },
  { name: "Quick News",     filters: { dateRange: "day", sourceType: ["news"], sortBy: "date" } },
  { name: "Academic Only",  filters: { sourceType: ["academic"], credibilityMin: 1, fileType: "pdf" } },
  { name: "Gov / Official", filters: { sourceType: ["gov"], credibilityMin: 1 } },
  { name: "Deep Search",    filters: { contentLength: "long", sortBy: "relevance" } },
];

const SOURCE_TYPES: Array<{ id: string; label: string }> = [
  { id: "news",     label: "news" },
  { id: "academic", label: "academic" },
  { id: "gov",      label: "government" },
  { id: "blog",     label: "blogs" },
  { id: "forum",    label: "forums" },
  { id: "social",   label: "social" },
  { id: "video",    label: "video" },
];

const FILE_TYPES: Array<{ id: string; label: string }> = [
  { id: "",    label: "any" },
  { id: "pdf", label: "PDF" },
  { id: "doc", label: "DOC" },
  { id: "xls", label: "XLS" },
  { id: "ppt", label: "PPT" },
  { id: "csv", label: "CSV" },
  { id: "txt", label: "TXT" },
];

const LANGUAGES: Array<{ id: string; label: string }> = [
  { id: "",   label: "any" },
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" },
  { id: "ar", label: "Arabic" },
  { id: "ru", label: "Russian" },
];

const REGIONS: Array<{ id: string; label: string }> = [
  { id: "",   label: "worldwide" },
  { id: "US", label: "United States" },
  { id: "GB", label: "United Kingdom" },
  { id: "CA", label: "Canada" },
  { id: "AU", label: "Australia" },
  { id: "FR", label: "France" },
  { id: "DE", label: "Germany" },
  { id: "JP", label: "Japan" },
  { id: "CN", label: "China" },
  { id: "IN", label: "India" },
];

interface FilterSidebarProps {
  filters: SearchFilters;
  onFiltersChange: (f: SearchFilters) => void;
  blockedDomains: string[];
  onBlockDomain: (domain: string) => void;
  onUnblockDomain: (domain: string) => void;
}

const FilterSidebar = ({ filters, onFiltersChange, blockedDomains, onBlockDomain, onUnblockDomain }: FilterSidebarProps) => {
  const [open, setOpen] = useState(false);
  const [blockInput, setBlockInput] = useState("");
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profiles, setProfiles] = useState<FilterProfile[]>(() => {
    try {
      const saved = localStorage.getItem("zophiel_filter_profiles_v2");
      return saved ? JSON.parse(saved) : DEFAULT_PROFILES;
    } catch { return DEFAULT_PROFILES; }
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profiles: true, date: true, credibility: true, sourceType: true,
    keywords: false, advanced: false, file: false, locale: false, blocked: false,
  });

  const setF = (patch: Partial<SearchFilters>) => onFiltersChange({ ...filters, ...patch });
  const toggleArr = (arr: string[] | undefined, v: string) => {
    const a = new Set(arr ?? []);
    if (a.has(v)) a.delete(v);
    else a.add(v);
    return Array.from(a);
  };

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.dateRange) n++;
    if (filters.credibilityMin) n++;
    if (filters.fileType) n++;
    if (filters.sourceType?.length) n++;
    if (filters.language) n++;
    if (filters.region) n++;
    if (filters.exactPhrase) n++;
    if (filters.includeKeywords?.length) n++;
    if (filters.excludeKeywords?.length) n++;
    if (filters.contentLength) n++;
    if (filters.sortBy && filters.sortBy !== "relevance") n++;
    if (filters.safeSearch && filters.safeSearch !== "moderate") n++;
    if (filters.intitle) n++;
    if (filters.inurl) n++;
    return n;
  }, [filters]);

  const saveProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    const next = [...profiles.filter(p => p.name !== name), { name, filters }];
    setProfiles(next);
    try { localStorage.setItem("zophiel_filter_profiles_v2", JSON.stringify(next)); } catch { /* private mode */ }
    setProfileName("");
  };
  const deleteProfile = (name: string) => {
    const next = profiles.filter(p => p.name !== name);
    setProfiles(next);
    try { localStorage.setItem("zophiel_filter_profiles_v2", JSON.stringify(next)); } catch { /* private mode */ }
  };

  const Section = ({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children: React.ReactNode }) => {
    const isOpen = openSections[id];
    return (
      <div className="border-b border-border/10">
        <button
          onClick={() => setOpenSections(s => ({ ...s, [id]: !s[id] }))}
          className="w-full flex items-center gap-2 py-2.5 text-[10px] font-light tracking-[0.22em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="h-3 w-3" />
          <span className="flex-1 text-left">{title}</span>
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {isOpen && <div className="pb-3 space-y-1.5">{children}</div>}
      </div>
    );
  };

  const Pill = ({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-[10px] font-light tracking-wide transition-all ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border/30 bg-foreground/[0.03] text-muted-foreground hover:text-foreground hover:border-border/60"
      }`}
    >
      {children}
    </button>
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-30 lg:relative lg:bottom-auto lg:left-auto flex items-center gap-1.5 rounded-full lg:rounded-lg bg-card/80 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border border-border/30 lg:border-transparent px-3 py-2 lg:py-1.5 text-[11px] font-light text-muted-foreground/70 hover:text-foreground hover:bg-foreground/5 shadow-lg lg:shadow-none transition-all"
      >
        <Filter className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">filters</span>
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-foreground/15 text-foreground px-1.5 py-px text-[9px] tabular-nums">
            {activeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Mobile overlay */}
      <div className="fixed inset-0 z-40 bg-background/60 lg:hidden" onClick={() => setOpen(false)} />

      <aside className="fixed inset-y-0 left-0 z-50 w-80 lg:relative lg:w-72 lg:z-auto shrink-0 border-r border-border/15 bg-card/90 lg:bg-card/20 backdrop-blur-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/15 bg-gradient-to-b from-foreground/[0.04] to-transparent">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ListFilter className="h-3.5 w-3.5 text-accent" />
              <h3 className="text-[11px] font-medium text-foreground tracking-[0.22em] uppercase">refine results</h3>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-light tracking-[0.2em] uppercase text-muted-foreground/70">
              {activeCount === 0 ? "No filters active" : `${activeCount} active`}
            </span>
            {activeCount > 0 && (
              <button
                onClick={() => onFiltersChange({})}
                className="ml-auto inline-flex items-center gap-1 text-[9px] tracking-[0.2em] uppercase text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4">
          {/* Profiles */}
          <Section id="profiles" icon={Bookmark} title="quick profiles">
            <div className="space-y-1">
              {profiles.map(p => (
                <div key={p.name} className="group flex items-center gap-1">
                  <button
                    onClick={() => onFiltersChange(p.filters)}
                    className="flex-1 text-left rounded-md px-2.5 py-1.5 text-[11px] font-light text-foreground/80 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => deleteProfile(p.name)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/50 hover:text-destructive transition"
                    title="delete profile"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1 pt-2 mt-2 border-t border-border/10">
              <input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="save current as…"
                onKeyDown={e => { if (e.key === "Enter") saveProfile(); }}
                className="flex-1 min-w-0 rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40"
              />
              <button onClick={saveProfile} className="rounded-md bg-foreground/10 hover:bg-foreground/20 px-2 py-1.5 text-foreground/80" title="save profile">
                <Save className="h-3 w-3" />
              </button>
            </div>
          </Section>

          {/* Sort */}
          <Section id="sort" icon={ArrowDownUp} title="sort & length">
            <div className="flex flex-wrap gap-1.5">
              {(["relevance","date","credibility"] as const).map(s => (
                <Pill key={s} active={(filters.sortBy ?? "relevance") === s} onClick={() => setF({ sortBy: s })}>
                  {s[0].toUpperCase() + s.slice(1)}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {([undefined,"short","medium","long"] as const).map(c => (
                <Pill key={c ?? "any"} active={filters.contentLength === c} onClick={() => setF({ contentLength: c as SearchFilters["contentLength"] })}>
                  {c ? c[0].toUpperCase() + c.slice(1) : "Any length"}
                </Pill>
              ))}
            </div>
          </Section>

          {/* Date */}
          <Section id="date" icon={Calendar} title="date">
            <div className="flex flex-wrap gap-1.5">
              {([undefined,"day","week","month","year","custom"] as const).map(d => (
                <Pill key={d ?? "any"} active={filters.dateRange === d} onClick={() => setF({ dateRange: d as SearchFilters["dateRange"] })}>
                  {d ? (d === "custom" ? "Custom" : `Last ${d}`) : "Any time"}
                </Pill>
              ))}
            </div>
            {filters.dateRange === "custom" && (
              <div className="flex items-center gap-1.5 pt-2">
                <input type="date" value={filters.dateFrom ?? ""} onChange={e => setF({ dateFrom: e.target.value || undefined })}
                  className="flex-1 rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-accent/40" />
                <span className="text-[10px] text-muted-foreground/50">→</span>
                <input type="date" value={filters.dateTo ?? ""} onChange={e => setF({ dateTo: e.target.value || undefined })}
                  className="flex-1 rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-accent/40" />
              </div>
            )}
          </Section>

          {/* Credibility */}
          <Section id="credibility" icon={Shield} title="credibility">
            <div className="flex flex-wrap gap-1.5">
              {([undefined,2,1] as const).map(t => (
                <Pill key={t ?? "all"} active={filters.credibilityMin === t} onClick={() => setF({ credibilityMin: t as SourceTier | undefined })}>
                  {t === undefined ? "All sources" : t === 2 ? "Established" : "Primary only"}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {(["off","moderate","strict"] as const).map(s => (
                <Pill key={s} active={(filters.safeSearch ?? "moderate") === s} onClick={() => setF({ safeSearch: s })}>
                  Safe: {s}
                </Pill>
              ))}
            </div>
          </Section>

          {/* Source type */}
          <Section id="sourceType" icon={Globe2} title="source type">
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_TYPES.map(s => (
                <Pill key={s.id} active={filters.sourceType?.includes(s.id)} onClick={() => setF({ sourceType: toggleArr(filters.sourceType, s.id) })}>
                  {s.label}
                </Pill>
              ))}
            </div>
          </Section>

          {/* Keywords */}
          <Section id="keywords" icon={Tag} title="keywords">
            <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">exact phrase</label>
            <input
              value={filters.exactPhrase ?? ""}
              onChange={e => setF({ exactPhrase: e.target.value || undefined })}
              placeholder='"e.g. zero day exploit"'
              className="w-full rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40"
            />

            <div className="pt-2">
              <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">must include</label>
              <div className="flex gap-1">
                <input
                  value={includeInput}
                  onChange={e => setIncludeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && includeInput.trim()) { setF({ includeKeywords: [...(filters.includeKeywords ?? []), includeInput.trim()] }); setIncludeInput(""); } }}
                  placeholder="add keyword"
                  className="flex-1 min-w-0 rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40"
                />
                <button
                  onClick={() => { if (includeInput.trim()) { setF({ includeKeywords: [...(filters.includeKeywords ?? []), includeInput.trim()] }); setIncludeInput(""); } }}
                  className="rounded-md bg-foreground/10 hover:bg-foreground/20 px-2 py-1.5 text-foreground/80"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 pt-1.5">
                {(filters.includeKeywords ?? []).map(k => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-foreground/[0.04] px-2 py-0.5 text-[10px] text-foreground/85">
                    +{k}
                    <button onClick={() => setF({ includeKeywords: filters.includeKeywords?.filter(x => x !== k) })} className="text-muted-foreground/60 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">must exclude</label>
              <div className="flex gap-1">
                <input
                  value={excludeInput}
                  onChange={e => setExcludeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && excludeInput.trim()) { setF({ excludeKeywords: [...(filters.excludeKeywords ?? []), excludeInput.trim()] }); setExcludeInput(""); } }}
                  placeholder="add keyword"
                  className="flex-1 min-w-0 rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40"
                />
                <button
                  onClick={() => { if (excludeInput.trim()) { setF({ excludeKeywords: [...(filters.excludeKeywords ?? []), excludeInput.trim()] }); setExcludeInput(""); } }}
                  className="rounded-md bg-foreground/10 hover:bg-foreground/20 px-2 py-1.5 text-foreground/80"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 pt-1.5">
                {(filters.excludeKeywords ?? []).map(k => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[10px] text-destructive/90">
                    −{k}
                    <button onClick={() => setF({ excludeKeywords: filters.excludeKeywords?.filter(x => x !== k) })} className="text-muted-foreground/60 hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* Advanced (intitle / inurl) */}
          <Section id="advanced" icon={Search} title="advanced operators">
            <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">in title</label>
            <input value={filters.intitle ?? ""} onChange={e => setF({ intitle: e.target.value || undefined })}
              placeholder="intitle:keyword"
              className="w-full rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40 mb-2" />
            <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">in URL</label>
            <input value={filters.inurl ?? ""} onChange={e => setF({ inurl: e.target.value || undefined })}
              placeholder="inurl:path"
              className="w-full rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40" />
          </Section>

          {/* File type */}
          <Section id="file" icon={FileType} title="file type">
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map(f => (
                <Pill key={f.id || "any"} active={(filters.fileType ?? "") === f.id} onClick={() => setF({ fileType: f.id || undefined })}>
                  {f.label}
                </Pill>
              ))}
            </div>
          </Section>

          {/* Locale */}
          <Section id="locale" icon={Languages} title="language & region">
            <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">language</label>
            <select value={filters.language ?? ""} onChange={e => setF({ language: e.target.value || undefined })}
              className="w-full rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-accent/40 mb-2">
              {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <label className="block text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60 mb-1">region</label>
            <select value={filters.region ?? ""} onChange={e => setF({ region: e.target.value || undefined })}
              className="w-full rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-accent/40">
              {REGIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Section>

          {/* Blocked Domains */}
          <Section id="blocked" icon={EyeOff} title="blocked domains">
            <div className="flex gap-1">
              <input
                value={blockInput}
                onChange={e => setBlockInput(e.target.value)}
                placeholder="domain.com"
                onKeyDown={e => { if (e.key === "Enter" && blockInput.trim()) { onBlockDomain(blockInput.trim()); setBlockInput(""); } }}
                className="flex-1 min-w-0 rounded-md border border-border/20 bg-background/50 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/40"
              />
              <button
                onClick={() => { if (blockInput.trim()) { onBlockDomain(blockInput.trim()); setBlockInput(""); } }}
                className="rounded-md bg-destructive/15 hover:bg-destructive/25 px-2.5 py-1.5 text-[10px] text-destructive"
              >
                Block
              </button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto pt-1">
              {blockedDomains.map(d => (
                <div key={d} className="flex items-center justify-between rounded-md bg-foreground/[0.03] px-2 py-1">
                  <span className="text-[10px] text-muted-foreground truncate">{d}</span>
                  <button onClick={() => onUnblockDomain(d)} className="text-muted-foreground/40 hover:text-destructive shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {blockedDomains.length === 0 && (
                <p className="text-[10px] font-extralight text-muted-foreground/40 italic px-1">no blocked domains.</p>
              )}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/15 bg-foreground/[0.02]">
          <button
            onClick={() => onFiltersChange({})}
            className="w-full rounded-lg border border-border/30 py-2 text-[11px] font-light text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      </aside>
    </>
  );
};

export default FilterSidebar;
