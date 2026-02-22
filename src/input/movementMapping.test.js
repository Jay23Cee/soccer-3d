import { describe, expect, it } from "vitest";
import { CAMERA_CONFIG } from "../config/gameConfig";
import {
  MOVEMENT_MAPPING_MODES,
  buildCameraPlanarBasis,
  getAutoMappingForCamera,
  mapArrowStateToWorldDirection,
  mapSingleArrowKeyToWorldForce,
  resolveEffectiveMappingMode,
} from "./movementMapping";

describe("movementMapping", () => {
  it("resolves auto mapping by camera mode", () => {
    expect(getAutoMappingForCamera(CAMERA_CONFIG.MODES.FREE_ROAM)).toBe(MOVEMENT_MAPPING_MODES.WORLD);
    expect(getAutoMappingForCamera(CAMERA_CONFIG.MODES.BROADCAST_WIDE)).toBe(
      MOVEMENT_MAPPING_MODES.CAMERA
    );
    expect(getAutoMappingForCamera("unknown-mode")).toBe(MOVEMENT_MAPPING_MODES.WORLD);
  });

  it("respects explicit mapping overrides", () => {
    expect(
      resolveEffectiveMappingMode(MOVEMENT_MAPPING_MODES.CAMERA, CAMERA_CONFIG.MODES.FREE_ROAM)
    ).toBe(MOVEMENT_MAPPING_MODES.CAMERA);
    expect(
      resolveEffectiveMappingMode(MOVEMENT_MAPPING_MODES.WORLD, CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST)
    ).toBe(MOVEMENT_MAPPING_MODES.WORLD);
  });

  it("maps world-relative arrow input using global axes", () => {
    const direction = mapArrowStateToWorldDirection(
      {
        ArrowUp: true,
        ArrowLeft: true,
      },
      {
        overrideMode: MOVEMENT_MAPPING_MODES.WORLD,
        cameraMode: CAMERA_CONFIG.MODES.BROADCAST_WIDE,
      }
    );

    expect(direction[0]).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(direction[1]).toBe(0);
    expect(direction[2]).toBeCloseTo(-Math.SQRT1_2, 5);
  });

  it("maps camera-relative input using camera planar basis", () => {
    const direction = mapArrowStateToWorldDirection(
      {
        ArrowUp: true,
      },
      {
        overrideMode: MOVEMENT_MAPPING_MODES.CAMERA,
        cameraMode: CAMERA_CONFIG.MODES.BROADCAST_WIDE,
        cameraState: {
          position: [0, 20, 0],
          target: [12, 0, 0],
        },
      }
    );

    expect(direction).toEqual([1, 0, 0]);
  });

  it("falls back to world basis when camera planar direction is degenerate", () => {
    const basis = buildCameraPlanarBasis({
      position: [10, 10, 10],
      target: [10, 2, 10],
    });
    expect(basis.forward).toEqual([0, 0, -1]);
    expect(basis.right).toEqual([1, 0, 0]);

    const force = mapSingleArrowKeyToWorldForce("ArrowUp", 9, {
      overrideMode: MOVEMENT_MAPPING_MODES.CAMERA,
      cameraMode: CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST,
      cameraState: {
        position: [10, 10, 10],
        target: [10, 2, 10],
      },
    });
    expect(force).toEqual([0, 0, -9]);
  });
});
