/**
 * Port Scanner — offline in the local edition.
 *
 * The hosted build ran port probes from a server. a browser tab cannot open
 * raw sockets to another host's ports, so there is nothing honest to show on
 * this device. the earlier build fabricated open ports from a hash of the
 * target string and drew them as real results; that has been removed.
 */
import { Wifi } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const PortScannerUI = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 text-foreground/50" />
        <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 lowercase">port scanner</h2>
      </div>
      <KernelOfflineNotice
        capability="port scanning"
        reason="a browser cannot open raw tcp sockets to another host's ports. this leg ran on the kernel; nothing was probed."
        footer="for code you hold, the code scanner reads real source on this device."
      />
    </div>
  </div>
);

export default PortScannerUI;
