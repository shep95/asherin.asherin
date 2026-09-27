import { Lock, ShieldCheck } from "lucide-react";

interface EncryptionBadgeProps {
  variant?: "inline" | "pill" | "minimal";
  className?: string;
}

const EncryptionBadge = ({ variant = "inline", className = "" }: EncryptionBadgeProps) => {
  if (variant === "minimal") {
    return (
      <Lock className={`h-3 w-3 text-emerald-500/70 ${className}`} />
    );
  }

  if (variant === "pill") {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 ${className}`}>
        <ShieldCheck className="h-3 w-3 text-emerald-500/80" />
        <span className="text-[10px] font-light tracking-wider text-emerald-500/80 uppercase">E2E Encrypted</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <Lock className="h-3 w-3 text-emerald-500/60" />
      <span className="text-[10px] font-extralight text-emerald-500/60">Encrypted</span>
    </div>
  );
};

export default EncryptionBadge;
