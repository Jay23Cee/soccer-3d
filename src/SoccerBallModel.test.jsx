import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BALL_CONFIG, SHOT_METER_CONFIG } from "./config/gameConfig";

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

const BASE_PLAYERS = [
  {
    playerId: "player_one",
    teamId: "teamOne",
    role: "striker",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  {
    playerId: "player_two",
    teamId: "teamOne",
    role: "support",
    position: [4, 0, 0],
    rotation: [0, 0, 0],
  },
  {
    playerId: "opponent_one",
    teamId: "teamTwo",
    role: "striker",
    position: [8, 0, 0],
    rotation: [0, Math.PI, 0],
  },
];

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

    const { unmount } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
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
    }

    nowValue += 20;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
    });

    const tapKick = onKickRelease.mock.calls[0][0];
    expect(tapKick.chargeRatio).toBeGreaterThan(0);

    unmount();
    const onKickReleaseHold = vi.fn();
    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onShotChargeChange={onShotChargeChange}
        onKickRelease={onKickReleaseHold}
      />
    );

    stepFrame();
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

    const holdKick = onKickReleaseHold.mock.calls[0][0];
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
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
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

    expect(onKickRelease).toHaveBeenCalledTimes(1);
    expect(onKickRelease.mock.calls[0][0].chargeRatio).toBeCloseTo(
      SHOT_METER_CONFIG.MIN_CHARGE_RATIO
    );
  });

  it("supports symmetric possession for both teams", () => {
    const onTeamOnePossession = vi.fn();

    const { unmount } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onPossessionChange={onTeamOnePossession}
      />
    );

    stepFrame();
    expect(onTeamOnePossession).toHaveBeenLastCalledWith({
      teamId: "teamOne",
      playerId: "player_one",
    });

    position = [8, 1.05, 0];
    const onTeamTwoPossession = vi.fn();
    unmount();
    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onPossessionChange={onTeamTwoPossession}
      />
    );
    stepFrame();

    expect(onTeamTwoPossession).toHaveBeenLastCalledWith({
      teamId: "teamTwo",
      playerId: "opponent_one",
    });
  });

  it("rejects invalid or non-possessor ball action commands safely", () => {
    const onBallActionResolved = vi.fn();

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
      />
    );

    stepFrame();

    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
        ballActionCommand={{
          id: "shot-invalid",
          actorId: "unknown-player",
          teamId: "teamTwo",
          type: "shot",
          targetPlayerId: null,
          targetPosition: [0, 0, 78],
          power: 1,
        }}
      />
    );

    expect(onBallActionResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "shot-invalid", accepted: false })
    );

    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
        ballActionCommand={{
          id: "shot-opponent",
          actorId: "opponent_one",
          teamId: "teamTwo",
          type: "shot",
          targetPlayerId: null,
          targetPosition: [0, 0, 78],
          power: 1,
        }}
      />
    );

    expect(onBallActionResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "shot-opponent", accepted: false })
    );
  });

  it("executes a legal pass action once and clears possession", () => {
    const onBallActionResolved = vi.fn();
    const onPossessionChange = vi.fn();

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
        onPossessionChange={onPossessionChange}
      />
    );

    stepFrame();
    api.velocity.set.mockClear();

    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
        onPossessionChange={onPossessionChange}
        ballActionCommand={{
          id: "pass-1",
          actorId: "player_one",
          teamId: "teamOne",
          type: "pass",
          targetPlayerId: "player_two",
          targetPosition: [4, 0, 0],
          power: 1,
        }}
      />
    );

    expect(api.velocity.set).toHaveBeenCalled();
    expect(onBallActionResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "pass-1", accepted: true, targetPlayerId: "player_two" })
    );
    expect(onPossessionChange).toHaveBeenLastCalledWith(null);

    api.velocity.set.mockClear();
    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
        onPossessionChange={onPossessionChange}
        ballActionCommand={{
          id: "pass-1",
          actorId: "player_one",
          teamId: "teamOne",
          type: "pass",
          targetPlayerId: "player_two",
          targetPosition: [4, 0, 0],
          power: 1,
        }}
      />
    );

    expect(api.velocity.set).not.toHaveBeenCalled();
  });

  it("stages a center kickoff and accepts the designated taker without prior possession", () => {
    const kickoffRef = { current: null };
    const onBallActionResolved = vi.fn();
    const kickoffPlayers = [
      {
        playerId: "opponent_one",
        teamId: "teamTwo",
        role: "striker",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      {
        playerId: "opponent_two",
        teamId: "teamTwo",
        role: "support",
        position: [0, 0, -8],
        rotation: [0, 0, 0],
      },
      {
        playerId: "player_one",
        teamId: "teamOne",
        role: "striker",
        position: [-6, 0, 22],
        rotation: [0, Math.PI, 0],
      },
    ];

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={kickoffRef}
        controlsEnabled={false}
        playerControlsEnabled
        players={kickoffPlayers}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
      />
    );

    act(() => {
      kickoffRef.current?.({
        id: "setup-kickoff",
        teamId: "teamTwo",
        takerId: "opponent_one",
        spotPosition: [0, 0, 0],
      });
    });

    expect(api.position.set).toHaveBeenLastCalledWith(0, 1.02, 0);

    api.velocity.set.mockClear();
    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={kickoffRef}
        controlsEnabled={false}
        playerControlsEnabled
        players={kickoffPlayers}
        controlledPlayerId="player_one"
        onBallActionResolved={onBallActionResolved}
        ballActionCommand={{
          id: "kickoff-opponent_one-opponent_two-1",
          actorId: "opponent_one",
          teamId: "teamTwo",
          type: "pass",
          targetPlayerId: "opponent_two",
          targetPosition: [0, 0, -8],
          power: 1,
        }}
      />
    );

    expect(api.velocity.set).toHaveBeenCalled();
    expect(onBallActionResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "kickoff-opponent_one-opponent_two-1", accepted: true })
    );
  });

  it("uses mapMovementKeyToForce callback for ball directional input", () => {
    const mapMovementKeyToForce = vi.fn(() => [3, 0, 4]);

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled
        mapMovementKeyToForce={mapMovementKeyToForce}
        players={BASE_PLAYERS}
      />
    );

    api.applyForce.mockClear();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });
    stepFrame();

    expect(mapMovementKeyToForce).toHaveBeenCalledWith("ArrowUp", BALL_CONFIG.FORCE);
    expect(api.applyForce).toHaveBeenCalledWith([3, 0, 4], [0, 0, 0]);
  });

  it("suppresses out-of-bounds callback during replay", () => {
    const onOutOfBounds = vi.fn();

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        replayActive
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onOutOfBounds={onOutOfBounds}
      />
    );

    setBallPosition([200, 0, 0]);
    stepFrame();

    expect(onOutOfBounds).not.toHaveBeenCalled();
  });

  it("suppresses power-zone callback during replay", () => {
    const onPowerZoneEnter = vi.fn();

    render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        replayActive
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        activePowerZone={{
          id: "zone-replay",
          type: "speed",
          color: "#1dd75f",
          radius: 7,
          position: [0, 0],
        }}
        onPowerZoneEnter={onPowerZoneEnter}
      />
    );

    setBallPosition([0, 1, 0]);
    stepFrame();

    expect(onPowerZoneEnter).not.toHaveBeenCalled();
  });
});
