/**
 * GhostChain Scanner — offline in the local edition.
 *
 * The hosted build ran GhostChain as a server organ (`zerlal-ghostchain`):
 * dns, tls, port and crawl legs, plus a live key probe — none of which a
 * browser tab can perform against a third-party host. the earlier build sent
 * the request and showed the kernel-offline error in a red box only after a
 * click; now the room says so in place.
 */
import { Ghost } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const GhostChainScanner = () => (
  <div className="flex-1 overflow-y-auto bg-background">
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-border/[0.06] pb-5">
        <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] border border-border/[0.08] flex items-center justify-center">
          <Ghost className="h-4 w-4 text-foreground/60" />
        </div>
        <div>
          <h2 className="text-sm font-light tracking-[0.15em] text-foreground/90 lowercase">ghostchain scanner</h2>
          <p className="text-[10px] text-muted-foreground/40 tracking-wide mt-0.5 lowercase">defensive exposure scanner</p>
        </div>
      </div>
      <KernelOfflineNotice
        capability="ghostchain exposure scanning"
        reason="dns, tls, port and crawl legs against another host cannot run from a browser tab. this ran on the kernel; nothing was reached."
      />
    </div>
  </div>
);

export default GhostChainScanner;
