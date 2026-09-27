/**
 * Account assurance primitives.
 *
 * One place decides three questions the rest of the app keeps asking:
 *   1. how strongly is this session authenticated right now (aal1 / aal2)?
 *   2. could it be raised (does a verified second factor exist)?
 *   3. what stable key identifies this session across token refreshes?
 *
 * Nothing here renders. The challenge UI lives in components/auth.
 */

import { supabase } from "@/integrations/supabase/client";

export type Aal = "aal1" | "aal2" | null;

export interface Assurance {
  /** Assurance level the current access token actually carries. */
  current: Aal;
  /** Assurance level this account is entitled to reach. */
  next: Aal;
  /** A verified factor exists, so aal2 is reachable. */
  canRaise: boolean;
  /** Signed in at aal1 while aal2 is reachable — the session is under-assured. */
  challengeRequired: boolean;
}

export const UNKNOWN_ASSURANCE: Assurance = {
  current: null,
  next: null,
  canRaise: false,
  challengeRequired: false,
};

export interface VerifiedFactor {
  id: string;
  friendlyName: string | null;
  createdAt: string;
  /** totp, phone, webauthn/passkey — whatever GoTrue actually verified. */
  type: string;
}

interface RawFactor {
  id: string;
  status?: string;
  factor_type?: string;
  friendly_name?: string | null;
  created_at?: string;
}

/**
 * Every bucket GoTrue returns, flattened. `all` is the superset in current
 * clients, but older shapes only populate the per-type arrays, so both are
 * read and de-duplicated by id. A passkey enrolled by ACCOUNT-SEC lands here
 * even though it is not a TOTP.
 */
async function allFactors(): Promise<RawFactor[]> {
  const { data } = await supabase.auth.mfa.listFactors();
  if (!data) return [];
  const buckets = [
    (data as { all?: RawFactor[] }).all,
    data.totp,
    (data as { phone?: RawFactor[] }).phone,
    (data as { webauthn?: RawFactor[] }).webauthn,
  ];
  const seen = new Map<string, RawFactor>();
  for (const b of buckets) {
    for (const f of (b ?? []) as RawFactor[]) if (f?.id) seen.set(f.id, f);
  }
  return [...seen.values()];
}

/**
 * A half-finished enrollment is not a second factor.
 *
 * GoTrue raises `nextLevel` to aal2 the moment a TOTP row exists, verified or
 * not. Someone who opened the QR in Guardian Vault and closed the tab would
 * otherwise be met at the next login by a challenge screen with nothing to
 * challenge. Sweeping the unverified rows is what makes that impossible.
 *
 * Returns how many rows were removed, so the caller knows to re-read AAL.
 */
export async function clearUnverifiedFactors(): Promise<number> {
  try {
    const stale = (await allFactors()).filter((f) => f.status !== "verified");
    if (!stale.length) return 0;
    const results = await Promise.all(
      stale.map((f) =>
        supabase.auth.mfa
          .unenroll({ factorId: f.id })
          .then((r) => !r.error)
          .catch(() => false),
      ),
    );
    return results.filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Verified factors of any type. Unverified enrollments never gate anything. */
export async function listVerifiedFactors(): Promise<VerifiedFactor[]> {
  try {
    return (await allFactors())
      .filter((f) => f.status === "verified")
      .map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        createdAt: f.created_at ?? "",
        type: f.factor_type ?? "totp",
      }));
  } catch {
    return [];
  }
}

/**
 * Read how strongly this session is authenticated.
 *
 * The wall is raised on evidence, not on entitlement: `challengeRequired` is
 * true only when a factor the operator actually finished verifying exists and
 * the live token is still aal1. An account with no MFA at all reaches the
 * dashboard on password or Google alone, the way it did before ACCOUNT-SEC —
 * and an account that DID enrol is still stopped cold.
 */
export async function readAssurance(): Promise<Assurance> {
  try {
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return UNKNOWN_ASSURANCE;
    let current = (data.currentLevel ?? null) as Aal;
    let next = (data.nextLevel ?? null) as Aal;

    // Nothing to weigh unless GoTrue thinks aal2 is reachable.
    if (next !== "aal2") {
      return { current, next, canRaise: false, challengeRequired: false };
    }

    let verified = await listVerifiedFactors();
    if (verified.length === 0) {
      // aal2 is only reachable because of leftovers. Remove them and ask again
      // so the session is judged on what is really enrolled.
      const removed = await clearUnverifiedFactors();
      if (removed > 0) {
        const again = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (again.data) {
          current = (again.data.currentLevel ?? null) as Aal;
          next = (again.data.nextLevel ?? null) as Aal;
        }
        verified = await listVerifiedFactors();
      }
    }

    const canRaise = verified.length > 0;
    return {
      current,
      next,
      canRaise,
      challengeRequired: canRaise && current === "aal1",
    };
  } catch {
    // A network failure must not invent a factor the operator never enrolled.
    // UNKNOWN carries challengeRequired: false, so the login gate opens; the
    // dangerous-action path treats UNKNOWN as "cannot prove anything" and
    // still asks for reauth.
    return UNKNOWN_ASSURANCE;
  }
}


/**
 * Raise the current session to aal2 with a code from the authenticator app.
 * Returns null on success, an operator-readable reason on failure.
 */
export async function verifyTotpCode(
  factorId: string,
  code: string,
): Promise<string | null> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return "Enter the 6-digit code from your authenticator app.";
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: clean,
  });
  return error ? error.message : null;
}

/**
 * Password reauthentication for accounts with no second factor.
 * signInWithPassword against the caller's own email: a wrong password fails
 * here and the dangerous action never runs.
 */
export async function reauthenticateWithPassword(
  email: string,
  password: string,
): Promise<string | null> {
  if (!password) return "Enter your current password.";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? "Current password is incorrect." : null;
}

/** True when the account can prove itself with a password (not OAuth-only). */
export function hasPasswordIdentity(
  identities: { provider: string }[] | undefined | null,
): boolean {
  if (!identities || identities.length === 0) return true; // email/password default
  return identities.some((i) => i.provider === "email");
}

/* ------------------------------------------------------------------ */
/* Stable session key                                                  */
/* ------------------------------------------------------------------ */

/**
 * GoTrue puts a `session_id` claim in the access token. It survives every
 * TOKEN_REFRESHED, unlike the token prefix the tracker used to slice, which
 * rotated hourly and stranded the row the heartbeat was meant to update.
 */
export function sessionKeyFromToken(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { session_id?: string; sub?: string };
    if (claims.session_id) return claims.session_id.replace(/-/g, "").slice(0, 32);
    return null;
  } catch {
    return null;
  }
}

export async function currentSessionKey(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return sessionKeyFromToken(data.session?.access_token);
}
