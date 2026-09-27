import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";

interface ChatSearchBarProps {
  messages: { id: string; content: string; role: string }[];
  onHighlightMessage: (messageId: string | null) => void;
  onSearchActive: (active: boolean) => void;
}

const ChatSearchBar = ({ messages, onHighlightMessage, onSearchActive }: ChatSearchBarProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find matches
  useEffect(() => {
    if (!query.trim()) {
      setMatchIds([]);
      onHighlightMessage(null);
      return;
    }
    const lower = query.toLowerCase();
    const ids = messages
      .filter((m) => m.content.toLowerCase().includes(lower))
      .map((m) => m.id);
    setMatchIds(ids);
    setCurrentIdx(0);
    if (ids.length > 0) onHighlightMessage(ids[0]);
    else onHighlightMessage(null);
  }, [query, messages]);

  const navigate = useCallback(
    (dir: 1 | -1) => {
      if (matchIds.length === 0) return;
      const next = (currentIdx + dir + matchIds.length) % matchIds.length;
      setCurrentIdx(next);
      onHighlightMessage(matchIds[next]);
    },
    [matchIds, currentIdx, onHighlightMessage]
  );

  const close = () => {
    setOpen(false);
    setQuery("");
    setMatchIds([]);
    onHighlightMessage(null);
    onSearchActive(false);
  };

  const openSearch = () => {
    setOpen(true);
    onSearchActive(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Keyboard shortcut: Ctrl+F / Cmd+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        if (open) inputRef.current?.focus();
        else openSearch();
      }
      if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={openSearch}
        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors"
        title="Search conversation (Ctrl+F)"
      >
        <Search className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-card/40 backdrop-blur-sm px-3 py-1.5 animate-fade-in">
      <Search className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(e.shiftKey ? -1 : 1);
        }}
        placeholder="Search messages…"
        className="bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none w-32 sm:w-48"
      />
      {query && (
        <span className="text-[10px] text-muted-foreground/50 font-light whitespace-nowrap">
          {matchIds.length > 0 ? `${currentIdx + 1}/${matchIds.length}` : "0 results"}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => navigate(-1)}
          disabled={matchIds.length === 0}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => navigate(1)}
          disabled={matchIds.length === 0}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        onClick={close}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export { ChatSearchBar };
export default ChatSearchBar;
