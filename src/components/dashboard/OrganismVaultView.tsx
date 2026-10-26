// asherin.vault — the only place shepherd's memory is ever visible.
//
// rows arrive sealed; non-private rows are opened on load, private rows stay
// masked until the operator reveals them one at a time. every control here
// deletes or changes a real row on this device and proves it afterwards.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import { loadSettings } from "@/lib/intelligence/store";
import {
  FACET_LABEL,
  forgetEntry,
  forgetEverything,
  forgetPattern,
  loadVault,
  onVaultChange,
  openRow,
  setPatternActive,
  type Facet,
  type GrowthRow,
  type PatternRow,
  type VaultRow,
} from "@/lib/memory/vault";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, RefreshCw, Trash2, Lock, Sparkles } from "lucide-react";

/** sentinel for a row whose seal would not open on this device. */
const SEALED = "\u0000sealed";

type Tab = "knowledge" | "patterns" | "growth";

export default function OrganismVaultView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const v2 = useIsV2();
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [growth, setGrowth] = useState<GrowthRow | null>(null);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryOn, setMemoryOn] = useState<boolean | null>(null);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<Tab>("knowledge");
  const [busyId, setBusyId] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setError("this device has no identity yet — open chat once and come back.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [snap, settings] = await Promise.all([loadVault(userId), loadSettings().catch(() => null)]);
      if (!alive.current) return;
      setRows(snap.rows);
      setPatterns(snap.patterns);
      setGrowth(snap.growth);
      setMemoryOn(settings ? settings.memoryEnabled : null);
      // non-private rows open up front; private ones wait for the operator.
      const opened: Record<string, string> = {};
      for (const r of snap.rows) {
        if (r.sensitive) continue;
        try {
          opened[r.id] = await openRow(r, userId);
        } catch {
          opened[r.id] = SEALED;
        }
      }
      if (!alive.current) return;
      setPlain(opened);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message.toLowerCase() : "could not open the vault on this device.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // chat writes to the same tables; the room follows without a manual refresh.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onVaultChange(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(), 400);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [load]);

  const reveal = async (row: VaultRow) => {
    if (revealed[row.id]) {
      setRevealed((s) => ({ ...s, [row.id]: false }));
      return;
    }
    if (!userId) return;
    if (plain[row.id] === undefined) {
      try {
        const text = await openRow(row, userId);
        setPlain((s) => ({ ...s, [row.id]: text }));
      } catch {
        toast.error("this entry is sealed and could not be opened on this device.");
        return;
      }
    }
    setRevealed((s) => ({ ...s, [row.id]: true }));
  };

  const forget = async (id: string) => {
    if (!userId) return;
    setBusyId(id);
    try {
      const gone = await forgetEntry(userId, id);
      if (!gone) {
        toast.error("that entry is still here — try again.");
        return;
      }
      setRows((s) => s.filter((r) => r.id !== id));
      setPlain((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      toast.success("forgotten.");
    } catch {
      toast.error("could not remove that entry.");
    } finally {
      setBusyId(null);
    }
  };

  const dropPattern = async (p: PatternRow) => {
    if (!userId) return;
    setBusyId(p.id);
    try {
      const gone = await forgetPattern(userId, p.id);
      if (!gone) {
        toast.error("that pattern is still here — try again.");
        return;
      }
      setPatterns((s) => s.filter((x) => x.id !== p.id));
      toast.success("forgotten.");
    } catch {
      toast.error("could not remove that pattern.");
    } finally {
      setBusyId(null);
    }
  };

  const retire = async (p: PatternRow) => {
    if (!userId) return;
    try {
      await setPatternActive(userId, p.id, !p.active);
      setPatterns((s) => s.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
    } catch {
      toast.error("could not change that pattern.");
    }
  };

  const forgetAll = async () => {
    if (!userId) return;
    const total = rows.length + patterns.length;
    if (total === 0) return;
    if (!window.confirm(`forget everything shepherd has learned? ${total} item${total === 1 ? "" : "s"} will be deleted from this device.`)) return;
    try {
      const gone = await forgetEverything(userId);
      if (!gone) {
        toast.error("some entries are still here — try again.");
        return;
      }
      setRows([]);
      setPatterns([]);
      setGrowth(null);
      setPlain({});
      setRevealed({});
      toast.success("everything forgotten.");
    } catch {
      toast.error("could not clear the vault.");
    }
  };

  // search covers labels for every row and content only where it is open —
  // a private row's content is never searched until it has been revealed.
  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const out = new Map<string, VaultRow[]>();
    for (const r of rows) {
      const body = plain[r.id];
      const searchable = body && body !== SEALED && (!r.sensitive || revealed[r.id]) ? body : "";
      const hay = `${r.label} ${searchable}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const list = out.get(r.facet) ?? [];
      list.push(r);
      out.set(r.facet, list);
    }
    return [...out.entries()];
  }, [rows, plain, revealed, filter]);

  const refreshButton = v2 ? (
    <button type="button" className={v2ActionClass} onClick={() => void load()} disabled={loading} aria-label="refresh the vault">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      refresh
    </button>
  ) : (
    <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="refresh the vault">
      {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
      refresh
    </Button>
  );

  const memoryOffNote =
    memoryOn === false ? (
      <div className="mb-4 rounded-2xl border border-border/50 bg-card/40 p-3.5 text-xs text-muted-foreground">
        memory is off. shepherd keeps what is here but learns nothing new and uses none of it. turn on &ldquo;remember things about me&rdquo; in
        settings → memory &amp; learning to let the vault fill as you talk.
      </div>
    ) : null;

  return (
    <div className="h-full overflow-y-auto px-4 py-6 md:px-8">
      {v2 ? (
        <V2Action>{refreshButton}</V2Action>
      ) : (
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extralight tracking-tight text-foreground">asherin.vault</h1>
          </div>
          {refreshButton}
        </header>
      )}
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        what shepherd has learned from your conversations. held on this device, sealed with a key that never leaves it, readable only here.
        it is never quoted back as a source, and you can forget any of it.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="vault sections">
        {(["knowledge", "patterns", "growth"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
              tab === t ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "knowledge" ? `knowledge (${rows.length})` : t === "patterns" ? `patterns (${patterns.length})` : "growth"}
          </button>
        ))}
        {tab === "knowledge" && (
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="search what shepherd knows"
            aria-label="search what shepherd knows"
            className="h-8 w-full max-w-xs text-xs md:w-64"
          />
        )}
        {rows.length + patterns.length > 0 && (
          <button
            type="button"
            onClick={() => void forgetAll()}
            className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
          >
            forget everything
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="opening the vault">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-border/40 bg-muted/20" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-muted-foreground">
          {error}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => void load()}>
              try again
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && memoryOffNote}

      {!loading && !error && tab === "knowledge" && (
        rows.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            {memoryOn === false
              ? "nothing here yet. memory is off, so shepherd is not learning — turn it on in settings and keep talking."
              : "nothing here yet. the vault fills itself as you work in chat — after each answer shepherd notes what was durable about you."}
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            nothing matches &ldquo;{filter.trim()}&rdquo;. private entries are searched by label only until revealed.
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([facet, list]) => (
              <section key={facet} aria-label={FACET_LABEL[facet as Facet] ?? facet}>
                <h2 className="mb-2 text-xs lowercase tracking-widest text-muted-foreground">{FACET_LABEL[facet as Facet] ?? facet}</h2>
                <ul className="space-y-2">
                  {list.map((r) => {
                    const shown = !r.sensitive || revealed[r.id];
                    const body = plain[r.id];
                    return (
                      <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-border/50 bg-card/40 p-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-foreground">{r.label}</span>
                            {r.sensitive && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Lock className="h-2.5 w-2.5" /> private
                              </Badge>
                            )}
                            {r.occurrences > 1 && <span className="text-[10px] text-muted-foreground">seen {r.occurrences}×</span>}
                          </div>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {!shown
                              ? "•••••••••••••••••••••"
                              : body === SEALED
                                ? "sealed — this entry could not be opened on this device."
                                : body ?? "—"}
                          </p>
                        </div>
                        {r.sensitive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => void reveal(r)}
                            aria-label={revealed[r.id] ? `hide ${r.label}` : `reveal ${r.label}`}
                          >
                            {revealed[r.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => void forget(r.id)}
                          disabled={busyId === r.id}
                          aria-label={`forget ${r.label}`}
                        >
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
            no patterns yet. these appear once a conversation shows a way of working worth keeping — a format you asked for, a correction you made.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {patterns.map((p) => (
              <li key={p.id} className={`rounded-2xl border border-border/50 bg-card/40 p-4 ${p.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                      <span className="truncate text-sm text-foreground">{p.name}</span>
                      {p.potency > 1 && <span className="text-[10px] text-muted-foreground">seen {p.potency}×</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] lowercase tracking-widest text-muted-foreground">
                      {p.domain}
                      {p.active ? "" : " · retired"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => void retire(p)}>
                      {p.active ? "retire" : "restore"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void dropPattern(p)}
                      disabled={busyId === p.id}
                      aria-label={`forget ${p.name}`}
                    >
                      {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-foreground/70">fires when:</span> {p.trigger}
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-muted-foreground">{p.procedure}</pre>
              </li>
            ))}
          </ul>
        )
      )}

      {!loading && !error && tab === "growth" && (
        !growth ? (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            no growth recorded yet. it starts the first time a conversation teaches shepherd something durable.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { k: "conversations", v: growth.sessions ?? 0 },
                { k: "things learned", v: growth.entries ?? 0 },
                { k: "patterns", v: growth.patterns ?? 0 },
                { k: "learned per conversation", v: Number(growth.density ?? 0).toFixed(2) },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-border/50 bg-card/40 p-4">
                  <div className="text-xl font-extralight text-foreground">{s.v}</div>
                  <div className="mt-1 text-[11px] lowercase tracking-widest text-muted-foreground">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border/50 bg-card/40 p-4 text-xs text-muted-foreground">
              {growth.last_grown_at && <div>last grew {new Date(growth.last_grown_at).toLocaleString()}</div>}
              {growth.last_note && <p className="mt-1 text-foreground/80">{growth.last_note}</p>}
            </div>
          </div>
        )
      )}
    </div>
  );
}
