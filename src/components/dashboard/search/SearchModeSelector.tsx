import { Globe, Newspaper, GraduationCap, Code, BarChart3, FileText, Brain, Archive } from "lucide-react";
import type { SearchMode } from "./types";

type ModeDef = { id: SearchMode; label: string; icon: React.ReactNode; hint: string };

// every mode listed here runs on the device. nothing retired is reachable.
const modes: ModeDef[] = [
  { id: "web", label: "web", icon: <Globe className="h-3.5 w-3.5" />, hint: "open web indexes, encyclopedia, community and archive" },
  { id: "news", label: "news", icon: <Newspaper className="h-3.5 w-3.5" />, hint: "global news feed, community and web" },
  { id: "academic", label: "academic", icon: <GraduationCap className="h-3.5 w-3.5" />, hint: "arXiv, OpenAlex, Crossref, Google Books" },
  { id: "code", label: "code", icon: <Code className="h-3.5 w-3.5" />, hint: "GitHub repositories, Stack Overflow, Hacker News, advisories" },
  { id: "data", label: "data", icon: <BarChart3 className="h-3.5 w-3.5" />, hint: "SEC filings and NVD vulnerability records" },
  { id: "docs", label: "docs", icon: <FileText className="h-3.5 w-3.5" />, hint: "reference, books and documentation" },
  { id: "deep", label: "deep", icon: <Brain className="h-3.5 w-3.5" />, hint: "gather, read the pages, validate, and have shepherd write a sourced briefing" },
  { id: "archive", label: "archive", icon: <Archive className="h-3.5 w-3.5" />, hint: "the internet archive: captures, texts, media, software" },
];

interface SearchModeSelectorProps {
  active: SearchMode;
  onChange: (mode: SearchMode) => void;
}

const SearchModeSelector = ({ active, onChange }: SearchModeSelectorProps) => (
  <div className="-mx-1 px-1">
    <div className="flex flex-wrap items-center gap-1">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          title={m.hint}
          aria-pressed={active === m.id}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-light whitespace-nowrap transition-all border ${
            active === m.id
              ? "bg-accent/20 text-accent border-accent/30"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 border-transparent"
          }`}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  </div>
);

export default SearchModeSelector;
