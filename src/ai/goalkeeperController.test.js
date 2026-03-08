import { describe, expect, test } from "vitest";
import {
  createInitialGoalkeeperState,
  GOALKEEPER_STATES,
  updateGoalkeeperController,
} from "./goalkeeperController";

describe("goalkeeperController", () => {
  test("tracks ball laterally in reaction zone", () => {
    const keeper = createInitialGoalkeeperState("teamOne");
    const result = updateGoalkeeperController({
      nowMs: 1200,
      deltaSeconds: 0.1,
      difficulty: "normal",
      keeperState: {
        ...keeper,
        position: [0, 0, 72],
      },
      ballSnapshot: {
        position: [6, 1, 58],
        velocity: [0, 0, 2],
      },
    });

    expect([GOALKEEPER_STATES.TRACK, GOALKEEPER_STATES.INTERCEPT]).toContain(result.mode);
    expect(result.position[0]).not.toBe(0);
  });

  test("issues save request and transitions to distribute", () => {
    const result = updateGoalkeeperController({
      nowMs: 2000,
      deltaSeconds: 0.08,
      difficulty: "normal",
      keeperState: {
        ...createInitialGoalkeeperState("teamTwo"),
        mode: GOALKEEPER_STATES.INTERCEPT,
        position: [0, 0, -71],
        rotation: [0, 0, 0],
      },
      ballSnapshot: {
        position: [0.6, 1.1, -72.2],
        velocity: [0, 0, -6.5],
      },
    });

    expect(result.saveRequested).toBe(true);
    expect(result.mode).toBe(GOALKEEPER_STATES.DISTRIBUTE);
    expect(result.distributeImpulse).toBeTruthy();
  });

  test("ai pace multiplier scales goalkeeper movement distance", () => {
    const keeper = createInitialGoalkeeperState("teamOne");
    const sharedPayload = {
      nowMs: 2800,
      deltaSeconds: 0.1,
      difficulty: "normal",
      keeperState: {
        ...keeper,
        position: [0, 0, 72],
      },
      ballSnapshot: {
        position: [10, 1, 60],
        velocity: [0, 0, 2],
      },
    };

    const slowerResult = updateGoalkeeperController({
      ...sharedPayload,
      aiPaceMultiplier: 0.7,
    });
    const fasterResult = updateGoalkeeperController({
      ...sharedPayload,
      aiPaceMultiplier: 1.1,
    });
    const slowerDistance = Math.hypot(
      slowerResult.position[0] - sharedPayload.keeperState.position[0],
      slowerResult.position[2] - sharedPayload.keeperState.position[2]
    );
    const fasterDistance = Math.hypot(
      fasterResult.position[0] - sharedPayload.keeperState.position[0],
      fasterResult.position[2] - sharedPayload.keeperState.position[2]
    );

    expect(fasterDistance).toBeGreaterThan(slowerDistance);
  });

  test("requests a distribution after holding attached keeper possession", () => {
    const keeper = createInitialGoalkeeperState("teamOne");
    const attachedBallSnapshot = {
      position: [0, 1.1, 72.2],
      velocity: [0, 0, 0],
      mode: "attached",
      possession: {
        teamId: "teamOne",
        playerId: keeper.playerId,
      },
    };

    const holdResult = updateGoalkeeperController({
      nowMs: 1_000,
      deltaSeconds: 0.08,
      difficulty: "normal",
      keeperState: keeper,
      ballSnapshot: attachedBallSnapshot,
    });

    expect(holdResult.mode).toBe(GOALKEEPER_STATES.DISTRIBUTE);
    expect(holdResult.distributionRequested).toBe(false);

    const releaseResult = updateGoalkeeperController({
      nowMs: 1_300,
      deltaSeconds: 0.08,
      difficulty: "normal",
      keeperState: holdResult,
      ballSnapshot: attachedBallSnapshot,
    });

    expect(releaseResult.distributionRequested).toBe(true);
    expect(releaseResult.distributeImpulse).toBeTruthy();
  });
});
