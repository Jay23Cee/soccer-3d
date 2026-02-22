import React from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CAMERA_CONFIG } from "../config/gameConfig";

let frameCallback;

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback) => {
    frameCallback = callback;
  },
}));

import CameraDirector from "./CameraDirector";

function tickFrame(elapsedTimeSeconds) {
  act(() => {
    frameCallback?.({
      clock: {
        elapsedTime: elapsedTimeSeconds,
      },
    });
  });
}

function createMockCamera() {
  return {
    position: {
      set: vi.fn(),
    },
    lookAt: vi.fn(),
    fov: 0,
    updateProjectionMatrix: vi.fn(),
  };
}

describe("CameraDirector", () => {
  it("throttles camera state emission to roughly 100ms", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.BUILD_UP}
        ballPosition={[0, 0, 0]}
        playerPositions={[[0, 0, 0]]}
        goalkeeperPositions={[[0, 0, 0]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={onCameraStateChange}
      />
    );

    tickFrame(0.2);
    tickFrame(0.25);
    tickFrame(0.35);

    expect(onCameraStateChange).toHaveBeenCalledTimes(2);
    expect(camera.position.set).toHaveBeenCalled();
    expect(camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it("emits replay camera mode when replay is active", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.BUILD_UP}
        ballPosition={[0, 0, 0]}
        playerPositions={[[0, 0, 0]]}
        goalkeeperPositions={[[0, 0, 0]]}
        replayFrame={{ ball: { position: [4, 1, -6] } }}
        isReplay
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={onCameraStateChange}
      />
    );

    tickFrame(0.2);

    expect(onCameraStateChange).toHaveBeenCalledTimes(1);
    expect(onCameraStateChange.mock.calls[0][0].mode).toBe(CAMERA_CONFIG.MODES.REPLAY);
  });
});
