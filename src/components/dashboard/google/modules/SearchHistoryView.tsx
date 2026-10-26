import { Search, Lock, ExternalLink } from "lucide-react";

// query log — google search history. there is no api for it; google only
// hands it out through takeout. the desk says so and links there. it does not
// promise an upload path this room does not have.

const COULD_READ = [
  "interest clusters from query terms",
  "time-of-day and weekday rhythm of searching",
  "topic clustering and knowledge domains",
  "purchase intent from product queries",
  "health concern patterns from medical queries",
  "travel planning from destination queries",
];

const SearchHistoryView = () => (
  <div className="space-y-6">
    <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
          <Search className="h-6 w-6 text-foreground/70" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-lg font-extralight tracking-wide text-foreground">query log</h2>
          <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
            google search history, which would carry an interest profile and a behavioural rhythm — if it could be read.
          </p>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-border/25 bg-card/20 p-8 text-center space-y-4">
      <Lock className="mx-auto h-10 w-10 text-muted-foreground/30" aria-hidden />
      <div className="space-y-2">
        <h3 className="text-sm font-light text-foreground">no api exists for this feed</h3>
        <p className="mx-auto max-w-md text-xs font-extralight leading-relaxed text-muted-foreground">
          google exposes search history only through a takeout export, never through oauth. this desk cannot read the export
          yet either — the link below is where the data is, not a path into this room.
        </p>
      </div>
      <a
        href="https://takeout.google.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-foreground/10 px-4 py-2 text-xs font-light text-foreground transition-all hover:bg-foreground/20 focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        open google takeout
      </a>
    </div>

    <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
      <h3 className="text-xs font-light tracking-wide text-foreground">what the export would support</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {COULD_READ.map((feat) => (
          <div key={feat} className="flex items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground/30" aria-hidden />
            <span className="text-[10px] font-extralight text-muted-foreground">{feat}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default SearchHistoryView;
