// asherin.data — shared skin. one set of tokens so every panel reads as one room.

export const card = "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm";
export const chip = "rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70 transition hover:border-white/25 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40";
export const field = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-white/25";
export const select = "rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75 outline-none focus:border-white/25";
export const eyebrow = "mb-2 text-[10px] tracking-widest text-white/45";

export function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-300/80";
  if (score >= 65) return "text-amber-300/80";
  return "text-rose-300/80";
}

export function errorText(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return (m || fallback).replace(/^[A-Z]/, (c) => c.toLowerCase());
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Number(n.toFixed(2)));
}

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).toLowerCase();
}
