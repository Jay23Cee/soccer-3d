export const GAME_STATES = {
  IDLE: "idle",
  INTRO: "intro",
  IN_PLAY: "in_play",
  GOAL_SCORED: "goal_scored",
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

export const TEAM_ONE_PLAYER_IDS = ["player_one", "player_two"];
export const TEAM_TWO_PLAYER_IDS = ["opponent_one", "opponent_two"];
export const PLAYER_IDS = [...TEAM_ONE_PLAYER_IDS, ...TEAM_TWO_PLAYER_IDS];

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

export const PLAYER_STAMINA_CONFIG = {
  LOW_THRESHOLD_RATIO: 0.2,
  SPRINT_REENABLE_RATIO: 0.1,
  LOW_SPEED_MULTIPLIER: 0.85,
  LOW_KICK_MULTIPLIER: 0.9,
};

export const PLAYER_PROFILES = {
  player_one: {
    label: "Player One",
    baseRunSpeed: 34,
    sprintMultiplier: 1.2,
    kickPowerMultiplier: 1.25,
    staminaMax: 100,
    staminaDrainPerSecSprint: 24,
    staminaRegenPerSec: 12,
    startPosition: [-6, 0, 22],
    startRotation: [0, Math.PI, 0],
  },
  player_two: {
    label: "Player Two",
    baseRunSpeed: 30,
    sprintMultiplier: 1.08,
    kickPowerMultiplier: 1,
    staminaMax: 100,
    staminaDrainPerSecSprint: 16,
    staminaRegenPerSec: 20,
    startPosition: [6, 0, 22],
    startRotation: [0, Math.PI, 0],
  },
  opponent_one: {
    label: "Opponent One",
    baseRunSpeed: 29,
    sprintMultiplier: 1.05,
    kickPowerMultiplier: 1,
    staminaMax: 100,
    staminaDrainPerSecSprint: 16,
    staminaRegenPerSec: 18,
    startPosition: [-12, 0, -22],
    startRotation: [0, 0, 0],
  },
  opponent_two: {
    label: "Opponent Two",
    baseRunSpeed: 31,
    sprintMultiplier: 1.08,
    kickPowerMultiplier: 1.05,
    staminaMax: 100,
    staminaDrainPerSecSprint: 18,
    staminaRegenPerSec: 16,
    startPosition: [12, 0, -22],
    startRotation: [0, 0, 0],
  },
};

export const DIFFICULTY_PRESETS = {
  easy: {
    reactionMs: 320,
    chaseRange: 58,
    pressureDistance: 12,
    shotChance: 0.32,
    maxRunSpeedMultiplier: 0.9,
    keeperReachMultiplier: 0.9,
  },
  normal: {
    reactionMs: 240,
    chaseRange: 68,
    pressureDistance: 15,
    shotChance: 0.48,
    maxRunSpeedMultiplier: 1,
    keeperReachMultiplier: 1,
  },
  hard: {
    reactionMs: 170,
    chaseRange: 78,
    pressureDistance: 18,
    shotChance: 0.65,
    maxRunSpeedMultiplier: 1.08,
    keeperReachMultiplier: 1.12,
  },
};

export const AI_CONFIG = {
  DEFAULT_DIFFICULTY: "normal",
  UPDATE_INTERVAL_MS: 120,
  SHOOT_DISTANCE: 25,
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
  DISTRIBUTE_IMPULSE: 12,
  RESET_MS: 560,
};

export const CAMERA_CONFIG = {
  MODES: {
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
  FOV: {
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
