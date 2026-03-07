import { describe, expect, test } from "vitest";
import { TEAM_IDS } from "../config/gameConfig";
import {
  createInitialOutfieldAiState,
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
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect(result.mode).toBe(OUTFIELD_STATES.PASS);
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
      targetGoal: [0, 0, 78],
      ownGoal: [0, 0, -78],
    });

    expect(result.mode).toBe(OUTFIELD_STATES.SHOOT);
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
});
