import {
  FIELD_CONFIG,
  KICKOFF_CONFIG,
  TEAM_IDS,
  TEAM_ONE_PLAYER_IDS,
  TEAM_TWO_PLAYER_IDS,
} from "../config/gameConfig";
import {
  createPlayerStatesForAttackDirections,
  getGoalAssignments,
  getTeamAttackDirection,
  rotationForAttackDirection,
} from "./teamDirections";

export const RESTART_TYPES = Object.freeze({
  KICKOFF: "kickoff",
  THROW_IN: "throw_in",
  CORNER_KICK: "corner_kick",
  GOAL_KICK: "goal_kick",
  KEEPER_PUNT: "keeper_punt",
});

const RESTART_DELAY_MS = 320;
const THROW_IN_INSET = 1.4;
const GOAL_KICK_DEPTH = 13;
const CORNER_INSET = 1.25;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getOpposingTeamId(teamId) {
  return teamId === TEAM_IDS.TEAM_ONE ? TEAM_IDS.TEAM_TWO : TEAM_IDS.TEAM_ONE;
}

function clampFieldPosition(position) {
  return [
    clamp(position[0], -FIELD_CONFIG.BOUNDARY.X_LIMIT + 2, FIELD_CONFIG.BOUNDARY.X_LIMIT - 2),
    0,
    clamp(position[2], -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 2, FIELD_CONFIG.BOUNDARY.Z_LIMIT - 2),
  ];
}

function resolveRestartReceiverPosition({ type, teamId, spotPosition, teamAttackDirections }) {
  const forwardDirection = getTeamAttackDirection(teamAttackDirections, teamId);

  switch (type) {
    case RESTART_TYPES.KICKOFF:
      return [
        0,
        0,
        -forwardDirection * KICKOFF_CONFIG.RECEIVER_OFFSET_Z,
      ];
    case RESTART_TYPES.THROW_IN:
      return clampFieldPosition([
        spotPosition[0] + (spotPosition[0] >= 0 ? -8 : 8),
        0,
        spotPosition[2] + forwardDirection * 5,
      ]);
    case RESTART_TYPES.CORNER_KICK:
      return clampFieldPosition([
        spotPosition[0] * 0.42,
        0,
        spotPosition[2] - forwardDirection * 12,
      ]);
    case RESTART_TYPES.KEEPER_PUNT:
      return clampFieldPosition([0, 0, spotPosition[2] + forwardDirection * 28]);
    case RESTART_TYPES.GOAL_KICK:
    default:
      return clampFieldPosition([0, 0, spotPosition[2] + forwardDirection * 14]);
  }
}

function resolveRestartSpotPosition({ type, position }) {
  const x = Number.isFinite(position?.[0]) ? position[0] : 0;
  const z = Number.isFinite(position?.[2]) ? position[2] : 0;
  const sideX = x >= 0 ? 1 : -1;
  const sideZ = z >= 0 ? 1 : -1;

  switch (type) {
    case RESTART_TYPES.THROW_IN:
      return [
        sideX * (FIELD_CONFIG.BOUNDARY.X_LIMIT - THROW_IN_INSET),
        0,
        clamp(z, -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 6, FIELD_CONFIG.BOUNDARY.Z_LIMIT - 6),
      ];
    case RESTART_TYPES.CORNER_KICK:
      return [
        sideX * (FIELD_CONFIG.BOUNDARY.X_LIMIT - CORNER_INSET),
        0,
        sideZ * (FIELD_CONFIG.BOUNDARY.Z_LIMIT - CORNER_INSET),
      ];
    case RESTART_TYPES.KEEPER_PUNT:
      return clampFieldPosition([
        clamp(x, -12, 12),
        0,
        clamp(z, -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 8, FIELD_CONFIG.BOUNDARY.Z_LIMIT - 8),
      ]);
    case RESTART_TYPES.GOAL_KICK:
      return [0, 0, sideZ * (FIELD_CONFIG.BOUNDARY.Z_LIMIT - GOAL_KICK_DEPTH)];
    case RESTART_TYPES.KICKOFF:
    default:
      return [...KICKOFF_CONFIG.SPOT_POSITION];
  }
}

export function createRestartSetup({
  type,
  teamId,
  spotPosition,
  teamAttackDirections,
  takerId = null,
  receiverId = null,
  receiverPosition = null,
}) {
  const playerStates = createPlayerStatesForAttackDirections(teamAttackDirections);
  const teamPlayerIds =
    teamId === TEAM_IDS.TEAM_ONE ? TEAM_ONE_PLAYER_IDS : TEAM_TWO_PLAYER_IDS;
  const resolvedTakerId = takerId || teamPlayerIds[0];
  const resolvedReceiverId = receiverId || teamPlayerIds[1] || resolvedTakerId;
  const facingRotation = rotationForAttackDirection(
    getTeamAttackDirection(teamAttackDirections, teamId)
  );
  const resolvedSpotPosition = resolveRestartSpotPosition({ type, position: spotPosition });
  const resolvedReceiverPosition = receiverPosition
    ? clampFieldPosition(receiverPosition)
    : resolveRestartReceiverPosition({
        type,
        teamId,
        spotPosition: resolvedSpotPosition,
        teamAttackDirections,
      });

  if (playerStates[resolvedTakerId]) {
    playerStates[resolvedTakerId] = {
      ...playerStates[resolvedTakerId],
      position: [...resolvedSpotPosition],
      rotation: [...facingRotation],
      sprintLocked: false,
    };
  }

  if (playerStates[resolvedReceiverId]) {
    playerStates[resolvedReceiverId] = {
      ...playerStates[resolvedReceiverId],
      position: [...resolvedReceiverPosition],
      rotation: [...facingRotation],
      sprintLocked: false,
    };
  }

  return {
    type,
    teamId,
    takerId: resolvedTakerId,
    receiverId: resolvedReceiverId,
    teamAttackDirections: {
      [TEAM_IDS.TEAM_ONE]: getTeamAttackDirection(teamAttackDirections, TEAM_IDS.TEAM_ONE),
      [TEAM_IDS.TEAM_TWO]: getTeamAttackDirection(teamAttackDirections, TEAM_IDS.TEAM_TWO),
    },
    playerStates,
    spotPosition: [...resolvedSpotPosition],
    receiverPosition: resolvedReceiverPosition,
  };
}

export function createKickoffRestartSetup(teamId, teamAttackDirections) {
  return createRestartSetup({
    type: RESTART_TYPES.KICKOFF,
    teamId,
    spotPosition: KICKOFF_CONFIG.SPOT_POSITION,
    teamAttackDirections,
  });
}

export function classifyOutOfBoundsRestart(outOfBoundsSnapshot, teamAttackDirections) {
  const position = Array.isArray(outOfBoundsSnapshot?.position)
    ? outOfBoundsSnapshot.position
    : null;

  if (!position) {
    return null;
  }

  const [x, , z] = position;
  const lastTouchTeamId = outOfBoundsSnapshot?.lastTouch?.teamId || null;
  const sidelineOverflow = Math.max(0, Math.abs(x) - FIELD_CONFIG.BOUNDARY.X_LIMIT);
  const goalLineOverflow = Math.max(0, Math.abs(z) - FIELD_CONFIG.BOUNDARY.Z_LIMIT);
  const crossedSideline = sidelineOverflow > goalLineOverflow;

  if (crossedSideline) {
    return {
      type: RESTART_TYPES.THROW_IN,
      teamId: lastTouchTeamId ? getOpposingTeamId(lastTouchTeamId) : TEAM_IDS.TEAM_TWO,
      spotPosition: resolveRestartSpotPosition({
        type: RESTART_TYPES.THROW_IN,
        position,
      }),
      delayMs: RESTART_DELAY_MS,
    };
  }

  const goalAssignments = getGoalAssignments(teamAttackDirections);
  const attackingTeamId = z >= 0 ? goalAssignments.positiveZ : goalAssignments.negativeZ;
  const defendingTeamId = getOpposingTeamId(attackingTeamId);
  const isCornerKick = lastTouchTeamId === defendingTeamId;
  const type = isCornerKick ? RESTART_TYPES.CORNER_KICK : RESTART_TYPES.GOAL_KICK;

  return {
    type,
    teamId: isCornerKick ? attackingTeamId : defendingTeamId,
    spotPosition: resolveRestartSpotPosition({ type, position }),
    delayMs: RESTART_DELAY_MS,
  };
}
