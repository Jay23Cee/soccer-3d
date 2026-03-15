import { GOALKEEPER_STATES } from "./ai/goalkeeperController";
import { OUTFIELD_STATES } from "./ai/outfieldController";

/**
 * @typedef {"idle" | "track" | "run" | "shoot" | "intercept" | "save" | "distribute" | "celebrate"} PlayerAnimationState
 */

export const PLAYER_ANIMATION_STATES = Object.freeze({
  IDLE: "idle",
  TRACK: "track",
  RUN: "run",
  SHOOT: "shoot",
  INTERCEPT: "intercept",
  SAVE: "save",
  DISTRIBUTE: "distribute",
  CELEBRATE: "celebrate",
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {PlayerAnimationState} [animationState=PLAYER_ANIMATION_STATES.IDLE]
 * @param {number} [animationBlend=0]
 * @param {number} [celebrationLevel=0]
 */
export function buildPlayerPose(
  animationState = PLAYER_ANIMATION_STATES.IDLE,
  animationBlend = 0,
  celebrationLevel = 0
) {
  const blend = clamp(animationBlend || 0, 0, 1);
  const celebration = clamp(celebrationLevel || 0, 0, 1);
  const pose = {
    torsoTilt: 0,
    leftLeg: 0,
    rightLeg: 0,
    leftArm: 0,
    rightArm: 0,
    bodyLift: celebration * 0.08,
  };

  switch (animationState) {
    case PLAYER_ANIMATION_STATES.TRACK:
      pose.leftLeg = 0.22 * Math.max(0.45, blend);
      pose.rightLeg = -0.22 * Math.max(0.45, blend);
      pose.leftArm = -0.18 * Math.max(0.45, blend);
      pose.rightArm = 0.18 * Math.max(0.45, blend);
      pose.torsoTilt = 0.08 * blend;
      break;
    case PLAYER_ANIMATION_STATES.INTERCEPT:
      pose.leftLeg = 0.42 * Math.max(0.45, blend);
      pose.rightLeg = -0.18 * Math.max(0.45, blend);
      pose.leftArm = -0.34 * Math.max(0.45, blend);
      pose.rightArm = 0.28 * Math.max(0.45, blend);
      pose.torsoTilt = 0.18 * blend;
      break;
    case PLAYER_ANIMATION_STATES.SHOOT:
      pose.leftLeg = 0.16;
      pose.rightLeg = -0.92 * Math.max(0.45, blend);
      pose.leftArm = -0.42;
      pose.rightArm = 0.38;
      pose.torsoTilt = 0.28 * Math.max(0.6, blend);
      break;
    case PLAYER_ANIMATION_STATES.SAVE:
      pose.leftLeg = 0.24;
      pose.rightLeg = 0.24;
      pose.leftArm = -1.22 * Math.max(0.45, blend);
      pose.rightArm = 1.22 * Math.max(0.45, blend);
      pose.torsoTilt = 0.3 * blend;
      break;
    case PLAYER_ANIMATION_STATES.DISTRIBUTE:
      pose.leftLeg = 0.08;
      pose.rightLeg = -0.28 * Math.max(0.45, blend);
      pose.leftArm = -0.22 * Math.max(0.45, blend);
      pose.rightArm = 0.78 * Math.max(0.45, blend);
      pose.torsoTilt = 0.2 * blend;
      break;
    case PLAYER_ANIMATION_STATES.CELEBRATE:
      pose.leftLeg = 0.18 * celebration;
      pose.rightLeg = 0.18 * celebration;
      pose.leftArm = -1.02 * celebration;
      pose.rightArm = 1.02 * celebration;
      pose.torsoTilt = -0.12 * celebration;
      pose.bodyLift = 0.18 * celebration;
      break;
    case PLAYER_ANIMATION_STATES.RUN:
      pose.leftLeg = 0.42 * Math.max(0.45, blend);
      pose.rightLeg = -0.42 * Math.max(0.45, blend);
      pose.leftArm = -0.38 * Math.max(0.45, blend);
      pose.rightArm = 0.38 * Math.max(0.45, blend);
      pose.torsoTilt = 0.16 * blend;
      break;
    case PLAYER_ANIMATION_STATES.IDLE:
    default:
      pose.leftLeg = 0.05;
      pose.rightLeg = -0.05;
      pose.leftArm = -0.08;
      pose.rightArm = 0.08;
      pose.torsoTilt = 0.03;
      break;
  }

  return pose;
}

/**
 * @param {{
 *   isCharging?: boolean,
 *   playerControlsEnabled?: boolean,
 *   sprintLocked?: boolean,
 *   isSprintHeld?: boolean,
 * }} options
 * @returns {PlayerAnimationState}
 */
export function resolveControlledPlayerAnimationState({
  isCharging = false,
  playerControlsEnabled = false,
  sprintLocked = false,
  isSprintHeld = false,
}) {
  if (isCharging) {
    return PLAYER_ANIMATION_STATES.SHOOT;
  }

  if (playerControlsEnabled && !sprintLocked && isSprintHeld) {
    return PLAYER_ANIMATION_STATES.RUN;
  }

  return PLAYER_ANIMATION_STATES.TRACK;
}

/**
 * @param {{ mode?: string } | null | undefined} outfieldAiState
 * @returns {PlayerAnimationState}
 */
export function resolveOutfieldAnimationState(outfieldAiState) {
  if (!outfieldAiState?.mode) {
    return PLAYER_ANIMATION_STATES.IDLE;
  }

  switch (outfieldAiState.mode) {
    case OUTFIELD_STATES.SHOOT:
    case OUTFIELD_STATES.PASS:
      return PLAYER_ANIMATION_STATES.SHOOT;
    case OUTFIELD_STATES.PRESS:
      return PLAYER_ANIMATION_STATES.INTERCEPT;
    case OUTFIELD_STATES.CARRY:
    case OUTFIELD_STATES.SUPPORT:
    case OUTFIELD_STATES.RECEIVE:
      return PLAYER_ANIMATION_STATES.TRACK;
    case OUTFIELD_STATES.RECOVER:
      return PLAYER_ANIMATION_STATES.RUN;
    case OUTFIELD_STATES.HOLD_SHAPE:
    default:
      return PLAYER_ANIMATION_STATES.IDLE;
  }
}

/**
 * @param {string | undefined} mode
 * @returns {PlayerAnimationState}
 */
export function resolveGoalkeeperAnimationState(mode) {
  switch (mode) {
    case GOALKEEPER_STATES.DISTRIBUTE:
      return PLAYER_ANIMATION_STATES.DISTRIBUTE;
    case GOALKEEPER_STATES.INTERCEPT:
      return PLAYER_ANIMATION_STATES.INTERCEPT;
    case GOALKEEPER_STATES.SAVE:
      return PLAYER_ANIMATION_STATES.SAVE;
    case GOALKEEPER_STATES.TRACK:
      return PLAYER_ANIMATION_STATES.TRACK;
    case GOALKEEPER_STATES.IDLE:
    default:
      return PLAYER_ANIMATION_STATES.IDLE;
  }
}
