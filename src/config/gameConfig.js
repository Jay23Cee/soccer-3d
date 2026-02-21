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
