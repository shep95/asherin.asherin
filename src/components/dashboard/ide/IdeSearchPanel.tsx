import { useState, useMemo } from "react";
import { Search, X, CaseSensitive, Regex, Replace, ChevronDown, ChevronRight, FileCode } from "lucide-react";
import type { IdeFile } from "./IdeFileTree";

interface Props {
  files: IdeFile[];
  onOpenFile: (file: IdeFile) => void;
}

function flattenFiles(files: IdeFile[]): IdeFile[] {
  const result: IdeFile[] = [];
  for (const f of files) {
    if (f.type === "file") result.push(f);
    if (f.children) result.push(...flattenFiles(f.children));
  }
  return result;
}

interface SearchMatch {
  file: IdeFile;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

const IdeSearchPanel = ({ files, onOpenFile }: Props) => {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const allFiles = useMemo(() => flattenFiles(files), [files]);

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const matches: SearchMatch[] = [];

    for (const file of allFiles) {
      if (!file.content) continue;
      const lines = file.content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        try {
          let flags = "g" + (caseSensitive ? "" : "i");
          let pattern: RegExp;
          if (useRegex) {
            pattern = new RegExp(query, flags);
          } else {
            pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
          }

          let match: RegExpExecArray | null;
          while ((match = pattern.exec(line)) !== null) {
            matches.push({
              file,
              line: i + 1,
              text: line,
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            });
            if (matches.length > 500) break;
          }
        } catch {
          // invalid regex
        }
      }
      if (matches.length > 500) break;
    }

    return matches;
  }, [query, allFiles, caseSensitive, useRegex]);

  // Group by file
  const grouped = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const m of results) {
      const arr = map.get(m.file.id) || [];
      arr.push(m);
      map.set(m.file.id, arr);
    }
    return map;
  }, [results]);

  const toggleFile = (id: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Auto-expand all on search
  const fileCount = grouped.size;
  const totalMatches = results.length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border/20">
        <span className="text-[10px] font-light tracking-widest text-muted-foreground/60 uppercase">Search</span>
      </div>

      {/* Search input */}
      <div className="px-2 py-2 space-y-1.5 border-b border-border/10">
        <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-card/20 px-2 py-1.5">
          <Search className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search in files..."
            autoFocus
            className="flex-1 bg-transparent text-[11px] font-light text-foreground outline-none placeholder:text-muted-foreground/30 min-w-0"
          />
          {query && (
            <button onClick={() => setQuery("")} className="shrink-0">
              <X className="h-3 w-3 text-muted-foreground/40" />
            </button>
          )}
        </div>

        {/* Options row */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`p-1 rounded transition-colors ${caseSensitive ? "bg-accent/20 text-accent" : "text-muted-foreground/40 hover:text-foreground"}`}
            title="Case Sensitive"
          >
            <CaseSensitive className="h-3 w-3" />
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={`p-1 rounded transition-colors ${useRegex ? "bg-accent/20 text-accent" : "text-muted-foreground/40 hover:text-foreground"}`}
            title="Use Regex"
          >
            <Regex className="h-3 w-3" />
          </button>
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={`p-1 rounded transition-colors ${showReplace ? "bg-accent/20 text-accent" : "text-muted-foreground/40 hover:text-foreground"}`}
            title="Find & Replace"
          >
            <Replace className="h-3 w-3" />
          </button>
          {query && (
            <span className="text-[9px] text-muted-foreground/40 ml-auto">
              {totalMatches} in {fileCount} files
            </span>
          )}
        </div>

        {showReplace && (
          <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-card/20 px-2 py-1.5">
            <Replace className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            <input
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 bg-transparent text-[11px] font-light text-foreground outline-none placeholder:text-muted-foreground/30 min-w-0"
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto py-1">
        {query && results.length === 0 && (
          <p className="px-3 py-4 text-[10px] text-muted-foreground/40 text-center">No results found</p>
        )}

        {Array.from(grouped.entries()).map(([fileId, matches]) => {
          const file = matches[0].file;
          const isOpen = expandedFiles.has(fileId) || expandedFiles.size === 0; // default open
          return (
            <div key={fileId}>
              <button
                onClick={() => toggleFile(fileId)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-light text-muted-foreground hover:bg-foreground/5 transition-colors"
              >
                {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <FileCode className="h-3 w-3 text-accent/40 shrink-0" />
                <span className="truncate text-left">{file.name}</span>
                <span className="text-[9px] text-muted-foreground/30 ml-auto shrink-0">{matches.length}</span>
              </button>
              {isOpen && matches.slice(0, 20).map((m, i) => (
                <button
                  key={i}
                  onClick={() => onOpenFile(m.file)}
                  className="w-full text-left px-6 py-0.5 text-[10px] font-light text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors truncate"
                >
                  <span className="text-muted-foreground/30 mr-1.5">{m.line}:</span>
                  <span>{m.text.slice(0, 80)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IdeSearchPanel;
