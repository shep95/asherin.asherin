// The operator's private vault — the only place the organism's memory is ever
// visible. Rows arrive sealed; nothing is decrypted until the operator asks
// for it, and sensitive rows stay masked until they explicitly reveal them.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { decryptText } from "@/lib/encryption";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, RefreshCw, Trash2, Lock, Sparkles } from "lucide-react";

interface VaultRow {
  id: string;
  facet: string;
  label: string;
  content: string;
  sensitive: boolean;
  encrypted: boolean;
  confidence: number;
  occurrences: number;
  last_seen: string;
}

interface PatternRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  trigger: string;
  procedure: string;
  potency: number;
  active: boolean;
}

interface GrowthRow {
  sessions: number | null;
  entries: number | null;
  patterns: number | null;
  density: number | null;
  last_note: string | null;
  last_grown_at: string | null;
}

const FACET_LABEL: Record<string, string> = {
  interest: "Interests",
  thinking: "How they think",
  work: "Work",
  style: "Style",
  preference: "Preferences",
  correction: "Corrections",
  emotion: "Temperament",
  expertise: "Expertise",
  goal: "Goals",
  secret: "Private",
  context: "Context",
  directive: "Standing directives",
};

export default function OrganismVaultView() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [growth, setGrowth] = useState<GrowthRow | null>(null);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"vault" | "patterns" | "growth">("vault");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setError("Sign in to open your vault.");
        setRows([]);
        return;
      }
      // RLS scopes every one of these to the signed-in owner.
      const [v, p, g] = await Promise.all([
        supabase
          .from("organism_vault")
          .select("id,facet,label,content,sensitive,encrypted,confidence,occurrences,last_seen")
          .order("last_seen", { ascending: false })
          .limit(500),
        supabase
          .from("organism_patterns")
          .select("id,slug,name,domain,trigger,procedure,potency,active")
          .order("potency", { ascending: false })
          .limit(200),
        supabase
          .from("organism_growth")
          .select("sessions,entries,patterns,density,last_note,last_grown_at")
          .maybeSingle(),
      ]);
      if (v.error) throw v.error;
      setRows((v.data ?? []) as VaultRow[]);
      setPatterns((p.data ?? []) as PatternRow[]);
      setGrowth((g.data ?? null) as GrowthRow | null);
      // Non-sensitive rows can be opened up front; sensitive ones wait.
      const opened: Record<string, string> = {};
      for (const r of (v.data ?? []) as VaultRow[]) {
        if (r.sensitive) continue;
        try {
          opened[r.id] = r.encrypted ? await decryptText(r.content, uid) : r.content;
        } catch {
          opened[r.id] = "";
        }
      }
      setPlain(opened);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the vault.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reveal = async (row: VaultRow) => {
    if (revealed[row.id]) {
      setRevealed((s) => ({ ...s, [row.id]: false }));
      return;
    }
    if (!userId) return;
    if (plain[row.id] === undefined) {
      try {
        const text = row.encrypted ? await decryptText(row.content, userId) : row.content;
        setPlain((s) => ({ ...s, [row.id]: text }));
      } catch {
        toast.error("This entry is sealed and could not be opened on this device.");
        return;
      }
    }
    setRevealed((s) => ({ ...s, [row.id]: true }));
  };

  const forget = async (id: string) => {
    const { error: delErr } = await supabase.from("organism_vault").delete().eq("id", id);
    if (delErr) {
      toast.error("Could not remove that entry.");
      return;
    }
    setRows((s) => s.filter((r) => r.id !== id));
    toast.success("Forgotten.");
  };

  const retire = async (p: PatternRow) => {
    const { error: upErr } = await supabase
      .from("organism_patterns")
      .update({ active: !p.active })
      .eq("id", p.id);
    if (upErr) {
      toast.error("Could not change that pattern.");
      return;
    }
    setPatterns((s) => s.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
  };

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const out = new Map<string, VaultRow[]>();
    for (const r of rows) {
      const hay = `${r.label} ${plain[r.id] ?? ""}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const list = out.get(r.facet) ?? [];
      list.push(r);
      out.set(r.facet, list);
    }
    return [...out.entries()];
  }, [rows, plain, filter]);

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extralight tracking-tight text-foreground">asherin.vault</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Everything the assistant has learned about you, encrypted to your account and readable
            only here. It is never quoted back as a source, and you can forget any of it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["vault", "patterns", "growth"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
              tab === t
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "vault" ? `Knowledge (${rows.length})` : t === "patterns" ? `Patterns (${patterns.length})` : "Growth"}
          </button>
        ))}
        {tab === "vault" && (
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search your vault"
            className="h-8 w-full max-w-xs text-xs md:w-64"
          />
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-border/40 bg-muted/20" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-muted-foreground">
          {error}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        </div>
      )}

      {!loading && !error && tab === "vault" && (
        grouped.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            Nothing here yet. The vault fills itself as you work in chat — keep talking and come back.
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([facet, list]) => (
              <section key={facet}>
                <h2 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  {FACET_LABEL[facet] ?? facet}
                </h2>
                <ul className="space-y-2">
                  {list.map((r) => {
                    const shown = !r.sensitive || revealed[r.id];
                    return (
                      <li
                        key={r.id}
                        className="flex items-start gap-3 rounded-2xl border border-border/50 bg-card/40 p-3.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-foreground">{r.label}</span>
                            {r.sensitive && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Lock className="h-2.5 w-2.5" /> private
                              </Badge>
                            )}
                            {r.occurrences > 1 && (
                              <span className="text-[10px] text-muted-foreground">seen {r.occurrences}×</span>
                            )}
                          </div>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {shown ? (plain[r.id] ?? "—") : "•••••••••••••••••••••"}
                          </p>
                        </div>
                        {r.sensitive && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void reveal(r)}>
                            {revealed[r.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void forget(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )
      )}

      {!loading && !error && tab === "patterns" && (
        patterns.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No patterns minted yet. These appear once your sessions repeat a way of reasoning worth keeping.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {patterns.map((p) => (
              <li key={p.id} className="rounded-2xl border border-border/50 bg-card/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                      <span className="truncate text-sm text-foreground">{p.name}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">{p.domain}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => void retire(p)}>
                    {p.active ? "Retire" : "Restore"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-foreground/70">Fires when:</span> {p.trigger}
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                  {p.procedure}
                </pre>
              </li>
            ))}
          </ul>
        )
      )}

      {!loading && !error && tab === "growth" && (
        !growth ? (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No growth recorded yet. It starts the first time you finish a real conversation.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { k: "Sessions", v: growth.sessions ?? 0 },
                { k: "Things learned", v: growth.entries ?? 0 },
                { k: "Patterns", v: growth.patterns ?? 0 },
                { k: "Density", v: Number(growth.density ?? 0).toFixed(2) },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-border/50 bg-card/40 p-4">
                  <div className="text-xl font-extralight text-foreground">{s.v}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border/50 bg-card/40 p-4 text-xs text-muted-foreground">
              {growth.last_grown_at && (
                <div>Last grew {new Date(growth.last_grown_at).toLocaleString()}</div>
              )}
              {growth.last_note && <p className="mt-1 text-foreground/80">{growth.last_note}</p>}
            </div>
          </div>
        )
      )}
    </div>
  );
}
