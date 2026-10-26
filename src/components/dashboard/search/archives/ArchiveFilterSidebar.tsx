import { Calendar, Target, Database, Zap, Tag, Globe, X } from "lucide-react";

export interface ArchiveFilters {
  timeRange: "all" | "5y" | "1y" | "custom";
  customFrom?: string;
  customTo?: string;
  domains: string[];
  sources: string[];
  confidence: number; // 0–100
  fileTypes: string[];
  languages: string[];
}

const DOMAINS = [
  { id: "cybersecurity", label: "cybersecurity" },
  { id: "exploit-dev", label: "exploit dev" },
  { id: "coding", label: "coding" },
  { id: "software-protect", label: "software protect" },
  { id: "ai-ml", label: "AI / ML" },
];

const SOURCES = [
  { id: "cve", label: "CVE database" },
  { id: "exploit-db", label: "Exploit-DB" },
  { id: "research", label: "research papers" },
  { id: "forums", label: "forum archives" },
  { id: "github", label: "GitHub" },
  { id: "internet-archive", label: "Internet Archive" },
];

const FILE_TYPES = [
  { id: "pdf", label: "PDF" },
  { id: "code", label: "code (.py .c .rb)" },
  { id: "text", label: "text / markdown" },
  { id: "video", label: "video" },
  { id: "images", label: "images" },
];

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh", label: "Chinese" },
  { id: "ru", label: "Russian" },
  { id: "es", label: "Spanish" },
];

interface Props {
  filters: ArchiveFilters;
  onChange: (f: ArchiveFilters) => void;
}

const Checkbox = ({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) => (
  <button onClick={onToggle} className="flex items-center gap-2 text-[11px] font-light hover:text-foreground transition-colors w-full text-left">
    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-accent/30 border-accent/60 text-accent" : "border-border/40 text-transparent"}`}>
      {checked && "✓"}
    </span>
    <span className={checked ? "text-foreground" : "text-muted-foreground/70"}>{label}</span>
  </button>
);

const Radio = ({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) => (
  <button onClick={onSelect} className="flex items-center gap-2 text-[11px] font-light hover:text-foreground transition-colors w-full text-left">
    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${checked ? "border-accent/60" : "border-border/40"}`}>
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
    </span>
    <span className={checked ? "text-foreground" : "text-muted-foreground/70"}>{label}</span>
  </button>
);

const toggleArr = (arr: string[], id: string) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

const ArchiveFilterSidebar = ({ filters, onChange }: Props) => {
  const set = (patch: Partial<ArchiveFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-5 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 font-medium">filters</span>
      </div>

      {/* Time Range */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/70"><Calendar className="h-3 w-3" /> TIME RANGE</div>
        <div className="space-y-1.5 pl-1">
          <Radio checked={filters.timeRange === "all"} label="all time" onSelect={() => set({ timeRange: "all" })} />
          <Radio checked={filters.timeRange === "5y"} label="last 5 years" onSelect={() => set({ timeRange: "5y" })} />
          <Radio checked={filters.timeRange === "1y"} label="last year" onSelect={() => set({ timeRange: "1y" })} />
          <Radio checked={filters.timeRange === "custom"} label="custom range" onSelect={() => set({ timeRange: "custom" })} />
          {filters.timeRange === "custom" && (
            <div className="flex items-center gap-1.5 pl-5 mt-1">
              <input type="number" min={1990} max={2026} value={filters.customFrom || ""} onChange={e => set({ customFrom: e.target.value })} placeholder="1990" className="w-16 bg-card/40 border border-border/30 rounded px-1.5 py-0.5 text-[10px] text-foreground outline-none" />
              <span className="text-muted-foreground/40">–</span>
              <input type="number" min={1990} max={2026} value={filters.customTo || ""} onChange={e => set({ customTo: e.target.value })} placeholder="2026" className="w-16 bg-card/40 border border-border/30 rounded px-1.5 py-0.5 text-[10px] text-foreground outline-none" />
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-border/20" />

      {/* Domain */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/70"><Target className="h-3 w-3" /> DOMAIN</div>
        <div className="space-y-1.5 pl-1">
          {DOMAINS.map(d => <Checkbox key={d.id} checked={filters.domains.includes(d.id)} label={d.label} onToggle={() => set({ domains: toggleArr(filters.domains, d.id) })} />)}
        </div>
      </div>

      <div className="h-px bg-border/20" />

      {/* Source Type */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/70"><Database className="h-3 w-3" /> SOURCE TYPE</div>
        <div className="space-y-1.5 pl-1">
          {SOURCES.map(s => <Checkbox key={s.id} checked={filters.sources.includes(s.id)} label={s.label} onToggle={() => set({ sources: toggleArr(filters.sources, s.id) })} />)}
        </div>
      </div>

      <div className="h-px bg-border/20" />

      {/* Confidence */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/70"><Zap className="h-3 w-3" /> CONFIDENCE</div>
        <div className="pl-1 space-y-1">
          <input type="range" min={0} max={100} value={filters.confidence} onChange={e => set({ confidence: Number(e.target.value) })} className="w-full accent-accent h-1" />
          <div className="flex justify-between text-[9px] text-muted-foreground/50">
            <span>low</span><span>Min: {filters.confidence}%</span><span>high</span>
          </div>
        </div>
      </div>

      <div className="h-px bg-border/20" />

      {/* File Type */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/70"><Tag className="h-3 w-3" /> FILE TYPE</div>
        <div className="space-y-1.5 pl-1">
          {FILE_TYPES.map(f => <Checkbox key={f.id} checked={filters.fileTypes.includes(f.id)} label={f.label} onToggle={() => set({ fileTypes: toggleArr(filters.fileTypes, f.id) })} />)}
        </div>
      </div>

      <div className="h-px bg-border/20" />

      {/* Language */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground/70"><Globe className="h-3 w-3" /> LANGUAGE</div>
        <div className="space-y-1.5 pl-1">
          {LANGUAGES.map(l => <Checkbox key={l.id} checked={filters.languages.includes(l.id)} label={l.label} onToggle={() => set({ languages: toggleArr(filters.languages, l.id) })} />)}
        </div>
      </div>

      <div className="h-px bg-border/20" />

      <div className="flex items-center gap-2">
        <button onClick={() => onChange({ timeRange: "all", domains: [], sources: [], confidence: 0, fileTypes: [], languages: [] })} className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-1">
          <X className="h-3 w-3" /> Clear All Filters
        </button>
      </div>
    </div>
  );
};

export default ArchiveFilterSidebar;
