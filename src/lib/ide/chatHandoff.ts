/**
 * Chat → code workspace handoff.
 *
 * The IDE is not a peer product the operator navigates to. Chat is the mouth;
 * when a turn actually writes files, the code workspace opens as the hand that
 * owns the result and the operator reviews a diff there. Nothing is written
 * without the approval gate on the other side of this channel.
 *
 * Ordering matters: the dashboard switches to the workspace in the same beat
 * that it queues the payload, so the IDE may still be mounting when the event
 * fires. The queue survives that gap — a listener that arrives late drains the
 * pending payload on mount instead of losing the write.
 */

export interface HandoffFile {
  /** Project-relative path exactly as the model named it. */
  filename: string;
  content: string;
  language?: string;
}

export interface IdeHandoff {
  files: HandoffFile[];
  /** Short label shown on the approval gate — the operator's own words. */
  trigger: string;
  at: number;
}

export const IDE_HANDOFF_EVENT = "asherin:ide-handoff";
/** IDE asks the dashboard to put the mouth back in front. */
export const IDE_RETURN_TO_CHAT_EVENT = "asherin:ide-return-to-chat";

/** Payloads older than this are stale — a handoff the operator walked away from. */
const MAX_AGE_MS = 5 * 60_000;

let pending: IdeHandoff | null = null;

export function queueIdeHandoff(files: HandoffFile[], trigger: string): boolean {
  const usable = (files || []).filter((f) => f?.filename && f.content?.trim());
  if (usable.length === 0) return false;

  pending = { files: usable, trigger: (trigger || "").slice(0, 200), at: Date.now() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(IDE_HANDOFF_EVENT, { detail: pending }));
  }
  return true;
}

/** Single-consumer drain: the same write must never be applied twice. */
export function takeIdeHandoff(): IdeHandoff | null {
  const value = pending;
  pending = null;
  if (!value) return null;
  if (Date.now() - value.at > MAX_AGE_MS) return null;
  return value;
}

export function requestReturnToChat(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(IDE_RETURN_TO_CHAT_EVENT));
  }
}
