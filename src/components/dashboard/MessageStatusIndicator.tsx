import { Loader2, Check, CheckCheck, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import type { MessageStatus } from "@/lib/messageQueue";

interface MessageStatusIndicatorProps {
  status?: MessageStatus;
  retryCount?: number;
}

const MessageStatusIndicator = ({ status, retryCount }: MessageStatusIndicatorProps) => {
  if (!status || status === "sent") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/40">
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }

  switch (status) {
    case "sending":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] text-accent/60">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Sending…
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] text-amber-400/70">
          <Clock className="h-2.5 w-2.5" />
          Queued — will send next
        </span>
      );
    case "retrying":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] text-amber-400/70">
          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
          Retrying{retryCount ? ` (${retryCount})` : ""}…
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] text-destructive/70">
          <AlertTriangle className="h-2.5 w-2.5" />
          Failed
        </span>
      );
    default:
      return null;
  }
};

export default MessageStatusIndicator;
