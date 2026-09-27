// Centralized operator identity for client-side UI gating.
//
// There are no addresses here. Recognition is a SHA-256 digest match over the
// canonical address (see identityHash.ts) so no operator mailbox ships in the
// JS bundle where anyone can scrape it.
//
// NOTE: these checks are cosmetic only — showing an admin tab, unlocking an
// internal panel. Real authorization is enforced server-side by the
// `is_admin_user(uuid)` SQL function, RLS, and the edge-function digest gates.
// Never trust this file for security.

export {
  isOwnerEmail,
  isStaffEmail,
  isInternalProEmail,
  isContributorEmail,
  emailHash,
  canonicalizeEmail,
} from "@/lib/identityHash";

import { isStaffEmail } from "@/lib/identityHash";

/** Historical name kept so existing call sites keep compiling. */
export const isAdminEmail = (email?: string | null): boolean => isStaffEmail(email);
