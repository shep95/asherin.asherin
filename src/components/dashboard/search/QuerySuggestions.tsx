import { Search, Calendar, Newspaper, GraduationCap, FileText } from "lucide-react";

interface QuerySuggestionsProps {
  query: string;
  onSelect: (suggestion: string, filterHint?: string) => void;
}

function generateSuggestions(query: string): { label: string; icon: React.ReactNode; filterHint?: string }[] {
  if (!query.trim()) return [];
  const q = query.trim();
  return [
    { label: q, icon: <Search className="h-3.5 w-3.5" /> },
    { label: `${q} this week`, icon: <Calendar className="h-3.5 w-3.5" />, filterHint: "week" },
    { label: `${q} news`, icon: <Newspaper className="h-3.5 w-3.5" /> },
    { label: `${q} research`, icon: <GraduationCap className="h-3.5 w-3.5" /> },
    { label: `${q} PDF`, icon: <FileText className="h-3.5 w-3.5" />, filterHint: "pdf" },
  ];
}

const QuerySuggestions = ({ query, onSelect }: QuerySuggestionsProps) => {
  const suggestions = generateSuggestions(query);
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-fade-in">
      {suggestions.map((s, i) => (
        <button
          type="button"
          key={i}
          onMouseDown={(e) => { e.preventDefault(); onSelect(s.label, s.filterHint); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-light text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors text-left"
        >
          <span className="text-muted-foreground/40">{s.icon}</span>
          {s.label}
          {s.filterHint && (
            <span className="ml-auto text-[10px] rounded-md bg-accent/10 px-1.5 py-0.5 text-accent">+ {s.filterHint}</span>
          )}
        </button>
      ))}
      <div className="border-t border-border/15 px-4 py-2 flex flex-wrap gap-1.5">
        <span className="text-[10px] text-muted-foreground/40 mr-1">quick:</span>
        {["Last 7 days", "PDF only", "News only", ".gov only"].map(f => (
          <button type="button" key={f} onMouseDown={(e) => { e.preventDefault(); onSelect(query, f); }} className="text-[10px] rounded-md border border-border/20 bg-card/30 px-2 py-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors">
            + {f}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuerySuggestions;
