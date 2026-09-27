// Guardian Vault — stored items + Watchtower exposure review.
//
// Everything sensitive is decrypted in-page and rendered masked by default.
// Connect traces carry counts and verdicts only: no label content, no domain
// value, no secret, ever.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Check, Eye, EyeOff, Plus, Trash2, ShieldAlert, ShieldCheck,
  RefreshCw, Lock, KeyRound, StickyNote, CreditCard, Timer, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { emitPull } from "@/lib/connect/emitPull";
import {
  createVaultItem, deleteVaultItem, listVaultItems, recordExposure,
  updateVaultItem, KIND_LABEL,
  type VaultDraft, type VaultItem, type VaultKind, type VaultSecret,
} from "@/lib/security/vaultItems";
import {
  ageInDays, checkPasswordExposure, findReuse, passwordStrength,
} from "@/lib/security/watchtower";
import { extractSeed, totpCode, totpRemaining } from "@/lib/security/totp";

const KIND_ICON: Record<VaultKind, React.ElementType> = {
  login: KeyRound,
  note: StickyNote,
  card: CreditCard,
  totp: Timer,
  token: Lock,
};

const KINDS: VaultKind[] = ["login", "note", "card", "totp", "token"];

const EMPTY_DRAFT: VaultDraft = { kind: "login", label: "", domain: "", secret: {} };

const inputClass =
  "w-full rounded-xl border border-border/25 bg-card/20 px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function secretOf(item: VaultItem): string | null {
  return item.secret?.password ?? item.secret?.token ?? null;
}

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          timer.current = window.setTimeout(() => setDone(false), 1600);
        } catch { /* clipboard blocked — nothing to leak either way */ }
      }}
      className="text-muted-foreground/40 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400/80" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const TotpCode = ({ seed }: { seed: string }) => {
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await totpCode(extractSeed(seed));
        if (!alive) return;
        setCode(next);
        setBad(false);
      } catch {
        if (alive) { setBad(true); setCode(null); }
      }
      if (alive) setLeft(totpRemaining());
    };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => { alive = false; window.clearInterval(id); };
  }, [seed]);

  if (bad) return <span className="text-[11px] text-amber-400/70">Seed is not valid base32</span>;
  if (!code) return <span className="text-[11px] text-muted-foreground/40">…</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-sm tracking-[0.3em] text-foreground">{code}</span>
      <span className="text-[10px] text-muted-foreground/40 tabular-nums">{left}s</span>
      <CopyButton value={code} label="code" />
    </span>
  );
};

const VaultItemsPanel = ({ mode }: { mode: "items" | "watchtower" }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<VaultDraft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listVaultItems(user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vault unavailable");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const reuseGroups = useMemo(
    () => findReuse(items.map(secretOf)),
    [items],
  );
  const reusedIds = useMemo(() => {
    const set = new Set<string>();
    reuseGroups.forEach((g) => g.forEach((i) => set.add(items[i].id)));
    return set;
  }, [reuseGroups, items]);

  const openNew = () => { setDraft(EMPTY_DRAFT); setEditing(null); setFormOpen(true); };

  const openEdit = (item: VaultItem) => {
    if (item.sealed) {
      toast({ title: "Item is sealed", description: "This device could not open the envelope.", variant: "destructive" });
      return;
    }
    setDraft({ kind: item.kind, label: item.label, domain: item.domain ?? "", secret: { ...(item.secret ?? {}) } });
    setEditing(item.id);
    setFormOpen(true);
  };

  const save = async () => {
    if (!user?.id) return;
    if (!draft.label.trim()) {
      toast({ title: "A label is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const started = performance.now();
    try {
      if (editing) {
        const before = items.find((i) => i.id === editing);
        const rotated = secretOf(before ?? ({} as VaultItem)) !== (draft.secret.password ?? draft.secret.token ?? null);
        await updateVaultItem(user.id, editing, draft, { markRotated: rotated });
      } else {
        await createVaultItem(user.id, draft);
      }
      void emitPull({
        organ: "vault",
        capability: editing ? "item-update" : "item-create",
        fromSurface: "guardian-vault",
        status: "ok",
        latencyMs: performance.now() - started,
        quote: `${KIND_LABEL[draft.kind]} item sealed`,
        meta: { kind: draft.kind },
      });
      setFormOpen(false);
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      await load();
      toast({ title: editing ? "Item updated" : "Item stored", description: "Sealed with your account key before upload." });
    } catch (e) {
      void emitPull({
        organ: "vault", capability: editing ? "item-update" : "item-create",
        fromSurface: "guardian-vault", status: "fail",
        latencyMs: performance.now() - started, quote: "vault write failed",
      });
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: VaultItem) => {
    try {
      await deleteVaultItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      void emitPull({
        organ: "vault", capability: "item-delete", fromSurface: "guardian-vault",
        status: "ok", quote: `${KIND_LABEL[item.kind]} item removed`, meta: { kind: item.kind },
      });
    } catch (e) {
      toast({ title: "Could not delete", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const scan = async () => {
    const targets = items.filter((i) => !i.sealed && secretOf(i));
    if (targets.length === 0) {
      void emitPull({
        organ: "vault", capability: "breach-check", fromSurface: "guardian-vault",
        status: "skip", quote: "no credentials to check",
      });
      toast({ title: "Nothing to check", description: "No stored passwords or tokens yet." });
      return;
    }
    setScanning(true);
    const started = performance.now();
    let exposed = 0;
    let failed = 0;
    try {
      for (const item of targets) {
        const result = await checkPasswordExposure(secretOf(item) as string);
        if (result.state === "exposed") exposed++;
        if (result.state === "error") failed++;
        await recordExposure(item.id, result.state, result.count);
      }
      void emitPull({
        organ: "vault", capability: "breach-check", fromSurface: "guardian-vault",
        status: failed === targets.length ? "fail" : "ok",
        latencyMs: performance.now() - started,
        quote: `checked ${targets.length}, exposed ${exposed}`,
        meta: { checked: targets.length, exposed, errors: failed },
      });
      await load();
      toast({
        title: exposed > 0 ? `${exposed} credential${exposed === 1 ? "" : "s"} exposed` : "No exposures found",
        description: failed > 0 ? `${failed} could not be checked — service unreachable.` : "Only a 5-character hash prefix left this device.",
        variant: exposed > 0 ? "destructive" : "default",
      });
    } finally {
      setScanning(false);
    }
  };

  if (!user?.id) return null;

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl border border-border/15 bg-card/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-2">
        <p className="text-xs font-light text-foreground">The vault did not load.</p>
        <p className="text-[10px] text-muted-foreground/50">{error}</p>
        <button onClick={() => void load()} className="text-[10px] px-2.5 py-1 rounded-lg border border-border/30 hover:border-border/60 transition-colors">
          Try again
        </button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Watchtower                                                        */
  /* ---------------------------------------------------------------- */
  if (mode === "watchtower") {
    const exposedItems = items.filter((i) => i.breach_status === "exposed");
    const weak = items.filter((i) => { const s = secretOf(i); return s ? passwordStrength(s) <= 1 : false; });
    const stale = items.filter((i) => (ageInDays(i.rotated_at) ?? 0) > 365);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Watchtower</h3>
            <p className="text-[10px] text-muted-foreground/40 mt-1 max-w-lg">
              Exposure is checked with k-anonymity: your browser hashes the secret and sends only the first five
              characters of that hash. The password itself never leaves this device.
            </p>
          </div>
          <button
            onClick={() => void scan()}
            disabled={scanning}
            className="text-[10px] font-light tracking-wide px-3 py-1.5 rounded-lg border border-border/30 text-foreground hover:border-border/60 transition-colors disabled:opacity-30 flex items-center gap-2 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Checking…" : "Run check"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Items", value: items.length },
            { label: "Exposed", value: exposedItems.length, warn: exposedItems.length > 0 },
            { label: "Reused", value: reusedIds.size, warn: reusedIds.size > 0 },
            { label: "Over a year old", value: stale.length, warn: stale.length > 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/15 bg-card/5 px-4 py-3">
              <p className={`text-lg font-extralight tabular-nums ${s.warn ? "text-amber-400/80" : "text-foreground"}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40 px-1">
            Nothing stored yet. Add a login on the Items tab and Watchtower will review it.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const s = secretOf(item);
              const strength = s ? passwordStrength(s) : null;
              const age = ageInDays(item.rotated_at);
              const flags: string[] = [];
              if (item.breach_status === "exposed") flags.push(`seen in ${item.breach_count.toLocaleString()} breach records`);
              if (reusedIds.has(item.id)) flags.push("reused on another item");
              if (strength !== null && strength <= 1) flags.push("weak");
              if (age !== null && age > 365) flags.push(`${age} days since rotation`);
              const clean = flags.length === 0;
              return (
                <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border/15 bg-card/5 px-4 py-3">
                  {clean
                    ? <ShieldCheck className="h-4 w-4 text-emerald-400/60 mt-0.5 flex-shrink-0" />
                    : <ShieldAlert className="h-4 w-4 text-amber-400/70 mt-0.5 flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-light text-foreground truncate">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                      {clean
                        ? item.breach_status === "unchecked"
                          ? "Not checked yet."
                          : item.breach_status === "error"
                            ? "Last check could not reach the exposure service."
                            : "No exposure, reuse, or age issue found."
                        : flags.join(" · ")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/30 px-1">
          Per-account breach history (which sites leaked a given email) needs a paid HaveIBeenPwned key, which
          Asherin does not hold. That check is unavailable rather than guessed.
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Items                                                             */
  /* ---------------------------------------------------------------- */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Stored Items</h3>
          <p className="text-[10px] text-muted-foreground/40 mt-1">
            Sealed with your account key in this browser. The server stores ciphertext only.
          </p>
        </div>
        <button
          onClick={openNew}
          className="text-[10px] font-light tracking-wide px-3 py-1.5 rounded-lg border border-border/30 text-foreground hover:border-border/60 transition-colors flex items-center gap-2 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3 w-3" /> New item
        </button>
      </div>

      {formOpen && (
        <div className="rounded-xl border border-border/25 bg-card/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-light text-foreground">{editing ? "Edit item" : "New item"}</p>
            <button onClick={() => { setFormOpen(false); setEditing(null); }} aria-label="Close form" className="text-muted-foreground/40 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${
                  draft.kind === k ? "border-border/70 text-foreground bg-card/30" : "border-border/20 text-muted-foreground/50 hover:text-foreground"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <input className={inputClass} placeholder="Label" value={draft.label} maxLength={120}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />

          {draft.kind === "login" && (
            <>
              <input className={inputClass} placeholder="Site (example.com)" value={draft.domain ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value }))} />
              <input className={inputClass} placeholder="Username" autoComplete="off" value={draft.secret.username ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, username: e.target.value } }))} />
              <input className={inputClass} type="password" placeholder="Password" autoComplete="new-password" value={draft.secret.password ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, password: e.target.value } }))} />
            </>
          )}

          {draft.kind === "note" && (
            <textarea className={`${inputClass} min-h-[120px] resize-y`} placeholder="Note" value={draft.secret.note ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, note: e.target.value } }))} />
          )}

          {draft.kind === "card" && (
            <>
              <input className={inputClass} placeholder="Cardholder" value={draft.secret.cardHolder ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, cardHolder: e.target.value } }))} />
              <input className={inputClass} inputMode="numeric" autoComplete="off" placeholder="Card number" value={draft.secret.cardNumber ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, cardNumber: e.target.value } }))} />
              <input className={inputClass} placeholder="Expiry (MM/YY)" value={draft.secret.cardExpiry ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, cardExpiry: e.target.value } }))} />
            </>
          )}

          {draft.kind === "totp" && (
            <input className={inputClass} placeholder="Base32 seed or otpauth:// URI" autoComplete="off" value={draft.secret.totpSeed ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, totpSeed: e.target.value } }))} />
          )}

          {draft.kind === "token" && (
            <textarea className={`${inputClass} min-h-[72px] resize-y font-mono`} placeholder="Token value" value={draft.secret.token ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, secret: { ...d.secret, token: e.target.value } }))} />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setFormOpen(false); setEditing(null); }} className="text-[10px] px-3 py-1.5 rounded-lg border border-border/20 text-muted-foreground/60 hover:text-foreground transition-colors">
              Cancel
            </button>
            <button onClick={() => void save()} disabled={saving}
              className="text-[10px] px-3 py-1.5 rounded-lg border border-border/50 text-foreground hover:border-border transition-colors disabled:opacity-30">
              {saving ? "Sealing…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !formOpen ? (
        <p className="text-[11px] text-muted-foreground/40 px-1">
          Nothing stored yet. Add a login, note, card, authenticator seed, or API token — it is encrypted before upload.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const show = !!revealed[item.id];
            const s = item.secret;
            return (
              <div key={item.id} className="rounded-xl border border-border/15 bg-card/5 px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-light text-foreground truncate">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground/35">
                      {KIND_LABEL[item.kind]}
                      {item.domain ? ` · ${item.domain}` : ""}
                      {item.breach_status === "exposed" ? " · exposed" : ""}
                      {reusedIds.has(item.id) ? " · reused" : ""}
                    </p>
                  </div>
                  {!item.sealed && (
                    <button onClick={() => setRevealed((r) => ({ ...r, [item.id]: !show }))}
                      aria-label={show ? `Hide ${item.label}` : `Reveal ${item.label}`}
                      className="text-muted-foreground/40 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <button onClick={() => openEdit(item)} className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors">Edit</button>
                  <button onClick={() => void remove(item)} aria-label={`Delete ${item.label}`}
                    className="text-muted-foreground/30 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {item.sealed && (
                  <p className="text-[10px] text-amber-400/70">
                    Sealed — this account key could not open the envelope. The ciphertext is intact.
                  </p>
                )}

                {!item.sealed && item.kind === "totp" && s?.totpSeed && (
                  <div className="pl-6"><TotpCode seed={s.totpSeed} /></div>
                )}

                {!item.sealed && show && s && item.kind !== "totp" && (
                  <div className="pl-6 space-y-1">
                    {([
                      ["Username", s.username],
                      ["Password", s.password],
                      ["Cardholder", s.cardHolder],
                      ["Card", s.cardNumber],
                      ["Expiry", s.cardExpiry],
                      ["Token", s.token],
                      ["Note", s.note],
                    ] as [string, string | undefined][])
                      .filter(([, v]) => !!v)
                      .map(([k, v]) => (
                        <div key={k} className="flex items-start gap-2">
                          <span className="text-[10px] text-muted-foreground/35 w-20 flex-shrink-0">{k}</span>
                          <span className="text-[11px] font-light text-foreground break-all flex-1 whitespace-pre-wrap">{v}</span>
                          <CopyButton value={v as string} label={k.toLowerCase()} />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VaultItemsPanel;
