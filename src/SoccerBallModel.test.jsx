import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let frameCallback;
let velocity;
let position;
let velocitySubscriber;
let positionSubscriber;
let nowValue;

const api = {
  position: {
    set: vi.fn(),
    subscribe: vi.fn(),
  },
  velocity: {
    set: vi.fn(),
    subscribe: vi.fn(),
  },
  angularVelocity: {
    set: vi.fn(),
  },
  applyImpulse: vi.fn(),
  applyForce: vi.fn(),
};

const useGLTFMock = vi.fn(() => ({
  scene: {
    clone: () => ({
      traverse: (callback) => {
        callback({
          isMesh: true,
          material: {},
          castShadow: false,
          receiveShadow: false,
        });
      },
    }),
  },
}));
useGLTFMock.preload = vi.fn();

vi.mock("@react-three/cannon", () => ({
  useSphere: () => [React.createRef(), api],
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback) => {
    frameCallback = callback;
  },
}));

vi.mock("@react-three/drei", () => ({
  useGLTF: useGLTFMock,
}));

let SoccerBallModel;

function stepFrame() {
  act(() => {
    frameCallback?.();
  });
}

describe("SoccerBallModel", () => {
  beforeAll(async () => {
    ({ default: SoccerBallModel } = await import("./SoccerBallModel"));
  });

  beforeEach(() => {
    nowValue = 0;
    velocity = [0, 0, 0];
    position = [0, 1.05, 0];
    velocitySubscriber = null;
    positionSubscriber = null;

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockImplementation(() => nowValue);

    api.applyImpulse.mockReset();
    api.applyForce.mockReset();
    api.angularVelocity.set.mockReset();
    api.position.set.mockReset();
    api.velocity.set.mockReset();
    api.position.subscribe.mockReset();
    api.velocity.subscribe.mockReset();

    api.velocity.subscribe.mockImplementation((subscriber) => {
      velocitySubscriber = subscriber;
      subscriber([...velocity]);
      return () => {};
    });
    api.position.subscribe.mockImplementation((subscriber) => {
      positionSubscriber = subscriber;
      subscriber([...position]);
      return () => {};
    });
    api.velocity.set.mockImplementation((x, y, z) => {
      velocity = [x, y, z];
      velocitySubscriber?.([...velocity]);
    });
    api.position.set.mockImplementation((x, y, z) => {
      position = [x, y, z];
      positionSubscriber?.([...position]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits charge updates and releases with higher launch speed on a longer hold", () => {
    const onShotChargeChange = vi.fn();
    const onKickRelease = vi.fn();

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        playerPosition={[0, 0, 0]}
        playerRotation={[0, 0, 0]}
        onShotChargeChange={onShotChargeChange}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    stepFrame();

    expect(onShotChargeChange).toHaveBeenCalledWith(
      expect.objectContaining({ isCharging: true, canShoot: true })
    );

    nowValue += 20;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });
    stepFrame();

    const tapKick = onKickRelease.mock.calls[0][0];
    expect(tapKick.chargeRatio).toBeGreaterThan(0);

    nowValue += 450;
    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    nowValue += 900;
    stepFrame();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });
    stepFrame();

    const holdKick = onKickRelease.mock.calls[1][0];
    expect(holdKick.launchSpeed).toBeGreaterThan(tapKick.launchSpeed);
  });
});
