// IDE Pain Point #2/#20: Show validation result inline in the chat / output panel.
import { useEffect, useState } from "react";
import { Check, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { validateCode, type ValidationResult } from "@/lib/ide";

interface Props {
  content: string;
  language?: string;
  /** When provided, the badge is clickable and reveals the issue list. */
  collapsible?: boolean;
  className?: string;
}

export default function IdeValidatorBadge({ content, language = "tsx", collapsible = true, className = "" }: Props) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!content) { setResult(null); return; }
    // Validation is sync but we run it off the main thread tick to avoid jank.
    const id = setTimeout(() => setResult(validateCode(content, language)), 30);
    return () => clearTimeout(id);
  }, [content, language]);

  if (!result) return null;

  const { ok, confidence, headline, issues } = result;
  const tone = ok ? (confidence >= 90 ? "ok" : "warn") : "err";
  const Icon = tone === "ok" ? Check : tone === "warn" ? AlertTriangle : XCircle;
  const toneCls = tone === "ok"
    ? "border-foreground/30 bg-foreground/5 text-foreground/90"
    : tone === "warn"
      ? "border-foreground/30 bg-foreground/5 text-muted-foreground/90"
      : "border-destructive/30 bg-destructive/5 text-destructive/90";

  return (
    <div className={`rounded-md border ${toneCls} text-[10px] font-light ${className}`}>
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5"
        disabled={!collapsible}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="size-3" />
          <span>{headline}</span>
          <span className="opacity-50">· {confidence}% confidence</span>
        </span>
        {collapsible && issues.length > 0 && (open ? <ChevronUp className="size-3 opacity-60" /> : <ChevronDown className="size-3 opacity-60" />)}
      </button>
      {open && issues.length > 0 && (
        <ul className="border-t border-current/10 px-2.5 py-1.5 space-y-0.5 max-h-[280px] overflow-y-auto">
          {/* Show ALL issues — earlier cap of 8 caused "10 errors but only 7 visible" mismatch
              when there were warnings/info mixed in or >8 total issues. */}
          {issues.map((i, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              {i.severity === "error" ? <XCircle className="size-2.5 mt-0.5 shrink-0" />
                : i.severity === "warning" ? <AlertTriangle className="size-2.5 mt-0.5 shrink-0" />
                : <Info className="size-2.5 mt-0.5 shrink-0" />}
              <span className="opacity-80">L{i.line}: {i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
