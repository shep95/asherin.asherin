import { supabase } from "@/integrations/supabase/client";

function parseUserAgent(): { browser: string; os: string; deviceType: string } {
  const ua = navigator.userAgent;

  // Browser detection
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";

  // OS detection
  let os = "Unknown";
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("CrOS")) os = "ChromeOS";

  // Device type
  let deviceType = "Desktop";
  if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) deviceType = "Mobile";
  else if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) deviceType = "Tablet";

  return { browser, os, deviceType };
}

interface NetContext {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

const EMPTY_CONTEXT: NetContext = { ip: null, city: null, region: null, country: null };

/**
 * Network context comes from our own edge (which already terminates the
 * request) instead of ipify + ipapi. No third party learns the operator's
 * address, and unknown fields stay null rather than being invented.
 */
async function fetchNetContext(): Promise<NetContext> {
  try {
    const { data, error } = await supabase.functions.invoke("session-context");
    if (error || !data) return EMPTY_CONTEXT;
    return {
      ip: typeof data.ip === "string" ? data.ip : null,
      city: typeof data.city === "string" ? data.city : null,
      region: typeof data.region === "string" ? data.region : null,
      country: typeof data.country === "string" ? data.country : null,
    };
  } catch {
    return EMPTY_CONTEXT;
  }
}

const SESSION_REGISTERED_KEY = "aureon_session_registered";

/**
 * `sessionKey` MUST be the stable per-session key (GoTrue `session_id` claim),
 * not a slice of the access token: the token rotates hourly, which used to
 * orphan the row the heartbeat was supposed to keep alive and made revocation
 * point at a device that no longer matched.
 */
export async function registerSession(userId: string, sessionKey: string) {
  const registeredId = sessionStorage.getItem(SESSION_REGISTERED_KEY);
  if (registeredId === sessionKey) return;

  const { browser, os, deviceType } = parseUserAgent();
  const net = await fetchNetContext();

  const tokenHash = sessionKey.replace(/-/g, "").substring(0, 32);

  // Mark all other sessions for this user as not current
  await supabase
    .from("user_sessions")
    .update({ is_current: false })
    .eq("user_id", userId)
    .eq("is_current", true);

  // Capture referrer / UTM (where the click came from)
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const referrer = typeof document !== "undefined" ? (document.referrer || null) : null;
  const utm_source = params.get("utm_source") || params.get("ref") || null;
  const utm_medium = params.get("utm_medium") || null;
  const utm_campaign = params.get("utm_campaign") || null;
  const landing_path = typeof window !== "undefined" ? window.location.pathname : null;

  // Upsert current session. A row that was previously revoked and is being
  // re-registered (same device signed back in) must clear revoked_at, or the
  // heartbeat would immediately sign the operator out again.
  const { error } = await supabase.from("user_sessions").upsert(
    {
      user_id: userId,
      session_token_hash: tokenHash,
      browser,
      os,
      device_type: deviceType,
      ip_address: net.ip,
      city: net.city,
      region: net.region,
      country: net.country,
      current_path: landing_path,
      landing_path,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      is_current: true,
      revoked_at: null,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: "session_token_hash" }
  );

  if (!error) {
    sessionStorage.setItem(SESSION_REGISTERED_KEY, sessionKey);
  }

  // Log the login event to the activity log
  await supabase.from("account_activity_log").insert({
    user_id: userId,
    event_type: "login",
    description: `Signed in from ${browser} on ${os}`,
    ip_address: net.ip,
    device_info: `${deviceType} — ${browser} / ${os}`,
    location: [net.city, net.region, net.country].filter(Boolean).join(", ") || null,
    outcome: "success",
  });
}

export async function updateSessionActivity(userId: string, sessionKey: string, path?: string) {
  const tokenHash = sessionKey.replace(/-/g, "").substring(0, 32);
  await supabase
    .from("user_sessions")
    .update({
      last_active_at: new Date().toISOString(),
      ...(path ? { current_path: path } : {}),
    })
    .eq("user_id", userId)
    .eq("session_token_hash", tokenHash);
}

/**
 * Has this device's row been revoked from another device? Returns true only on
 * a definite revocation — a network failure returns false so a flaky link can
 * never boot an operator mid-session.
 */
export async function isSessionRevoked(userId: string, sessionKey: string): Promise<boolean> {
  const tokenHash = sessionKey.replace(/-/g, "").substring(0, 32);
  const { data, error } = await supabase
    .from("user_sessions")
    .select("revoked_at")
    .eq("user_id", userId)
    .eq("session_token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return false;
  return !!data.revoked_at;
}
