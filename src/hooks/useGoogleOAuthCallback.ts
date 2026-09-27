import { useEffect } from "react";
import { toast } from "sonner";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { isConsentPopup, relayConsentCode, reportConsentResult } from "@/lib/googleConsent";
import { isTrustedAppOrigin } from "@/lib/googleRedirect";

/** The origin that launched consent, carried through Google in `state`. */
function openerOriginFromState(state: string): string | null {
  try {
    const parsed = JSON.parse(atob(state));
    const origin = typeof parsed?.origin === "string" ? parsed.origin : "";
    return isTrustedAppOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
}


/**
 * Google OAuth return handler.
 *
 * The consent redirect lands on /dashboard, and more than one surface can be
 * mounted there (the Google view, the Settings panel, the Mesh panel). Without
 * a shared lock each of them would race to exchange the same authorization
 * code — Google burns a code on first use, so the losers would surface a
 * spurious "invalid_grant" error to the user.
 *
 * The lock is module-level (one per page load) and the code is stripped from
 * the URL before the exchange starts, so a refresh cannot replay it either.
 */
let exchangeInFlight: Promise<unknown> | null = null;

export function useGoogleOAuthCallback(onDone?: () => void) {
  const { exchangeCode } = useGoogleApi();

  useEffect(() => {
    if (exchangeInFlight) {
      void exchangeInFlight.finally(() => onDone?.());
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return;

    // Strip first: the URL must never carry a live authorization code.
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("scope");
    url.searchParams.delete("authuser");
    url.searchParams.delete("prompt");
    window.history.replaceState({}, "", url.pathname + url.search);

    const popupMode = isConsentPopup();

    // The popup lands on the canonical redirect origin. When that is not the
    // origin the user is signed in on, the session simply does not exist here
    // (localStorage is per-origin) — so hand the code to the opener instead of
    // failing an exchange that could never have worked.
    if (popupMode) {
      const opener = openerOriginFromState(state);
      if (opener && opener !== window.location.origin && relayConsentCode(code, state, opener)) return;
    }

    // Same-origin popup: exchange here and report the outcome. Toasting inside
    // a window that is about to close would show the user nothing.
    exchangeInFlight = exchangeCode(code, state)
      .then((data: any) => {
        if (popupMode) reportConsentResult({ ok: true, email: data?.email });
        else toast.success(`Connected ${data?.email || "Google account"}.`);
        return data;
      })
      .catch((err: Error) => {
        if (popupMode) reportConsentResult({ ok: false, message: err.message });
        else toast.error(`Failed to connect: ${err.message}`);
      })
      .finally(() => {
        onDone?.();
      });
    // onDone is intentionally not a dependency: re-running this effect would
    // re-read an already-stripped URL and do nothing useful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeCode]);
}
