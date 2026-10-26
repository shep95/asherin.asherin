import { useCallback, useEffect, useState } from "react";
import { X, KeyRound, Trash2, CheckCircle2, CircleDashed, AlertCircle, MinusCircle } from "lucide-react";
import { ALL_PROVIDERS } from "@/lib/local/search/providers";
import { SEARCH_KEY_PROVIDERS, hasSearchKey } from "@/lib/local/search/keys";
import { deleteProviderKey, saveProviderKey, VaultLockedError } from "@/lib/local/keys";
import type { EngineReport } from "./types";

interface Props {
  engines: EngineReport[];
  onClose: () => void;
  onKeysChanged?: () => void;
}

const STATUS_ICON: Record<EngineReport["status"], { icon: typeof CheckCircle2; tone: string; word: string }> = {
  ok: { icon: CheckCircle2, tone: "text-emerald-400", word: "answered" },
  empty: { icon: CircleDashed, tone: "text-muted-foreground/60", word: "nothing matched" },
  failed: { icon: AlertCircle, tone: "text-amber-400", word: "could not answer" },
  skipped: { icon: MinusCircle, tone: "text-muted-foreground/40", word: "skipped" },
};

/**
 * the engines behind the last run and the optional keys that widen them.
 * keys are written to the encrypted device vault and sent only to their own provider.
 */
const SourcesPanel = ({ engines, onClose, onKeysChanged }: Props) => {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next: Record<string, boolean> = {};
    for (const p of SEARCH_KEY_PROVIDERS) next[p.id] = await hasSearchKey(p.id);
    setSaved(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (id: string) => {
    const p = SEARCH_KEY_PROVIDERS.find((x) => x.id === id);
    const value = (drafts[id] || "").trim();
    if (!p || !value) return;
    setBusy(id);
    setNotice(null);
    try {
      await saveProviderKey(p.vault, value);
      setDrafts((d) => ({ ...d, [id]: "" }));
      await refresh();
      onKeysChanged?.();
      setNotice(`${p.label} key saved to this device.`);
    } catch (e) {
      setNotice(e instanceof VaultLockedError ? "the key vault is locked. unlock it in settings → device first." : e instanceof Error ? e.message : "could not save the key");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    const p = SEARCH_KEY_PROVIDERS.find((x) => x.id === id);
    if (!p) return;
    setBusy(id);
    try {
      await deleteProviderKey(p.vault);
      await refresh();
      onKeysChanged?.();
      setNotice(`${p.label} key removed.`);
    } finally {
      setBusy(null);
    }
  };

  const keyless = ALL_PROVIDERS.filter((p) => !p.keyId);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 sm:bg-transparent" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full sm:max-w-md z-50 bg-card/95 backdrop-blur-xl border-l border-border/20 shadow-2xl flex flex-col animate-slide-up" role="dialog" aria-label="search sources">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/15">
          <div>
            <h3 className="text-sm font-normal text-foreground">sources</h3>
            <p className="text-[10px] text-muted-foreground/50">every engine is asked from this browser; no asherin server sits in between. page reads go through the jina reader relay, which sees the address you open.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5" aria-label="close sources">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          <section>
            <h4 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mb-2">last run</h4>
            {engines.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">run a search to see which engines answered.</p>
            ) : (
              <ul className="space-y-1">
                {engines.map((e) => {
                  const s = STATUS_ICON[e.status];
                  return (
                    <li key={e.id} className="flex items-center gap-2 text-[11px] rounded-lg border border-border/15 bg-background/30 px-2.5 py-1.5">
                      <s.icon className={`h-3.5 w-3.5 shrink-0 ${s.tone}`} />
                      <span className="text-foreground/90 min-w-0 truncate">{e.label}</span>
                      <span className="text-muted-foreground/50 ml-auto shrink-0">
                        {e.status === "ok" ? `${e.hits} hits · ${e.ms}ms` : e.reason ? `${s.word}: ${e.reason}` : s.word}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mb-2">keyless indexes</h4>
            <div className="flex flex-wrap gap-1.5">
              {keyless.map((p) => (
                <span key={p.id} className="rounded-md border border-border/20 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground" title={`modes: ${p.modes.join(", ")}`}>
                  {p.label}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mb-2 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" /> optional keys
            </h4>
            <p className="text-[10px] text-muted-foreground/50 mb-3">a key stays encrypted on this device and travels only to the provider it belongs to.</p>
            <div className="space-y-3">
              {SEARCH_KEY_PROVIDERS.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/20 bg-background/30 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-foreground">{p.label}</span>
                    {saved[p.id] ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> saved
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">not set</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mb-2">
                    {p.unlocks} · from {p.where}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={drafts[p.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void save(p.id);
                      }}
                      placeholder={saved[p.id] ? "replace key…" : "paste key…"}
                      aria-label={`${p.label} key`}
                      className="flex-1 min-w-0 rounded-lg border border-border/20 bg-background/50 px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/40"
                    />
                    <button
                      onClick={() => void save(p.id)}
                      disabled={busy === p.id || !(drafts[p.id] || "").trim()}
                      className="rounded-lg border border-border/30 bg-foreground/[0.06] px-2.5 py-1.5 text-[11px] text-foreground hover:bg-foreground/[0.12] disabled:opacity-30"
                    >
                      save
                    </button>
                    {saved[p.id] && (
                      <button onClick={() => void remove(p.id)} disabled={busy === p.id} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive" aria-label={`remove ${p.label} key`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {notice && <p className="mt-3 text-[11px] text-muted-foreground">{notice}</p>}
          </section>
        </div>
      </div>
    </>
  );
};

export default SourcesPanel;
