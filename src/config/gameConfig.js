export const GAME_STATES = {
  IDLE: "idle",
  INTRO: "intro",
  IN_PLAY: "in_play",
  GOAL_SCORED: "goal_scored",
  KICKOFF: "kickoff",
  RESTART: "restart",
  PAUSED: "paused",
  ENDED: "ended",
};

export const MATCH_DURATION_SECONDS = 120;
export const GOAL_COOLDOWN_MS = 1200;
export const BALL_RESET_DELAY_MS = 550;

export const BALL_BODY_NAME = "ball";

export const FIELD_CONFIG = {
  WIDTH: 112,
  LENGTH: 160,
  MARKING_OFFSET_Y: 0.05,
  BOUNDARY: {
    HEIGHT: 5,
    THICKNESS: 1,
    X_LIMIT: 58,
    Z_LIMIT: 82,
  },
};

export const BALL_CONFIG = {
  MASS: 1,
  RESTITUTION: 0.7,
  FRICTION: 0.5,
  LINEAR_DAMPING: 0.3,
  ANGULAR_DAMPING: 0.3,
  SPAWN_POSITION: [0, 12, 0],
  FORCE: 15,
  JUMP_IMPULSE: 10,
  MAX_SPEED: 15,
  OUT_OF_BOUNDS: {
    X: 70,
    Z: 95,
    Y: -8,
  },
};

export const GOAL_CONFIG = {
  SCALE: 2,
  TRIGGER_DEBOUNCE_MS: 600,
};

export const SHOT_METER_CONFIG = {
  MAX_CHARGE_MS: 1800,
  MIN_CHARGE_RATIO: 0.14,
  PERFECT_WINDOW_START: 0.82,
  PERFECT_WINDOW_END: 0.96,
  MIN_LAUNCH_SPEED: 12,
  MAX_LAUNCH_SPEED: 28,
  MIN_UPWARD_SPEED: 1.3,
  MAX_UPWARD_SPEED: 3.8,
  RECHARGE_COOLDOWN_MS: 220,
};

export const COMBO_CONFIG = {
  WINDOW_MS: 5000,
  MAX_STREAK: 5,
  STEP_MULTIPLIER: 0.14,
  MAX_MULTIPLIER: 1.7,
  HUD_WARNING_MS: 1800,
};

export const INTRO_CONFIG = {
  DURATION_MS: 4200,
  CAMERA_START: [150, 60, 170],
  CAMERA_END: [92, 72, 118],
  CAMERA_START_FOV: 44,
  CAMERA_END_FOV: 52,
};

export const KICKOFF_CONFIG = {
  SPOT_POSITION: [0, 0, 0],
  RECEIVER_OFFSET_Z: 8,
  POST_GOAL_DELAY_MS: 550,
};

export const POWER_PLAY_CONFIG = {
  ZONE_RADIUS: 7,
  SPAWN_DELAY_MS: 12000,
  ZONE_DURATION_MS: 9000,
  BOOST_DURATION_MS: 7000,
  TYPES: {
    speed: {
      label: "Speed",
      color: "#1dd75f",
      speedMultiplier: 1.8,
      shotPowerMultiplier: 1,
      controlAssistMultiplier: 1,
    },
    shot_power: {
      label: "Shot Power",
      color: "#f97316",
      speedMultiplier: 1.1,
      shotPowerMultiplier: 1.9,
      controlAssistMultiplier: 1,
    },
    passing_accuracy: {
      label: "Passing Accuracy",
      color: "#06b6d4",
      speedMultiplier: 1.2,
      shotPowerMultiplier: 1.1,
      controlAssistMultiplier: 1.9,
    },
  },
  POSITIONS: [
    [-28, -44],
    [28, -44],
    [-30, 0],
    [30, 0],
    [-28, 44],
    [28, 44],
    [0, -24],
    [0, 24],
  ],
};

export const TEAM_IDS = {
  TEAM_ONE: "teamOne",
  TEAM_TWO: "teamTwo",
};

export const PLAYER_ROLES = {
  STRIKER: "striker",
  SUPPORT: "support",
  GOALKEEPER: "goalkeeper",
};

export const TEAM_ROSTERS = {
  [TEAM_IDS.TEAM_ONE]: [
    {
      playerId: "player_one",
      label: "Player One",
      teamId: TEAM_IDS.TEAM_ONE,
      role: PLAYER_ROLES.STRIKER,
      homeSlot: "left-forward",
      attackLane: -1,
      spawnPosition: [-6, 0, 22],
      spawnRotation: [0, Math.PI, 0],
      baseRunSpeed: 34,
      sprintMultiplier: 1.2,
      kickPowerMultiplier: 1.25,
      staminaMax: 100,
      staminaDrainPerSecSprint: 24,
      staminaRegenPerSec: 12,
    },
    {
      playerId: "player_two",
      label: "Player Two",
      teamId: TEAM_IDS.TEAM_ONE,
      role: PLAYER_ROLES.SUPPORT,
      homeSlot: "right-support",
      attackLane: 1,
      spawnPosition: [6, 0, 22],
      spawnRotation: [0, Math.PI, 0],
      baseRunSpeed: 30,
      sprintMultiplier: 1.08,
      kickPowerMultiplier: 1,
      staminaMax: 100,
      staminaDrainPerSecSprint: 16,
      staminaRegenPerSec: 20,
    },
  ],
  [TEAM_IDS.TEAM_TWO]: [
    {
      playerId: "opponent_one",
      label: "Opponent One",
      teamId: TEAM_IDS.TEAM_TWO,
      role: PLAYER_ROLES.STRIKER,
      homeSlot: "left-forward",
      attackLane: -1,
      spawnPosition: [-12, 0, -22],
      spawnRotation: [0, 0, 0],
      baseRunSpeed: 29,
      sprintMultiplier: 1.05,
      kickPowerMultiplier: 1,
      staminaMax: 100,
      staminaDrainPerSecSprint: 16,
      staminaRegenPerSec: 18,
    },
    {
      playerId: "opponent_two",
      label: "Opponent Two",
      teamId: TEAM_IDS.TEAM_TWO,
      role: PLAYER_ROLES.SUPPORT,
      homeSlot: "right-support",
      attackLane: 1,
      spawnPosition: [12, 0, -22],
      spawnRotation: [0, 0, 0],
      baseRunSpeed: 31,
      sprintMultiplier: 1.08,
      kickPowerMultiplier: 1.05,
      staminaMax: 100,
      staminaDrainPerSecSprint: 18,
      staminaRegenPerSec: 16,
    },
  ],
};

export const GOALKEEPER_PROFILES = {
  [TEAM_IDS.TEAM_ONE]: {
    playerId: "keeper-team-one",
    teamId: TEAM_IDS.TEAM_ONE,
    role: PLAYER_ROLES.GOALKEEPER,
    label: "Team One Keeper",
    spawnPosition: [0, 0, 72.5],
    spawnRotation: [0, Math.PI, 0],
  },
  [TEAM_IDS.TEAM_TWO]: {
    playerId: "keeper-team-two",
    teamId: TEAM_IDS.TEAM_TWO,
    role: PLAYER_ROLES.GOALKEEPER,
    label: "Team Two Keeper",
    spawnPosition: [0, 0, -72.5],
    spawnRotation: [0, 0, 0],
  },
};

export const TEAM_ONE_PLAYER_IDS = TEAM_ROSTERS[TEAM_IDS.TEAM_ONE].map((player) => player.playerId);
export const TEAM_TWO_PLAYER_IDS = TEAM_ROSTERS[TEAM_IDS.TEAM_TWO].map((player) => player.playerId);
export const OUTFIELD_ROSTER = Object.values(TEAM_ROSTERS).flat();
export const PLAYER_IDS = OUTFIELD_ROSTER.map((player) => player.playerId);

export const PLAYER_SWITCH_CONFIG = {
  KEY: "Tab",
  COOLDOWN_MS: 180,
};

export const PLAYER_PASS_CONFIG = {
  KEY: "s",
  COOLDOWN_MS: 220,
  PASS_SPEED: 16,
  PASS_LOFT: 1.2,
};

export const PLAYER_LOB_CLEAR_CONFIG = {
  KEY: "c",
  COOLDOWN_MS: 320,
  TARGET_DISTANCE: 28,
  POWER: 1.08,
};

export const PLAYER_TACKLE_CONFIG = {
  KEY: "f",
  COOLDOWN_MS: 420,
  RANGE: 2.4,
  FACING_DOT_MIN: 0.34,
  IMPULSE_FORWARD: 8.5,
  IMPULSE_UPWARD: 1.35,
};

export const PLAYER_STAMINA_CONFIG = {
  LOW_THRESHOLD_RATIO: 0.2,
  SPRINT_REENABLE_RATIO: 0.1,
  LOW_SPEED_MULTIPLIER: 0.85,
  LOW_KICK_MULTIPLIER: 0.9,
};

export const PLAYER_PROFILES = OUTFIELD_ROSTER.reduce((profiles, player) => {
  profiles[player.playerId] = {
    ...player,
    startPosition: [...player.spawnPosition],
    startRotation: [...player.spawnRotation],
  };
  return profiles;
}, {});

export const DIFFICULTY_PRESETS = {
  easy: {
    reactionMs: 320,
    chaseRange: 58,
    pressureDistance: 12,
    shotChance: 0.32,
    shotConfidenceThreshold: 0.62,
    passRiskTolerance: 0.3,
    pressIntensity: 0.82,
    supportResponsiveness: 0.9,
    recoverySpeedMultiplier: 0.92,
    claimAssertiveness: 0.84,
    maxRunSpeedMultiplier: 0.9,
    keeperReachMultiplier: 0.9,
    attackCommitmentDistance: 18,
    supportRunDepth: 12,
    secondaryPressCompactness: 0.46,
    actionLockMs: 640,
  },
  normal: {
    reactionMs: 240,
    chaseRange: 68,
    pressureDistance: 15,
    shotChance: 0.48,
    shotConfidenceThreshold: 0.5,
    passRiskTolerance: 0.45,
    pressIntensity: 1.04,
    supportResponsiveness: 1.04,
    recoverySpeedMultiplier: 1,
    claimAssertiveness: 1,
    maxRunSpeedMultiplier: 1,
    keeperReachMultiplier: 1,
    attackCommitmentDistance: 24,
    supportRunDepth: 17,
    secondaryPressCompactness: 0.62,
    actionLockMs: 430,
  },
  hard: {
    reactionMs: 170,
    chaseRange: 78,
    pressureDistance: 19,
    shotChance: 0.65,
    shotConfidenceThreshold: 0.36,
    passRiskTolerance: 0.62,
    pressIntensity: 1.18,
    supportResponsiveness: 1.14,
    recoverySpeedMultiplier: 1.08,
    claimAssertiveness: 1.12,
    maxRunSpeedMultiplier: 1.08,
    keeperReachMultiplier: 1.12,
    attackCommitmentDistance: 29,
    supportRunDepth: 22,
    secondaryPressCompactness: 0.74,
    actionLockMs: 300,
  },
};

export const AI_CONFIG = {
  DEFAULT_DIFFICULTY: "normal",
  UPDATE_INTERVAL_MS: 120,
  SHOOT_DISTANCE: 25,
  MIN_STATE_DURATION_MS: 320,
  MAX_PRESSERS: 1,
  PASS_DISTANCE_MIN: 8,
  PASS_DISTANCE_MAX: 34,
  SUPPORT_DISTANCE: 14,
  RECEIVE_DISTANCE: 18,
  TACKLE_DISTANCE: 2.6,
  CARRY_DISTANCE: 8,
  SHOOT_ANGLE_LIMIT_X: 21,
  RECOVERY_MS: 650,
  INTERCEPT_WEIGHT: 0.78,
  IDLE_HOME_POSITION: [0, 0, -10],
};

export const GOALKEEPER_CONFIG = {
  UPDATE_INTERVAL_MS: 80,
  HOME_DEPTH: 72.5,
  LATERAL_LIMIT: 16,
  REACTION_DISTANCE: 27,
  SAVE_RADIUS: 4.2,
  SAVE_COOLDOWN_MS: 540,
  POSSESSION_HOLD_MS: 260,
  RESTART_HOLD_MS: 2000,
  DISTRIBUTE_IMPULSE: 12,
  RESET_MS: 560,
};

export const CAMERA_CONFIG = {
  MODES: {
    BROADCAST_WIDE: "broadcast-wide",
    PLAYER_CHASE: "player-chase",
    GOAL_LINE: "goal-line",
    FREE_ROAM: "free-roam",
    BEHIND_PLAYER_WEST: "behind-player-west",
    SIDE_LEFT: "side-left",
    SIDE_RIGHT: "side-right",
    BUILD_UP: "build-up",
    ATTACKING_THIRD: "attacking-third",
    SHOT: "shot",
    GOAL: "goal",
    SAVE: "save",
    REPLAY: "replay",
  },
  BASE_HEIGHT: 64,
  BASE_DISTANCE: 112,
  TRANSITION_ALPHA: 0.08,
  REPLAY_TRANSITION_ALPHA: 0.12,
  GOAL_REPLAY_ZOOM: {
    POSITION_SCALE: 0.82,
    FOV_REDUCTION: 5,
    MIN_FOV: 36,
  },
  FOV: {
    BROADCAST_WIDE: 52,
    PLAYER_CHASE: 48,
    GOAL_LINE: 45,
    FREE_ROAM: 56,
    BEHIND_PLAYER_WEST: 50,
    SIDE_LEFT: 47,
    SIDE_RIGHT: 47,
    BUILD_UP: 50,
    ATTACKING_THIRD: 46,
    SHOT: 43,
    GOAL: 48,
    SAVE: 47,
    REPLAY: 42,
  },
};

export const REPLAY_CONFIG = {
  MAX_BUFFER_FRAMES: 240,
  PRE_EVENT_FRAMES: 90,
  POST_EVENT_FRAMES: 85,
  FRAME_INTERVAL_MS: 1000 / 30,
  COOLDOWN_MS: 1200,
  STATE: {
    IDLE: "idle",
    ARMED: "armed",
    PLAYING: "playing",
    COOLDOWN: "cooldown",
  },
};

export const MATCH_STATS_CONFIG = {
  MOMENTUM_DECAY_PER_TICK: 0.015,
  MOMENTUM_GOAL_SWING: 0.34,
  MOMENTUM_SHOT_SWING: 0.08,
  MOMENTUM_SAVE_SWING: 0.12,
  MAX_TIMELINE_ITEMS: 10,
};
