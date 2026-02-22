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
  const position = {
    x: 12,
    y: 28,
    z: 44,
    set: vi.fn((x, y, z) => {
      position.x = x;
      position.y = y;
      position.z = z;
    }),
  };

  return {
    position,
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

  it("keeps user-selected camera mode when replay is active", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.BROADCAST_WIDE}
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
    expect(onCameraStateChange.mock.calls[0][0].mode).toBe(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
  });

  it("does not force camera position while in free roam mode", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.FREE_ROAM}
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

    expect(camera.position.set).not.toHaveBeenCalled();
    expect(onCameraStateChange).toHaveBeenCalledTimes(1);
    expect(onCameraStateChange.mock.calls[0][0].mode).toBe(CAMERA_CONFIG.MODES.FREE_ROAM);
  });

  it("emits broadcast-wide mode and updates camera transforms", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.BROADCAST_WIDE}
        ballPosition={[8, 1, -12]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={onCameraStateChange}
      />
    );

    tickFrame(0.2);
    tickFrame(0.35);

    expect(camera.position.set).toHaveBeenCalled();
    expect(onCameraStateChange).toHaveBeenCalled();
    expect(onCameraStateChange.mock.calls.at(-1)[0].mode).toBe(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
  });

  it("places goal-line camera on opposite sides for opposite attacking directions", () => {
    const onCameraStateChangePositive = vi.fn();
    const positiveCamera = createMockCamera();
    const positiveRender = render(
      <CameraDirector
        cameraRef={{ current: positiveCamera }}
        mode={CAMERA_CONFIG.MODES.GOAL_LINE}
        ballPosition={[0, 0, 42]}
        playerPositions={[[0, 0, 0]]}
        goalkeeperPositions={[[0, 0, 0]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={onCameraStateChangePositive}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(0.2 + step * 0.05);
    }

    const positiveZ = onCameraStateChangePositive.mock.calls.at(-1)[0].position[2];
    positiveRender.unmount();

    const onCameraStateChangeNegative = vi.fn();
    const negativeCamera = createMockCamera();
    render(
      <CameraDirector
        cameraRef={{ current: negativeCamera }}
        mode={CAMERA_CONFIG.MODES.GOAL_LINE}
        ballPosition={[0, 0, -42]}
        playerPositions={[[0, 0, 0]]}
        goalkeeperPositions={[[0, 0, 0]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={onCameraStateChangeNegative}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(2 + step * 0.05);
    }

    const negativeZ = onCameraStateChangeNegative.mock.calls.at(-1)[0].position[2];
    expect(positiveZ).toBeGreaterThan(0);
    expect(negativeZ).toBeLessThan(0);
  });
});
