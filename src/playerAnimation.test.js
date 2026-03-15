import { describe, expect, it } from "vitest";
import { GOALKEEPER_STATES } from "./ai/goalkeeperController";
import { OUTFIELD_STATES } from "./ai/outfieldController";
import {
  buildPlayerPose,
  PLAYER_ANIMATION_STATES,
  resolveControlledPlayerAnimationState,
  resolveGoalkeeperAnimationState,
  resolveOutfieldAnimationState,
} from "./playerAnimation";

describe("playerAnimation", () => {
  it("uses a neutral idle pose instead of falling through to the run pose", () => {
    const idlePose = buildPlayerPose(PLAYER_ANIMATION_STATES.IDLE, 1, 0);
    const runPose = buildPlayerPose(PLAYER_ANIMATION_STATES.RUN, 1, 0);

    expect(idlePose).toMatchObject({
      torsoTilt: 0.03,
      leftLeg: 0.05,
      rightLeg: -0.05,
      leftArm: -0.08,
      rightArm: 0.08,
    });
    expect(runPose).toMatchObject({
      torsoTilt: 0.16,
      leftLeg: 0.42,
      rightLeg: -0.42,
      leftArm: -0.38,
      rightArm: 0.38,
    });
  });

  it("uses stronger shoot and save poses for the arcade silhouette", () => {
    const shootPose = buildPlayerPose(PLAYER_ANIMATION_STATES.SHOOT, 1, 0);
    const savePose = buildPlayerPose(PLAYER_ANIMATION_STATES.SAVE, 1, 0);

    expect(shootPose).toMatchObject({
      torsoTilt: 0.28,
      leftLeg: 0.16,
      rightLeg: -0.92,
      leftArm: -0.42,
      rightArm: 0.38,
    });
    expect(savePose).toMatchObject({
      torsoTilt: 0.3,
      leftLeg: 0.24,
      rightLeg: 0.24,
      leftArm: -1.22,
      rightArm: 1.22,
    });
  });

  it("falls back to the idle pose for unknown animation states", () => {
    const idlePose = buildPlayerPose(PLAYER_ANIMATION_STATES.IDLE, 0.6, 0);
    const fallbackPose = buildPlayerPose("unexpected-state", 0.6, 0);

    expect(fallbackPose).toEqual(idlePose);
  });

  it("resolves controlled player states to shoot, run, or track", () => {
    expect(
      resolveControlledPlayerAnimationState({
        isCharging: true,
        playerControlsEnabled: true,
        sprintLocked: false,
        isSprintHeld: true,
      })
    ).toBe(PLAYER_ANIMATION_STATES.SHOOT);

    expect(
      resolveControlledPlayerAnimationState({
        isCharging: false,
        playerControlsEnabled: true,
        sprintLocked: false,
        isSprintHeld: true,
      })
    ).toBe(PLAYER_ANIMATION_STATES.RUN);

    expect(
      resolveControlledPlayerAnimationState({
        isCharging: false,
        playerControlsEnabled: true,
        sprintLocked: true,
        isSprintHeld: true,
      })
    ).toBe(PLAYER_ANIMATION_STATES.TRACK);
  });

  it("maps every outfield mode to an explicit shared animation state", () => {
    expect(resolveOutfieldAnimationState(null)).toBe(PLAYER_ANIMATION_STATES.IDLE);
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.HOLD_SHAPE })).toBe(
      PLAYER_ANIMATION_STATES.IDLE
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.CARRY })).toBe(
      PLAYER_ANIMATION_STATES.TRACK
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.SUPPORT })).toBe(
      PLAYER_ANIMATION_STATES.TRACK
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.RECEIVE })).toBe(
      PLAYER_ANIMATION_STATES.TRACK
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.PRESS })).toBe(
      PLAYER_ANIMATION_STATES.INTERCEPT
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.RECOVER })).toBe(
      PLAYER_ANIMATION_STATES.RUN
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.PASS })).toBe(
      PLAYER_ANIMATION_STATES.SHOOT
    );
    expect(resolveOutfieldAnimationState({ mode: OUTFIELD_STATES.SHOOT })).toBe(
      PLAYER_ANIMATION_STATES.SHOOT
    );
  });

  it("maps goalkeeper track mode explicitly instead of falling through to idle", () => {
    expect(resolveGoalkeeperAnimationState(GOALKEEPER_STATES.IDLE)).toBe(
      PLAYER_ANIMATION_STATES.IDLE
    );
    expect(resolveGoalkeeperAnimationState(GOALKEEPER_STATES.TRACK)).toBe(
      PLAYER_ANIMATION_STATES.TRACK
    );
    expect(resolveGoalkeeperAnimationState(GOALKEEPER_STATES.INTERCEPT)).toBe(
      PLAYER_ANIMATION_STATES.INTERCEPT
    );
    expect(resolveGoalkeeperAnimationState(GOALKEEPER_STATES.SAVE)).toBe(
      PLAYER_ANIMATION_STATES.SAVE
    );
    expect(resolveGoalkeeperAnimationState(GOALKEEPER_STATES.DISTRIBUTE)).toBe(
      PLAYER_ANIMATION_STATES.DISTRIBUTE
    );
  });
});
