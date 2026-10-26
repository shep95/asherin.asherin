import { CloudOff } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One honest panel for every zerlal capability that ran as a server organ.
 *
 * asherin is a local-first app: there is no backend. the legs these tools
 * needed — resolving another host's dns, reaching its ports, reading a remote
 * certificate-transparency or whois index, calling a paid scanner — are things
 * a browser tab physically cannot do against a third party. so the room says
 * so in one plain lowercase line instead of fabricating a result or spinning
 * forever. anything asherin can actually do on this device is linked from here.
 */
interface Props {
  /** what the operator tried to run, lowercase (e.g. "port scanning"). */
  capability: string;
  /** one plain sentence on why a browser cannot do it on this device. */
  reason: string;
  /** optional pointer to the tools that do work on-device. */
  footer?: ReactNode;
}

const KernelOfflineNotice = ({ capability, reason, footer }: Props) => (
  <div className="rounded-xl border border-border/[0.08] bg-foreground/[0.015] p-8 text-center space-y-3 max-w-xl mx-auto">
    <div className="w-12 h-12 rounded-2xl bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center mx-auto">
      <CloudOff className="h-5 w-5 text-muted-foreground/30" />
    </div>
    <p className="text-[11px] text-foreground/60 lowercase">{capability} ran on the asherin kernel and is not part of the local edition.</p>
    <p className="text-[10px] text-muted-foreground/40 leading-relaxed lowercase">{reason}</p>
    {footer && <div className="text-[10px] text-muted-foreground/40 leading-relaxed lowercase pt-1">{footer}</div>}
  </div>
);

export default KernelOfflineNotice;
