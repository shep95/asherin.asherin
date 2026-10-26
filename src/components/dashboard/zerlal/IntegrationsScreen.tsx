/**
 * Integrations — honest in the local edition.
 *
 * The hosted build brokered oauth and webhooks to ci/cd, issue trackers, chat,
 * identity providers, siem and compliance platforms from a server. the earlier
 * screen drew 21 tiles, every one "not connected", each with a settings button
 * that did nothing — there is no broker on this device to connect them. that
 * has been removed and the room says so plainly.
 */
import { Plug } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const IntegrationsScreen = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-foreground/50" />
        <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 lowercase">integrations</h2>
      </div>
      <KernelOfflineNotice
        capability="third-party integrations"
        reason="connecting github, jira, slack, okta, splunk and the rest needs an oauth and webhook broker running on a server. there is none on this device, so nothing here can connect."
      />
    </div>
  </div>
);

export default IntegrationsScreen;
