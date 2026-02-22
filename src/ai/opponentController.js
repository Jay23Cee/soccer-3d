import { AI_CONFIG, DIFFICULTY_PRESETS, FIELD_CONFIG } from "../config/gameConfig";

export const OPPONENT_STATES = {
  IDLE: "idle",
  TRACK: "track",
  INTERCEPT: "intercept",
  SHOOT: "shoot",
  RECOVER: "recover",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function yawTowards(from, to) {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function distance2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function normalize2D(vector) {
  const magnitude = Math.hypot(vector[0], vector[1]);
  if (magnitude <= 0.0001) {
    return [0, 0];
  }

  return [vector[0] / magnitude, vector[1] / magnitude];
}

function resolveTargetGoal(targetGoal) {
  if (
    !Array.isArray(targetGoal) ||
    targetGoal.length < 3 ||
    !Number.isFinite(targetGoal[0]) ||
    !Number.isFinite(targetGoal[1]) ||
    !Number.isFinite(targetGoal[2])
  ) {
    return null;
  }

  return [targetGoal[0], targetGoal[1], targetGoal[2]];
}

function getDifficultyConfig(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS[AI_CONFIG.DEFAULT_DIFFICULTY];
}

export function createInitialOpponentState(homePosition = AI_CONFIG.IDLE_HOME_POSITION) {
  return {
    mode: OPPONENT_STATES.IDLE,
    targetPosition: [...homePosition],
    homePosition: [...homePosition],
    lastTransitionAtMs: 0,
    recoverUntilMs: 0,
    shootCooldownUntilMs: 0,
  };
}

export function updateOpponentController({
  nowMs,
  deltaSeconds,
  difficulty = AI_CONFIG.DEFAULT_DIFFICULTY,
  ballSnapshot,
  playerState,
  opponentState,
  homePosition = null,
  targetGoal = null,
}) {
  const config = getDifficultyConfig(difficulty);
  const resolvedHomePosition = homePosition ||
    opponentState?.homePosition ||
    AI_CONFIG.IDLE_HOME_POSITION;
  const currentPosition = opponentState?.position || resolvedHomePosition;
  const currentRotation = opponentState?.rotation || [0, Math.PI, 0];
  const snapshotPosition = ballSnapshot?.position || [0, 0, 0];
  const resolvedTargetGoal = resolveTargetGoal(targetGoal);
  const defensiveAnchor = [resolvedHomePosition[0], 0, resolvedHomePosition[2] * 0.72];
  const laneBiasX = resolvedHomePosition[0];
  const ballDistance = distance2D(currentPosition, snapshotPosition);
  const playerDistance = distance2D(currentPosition, playerState?.position || [0, 0, 0]);
  const inShootRange = resolvedTargetGoal
    ? Math.abs(currentPosition[2] - resolvedTargetGoal[2]) <= AI_CONFIG.SHOOT_DISTANCE
    : false;
  const canShoot = nowMs >= (opponentState?.shootCooldownUntilMs || 0);
  let mode = opponentState?.mode || OPPONENT_STATES.IDLE;

  if (!ballSnapshot) {
    mode = OPPONENT_STATES.IDLE;
  } else if (mode === OPPONENT_STATES.RECOVER && nowMs < (opponentState?.recoverUntilMs || 0)) {
    mode = OPPONENT_STATES.RECOVER;
  } else if (inShootRange && ballDistance <= config.pressureDistance && canShoot) {
    mode = OPPONENT_STATES.SHOOT;
  } else if (ballDistance <= config.chaseRange * AI_CONFIG.INTERCEPT_WEIGHT) {
    mode = OPPONENT_STATES.INTERCEPT;
  } else if (ballDistance <= config.chaseRange || playerDistance <= config.pressureDistance) {
    mode = OPPONENT_STATES.TRACK;
  } else {
    mode = OPPONENT_STATES.IDLE;
  }

  let targetPosition = [...currentPosition];
  let shotVector = null;
  let shootRequested = false;
  let recoverUntilMs = opponentState?.recoverUntilMs || 0;
  let shootCooldownUntilMs = opponentState?.shootCooldownUntilMs || 0;

  switch (mode) {
    case OPPONENT_STATES.SHOOT: {
      if (!resolvedTargetGoal) {
        mode = OPPONENT_STATES.TRACK;
        break;
      }
      const toGoal = normalize2D([
        resolvedTargetGoal[0] - currentPosition[0],
        resolvedTargetGoal[2] - currentPosition[2],
      ]);
      shotVector = [toGoal[0], 0, toGoal[1]];
      shootRequested = true;
      recoverUntilMs = nowMs + AI_CONFIG.RECOVERY_MS;
      shootCooldownUntilMs = nowMs + Math.max(500, config.reactionMs * 2.2);
      mode = OPPONENT_STATES.RECOVER;
      targetPosition = [
        clamp(currentPosition[0] - toGoal[0] * 2.4, -FIELD_CONFIG.BOUNDARY.X_LIMIT + 2, FIELD_CONFIG.BOUNDARY.X_LIMIT - 2),
        0,
        clamp(currentPosition[2] - toGoal[1] * 2.4, -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 2, FIELD_CONFIG.BOUNDARY.Z_LIMIT - 2),
      ];
      break;
    }
    case OPPONENT_STATES.INTERCEPT:
      targetPosition = [snapshotPosition[0], 0, snapshotPosition[2] - 1.4];
      break;
    case OPPONENT_STATES.TRACK:
      targetPosition = [
        snapshotPosition[0] * 0.7 + laneBiasX * 0.3,
        0,
        clamp(snapshotPosition[2] * 0.65, defensiveAnchor[2], FIELD_CONFIG.BOUNDARY.Z_LIMIT - 4),
      ];
      break;
    case OPPONENT_STATES.RECOVER:
      targetPosition = [...defensiveAnchor];
      break;
    case OPPONENT_STATES.IDLE:
    default:
      targetPosition = [...resolvedHomePosition];
      break;
  }

  const speedBase = 20 * config.maxRunSpeedMultiplier;
  const direction = [targetPosition[0] - currentPosition[0], targetPosition[2] - currentPosition[2]];
  const norm = normalize2D(direction);
  const nextX = clamp(
    currentPosition[0] + norm[0] * speedBase * deltaSeconds,
    -FIELD_CONFIG.BOUNDARY.X_LIMIT + 2,
    FIELD_CONFIG.BOUNDARY.X_LIMIT - 2
  );
  const nextZ = clamp(
    currentPosition[2] + norm[1] * speedBase * deltaSeconds,
    -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 2,
    FIELD_CONFIG.BOUNDARY.Z_LIMIT - 2
  );
  const nextPosition = [nextX, 0, nextZ];
  const nextYaw = yawTowards(currentPosition, targetPosition);
  const nextRotation = [0, Number.isFinite(nextYaw) ? nextYaw : currentRotation[1], 0];

  return {
    mode,
    targetPosition,
    homePosition: [...resolvedHomePosition],
    nextPosition,
    nextRotation,
    shootRequested,
    shotVector,
    recoverUntilMs,
    shootCooldownUntilMs,
    lastTransitionAtMs: mode === opponentState?.mode ? opponentState?.lastTransitionAtMs || nowMs : nowMs,
  };
}
