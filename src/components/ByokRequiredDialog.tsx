import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";

export const BYOK_REQUIRED_EVENT = "aureon:byok-required";

/**
 * @param detail.noRedirect  Set by surfaces that own the operator's workspace
 *   (e.g. the Intelligence Map co-pilot) so the dialog never yanks them off a
 *   task mid-flight.
 */
export function triggerByokRequired(detail?: { source?: string; reason?: string; noRedirect?: boolean }) {
  try {
    window.dispatchEvent(new CustomEvent(BYOK_REQUIRED_EVENT, { detail: detail || {} }));
  } catch { /* noop */ }
}

export default function ByokRequiredDialog() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ reason?: string; noRedirect?: boolean }>;
      setReason(ce.detail?.reason || "");
      setOpen(true);
    };
    window.addEventListener(BYOK_REQUIRED_EVENT, handler);
    return () => window.removeEventListener(BYOK_REQUIRED_EVENT, handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border-white/10 bg-zinc-950/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-zinc-300" />
            <DialogTitle className="text-zinc-100">Bring Your Own API Key</DialogTitle>
          </div>
          <DialogDescription className="text-zinc-400 pt-2 leading-relaxed">
            The hosted model path is busy right now. To continue without interruption, connect your own
            API key and select a model in
            <span className="text-zinc-200"> Settings → AI Keys</span>.
            {reason ? <span className="block mt-2 text-xs text-zinc-500">{reason}</span> : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-zinc-400">
            Dismiss
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              navigate("/dashboard?tab=settings&panel=ai-keys");
            }}
            className="bg-zinc-100 text-zinc-900 hover:bg-white"
          >
            Add API Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
