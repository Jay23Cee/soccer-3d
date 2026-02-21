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
        teamOnePlayers={[{ playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] }]}
        onShotChargeChange={onShotChargeChange}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
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
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
    });
    stepFrame();

    const tapKick = onKickRelease.mock.calls[0][0];
    expect(tapKick.chargeRatio).toBeGreaterThan(0);

    nowValue += 450;
    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
    });
    nowValue += 900;
    stepFrame();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
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
        teamOnePlayers={[{ playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] }]}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
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
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
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
        teamOnePlayers={[{ playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] }]}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
    });

    nowValue += 260;
    setBallPosition([0, 1.05, 0]);
    stepFrame();
    stepFrame();

    expect(onKickRelease).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
    });
  });

  it("does not auto-tap if D is released before possession starts", () => {
    const onKickRelease = vi.fn();
    position = [8, 1.05, 8];

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        teamOnePlayers={[{ playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] }]}
        onKickRelease={onKickRelease}
      />
    );

    stepFrame();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
    });
    nowValue += 90;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
    });

    nowValue += 40;
    setBallPosition([0, 1.05, 0]);
    stepFrame();
    stepFrame();

    expect(onKickRelease).not.toHaveBeenCalled();
  });

  it("assigns possession to the nearest Team One player", () => {
    const onPossessionChange = vi.fn();
    position = [3.1, 1.05, 0];

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        teamOnePlayers={[
          { playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] },
          { playerId: "player_two", position: [4, 0, 0], rotation: [0, 0, 0] },
        ]}
        onPossessionChange={onPossessionChange}
      />
    );

    stepFrame();

    expect(onPossessionChange).toHaveBeenLastCalledWith({
      teamId: "teamOne",
      playerId: "player_two",
    });
  });

  it("applies and consumes a pass command once", () => {
    const onPassCommandConsumed = vi.fn();
    const passCommand = {
      id: "pass-1",
      fromPlayerId: "player_one",
      toPlayerId: "player_two",
      velocity: [3, 1.2, -4],
      issuedAtMs: 0,
    };

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        teamOnePlayers={[
          { playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] },
          { playerId: "player_two", position: [4, 0, 0], rotation: [0, 0, 0] },
        ]}
        passCommand={passCommand}
        onPassCommandConsumed={onPassCommandConsumed}
      />
    );

    expect(api.velocity.set).toHaveBeenCalledWith(3, 1.2, -4);
    expect(onPassCommandConsumed).toHaveBeenCalledTimes(1);
    expect(onPassCommandConsumed).toHaveBeenCalledWith("pass-1");

    api.velocity.set.mockClear();
    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        teamOnePlayers={[
          { playerId: "player_one", position: [0, 0, 0], rotation: [0, 0, 0] },
          { playerId: "player_two", position: [4, 0, 0], rotation: [0, 0, 0] },
        ]}
        passCommand={passCommand}
        onPassCommandConsumed={onPassCommandConsumed}
      />
    );

    expect(onPassCommandConsumed).toHaveBeenCalledTimes(1);
    expect(api.velocity.set).not.toHaveBeenCalled();
  });
});
