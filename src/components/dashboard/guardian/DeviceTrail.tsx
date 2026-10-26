// guardian vault — the device trail. the same `audit_log` rows asherin.activity
// shows, newest first, filterable by what they touched. nothing here is a
// login, a session or an ip: this device only records what it did to itself.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Lock, KeyRound, ShieldAlert, Bell, Activity } from "lucide-react";
import { trailLabel, TRAIL_LIMIT, type TrailEntry } from "@/lib/guardian/deviceSecurity";

const ICON: Record<string, React.ElementType> = {
  key_vault: Lock,
  vault_item: KeyRound,
  watchtower: ShieldAlert,
  notifications: Bell,
};

const detailLine = (d: Record<string, unknown> | null): string => {
  if (!d) return "";
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${String(v)}`)
    .join(" · ");
};

const DeviceTrail = ({ trail, loading, error, onRetry }: { trail: TrailEntry[]; loading: boolean; error: string | null; onRetry: () => void }) => {
  const [filter, setFilter] = useState<string>("all");
  const kinds = useMemo(() => Array.from(new Set(trail.map((e) => e.resource_type).filter(Boolean))).sort(), [trail]);
  const shown = filter === "all" ? trail : trail.filter((e) => e.resource_type === filter);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-extralight tracking-wide text-foreground">device trail</h2>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          what this device recorded about itself, newest first. the same rows asherin.activity shows.
          {trail.length >= TRAIL_LIMIT ? ` most recent ${TRAIL_LIMIT}.` : ""}
        </p>
      </div>

      {kinds.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist" aria-label="filter the trail">
          {["all", ...kinds].map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-light tracking-wide whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                filter === k ? "bg-foreground/10 text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
            >
              {k.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-2">
          <p className="text-xs font-light text-foreground">the trail did not load.</p>
          <p className="text-[10px] text-muted-foreground/50">{error}</p>
          <button type="button" onClick={onRetry} className="text-[10px] px-2.5 py-1 rounded-lg border border-border/30 hover:border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            try again
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-2" aria-busy="true" aria-label="reading the trail">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl border border-border/15 bg-card/5 animate-pulse" />)}
        </div>
      )}

      {!loading && !error && shown.length === 0 && (
        <p className="text-xs text-muted-foreground/40 text-center py-8">
          nothing recorded yet. locking or unlocking the vault, editing an item and running an exposure check each write one line here.
        </p>
      )}

      <ul className="space-y-1">
        {shown.map((e) => {
          const Icon = ICON[e.resource_type] ?? Activity;
          const t = new Date(e.created_at);
          const detail = detailLine(e.details);
          return (
            <li key={e.id} className="flex items-start gap-3 rounded-xl border border-border/10 bg-card/10 px-4 py-3">
              <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs font-light text-foreground">{trailLabel(e)}</p>
                <p className="text-[10px] text-muted-foreground/40">
                  {Number.isNaN(t.getTime()) ? "time unknown" : format(t, "d MMM yyyy HH:mm:ss")}
                  {detail ? ` · ${detail}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DeviceTrail;
