// asherin.activity — one honest panel for "what have I done here".
//
// Two half-rooms used to exist: a stats page counting prompts and an audit page
// listing recorded actions. Neither was a room on its own, so they are one
// panel now. It only shows what was actually recorded — nothing is estimated
// beyond the clearly-labelled time figure.

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Clock, Zap, MessageSquare, Loader2, Shield, Eye, Edit3, Trash2, UserPlus, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsV2 } from "@/lib/dashboardUiContext";

interface AuditEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const actionIcons: Record<string, React.ElementType> = {
  team_created: UserPlus,
  invite_sent: UserPlus,
  invite_accepted: UserPlus,
  member_removed: Trash2,
  notebook_created: FileText,
  data_viewed: Eye,
  data_modified: Edit3,
};

const ActivityView = () => {
  const v2 = useIsV2();
  const { user } = useAuth();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    // maybeSingle(): a brand-new account has no usage row yet, and single()
    // answers zero rows with a 406 the UI would render as a broken page.
    const [usage, audit] = await Promise.all([
      supabase.from("usage_stats").select("*").eq("user_id", user.id).maybeSingle(),
      (supabase.from as any)("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setStats((usage.data as unknown as Record<string, number> | null) ?? null);
    setEntries(((audit as { data: AuditEntry[] | null }).data ?? []) as AuditEntry[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = stats ?? {};
  const total = s.total_prompts ?? 0;
  const streak = s.streak_days ?? 0;
  const timeSaved = Math.round(total * 1.5);
  const modes = [
    { name: "Research", n: s.research_prompts ?? 0 },
    { name: "Code", n: s.code_prompts ?? 0 },
    { name: "Truth", n: s.truth_prompts ?? 0 },
    { name: "Chat", n: s.chat_prompts ?? 0 },
  ];

  const cards = [
    { label: "Prompts recorded", value: String(total), icon: MessageSquare, note: "" },
    { label: "Current streak", value: `${streak} days`, icon: Zap, note: "" },
    { label: "Rough time saved", value: `${timeSaved}m`, icon: Clock, note: "estimated at 1.5 min per prompt" },
    { label: "Actions logged", value: String(entries.length), icon: Shield, note: entries.length >= 200 ? "most recent 200" : "" },
  ];

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.action.toLowerCase().includes(q) || e.resource_type.toLowerCase().includes(q);
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {!v2 && (
          <div>
            <h2 className="text-xl font-extralight tracking-wide text-foreground">Your activity</h2>
            <p className="mt-1 text-sm font-extralight text-muted-foreground">
              Your own usage and your own recorded actions. Nothing is compared to anyone else.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2">
                <c.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] font-light uppercase tracking-wider text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-2xl font-extralight text-foreground">{c.value}</p>
              {c.note && <p className="mt-1 text-[10px] text-muted-foreground/60">{c.note}</p>}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-light uppercase tracking-wider text-muted-foreground">How you used it</span>
          </div>
          {total === 0 ? (
            <p className="text-xs font-extralight text-muted-foreground">No prompts recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {modes.map((m) => {
                const pct = Math.round((m.n / total) * 100);
                return (
                  <div key={m.name} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-light text-muted-foreground">{m.name}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-border/30">
                      <div className="h-full rounded-full bg-foreground/30" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-[10px] text-muted-foreground/60">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-light uppercase tracking-wider text-muted-foreground">Recorded actions</span>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/20 bg-background/30 px-3 py-1.5 sm:max-w-xs">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter actions…"
                className="min-w-0 flex-1 bg-transparent text-xs font-light text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs font-extralight text-muted-foreground">
              {entries.length === 0 ? "Nothing logged yet. Actions on your account will appear here." : "No action matches that filter."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => {
                const Icon = actionIcons[entry.action] ?? Shield;
                const time = new Date(entry.created_at);
                return (
                  <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-border/10 bg-background/20 px-4 py-3">
                    <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-light capitalize text-foreground">{entry.action.replace(/_/g, " ")}</p>
                        <p className="shrink-0 text-[10px] text-muted-foreground/50">
                          {time.toLocaleDateString()} {time.toLocaleTimeString()}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {entry.resource_type}
                        {entry.resource_id ? ` • ${entry.resource_id.slice(0, 8)}…` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityView;
