import { describe, expect, test } from "vitest";
import { TEAM_IDS } from "../config/gameConfig";
import {
  BALL_ZONES,
  createInitialOutfieldAiState,
  OUTFIELD_ASSIGNMENTS,
  OUTFIELD_STATES,
  updateOutfieldController,
} from "./outfieldController";

function createActor(overrides = {}) {
  return {
    playerId: "opponent_one",
    teamId: TEAM_IDS.TEAM_TWO,
    role: "striker",
    attackLane: -1,
    spawnPosition: [-10, 0, -18],
    spawnRotation: [0, 0, 0],
    baseRunSpeed: 30,
    ...overrides,
  };
}

function createPlayerState(overrides = {}) {
  return {
    position: [-10, 0, -18],
    rotation: [0, 0, 0],
    stamina: 100,
    sprintLocked: false,
    ...overrides,
  };
}

function createTeamContext(overrides = {}) {
  return {
    primaryPresserId: "opponent_one",
    secondaryCoverId: "opponent_two",
    supportRunnerId: "opponent_two",
    ballZone: BALL_ZONES.MIDFIELD,
    possessionStartMs: 0,
    actionLocks: {},
    ...overrides,
  };
}

describe("outfieldController", () => {
  test("carrier passes when a forward lane is open", () => {
    const result = updateOutfieldController({
      nowMs: 1200,
      deltaSeconds: 0.12,
      difficulty: "normal",
      actor: createActor(),
      playerState: createPlayerState({ position: [-8, 0, 30] }),
      aiState: createInitialOutfieldAiState([-10, 0, -18]),
      teammates: [
        {
          playerId: "opponent_two",
          teamId: TEAM_IDS.TEAM_TWO,
          role: "support",
          attackLane: 1,
          spawnPosition: [12, 0, -18],
          spawnRotation: [0, 0, 0],
          baseRunSpeed: 29,
          position: [12, 0, 42],
          rotation: [0, 0, 0],
        },
      ],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [-4, 0, 8],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [-8, 1.1, 30],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_one",
      },
      teamContext: createTeamContext({
        supportRunnerId: "opponent_two",
        ballZone: BALL_ZONES.ATTACKING_THIRD,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect(result.mode).toBe(OUTFIELD_STATES.PASS);
    expect(result.assignment).toBe(OUTFIELD_ASSIGNMENTS.CARRIER);
    expect(result.actionCommand).toMatchObject({
      actorId: "opponent_one",
      type: "pass",
      targetPlayerId: "opponent_two",
    });
  });

  test("carrier shoots only when inside valid range", () => {
    const result = updateOutfieldController({
      nowMs: 2400,
      deltaSeconds: 0.12,
      difficulty: "hard",
      actor: createActor(),
      playerState: createPlayerState({ position: [0.8, 0, 58] }),
      aiState: createInitialOutfieldAiState([-10, 0, -18]),
      teammates: [],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [10, 0, 34],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [0.8, 1.1, 58],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_one",
      },
      teamContext: createTeamContext({
        supportRunnerId: "opponent_two",
        ballZone: BALL_ZONES.ATTACKING_THIRD,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect(result.mode).toBe(OUTFIELD_STATES.SHOOT);
    expect(result.assignment).toBe(OUTFIELD_ASSIGNMENTS.CARRIER);
    expect(result.actionCommand).toMatchObject({
      actorId: "opponent_one",
      type: "shot",
    });
  });

  test("off-ball players press when defending and support when attacking", () => {
    const actor = createActor();
    const playerState = createPlayerState();

    const defending = updateOutfieldController({
      nowMs: 3200,
      deltaSeconds: 0.12,
      difficulty: "normal",
      actor,
      playerState,
      aiState: createInitialOutfieldAiState(actor.spawnPosition),
      teammates: [],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [2, 0, 12],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [2, 1, 12],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_ONE,
        playerId: "player_one",
      },
      teamContext: createTeamContext({
        primaryPresserId: "opponent_one",
        secondaryCoverId: "opponent_two",
        ballZone: BALL_ZONES.DEFENSIVE_THIRD,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    const attacking = updateOutfieldController({
      nowMs: 3600,
      deltaSeconds: 0.12,
      difficulty: "normal",
      actor,
      playerState,
      aiState: createInitialOutfieldAiState(actor.spawnPosition),
      teammates: [
        {
          playerId: "opponent_two",
          teamId: TEAM_IDS.TEAM_TWO,
          role: "support",
          attackLane: 1,
          spawnPosition: [12, 0, -18],
          spawnRotation: [0, 0, 0],
          baseRunSpeed: 29,
          position: [12, 0, 10],
          rotation: [0, 0, 0],
        },
      ],
      opponents: [],
      ballSnapshot: {
        position: [12, 1, 10],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_two",
      },
      teamContext: createTeamContext({
        supportRunnerId: "opponent_one",
        ballZone: BALL_ZONES.MIDFIELD,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect([OUTFIELD_STATES.PRESS, OUTFIELD_STATES.RECOVER]).toContain(defending.mode);
    expect([OUTFIELD_STATES.SUPPORT, OUTFIELD_STATES.RECEIVE]).toContain(attacking.mode);
  });

  test("team one auto teammates stay out of restricted offensive states", () => {
    const result = updateOutfieldController({
      nowMs: 4200,
      deltaSeconds: 0.12,
      difficulty: "hard",
      actor: createActor({
        playerId: "player_two",
        teamId: TEAM_IDS.TEAM_ONE,
        role: "support",
        attackLane: 1,
        spawnPosition: [6, 0, 22],
        spawnRotation: [0, Math.PI, 0],
        baseRunSpeed: 30,
      }),
      playerState: createPlayerState({
        position: [0.5, 0, -56],
        rotation: [0, Math.PI, 0],
      }),
      aiState: createInitialOutfieldAiState([6, 0, 22]),
      teammates: [],
      opponents: [],
      ballSnapshot: {
        position: [0.5, 1.1, -56],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_ONE,
        playerId: "player_two",
      },
      targetGoal: [0, 0, -78],
      ownGoal: [0, 0, 78],
      isControlledPlayer: false,
    });

    expect([
      OUTFIELD_STATES.HOLD_SHAPE,
      OUTFIELD_STATES.SUPPORT,
      OUTFIELD_STATES.RECEIVE,
      OUTFIELD_STATES.RECOVER,
    ]).toContain(result.mode);
    expect(result.actionCommand).toBeNull();
  });

  test("support runner makes a diagonal run ahead of the carrier", () => {
    const result = updateOutfieldController({
      nowMs: 5_100,
      deltaSeconds: 0.12,
      difficulty: "hard",
      actor: createActor({
        playerId: "opponent_two",
        attackLane: 1,
        spawnPosition: [12, 0, -18],
      }),
      playerState: createPlayerState({
        position: [9, 0, 20],
        rotation: [0, 0, 0],
      }),
      aiState: createInitialOutfieldAiState([12, 0, -18]),
      teammates: [
        {
          ...createActor(),
          position: [-4, 0, 26],
          rotation: [0, 0, 0],
        },
      ],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [2, 0, 10],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [-4, 1.1, 26],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_one",
      },
      teamContext: createTeamContext({
        supportRunnerId: "opponent_two",
        ballZone: BALL_ZONES.MIDFIELD,
        possessionStartMs: 4_800,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect(result.assignment).toBe(OUTFIELD_ASSIGNMENTS.SUPPORT_RUN);
    expect([OUTFIELD_STATES.SUPPORT, OUTFIELD_STATES.RECEIVE]).toContain(result.mode);
    expect(result.targetPosition[2]).toBeGreaterThan(26);
    expect(result.targetPosition[0]).toBeGreaterThan(6);
  });

  test("secondary defender tucks inside the passing lane while teammate presses", () => {
    const result = updateOutfieldController({
      nowMs: 5_600,
      deltaSeconds: 0.12,
      difficulty: "normal",
      actor: createActor({
        playerId: "opponent_two",
        attackLane: 1,
        spawnPosition: [12, 0, -18],
      }),
      playerState: createPlayerState({
        position: [10, 0, -8],
        rotation: [0, 0, 0],
      }),
      aiState: createInitialOutfieldAiState([12, 0, -18]),
      teammates: [
        {
          ...createActor(),
          position: [-2, 0, 6],
          rotation: [0, 0, 0],
        },
      ],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [6, 0, 14],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [6, 1.1, 14],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_ONE,
        playerId: "player_one",
      },
      teamContext: createTeamContext({
        primaryPresserId: "opponent_one",
        secondaryCoverId: "opponent_two",
        ballZone: BALL_ZONES.DEFENSIVE_THIRD,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect(result.assignment).toBe(OUTFIELD_ASSIGNMENTS.SECONDARY_COVER);
    expect(result.mode).toBe(OUTFIELD_STATES.RECOVER);
    expect(result.targetPosition[2]).toBeLessThan(14);
    expect(Math.abs(result.targetPosition[0])).toBeLessThan(10);
  });

  test("hard difficulty shoots earlier while easy keeps carrying", () => {
    const sharedPayload = {
      nowMs: 6_000,
      deltaSeconds: 0.12,
      actor: createActor(),
      playerState: createPlayerState({ position: [1.2, 0, 56] }),
      aiState: createInitialOutfieldAiState([-10, 0, -18]),
      teammates: [
        {
          playerId: "opponent_two",
          teamId: TEAM_IDS.TEAM_TWO,
          role: "support",
          attackLane: 1,
          spawnPosition: [12, 0, -18],
          spawnRotation: [0, 0, 0],
          baseRunSpeed: 29,
          position: [14, 0, 60],
          rotation: [0, 0, 0],
        },
      ],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [8, 0, 40],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [1.2, 1.1, 56],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_one",
      },
      teamContext: createTeamContext({
        supportRunnerId: "opponent_two",
        ballZone: BALL_ZONES.ATTACKING_THIRD,
        possessionStartMs: 5_700,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    };

    const easyResult = updateOutfieldController({
      ...sharedPayload,
      difficulty: "easy",
    });
    const hardResult = updateOutfieldController({
      ...sharedPayload,
      difficulty: "hard",
    });

    expect(easyResult.mode).toBe(OUTFIELD_STATES.CARRY);
    expect(hardResult.mode).toBe(OUTFIELD_STATES.SHOOT);
    expect(hardResult.actionCommand).toMatchObject({
      type: "shot",
    });
  });

  test("ai pace multiplier scales outfield movement distance", () => {
    const sharedPayload = {
      nowMs: 7_200,
      deltaSeconds: 0.12,
      difficulty: "normal",
      actor: createActor(),
      playerState: createPlayerState({ position: [-10, 0, -18] }),
      aiState: createInitialOutfieldAiState([-10, 0, -18]),
      teammates: [],
      opponents: [
        {
          playerId: "player_one",
          teamId: TEAM_IDS.TEAM_ONE,
          position: [-2, 0, -2],
          rotation: [0, Math.PI, 0],
        },
      ],
      ballSnapshot: {
        position: [-2, 1.1, -2],
        velocity: [0, 0, 0],
      },
      possessionState: {
        teamId: TEAM_IDS.TEAM_ONE,
        playerId: "player_one",
      },
      teamContext: createTeamContext({
        primaryPresserId: "opponent_one",
        secondaryCoverId: "opponent_two",
        ballZone: BALL_ZONES.MIDFIELD,
      }),
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    };

    const slowerResult = updateOutfieldController({
      ...sharedPayload,
      aiPaceMultiplier: 0.7,
    });
    const fasterResult = updateOutfieldController({
      ...sharedPayload,
      aiPaceMultiplier: 1.1,
    });
    const slowerDistance = Math.hypot(
      slowerResult.nextPosition[0] - sharedPayload.playerState.position[0],
      slowerResult.nextPosition[2] - sharedPayload.playerState.position[2]
    );
    const fasterDistance = Math.hypot(
      fasterResult.nextPosition[0] - sharedPayload.playerState.position[0],
      fasterResult.nextPosition[2] - sharedPayload.playerState.position[2]
    );

    expect(fasterDistance).toBeGreaterThan(slowerDistance);
  });
});
