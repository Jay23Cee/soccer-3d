import {
  BALL_CONFIG,
  PLAYER_LOB_CLEAR_CONFIG,
  PLAYER_PASS_CONFIG,
  TEAM_IDS,
} from "../config/gameConfig";

export function buildPassCommand({
  actorId,
  receiverId,
  receiverPosition,
  nowMs,
  teamId = TEAM_IDS.TEAM_ONE,
}) {
  return {
    id: `pass-${actorId}-${receiverId}-${Math.round(nowMs)}`,
    actorId,
    teamId,
    type: "pass",
    targetPlayerId: receiverId,
    targetPosition: [...receiverPosition],
    power: PLAYER_PASS_CONFIG.PASS_SPEED / BALL_CONFIG.FORCE,
  };
}

export function buildRestartPassCommand({
  type,
  actorId,
  receiverId,
  receiverPosition,
  targetPosition = null,
  nowMs,
  teamId,
  actionType = "pass",
  power = PLAYER_PASS_CONFIG.PASS_SPEED / BALL_CONFIG.FORCE,
}) {
  const resolvedTargetPosition = targetPosition || receiverPosition || [0, 0, 0];
  const receiverToken = receiverId || "space";

  return {
    id: `${type}-${actorId}-${receiverToken}-${Math.round(nowMs)}`,
    actorId,
    teamId,
    type: actionType,
    targetPlayerId: receiverId || null,
    targetPosition: [...resolvedTargetPosition],
    power,
  };
}

export function buildLobClearCommand({
  actorId,
  actorPosition,
  actorRotation,
  nowMs,
  teamId = TEAM_IDS.TEAM_ONE,
}) {
  const yaw = Number.isFinite(actorRotation?.[1]) ? actorRotation[1] : 0;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const origin = Array.isArray(actorPosition) ? actorPosition : [0, 0, 0];

  return {
    id: `lob-clear-${actorId}-${Math.round(nowMs)}`,
    actorId,
    teamId,
    type: "lob_clear",
    targetPlayerId: null,
    targetPosition: [
      origin[0] + forwardX * PLAYER_LOB_CLEAR_CONFIG.TARGET_DISTANCE,
      0,
      origin[2] + forwardZ * PLAYER_LOB_CLEAR_CONFIG.TARGET_DISTANCE,
    ],
    power: PLAYER_LOB_CLEAR_CONFIG.POWER,
  };
}

export function buildTackleCommand({ actorId, carrierId, nowMs }) {
  return {
    id: `tackle-${actorId}-${Math.round(nowMs)}`,
    actorId,
    teamId: TEAM_IDS.TEAM_ONE,
    carrierId,
  };
}
