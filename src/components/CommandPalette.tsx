// Global Command Palette — primary front door for navigation.
// Cmd/Ctrl+K toggles; "/" also toggles outside text inputs.
// Indexes every dashboard view by INTENT (plain-language label + synonyms),
// with codename as secondary subtitle. Tracks recently-used items.
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Search, Clock, X } from "lucide-react";
import {
  NAV_INTENTS,
  INTENT_GROUPS,
  type IntentGroup,
  type NavIntent,
  getRecentIntents,
  trackRecentIntent,
} from "@/lib/navIntents";

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
};

const intentHref = (i: NavIntent): string => {
  if (i.route) return i.route;
  if (i.view === "chat") return "/dashboard";
  return `/dashboard/${i.view}`;
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<NavIntent[]>(() => getRecentIntents());
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K — always
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "/" — only outside text inputs
      if (e.key === "/" && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpenEvt = () => setOpen(true);
    const onRecents = () => setRecents(getRecentIntents());
    window.addEventListener("keydown", onKey);
    window.addEventListener("aureon-open-command-palette", onOpenEvt as EventListener);
    window.addEventListener("aureon-recents-changed", onRecents);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("aureon-open-command-palette", onOpenEvt as EventListener);
      window.removeEventListener("aureon-recents-changed", onRecents);
    };
  }, []);

  useEffect(() => { if (open) setRecents(getRecentIntents()); }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<IntentGroup, NavIntent[]>();
    for (const g of INTENT_GROUPS) map.set(g, []);
    for (const i of NAV_INTENTS) map.get(i.group)?.push(i);
    return map;
  }, []);

  const runIntent = (i: NavIntent) => {
    trackRecentIntent((i.view ?? i.route)!);
    setOpen(false);
    navigate(intentHref(i));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-background/80 backdrop-blur-sm pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="bg-card text-foreground"
          filter={(value, search) => {
            // value is "label||codename||kw1 kw2 kw3"
            const hay = value.toLowerCase();
            const needle = search.toLowerCase().trim();
            if (!needle) return 1;
            // every space-separated token must appear somewhere
            return needle.split(/\s+/).every((t) => hay.includes(t)) ? 1 : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="What do you want to do?  (try: make a slideshow, check a website for threats, predict an event)"
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="hidden sm:inline-block rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Close palette"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”. Try a verb like “make”, “analyze”, “check”.
            </Command.Empty>

            {!query.trim() && recents.length > 0 && (
              <Command.Group
                heading="Recent"
                className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1"
              >
                {recents.map((i) => (
                  <Command.Item
                    key={`recent-${i.view ?? i.route}`}
                    value={`${i.label}||${i.codename ?? ""}||recent ${i.keywords.join(" ")}`}
                    onSelect={() => runIntent(i)}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
                  >
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                    <span className="flex-1">
                      <span className="text-foreground">{i.label}</span>
                      {i.codename && (
                        <span className="text-muted-foreground/60 ml-2 text-xs">{i.codename}</span>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {INTENT_GROUPS.map((g) => {
              const items = grouped.get(g) ?? [];
              if (items.length === 0) return null;
              return (
                <Command.Group
                  key={g}
                  heading={g.toUpperCase()}
                  className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 mt-1"
                >
                  {items.map((i) => (
                    <Command.Item
                      key={i.view ?? i.route}
                      value={`${i.label}||${i.codename ?? ""}||${i.keywords.join(" ")} ${g}`}
                      onSelect={() => runIntent(i)}
                      className="flex items-start gap-3 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-muted"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-foreground truncate">{i.label}</span>
                        {(i.codename || i.blurb) && (
                          <span className="block text-[11px] text-muted-foreground/70 truncate">
                            {i.codename}
                            {i.codename && i.blurb ? " · " : ""}
                            {i.blurb}
                          </span>
                        )}
                      </span>
                      {i.access === "pro" && (
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mt-0.5">Pro</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>

          <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>
              <kbd className="rounded border border-border px-1">↑↓</kbd> navigate{" "}
              <kbd className="rounded border border-border px-1 ml-1">↵</kbd> select
            </span>
            <span>
              <kbd className="rounded border border-border px-1">⌘K</kbd>{" "}
              or <kbd className="rounded border border-border px-1">/</kbd> toggle
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
