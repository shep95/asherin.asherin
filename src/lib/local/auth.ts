/**
 * Local identity. There is no account: the device IS the operator. A stable
 * id is minted once and kept in localStorage (mirrored into the local db) so
 * every row this app writes is scoped to the same "user" forever.
 *
 * The object shapes mirror what the hosted auth client returned, so the ~180
 * call sites that read `user.id`, `user.email`, `session.access_token` keep
 * working without edits.
 */

const ID_KEY = "asherin_device_id";
const META_KEY = "asherin_device_profile";

export interface LocalUser {
  id: string;
  email: string;
  aud: string;
  role: string;
  created_at: string;
  updated_at: string;
  email_confirmed_at: string;
  last_sign_in_at: string;
  app_metadata: { provider: string; providers: string[] };
  user_metadata: Record<string, unknown>;
  identities: { id: string; user_id: string; provider: string; identity_data: Record<string, unknown> }[];
  factors: unknown[];
  is_anonymous: boolean;
}

export interface LocalSession {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: LocalUser;
}

function readLs(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeLs(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

function mintId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let memoryId: string | null = null;
let memoryMeta: Record<string, unknown> | null = null;

function deviceId(): string {
  if (memoryId) return memoryId;
  let id = readLs(ID_KEY);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = mintId();
    writeLs(ID_KEY, id);
    writeLs(`${ID_KEY}_created`, new Date().toISOString());
  }
  memoryId = id;
  return id;
}

function profile(): Record<string, unknown> {
  if (memoryMeta) return memoryMeta;
  try {
    memoryMeta = JSON.parse(readLs(META_KEY) || "{}") as Record<string, unknown>;
  } catch {
    memoryMeta = {};
  }
  if (!memoryMeta.name) memoryMeta.name = "operator";
  return memoryMeta;
}

export function getLocalUser(): LocalUser {
  const id = deviceId();
  const created = readLs(`${ID_KEY}_created`) || new Date(0).toISOString();
  const meta = profile();
  return {
    id,
    email: `${id.slice(0, 8)}@this.device`,
    aud: "authenticated",
    role: "authenticated",
    created_at: created,
    updated_at: created,
    email_confirmed_at: created,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "local", providers: ["local"] },
    user_metadata: { ...meta },
    identities: [{ id, user_id: id, provider: "local", identity_data: {} }],
    factors: [],
    is_anonymous: false,
  };
}

export function getLocalSession(): LocalSession {
  const user = getLocalUser();
  return {
    access_token: "local-device",
    refresh_token: "local-device",
    token_type: "bearer",
    expires_in: 10 ** 9,
    expires_at: Math.floor(Date.now() / 1000) + 10 ** 9,
    user,
  };
}

export function updateLocalProfile(patch: Record<string, unknown>) {
  const next = { ...profile(), ...patch };
  memoryMeta = next;
  writeLs(META_KEY, JSON.stringify(next));
  for (const cb of authListeners) cb("USER_UPDATED", getLocalSession());
}

type AuthCb = (event: string, session: LocalSession | null) => void;
const authListeners = new Set<AuthCb>();

const notAvailable = (what: string) => ({
  data: { user: null, session: null },
  error: Object.assign(new Error(`${what} is not part of asherin local. this device is already signed in as itself.`), { name: "AuthApiError", status: 400 }),
});

/** `supabase.auth` replacement. */
export const localAuth = {
  async getUser(..._args: unknown[]) {
    return { data: { user: getLocalUser() }, error: null };
  },
  async getSession(..._args: unknown[]) {
    return { data: { session: getLocalSession() }, error: null };
  },
  async refreshSession(..._args: unknown[]) {
    return { data: { session: getLocalSession(), user: getLocalUser() }, error: null };
  },
  async setSession(..._args: unknown[]) {
    return { data: { session: getLocalSession(), user: getLocalUser() }, error: null };
  },
  onAuthStateChange(cb: AuthCb) {
    authListeners.add(cb);
    queueMicrotask(() => {
      try {
        cb("INITIAL_SESSION", getLocalSession());
      } catch {
        /* listener error */
      }
    });
    return { data: { subscription: { id: "local", callback: cb, unsubscribe: () => authListeners.delete(cb) } } };
  },
  async signOut(_opts?: unknown) {
    for (const cb of authListeners) cb("SIGNED_OUT", null);
    return { error: null };
  },
  async signInWithPassword(..._args: unknown[]) { return notAvailable("password sign-in"); },
  async signInWithOAuth(..._args: unknown[]) { return { data: { provider: "google", url: null }, error: notAvailable("oauth sign-in").error }; },
  async signInWithOtp(..._args: unknown[]) { return notAvailable("magic-link sign-in"); },
  async signUp(..._args: unknown[]) { return notAvailable("sign-up"); },
  async resetPasswordForEmail(..._args: unknown[]) { return { data: {}, error: notAvailable("password reset").error }; },
  async reauthenticate(..._args: unknown[]) { return { data: { user: getLocalUser(), session: getLocalSession() }, error: null }; },
  async updateUser(attrs: { data?: Record<string, unknown>; password?: string; email?: string }) {
    if (attrs?.data) updateLocalProfile(attrs.data);
    return { data: { user: getLocalUser() }, error: null };
  },
  async getUserIdentities(..._args: unknown[]) { return { data: { identities: getLocalUser().identities }, error: null }; },
  mfa: {
    async listFactors(..._args: unknown[]) { return { data: { all: [], totp: [], phone: [] }, error: null }; },
    async getAuthenticatorAssuranceLevel(..._args: unknown[]) {
      return { data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [{ method: "local", timestamp: Date.now() }] }, error: null };
    },
    async enroll(..._args: unknown[]) { return { data: null, error: notAvailable("mfa enrolment").error }; },
    async challenge(..._args: unknown[]) { return { data: null, error: notAvailable("mfa challenge").error }; },
    async verify(..._args: unknown[]) { return { data: null, error: notAvailable("mfa verification").error }; },
    async challengeAndVerify(..._args: unknown[]) { return { data: null, error: notAvailable("mfa verification").error }; },
    async unenroll(..._args: unknown[]) { return { data: null, error: notAvailable("mfa unenrolment").error }; },
  },
};
