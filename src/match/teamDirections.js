import {
  FIELD_CONFIG,
  GOALKEEPER_CONFIG,
  GOALKEEPER_PROFILES,
  PLAYER_IDS,
  PLAYER_PROFILES,
  TEAM_IDS,
} from "../config/gameConfig";

export const DEFAULT_TEAM_ATTACK_DIRECTIONS = Object.freeze({
  [TEAM_IDS.TEAM_ONE]: -1,
  [TEAM_IDS.TEAM_TWO]: 1,
});

function normalizeAttackDirection(value, fallback) {
  return value === -1 || value === 1 ? value : fallback;
}

export function createInitialTeamAttackDirections() {
  return {
    [TEAM_IDS.TEAM_ONE]: DEFAULT_TEAM_ATTACK_DIRECTIONS[TEAM_IDS.TEAM_ONE],
    [TEAM_IDS.TEAM_TWO]: DEFAULT_TEAM_ATTACK_DIRECTIONS[TEAM_IDS.TEAM_TWO],
  };
}

export function getTeamAttackDirection(teamAttackDirections, teamId) {
  return normalizeAttackDirection(
    teamAttackDirections?.[teamId],
    DEFAULT_TEAM_ATTACK_DIRECTIONS[teamId] || 1
  );
}

export function flipTeamAttackDirections(teamAttackDirections = DEFAULT_TEAM_ATTACK_DIRECTIONS) {
  return {
    [TEAM_IDS.TEAM_ONE]: -getTeamAttackDirection(teamAttackDirections, TEAM_IDS.TEAM_ONE),
    [TEAM_IDS.TEAM_TWO]: -getTeamAttackDirection(teamAttackDirections, TEAM_IDS.TEAM_TWO),
  };
}

export function rotationForAttackDirection(attackDirection) {
  return [0, attackDirection < 0 ? Math.PI : 0, 0];
}

function shouldMirrorTeamHalf(teamAttackDirections, teamId) {
  return (
    getTeamAttackDirection(teamAttackDirections, teamId) !==
    getTeamAttackDirection(DEFAULT_TEAM_ATTACK_DIRECTIONS, teamId)
  );
}

function createDirectionalOutfieldProfile(profile, teamAttackDirections) {
  const mirrorHalf = shouldMirrorTeamHalf(teamAttackDirections, profile.teamId);

  return {
    ...profile,
    spawnPosition: [
      profile.spawnPosition[0],
      profile.spawnPosition[1],
      mirrorHalf ? -profile.spawnPosition[2] : profile.spawnPosition[2],
    ],
    spawnRotation: rotationForAttackDirection(
      getTeamAttackDirection(teamAttackDirections, profile.teamId)
    ),
  };
}

export function createOutfieldRosterForAttackDirections(roster = [], teamAttackDirections) {
  return roster.map((profile) => createDirectionalOutfieldProfile(profile, teamAttackDirections));
}

export function createPlayerStatesForAttackDirections(teamAttackDirections) {
  return PLAYER_IDS.reduce((playerStates, playerId) => {
    const profile = PLAYER_PROFILES[playerId];
    const directionalProfile = createDirectionalOutfieldProfile(profile, teamAttackDirections);

    playerStates[playerId] = {
      position: [...directionalProfile.spawnPosition],
      rotation: [...directionalProfile.spawnRotation],
      stamina: profile.staminaMax,
      sprintLocked: false,
    };

    return playerStates;
  }, {});
}

export function createGoalkeeperHomeState(teamId, teamAttackDirections) {
  const attackDirection = getTeamAttackDirection(teamAttackDirections, teamId);
  const baseProfile = GOALKEEPER_PROFILES[teamId];

  return {
    position: [
      baseProfile?.spawnPosition?.[0] || 0,
      baseProfile?.spawnPosition?.[1] || 0,
      -attackDirection * GOALKEEPER_CONFIG.HOME_DEPTH,
    ],
    rotation: rotationForAttackDirection(attackDirection),
  };
}

export function buildTeamGoalTargets(teamAttackDirections) {
  const goalDepth = FIELD_CONFIG.LENGTH / 2 - 2;

  return {
    [TEAM_IDS.TEAM_ONE]: [
      0,
      0,
      getTeamAttackDirection(teamAttackDirections, TEAM_IDS.TEAM_ONE) * goalDepth,
    ],
    [TEAM_IDS.TEAM_TWO]: [
      0,
      0,
      getTeamAttackDirection(teamAttackDirections, TEAM_IDS.TEAM_TWO) * goalDepth,
    ],
  };
}

export function getGoalAssignments(teamAttackDirections) {
  const assignments = {
    negativeZ: TEAM_IDS.TEAM_ONE,
    positiveZ: TEAM_IDS.TEAM_TWO,
  };

  Object.values(TEAM_IDS).forEach((teamId) => {
    const attackDirection = getTeamAttackDirection(teamAttackDirections, teamId);
    if (attackDirection < 0) {
      assignments.negativeZ = teamId;
      return;
    }

    assignments.positiveZ = teamId;
  });

  return assignments;
}
