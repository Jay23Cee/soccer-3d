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

function latestCameraState(spy) {
  return spy.mock.calls.at(-1)?.[0] || null;
}

function distanceBetween(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

  it("uses replay mode telemetry and follows replay frame camera target", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.REPLAY}
        ballPosition={[0, 0, 0]}
        playerPositions={[[0, 0, 0]]}
        goalkeeperPositions={[[0, 0, 0]]}
        replayFrame={{
          ball: { position: [4, 1, -6] },
          cameraTarget: [18, 7, -14],
        }}
        isReplay
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={onCameraStateChange}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(0.2 + step * 0.05);
    }

    const replayState = latestCameraState(onCameraStateChange);
    expect(replayState.mode).toBe(CAMERA_CONFIG.MODES.REPLAY);
    expect(replayState.target[0]).toBeCloseTo(18, 0);
    expect(replayState.target[1]).toBeCloseTo(7, 0);
    expect(replayState.target[2]).toBeCloseTo(-14, 0);
  });

  it("applies tighter framing during goal replays", () => {
    const saveReplayStateChange = vi.fn();
    const saveReplayCamera = createMockCamera();
    const saveReplayRender = render(
      <CameraDirector
        cameraRef={{ current: saveReplayCamera }}
        mode={CAMERA_CONFIG.MODES.REPLAY}
        ballPosition={[8, 1, -12]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={{
          ball: { position: [8, 1, -12] },
          cameraTarget: [6, 7, -10],
        }}
        isReplay
        replayEventType="save"
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={saveReplayStateChange}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(0.2 + step * 0.05);
    }

    const saveReplayState = latestCameraState(saveReplayStateChange);
    saveReplayRender.unmount();

    const goalReplayStateChange = vi.fn();
    const goalReplayCamera = createMockCamera();
    render(
      <CameraDirector
        cameraRef={{ current: goalReplayCamera }}
        mode={CAMERA_CONFIG.MODES.REPLAY}
        ballPosition={[8, 1, -12]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={{
          ball: { position: [8, 1, -12] },
          cameraTarget: [6, 7, -10],
        }}
        isReplay
        replayEventType="goal"
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={goalReplayStateChange}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(2 + step * 0.05);
    }

    const goalReplayState = latestCameraState(goalReplayStateChange);
    expect(goalReplayState.fov).toBeLessThan(saveReplayState.fov);
    expect(distanceBetween(goalReplayState.position, goalReplayState.target)).toBeLessThan(
      distanceBetween(saveReplayState.position, saveReplayState.target)
    );
  });

  it("keeps non-goal replays on the existing framing", () => {
    const baselineReplayStateChange = vi.fn();
    const baselineReplayCamera = createMockCamera();
    const baselineReplayRender = render(
      <CameraDirector
        cameraRef={{ current: baselineReplayCamera }}
        mode={CAMERA_CONFIG.MODES.REPLAY}
        ballPosition={[8, 1, -12]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={{
          ball: { position: [8, 1, -12] },
          cameraTarget: [6, 7, -10],
        }}
        isReplay
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={baselineReplayStateChange}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(0.2 + step * 0.05);
    }

    const baselineReplayState = latestCameraState(baselineReplayStateChange);
    baselineReplayRender.unmount();

    const saveReplayStateChange = vi.fn();
    const saveReplayCamera = createMockCamera();
    render(
      <CameraDirector
        cameraRef={{ current: saveReplayCamera }}
        mode={CAMERA_CONFIG.MODES.REPLAY}
        ballPosition={[8, 1, -12]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={{
          ball: { position: [8, 1, -12] },
          cameraTarget: [6, 7, -10],
        }}
        isReplay
        replayEventType="save"
        introProgress={0}
        gameState="in_play"
        onCameraStateChange={saveReplayStateChange}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(2 + step * 0.05);
    }

    const saveReplayState = latestCameraState(saveReplayStateChange);
    expect(saveReplayState.fov).toBeCloseTo(baselineReplayState.fov, 1);
    expect(distanceBetween(saveReplayState.position, baselineReplayState.position)).toBeLessThan(1);
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

  it("uses the landing hero camera target and drifts over midfield while idle", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.LANDING_HERO}
        ballPosition={[0, 0, 0]}
        playerPositions={[[0, 0, 0]]}
        goalkeeperPositions={[[0, 0, 0]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="idle"
        onCameraStateChange={onCameraStateChange}
      />
    );

    for (let step = 0; step < 30; step += 1) {
      tickFrame(0.2 + step * 0.08);
    }

    const firstLandingState = latestCameraState(onCameraStateChange);

    for (let step = 0; step < 30; step += 1) {
      tickFrame(4 + step * 0.08);
    }

    const laterLandingState = latestCameraState(onCameraStateChange);
    expect(laterLandingState.mode).toBe(CAMERA_CONFIG.MODES.LANDING_HERO);
    expect(laterLandingState.target[0]).toBeCloseTo(CAMERA_CONFIG.LANDING_HERO.TARGET[0], 0);
    expect(laterLandingState.target[1]).toBeCloseTo(CAMERA_CONFIG.LANDING_HERO.TARGET[1], 0);
    expect(laterLandingState.target[2]).toBeCloseTo(CAMERA_CONFIG.LANDING_HERO.TARGET[2], 0);
    expect(distanceBetween(firstLandingState.position, laterLandingState.position)).toBeGreaterThan(2);
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

  it("keeps the full-time end orbit centered on the presentation target while orbiting", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.END_ORBIT}
        ballPosition={[12, 0, -18]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="ended"
        onCameraStateChange={onCameraStateChange}
      />
    );

    for (let step = 0; step < 36; step += 1) {
      tickFrame(0.2 + step * 0.08);
    }
    const firstOrbitState = latestCameraState(onCameraStateChange);

    for (let step = 0; step < 36; step += 1) {
      tickFrame(4 + step * 0.08);
    }
    const laterOrbitState = latestCameraState(onCameraStateChange);

    expect(laterOrbitState.mode).toBe(CAMERA_CONFIG.MODES.END_ORBIT);
    expect(laterOrbitState.target[0]).toBeCloseTo(CAMERA_CONFIG.END_PRESENTATION.TARGET[0], 0);
    expect(laterOrbitState.target[1]).toBeCloseTo(CAMERA_CONFIG.END_PRESENTATION.TARGET[1], 0);
    expect(laterOrbitState.target[2]).toBeCloseTo(CAMERA_CONFIG.END_PRESENTATION.TARGET[2], 0);
    expect(distanceBetween(firstOrbitState.position, laterOrbitState.position)).toBeGreaterThan(8);
  });

  it("keeps the full-time camera static for reduced-motion users", () => {
    const onCameraStateChange = vi.fn();
    const camera = createMockCamera();

    render(
      <CameraDirector
        cameraRef={{ current: camera }}
        mode={CAMERA_CONFIG.MODES.END_ORBIT}
        ballPosition={[12, 0, -18]}
        playerPositions={[[0, 0, 0], [18, 0, 12]]}
        goalkeeperPositions={[[0, 0, -70], [0, 0, 70]]}
        replayFrame={null}
        isReplay={false}
        introProgress={0}
        gameState="ended"
        prefersReducedMotion
        onCameraStateChange={onCameraStateChange}
      />
    );

    for (let step = 0; step < 40; step += 1) {
      tickFrame(0.2 + step * 0.08);
    }
    const firstStaticState = latestCameraState(onCameraStateChange);

    for (let step = 0; step < 40; step += 1) {
      tickFrame(5 + step * 0.08);
    }
    const laterStaticState = latestCameraState(onCameraStateChange);

    expect(laterStaticState.mode).toBe(CAMERA_CONFIG.MODES.END_ORBIT);
    expect(laterStaticState.target[0]).toBeCloseTo(CAMERA_CONFIG.END_PRESENTATION.TARGET[0], 0);
    expect(laterStaticState.target[1]).toBeCloseTo(CAMERA_CONFIG.END_PRESENTATION.TARGET[1], 0);
    expect(laterStaticState.target[2]).toBeCloseTo(CAMERA_CONFIG.END_PRESENTATION.TARGET[2], 0);
    expect(distanceBetween(laterStaticState.position, firstStaticState.position)).toBeLessThan(1.5);
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
