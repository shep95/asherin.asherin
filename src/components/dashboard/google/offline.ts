// what this room can and cannot do on a device, said once.
//
// every desk in asherin.google was written against edge functions
// (google-oauth, google-data, google-mesh, google-substrate, mesh-vault,
// meet-vault, ghost-engine, phone-messages, rideshare-guardian,
// transit-guardian, sentinel-ble, wifi-sentinel, op-layer, organism). the
// local edition has no device handler for any of them, so
// `supabase.functions.invoke` answers each with the shim's "kernel offline"
// error (src/lib/local/functions.ts). these helpers recognise that answer
// and turn it into one lowercase sentence the operator can act on, instead
// of the shim's own line or a raw error message.

const LOCAL_ONLY_RE = /kernel offline|needs a server-side organ|LOCAL_ONLY/i;

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  context?: { status?: unknown } | null;
}

/** true when the failure is the local shim saying "no device handler". */
export function isLocalOnlyError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e === "string") return LOCAL_ONLY_RE.test(e);
  const err = e as ErrorLike;
  if (err.code === "LOCAL_ONLY") return true;
  if (typeof err.message === "string" && LOCAL_ONLY_RE.test(err.message)) return true;
  return false;
}

/** the sentence shown wherever an organ of this room is asked for on a device. */
export function offlineNote(organ: string): string {
  return `the ${organ} ran on a server asherin no longer has. nothing on this device can answer for it, so this desk reports nothing rather than a clean read.`;
}

/**
 * one failure line for an error panel: the offline sentence for the shim's
 * answer, otherwise the error's own message, lowercased at the start and
 * bounded so a long message cannot push the panel wider than the screen.
 */
export function describeFailure(e: unknown, organ: string): string {
  if (isLocalOnlyError(e)) return offlineNote(organ);
  const raw =
    typeof e === "string"
      ? e
      : typeof (e as ErrorLike)?.message === "string"
        ? String((e as ErrorLike).message)
        : "";
  const msg = raw.trim();
  if (!msg) return `the ${organ} did not answer.`;
  const bounded = msg.length > 200 ? `${msg.slice(0, 199)}…` : msg;
  return bounded.charAt(0).toLowerCase() + bounded.slice(1);
}

/**
 * why no google account can be connected from this device today. stated in
 * one place so the header, the overview card and every "connect google"
 * empty state say the same thing.
 */
export const NO_ACCOUNT_PATH =
  "no google account is connected. the authorization exchange ran on a server asherin no longer has, and no browser-only path is wired yet.";

/** the shorter form for an empty state inside a desk. */
export const CONNECT_UNAVAILABLE =
  "no google account can be connected on this device yet, so this desk has nothing to read.";

/**
 * the work that would make a browser-only path real. kept here so the
 * overview can state it plainly instead of hiding a button that fails.
 */
export const BROWSER_PATH_NEEDS: readonly string[] = [
  "a google oauth client id registered for this origin, supplied by the operator and held on the device",
  "a content-security-policy that admits accounts.google.com for the identity-services script",
  "every desk re-pointed from the google-data function to google's rest apis, with the token kept in the device vault",
];
