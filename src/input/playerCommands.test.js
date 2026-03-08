import { describe, expect, test } from "vitest";
import { PLAYER_LOB_CLEAR_CONFIG, TEAM_IDS } from "../config/gameConfig";
import {
  buildLobClearCommand,
  buildPassCommand,
  buildRestartPassCommand,
  buildTackleCommand,
} from "./playerCommands";

describe("playerCommands", () => {
  test("builds a team one pass command", () => {
    expect(
      buildPassCommand({
        actorId: "player_one",
        receiverId: "player_two",
        receiverPosition: [6, 0, 12],
        nowMs: 1234,
      })
    ).toMatchObject({
      id: "pass-player_one-player_two-1234",
      actorId: "player_one",
      teamId: TEAM_IDS.TEAM_ONE,
      type: "pass",
      targetPlayerId: "player_two",
      targetPosition: [6, 0, 12],
    });
  });

  test("builds restart pass commands with the restart type prefix", () => {
    expect(
      buildRestartPassCommand({
        type: "throw_in",
        actorId: "opponent_one",
        receiverId: "opponent_two",
        receiverPosition: [12, 0, 18],
        nowMs: 2222,
        teamId: TEAM_IDS.TEAM_TWO,
      })
    ).toMatchObject({
      id: "throw_in-opponent_one-opponent_two-2222",
      teamId: TEAM_IDS.TEAM_TWO,
      type: "pass",
    });
  });

  test("builds lob clear commands from the actor facing direction", () => {
    const command = buildLobClearCommand({
      actorId: "player_one",
      actorPosition: [4, 0, 10],
      actorRotation: [0, Math.PI / 2, 0],
      nowMs: 2800,
    });

    expect(command).toMatchObject({
      id: "lob-clear-player_one-2800",
      actorId: "player_one",
      teamId: TEAM_IDS.TEAM_ONE,
      type: "lob_clear",
      targetPlayerId: null,
      power: PLAYER_LOB_CLEAR_CONFIG.POWER,
    });
    expect(command.targetPosition[0]).toBeCloseTo(4 + PLAYER_LOB_CLEAR_CONFIG.TARGET_DISTANCE);
    expect(command.targetPosition[1]).toBe(0);
    expect(command.targetPosition[2]).toBeCloseTo(10);
  });

  test("builds tackle commands for the controlled team", () => {
    expect(
      buildTackleCommand({
        actorId: "player_one",
        carrierId: "opponent_one",
        nowMs: 3456,
      })
    ).toEqual({
      id: "tackle-player_one-3456",
      actorId: "player_one",
      teamId: TEAM_IDS.TEAM_ONE,
      carrierId: "opponent_one",
    });
  });
});
