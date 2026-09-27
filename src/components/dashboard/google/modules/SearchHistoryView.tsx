import { Search, Lock, ExternalLink } from "lucide-react";

const SearchHistoryView = () => {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Search className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <h2 className="text-lg font-extralight tracking-wide text-foreground">Search History Intelligence</h2>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              Google Search history analysis for interest profiling and behavioral patterns.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-4">
        <Lock className="h-10 w-10 text-amber-400/40 mx-auto" />
        <div className="space-y-2">
          <h3 className="text-sm font-light text-foreground">Restricted API</h3>
          <p className="text-xs font-extralight text-muted-foreground max-w-md mx-auto">
            Google Search History is not available through standard OAuth APIs. This data is only accessible via Google Takeout exports.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 pt-2">
          <a
            href="https://takeout.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-foreground/10 px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/20 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Export via Google Takeout
          </a>
          <p className="text-[10px] font-extralight text-muted-foreground/40">
            Download your search data and upload it to Azplen for analysis
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
        <h3 className="text-xs font-light tracking-wide text-foreground">What We Could Analyze</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            "Interest profiling from search queries",
            "Temporal search patterns (time of day, frequency)",
            "Topic clustering and knowledge domains",
            "Purchase intent detection from product searches",
            "Health concern monitoring from medical queries",
            "Travel planning detection from destination searches",
          ].map((feat, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2">
              <Search className="h-3 w-3 text-muted-foreground/30 shrink-0" />
              <span className="text-[10px] font-extralight text-muted-foreground">{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchHistoryView;