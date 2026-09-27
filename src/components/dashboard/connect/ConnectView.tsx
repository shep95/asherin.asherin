// Asherin Connect — live capability pull-graph.
//
// This is not a plugin store and not an always-green mesh. Every node colour
// is derived from rows in asherin_connect_pulls: green only when something
// really ran in the last five minutes, amber when the last pull has gone
// stale, red on the last failure, grey when the organ has never been pulled.
// Bindings (Google, GitHub, BYOK) are edges into the graph — clicking one
// hands off to the flow that already owns it, we never rebuild OAuth here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { emitPull } from "@/lib/connect/emitPull";
import AIKeysSettings from "@/components/dashboard/AIKeysSettings";
import { Loader2, RefreshCw, Github, Globe, KeyRound, ChevronRight } from "lucide-react";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";

interface PullRow {
  id: string;
  ts: string;
  organ: string;
  capability: string;
  from_surface: string;
  status: "ok" | "fail" | "skip" | "stale";
  latency_ms: number | null;
  quote_masked: string | null;
}

interface OrganDef {
  id: string;
  label: string;
  x: number; // 0..100 viewport-relative
  y: number;
}

// Layout is a deliberate constellation: chat at the core, sensing organs
// upper, synthesis organs lower. No left rail, no directorate tree.
const ORGANS: OrganDef[] = [
  { id: "chat", label: "Chat", x: 50, y: 50 },
  { id: "eye", label: "Eye", x: 27, y: 30 },
  { id: "zophiel", label: "Zophiel", x: 50, y: 20 },
  { id: "google", label: "Google", x: 73, y: 30 },
  { id: "ide", label: "IDE", x: 85, y: 50 },
  { id: "vault", label: "Vault", x: 15, y: 50 },
  { id: "zerlal", label: "Zerlal", x: 14, y: 68 },
  { id: "azplen", label: "Azplen", x: 27, y: 78 },
  { id: "zahten", label: "Zahten", x: 58, y: 84 },
  { id: "briefings", label: "Briefings", x: 73, y: 78 },
  { id: "notebooks", label: "Notebooks", x: 86, y: 68 },
  { id: "knowledge-vault", label: "Knowledge Vault", x: 8, y: 38 },
  { id: "library", label: "Library", x: 8, y: 60 },
  { id: "memory", label: "Memory", x: 38, y: 62 },
  { id: "whiteboard", label: "Whiteboard", x: 62, y: 62 },
  { id: "ghost", label: "Ghost", x: 38, y: 38 },
  { id: "file-scrapper", label: "File Scrapper", x: 62, y: 38 },
  { id: "zali", label: "ZALI", x: 80, y: 15 },
  { id: "gematria", label: "Gematria", x: 92, y: 24 },
  { id: "vedic", label: "Vedic", x: 92, y: 40 },
  { id: "document-studio", label: "Document Studio", x: 92, y: 58 },
  { id: "pattern", label: "Pattern", x: 78, y: 90 },
  { id: "teams", label: "Teams", x: 46, y: 96 },
  { id: "snippets", label: "Snippets", x: 30, y: 92 },
  { id: "rad", label: "RAD", x: 16, y: 86 },
  { id: "shield", label: "Shield", x: 8, y: 76 },
  // Binding, not organ: GitHub is an external remote the IDE is bound to.
  // It is lit by the stored connection, never by an invented pull.
  { id: "github", label: "GitHub", x: 97, y: 50 },
];

const ORGAN_BY_ID = new Map(ORGANS.map(o => [o.id, o]));

// Static topology: who can pull from whom. Live status decides whether an
// edge is lit; the shape itself is the product's honest wiring diagram.
const EDGES: Array<[string, string]> = [
  ["chat", "eye"], ["chat", "zophiel"], ["chat", "google"], ["chat", "vault"],
  ["chat", "memory"], ["chat", "knowledge-vault"], ["chat", "library"],
  ["chat", "ide"], ["chat", "briefings"], ["chat", "notebooks"],
  ["chat", "azplen"], ["chat", "zerlal"], ["chat", "zahten"],
  ["chat", "file-scrapper"], ["chat", "whiteboard"], ["chat", "ghost"],
  ["chat", "pattern"], ["chat", "rad"],
  ["eye", "google"],
  ["zophiel", "ghost"], ["zophiel", "zali"],
  ["google", "briefings"], ["google", "notebooks"],
  ["ide", "snippets"], ["ide", "teams"], ["ide", "github"],
  ["gematria", "vedic"], ["chat", "gematria"], ["chat", "vedic"],
  ["document-studio", "notebooks"], ["chat", "document-studio"],
  ["shield", "vault"], ["chat", "shield"],
  ["chat", "zali"],
  ["chat", "snippets"], ["chat", "teams"],
];

const MAP_CAPABILITIES = ["take", "property", "nearby", "roofs", "ship", "cameras"];

type NodeState = "ok" | "stale" | "fail" | "never";

const STATE_STROKE: Record<NodeState, string> = {
  ok: "hsl(150 60% 45%)",
  stale: "hsl(38 90% 55%)",
  fail: "hsl(0 72% 55%)",
  never: "hsl(0 0% 40%)",
};

const STATE_LABEL: Record<NodeState, string> = {
  ok: "pulled just now",
  stale: "stale",
  fail: "last pull failed",
  never: "never pulled",
};

function organState(rows: PullRow[]): NodeState {
  if (!rows.length) return "never";
  const last = rows[0];
  if (last.status === "fail") return "fail";
  const age = Date.now() - new Date(last.ts).getTime();
  if (age < 5 * 60 * 1000) return "ok";
  if (age > 60 * 60 * 1000) return "stale";
  return "ok";
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ConnectView = () => {
  const v2 = useIsV2();
  // v.2 hides the 31-node constellation on first paint: bindings and the
  // live log answer "did it run", the map is an optional zoom-out.
  const [showMap, setShowMap] = useState(false);
  const { user } = useAuth();
  const [pulls, setPulls] = useState<PullRow[]>([]);
  const [loading, setLoading] = useState(true);
  // A trace row in the chat transcript deep-links here with ?organ=<id>; the
  // graph opens already filtered to the organ the operator clicked.
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(searchParams.get("organ"));
  const [google, setGoogle] = useState<{
    connected: boolean; count: number; valid: number; lastHarvest: string | null;
  }>({ connected: false, count: 0, valid: 0, lastHarvest: null });
  const [github, setGithub] = useState<{ connected: boolean; login: string | null }>({ connected: false, login: null });
  const [byok, setByok] = useState<string[]>([]);

  // Follow later deep-links too — a second click from chat must re-scope the
  // graph rather than leave the first organ selected.
  const organParam = searchParams.get("organ");
  useEffect(() => {
    if (organParam) setSelected(organParam);
  }, [organParam]);
  const mountEmitted = useRef(false);

  const loadPulls = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("asherin_connect_pulls")
      .select("id, ts, organ, capability, from_surface, status, latency_ms, quote_masked")
      .eq("user_id", user.id)
      .order("ts", { ascending: false })
      .limit(300);
    setPulls((data as PullRow[] | null) ?? []);
    setLoading(false);
  }, [user]);

  const loadBindings = useCallback(async () => {
    if (!user) return;
    const [g, gh, keys, harvest] = await Promise.all([
      // The OAuth edge is green only when a token is actually still valid;
      // a connected row with an expired token is a stale edge, not a link.
      supabase.from("google_accounts").select("id, token_expires_at, status").eq("user_id", user.id),
      supabase.from("github_connections").select("github_username").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_api_keys").select("provider").eq("user_id", user.id).eq("is_active", true),
      supabase.from("asherin_connect_pulls").select("ts")
        .eq("user_id", user.id).eq("organ", "google").eq("capability", "harvest")
        .eq("status", "ok").order("ts", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const gRows = ((g.data as { token_expires_at: string; status: string }[] | null) ?? [])
      .filter(r => !/revoked|disconnected|error/i.test(r.status ?? ""));
    const now = Date.now();
    setGoogle({
      connected: gRows.length > 0,
      count: gRows.length,
      valid: gRows.filter(r => Date.parse(r.token_expires_at) > now).length,
      lastHarvest: (harvest.data as { ts?: string } | null)?.ts ?? null,
    });
    setGithub({
      connected: !!gh.data,
      login: (gh.data as { github_username?: string } | null)?.github_username ?? null,
    });
    setByok(((keys.data as { provider: string }[] | null) ?? []).map(k => k.provider));
  }, [user]);

  useEffect(() => { void loadPulls(); void loadBindings(); }, [loadPulls, loadBindings]);

  // Honest empty state: never seed fake pulls. One skip row records that the
  // graph itself was opened, so the log is never a lie about activity.
  useEffect(() => {
    if (loading || !user || pulls.length || mountEmitted.current) return;
    mountEmitted.current = true;
    void emitPull({
      organ: "connect", capability: "mount", fromSurface: "connect",
      status: "skip", quote: "connect opened — no pulls recorded yet",
    }).then(loadPulls);
  }, [loading, user, pulls.length, loadPulls]);

  // Realtime: new traces stream in without a refetch storm.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`connect-pulls-${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "asherin_connect_pulls", filter: `user_id=eq.${user.id}` },
        payload => setPulls(prev => [payload.new as PullRow, ...prev].slice(0, 300)))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const byOrgan = useMemo(() => {
    const m = new Map<string, PullRow[]>();
    for (const p of pulls) {
      const arr = m.get(p.organ);
      if (arr) arr.push(p); else m.set(p.organ, [p]);
    }
    return m;
  }, [pulls]);

  const states = useMemo(() => {
    const m = new Map<string, NodeState>();
    for (const o of ORGANS) m.set(o.id, organState(byOrgan.get(o.id) ?? []));
    // GitHub is a binding: green only while a real connection row exists.
    m.set("github", github.connected ? "ok" : "never");
    return m;
  }, [byOrgan, github.connected]);

  const filtered = useMemo(() => {
    if (!selected) return pulls.slice(0, 60);
    const rows = byOrgan.get(selected) ?? [];
    if (selected === "eye") {
      const scoped = rows.filter(r => MAP_CAPABILITIES.includes(r.capability));
      if (scoped.length) return scoped.slice(0, 20);
    }
    return rows.slice(0, 20);
  }, [selected, pulls, byOrgan]);

  const counts = useMemo(() => {
    let ok = 0, fail = 0, never = 0, stale = 0;
    states.forEach(s => { if (s === "ok") ok++; else if (s === "fail") fail++; else if (s === "stale") stale++; else never++; });
    return { ok, fail, stale, never };
  }, [states]);

  const selectedLabel = selected ? ORGAN_BY_ID.get(selected)?.label ?? selected : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {v2 ? (
          <V2Action>
            <button
              onClick={() => { setLoading(true); void loadPulls(); void loadBindings(); }}
              className={v2ActionClass}
            >
              <RefreshCw className="h-3.5 w-3.5" /> refresh
            </button>
          </V2Action>
        ) : (
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extralight tracking-tight text-foreground">Connect</h2>
              <p className="mt-1 text-sm text-muted-foreground font-light">
                Live pull-graph. Nodes light up only when a capability actually ran — no simulated health.
              </p>
            </div>
            <button
              onClick={() => { setLoading(true); void loadPulls(); void loadBindings(); }}
              className="flex items-center gap-2 rounded-full border border-border/40 bg-card/30 px-4 py-2 text-xs font-light text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </header>
        )}

        {/* Bindings — edges into the graph, not a plugin store */}
        <section className="grid gap-3 sm:grid-cols-3">
          <BindingCard
            icon={<Globe className="h-4 w-4" />}
            title="Google"
            state={
              !google.connected
                ? "not connected"
                : google.valid === 0
                  ? `${google.count} account${google.count === 1 ? "" : "s"} · token expired, reconnect`
                  : `${google.valid}/${google.count} token${google.count === 1 ? "" : "s"} valid · ${
                      google.lastHarvest
                        ? `harvested ${new Date(google.lastHarvest).toLocaleDateString()}`
                        : "no harvest yet"
                    }`
            }
            ok={google.connected && google.valid > 0}
            href="/dashboard/google"
          />
          <BindingCard
            icon={<Github className="h-4 w-4" />}
            title="GitHub"
            state={github.connected ? (github.login ? `@${github.login}` : "connected") : "not connected"}
            ok={github.connected}
            href="/dashboard/ide"
          />
          <BindingCard
            icon={<KeyRound className="h-4 w-4" />}
            title="BYOK providers"
            state={byok.length ? byok.join(", ") : "none — platform routing"}
            ok={byok.length > 0}
            href="#asherin-connect-keys"
          />
        </section>

        {v2 && (
          <button
            onClick={() => setShowMap((v) => !v)}
            className="text-[11px] font-light text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={showMap}
          >
            {showMap ? "hide map" : "show map"} · {counts.ok} live, {counts.fail} failed
          </button>
        )}

        {/* DAG */}
        {(!v2 || showMap) && (
        <section className="rounded-3xl border border-border/30 bg-card/20 backdrop-blur-sm p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-4 mb-4 text-[11px] font-light text-muted-foreground">
            <Legend color={STATE_STROKE.ok} label={`live ${counts.ok}`} />
            <Legend color={STATE_STROKE.stale} label={`stale ${counts.stale}`} />
            <Legend color={STATE_STROKE.fail} label={`failed ${counts.fail}`} />
            <Legend color={STATE_STROKE.never} label={`never pulled ${counts.never}`} />
            {selectedLabel && (
              <button onClick={() => setSelected(null)} className="ml-auto rounded-full border border-border/40 px-3 py-1 hover:text-foreground transition-colors">
                clear filter · {selectedLabel}
              </button>
            )}
          </div>

          <div className="relative w-full overflow-x-auto">
            <svg viewBox="0 0 100 100" className="w-full min-w-[640px] h-[440px]" role="img" aria-label="Asherin capability graph">
              <g stroke="hsl(var(--border))" strokeWidth={0.12} opacity={0.5}>
                {EDGES.map(([a, b]) => {
                  const na = ORGAN_BY_ID.get(a), nb = ORGAN_BY_ID.get(b);
                  if (!na || !nb) return null;
                  const lit = states.get(a) === "ok" || states.get(b) === "ok";
                  const active = !selected || selected === a || selected === b;
                  return (
                    <line
                      key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                      stroke={lit ? STATE_STROKE.ok : "hsl(var(--border))"}
                      opacity={active ? (lit ? 0.55 : 0.3) : 0.08}
                    />
                  );
                })}
              </g>
              {ORGANS.map(o => {
                const state = states.get(o.id) ?? "never";
                const isSel = selected === o.id;
                const dim = selected && !isSel;
                const rows = byOrgan.get(o.id) ?? [];
                return (
                  <g
                    key={o.id}
                    onClick={() => setSelected(isSel ? null : o.id)}
                    style={{ cursor: "pointer" }}
                    opacity={dim ? 0.35 : 1}
                  >
                    <title>{`${o.label} — ${STATE_LABEL[state]}${rows.length ? ` (${rows.length} pulls)` : ""}`}</title>
                    <circle cx={o.x} cy={o.y} r={isSel ? 2.4 : 1.8} fill="hsl(var(--card))" stroke={STATE_STROKE[state]} strokeWidth={0.45} />
                    {state === "ok" && <circle cx={o.x} cy={o.y} r={3.2} fill="none" stroke={STATE_STROKE.ok} strokeWidth={0.18} opacity={0.35} />}
                    <text x={o.x} y={o.y + 4.6} textAnchor="middle" fontSize={1.9} fill="hsl(var(--muted-foreground))" fontWeight={300}>
                      {o.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
        )}

        {/* Live log */}
        <section className="rounded-3xl border border-border/30 bg-card/20 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/20">
            <span className="text-xs font-light tracking-wide text-foreground/80">
              {selectedLabel ? `${selectedLabel} — last ${filtered.length} pulls` : "Live pulls"}
            </span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          {!loading && filtered.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-light text-muted-foreground">
                no pulls yet — chat, map, or search will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/15">
              {filtered.map(row => (
                <div key={row.id} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-5 py-2.5 text-[11px] font-light">
                  <span className="text-muted-foreground/70 tabular-nums w-16">{relTime(row.ts)}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_STROKE[row.status === "ok" ? "ok" : row.status === "fail" ? "fail" : row.status === "stale" ? "stale" : "never"] }} />
                    <span className="text-foreground/80">{ORGAN_BY_ID.get(row.organ)?.label ?? row.organ}</span>
                    <span className="text-muted-foreground/60">/ {row.capability}</span>
                  </span>
                  <span className="truncate text-muted-foreground/80">{row.quote_masked ?? "—"}</span>
                  <span className="text-muted-foreground/50 tabular-nums">
                    {row.from_surface}{row.latency_ms != null ? ` · ${row.latency_ms}ms` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* BYOK CRUD is unchanged — Connect wraps it, it does not replace it. */}
        <section id="asherin-connect-keys" className="space-y-3">
          <div>
            <h3 className="text-lg font-light text-foreground tracking-tight">Provider keys</h3>
            <p className="mt-1 text-sm text-muted-foreground font-light">
              Encrypted at rest and used for BYOK routing. Key material is never displayed after saving.
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

const BindingCard = ({ icon, title, state, ok, href }: { icon: React.ReactNode; title: string; state: string; ok: boolean; href: string }) => (
  <a
    href={href}
    className="group flex items-center gap-3 rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm px-4 py-3 hover:border-border/60 transition-colors"
  >
    <span className={ok ? "text-emerald-400/80" : "text-muted-foreground/60"}>{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-light text-foreground/85">{title}</span>
      <span className="block truncate text-[11px] font-light text-muted-foreground">{state}</span>
    </span>
    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
  </a>
);

export default ConnectView;
