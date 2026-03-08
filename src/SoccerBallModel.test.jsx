import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BALL_CONFIG, PLAYER_TACKLE_CONFIG, SHOT_METER_CONFIG } from "./config/gameConfig";

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

const TACKLE_READY_PLAYERS = [
  {
    playerId: "player_one",
    teamId: "teamOne",
    role: "striker",
    position: [0.2, 0, 10.6],
    rotation: [0, Math.PI, 0],
  },
  {
    playerId: "player_two",
    teamId: "teamOne",
    role: "support",
    position: [7.5, 0, 18],
    rotation: [0, Math.PI, 0],
  },
  {
    playerId: "opponent_one",
    teamId: "teamTwo",
    role: "striker",
    position: [0, 0, 8.9],
    rotation: [0, 0, 0],
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

  it("supports attached reset staging for scenario setup", () => {
    const resetRef = { current: null };
    const onPossessionChange = vi.fn();

    render(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onPossessionChange={onPossessionChange}
      />
    );

    stepFrame();

    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    expect(onPossessionChange).toHaveBeenLastCalledWith({
      teamId: "teamTwo",
      playerId: "opponent_one",
    });
  });

  it("keeps attached goalkeeper possession protected from contest steals", () => {
    const resetRef = { current: null };
    const onPossessionChange = vi.fn();
    const keeperPlayers = [
      {
        playerId: "keeper-team-one",
        teamId: "teamOne",
        role: "goalkeeper",
        position: [0, 0, 0],
        rotation: [0, Math.PI, 0],
      },
      {
        playerId: "player_one",
        teamId: "teamOne",
        role: "striker",
        position: [-4, 0, 0],
        rotation: [0, Math.PI, 0],
      },
      {
        playerId: "opponent_one",
        teamId: "teamTwo",
        role: "striker",
        position: [0.45, 0, 0.45],
        rotation: [0, 0, 0],
      },
    ];

    render(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={keeperPlayers}
        controlledPlayerId="player_one"
        onPossessionChange={onPossessionChange}
      />
    );

    stepFrame();

    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "keeper-team-one",
      });
    });

    expect(onPossessionChange).toHaveBeenLastCalledWith({
      teamId: "teamOne",
      playerId: "keeper-team-one",
    });

    onPossessionChange.mockClear();
    nowValue += 220;
    stepFrame();
    stepFrame();

    expect(onPossessionChange).not.toHaveBeenCalled();
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

  it("launches lob clears higher and farther than ground passes", () => {
    const baseProps = {
      scale: 1,
      resetRef: { current: null },
      kickoffRef: { current: null },
      controlsEnabled: false,
      playerControlsEnabled: true,
      players: BASE_PLAYERS,
      controlledPlayerId: "player_one",
    };

    const passRender = render(<SoccerBallModel {...baseProps} />);
    stepFrame();
    api.velocity.set.mockClear();

    passRender.rerender(
      <SoccerBallModel
        {...baseProps}
        ballActionCommand={{
          id: "pass-physics",
          actorId: "player_one",
          teamId: "teamOne",
          type: "pass",
          targetPlayerId: "player_two",
          targetPosition: [4, 0, 0],
          power: 1,
        }}
      />
    );

    const passVector = api.velocity.set.mock.calls.at(-1);
    passRender.unmount();

    velocity = [0, 0, 0];
    position = [0, 1.05, 0];
    velocitySubscriber = null;
    positionSubscriber = null;
    api.velocity.set.mockClear();

    const lobRender = render(<SoccerBallModel {...baseProps} />);
    stepFrame();
    api.velocity.set.mockClear();

    lobRender.rerender(
      <SoccerBallModel
        {...baseProps}
        ballActionCommand={{
          id: "lob-physics",
          actorId: "player_one",
          teamId: "teamOne",
          type: "lob_clear",
          targetPlayerId: null,
          targetPosition: [0, 0, 26],
          power: 1.08,
        }}
      />
    );

    const lobVector = api.velocity.set.mock.calls.at(-1);

    expect(lobVector[1]).toBeGreaterThan(passVector[1]);
    expect(Math.hypot(lobVector[0], lobVector[2])).toBeGreaterThan(
      Math.hypot(passVector[0], passVector[2])
    );
  });

  it("keeps released shots above the loose-ball max speed cap", () => {
    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
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
        ballActionCommand={{
          id: "shot-fast",
          actorId: "player_one",
          teamId: "teamOne",
          type: "shot",
          targetPlayerId: null,
          targetPosition: [0, 0, 78],
          power: 1.35,
        }}
      />
    );

    stepFrame();

    expect(Math.hypot(velocity[0], velocity[1], velocity[2])).toBeGreaterThan(BALL_CONFIG.MAX_SPEED);
  });

  it("dampens the first bounce for lofted released balls", () => {
    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={{ current: null }}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
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
        ballActionCommand={{
          id: "lob-bounce",
          actorId: "player_one",
          teamId: "teamOne",
          type: "lob_clear",
          targetPlayerId: null,
          targetPosition: [0, 0, 28],
          power: 1.08,
        }}
      />
    );

    nowValue += 260;
    velocity = [10, -2, 0];
    velocitySubscriber?.([...velocity]);
    setBallPosition([0, 1.05, 0]);
    stepFrame();

    api.velocity.set.mockClear();
    nowValue += 80;
    velocity = [10, 1.2, 0];
    velocitySubscriber?.([...velocity]);
    setBallPosition([0, 1.05, 0]);
    stepFrame();

    const bouncedVelocity = api.velocity.set.mock.calls.at(-1);
    expect(bouncedVelocity[0]).toBeLessThan(10);
    expect(bouncedVelocity[1]).toBeLessThan(1.2);
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

  it("releases the ball into a loose state on a successful tackle", () => {
    const resetRef = { current: null };
    const onTackleResolved = vi.fn();
    const onPossessionChange = vi.fn();
    const onBallSnapshot = vi.fn();
    const baseProps = {
      scale: 1,
      resetRef,
      kickoffRef: { current: null },
      controlsEnabled: false,
      playerControlsEnabled: true,
      players: TACKLE_READY_PLAYERS,
      controlledPlayerId: "player_one",
      controlledTeamId: "teamOne",
      onTackleResolved,
      onPossessionChange,
      onBallSnapshot,
    };

    const { rerender } = render(<SoccerBallModel {...baseProps} />);

    stepFrame();

    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    api.velocity.set.mockClear();
    rerender(
      <SoccerBallModel
        {...baseProps}
        tackleCommand={{
          id: "tackle-success",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    expect(onTackleResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "tackle-success", accepted: true, carrierId: "opponent_one" })
    );
    expect(onPossessionChange).toHaveBeenLastCalledWith(null);
    expect(api.velocity.set).toHaveBeenCalled();

    nowValue += 34;
    stepFrame();

    const lastSnapshot = onBallSnapshot.mock.calls.at(-1)?.[0];
    expect(lastSnapshot.mode).toBe("released");
    expect(lastSnapshot.possession).toBeNull();
    expect(lastSnapshot.velocity[1]).toBeGreaterThan(0);
  });

  it("rejects tackles when the carrier is out of range", () => {
    const resetRef = { current: null };
    const onTackleResolved = vi.fn();
    const onPossessionChange = vi.fn();
    const farPlayers = [
      {
        ...TACKLE_READY_PLAYERS[0],
        position: [0.2, 0, 13.8],
      },
      TACKLE_READY_PLAYERS[1],
      TACKLE_READY_PLAYERS[2],
    ];

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={farPlayers}
        controlledPlayerId="player_one"
        controlledTeamId="teamOne"
        onTackleResolved={onTackleResolved}
        onPossessionChange={onPossessionChange}
      />
    );

    stepFrame();
    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={farPlayers}
        controlledPlayerId="player_one"
        controlledTeamId="teamOne"
        onTackleResolved={onTackleResolved}
        onPossessionChange={onPossessionChange}
        tackleCommand={{
          id: "tackle-out-of-range",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    expect(onTackleResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "tackle-out-of-range", accepted: false })
    );
    expect(onPossessionChange).toHaveBeenLastCalledWith({
      teamId: "teamTwo",
      playerId: "opponent_one",
    });
  });

  it("rejects tackles when the controlled player is not facing the carrier", () => {
    const resetRef = { current: null };
    const onTackleResolved = vi.fn();
    const onPossessionChange = vi.fn();
    const wrongFacingPlayers = [
      {
        ...TACKLE_READY_PLAYERS[0],
        rotation: [0, 0, 0],
      },
      TACKLE_READY_PLAYERS[1],
      TACKLE_READY_PLAYERS[2],
    ];

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={wrongFacingPlayers}
        controlledPlayerId="player_one"
        controlledTeamId="teamOne"
        onTackleResolved={onTackleResolved}
        onPossessionChange={onPossessionChange}
      />
    );

    stepFrame();
    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={wrongFacingPlayers}
        controlledPlayerId="player_one"
        controlledTeamId="teamOne"
        onTackleResolved={onTackleResolved}
        onPossessionChange={onPossessionChange}
        tackleCommand={{
          id: "tackle-wrong-facing",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    expect(onTackleResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "tackle-wrong-facing", accepted: false })
    );
    expect(onPossessionChange).toHaveBeenLastCalledWith({
      teamId: "teamTwo",
      playerId: "opponent_one",
    });
  });

  it("rejects tackles while replay is active", () => {
    const resetRef = { current: null };
    const onTackleResolved = vi.fn();

    const { rerender } = render(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        replayActive
        players={TACKLE_READY_PLAYERS}
        controlledPlayerId="player_one"
        controlledTeamId="teamOne"
        onTackleResolved={onTackleResolved}
      />
    );

    stepFrame();
    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    rerender(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        replayActive
        players={TACKLE_READY_PLAYERS}
        controlledPlayerId="player_one"
        controlledTeamId="teamOne"
        onTackleResolved={onTackleResolved}
        tackleCommand={{
          id: "tackle-replay",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    expect(onTackleResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "tackle-replay", accepted: false })
    );
  });

  it("rejects immediate follow-up tackles while the tackle cooldown is active", () => {
    const resetRef = { current: null };
    const onTackleResolved = vi.fn();
    const wrongFacingPlayers = [
      {
        ...TACKLE_READY_PLAYERS[0],
        rotation: [0, 0, 0],
      },
      TACKLE_READY_PLAYERS[1],
      TACKLE_READY_PLAYERS[2],
    ];
    const baseProps = {
      scale: 1,
      resetRef,
      kickoffRef: { current: null },
      controlsEnabled: false,
      playerControlsEnabled: true,
      controlledPlayerId: "player_one",
      controlledTeamId: "teamOne",
      onTackleResolved,
    };

    const { rerender } = render(
      <SoccerBallModel
        {...baseProps}
        players={wrongFacingPlayers}
      />
    );

    stepFrame();
    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    rerender(
      <SoccerBallModel
        {...baseProps}
        players={wrongFacingPlayers}
        tackleCommand={{
          id: "tackle-cooldown-1",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    rerender(
      <SoccerBallModel
        {...baseProps}
        players={TACKLE_READY_PLAYERS}
        tackleCommand={{
          id: "tackle-cooldown-2",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    expect(onTackleResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "tackle-cooldown-2", accepted: false })
    );

    nowValue += PLAYER_TACKLE_CONFIG.COOLDOWN_MS + 1;
    rerender(
      <SoccerBallModel
        {...baseProps}
        players={TACKLE_READY_PLAYERS}
        tackleCommand={{
          id: "tackle-cooldown-3",
          actorId: "player_one",
          teamId: "teamOne",
          carrierId: "opponent_one",
        }}
      />
    );

    expect(onTackleResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "tackle-cooldown-3", accepted: true })
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

  it("reports out-of-bounds payload with the most recent touch", () => {
    const resetRef = { current: null };
    const onOutOfBounds = vi.fn();

    render(
      <SoccerBallModel
        scale={1}
        resetRef={resetRef}
        kickoffRef={{ current: null }}
        controlsEnabled={false}
        playerControlsEnabled
        players={BASE_PLAYERS}
        controlledPlayerId="player_one"
        onOutOfBounds={onOutOfBounds}
      />
    );

    stepFrame();
    act(() => {
      resetRef.current?.({
        attach: true,
        actorId: "opponent_one",
      });
    });

    setBallPosition([200, 0, 0]);
    stepFrame();

    expect(onOutOfBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "attached",
        lastTouch: {
          teamId: "teamTwo",
          playerId: "opponent_one",
        },
      })
    );
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
