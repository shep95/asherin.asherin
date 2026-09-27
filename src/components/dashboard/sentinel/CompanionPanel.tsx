import { useCallback, useEffect, useState } from "react";
import { Loader2, Laptop, ShieldOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createPairingCode, fetchCompanions, revokeCompanion, type CompanionRow } from "@/lib/sentinel/audio/sync";

/**
 * The desktop companion panel.
 *
 * The room's ceiling is a browser tab. The companion is the honest way past it:
 * a separate process on the operator's own machine, paired with a one-use code
 * that expires in ten minutes and is exchanged for a device token this account
 * can revoke. The code is shown once, here, and never stored in readable form.
 */

const card = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
const chip = "rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/55";

const stamp = (iso: string | null) =>
  iso ? `${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })} ${new Date(iso).toLocaleTimeString([], { hour12: false })}` : "never";

const CompanionPanel = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<CompanionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [minting, setMinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { companions } = await fetchCompanions();
      setRows(companions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the paired machines could not be listed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Only ticks while a code is on screen — no idle timer behind the room.
  useEffect(() => {
    if (!code) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [code]);

  const secondsLeft = code ? Math.max(0, Math.round((Date.parse(code.expiresAt) - now) / 1000)) : 0;
  useEffect(() => {
    if (code && secondsLeft === 0) setCode(null);
  }, [code, secondsLeft]);

  const mint = async () => {
    setMinting(true);
    try {
      const out = await createPairingCode();
      setCode(out);
      setNow(Date.now());
      setCopied(false);
    } catch (e) {
      toast({ title: "no pairing code", description: e instanceof Error ? e.message : "the code could not be made.", variant: "destructive" });
    } finally {
      setMinting(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "clipboard refused", description: "type the code into the companion by hand." });
    }
  };

  const revoke = async (row: CompanionRow) => {
    try {
      await revokeCompanion(row.id);
      toast({ title: "companion revoked", description: `${row.label} can no longer record into this account.` });
      void load();
    } catch (e) {
      toast({ title: "not revoked", description: e instanceof Error ? e.message : "the companion is still paired.", variant: "destructive" });
    }
  };

  const active = rows.filter((r) => !r.revoked_at);

  return (
    <div className={`${card} space-y-4 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-light tracking-wide text-white/70">desktop companion</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/45">
            a separate process on your own machine. it records with no browser open and resumes after a reboot when you
            switch on start at login. it still cannot record while the machine is powered off, asleep or hibernating —
            those gaps stay visible in the timeline instead of being hidden.
          </p>
        </div>
        <Button
          onClick={() => void mint()}
          disabled={minting}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.05] px-4 font-light text-white/80"
        >
          {minting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Laptop className="mr-2 h-4 w-4" />}
          pair a machine
        </Button>
      </div>

      {code && (
        <div className="rounded-xl border border-white/15 bg-white/[0.05] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-2xl tracking-[0.35em] text-white/90">{code.code}</div>
              <div className="mt-1 text-[11px] text-white/45">
                one use · expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </div>
            </div>
            <Button onClick={() => void copy()} className="h-9 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-light text-white/75">
              {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
              {copied ? "copied" : "copy"}
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            open Asherin Sentinel on that machine and type this code. it is shown once — the account keeps only a hash of it.
          </p>
        </div>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-white/40">reading paired machines…</p>
      ) : error ? (
        <p className="py-4 text-center text-sm text-white/50">{error}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-white/80">{r.label}</div>
                <div className="text-[11px] text-white/40">
                  {r.platform} · paired {stamp(r.created_at)} · last recorded {stamp(r.last_used_at)}
                </div>
              </div>
              {r.revoked_at ? (
                <span className={chip}>revoked</span>
              ) : (
                <Button
                  onClick={() => void revoke(r)}
                  className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs font-light text-white/70"
                >
                  <ShieldOff className="mr-2 h-3.5 w-3.5" />
                  revoke
                </Button>
              )}
            </div>
          ))}
          {!rows.length && <p className="py-4 text-center text-sm text-white/40">no machine is paired yet.</p>}
          {rows.length > 0 && (
            <p className="text-[11px] text-white/35">{active.length} machine(s) may currently record into this account.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CompanionPanel;
