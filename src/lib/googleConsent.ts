/**
 * Google consent launcher.
 *
 * Google refuses to render accounts.google.com inside a frame — an embedded
 * navigation returns a bare "403. That's an error… you do not have access to
 * this page." Every Asherin surface runs inside the Lovable preview iframe, so
 * assigning `window.location.href = consentUrl` navigates the *frame* and the
 * user hits that 403 instead of the account chooser.
 *
 * The consent screen must therefore be reached in a top-level browsing
 * context. Three strategies, in descending preference:
 *
 *   1. A named popup — always top-level, keeps the app mounted behind it, and
 *      lets the popup report the outcome back to its opener.
 *   2. Top-frame navigation — used when the popup is blocked and the embedder
 *      permits top navigation by user activation.
 *   3. Same-frame navigation — the legacy path; correct when the app is not
 *      framed at all, and a last resort otherwise.
 */

import { GOOGLE_REDIRECT_URI, isTrustedAppOrigin } from "@/lib/googleRedirect";

export const GOOGLE_POPUP_NAME = "asherin-google-consent";

export type GoogleConsentResult =
  | { status: "connected"; email?: string }
  | { status: "failed"; message: string }
  | { status: "dismissed" }
  | { status: "navigated" };

const isFramed = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // A cross-origin top means we are definitively framed.
    return true;
  }
};

/**
 * Send the user through Google consent and resolve with the outcome.
 *
 * Resolves `navigated` when the whole document is being replaced — the caller
 * is about to unmount, so it must not show a "finished" state in that case.
 */
export function openGoogleConsent(url: string): Promise<GoogleConsentResult> {
  const popup = window.open(url, GOOGLE_POPUP_NAME, "width=520,height=680,noopener=no,noreferrer=no");

  if (!popup || popup.closed) {
    // Popup blocked. Escape the frame instead so Google is still top-level.
    if (isFramed()) {
      try {
        // Cross-origin top navigation is permitted with user activation, which
        // is present because this runs from a click handler.
        window.top!.location.href = url;
        return Promise.resolve({ status: "navigated" });
      } catch {
        /* embedder forbids it — fall through */
      }
    }
    window.location.href = url;
    return Promise.resolve({ status: "navigated" });
  }

  try {
    popup.focus();
  } catch {
    /* focus is a courtesy, never a failure */
  }

  return new Promise<GoogleConsentResult>((resolve) => {
    let settled = false;
    let exchanging = false;
    const finish = (result: GoogleConsentResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(watchdog);
      resolve(result);
    };

    const closePopup = () => {
      try {
        popup.close();
      } catch {
        /* already closed */
      }
    };

    const onMessage = (event: MessageEvent) => {
      // The popup lands on the canonical redirect origin, which is usually a
      // *different* origin from the app the user is looking at. Trust is
      // therefore an explicit allow-list, never "same origin or nothing".
      if (event.origin !== window.location.origin && !isTrustedAppOrigin(event.origin)) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;

      // Case A — the popup could exchange the code itself (same origin, live
      // session) and is reporting the finished outcome.
      if (payload.type === "asherin:google-consent") {
        finish(
          payload.ok
            ? { status: "connected", email: payload.email }
            : { status: "failed", message: String(payload.message || "Google rejected the authorization.") },
        );
        closePopup();
        return;
      }

      // Case B — the popup is on the canonical origin and has no session, so
      // it hands the code back here, where the session lives.
      if (payload.type === "asherin:google-consent-code") {
        if (exchanging) return;
        exchanging = true;
        closePopup();
        void exchangeRelayedCode(String(payload.code || ""), payload.state ? String(payload.state) : undefined)
          .then((email) => finish({ status: "connected", email }))
          .catch((err: Error) => finish({ status: "failed", message: err.message }));
      }
    };
    window.addEventListener("message", onMessage);

    // The user can close the popup without deciding; poll so the caller's
    // spinner is never orphaned. An in-flight exchange must not be cancelled by
    // the very close *we* triggered, hence the `exchanging` guard.
    const watchdog = window.setInterval(() => {
      if (popup.closed && !exchanging) finish({ status: "dismissed" });
    }, 600);
  });
}

/** Exchange a code relayed from the canonical-origin popup. */
async function exchangeRelayedCode(code: string, state?: string): Promise<string | undefined> {
  if (!code) throw new Error("Google returned no authorization code.");
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in first.");
  const { data, error } = await supabase.functions.invoke("google-oauth", {
    body: { action: "exchange_code", code, state, redirect_uri: GOOGLE_REDIRECT_URI },
  });
  if (error) {
    let detail = error.message;
    try { detail = (await (error as any).context?.text?.()) ?? detail; } catch { /* keep message */ }
    throw new Error(detail);
  }
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return (data as any)?.email;
}

/** True when the current document is the consent popup reporting back. */
export function isConsentPopup(): boolean {
  try {
    return Boolean(window.opener) && window.name === GOOGLE_POPUP_NAME;
  } catch {
    return false;
  }
}

/** Report the exchange outcome to the opener and close the popup. */
export function reportConsentResult(result: { ok: boolean; email?: string; message?: string }): void {
  postToOpener({ type: "asherin:google-consent", ...result });
}

/**
 * Hand a raw authorization code back to the opener.
 *
 * Used when the popup landed on the canonical redirect origin but the user's
 * session lives on the origin that opened it — localStorage is per-origin, so
 * the popup genuinely cannot perform the exchange.
 */
export function relayConsentCode(code: string, state: string | undefined, targetOrigin: string): boolean {
  if (!isTrustedAppOrigin(targetOrigin)) return false;
  return postToOpener({ type: "asherin:google-consent-code", code, state }, targetOrigin);
}

function postToOpener(message: Record<string, unknown>, targetOrigin?: string): boolean {
  let delivered = false;
  try {
    window.opener?.postMessage(message, targetOrigin || window.location.origin);
    delivered = Boolean(window.opener);
  } catch {
    /* opener gone — closing still leaves the app in a sane state */
  }
  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      /* browser refused; the callback hook already stripped the code */
    }
  }, 120);
  return delivered;
}
