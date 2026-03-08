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

export const OUTFIELD_ASSIGNMENTS = {
  PRIMARY_PRESS: "primary_press",
  SECONDARY_COVER: "secondary_cover",
  CARRIER: "carrier",
  SUPPORT_RUN: "support_run",
};

export const BALL_ZONES = {
  DEFENSIVE_THIRD: "defensive_third",
  MIDFIELD: "midfield",
  ATTACKING_THIRD: "attacking_third",
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

function createShotTarget({ actor, actorState, targetGoal }) {
  if (!targetGoal) {
    return null;
  }

  const lateralOffset =
    Math.abs(actorState.position[0]) <= 3
      ? clamp(-(actor.attackLane || 0) * 9, -11.5, 11.5)
      : clamp(-actorState.position[0] * 0.82, -11.5, 11.5);

  return [targetGoal[0] + lateralOffset, targetGoal[1] || 0, targetGoal[2]];
}

function choosePassTarget({
  actor,
  actorState,
  teammates,
  opponents,
  targetGoal,
  config,
}) {
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
   *   forwardGain: number,
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
      forwardGain * 0.11 +
      widthGain * 0.045 +
      nearestOpponent * 0.04 +
      laneTension * 0.07 -
      Math.abs(passDistance - 16) * 0.03;

    if (!bestChoice || score > bestChoice.score) {
      bestChoice = {
        actorId: actor.playerId,
        teamId: actor.teamId,
        type: "pass",
        targetPlayerId: teammate.playerId,
        targetPosition: [...teammatePosition],
        power: clamp(0.84 + passDistance / 26 + config.passRiskTolerance * 0.22, 0.7, 1.45),
        score,
        forwardGain,
      };
    }
  });

  if (!bestChoice) {
    return null;
  }

  const requiredScore = 0.42 - config.passRiskTolerance * 0.08;
  return bestChoice && bestChoice.score >= requiredScore ? bestChoice : null;
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

    return mode === OUTFIELD_STATES.PASS ? CPU_PHASES.BUILD : CPU_PHASES.BUILD;
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

function shouldRespectDwell(currentMode, nextMode, nowMs, lastTransitionAtMs, config) {
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

  return (
    nowMs - lastTransitionAtMs <
    Math.max(AI_CONFIG.MIN_STATE_DURATION_MS, Math.round(config.actionLockMs * 0.45))
  );
}

function resolveAssignment({ actor, hasPossession, isCarrier, teamContext }) {
  if (isCarrier) {
    return OUTFIELD_ASSIGNMENTS.CARRIER;
  }

  if (hasPossession && teamContext?.supportRunnerId === actor.playerId) {
    return OUTFIELD_ASSIGNMENTS.SUPPORT_RUN;
  }

  if (!hasPossession && teamContext?.primaryPresserId === actor.playerId) {
    return OUTFIELD_ASSIGNMENTS.PRIMARY_PRESS;
  }

  if (!hasPossession && teamContext?.secondaryCoverId === actor.playerId) {
    return OUTFIELD_ASSIGNMENTS.SECONDARY_COVER;
  }

  return null;
}

function createMovementTarget({
  actor,
  actorState,
  possessionState,
  ballSnapshot,
  teammates,
  mode,
  assignment,
  targetGoal,
  ownGoal,
  config,
  teamContext,
}) {
  const attackDirection = attackDirectionFromGoal(targetGoal);
  const ballPosition = ballSnapshot?.position || [0, 0, 0];
  const teamCarrier =
    teammates.find((player) => player.playerId === possessionState?.playerId) || null;
  const homePosition = actor.spawnPosition;
  const carrierPosition = teamCarrier?.position || ballPosition;
  const supportWidth = actor.attackLane * 18;
  const supportDepth = attackDirection * (config.supportRunDepth || AI_CONFIG.SUPPORT_DISTANCE);
  const compactness = clamp(config.secondaryPressCompactness || 0.6, 0.25, 0.9);
  const ballZone = teamContext?.ballZone || BALL_ZONES.MIDFIELD;
  const committedCarryDepth =
    ballZone === BALL_ZONES.ATTACKING_THIRD ? 10 : AI_CONFIG.CARRY_DISTANCE + 2;

  switch (mode) {
    case OUTFIELD_STATES.PRESS:
      return clampFieldPosition([
        carrierPosition[0] * 0.92,
        0,
        carrierPosition[2] - attackDirection * 0.9,
      ]);
    case OUTFIELD_STATES.RECOVER:
      if (assignment === OUTFIELD_ASSIGNMENTS.SECONDARY_COVER) {
        return clampFieldPosition([
          carrierPosition[0] * (0.36 + (1 - compactness) * 0.16) +
            homePosition[0] * (0.44 + compactness * 0.18),
          0,
          carrierPosition[2] - attackDirection * (6 + compactness * 4),
        ]);
      }
      return clampFieldPosition([
        homePosition[0] * 0.8,
        0,
        homePosition[2] * 0.8 + ballPosition[2] * 0.2,
      ]);
    case OUTFIELD_STATES.SUPPORT:
    case OUTFIELD_STATES.RECEIVE:
      if (assignment === OUTFIELD_ASSIGNMENTS.SUPPORT_RUN) {
        const widthBias = actor.attackLane * (16 + compactness * 6);
        const depthBias =
          supportDepth + (mode === OUTFIELD_STATES.RECEIVE ? 3 : 0) + (ballZone === BALL_ZONES.ATTACKING_THIRD ? 4 : 0);
        return clampFieldPosition([
          carrierPosition[0] * 0.22 + widthBias,
          0,
          carrierPosition[2] + depthBias,
        ]);
      }
      return clampFieldPosition([
        carrierPosition[0] * 0.38 + supportWidth,
        0,
        carrierPosition[2] + supportDepth * 0.65,
      ]);
    case OUTFIELD_STATES.CARRY:
      return clampFieldPosition([
        actorState.position[0] * 0.64 +
          actor.attackLane * 5 +
          clamp((targetGoal?.[0] || 0) - actorState.position[0], -8, 8) * 0.2,
        0,
        actorState.position[2] + attackDirection * committedCarryDepth,
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
    assignment: null,
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
  aiPaceMultiplier = 1,
  actor,
  playerState,
  aiState,
  teammates,
  opponents,
  ballSnapshot,
  possessionState,
  targetGoal,
  ownGoal,
  teamContext = null,
  isControlledPlayer = false,
}) {
  const config = difficultyConfig(difficulty);
  const currentPosition = playerState?.position || actor.spawnPosition;
  const currentRotation = playerState?.rotation || actor.spawnRotation;
  const currentMode = aiState?.mode || OUTFIELD_STATES.HOLD_SHAPE;
  const hasPossession = possessionState?.teamId === actor.teamId;
  const isCarrier = possessionState?.playerId === actor.playerId;
  const assignment = resolveAssignment({
    actor,
    hasPossession,
    isCarrier,
    teamContext,
  });
  const activeActionLock = teamContext?.actionLocks?.[actor.playerId];
  const hasActionLock = activeActionLock?.expiresAtMs > nowMs;
  let nextMode = currentMode;
  let actionCommand = null;
  let nextTargetPlayerId = null;
  let actionCooldownUntilMs = aiState?.actionCooldownUntilMs || 0;

  if (!ballSnapshot) {
    nextMode = OUTFIELD_STATES.HOLD_SHAPE;
  } else if (isCarrier) {
    const actorState = { ...playerState, position: currentPosition };
    const attackingThird =
      teamContext?.ballZone === BALL_ZONES.ATTACKING_THIRD ||
      goalDistance(currentPosition, targetGoal) <= config.attackCommitmentDistance;
    const passChoice = choosePassTarget({
      actor,
      actorState,
      teammates,
      opponents,
      targetGoal,
      config,
    });
    const forwardPassChoice =
      passChoice && passChoice.forwardGain >= (attackingThird ? 7 : 4) ? passChoice : null;
    const confidence = shotConfidence({
      actorState,
      opponents,
      targetGoal,
    });
    const shotTarget = createShotTarget({ actor, actorState, targetGoal });
    const canShoot =
      shotTarget &&
      goalDistance(currentPosition, targetGoal) <= config.attackCommitmentDistance &&
      confidence >= config.shotConfidenceThreshold &&
      nowMs >= actionCooldownUntilMs;
    const shouldKeepCarrying =
      hasActionLock &&
      activeActionLock.mode === OUTFIELD_STATES.CARRY &&
      attackingThird &&
      (!forwardPassChoice || forwardPassChoice.forwardGain < 12);
    const shouldHonorLockedPass =
      hasActionLock &&
      activeActionLock.mode === OUTFIELD_STATES.PASS &&
      forwardPassChoice &&
      (!activeActionLock.targetPlayerId ||
        activeActionLock.targetPlayerId === forwardPassChoice.targetPlayerId);

    if (canShoot) {
      nextMode = OUTFIELD_STATES.SHOOT;
      actionCommand = {
        id: `cpu-shot-${actor.playerId}-${nowMs}`,
        actorId: actor.playerId,
        teamId: actor.teamId,
        type: "shot",
        targetPlayerId: null,
        targetPosition: shotTarget,
        power: clamp(1.08 + confidence * 0.2, 1, 1.28),
      };
      actionCooldownUntilMs = nowMs + Math.max(480, config.reactionMs * 1.15);
    } else if (
      forwardPassChoice &&
      nowMs >= actionCooldownUntilMs &&
      (!shouldKeepCarrying || shouldHonorLockedPass)
    ) {
      nextMode = OUTFIELD_STATES.PASS;
      nextTargetPlayerId = forwardPassChoice.targetPlayerId;
      actionCommand = {
        ...forwardPassChoice,
        id: `cpu-pass-${actor.playerId}-${forwardPassChoice.targetPlayerId}-${nowMs}`,
      };
      actionCooldownUntilMs = nowMs + Math.max(420, config.reactionMs);
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
    nextMode =
      assignment === OUTFIELD_ASSIGNMENTS.SUPPORT_RUN && passTarget?.forwardGain >= 4
        ? OUTFIELD_STATES.RECEIVE
        : OUTFIELD_STATES.SUPPORT;
  } else if (possessionState?.teamId) {
    nextMode =
      assignment === OUTFIELD_ASSIGNMENTS.PRIMARY_PRESS
        ? OUTFIELD_STATES.PRESS
        : OUTFIELD_STATES.RECOVER;
  } else {
    const ballDistance = distance2D(currentPosition, ballSnapshot.position);
    nextMode =
      assignment === OUTFIELD_ASSIGNMENTS.PRIMARY_PRESS ||
      ballDistance <= config.chaseRange * 0.22
        ? OUTFIELD_STATES.PRESS
        : OUTFIELD_STATES.RECOVER;
  }

  let nextAssignment = assignment;
  if (!roleAllowsMode(actor.teamId, isControlledPlayer, nextMode)) {
    nextMode = hasPossession ? OUTFIELD_STATES.SUPPORT : OUTFIELD_STATES.RECOVER;
    nextAssignment =
      hasPossession && assignment === OUTFIELD_ASSIGNMENTS.SUPPORT_RUN
        ? OUTFIELD_ASSIGNMENTS.SUPPORT_RUN
        : null;
    actionCommand = null;
    nextTargetPlayerId = null;
  }

  const lastTransitionAtMs = aiState?.lastTransitionAtMs || 0;
  if (shouldRespectDwell(currentMode, nextMode, nowMs, lastTransitionAtMs, config)) {
    nextMode = currentMode;
    nextAssignment = aiState?.assignment || nextAssignment;
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
    assignment: nextAssignment,
    targetGoal,
    ownGoal,
    config,
    teamContext,
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
  const resolvedAiPaceMultiplier = Number.isFinite(aiPaceMultiplier) ? aiPaceMultiplier : 1;
  const runSpeed =
    actor.baseRunSpeed *
    config.maxRunSpeedMultiplier *
    speedMultiplier *
    resolvedAiPaceMultiplier;
  const nextPosition = clampFieldPosition([
    currentPosition[0] + direction[0] * runSpeed * deltaSeconds,
    0,
    currentPosition[2] + direction[1] * runSpeed * deltaSeconds,
  ]);
  const targetYaw = yawTowards(currentPosition, actionCommand?.targetPosition || movementTarget);

  const nextActionLock =
    actor.teamId === TEAM_IDS.TEAM_TWO &&
    isCarrier &&
    [OUTFIELD_STATES.CARRY, OUTFIELD_STATES.PASS, OUTFIELD_STATES.SHOOT].includes(nextMode)
      ? {
          mode: nextMode,
          targetPlayerId: nextTargetPlayerId,
          expiresAtMs: nowMs + config.actionLockMs,
        }
      : null;

  return {
    mode: nextMode,
    assignment: nextAssignment,
    targetPosition: movementTarget,
    homePosition: [...actor.spawnPosition],
    targetPlayerId: nextTargetPlayerId,
    actionCooldownUntilMs,
    nextPosition,
    nextRotation: [0, Number.isFinite(targetYaw) ? targetYaw : currentRotation[1], 0],
    actionCommand,
    actionLock: nextActionLock,
    phase: computePhase({
      teamId: actor.teamId,
      possessionState,
      isCarrier,
      mode: nextMode,
    }),
    lastTransitionAtMs: currentMode === nextMode ? lastTransitionAtMs : nowMs,
  };
}
