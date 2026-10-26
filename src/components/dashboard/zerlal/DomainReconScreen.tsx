/**
 * Domain Reconnaissance — offline in the local edition.
 *
 * The hosted build ran recon as a server organ: dns, tls, header, subdomain,
 * certificate and port legs a browser tab cannot perform against a third-party
 * host. there is no honest result to show on this device, so the room says so
 * plainly instead of presenting a scan it did not gather.
 */
import { ScanSearch } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

interface DomainReconScreenProps {
  onSelectFinding?: (id: string) => void;
}

const DomainReconScreen = ({ onSelectFinding: _onSelectFinding }: DomainReconScreenProps) => (
  <div className="flex-1 overflow-y-auto p-6 space-y-5">
    <div className="flex items-center gap-2">
      <ScanSearch className="h-4 w-4 text-foreground/50" />
      <h2 className="text-[13px] font-light tracking-[0.1em] text-foreground/90 lowercase">domain reconnaissance</h2>
    </div>
    <KernelOfflineNotice
      capability="domain reconnaissance"
      reason="dns, tls, header, subdomain and certificate legs against another host cannot run from a browser tab. this ran on the kernel; nothing was probed."
      footer="for code you hold, the code scanner and log correlator read real input on this device."
    />
  </div>
);

export default DomainReconScreen;
