import type { SourceTier } from "./types";

const tierConfig: Record<SourceTier, { color: string; bg: string; label: string; dot: string }> = {
  1: { color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", label: "primary",       dot: "bg-emerald-400" },
  2: { color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/30",       label: "established",   dot: "bg-blue-400" },
  3: { color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/30",     label: "institutional", dot: "bg-amber-400" },
  4: { color: "text-muted-foreground", bg: "bg-muted/30 border-border/30",       label: "general",       dot: "bg-muted-foreground" },
  5: { color: "text-orange-300",  bg: "bg-orange-500/10 border-orange-500/30",   label: "onion",         dot: "bg-orange-400" },
};

interface SourceTierBadgeProps {
  tier: SourceTier;
  compact?: boolean;
}

const SourceTierBadge = ({ tier, compact }: SourceTierBadgeProps) => {
  const cfg = tierConfig[tier];
  const isOnion = tier === 5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${cfg.bg} ${cfg.color}`}
      title={isOnion ? "Tor required — open in Tor Browser. Unverified source." : cfg.label}
    >
      {isOnion ? (
        <span aria-hidden="true">🧅</span>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      )}
      {!compact && cfg.label}
    </span>
  );
};

export default SourceTierBadge;
