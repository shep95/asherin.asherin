import { AlertTriangle } from "lucide-react";
import { describeFailure } from "./offline";

/**
 * the one error panel the room's desks share. it never shows a stack, never
 * shows the shim's own sentence, and always offers the retry when the caller
 * has one — a failure to look is stated as a failure to look, not as an
 * all-clear and not as a blank.
 */
const OrganOffline = ({
  error,
  organ,
  onRetry,
  retryLabel = "try again",
}: {
  error: unknown;
  organ: string;
  onRetry?: () => void;
  retryLabel?: string;
}) => (
  <div
    role="alert"
    className="rounded-2xl border border-border/25 bg-card/20 p-4 text-xs leading-relaxed text-muted-foreground"
  >
    <p className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
      <span className="min-w-0 break-words">{describeFailure(error, organ)}</span>
    </p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-border/30 px-3 py-1.5 text-[11px] font-light text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
      >
        {retryLabel}
      </button>
    )}
  </div>
);

export default OrganOffline;
