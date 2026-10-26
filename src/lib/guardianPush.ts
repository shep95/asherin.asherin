/**
 * Background (web push) alerts, local edition.
 *
 * web push needs a server that holds the vapid key and sends to the browser's
 * push endpoint. asherin has no server, so there is nothing to enrol with. the
 * honest answer is a stable "unsupported" with the reason, returned at once:
 * no permission prompt that leads nowhere and no call to a push service that
 * does not exist. alerts still reach the in-app bell, and the browser's own
 * notification while this tab is open.
 */

export type PushState = "unsupported" | "denied" | "prompt" | "enabled" | "error";

export interface PushStatus {
  state: PushState;
  endpoint?: string;
  reason?: string;
}

export const NO_PUSH_REASON =
  "background alerts need a push server, and asherin has none. alerts reach the bell, and a browser notification while this tab is open.";

export async function readPushStatus(): Promise<PushStatus> {
  return { state: "unsupported", reason: NO_PUSH_REASON };
}

export async function enablePush(): Promise<PushStatus> {
  return { state: "unsupported", reason: NO_PUSH_REASON };
}

/** drops a subscription left by an older hosted build, if one is still registered. */
export async function disablePush(): Promise<PushStatus> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      await sub?.unsubscribe().catch(() => {});
    }
  } catch {
    // nothing to undo.
  }
  return { state: "unsupported", reason: NO_PUSH_REASON };
}
