import { describe, expect, test } from "vitest";
import {
  createInitialOpponentState,
  OPPONENT_STATES,
  updateOpponentController,
} from "./opponentController";

describe("opponentController", () => {
  test("moves from idle into track when ball is in chase range", () => {
    const initial = createInitialOpponentState();
    const result = updateOpponentController({
      nowMs: 1000,
      deltaSeconds: 0.12,
      difficulty: "normal",
      ballSnapshot: {
        position: [4, 0, -8],
        velocity: [0, 0, 0],
      },
      playerState: {
        position: [0, 0, 14],
      },
      opponentState: {
        ...initial,
        position: [0, 0, -10],
        rotation: [0, Math.PI, 0],
      },
    });

    expect([OPPONENT_STATES.TRACK, OPPONENT_STATES.INTERCEPT]).toContain(result.mode);
    expect(result.nextPosition).not.toEqual([0, 0, -10]);
  });

  test("requests a shot when close to target goal", () => {
    const result = updateOpponentController({
      nowMs: 1800,
      deltaSeconds: 0.12,
      difficulty: "normal",
      ballSnapshot: {
        position: [0.5, 0, -56],
        velocity: [0, 0, -6],
      },
      playerState: {
        position: [2, 0, -40],
      },
      opponentState: {
        ...createInitialOpponentState(),
        mode: OPPONENT_STATES.INTERCEPT,
        position: [0.8, 0, -58],
        rotation: [0, 0, 0],
        shootCooldownUntilMs: 0,
      },
    });

    expect(result.shootRequested).toBe(true);
    expect(result.shotVector).toBeTruthy();
    expect(result.mode).toBe(OPPONENT_STATES.RECOVER);
  });

  test("keeps independent lane anchors when home positions differ", () => {
    const leftHome = [-14, 0, -24];
    const rightHome = [14, 0, -24];
    const sharedBall = {
      position: [0, 0, 30],
      velocity: [0, 0, 0],
    };
    const leftResult = updateOpponentController({
      nowMs: 2400,
      deltaSeconds: 0.12,
      difficulty: "normal",
      homePosition: leftHome,
      ballSnapshot: sharedBall,
      playerState: {
        position: [-4, 0, 12],
      },
      opponentState: {
        ...createInitialOpponentState(leftHome),
        mode: OPPONENT_STATES.TRACK,
        position: [-13, 0, -24],
        rotation: [0, 0, 0],
      },
    });
    const rightResult = updateOpponentController({
      nowMs: 2400,
      deltaSeconds: 0.12,
      difficulty: "normal",
      homePosition: rightHome,
      ballSnapshot: sharedBall,
      playerState: {
        position: [4, 0, 12],
      },
      opponentState: {
        ...createInitialOpponentState(rightHome),
        mode: OPPONENT_STATES.TRACK,
        position: [13, 0, -24],
        rotation: [0, 0, 0],
      },
    });

    expect(leftResult.homePosition).toEqual(leftHome);
    expect(rightResult.homePosition).toEqual(rightHome);
    expect(leftResult.targetPosition[0]).toBeLessThan(0);
    expect(rightResult.targetPosition[0]).toBeGreaterThan(0);
  });
});
