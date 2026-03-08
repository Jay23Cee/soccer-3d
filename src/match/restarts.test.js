import { describe, expect, test } from "vitest";
import { TEAM_IDS } from "../config/gameConfig";
import {
  RESTART_TYPES,
  classifyOutOfBoundsRestart,
  createRestartSetup,
} from "./restarts";

describe("restart rules", () => {
  test("awards a throw-in to the non-touching team on sideline exits", () => {
    const restart = classifyOutOfBoundsRestart({
      position: [72, 1, 18],
      lastTouch: {
        teamId: TEAM_IDS.TEAM_ONE,
        playerId: "player_one",
      },
    });

    expect(restart).toMatchObject({
      type: RESTART_TYPES.THROW_IN,
      teamId: TEAM_IDS.TEAM_TWO,
    });
    expect(restart.spotPosition[0]).toBeGreaterThan(0);
  });

  test("awards a goal kick when the attacking team last touched over the goal line", () => {
    const restart = classifyOutOfBoundsRestart({
      position: [6, 1, 88],
      lastTouch: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_one",
      },
    });

    expect(restart).toMatchObject({
      type: RESTART_TYPES.GOAL_KICK,
      teamId: TEAM_IDS.TEAM_ONE,
    });
    expect(restart.spotPosition[2]).toBeGreaterThan(0);
  });

  test("awards a corner when the defending team last touched over the goal line", () => {
    const restart = classifyOutOfBoundsRestart({
      position: [-10, 1, -87],
      lastTouch: {
        teamId: TEAM_IDS.TEAM_TWO,
        playerId: "opponent_one",
      },
    });

    expect(restart).toMatchObject({
      type: RESTART_TYPES.CORNER_KICK,
      teamId: TEAM_IDS.TEAM_ONE,
    });
    expect(restart.spotPosition[0]).toBeLessThan(0);
    expect(restart.spotPosition[2]).toBeLessThan(0);
  });

  test("creates restart setup with staged taker and receiver positions", () => {
    const restartSetup = createRestartSetup({
      type: RESTART_TYPES.THROW_IN,
      teamId: TEAM_IDS.TEAM_TWO,
      spotPosition: [56, 0, 20],
    });

    expect(restartSetup).toMatchObject({
      type: RESTART_TYPES.THROW_IN,
      teamId: TEAM_IDS.TEAM_TWO,
      takerId: "opponent_one",
      receiverId: "opponent_two",
    });
    expect(restartSetup.playerStates.opponent_one.position).toEqual(restartSetup.spotPosition);
    expect(restartSetup.playerStates.opponent_two.position).toEqual(restartSetup.receiverPosition);
  });

  test("supports keeper punt restarts with explicit taker and receiver overrides", () => {
    const restartSetup = createRestartSetup({
      type: RESTART_TYPES.KEEPER_PUNT,
      teamId: TEAM_IDS.TEAM_ONE,
      takerId: "keeper-team-one",
      receiverId: "player_two",
      receiverPosition: [12, 0, 28],
      spotPosition: [0, 0, 69],
      teamAttackDirections: {
        teamOne: -1,
        teamTwo: 1,
      },
    });

    expect(restartSetup).toMatchObject({
      type: RESTART_TYPES.KEEPER_PUNT,
      teamId: TEAM_IDS.TEAM_ONE,
      takerId: "keeper-team-one",
      receiverId: "player_two",
      spotPosition: [0, 0, 69],
      receiverPosition: [12, 0, 28],
    });
    expect(restartSetup.playerStates.player_two.position).toEqual([12, 0, 28]);
  });
});
