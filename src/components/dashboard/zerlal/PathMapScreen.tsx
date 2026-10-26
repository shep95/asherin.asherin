/**
 * Path Map — offline in the local edition.
 *
 * The hosted build fetched every path and header on the wire for a host from a
 * server (`zerlal-path-map`). a browser tab cannot fetch arbitrary third-party
 * hosts (cors), so there is nothing honest to inventory on this device. the
 * earlier build sent the request anyway and surfaced the kernel-offline error
 * as a toast; now the room says so in place.
 */
import { Route } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const PathMapScreen = () => (
  <div className="flex-1 overflow-y-auto p-6 space-y-5">
    <div>
      <h1 className="text-[13px] font-light tracking-[0.18em] text-foreground/90 lowercase flex items-center gap-2">
        <Route className="h-4 w-4 text-foreground/50" /> path map
      </h1>
      <p className="text-[10px] font-light text-muted-foreground/50 mt-1 max-w-2xl lowercase">
        inventory of what answers on the wire for a host: paths, protective headers, cookie flags.
      </p>
    </div>
    <KernelOfflineNotice
      capability="path mapping"
      reason="fetching another host's paths and headers is blocked from a browser tab by cross-origin rules. this leg ran on the kernel; nothing was fetched."
    />
  </div>
);

export default PathMapScreen;
