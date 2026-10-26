/**
 * Settings — honest in the local edition.
 *
 * The hosted build acted on these preferences from a server: a scheduler ran
 * scans on a cadence, a mailer sent alert email, a webhook posted to slack,
 * an auto-remediation worker applied patches, a retention job pruned findings.
 * none of those runners exist on this device, and nothing in the room reads
 * `zerlal_settings`, so every control the earlier screen saved was inert — a
 * cadence that never fires, an alert that never sends. that pretence has been
 * removed rather than persist settings with no effect.
 */
import { Settings as SettingsIcon } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const SettingsScreen = () => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-4 w-4 text-foreground/70" strokeWidth={1.4} />
        <h2 className="text-sm font-light tracking-[0.15em] text-foreground/90 lowercase">settings</h2>
      </div>
      <KernelOfflineNotice
        capability="scan cadence, alerts and retention settings"
        reason="a scheduler, a mailer, a slack webhook and a retention job all ran on a server. none exist on this device and nothing here reads these values, so there is nothing honest to toggle."
        footer="your ai key, passphrase lock and data export live in the main settings room, and act on this device."
      />
    </div>
  </div>
);

export default SettingsScreen;
