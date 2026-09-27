// asherin.eye — spatial registration.
//
// Two cameras do not share a coordinate system because they are in the same
// list. Registration is a measurement someone performed, and until it exists
// nothing may be said about where a track in camera A is relative to camera B.

import type { RegistrationEvidence, RegistrationResult, RegistrationState } from "./types";

export function emptyRegistrationEvidence(): RegistrationEvidence {
  return {
    referencePoints: 0,
    matchedBuildingGeometry: false,
    floorPlanAsset: false,
    peerCameraCalibrated: false,
    depthOrLidar: false,
    surveyedByOperator: false,
  };
}

/**
 * Resolve the registration state from evidence that actually exists.
 * `verified` requires an operator survey — no amount of software agreement
 * promotes itself to verified.
 */
export function resolveRegistration(e: RegistrationEvidence): RegistrationResult {
  const reasons: string[] = [];
  if (e.referencePoints > 0) reasons.push(`${e.referencePoints} operator-measured reference point(s)`);
  if (e.matchedBuildingGeometry) reasons.push("aligned against building geometry");
  if (e.floorPlanAsset) reasons.push("aligned against an imported floor plan");
  if (e.peerCameraCalibrated) reasons.push("shares a calibrated reference with another camera");
  if (e.depthOrLidar) reasons.push("a depth or lidar stream supplies metric structure");
  if (e.surveyedByOperator) reasons.push("checked in person against the real place");

  const strong = (e.referencePoints >= 3 ? 1 : 0) + (e.depthOrLidar ? 1 : 0) + (e.matchedBuildingGeometry ? 1 : 0);
  const weak = (e.floorPlanAsset ? 1 : 0) + (e.peerCameraCalibrated ? 1 : 0) + (e.referencePoints > 0 ? 1 : 0);

  let state: RegistrationState = "not_registered";
  if (e.surveyedByOperator && strong >= 1) state = "verified";
  else if (strong >= 2) state = "calibrated";
  else if (strong >= 1 || weak >= 1) state = "approximate";

  const nextAction =
    state === "not_registered"
      ? "measure and enter at least three physical reference points, or import and align a floor plan, before any cross-camera position is claimed."
      : state === "approximate"
        ? "add a second independent alignment source (reference points, building geometry or a ranging sensor) to reach CALIBRATED."
        : state === "calibrated"
          ? "check the alignment in person at the site to reach VERIFIED."
          : "re-check after any camera is moved, refocused or replaced.";

  if (reasons.length === 0) reasons.push("no alignment evidence has been recorded");
  return { state, reasons, nextAction };
}

/** Whether two devices may be compared in one coordinate frame at all. */
export function sharesFrame(a: RegistrationResult, b: RegistrationResult): { allowed: boolean; reason: string } {
  const ok = (r: RegistrationResult) => r.state === "calibrated" || r.state === "verified";
  if (ok(a) && ok(b)) return { allowed: true, reason: "both cameras are registered to the site frame." };
  return {
    allowed: false,
    reason: "these cameras are not both registered to the site frame, so a shared coordinate cannot be assumed. positions stay per-camera.",
  };
}
