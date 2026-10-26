// connect — what actually ran on this device, and what it is bound to.
//
// not a plugin store and not an always-green mesh. the map is derived from
// two real things only: the rooms the rail lists (src/lib/navIntents.ts) and
// the pull rows in asherin_connect_pulls that rooms write when they really
// reach for something (src/lib/connect/emitPull.ts). a node is lit because a
// row says something ran in the last five minutes; an edge exists because a
// row says one surface reached into another organ. bindings (google, provider
// keys) hand off to the room that owns them — oauth is never rebuilt here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { emitPull } from "@/lib/connect/emitPull";
import {
  buildGraph,
  labelFor,
  relTime,
  roomFor,
  STATE_LABEL,
  type GraphNode,
  type NodeState,
  type PullLike,
} from "@/lib/connect/graph";
import AIKeysSettings from "@/components/dashboard/AIKeysSettings";
import { Loader2, RefreshCw, Globe, KeyRound, ChevronRight } from "lucide-react";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";

const STATE_STROKE: Record<NodeState, string> = {
  ok: "hsl(150 60% 45%)",
  stale: "hsl(38 90% 55%)",
  fail: "hsl(0 72% 55%)",
  never: "hsl(0 0% 40%)",
};

const rowState = (s: PullLike["status"]): NodeState =>
  s === "ok" ? "ok" : s === "fail" ? "fail" : s === "stale" ? "stale" : "never";

const ConnectView = () => {
  const v2 = useIsV2();
  // v.2 opens on the bindings and the log — "did it run" — and keeps the map
  // behind one press. the current shell shows the map straight away.
  const [showMap, setShowMap] = useState(false);
  const { user } = useAuth();
  const [pulls, setPulls] = useState<PullLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // a trace row in the chat transcript deep-links here with ?organ=<id>; the
  // id is a writer's organ id, so it is normalised to the room that owns it.
  const [searchParams] = useSearchParams();
  const organParam = searchParams.get("organ");
  const [selected, setSelected] = useState<string | null>(organParam ? roomFor(organParam) : null);
  const [google, setGoogle] = useState<{ count: number; valid: number }>({ count: 0, valid: 0 });
  const [byok, setByok] = useState<string[]>([]);

  useEffect(() => {
    if (organParam) setSelected(roomFor(organParam));
  }, [organParam]);

  const alive = useRef(true);
  const mountEmitted = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadPulls = useCallback(async () => {
    if (!user) return;
    const { data, error: err } = await supabase
      .from("asherin_connect_pulls")
      .select("id, ts, organ, capability, from_surface, status, latency_ms, quote_masked")
      .eq("user_id", user.id)
      .order("ts", { ascending: false })
      .limit(300);
    if (!alive.current) return;
    if (err) setError(err.message.toLowerCase());
    else {
      setError(null);
      // ts is the only ordering key the shim knows; rows that never got one
      // (created_at only) still sort after a stable fallback.
      const rows = ((data as (PullLike & { created_at?: string })[] | null) ?? []).map((r) => ({
        ...r,
        ts: r.ts ?? r.created_at ?? new Date(0).toISOString(),
      }));
      setPulls(rows);
    }
    setLoading(false);
  }, [user]);

  const loadBindings = useCallback(async () => {
    if (!user) return;
    const [g, keys] = await Promise.all([
      supabase.from("google_accounts").select("id, token_expires_at, status").eq("user_id", user.id),
      supabase.from("user_api_keys").select("provider").eq("user_id", user.id).eq("is_active", true),
    ]);
    if (!alive.current) return;
    const gRows = ((g.data as { token_expires_at?: string; status?: string }[] | null) ?? []).filter(
      (r) => !/revoked|disconnected|error/i.test(r.status ?? ""),
    );
    const now = Date.now();
    setGoogle({
      count: gRows.length,
      valid: gRows.filter((r) => Date.parse(r.token_expires_at ?? "") > now).length,
    });
    setByok(((keys.data as { provider: string }[] | null) ?? []).map((k) => k.provider));
  }, [user]);

  useEffect(() => {
    void loadPulls();
    void loadBindings();
  }, [loadPulls, loadBindings]);

  // honest empty state: never seed fake pulls. one skip row records that the
  // room itself was opened, so the log never claims activity that did not happen.
  useEffect(() => {
    if (loading || !user || pulls.length || mountEmitted.current) return;
    mountEmitted.current = true;
    void emitPull({
      organ: "connect",
      capability: "mount",
      fromSurface: "connect",
      status: "skip",
      quote: "connect opened — nothing has run yet",
    }).then(loadPulls);
  }, [loading, user, pulls.length, loadPulls]);

  // live: the local shim fires on every write to the table. re-reading the
  // (cached) table after a short debounce keeps ordering right and never
  // shows a row twice.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`connect-pulls-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "asherin_connect_pulls" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void loadPulls(), 300);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [user, loadPulls]);

  const graph = useMemo(() => buildGraph(pulls), [pulls]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const filtered = useMemo(() => {
    if (!selected) return pulls.slice(0, 60);
    return pulls.filter((p) => roomFor(p.organ) === selected || roomFor(p.from_surface) === selected).slice(0, 40);
  }, [selected, pulls]);

  const selectedLabel = selected ? labelFor(selected) : null;
  const counts = graph.counts;
  const refresh = () => {
    setLoading(true);
    void loadPulls();
    void loadBindings();
  };

  const toggle = (id: string) => setSelected((cur) => (cur === id ? null : id));

  const refreshButton = (
    <button
      type="button"
      onClick={refresh}
      className={
        v2
          ? v2ActionClass
          : "flex items-center gap-2 rounded-full border border-border/40 bg-card/30 px-4 py-2 text-xs font-light text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      }
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> refresh
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {v2 ? (
          <V2Action>{refreshButton}</V2Action>
        ) : (
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extralight tracking-tight text-foreground">connect</h2>
              <p className="mt-1 text-sm font-light text-muted-foreground">
                what actually ran on this device, and what it is bound to. a room lights up only when a pull is on record — nothing is simulated.
              </p>
            </div>
            {refreshButton}
          </header>
        )}

        {/* bindings — edges into the graph, each owned by another room */}
        <section className="grid gap-3 sm:grid-cols-2" aria-label="bindings">
          <BindingCard
            icon={<Globe className="h-4 w-4" />}
            title="google"
            state={
              google.count === 0
                ? "no account on this device — the authorization exchange needs a server"
                : google.valid === 0
                  ? `${google.count} account${google.count === 1 ? "" : "s"} · token expired`
                  : `${google.valid}/${google.count} token${google.count === 1 ? "" : "s"} valid`
            }
            ok={google.valid > 0}
            href="/dashboard/google"
          />
          <BindingCard
            icon={<KeyRound className="h-4 w-4" />}
            title="provider keys"
            state={byok.length ? `${byok.join(", ")} · held in the device vault` : "none saved — add one below"}
            ok={byok.length > 0}
            href="#asherin-connect-keys"
          />
        </section>

        {v2 && (
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="text-[11px] font-light text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={showMap}
          >
            {showMap ? "hide map" : "show map"} · {counts.ok} live, {counts.fail} failed, {counts.never} never ran
          </button>
        )}

        {(!v2 || showMap) && (
          <section className="rounded-3xl border border-border/30 bg-card/20 p-4 backdrop-blur-sm sm:p-6" aria-label="pull map">
            <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] font-light text-muted-foreground">
              <Legend color={STATE_STROKE.ok} label={`live ${counts.ok}`} />
              <Legend color={STATE_STROKE.stale} label={`stale ${counts.stale}`} />
              <Legend color={STATE_STROKE.fail} label={`failed ${counts.fail}`} />
              <Legend color={STATE_STROKE.never} label={`never ran ${counts.never}`} />
              {selectedLabel && (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="ml-auto rounded-full border border-border/40 px-3 py-1 transition-colors hover:text-foreground"
                >
                  clear filter · {selectedLabel}
                </button>
              )}
            </div>

            {/* desktop: the derived constellation */}
            <svg
              viewBox="0 0 100 100"
              className="hidden h-[480px] w-full sm:block"
              role="img"
              aria-label={`pull map: ${counts.ok} rooms live, ${counts.fail} failed, ${counts.never} never ran`}
            >
              <g strokeWidth={0.12}>
                {graph.edges.map((e) => {
                  const na = nodeById.get(e.from);
                  const nb = nodeById.get(e.to);
                  if (!na || !nb) return null;
                  const active = !selected || selected === e.from || selected === e.to;
                  return (
                    <line
                      key={`${e.from}-${e.to}`}
                      x1={na.x}
                      y1={na.y}
                      x2={nb.x}
                      y2={nb.y}
                      stroke={e.lit ? STATE_STROKE.ok : e.lastStatus === "fail" ? STATE_STROKE.fail : "hsl(var(--border))"}
                      opacity={active ? (e.lit ? 0.7 : 0.45) : 0.08}
                    />
                  );
                })}
              </g>
              {graph.nodes.map((o) => {
                const isSel = selected === o.id;
                const dim = selected && !isSel && !graph.edges.some((e) => (e.from === selected && e.to === o.id) || (e.to === selected && e.from === o.id));
                return (
                  <g
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={`${o.label} — ${STATE_LABEL[o.state]}${o.rows.length ? `, ${o.rows.length} rows` : ""}`}
                    onClick={() => toggle(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(o.id);
                      }
                    }}
                    style={{ cursor: "pointer", outline: "none" }}
                    opacity={dim ? 0.3 : 1}
                  >
                    <title>{`${o.label} — ${STATE_LABEL[o.state]}${o.rows.length ? ` (${o.rows.length} rows)` : ""}`}</title>
                    <circle cx={o.x} cy={o.y} r={isSel ? 2.4 : 1.7} fill="hsl(var(--card))" stroke={STATE_STROKE[o.state]} strokeWidth={0.45} />
                    {o.state === "ok" && <circle cx={o.x} cy={o.y} r={3.2} fill="none" stroke={STATE_STROKE.ok} strokeWidth={0.18} opacity={0.35} />}
                    {isSel && <circle cx={o.x} cy={o.y} r={3.6} fill="none" stroke="hsl(var(--foreground))" strokeWidth={0.15} opacity={0.6} />}
                    <text x={o.x} y={o.y + 4.4} textAnchor="middle" fontSize={1.9} fill="hsl(var(--muted-foreground))" fontWeight={300}>
                      {o.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* phone: the same nodes as a list — the map's meaning without the map's width */}
            <ul className="grid grid-cols-2 gap-1.5 sm:hidden" aria-label="rooms">
              {graph.nodes.map((o) => (
                <li key={o.id}>
                  <NodeChip node={o} selected={selected === o.id} onClick={() => toggle(o.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* live log */}
        <section className="overflow-hidden rounded-3xl border border-border/30 bg-card/20 backdrop-blur-sm" aria-label="pull log">
          <div className="flex items-center justify-between border-b border-border/20 px-5 py-3">
            <span className="text-xs font-light tracking-wide text-foreground/80">
              {selectedLabel ? `${selectedLabel} — last ${filtered.length} rows` : "live pulls"}
            </span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="loading" />}
          </div>

          {error ? (
            <div role="alert" className="px-6 py-8 text-center text-sm font-light text-muted-foreground">
              <p>the pull log could not be read — {error}</p>
              <button type="button" onClick={refresh} className="mt-3 rounded-lg border border-border/30 px-3 py-1.5 text-[11px] text-foreground hover:bg-foreground/5">
                try again
              </button>
            </div>
          ) : !loading && filtered.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-light text-muted-foreground">
                {selectedLabel
                  ? `nothing on record for ${selectedLabel}.`
                  : "no pulls yet. a row appears here when a room really reaches for something — the library extracting a file, the agents forge running an agent, the guardian vault checking a breach, chat geocoding an address."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/15">
              {filtered.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 px-4 py-2.5 text-[11px] font-light sm:grid-cols-[4.5rem_auto_1fr_auto] sm:items-center sm:px-5"
                >
                  <span className="tabular-nums text-muted-foreground/70">{relTime(row.ts)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATE_STROKE[rowState(row.status)] }} aria-label={row.status} />
                    <span className="truncate text-foreground/80">{labelFor(roomFor(row.organ))}</span>
                    <span className="truncate text-muted-foreground/60">/ {row.capability}</span>
                  </span>
                  <span className="col-span-2 truncate text-muted-foreground/80 sm:col-span-1">{row.quote_masked ?? "—"}</span>
                  <span className="col-span-2 tabular-nums text-muted-foreground/50 sm:col-span-1">
                    from {labelFor(roomFor(row.from_surface))}
                    {row.latency_ms != null ? ` · ${row.latency_ms}ms` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* provider keys: the same control as settings → intelligence; connect wraps it, it does not fork it */}
        <section id="asherin-connect-keys" className="space-y-3" aria-label="provider keys">
          <div>
            <h3 className="text-lg font-light tracking-tight text-foreground">provider keys</h3>
            <p className="mt-1 text-sm font-light text-muted-foreground">
              held in this device's key vault, encrypted at rest, sent only to the provider you picked. a key is never shown again after it is saved.
            </p>
          </div>
          <AIKeysSettings />
        </section>
      </div>
    </div>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

const NodeChip = ({ node, selected, onClick }: { node: GraphNode; selected: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-light transition-colors ${
      selected ? "border-foreground/40 bg-foreground/[0.06] text-foreground" : "border-border/20 text-muted-foreground hover:text-foreground"
    }`}
  >
    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATE_STROKE[node.state] }} aria-hidden />
    <span className="min-w-0 flex-1 truncate">{node.label}</span>
    <span className="sr-only">{STATE_LABEL[node.state]}</span>
  </button>
);

const BindingCard = ({ icon, title, state, ok, href }: { icon: React.ReactNode; title: string; state: string; ok: boolean; href: string }) => (
  <a
    href={href}
    className="group flex items-center gap-3 rounded-2xl border border-border/30 bg-card/20 px-4 py-3 backdrop-blur-sm transition-colors hover:border-border/60"
  >
    <span className={ok ? "text-[hsl(150_60%_45%)]" : "text-muted-foreground/60"}>{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-light text-foreground/85">{title}</span>
      <span className="block text-[11px] font-light leading-snug text-muted-foreground">{state}</span>
    </span>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
  </a>
);

export default ConnectView;
