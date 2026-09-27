import { describe, expect, it } from "vitest";
import { evaluateModes, modeById } from "../modes";
import { autoSelect } from "../fusion";
import { missingPrerequisites } from "../worldModel";
import { MODALITY_TOPIC, type SensorDescriptor } from "../types";
import {
  calculateRiskScore,
  type RiskSignalInput,
} from "@/components/dashboard/arvision/eagle/engine";

function sensor(over: Partial<SensorDescriptor>): SensorDescriptor {
  return {
    id: over.id ?? "s1",
    label: over.label ?? "test sensor",
    modality: over.modality ?? "rgb",
    topic: MODALITY_TOPIC[over.modality ?? "rgb"],
    transport: over.transport ?? "browser-media",
    health: over.health ?? "live",
    measurable: over.measurable ?? false,
    calibration: over.calibration ?? { state: "none", detail: "no calibration loaded" },
    ...over,
  } as SensorDescriptor;
}

describe("mode gating", () => {
  it("offers natural when an rgb stream exists", () => {
    const modes = evaluateModes([sensor({ modality: "rgb" })]);
    expect(modes.find((m) => m.mode.id === "natural")?.enabled).toBe(true);
  });

  it("refuses thermal, depth and temperature on a plain webcam", () => {
    const modes = evaluateModes([sensor({ modality: "rgb" })]);
    for (const id of ["thermal", "depth", "temperature"]) {
      const m = modes.find((x) => x.mode.id === id);
      expect(m?.enabled).toBe(false);
      expect(m?.reason && m.reason.length > 0).toBe(true);
    }
  });

  it("refuses temperature on uncalibrated radiometric thermal", () => {
    const modes = evaluateModes([
      sensor({ id: "t", modality: "thermal_radiometric", measurable: true, calibration: { state: "none", detail: "no calibration loaded" } }),
    ]);
    expect(modes.find((m) => m.mode.id === "temperature")?.enabled).toBe(false);
  });

  it("resolves modes by id", () => {
    expect(modeById("natural").id).toBe("natural");
  });
});

describe("auto selection", () => {
  it("never selects a modality that is not connected", () => {
    const picked = autoSelect("darkness_observation", [sensor({ modality: "rgb" })]);
    expect(picked.selected.every((s) => s.modality === "rgb")).toBe(true);
  });
});

describe("world model", () => {
  it("lists prerequisites when nothing spatial is connected", () => {
    expect(missingPrerequisites([], 0).length).toBeGreaterThan(0);
  });
});

describe("event severity never scores people", () => {
  const base: RiskSignalInput = {
    inDangerZone: false,
    inRestrictedZone: false,
    carryingSuspiciousItem: false,
    dwellTimeMs: 0,
    minDwellThresholdMs: 1000,
    interactionCount: 0,
    maxInteractions: 3,
    motionType: "normal",
    repeatedApproachCount: 0,
    handConcealmentActive: false,
    weaponCheckCount: 0,
    armRigidityDetected: false,
    fistClenchingActive: false,
    palmWipingCount: 0,
    rapidScanningActive: false,
    gazeFixationCount: 0,
    cameraAvoidanceDetected: false,
    abandonedObjectDetected: false,
    utilityZoneOccupied: false,
    sameTimeRecurrence: false,
    scoutReturnDetected: false,
    nonSocialCoordination: false,
    distractionActionPair: false,
    targetLockingActive: false,
    confrontationStanceDetected: false,
    escalationChainStep: 0,
    vehicleCirclingDetected: false,
    stationaryRunningVehicle: false,
  };

  it("gives body language and gaze exactly zero weight", () => {
    expect(
      calculateRiskScore({
        ...base,
        handConcealmentActive: true,
        weaponCheckCount: 9,
        armRigidityDetected: true,
        fistClenchingActive: true,
        palmWipingCount: 9,
        rapidScanningActive: true,
        gazeFixationCount: 9,
        cameraAvoidanceDetected: true,
        confrontationStanceDetected: true,
        targetLockingActive: true,
        carryingSuspiciousItem: true,
        escalationChainStep: 9,
      })
    ).toBe(0);
  });

  it("scores an observable event", () => {
    expect(calculateRiskScore({ ...base, abandonedObjectDetected: true })).toBeGreaterThan(0);
  });
});
