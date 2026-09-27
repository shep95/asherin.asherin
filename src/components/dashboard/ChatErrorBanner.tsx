import { useState } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Zap, ArrowRight } from "lucide-react";

interface ChatErrorBannerProps {
  error: string;
  errorCode?: string;
  onRetry?: () => void;
  onFallback?: () => void;
  onDismiss?: () => void;
  fallbackLabel?: string;
}

function categorizeError(error: string, code?: string): {
  title: string;
  explanation: string;
  alternatives: { label: string; action: "retry" | "fallback" | "simplify" | "switch-model" }[];
} {
  const lower = error.toLowerCase();

  if (lower.includes("rate limit") || lower.includes("429") || code === "429") {
    return {
      title: "Rate limit reached",
      explanation: "Too many requests in a short time. The system will automatically retry with backoff.",
      alternatives: [
        { label: "Retry now", action: "retry" },
        { label: "Switch to faster model", action: "switch-model" },
      ],
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      title: "Request timed out",
      explanation: "The response took too long. This often happens with complex queries or large contexts.",
      alternatives: [
        { label: "Retry", action: "retry" },
        { label: "Simplify request", action: "simplify" },
        { label: "Use shallower depth", action: "fallback" },
      ],
    };
  }
  if (lower.includes("context") || lower.includes("token") || lower.includes("too long")) {
    return {
      title: "Context too large",
      explanation: "The conversation or attached files exceeded the model's context window.",
      alternatives: [
        { label: "Start new thread", action: "fallback" },
        { label: "Retry with summary", action: "simplify" },
      ],
    };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch")) {
    return {
      title: "Network error",
      explanation: "Could not reach the server. Check your internet connection.",
      alternatives: [
        { label: "Retry", action: "retry" },
      ],
    };
  }
  if (lower.includes("auth") || lower.includes("401") || lower.includes("403")) {
    return {
      title: "Authentication error",
      explanation: "Your session may have expired. Try refreshing the page.",
      alternatives: [
        { label: "Refresh session", action: "retry" },
      ],
    };
  }
  return {
    title: "Something went wrong",
    explanation: error,
    alternatives: [
      { label: "Retry", action: "retry" },
      { label: "Try different approach", action: "fallback" },
    ],
  };
}

const ChatErrorBanner = ({ error, errorCode, onRetry, onFallback, onDismiss, fallbackLabel }: ChatErrorBannerProps) => {
  const [expanded, setExpanded] = useState(false);
  const info = categorizeError(error, errorCode);

  return (
    <div className="mx-auto max-w-3xl mb-3 animate-slide-up">
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive/70 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-light text-foreground">{info.title}</p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {onDismiss && (
            <button onClick={onDismiss} className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors">
              Dismiss
            </button>
          )}
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-4 pb-2 border-t border-destructive/10 pt-2">
            <p className="text-xs font-light text-muted-foreground leading-relaxed">{info.explanation}</p>
            {errorCode && (
              <p className="text-[10px] font-mono text-muted-foreground/40 mt-1">Code: {errorCode}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-destructive/10 bg-destructive/3">
          {info.alternatives.map((alt, idx) => {
            const handler = alt.action === "retry" ? onRetry
              : (alt.action === "fallback" || alt.action === "simplify" || alt.action === "switch-model") ? onFallback
              : undefined;
            return (
              <button
                key={idx}
                onClick={handler}
                disabled={!handler}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-light transition-colors border border-border/20 hover:bg-foreground/5 text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {alt.action === "retry" ? <RefreshCw className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                {fallbackLabel && alt.action === "fallback" ? fallbackLabel : alt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChatErrorBanner;
