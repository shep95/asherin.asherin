import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, MessageSquare, Code, FlaskConical, Shield, FolderOpen, Layers, Brain, BarChart3, Settings, Focus, Download, FileText, Upload, Moon, Sun, Database, Newspaper, Users, Globe, Activity, ClipboardList, Code2, CreditCard, Bell } from "lucide-react";
import type { ChatMode, DashboardView } from "./types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onViewChange: (view: DashboardView) => void;
  onModeChange: (mode: ChatMode) => void;
  onFocusMode?: () => void;
}

interface Command {
  id: string;
  label: string;
  category: string;
  icon: React.ElementType;
  action: () => void;
  keywords?: string[];
  shortcut?: string;
}

// Simple fuzzy match
function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower.includes(q)) return true;
  // Character-by-character fuzzy
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}



const CommandPalette = ({ open, onClose, onNewConversation, onViewChange, onModeChange, onFocusMode }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("aureon_recent_cmds") || "[]"); } catch { return []; }
  });

  const trackRecent = (id: string) => {
    const next = [id, ...recentIds.filter(r => r !== id)].slice(0, 5);
    setRecentIds(next);
    localStorage.setItem("aureon_recent_cmds", JSON.stringify(next));
  };

  const wrap = (id: string, fn: () => void) => () => { trackRecent(id); fn(); onClose(); };

  const commands: Command[] = [
    // Actions
    { id: "new", label: "New Conversation", category: "Actions", icon: Plus, action: wrap("new", onNewConversation), keywords: ["create", "start", "chat"], shortcut: "Ctrl+N" },
    { id: "focus", label: "Toggle Focus Mode", category: "Actions", icon: Focus, action: wrap("focus", () => onFocusMode?.()), keywords: ["distraction", "zen", "minimal"] },
    { id: "export", label: "Export Conversation", category: "Actions", icon: Download, keywords: ["download", "save", "markdown"], action: wrap("export", () => {}) },
    { id: "upload", label: "Upload File", category: "Actions", icon: Upload, keywords: ["file", "attach", "document"], action: wrap("upload", () => {}) },
    // Modes
    { id: "chat-mode", label: "Switch to Chat Mode", category: "Modes", icon: MessageSquare, action: wrap("chat-mode", () => onModeChange("chat")), shortcut: "Ctrl+1" },
    { id: "code-mode", label: "Switch to Code Mode", category: "Modes", icon: Code, action: wrap("code-mode", () => onModeChange("code")), shortcut: "Ctrl+2" },
    { id: "research-mode", label: "Switch to Research Mode", category: "Modes", icon: FlaskConical, action: wrap("research-mode", () => onModeChange("research")), shortcut: "Ctrl+3" },
    { id: "truth-mode", label: "Switch to Truth Mode", category: "Modes", icon: Shield, action: wrap("truth-mode", () => onModeChange("truth")), shortcut: "Ctrl+4" },
    // Navigation
    { id: "search", label: "Zophiel Engine", category: "Navigation", icon: Search, action: wrap("search", () => onViewChange("search")), keywords: ["zophiel", "search", "intelligence"] },
    { id: "azplen", label: "Azplen Intelligence", category: "Navigation", icon: Database, action: wrap("azplen", () => onViewChange("azplen")), keywords: ["data", "analysis", "dataset"] },
    { id: "knowledge-vault", label: "Knowledge Vault", category: "Navigation", icon: Database, action: wrap("knowledge-vault", () => onViewChange("knowledge-vault")), keywords: ["vault", "files", "documents", "rag"] },
    { id: "whiteboard", label: "Whiteboard", category: "Navigation", icon: Layers, action: wrap("whiteboard", () => onViewChange("whiteboard")), keywords: ["canvas", "draw", "board"] },
    { id: "briefing", label: "Intel Briefings", category: "Navigation", icon: Newspaper, action: wrap("briefing", () => onViewChange("briefing")), keywords: ["news", "morning"] },
    { id: "notebooks", label: "Notebooks", category: "Navigation", icon: FileText, action: wrap("notebooks", () => onViewChange("notebooks")), keywords: ["notebook", "note"] },
    { id: "teams", label: "Team Workspace", category: "Navigation", icon: Users, action: wrap("teams", () => onViewChange("teams")), keywords: ["team", "collaborate"] },
    { id: "cyber", label: "asherin.cyber", category: "Navigation", icon: Shield, action: wrap("cyber", () => onViewChange("zerlal")), keywords: ["cyber", "recon", "domain", "vulnerability"] },
    
    { id: "audit", label: "Audit Trail", category: "Navigation", icon: ClipboardList, action: wrap("audit", () => onViewChange("audit")), keywords: ["log", "compliance"] },
    { id: "library", label: "Library", category: "Navigation", icon: FolderOpen, action: wrap("library", () => onViewChange("library")), keywords: ["files", "uploads"] },
    { id: "ide", label: "Code Workspace", category: "Navigation", icon: Code, action: wrap("ide", () => onViewChange("ide")), keywords: ["ide", "editor", "code", "workspace", "files", "diff"] },
    { id: "snippets", label: "Code Snippets", category: "Navigation", icon: Code2, action: wrap("snippets", () => onViewChange("snippets")), keywords: ["code", "snippet"] },
    { id: "projects", label: "Projects", category: "Navigation", icon: Layers, action: wrap("projects", () => onViewChange("projects")) },
    { id: "memory", label: "asherin.vault", category: "Navigation", icon: Brain, action: wrap("memory", () => onViewChange("memory")), keywords: ["remember", "recall", "memory", "vault"] },
    { id: "stats", label: "My Stats", category: "Navigation", icon: BarChart3, action: wrap("stats", () => onViewChange("stats")), keywords: ["usage", "analytics"] },
    { id: "settings", label: "Settings", category: "Navigation", icon: Settings, action: wrap("settings", () => onViewChange("settings")), keywords: ["preferences", "config"] },
  ];

  const filtered = query.trim()
    ? commands.filter((c) =>
        fuzzyMatch(c.label, query) ||
        fuzzyMatch(c.category, query) ||
        c.keywords?.some((k) => fuzzyMatch(k, query))
      )
    : commands;

  // Sort: recent first when no query
  const sorted = query.trim() ? filtered : [...filtered].sort((a, b) => {
    const ai = recentIds.indexOf(a.id);
    const bi = recentIds.indexOf(b.id);
    if (ai !== -1 && bi === -1) return -1;
    if (ai === -1 && bi !== -1) return 1;
    if (ai !== -1 && bi !== -1) return ai - bi;
    return 0;
  });

  // Add "Recent" category label for recently used
  const grouped = sorted.reduce<Record<string, Command[]>>((acc, cmd) => {
    const cat = !query.trim() && recentIds.includes(cmd.id) ? "Recent" : cmd.category;
    (acc[cat] ??= []).push(cmd);
    return acc;
  }, {});

  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => setSelectedIdx(0), [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, sorted.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && sorted[selectedIdx]) { sorted[selectedIdx].action(); }
    else if (e.key === "Escape") { onClose(); }
  }, [sorted, selectedIdx, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
          <Search className="h-4 w-4 text-muted-foreground/50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command… (fuzzy search enabled)"
            className="flex-1 bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-border/30 bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {Object.entries(grouped).map(([cat, cmds]) => (
            <div key={cat} className="mb-2">
              <p className="px-3 py-1 text-[10px] font-light tracking-[0.15em] text-muted-foreground/50 uppercase">{cat}</p>
              {cmds.map((cmd) => {
                const globalIdx = sorted.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIdx(globalIdx)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-light transition-colors ${
                      globalIdx === selectedIdx ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <cmd.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] text-muted-foreground/40 font-mono">{cmd.shortcut}</kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="px-3 py-6 text-center text-sm font-light text-muted-foreground/50">No commands found</p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border/20 px-4 py-2 text-[10px] text-muted-foreground/40">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
          <span className="ml-auto">Fuzzy search enabled</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
