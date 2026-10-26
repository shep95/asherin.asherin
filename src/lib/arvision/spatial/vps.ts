// asherin.arvision — visual positioning client
//
// The hosted build called an edge function that held the map service
// credentials. This edition runs on the device alone: there is no function, so
// the local shim would answer "kernel offline" and the room would read it as a
// transient outage. The honest answer is static — the service does not exist
// here — and it is given without building or sending a frame anywhere. No pose
// is ever invented.

import type { CameraIntrinsics } from "./intrinsics";
import type { Quat, Vec3 } from "./types";

export interface VpsStatus {
  configured: boolean;
  message: string;
}

export interface VpsResult {
  poseFound: boolean;
  confidence: number;
  position?: Vec3;
  rotation?: Quat;
  mapCode?: string;
  message: string;
  /** true when the request could not even be attempted */
  unavailable: boolean;
}

export const VPS_UNAVAILABLE_MESSAGE =
  "camera positioning needs a map service this device edition does not have — place yourself on the plan by hand, or use the live position";

export async function getVpsStatus(): Promise<VpsStatus> {
  return { configured: false, message: VPS_UNAVAILABLE_MESSAGE };
}

/**
 * The frame never leaves the device: with no service to receive it, the call
 * answers unavailable at once. The parameter shape is kept so a future
 * on-device localiser can slot in without touching the room.
 */
export async function localizeFrame(_params: {
  imageBase64: string;
  intrinsics: CameraIntrinsics;
  mapCode?: string;
  mapSetCode?: string;
  isRightHanded?: boolean;
}): Promise<VpsResult> {
  return { poseFound: false, confidence: 0, message: VPS_UNAVAILABLE_MESSAGE, unavailable: true };
}

/** Downscale a video frame and return raw base64 jpeg, keeping the true frame size. */
export function frameToBase64(
  video: HTMLVideoElement,
  maxWidth = 1080,
): { base64: string; width: number; height: number } | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.split(",")[1] ?? "", width, height };
}
