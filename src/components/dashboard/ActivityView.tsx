// asherin.activity — what this device did, read from this device.
//
// two half-rooms used to exist: a stats page over a server-filled `usage_stats`
// row and an audit page over `audit_log`. on a device nothing fills that row,
// so the counters here are reduced from the chat store itself (prompts, modes,
// days — never message content, which is ciphertext), and the trail is the same
// `audit_log` the guardian vault writes. nothing is estimated and nothing is
// compared to anyone else.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { BarChart3, MessageSquare, MessagesSquare, CalendarDays, Flame, Search, Lock, KeyRound, ShieldAlert, Bell, Activity, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import { onTableChange } from "@/lib/local/db";
import { readTrail, trailLabel, TRAIL_LIMIT, type TrailEntry } from "@/lib/guardian/deviceSecurity";
import { EMPTY_USAGE, modeShares, readUsage, type UsageFacts } from "@/lib/activity/usage";

/** the same icon per `resource_type` the guardian trail uses, so one action looks the same in both rooms. */
const TRAIL_ICON: Record<string, React.ElementType> = {
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

const when = (iso: string): string => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "time unknown" : format(t, "d MMM yyyy HH:mm");
};

const ActivityView = () => {
  const v2 = useIsV2();
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageFacts>(EMPTY_USAGE);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [trailError, setTrailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [u, t] = await Promise.allSettled([readUsage(user.id), readTrail()]);
    if (u.status === "fulfilled") {
      setUsage(u.value);
      setUsageError(null);
    } else {
      setUsageError(u.reason instanceof Error ? u.reason.message : String(u.reason));
    }
    if (t.status === "fulfilled") {
      setTrail(t.value);
      setTrailError(null);
    } else {
      setTrailError(t.reason instanceof Error ? t.reason.message : String(t.reason));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    // the guardian vault writes the trail and chat writes messages; both show here without a refresh.
    const offTrail = onTableChange("audit_log", () => { void load(); });
    const offMessages = onTableChange("messages", () => { void load(); });
    return () => {
      offTrail();
      offMessages();
    };
  }, [load]);

  const shares = useMemo(() => modeShares(usage.byMode, usage.prompts), [usage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trail;
    return trail.filter((e) => trailLabel(e).includes(q) || e.resource_type.toLowerCase().includes(q) || detailLine(e.details).toLowerCase().includes(q));
  }, [trail, search]);

  const tiles = [
    { label: "prompts sent", value: String(usage.prompts), icon: MessageSquare, note: usage.replies ? `${usage.replies} replies` : "" },
    { label: "conversations", value: String(usage.conversations), icon: MessagesSquare, note: "" },
    { label: "days active", value: String(usage.activeDays), icon: CalendarDays, note: usage.firstAt ? `since ${format(new Date(usage.firstAt), "d MMM yyyy")}` : "" },
    { label: "current streak", value: `${usage.streakDays} ${usage.streakDays === 1 ? "day" : "days"}`, icon: Flame, note: "consecutive days with a prompt" },
  ];

  const refresh = (
    <button
      type="button"
      onClick={() => void load()}
      className={v2 ? v2ActionClass : "inline-flex items-center gap-2 rounded-xl border border-border/20 px-3 py-1.5 text-xs font-light text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}
      aria-label="refresh"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
      refresh
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {v2 ? (
          <V2Action>{refresh}</V2Action>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-extralight tracking-wide text-foreground">asherin.activity</h1>
              <p className="mt-1 text-sm font-extralight text-muted-foreground">
                what you did here, read from this device. nothing is compared to anyone else.
              </p>
            </div>
            {refresh}
          </div>
        )}

        {loading && (
          <div className="space-y-3" aria-busy="true" aria-label="reading this device">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl border border-border/15 bg-card/5 animate-pulse" />)}
            </div>
            <div className="h-32 rounded-xl border border-border/15 bg-card/5 animate-pulse" />
          </div>
        )}

        {!loading && usageError && (
          <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-1">
            <p className="text-xs font-light text-foreground">the chat store did not read.</p>
            <p className="text-[10px] text-muted-foreground/50">{usageError}</p>
          </div>
        )}

        {!loading && !usageError && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {tiles.map((c) => (
                <div key={c.label} className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <c.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-[10px] font-light tracking-wider text-muted-foreground">{c.label}</span>
                  </div>
                  <p className="text-2xl font-extralight text-foreground tabular-nums">{c.value}</p>
                  {c.note && <p className="mt-1 text-[10px] text-muted-foreground/60">{c.note}</p>}
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-[10px] font-light tracking-wider text-muted-foreground">how you used it</span>
              </div>
              {usage.prompts === 0 ? (
                <p className="text-xs font-extralight text-muted-foreground">no prompts yet. the first one you send in chat counts here.</p>
              ) : (
                <ul className="space-y-2">
                  {shares.map((m) => (
                    <li key={m.mode} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-light text-muted-foreground">{m.mode}</span>
                      <div className="h-1.5 flex-1 rounded-full bg-border/30" role="img" aria-label={`${m.mode}: ${m.n} prompts, ${m.pct} percent`}>
                        <div className="h-full rounded-full bg-foreground/30" style={{ width: `${m.pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-[10px] text-muted-foreground/60 tabular-nums">{m.pct}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {!loading && (
          <div className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[10px] font-light tracking-wider text-muted-foreground">recorded actions</span>
                <p className="text-[10px] text-muted-foreground/50">
                  what this device did to itself, newest first. the same rows the guardian vault's trail shows.
                  {trail.length >= TRAIL_LIMIT ? ` most recent ${TRAIL_LIMIT}.` : ""}
                </p>
              </div>
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-border/20 bg-background/30 px-3 py-1.5 sm:max-w-xs sm:flex-1">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="filter the trail"
                  aria-label="filter the trail"
                  className="min-w-0 flex-1 bg-transparent text-xs font-light text-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </label>
            </div>

            {trailError && (
              <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-2">
                <p className="text-xs font-light text-foreground">the trail did not load.</p>
                <p className="text-[10px] text-muted-foreground/50">{trailError}</p>
                <button type="button" onClick={() => void load()} className="text-[10px] px-2.5 py-1 rounded-lg border border-border/30 hover:border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  try again
                </button>
              </div>
            )}

            {!trailError && filtered.length === 0 && (
              <p className="py-6 text-center text-xs font-extralight text-muted-foreground">
                {trail.length === 0
                  ? "nothing recorded yet. the guardian vault writes a line here when it locks, unlocks, stores an item or runs a check."
                  : "no recorded action matches that filter."}
              </p>
            )}

            {!trailError && filtered.length > 0 && (
              <ul className="space-y-2">
                {filtered.map((entry) => {
                  const Icon = TRAIL_ICON[entry.resource_type] ?? Activity;
                  const detail = detailLine(entry.details);
                  return (
                    <li key={entry.id} className="flex items-start gap-3 rounded-xl border border-border/10 bg-background/20 px-4 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-light text-foreground">{trailLabel(entry)}</p>
                          <p className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">{when(entry.created_at)}</p>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {entry.resource_type.replace(/_/g, " ")}
                          {detail ? ` · ${detail}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityView;
