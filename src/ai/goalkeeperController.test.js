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
        position: [0, 0, -72],
      },
      ballSnapshot: {
        position: [6, 1, -58],
        velocity: [0, 0, -2],
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
        position: [0, 0, 71],
        rotation: [0, Math.PI, 0],
      },
      ballSnapshot: {
        position: [0.6, 1.1, 72.2],
        velocity: [0, 0, 6.5],
      },
    });

    expect(result.saveRequested).toBe(true);
    expect(result.mode).toBe(GOALKEEPER_STATES.DISTRIBUTE);
    expect(result.distributeImpulse).toBeTruthy();
  });
});
