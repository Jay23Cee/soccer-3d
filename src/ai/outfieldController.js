import { AI_CONFIG, DIFFICULTY_PRESETS, FIELD_CONFIG, TEAM_IDS } from "../config/gameConfig";

export const OUTFIELD_STATES = {
  HOLD_SHAPE: "hold_shape",
  PRESS: "press",
  SUPPORT: "support",
  RECEIVE: "receive",
  CARRY: "carry",
  PASS: "pass",
  SHOOT: "shoot",
  RECOVER: "recover",
};

export const CPU_PHASES = {
  BUILD: "build",
  PRESS: "press",
  TRANSITION: "transition",
  ATTACK: "attack",
  RECOVER: "recover",
  DEFEND_SHAPE: "defend_shape",
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

function distance2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function yawTowards(from, to) {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function difficultyConfig(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;
}

function clampFieldPosition(position) {
  return [
    clamp(position[0], -FIELD_CONFIG.BOUNDARY.X_LIMIT + 2, FIELD_CONFIG.BOUNDARY.X_LIMIT - 2),
    0,
    clamp(position[2], -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 2, FIELD_CONFIG.BOUNDARY.Z_LIMIT - 2),
  ];
}

function attackDirectionFromGoal(targetGoal) {
  return targetGoal?.[2] >= 0 ? 1 : -1;
}

function goalDistance(position, targetGoal) {
  if (!targetGoal) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.hypot(targetGoal[0] - position[0], targetGoal[2] - position[2]);
}

function lineSeparation(point, lineStart, lineEnd) {
  const lineX = lineEnd[0] - lineStart[0];
  const lineZ = lineEnd[2] - lineStart[2];
  const lengthSquared = lineX * lineX + lineZ * lineZ;
  if (lengthSquared <= 0.0001) {
    return distance2D(point, lineStart);
  }

  const projection = clamp(
    ((point[0] - lineStart[0]) * lineX + (point[2] - lineStart[2]) * lineZ) / lengthSquared,
    0,
    1
  );
  const projectedPoint = [
    lineStart[0] + lineX * projection,
    0,
    lineStart[2] + lineZ * projection,
  ];
  return distance2D(point, projectedPoint);
}

function roleAllowsMode(teamId, isControlledPlayer, mode) {
  if (teamId !== TEAM_IDS.TEAM_ONE || isControlledPlayer) {
    return true;
  }

  return (
    mode === OUTFIELD_STATES.HOLD_SHAPE ||
    mode === OUTFIELD_STATES.SUPPORT ||
    mode === OUTFIELD_STATES.RECEIVE ||
    mode === OUTFIELD_STATES.RECOVER
  );
}

function choosePassTarget({ actor, actorState, teammates, opponents, targetGoal, config }) {
  if (!targetGoal || teammates.length === 0) {
    return null;
  }

  const actorGoalDistance = goalDistance(actorState.position, targetGoal);
  /** @type {null | {
   *   actorId: string,
   *   teamId: string,
   *   type: string,
   *   targetPlayerId: string,
   *   targetPosition: number[],
   *   power: number,
   *   score: number,
   * }} */
  let bestChoice = null;

  teammates.forEach((teammate) => {
    const teammatePosition = teammate.position || teammate.spawnPosition;
    const passDistance = distance2D(actorState.position, teammatePosition);
    if (
      passDistance < AI_CONFIG.PASS_DISTANCE_MIN ||
      passDistance > AI_CONFIG.PASS_DISTANCE_MAX
    ) {
      return;
    }

    const forwardGain = actorGoalDistance - goalDistance(teammatePosition, targetGoal);
    const widthGain = Math.abs(teammatePosition[0] - actorState.position[0]);
    const nearestOpponent = opponents.reduce((closest, opponent) => {
      const opponentDistance = distance2D(
        opponent.position || opponent.spawnPosition,
        teammatePosition
      );
      return Math.min(closest, opponentDistance);
    }, Number.POSITIVE_INFINITY);
    const laneTension = opponents.reduce((worstLaneGap, opponent) => {
      const gap = lineSeparation(
        opponent.position || opponent.spawnPosition,
        actorState.position,
        teammatePosition
      );
      return Math.min(worstLaneGap, gap);
    }, Number.POSITIVE_INFINITY);

    const score =
      forwardGain * 0.085 +
      widthGain * 0.04 +
      nearestOpponent * 0.035 +
      laneTension * 0.06 -
      Math.abs(passDistance - 16) * 0.035;

    if (!bestChoice || score > bestChoice.score) {
      bestChoice = {
        actorId: actor.playerId,
        teamId: actor.teamId,
        type: "pass",
        targetPlayerId: teammate.playerId,
        targetPosition: [...teammatePosition],
        power: clamp(0.8 + passDistance / 26 + config.passRiskTolerance * 0.22, 0.7, 1.45),
        score,
      };
    }
  });

  if (!bestChoice) {
    return null;
  }

  const resolvedChoice = bestChoice;
  const requiredScore = 0.38 - config.passRiskTolerance * 0.1;
  return resolvedChoice.score >= requiredScore ? resolvedChoice : null;
}

function shotConfidence({ actorState, opponents, targetGoal }) {
  if (!targetGoal) {
    return 0;
  }

  const distanceToGoal = goalDistance(actorState.position, targetGoal);
  const lateralOffset = Math.abs(actorState.position[0] - targetGoal[0]);
  const nearestOpponent = opponents.reduce((closest, opponent) => {
    const opponentDistance = distance2D(
      opponent.position || opponent.spawnPosition,
      actorState.position
    );
    return Math.min(closest, opponentDistance);
  }, Number.POSITIVE_INFINITY);

  return (
    clamp((AI_CONFIG.SHOOT_DISTANCE - distanceToGoal) / AI_CONFIG.SHOOT_DISTANCE, -0.4, 1) +
    clamp((nearestOpponent - 4) / 18, -0.25, 0.5) -
    clamp(lateralOffset / AI_CONFIG.SHOOT_ANGLE_LIMIT_X, 0, 1) * 0.55
  );
}

function computePhase({ teamId, possessionState, isCarrier, mode }) {
  if (possessionState?.teamId === teamId) {
    if (isCarrier && (mode === OUTFIELD_STATES.SHOOT || mode === OUTFIELD_STATES.CARRY)) {
      return CPU_PHASES.ATTACK;
    }
    if (mode === OUTFIELD_STATES.PASS || mode === OUTFIELD_STATES.RECEIVE) {
      return CPU_PHASES.BUILD;
    }
    return CPU_PHASES.BUILD;
  }

  if (!possessionState?.teamId) {
    return mode === OUTFIELD_STATES.RECOVER ? CPU_PHASES.TRANSITION : CPU_PHASES.RECOVER;
  }

  if (mode === OUTFIELD_STATES.PRESS) {
    return CPU_PHASES.PRESS;
  }

  if (mode === OUTFIELD_STATES.RECOVER) {
    return CPU_PHASES.RECOVER;
  }

  return CPU_PHASES.DEFEND_SHAPE;
}

function shouldRespectDwell(currentMode, nextMode, nowMs, lastTransitionAtMs) {
  if (currentMode === nextMode) {
    return false;
  }

  if (
    nextMode === OUTFIELD_STATES.CARRY ||
    nextMode === OUTFIELD_STATES.PASS ||
    nextMode === OUTFIELD_STATES.SHOOT
  ) {
    return false;
  }

  return nowMs - lastTransitionAtMs < AI_CONFIG.MIN_STATE_DURATION_MS;
}

function createMovementTarget({
  actor,
  actorState,
  possessionState,
  ballSnapshot,
  teammates,
  mode,
  targetGoal,
  ownGoal,
  config,
  isPrimaryPresser,
}) {
  const attackDirection = attackDirectionFromGoal(targetGoal);
  const ballPosition = ballSnapshot?.position || [0, 0, 0];
  const carrier = teammates.find((player) => player.playerId === possessionState?.playerId) || null;
  const homePosition = actor.spawnPosition;
  const carrierPosition = carrier?.position || ballPosition;
  const supportWidth = actor.attackLane * 18;
  const supportDepth = attackDirection * AI_CONFIG.SUPPORT_DISTANCE * config.supportResponsiveness;

  switch (mode) {
    case OUTFIELD_STATES.PRESS:
      return clampFieldPosition(isPrimaryPresser ? carrierPosition : ballPosition);
    case OUTFIELD_STATES.RECOVER:
      return clampFieldPosition([
        homePosition[0] * 0.8,
        0,
        homePosition[2] * 0.8 + ballPosition[2] * 0.2,
      ]);
    case OUTFIELD_STATES.SUPPORT:
      return clampFieldPosition([
        carrierPosition[0] * 0.38 + supportWidth,
        0,
        carrierPosition[2] + supportDepth * 0.65,
      ]);
    case OUTFIELD_STATES.RECEIVE:
      return clampFieldPosition([
        carrierPosition[0] * 0.28 + supportWidth * 0.9,
        0,
        carrierPosition[2] + attackDirection * AI_CONFIG.RECEIVE_DISTANCE,
      ]);
    case OUTFIELD_STATES.CARRY:
      return clampFieldPosition([
        actorState.position[0] * 0.72 + actor.attackLane * 8,
        0,
        actorState.position[2] + attackDirection * AI_CONFIG.CARRY_DISTANCE,
      ]);
    case OUTFIELD_STATES.HOLD_SHAPE:
    default:
      return clampFieldPosition([
        homePosition[0] * 0.76 + ballPosition[0] * 0.24,
        0,
        homePosition[2] * 0.74 + ballPosition[2] * 0.18 + ownGoal[2] * 0.08,
      ]);
  }
}

export function createInitialOutfieldAiState(homePosition = AI_CONFIG.IDLE_HOME_POSITION) {
  return {
    mode: OUTFIELD_STATES.HOLD_SHAPE,
    targetPosition: [...homePosition],
    homePosition: [...homePosition],
    targetPlayerId: null,
    actionCooldownUntilMs: 0,
    lastTransitionAtMs: 0,
    phase: CPU_PHASES.DEFEND_SHAPE,
  };
}

export function deriveCpuPhaseLabel({ teamId, possessionState, aiStates = [] }) {
  if (possessionState?.teamId === teamId) {
    if (
      aiStates.some((state) =>
        [OUTFIELD_STATES.CARRY, OUTFIELD_STATES.SHOOT].includes(state?.mode)
      )
    ) {
      return CPU_PHASES.ATTACK;
    }
    return aiStates.some((state) => state?.mode === OUTFIELD_STATES.PASS)
      ? CPU_PHASES.BUILD
      : CPU_PHASES.BUILD;
  }

  if (!possessionState?.teamId) {
    return aiStates.some((state) => state?.mode === OUTFIELD_STATES.RECOVER)
      ? CPU_PHASES.TRANSITION
      : CPU_PHASES.RECOVER;
  }

  if (aiStates.some((state) => state?.mode === OUTFIELD_STATES.PRESS)) {
    return CPU_PHASES.PRESS;
  }

  return aiStates.some((state) => state?.mode === OUTFIELD_STATES.RECOVER)
    ? CPU_PHASES.RECOVER
    : CPU_PHASES.DEFEND_SHAPE;
}

export function updateOutfieldController({
  nowMs,
  deltaSeconds,
  difficulty,
  actor,
  playerState,
  aiState,
  teammates,
  opponents,
  ballSnapshot,
  possessionState,
  targetGoal,
  ownGoal,
  isControlledPlayer = false,
}) {
  const config = difficultyConfig(difficulty);
  const currentPosition = playerState?.position || actor.spawnPosition;
  const currentRotation = playerState?.rotation || actor.spawnRotation;
  const currentMode = aiState?.mode || OUTFIELD_STATES.HOLD_SHAPE;
  const hasPossession = possessionState?.teamId === actor.teamId;
  const isCarrier = possessionState?.playerId === actor.playerId;
  const opposingCarrierId =
    possessionState?.teamId && possessionState.teamId !== actor.teamId
      ? possessionState.playerId
      : null;
  const opposingCarrier = opponents.find((player) => player.playerId === opposingCarrierId) || null;
  const carrierPosition = opposingCarrier?.position || ballSnapshot?.position || [0, 0, 0];
  const nearestTeammateToCarrierId = opponents.length > 0
    ? teammates
        .concat([{ ...actor, position: currentPosition }])
        .reduce((closest, teammate) => {
          const teammatePosition = teammate.position || teammate.spawnPosition;
          if (!closest) {
            return teammate;
          }
          const closestPosition = closest.position || closest.spawnPosition;
          return distance2D(teammatePosition, carrierPosition) <
            distance2D(closestPosition, carrierPosition)
            ? teammate
            : closest;
        }, null)?.playerId
    : actor.playerId;
  const isPrimaryPresser = nearestTeammateToCarrierId === actor.playerId;
  let nextMode = currentMode;
  let actionCommand = null;
  let nextTargetPlayerId = null;
  let actionCooldownUntilMs = aiState?.actionCooldownUntilMs || 0;

  if (!ballSnapshot) {
    nextMode = OUTFIELD_STATES.HOLD_SHAPE;
  } else if (isCarrier) {
    const passChoice = choosePassTarget({
      actor,
      actorState: { ...playerState, position: currentPosition },
      teammates,
      opponents,
      targetGoal,
      config,
    });
    const confidence = shotConfidence({
      actorState: { ...playerState, position: currentPosition },
      opponents,
      targetGoal,
    });
    const canShoot =
      goalDistance(currentPosition, targetGoal) <= AI_CONFIG.SHOOT_DISTANCE &&
      confidence >= config.shotConfidenceThreshold &&
      nowMs >= actionCooldownUntilMs;

    if (canShoot) {
      nextMode = OUTFIELD_STATES.SHOOT;
      actionCommand = {
        id: `cpu-shot-${actor.playerId}-${nowMs}`,
        actorId: actor.playerId,
        teamId: actor.teamId,
        type: "shot",
        targetPlayerId: null,
        targetPosition: [...targetGoal],
        power: clamp(1.05 + confidence * 0.18, 0.95, 1.25),
      };
      actionCooldownUntilMs = nowMs + Math.max(480, config.reactionMs * 1.2);
    } else if (passChoice && nowMs >= actionCooldownUntilMs) {
      nextMode = OUTFIELD_STATES.PASS;
      nextTargetPlayerId = passChoice.targetPlayerId;
      actionCommand = {
        ...passChoice,
        id: `cpu-pass-${actor.playerId}-${passChoice.targetPlayerId}-${nowMs}`,
      };
      actionCooldownUntilMs = nowMs + Math.max(420, config.reactionMs * 1.05);
    } else {
      nextMode = OUTFIELD_STATES.CARRY;
    }
  } else if (hasPossession) {
    const passTarget = choosePassTarget({
      actor,
      actorState: { ...playerState, position: currentPosition },
      teammates: teammates.filter((teammate) => teammate.playerId !== possessionState?.playerId),
      opponents,
      targetGoal,
      config,
    });

    nextTargetPlayerId = passTarget?.targetPlayerId || null;
    nextMode = passTarget ? OUTFIELD_STATES.RECEIVE : OUTFIELD_STATES.SUPPORT;
  } else if (possessionState?.teamId) {
    nextMode = isPrimaryPresser ? OUTFIELD_STATES.PRESS : OUTFIELD_STATES.RECOVER;
  } else {
    const ballDistance = distance2D(currentPosition, ballSnapshot.position);
    nextMode =
      ballDistance <= config.chaseRange * 0.25 || isPrimaryPresser
        ? OUTFIELD_STATES.RECOVER
        : OUTFIELD_STATES.HOLD_SHAPE;
  }

  if (!roleAllowsMode(actor.teamId, isControlledPlayer, nextMode)) {
    nextMode = hasPossession ? OUTFIELD_STATES.SUPPORT : OUTFIELD_STATES.RECOVER;
    actionCommand = null;
    nextTargetPlayerId = null;
  }

  const lastTransitionAtMs = aiState?.lastTransitionAtMs || 0;
  if (shouldRespectDwell(currentMode, nextMode, nowMs, lastTransitionAtMs)) {
    nextMode = currentMode;
    actionCommand = null;
    nextTargetPlayerId = aiState?.targetPlayerId || null;
  }

  const movementTarget = createMovementTarget({
    actor,
    actorState: { ...playerState, position: currentPosition },
    possessionState,
    ballSnapshot,
    teammates,
    mode: nextMode,
    targetGoal,
    ownGoal,
    config,
    isPrimaryPresser,
  });
  const direction = normalize2D([
    movementTarget[0] - currentPosition[0],
    movementTarget[2] - currentPosition[2],
  ]);
  const speedMultiplier =
    nextMode === OUTFIELD_STATES.PRESS
      ? config.pressIntensity
      : nextMode === OUTFIELD_STATES.RECOVER
        ? config.recoverySpeedMultiplier
        : config.supportResponsiveness;
  const runSpeed = actor.baseRunSpeed * config.maxRunSpeedMultiplier * speedMultiplier;
  const nextPosition = clampFieldPosition([
    currentPosition[0] + direction[0] * runSpeed * deltaSeconds,
    0,
    currentPosition[2] + direction[1] * runSpeed * deltaSeconds,
  ]);
  const targetYaw = yawTowards(
    currentPosition,
    actionCommand?.targetPosition || movementTarget
  );

  return {
    mode: nextMode,
    targetPosition: movementTarget,
    homePosition: [...actor.spawnPosition],
    targetPlayerId: nextTargetPlayerId,
    actionCooldownUntilMs,
    nextPosition,
    nextRotation: [0, Number.isFinite(targetYaw) ? targetYaw : currentRotation[1], 0],
    actionCommand,
    phase: computePhase({
      teamId: actor.teamId,
      possessionState,
      isCarrier,
      mode: nextMode,
    }),
    lastTransitionAtMs: currentMode === nextMode ? lastTransitionAtMs : nowMs,
  };
}
