/**
 * Team — honest in the local edition.
 *
 * The hosted build managed a shared workspace: invite an analyst by email, set
 * a role, suspend them. on this device there is no account and no second
 * operator — the device itself is the operator (see AuthContext). the earlier
 * screen persisted a roster to a local table and toasted "invitation sent",
 * but nothing was ever emailed and no one else could ever sign in. that
 * pretence has been removed.
 */
import { Users } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const TeamScreen = () => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-foreground/70" strokeWidth={1.4} />
        <h2 className="text-sm font-light tracking-[0.15em] text-foreground/90 lowercase">team</h2>
      </div>
      <KernelOfflineNotice
        capability="team workspaces"
        reason="there is no account on this device and no mailer to send an invite — the device itself is the single operator. a shared roster needs a server to hold accounts for other people to sign in to."
      />
    </div>
  </div>
);

export default TeamScreen;
