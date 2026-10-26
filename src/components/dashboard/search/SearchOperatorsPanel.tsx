import { useState } from "react";
import { Settings2, X } from "lucide-react";
import type { SearchFilters } from "./types";

interface SearchOperatorsPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onOperatorString: (ops: string) => void;
}

const SearchOperatorsPanel = ({ filters, onFiltersChange, onOperatorString }: SearchOperatorsPanelProps) => {
  const [open, setOpen] = useState(false);
  const [mustInclude, setMustInclude] = useState("");
  const [mustExclude, setMustExclude] = useState("");
  const [exactPhrase, setExactPhrase] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [fileType, setFileType] = useState("");

  const buildOperatorString = () => {
    const parts: string[] = [];
    if (mustInclude.trim()) mustInclude.split(",").map(w => w.trim()).filter(Boolean).forEach(w => parts.push(`+${w}`));
    if (mustExclude.trim()) mustExclude.split(",").map(w => w.trim()).filter(Boolean).forEach(w => parts.push(`-${w}`));
    if (exactPhrase.trim()) parts.push(`"${exactPhrase.trim()}"`);
    if (siteFilter.trim()) parts.push(`site:${siteFilter.trim()}`);
    if (fileType.trim()) parts.push(`filetype:${fileType.trim()}`);
    return parts.join(" ");
  };

  const apply = () => {
    const ops = buildOperatorString();
    onOperatorString(ops);
    onFiltersChange({
      ...filters,
      fileType: fileType.trim() || undefined,
      domainInclude: siteFilter.trim() ? [siteFilter.trim()] : undefined,
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
        title="search operators"
        aria-label="search operators"
      >
        <Settings2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop for mobile */}
      <div className="fixed inset-0 z-[59] sm:hidden" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-3 top-auto bottom-3 z-[60] sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:left-auto sm:bottom-auto sm:mt-2 sm:w-96 rounded-xl border border-border/30 bg-card/95 backdrop-blur-xl p-4 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-foreground tracking-wider uppercase">search operators</h3>
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground" aria-label="close operators">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 block">must include</label>
            <input value={mustInclude} onChange={e => setMustInclude(e.target.value)} placeholder="word1, word2" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/40" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 block">must exclude</label>
            <input value={mustExclude} onChange={e => setMustExclude(e.target.value)} placeholder="word1, word2" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/40" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 block">exact phrase</label>
            <input value={exactPhrase} onChange={e => setExactPhrase(e.target.value)} placeholder="exact words" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/40" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 block">search within site</label>
            <input value={siteFilter} onChange={e => setSiteFilter(e.target.value)} placeholder="example.com" className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/40" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 block">file type</label>
            <select value={fileType} onChange={e => setFileType(e.target.value)} className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none focus:border-accent/40">
              <option value="">any</option>
              <option value="pdf">PDF</option>
              <option value="doc">DOC</option>
              <option value="xls">XLS</option>
              <option value="ppt">PPT</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1 block">date range</label>
            <select value={filters.dateRange || ''} onChange={e => onFiltersChange({ ...filters, dateRange: (e.target.value || undefined) as SearchFilters["dateRange"] })} className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none focus:border-accent/40">
              <option value="">any time</option>
              <option value="day">last 24 hours</option>
              <option value="week">last week</option>
              <option value="month">last month</option>
              <option value="year">last year</option>
            </select>
          </div>
        </div>

        {buildOperatorString() && (
          <div className="mt-3 rounded-lg bg-background/50 border border-border/20 px-3 py-2">
            <p className="text-[10px] text-muted-foreground/50 mb-1">generated query operators:</p>
            <code className="text-[11px] text-accent font-mono break-all">{buildOperatorString()}</code>
          </div>
        )}

        <button type="button" onClick={apply} className="mt-3 w-full rounded-lg bg-accent/20 py-2.5 text-xs font-light text-accent hover:bg-accent/30 transition-colors">
          Apply Operators
        </button>
      </div>
    </>
  );
};

export default SearchOperatorsPanel;
