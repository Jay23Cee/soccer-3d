import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOT_METER_CONFIG } from "./config/gameConfig";

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

function setBallPosition(nextPosition) {
  position = [...nextPosition];
  positionSubscriber?.([...position]);
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

  it("starts at 0%, advances in 1% steps, and releases harder on longer holds", () => {
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

    const firstChargingCall = onShotChargeChange.mock.calls.find(
      ([payload]) => payload.isCharging
    )?.[0];
    expect(firstChargingCall).toMatchObject({ isCharging: true, chargeRatio: 0 });

    nowValue += 360;
    stepFrame();
    nowValue += 180;
    stepFrame();

    const chargingRatios = onShotChargeChange.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.isCharging)
      .map((payload) => payload.chargeRatio);
    for (let index = 1; index < chargingRatios.length; index += 1) {
      expect(chargingRatios[index]).toBeGreaterThanOrEqual(chargingRatios[index - 1]);
      expect(Number.isInteger(Math.round(chargingRatios[index] * 100))).toBe(true);
    }

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

  it("fires one auto-tap when possession starts within the pre-possession window", () => {
    const onKickRelease = vi.fn();
    position = [8, 1.05, 8];

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        playerPosition={[0, 0, 0]}
        playerRotation={[0, 0, 0]}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    nowValue += 150;
    setBallPosition([0, 1.05, 0]);
    stepFrame();
    stepFrame();
    stepFrame();

    expect(onKickRelease).toHaveBeenCalledTimes(1);
    expect(onKickRelease.mock.calls[0][0].chargeRatio).toBeCloseTo(
      SHOT_METER_CONFIG.MIN_CHARGE_RATIO
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });
  });

  it("does not auto-tap when possession starts after the pre-possession window", () => {
    const onKickRelease = vi.fn();
    position = [8, 1.05, 8];

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        playerPosition={[0, 0, 0]}
        playerRotation={[0, 0, 0]}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    nowValue += 260;
    setBallPosition([0, 1.05, 0]);
    stepFrame();
    stepFrame();

    expect(onKickRelease).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });
  });

  it("does not auto-tap if Space is released before possession starts", () => {
    const onKickRelease = vi.fn();
    position = [8, 1.05, 8];

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        playerPosition={[0, 0, 0]}
        playerRotation={[0, 0, 0]}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    nowValue += 90;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });

    nowValue += 40;
    setBallPosition([0, 1.05, 0]);
    stepFrame();
    stepFrame();

    expect(onKickRelease).not.toHaveBeenCalled();
  });
});
