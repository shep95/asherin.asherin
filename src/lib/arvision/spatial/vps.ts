// asherin.arvision — visual positioning client
// Calls the asherin-arvision-vps edge function, which holds the map service
// credentials. When the service is not configured the call returns an explicit
// unavailable state; no pose is ever invented.

import { supabase } from "@/integrations/supabase/client";
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

export async function getVpsStatus(): Promise<VpsStatus> {
  const { data, error } = await supabase.functions.invoke("asherin-arvision-vps", {
    body: { action: "status" },
  });
  if (error) return { configured: false, message: "positioning service unreachable" };
  const body = data as { configured?: boolean; message?: string } | null;
  return {
    configured: Boolean(body?.configured),
    message: body?.message ?? "positioning service state unknown",
  };
}

export async function localizeFrame(params: {
  imageBase64: string;
  intrinsics: CameraIntrinsics;
  mapCode?: string;
  mapSetCode?: string;
  isRightHanded?: boolean;
}): Promise<VpsResult> {
  const { data, error } = await supabase.functions.invoke("asherin-arvision-vps", {
    body: {
      action: "localize",
      image: params.imageBase64,
      isRightHanded: params.isRightHanded ?? false,
      fx: params.intrinsics.fx,
      fy: params.intrinsics.fy,
      px: params.intrinsics.px,
      py: params.intrinsics.py,
      width: params.intrinsics.width,
      height: params.intrinsics.height,
      mapCode: params.mapCode,
      mapSetCode: params.mapSetCode,
    },
  });

  if (error) {
    return { poseFound: false, confidence: 0, message: "positioning request failed", unavailable: true };
  }

  const body = data as Partial<VpsResult> | null;
  return {
    poseFound: Boolean(body?.poseFound),
    confidence: typeof body?.confidence === "number" ? body.confidence : 0,
    position: body?.position,
    rotation: body?.rotation,
    mapCode: body?.mapCode,
    message: body?.message ?? (body?.poseFound ? "pose found" : "no pose found in this frame"),
    unavailable: Boolean(body?.unavailable),
  };
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
