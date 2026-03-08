import {
  DIFFICULTY_PRESETS,
  FIELD_CONFIG,
  GOALKEEPER_CONFIG,
  AI_CONFIG,
  GOALKEEPER_PROFILES,
} from "../config/gameConfig";
import { createGoalkeeperHomeState } from "../match/teamDirections";

export const GOALKEEPER_STATES = {
  IDLE: "idle",
  TRACK: "track",
  INTERCEPT: "intercept",
  SAVE: "save",
  DISTRIBUTE: "distribute",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalize2D(vector) {
  const magnitude = Math.hypot(vector[0], vector[1]);
  if (magnitude <= 0.0001) {
    return [0, 0];
  }

  return [vector[0] / magnitude, vector[1] / magnitude];
}

function yawTowards(from, to) {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function distance2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function difficultyConfig(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS[AI_CONFIG.DEFAULT_DIFFICULTY];
}

function buildDistributionImpulse(goalDirectionSign) {
  return [
    goalDirectionSign > 0 ? -0.2 : 0.2,
    0.15,
    goalDirectionSign > 0
      ? -GOALKEEPER_CONFIG.DISTRIBUTE_IMPULSE
      : GOALKEEPER_CONFIG.DISTRIBUTE_IMPULSE,
  ];
}

function homeStateForTeam(teamId, teamAttackDirections) {
  return createGoalkeeperHomeState(teamId, teamAttackDirections);
}

export function createInitialGoalkeeperState(teamId, options = {}) {
  const profile = GOALKEEPER_PROFILES[teamId] || null;
  const homeState = homeStateForTeam(teamId, options.teamAttackDirections);
  return {
    teamId,
    playerId: profile?.playerId || `keeper-${teamId}`,
    mode: GOALKEEPER_STATES.IDLE,
    homePosition: [...homeState.position],
    homeRotation: [...homeState.rotation],
    position: [...homeState.position],
    rotation: [...homeState.rotation],
    saveCooldownUntilMs: 0,
    distributeUntilMs: 0,
    distributionReleaseAtMs: 0,
  };
}

export function updateGoalkeeperController({
  nowMs,
  deltaSeconds,
  difficulty = AI_CONFIG.DEFAULT_DIFFICULTY,
  aiPaceMultiplier = 1,
  keeperState,
  ballSnapshot,
  teamAttackDirections,
}) {
  const config = difficultyConfig(difficulty);
  const currentState =
    keeperState || createInitialGoalkeeperState("teamOne", { teamAttackDirections });
  const homeState = homeStateForTeam(currentState.teamId, teamAttackDirections);
  const home = Array.isArray(currentState.homePosition)
    ? [...currentState.homePosition]
    : [...homeState.position];
  const homeRotation = Array.isArray(currentState.homeRotation)
    ? [...currentState.homeRotation]
    : [...homeState.rotation];
  const currentPosition = currentState.position || home;
  const currentRotation = currentState.rotation || homeRotation;
  const ballPosition = ballSnapshot?.position || [0, 0, 0];
  const ballVelocity = ballSnapshot?.velocity || [0, 0, 0];
  const keeperHasPossession =
    ballSnapshot?.mode === "attached" && ballSnapshot?.possession?.playerId === currentState.playerId;
  const goalDirectionSign = home[2] >= 0 ? 1 : -1;
  const towardGoalSpeed = ballVelocity[2] * goalDirectionSign;
  const ballDepthDelta = Math.abs(ballPosition[2] - home[2]);
  const ballDistance = distance2D(currentPosition, ballPosition);
  const inReactionZone = ballDepthDelta <= GOALKEEPER_CONFIG.REACTION_DISTANCE && towardGoalSpeed > 0.15;
  const canSave = nowMs >= (currentState.saveCooldownUntilMs || 0);

  let mode = currentState.mode || GOALKEEPER_STATES.IDLE;
  let nextTarget = [...home];
  let saveRequested = false;
  let distributionRequested = false;
  let distributeImpulse = null;
  let saveCooldownUntilMs = currentState.saveCooldownUntilMs || 0;
  let distributeUntilMs = currentState.distributeUntilMs || 0;
  let distributionReleaseAtMs = keeperHasPossession
    ? currentState.distributionReleaseAtMs || 0
    : 0;

  if (!ballSnapshot) {
    mode = GOALKEEPER_STATES.IDLE;
  } else if (keeperHasPossession) {
    mode = GOALKEEPER_STATES.DISTRIBUTE;
    nextTarget = [...home];
    if (distributionReleaseAtMs <= 0) {
      distributionReleaseAtMs = nowMs + GOALKEEPER_CONFIG.POSSESSION_HOLD_MS;
    } else if (nowMs >= distributionReleaseAtMs) {
      distributionRequested = true;
      distributeImpulse = buildDistributionImpulse(goalDirectionSign);
      distributionReleaseAtMs = nowMs + GOALKEEPER_CONFIG.RESET_MS;
    }
  } else if (mode === GOALKEEPER_STATES.DISTRIBUTE && nowMs < distributeUntilMs) {
    mode = GOALKEEPER_STATES.DISTRIBUTE;
    nextTarget = [...home];
  } else if (
    canSave &&
    inReactionZone &&
    ballDistance <= GOALKEEPER_CONFIG.SAVE_RADIUS * config.keeperReachMultiplier
  ) {
    mode = GOALKEEPER_STATES.SAVE;
  } else if (inReactionZone) {
    mode = GOALKEEPER_STATES.INTERCEPT;
  } else if (ballDepthDelta <= GOALKEEPER_CONFIG.REACTION_DISTANCE * 1.5) {
    mode = GOALKEEPER_STATES.TRACK;
  } else {
    mode = GOALKEEPER_STATES.IDLE;
  }

  switch (mode) {
    case GOALKEEPER_STATES.SAVE: {
      saveRequested = true;
      distributionRequested = true;
      saveCooldownUntilMs = nowMs + GOALKEEPER_CONFIG.SAVE_COOLDOWN_MS;
      distributeUntilMs = nowMs + GOALKEEPER_CONFIG.RESET_MS;
      distributionReleaseAtMs = 0;
      mode = GOALKEEPER_STATES.DISTRIBUTE;
      distributeImpulse = buildDistributionImpulse(goalDirectionSign);
      nextTarget = [...home];
      break;
    }
    case GOALKEEPER_STATES.INTERCEPT:
      nextTarget = [
        clamp(ballPosition[0], -GOALKEEPER_CONFIG.LATERAL_LIMIT, GOALKEEPER_CONFIG.LATERAL_LIMIT),
        0,
        home[2] + clamp((ballPosition[2] - home[2]) * 0.25, -3.2, 3.2),
      ];
      break;
    case GOALKEEPER_STATES.TRACK:
      nextTarget = [
        clamp(ballPosition[0], -GOALKEEPER_CONFIG.LATERAL_LIMIT, GOALKEEPER_CONFIG.LATERAL_LIMIT),
        0,
        home[2],
      ];
      break;
    case GOALKEEPER_STATES.DISTRIBUTE:
      nextTarget = [...home];
      break;
    case GOALKEEPER_STATES.IDLE:
    default:
      nextTarget = [...home];
      break;
  }

  const direction = normalize2D([nextTarget[0] - currentPosition[0], nextTarget[2] - currentPosition[2]]);
  const resolvedAiPaceMultiplier = Number.isFinite(aiPaceMultiplier) ? aiPaceMultiplier : 1;
  const keeperSpeed = 17 * config.maxRunSpeedMultiplier * resolvedAiPaceMultiplier;
  const nextPosition = [
    clamp(
      currentPosition[0] + direction[0] * keeperSpeed * deltaSeconds,
      -GOALKEEPER_CONFIG.LATERAL_LIMIT,
      GOALKEEPER_CONFIG.LATERAL_LIMIT
    ),
    0,
    clamp(
      currentPosition[2] + direction[1] * keeperSpeed * deltaSeconds,
      -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 2,
      FIELD_CONFIG.BOUNDARY.Z_LIMIT - 2
    ),
  ];
  const nextYaw = yawTowards(currentPosition, ballPosition);

  return {
    ...currentState,
    mode,
    homePosition: [...home],
    homeRotation: [...homeRotation],
    targetPosition: nextTarget,
    position: nextPosition,
    rotation: [0, Number.isFinite(nextYaw) ? nextYaw : currentRotation[1], 0],
    saveRequested,
    distributionRequested,
    distributeImpulse,
    saveCooldownUntilMs,
    distributeUntilMs,
    distributionReleaseAtMs,
  };
}
