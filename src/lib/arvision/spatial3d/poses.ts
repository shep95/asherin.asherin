// asherin.eye — operator-entered camera poses.
//
// A pose is a measurement someone took at the site with a phone, a tape and a
// compass. It is stored per operator on this device, every field is optional,
// and an omitted field stays null forever rather than defaulting to zero — a
// heading of 0° means "measured north", not "unknown".

import type { CameraPoseInput } from "./camera";

const KEY = "asherin.arvision.spatial.poses.v1";

export type StoredPose = CameraPoseInput & { measuredBy: string; measuredAtMs: number };

export function loadPoses(): Record<string, StoredPose> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, StoredPose>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePose(deviceId: string, pose: StoredPose): Record<string, StoredPose> {
  const all = { ...loadPoses(), [deviceId]: pose };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* storage refused; the pose stays in memory for this session only. */
    }
  }
  return all;
}

export function clearPose(deviceId: string): Record<string, StoredPose> {
  const all = { ...loadPoses() };
  delete all[deviceId];
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }
  return all;
}
