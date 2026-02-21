export const GAME_STATES = {
  IDLE: "idle",
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
  WIDTH: 100,
  LENGTH: 160,
  MARKING_OFFSET_Y: 0.05,
  BOUNDARY: {
    HEIGHT: 5,
    THICKNESS: 1,
    X_LIMIT: 52,
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
