import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Billboard,
  Environment,
  Html,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from "@react-three/drei";
import { Physics } from "@react-three/cannon";
import SoccerField from "./SoccerField";
import SoccerBallModel from "./SoccerBallModel";
import GoalNet from "./GoalNet";
import SoccerPlayer from "./SoccerPlayer";
import CameraDirector from "./camera/CameraDirector";
import MatchStoryPanel from "./ui/MatchStoryPanel";
import useGoalkeeperAI from "./hooks/useGoalkeeperAI";
import useOpponentAI from "./hooks/useOpponentAI";
import usePowerPlay from "./hooks/usePowerPlay";
import useReplayOrchestration from "./hooks/useReplayOrchestration";
import { createReplayDirector } from "./replay/ReplayDirector";
import {
  createInitialOpponentState,
  OPPONENT_STATES,
  updateOpponentController,
} from "./ai/opponentController";
import {
  createInitialGoalkeeperState,
  GOALKEEPER_STATES,
  updateGoalkeeperController,
} from "./ai/goalkeeperController";
import {
  AI_CONFIG,
  BALL_RESET_DELAY_MS,
  CAMERA_CONFIG,
  COMBO_CONFIG,
  FIELD_CONFIG,
  GAME_STATES,
  GOAL_CONFIG,
  GOALKEEPER_CONFIG,
  GOAL_COOLDOWN_MS,
  INTRO_CONFIG,
  MATCH_STATS_CONFIG,
  MATCH_DURATION_SECONDS,
  PLAYER_PASS_CONFIG,
  PLAYER_IDS,
  PLAYER_PROFILES,
  PLAYER_STAMINA_CONFIG,
  PLAYER_SWITCH_CONFIG,
  TEAM_ONE_PLAYER_IDS,
  TEAM_TWO_PLAYER_IDS,
  POWER_PLAY_CONFIG,
  REPLAY_CONFIG,
  SHOT_METER_CONFIG,
} from "./config/gameConfig";
import {
  MOVEMENT_MAPPING_MODES,
  mapArrowStateToWorldDirection,
  mapSingleArrowKeyToWorldForce,
} from "./input/movementMapping";
import "./App.css";

const TEAM_ONE = {
  name: "Brazil",
  shortName: "BRA",
  flagClass: "flag-brazil",
};

const TEAM_TWO = {
  name: "Argentina",
  shortName: "ARG",
  flagClass: "flag-argentina",
};

const CONTROL_TARGETS = {
  PLAYER: "player",
  BALL: "ball",
};

const TEAM_IDS = {
  TEAM_ONE: "teamOne",
  TEAM_TWO: "teamTwo",
};

const TEAM_GOAL_TARGETS = {
  [TEAM_IDS.TEAM_ONE]: [0, 0, -FIELD_CONFIG.LENGTH / 2 + 2],
  [TEAM_IDS.TEAM_TWO]: [0, 0, FIELD_CONFIG.LENGTH / 2 - 2],
};

const PLAYER_BOUNDARY_MARGIN = 2;
const PLAYER_SPRINT_KEY = "a";
const ACTIVE_PLAYER_STRENGTHS = {
  player_one: "Kick + Speed",
  player_two: "Support Runner",
};
const CAMERA_POV_OPTIONS = [
  {
    value: CAMERA_CONFIG.MODES.BROADCAST_WIDE,
    label: "Broadcast Wide",
  },
  {
    value: CAMERA_CONFIG.MODES.PLAYER_CHASE,
    label: "Player Chase",
  },
  {
    value: CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST,
    label: "Behind Player (West of Ball)",
  },
  {
    value: CAMERA_CONFIG.MODES.ATTACKING_THIRD,
    label: "Attacking Third",
  },
  {
    value: CAMERA_CONFIG.MODES.GOAL_LINE,
    label: "Goal Line",
  },
  {
    value: CAMERA_CONFIG.MODES.FREE_ROAM,
    label: "Free Roam",
  },
];

const MOVEMENT_MAPPING_OPTIONS = [
  {
    value: MOVEMENT_MAPPING_MODES.AUTO,
    label: "Auto (Per Camera)",
  },
  {
    value: MOVEMENT_MAPPING_MODES.CAMERA,
    label: "Camera Relative",
  },
  {
    value: MOVEMENT_MAPPING_MODES.WORLD,
    label: "World Relative",
  },
];

const SHOT_METER_IDLE = {
  isCharging: false,
  chargeRatio: 0,
  isPerfect: false,
  canShoot: false,
};

function createShotMeterState(nextState = {}) {
  return {
    ...SHOT_METER_IDLE,
    ...nextState,
  };
}

function createInitialMatchStats() {
  return {
    momentum: 0,
    possession: {
      teamOne: 0.5,
      teamTwo: 0.5,
    },
    shots: {
      teamOne: 0,
      teamTwo: 0,
    },
    onTarget: {
      teamOne: 0,
      teamTwo: 0,
    },
    saves: {
      teamOne: 0,
      teamTwo: 0,
    },
  };
}

function createInitialCameraState() {
  return {
    mode: CAMERA_CONFIG.MODES.BROADCAST_WIDE,
    position: [...INTRO_CONFIG.CAMERA_END],
    target: [0, 0, 0],
    fov: CAMERA_CONFIG.FOV.BROADCAST_WIDE,
  };
}

function createInitialReplayState() {
  return {
    mode: REPLAY_CONFIG.STATE.IDLE,
    isPlaying: false,
    canSkip: false,
    eventType: null,
    eventId: null,
    currentPlaybackIndex: 0,
    totalPlaybackFrames: 0,
  };
}

function getPlayerProfile(playerId) {
  return PLAYER_PROFILES[playerId] || PLAYER_PROFILES[PLAYER_IDS[0]];
}

function createInitialPlayerStates() {
  return PLAYER_IDS.reduce((accumulator, playerId) => {
    const profile = getPlayerProfile(playerId);

    accumulator[playerId] = {
      position: [...profile.startPosition],
      rotation: [...profile.startRotation],
      stamina: profile.staminaMax,
      sprintLocked: false,
    };

    return accumulator;
  }, {});
}

function createInitialOpponentStates() {
  return TEAM_TWO_PLAYER_IDS.reduce((accumulator, playerId) => {
    accumulator[playerId] = createInitialOpponentState(getPlayerProfile(playerId).startPosition);
    return accumulator;
  }, {});
}

function getNextTeamOnePlayerId(activePlayerId) {
  const currentIndex = TEAM_ONE_PLAYER_IDS.indexOf(activePlayerId);
  if (currentIndex === -1) {
    return TEAM_ONE_PLAYER_IDS[0];
  }

  return TEAM_ONE_PLAYER_IDS[(currentIndex + 1) % TEAM_ONE_PLAYER_IDS.length];
}

function clampStamina(playerId, value) {
  const maxStamina = getPlayerProfile(playerId).staminaMax;
  return clamp(value, 0, maxStamina);
}

function getStaminaRatio(playerId, stamina) {
  const maxStamina = getPlayerProfile(playerId).staminaMax;

  if (maxStamina <= 0) {
    return 0;
  }

  return clamp(stamina / maxStamina, 0, 1);
}

function isLowStamina(staminaRatio) {
  return staminaRatio <= PLAYER_STAMINA_CONFIG.LOW_THRESHOLD_RATIO;
}

function computeMovementSpeed(profile, staminaRatio, sprinting, sprintLocked) {
  const sprintMultiplier = sprinting && !sprintLocked ? profile.sprintMultiplier : 1;
  const lowStaminaMultiplier = isLowStamina(staminaRatio)
    ? PLAYER_STAMINA_CONFIG.LOW_SPEED_MULTIPLIER
    : 1;

  return profile.baseRunSpeed * sprintMultiplier * lowStaminaMultiplier;
}

function computeKickMultiplier(profile, staminaRatio) {
  const lowStaminaMultiplier = isLowStamina(staminaRatio)
    ? PLAYER_STAMINA_CONFIG.LOW_KICK_MULTIPLIER
    : 1;

  return profile.kickPowerMultiplier * lowStaminaMultiplier;
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function nowMs() {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createClockLabel(timeLeftSeconds) {
  return formatClock(timeLeftSeconds);
}

function bindMediaQueryListener(mediaQuery, listener) {
  if (!mediaQuery) {
    return () => {};
  }

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }

  return () => {};
}

function detectQualityMode() {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const isSmallViewport = window.innerWidth <= 900;
  const isCoarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  return isSmallViewport || isCoarsePointer ? "mobile" : "desktop";
}

function isEditableElement(element) {
  if (!element || typeof element !== "object") {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  return tagName === "input" || tagName === "select" || tagName === "textarea";
}

function statusText(gameState) {
  switch (gameState) {
    case GAME_STATES.IDLE:
      return "Idle";
    case GAME_STATES.INTRO:
      return "Pre-match Intro";
    case GAME_STATES.IN_PLAY:
      return "In Play";
    case GAME_STATES.GOAL_SCORED:
      return "Goal Scored";
    case GAME_STATES.PAUSED:
      return "Paused";
    case GAME_STATES.ENDED:
      return "Match Ended";
    default:
      return "Unknown";
  }
}

function clockLabel(gameState) {
  switch (gameState) {
    case GAME_STATES.PAUSED:
      return "Paused";
    case GAME_STATES.ENDED:
      return "Full Time";
    case GAME_STATES.INTRO:
      return "Warmup";
    default:
      return "Live";
  }
}

function BroadcastScoreboard({
  teamOne,
  teamTwo,
  teamOneScore,
  teamTwoScore,
  timeLeft,
  gameState,
  matchEvent,
  pulseType,
}) {
  const scoreboardClassName = [
    "broadcast-scoreboard",
    gameState === GAME_STATES.GOAL_SCORED || matchEvent?.type === "goal" ? "is-goal" : "",
    matchEvent?.type === "halftime" ? "is-halftime" : "",
    gameState === GAME_STATES.ENDED || matchEvent?.type === "end" ? "is-end" : "",
    matchEvent?.type === "boost" ? "is-boost" : "",
    matchEvent?.type === "save" ? "is-save" : "",
    pulseType === "kick" ? "is-kick" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={scoreboardClassName} role="status" aria-live="polite">
      <div className="team-panel team-left">
        <span className={`team-flag ${teamOne.flagClass}`} aria-hidden="true" />
        <span className="team-name" title={teamOne.name}>
          {teamOne.shortName}
        </span>
        <span className="team-score-box" data-testid="score-team-one">
          {teamOneScore}
        </span>
      </div>

      <div className="match-clock">
        <span className="clock-label">{clockLabel(gameState)}</span>
        <span className="clock-time" data-testid="match-clock">
          {formatClock(timeLeft)}
        </span>
      </div>

      <div className="team-panel team-right">
        <span className={`team-flag ${teamTwo.flagClass}`} aria-hidden="true" />
        <span className="team-name" title={teamTwo.name}>
          {teamTwo.shortName}
        </span>
        <span className="team-score-box" data-testid="score-team-two">
          {teamTwoScore}
        </span>
      </div>
    </div>
  );
}

function MatchEventBanner({ event }) {
  if (!event) {
    return null;
  }

  if (event.type === "goal") {
    return <p className="match-event-banner event-goal">{event.teamName.toUpperCase()} GOAL</p>;
  }

  if (event.type === "halftime") {
    return <p className="match-event-banner event-halftime">HALF-TIME</p>;
  }

  if (event.type === "boost") {
    return (
      <p className="match-event-banner event-boost">
        {event.label.toUpperCase()} BOOST x{event.comboMultiplier.toFixed(2)}
      </p>
    );
  }

  if (event.type === "perfect_shot") {
    return <p className="match-event-banner event-perfect">PERFECT SHOT</p>;
  }

  if (event.type === "save") {
    return <p className="match-event-banner event-save">{event.teamName.toUpperCase()} SAVE</p>;
  }

  return <p className="match-event-banner event-end">FULL TIME</p>;
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="loading-pill">Loading 3D assets...</div>
    </Html>
  );
}

function IntroSequenceOverlay({ introProgress, teamOneName, teamTwoName }) {
  const countdown = Math.max(1, Math.ceil((1 - introProgress) * 4));

  return (
    <Html center>
      <div className="intro-pill">
        <p>
          {teamOneName.toUpperCase()} vs {teamTwoName.toUpperCase()}
        </p>
        <p>Kickoff in {countdown}</p>
      </div>
    </Html>
  );
}

function EndMatchScoreboard3D({ teamOneScore, teamTwoScore, teamOneName, teamTwoName }) {
  return (
    <Billboard position={[0, 28, 0]} follow>
      <group>
        <Text
          position={[0, 11, 0]}
          color="#fff7e6"
          fontSize={4.2}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.2}
          outlineColor="#0f172a"
        >
          MATCH ENDED
        </Text>

        <Text
          position={[-16, 3.5, 0]}
          color="#c7d2fe"
          fontSize={2.5}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.12}
          outlineColor="#0f172a"
        >
          {teamOneName.toUpperCase()}
        </Text>
        <Text
          position={[16, 3.5, 0]}
          color="#fde68a"
          fontSize={2.5}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.12}
          outlineColor="#0f172a"
        >
          {teamTwoName.toUpperCase()}
        </Text>

        <Text
          position={[-16, -3.5, 0]}
          color="#ffffff"
          fontSize={7}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.24}
          outlineColor="#0f172a"
        >
          {teamOneScore}
        </Text>
        <Text
          position={[0, -3.5, 0]}
          color="#f1f5f9"
          fontSize={6}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.2}
          outlineColor="#0f172a"
        >
          -
        </Text>
        <Text
          position={[16, -3.5, 0]}
          color="#ffffff"
          fontSize={7}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.24}
          outlineColor="#0f172a"
        >
          {teamTwoScore}
        </Text>
      </group>
    </Billboard>
  );
}

function App() {
  const [difficulty] = useState(AI_CONFIG.DEFAULT_DIFFICULTY);
  const [ballScale, setBallScale] = useState(1);
  const [teamOneScore, setTeamOneScore] = useState(0);
  const [teamTwoScore, setTeamTwoScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MATCH_DURATION_SECONDS);
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [introProgress, setIntroProgress] = useState(0);
  const [activePowerZone, setActivePowerZone] = useState(null);
  const [activeBoost, setActiveBoost] = useState(null);
  const [boostTimeLeftMs, setBoostTimeLeftMs] = useState(0);
  const [matchEvent, setMatchEvent] = useState(null);
  const [controlTarget, setControlTarget] = useState(CONTROL_TARGETS.PLAYER);
  const [cameraPovMode, setCameraPovMode] = useState(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
  const [movementMappingMode, setMovementMappingMode] = useState(MOVEMENT_MAPPING_MODES.AUTO);
  const [playerStates, setPlayerStates] = useState(() => createInitialPlayerStates());
  const [activePlayerId, setActivePlayerId] = useState(() => TEAM_ONE_PLAYER_IDS[0]);
  const [isSprintHeld, setIsSprintHeld] = useState(false);
  const [shotMeterState, setShotMeterState] = useState(() => createShotMeterState());
  const [comboStreak, setComboStreak] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [comboTimeLeftMs, setComboTimeLeftMs] = useState(0);
  const [overlayPulseType, setOverlayPulseType] = useState(null);
  const [cameraNudge, setCameraNudge] = useState([0, 0, 0]);
  const [qualityMode, setQualityMode] = useState(() => detectQualityMode());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [opponentAiStates, setOpponentAiStates] = useState(() => createInitialOpponentStates());
  const [goalkeeperState, setGoalkeeperState] = useState(() => ({
    teamOne: createInitialGoalkeeperState(TEAM_IDS.TEAM_ONE),
    teamTwo: createInitialGoalkeeperState(TEAM_IDS.TEAM_TWO),
  }));
  const [, setCameraState] = useState(() => createInitialCameraState());
  const [replayState, setReplayState] = useState(() => createInitialReplayState());
  const [replayFrame, setReplayFrame] = useState(null);
  const [matchStats, setMatchStats] = useState(() => createInitialMatchStats());
  const [eventTimeline, setEventTimeline] = useState([]);
  const [ballSnapshot, setBallSnapshot] = useState(null);
  const [externalBallCommand, setExternalBallCommand] = useState(null);
  const [passCommand, setPassCommand] = useState(null);
  const [possessionState, setPossessionState] = useState(null);

  const ballResetRef = useRef(null);
  const kickoffRef = useRef(null);
  const cameraRef = useRef(null);
  const cameraTelemetryRef = useRef(createInitialCameraState());
  const replayDirectorRef = useRef(createReplayDirector());
  const goalCooldownUntilRef = useRef(0);
  const goalResetTimeoutRef = useRef(null);
  const introTimeoutRef = useRef(null);
  const introIntervalRef = useRef(null);
  const introStartMsRef = useRef(0);
  const powerZoneSpawnTimeoutRef = useRef(null);
  const powerZoneExpireTimeoutRef = useRef(null);
  const boostExpireTimeoutRef = useRef(null);
  const halftimeTriggeredRef = useRef(false);
  const previousGameStateRef = useRef(GAME_STATES.IDLE);
  const overlayPulseTimeoutRef = useRef(null);
  const cameraNudgeTimeoutRef = useRef(null);
  const comboExpiresAtRef = useRef(0);
  const comboPauseRemainingRef = useRef(0);
  const comboStreakRef = useRef(0);
  const lastPlayerSwitchAtRef = useRef(0);
  const passCooldownUntilRef = useRef(0);
  const matchEventIdRef = useRef(0);
  const aiLastUpdateAtRef = useRef(0);
  const goalkeeperLastUpdateAtRef = useRef(0);
  const lastPossessionTickAtRef = useRef(0);
  const playerInputRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  });

  const replayActive = replayState.isPlaying;
  const freeRoamCameraEnabled = cameraPovMode === CAMERA_CONFIG.MODES.FREE_ROAM;
  const controlsEnabled = gameState === GAME_STATES.IN_PLAY && !replayActive;
  const ballControlsEnabled = controlsEnabled && controlTarget === CONTROL_TARGETS.BALL;
  const playerControlsEnabled = controlsEnabled && controlTarget === CONTROL_TARGETS.PLAYER;
  const canScore = gameState === GAME_STATES.IN_PLAY && !replayActive;
  const matchStarted = gameState !== GAME_STATES.IDLE;
  const showShotMeter = controlTarget === CONTROL_TARGETS.PLAYER;
  const shotMeterPercent = Math.round(shotMeterState.chargeRatio * 100);
  const perfectWindowStartPercent = Math.round(SHOT_METER_CONFIG.PERFECT_WINDOW_START * 100);
  const perfectWindowWidthPercent = Math.max(
    0,
    Math.round((SHOT_METER_CONFIG.PERFECT_WINDOW_END - SHOT_METER_CONFIG.PERFECT_WINDOW_START) * 100)
  );
  const comboWarning = comboStreak > 0 && comboTimeLeftMs <= COMBO_CONFIG.HUD_WARNING_MS;
  const playerBounds = useMemo(
    () => ({
      x: FIELD_CONFIG.BOUNDARY.X_LIMIT - PLAYER_BOUNDARY_MARGIN,
      z: FIELD_CONFIG.BOUNDARY.Z_LIMIT - PLAYER_BOUNDARY_MARGIN,
    }),
    []
  );
  const activeProfile = getPlayerProfile(activePlayerId);
  const activePlayerState = playerStates[activePlayerId] || {
    position: [...activeProfile.startPosition],
    rotation: [...activeProfile.startRotation],
    stamina: activeProfile.staminaMax,
    sprintLocked: false,
  };
  const activeStaminaRatio = getStaminaRatio(activePlayerId, activePlayerState.stamina);
  const activeStaminaPercent = Math.round(activeStaminaRatio * 100);
  const activeMovementSpeed = computeMovementSpeed(
    activeProfile,
    activeStaminaRatio,
    isSprintHeld,
    activePlayerState.sprintLocked
  );
  const activeKickMultiplierFromStamina = computeKickMultiplier(activeProfile, activeStaminaRatio);
  const activePlayerStrength = ACTIVE_PLAYER_STRENGTHS[activePlayerId] || "Balanced";
  const staminaToneClass =
    activeStaminaRatio <= PLAYER_STAMINA_CONFIG.LOW_THRESHOLD_RATIO
      ? "is-low"
      : activeStaminaRatio <= 0.5
        ? "is-medium"
        : "";
  const sprintStatusLabel = activePlayerState.sprintLocked
    ? "LOCKED"
    : isSprintHeld && playerControlsEnabled
      ? "ON"
      : "OFF";
  const playerOneAnimationState = shotMeterState.isCharging
    ? "shoot"
    : playerControlsEnabled && !activePlayerState.sprintLocked && isSprintHeld
      ? "run"
      : "track";
  const getOpponentAnimationState = useCallback((opponentAiState) => {
    if (!opponentAiState) {
      return "idle";
    }
    if (opponentAiState.mode === OPPONENT_STATES.SHOOT) {
      return "shoot";
    }
    if (opponentAiState.mode === OPPONENT_STATES.INTERCEPT) {
      return "intercept";
    }
    if (opponentAiState.mode === OPPONENT_STATES.TRACK) {
      return "track";
    }
    if (opponentAiState.mode === OPPONENT_STATES.RECOVER) {
      return "track";
    }
    return "idle";
  }, []);
  const primaryOpponentAiState = opponentAiStates[TEAM_TWO_PLAYER_IDS[0]] || createInitialOpponentState();
  const keeperOneAnimationState =
    goalkeeperState.teamOne.mode === GOALKEEPER_STATES.DISTRIBUTE
      ? "distribute"
      : goalkeeperState.teamOne.mode === GOALKEEPER_STATES.INTERCEPT
        ? "intercept"
        : goalkeeperState.teamOne.mode === GOALKEEPER_STATES.SAVE
          ? "save"
          : "idle";
  const keeperTwoAnimationState =
    goalkeeperState.teamTwo.mode === GOALKEEPER_STATES.DISTRIBUTE
      ? "distribute"
      : goalkeeperState.teamTwo.mode === GOALKEEPER_STATES.INTERCEPT
        ? "intercept"
        : goalkeeperState.teamTwo.mode === GOALKEEPER_STATES.SAVE
          ? "save"
          : "idle";
  const celebrationLevel = gameState === GAME_STATES.GOAL_SCORED ? 0.8 : gameState === GAME_STATES.ENDED ? 1 : 0;

  const activeBoostConfig = activeBoost
    ? POWER_PLAY_CONFIG.TYPES[activeBoost.type] || null
    : null;
  const appliedComboMultiplier = activeBoost ? comboMultiplier : 1;
  const speedMultiplier = (activeBoostConfig?.speedMultiplier || 1) * appliedComboMultiplier;
  const boostShotPowerMultiplier =
    (activeBoostConfig?.shotPowerMultiplier || 1) * appliedComboMultiplier;
  const shotPowerMultiplier = boostShotPowerMultiplier * activeKickMultiplierFromStamina;
  const controlAssistMultiplier =
    (activeBoostConfig?.controlAssistMultiplier || 1) * appliedComboMultiplier;
  const canvasDpr = qualityMode === "mobile" ? [1, 1.2] : [1, 1.5];
  const shadowMapSize = qualityMode === "mobile" ? 512 : 1024;
  const replayBallPosition = replayFrame?.ball?.position || null;
  const liveBallPosition = ballSnapshot?.position || [0, 0, 0];
  const cameraBallPosition = replayBallPosition || liveBallPosition;
  const playerPositionsForCamera = useMemo(
    () =>
      PLAYER_IDS.map((playerId) => {
        const profile = getPlayerProfile(playerId);
        const state = playerStates[playerId];
        return state?.position || [...profile.startPosition];
      }),
    [playerStates]
  );
  const goalkeeperPositionsForCamera = useMemo(
    () => [goalkeeperState.teamOne.position, goalkeeperState.teamTwo.position],
    [goalkeeperState.teamOne.position, goalkeeperState.teamTwo.position]
  );
  const cameraPlayerPositions =
    replayFrame?.players?.map((player) => player.position) || playerPositionsForCamera;
  const cameraKeeperPositions =
    replayFrame?.keepers?.map((keeper) => keeper.position) || goalkeeperPositionsForCamera;

  const cameraPosition = useMemo(() => {
    const basePosition =
      gameState !== GAME_STATES.INTRO
        ? [...INTRO_CONFIG.CAMERA_END]
        : [
            lerp(INTRO_CONFIG.CAMERA_START[0], INTRO_CONFIG.CAMERA_END[0], introProgress),
            lerp(INTRO_CONFIG.CAMERA_START[1], INTRO_CONFIG.CAMERA_END[1], introProgress),
            lerp(INTRO_CONFIG.CAMERA_START[2], INTRO_CONFIG.CAMERA_END[2], introProgress),
          ];

    return [
      basePosition[0] + cameraNudge[0],
      basePosition[1] + cameraNudge[1],
      basePosition[2] + cameraNudge[2],
    ];
  }, [cameraNudge, gameState, introProgress]);

  const cameraFov =
    gameState === GAME_STATES.INTRO
      ? lerp(INTRO_CONFIG.CAMERA_START_FOV, INTRO_CONFIG.CAMERA_END_FOV, introProgress)
      : INTRO_CONFIG.CAMERA_END_FOV;

  const triggerOverlayPulse = useCallback(
    (pulseType) => {
      if (prefersReducedMotion) {
        return;
      }

      setOverlayPulseType(pulseType);
      if (overlayPulseTimeoutRef.current) {
        clearTimeout(overlayPulseTimeoutRef.current);
      }

      overlayPulseTimeoutRef.current = setTimeout(() => {
        setOverlayPulseType(null);
      }, 320);
    },
    [prefersReducedMotion]
  );

  const triggerCameraNudge = useCallback(
    (strength = 1) => {
      if (prefersReducedMotion) {
        return;
      }

      const amplitude = (qualityMode === "mobile" ? 0.75 : 1.2) * strength;
      setCameraNudge([
        (Math.random() - 0.5) * amplitude,
        (Math.random() - 0.5) * amplitude * 0.65,
        (Math.random() - 0.5) * amplitude,
      ]);

      if (cameraNudgeTimeoutRef.current) {
        clearTimeout(cameraNudgeTimeoutRef.current);
      }

      cameraNudgeTimeoutRef.current = setTimeout(() => {
        setCameraNudge([0, 0, 0]);
      }, 220);
    },
    [prefersReducedMotion, qualityMode]
  );

  const appendTimelineEvent = useCallback(
    (event) => {
      setEventTimeline((currentTimeline) =>
        [event, ...currentTimeline].slice(0, MATCH_STATS_CONFIG.MAX_TIMELINE_ITEMS)
      );
    },
    []
  );

  const updateMomentum = useCallback((teamId, swingAmount) => {
    const swing = teamId === TEAM_IDS.TEAM_ONE ? swingAmount : -swingAmount;
    setMatchStats((previousStats) => ({
      ...previousStats,
      momentum: clamp(previousStats.momentum + swing, -1, 1),
    }));
  }, []);

  const emitTelemetryEvent = useCallback(
    (type, payload = {}) => {
      const nextId = `evt-${++matchEventIdRef.current}`;
      const teamName =
        payload.teamId === TEAM_IDS.TEAM_ONE
          ? TEAM_ONE.name
          : payload.teamId === TEAM_IDS.TEAM_TWO
            ? TEAM_TWO.name
            : payload.teamName;
      const event = {
        id: nextId,
        type,
        teamId: payload.teamId || null,
        teamName,
        label: payload.label || null,
        clockLabel: createClockLabel(timeLeft),
        createdAtMs: nowMs(),
      };

      appendTimelineEvent(event);
      return event;
    },
    [appendTimelineEvent, timeLeft]
  );

  const handleCameraStateChange = useCallback((nextCameraState) => {
    if (!nextCameraState) {
      return;
    }

    cameraTelemetryRef.current = nextCameraState;
    setCameraState((previous) =>
      previous.mode === nextCameraState.mode
        ? previous
        : { ...previous, mode: nextCameraState.mode }
    );
  }, []);

  const clearIntroTimers = useCallback(() => {
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }

    if (introIntervalRef.current) {
      clearInterval(introIntervalRef.current);
      introIntervalRef.current = null;
    }
  }, []);

  const clearPowerPlayTimers = useCallback(() => {
    if (powerZoneSpawnTimeoutRef.current) {
      clearTimeout(powerZoneSpawnTimeoutRef.current);
      powerZoneSpawnTimeoutRef.current = null;
    }

    if (powerZoneExpireTimeoutRef.current) {
      clearTimeout(powerZoneExpireTimeoutRef.current);
      powerZoneExpireTimeoutRef.current = null;
    }

    if (boostExpireTimeoutRef.current) {
      clearTimeout(boostExpireTimeoutRef.current);
      boostExpireTimeoutRef.current = null;
    }
  }, []);

  const clearComboState = useCallback(() => {
    comboExpiresAtRef.current = 0;
    comboPauseRemainingRef.current = 0;
    comboStreakRef.current = 0;
    setComboStreak(0);
    setComboMultiplier(1);
    setComboTimeLeftMs(0);
  }, []);

  const safeResetBall = useCallback(() => {
    ballResetRef.current?.();
  }, []);

  const clearPlayerInput = useCallback(() => {
    playerInputRef.current.ArrowUp = false;
    playerInputRef.current.ArrowDown = false;
    playerInputRef.current.ArrowLeft = false;
    playerInputRef.current.ArrowRight = false;
  }, []);

  const resetPlayers = useCallback(() => {
    clearPlayerInput();
    setIsSprintHeld(false);
    setActivePlayerId(TEAM_ONE_PLAYER_IDS[0]);
    setPlayerStates(createInitialPlayerStates());
    lastPlayerSwitchAtRef.current = 0;
    passCooldownUntilRef.current = 0;
  }, [clearPlayerInput]);

  const spawnPowerZone = useCallback(() => {
    const type = pickRandom(Object.keys(POWER_PLAY_CONFIG.TYPES));
    const config = POWER_PLAY_CONFIG.TYPES[type];
    const [x, z] = pickRandom(POWER_PLAY_CONFIG.POSITIONS);

    setActivePowerZone({
      id: `zone-${Math.random().toString(16).slice(2)}-${Date.now()}`,
      type,
      color: config.color,
      radius: POWER_PLAY_CONFIG.ZONE_RADIUS,
      position: [x, z],
    });

    if (powerZoneExpireTimeoutRef.current) {
      clearTimeout(powerZoneExpireTimeoutRef.current);
    }

    powerZoneExpireTimeoutRef.current = setTimeout(() => {
      setActivePowerZone(null);
    }, POWER_PLAY_CONFIG.ZONE_DURATION_MS);
  }, []);

  const startMatch = useCallback(() => {
    clearIntroTimers();
    clearPowerPlayTimers();
    clearComboState();
    if (goalResetTimeoutRef.current) {
      clearTimeout(goalResetTimeoutRef.current);
      goalResetTimeoutRef.current = null;
    }

    goalCooldownUntilRef.current = 0;
    setTeamOneScore(0);
    setTeamTwoScore(0);
    setTimeLeft(MATCH_DURATION_SECONDS);
    setActivePowerZone(null);
    setActiveBoost(null);
    setBoostTimeLeftMs(0);
    setMatchEvent(null);
    setEventTimeline([]);
    setShotMeterState(createShotMeterState());
    setOpponentAiStates(createInitialOpponentStates());
    setGoalkeeperState({
      teamOne: createInitialGoalkeeperState(TEAM_IDS.TEAM_ONE),
      teamTwo: createInitialGoalkeeperState(TEAM_IDS.TEAM_TWO),
    });
    setMatchStats(createInitialMatchStats());
    const initialCameraState = createInitialCameraState();
    cameraTelemetryRef.current = initialCameraState;
    setCameraState(initialCameraState);
    setCameraPovMode(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
    setMovementMappingMode(MOVEMENT_MAPPING_MODES.AUTO);
    setReplayState(createInitialReplayState());
    setReplayFrame(null);
    setBallSnapshot(null);
    setExternalBallCommand(null);
    setPassCommand(null);
    setPossessionState(null);
    setIntroProgress(0);
    setGameState(GAME_STATES.INTRO);
    setOverlayPulseType(null);
    setCameraNudge([0, 0, 0]);
    halftimeTriggeredRef.current = false;
    replayDirectorRef.current = createReplayDirector();
    aiLastUpdateAtRef.current = 0;
    goalkeeperLastUpdateAtRef.current = 0;
    lastPossessionTickAtRef.current = nowMs();
    resetPlayers();

    setTimeout(() => {
      safeResetBall();
    }, 0);

    introStartMsRef.current = nowMs();
    introIntervalRef.current = setInterval(() => {
      const elapsed = nowMs() - introStartMsRef.current;
      setIntroProgress(Math.min(1, elapsed / INTRO_CONFIG.DURATION_MS));
    }, 50);

    introTimeoutRef.current = setTimeout(() => {
      clearIntroTimers();
      setIntroProgress(1);
      setGameState(GAME_STATES.IN_PLAY);
      kickoffRef.current?.();
    }, INTRO_CONFIG.DURATION_MS);
  }, [
    clearComboState,
    clearIntroTimers,
    clearPowerPlayTimers,
    resetPlayers,
    safeResetBall,
  ]);

  const skipIntro = useCallback(() => {
    if (gameState !== GAME_STATES.INTRO) {
      return;
    }

    clearIntroTimers();
    setIntroProgress(1);
    setGameState(GAME_STATES.IN_PLAY);
    kickoffRef.current?.();
  }, [clearIntroTimers, gameState]);

  const togglePause = useCallback(() => {
    setGameState((current) => {
      if (replayActive) {
        return current;
      }

      if (current === GAME_STATES.IN_PLAY) {
        return GAME_STATES.PAUSED;
      }

      if (current === GAME_STATES.PAUSED) {
        return GAME_STATES.IN_PLAY;
      }

      return current;
    });
  }, [replayActive]);

  const movePlayer = useCallback(
    (deltaSeconds) => {
      const input = playerInputRef.current;
      const mappedDirection = mapArrowStateToWorldDirection(input, {
        overrideMode: movementMappingMode,
        cameraMode: cameraPovMode,
        cameraState: cameraTelemetryRef.current,
      });
      const directionX = mappedDirection[0];
      const directionZ = mappedDirection[2];

      const isMoving = directionX !== 0 || directionZ !== 0;

      setPlayerStates((currentStates) => {
        const currentPlayerState = currentStates[activePlayerId];
        if (!currentPlayerState) {
          return currentStates;
        }

        const profile = getPlayerProfile(activePlayerId);
        const currentPosition = currentPlayerState.position;
        const currentRotation = currentPlayerState.rotation;
        const currentStamina = currentPlayerState.stamina;
        const currentStaminaRatio = getStaminaRatio(activePlayerId, currentStamina);
        const isSprinting = isMoving && isSprintHeld && !currentPlayerState.sprintLocked;
        const movementSpeed = computeMovementSpeed(
          profile,
          currentStaminaRatio,
          isSprinting,
          currentPlayerState.sprintLocked
        );

        let nextPosition = currentPosition;
        let nextRotation = currentRotation;

        if (isMoving) {
          const normalizedX = directionX;
          const normalizedZ = directionZ;
          const nextYaw = Math.atan2(normalizedX, normalizedZ);

          const nextX = clamp(
            currentPosition[0] + normalizedX * movementSpeed * deltaSeconds,
            -playerBounds.x,
            playerBounds.x
          );
          const nextZ = clamp(
            currentPosition[2] + normalizedZ * movementSpeed * deltaSeconds,
            -playerBounds.z,
            playerBounds.z
          );

          if (nextX !== currentPosition[0] || nextZ !== currentPosition[2]) {
            nextPosition = [nextX, profile.startPosition[1], nextZ];
          }

          if (Math.abs(currentRotation[1] - nextYaw) >= 0.0001) {
            nextRotation = [0, nextYaw, 0];
          }
        }

        let nextStamina = currentStamina;
        if (isSprinting) {
          nextStamina = clampStamina(
            activePlayerId,
            currentStamina - profile.staminaDrainPerSecSprint * deltaSeconds
          );
        } else {
          nextStamina = clampStamina(
            activePlayerId,
            currentStamina + profile.staminaRegenPerSec * deltaSeconds
          );
        }

        let nextSprintLocked = currentPlayerState.sprintLocked;
        const nextStaminaRatio = getStaminaRatio(activePlayerId, nextStamina);
        if (nextStamina <= 0.0001) {
          nextSprintLocked = true;
        } else if (
          nextSprintLocked &&
          nextStaminaRatio >= PLAYER_STAMINA_CONFIG.SPRINT_REENABLE_RATIO
        ) {
          nextSprintLocked = false;
        }

        const staminaChanged = Math.abs(nextStamina - currentStamina) > 0.0001;
        const positionChanged = nextPosition !== currentPosition;
        const rotationChanged = nextRotation !== currentRotation;
        const sprintLockChanged = nextSprintLocked !== currentPlayerState.sprintLocked;

        if (!staminaChanged && !positionChanged && !rotationChanged && !sprintLockChanged) {
          return currentStates;
        }

        return {
          ...currentStates,
          [activePlayerId]: {
            ...currentPlayerState,
            position: nextPosition,
            rotation: nextRotation,
            stamina: nextStamina,
            sprintLocked: nextSprintLocked,
          },
        };
      });
    },
    [activePlayerId, cameraPovMode, isSprintHeld, movementMappingMode, playerBounds.x, playerBounds.z]
  );

  const mapMovementKeyToForce = useCallback(
    (key, magnitude) =>
      mapSingleArrowKeyToWorldForce(key, magnitude, {
        overrideMode: movementMappingMode,
        cameraMode: cameraPovMode,
        cameraState: cameraTelemetryRef.current,
      }),
    [cameraPovMode, movementMappingMode]
  );

  const handleGoal = useCallback(
    (goalId) => {
      if (!canScore) {
        return;
      }

      const now = nowMs();
      if (now < goalCooldownUntilRef.current) {
        return;
      }

      goalCooldownUntilRef.current = now + GOAL_COOLDOWN_MS;
      setGameState(GAME_STATES.GOAL_SCORED);
      const scoringTeamId = goalId === "teamOne" ? TEAM_IDS.TEAM_ONE : TEAM_IDS.TEAM_TWO;

      if (scoringTeamId === TEAM_IDS.TEAM_ONE) {
        setTeamOneScore((prev) => prev + 1);
      } else {
        setTeamTwoScore((prev) => prev + 1);
      }

      const telemetryEvent = emitTelemetryEvent("goal", { teamId: scoringTeamId });
      setMatchEvent({
        type: "goal",
        teamName: telemetryEvent.teamName,
        id: telemetryEvent.id,
      });
      updateMomentum(scoringTeamId, MATCH_STATS_CONFIG.MOMENTUM_GOAL_SWING);
      replayDirectorRef.current.armReplay(
        {
          type: "goal",
          id: telemetryEvent.id,
        },
        now
      );
      triggerOverlayPulse("goal");
      triggerCameraNudge(1.1);

      if (goalResetTimeoutRef.current) {
        clearTimeout(goalResetTimeoutRef.current);
      }

      goalResetTimeoutRef.current = setTimeout(() => {
        safeResetBall();
        setGameState((current) =>
          current === GAME_STATES.ENDED ? GAME_STATES.ENDED : GAME_STATES.IN_PLAY
        );
      }, BALL_RESET_DELAY_MS);
    },
    [canScore, emitTelemetryEvent, safeResetBall, triggerCameraNudge, triggerOverlayPulse, updateMomentum]
  );

  const handleOutOfBounds = useCallback(() => {
    if (gameState === GAME_STATES.IDLE || gameState === GAME_STATES.ENDED) {
      return;
    }

    safeResetBall();
  }, [gameState, safeResetBall]);

  const handleShotChargeChange = useCallback((nextState) => {
    setShotMeterState(createShotMeterState(nextState));
  }, []);

  const handleKickRelease = useCallback(
    (kickRelease) => {
      if (!kickRelease?.isPerfect) {
        return;
      }

      setMatchEvent({
        type: "perfect_shot",
        id: `perfect-${Date.now()}`,
      });
      triggerOverlayPulse("kick");
      triggerCameraNudge(0.75);
    },
    [triggerCameraNudge, triggerOverlayPulse]
  );

  const handleBallSnapshot = useCallback(
    (snapshot) => {
      setBallSnapshot(snapshot);
      replayDirectorRef.current.pushFrame({
        timestampMs: snapshot.timestampMs,
        ball: snapshot,
        players: PLAYER_IDS.map((playerId) => ({
          playerId,
          position: [...(playerStates[playerId]?.position || [0, 0, 0])],
          rotation: [...(playerStates[playerId]?.rotation || [0, 0, 0])],
        })),
        keepers: [goalkeeperState.teamOne, goalkeeperState.teamTwo].map((keeper) => ({
          teamId: keeper.teamId,
          position: [...keeper.position],
          rotation: [...keeper.rotation],
        })),
        cameraTarget: [...cameraTelemetryRef.current.target],
      });
    },
    [goalkeeperState.teamOne, goalkeeperState.teamTwo, playerStates]
  );

  const handlePossessionChange = useCallback(
    (nextPossession) => {
      setPossessionState((current) => {
        const currentTeamId = current?.teamId || null;
        const currentPlayerId = current?.playerId || null;
        const nextTeamId = nextPossession?.teamId || null;
        const nextPlayerId = nextPossession?.playerId || null;
        if (currentTeamId === nextTeamId && currentPlayerId === nextPlayerId) {
          return current;
        }

        if (nextTeamId) {
          emitTelemetryEvent("possession", { teamId: nextTeamId });
        }

        return nextPossession
          ? {
              teamId: nextTeamId,
              playerId: nextPlayerId,
            }
          : null;
      });
    },
    [emitTelemetryEvent]
  );

  const handlePassCommandConsumed = useCallback((commandId) => {
    setPassCommand((current) => (current?.id === commandId ? null : current));
  }, []);

  const triggerPass = useCallback(() => {
    if (
      !playerControlsEnabled ||
      possessionState?.teamId !== TEAM_IDS.TEAM_ONE ||
      possessionState?.playerId !== activePlayerId
    ) {
      return;
    }

    const now = nowMs();
    if (now < passCooldownUntilRef.current) {
      return;
    }

    const receiverId = getNextTeamOnePlayerId(activePlayerId);
    if (receiverId === activePlayerId) {
      return;
    }

    const passerState = playerStates[activePlayerId];
    const receiverState = playerStates[receiverId];
    if (!passerState || !receiverState) {
      return;
    }

    const [fromX, , fromZ] = passerState.position;
    const [toX, , toZ] = receiverState.position;
    let directionX = toX - fromX;
    let directionZ = toZ - fromZ;
    const distance = Math.hypot(directionX, directionZ);
    if (distance > 0.0001) {
      directionX /= distance;
      directionZ /= distance;
    } else {
      const yaw = Number.isFinite(passerState.rotation?.[1]) ? passerState.rotation[1] : 0;
      directionX = Math.sin(yaw);
      directionZ = Math.cos(yaw);
    }

    const velocity = [
      directionX * PLAYER_PASS_CONFIG.PASS_SPEED,
      PLAYER_PASS_CONFIG.PASS_LOFT,
      directionZ * PLAYER_PASS_CONFIG.PASS_SPEED,
    ];
    const commandId = `pass-${activePlayerId}-${receiverId}-${Math.round(now)}`;
    setPassCommand({
      id: commandId,
      fromPlayerId: activePlayerId,
      toPlayerId: receiverId,
      velocity,
      issuedAtMs: now,
    });
    setActivePlayerId(receiverId);
    passCooldownUntilRef.current = now + PLAYER_PASS_CONFIG.COOLDOWN_MS;
    lastPlayerSwitchAtRef.current = now;
  }, [
    activePlayerId,
    playerControlsEnabled,
    playerStates,
    possessionState?.playerId,
    possessionState?.teamId,
  ]);

  const handleShotEvent = useCallback(
    (shotEvent) => {
      if (!shotEvent || !shotEvent.type) {
        return;
      }

      const teamId = shotEvent.teamId || TEAM_IDS.TEAM_ONE;

      switch (shotEvent.type) {
        case "shot": {
          setMatchStats((previousStats) => ({
            ...previousStats,
            shots: {
              ...previousStats.shots,
              [teamId]: (previousStats.shots[teamId] || 0) + 1,
            },
            onTarget: {
              ...previousStats.onTarget,
              [teamId]: (previousStats.onTarget[teamId] || 0) + 1,
            },
          }));
          updateMomentum(teamId, MATCH_STATS_CONFIG.MOMENTUM_SHOT_SWING);
          emitTelemetryEvent("shot", { teamId });
          break;
        }
        case "save": {
          setMatchStats((previousStats) => ({
            ...previousStats,
            saves: {
              ...previousStats.saves,
              [teamId]: (previousStats.saves[teamId] || 0) + 1,
            },
          }));
          updateMomentum(teamId, MATCH_STATS_CONFIG.MOMENTUM_SAVE_SWING);
          const telemetryEvent = emitTelemetryEvent("save", { teamId });
          setMatchEvent({
            type: "save",
            teamName: telemetryEvent.teamName,
            id: telemetryEvent.id,
          });
          replayDirectorRef.current.armReplay(
            {
              type: "save",
              id: telemetryEvent.id,
            },
            nowMs()
          );
          break;
        }
        case "ball_pop":
          // Ball-pop is a control event and should not impact shot/save metrics.
          emitTelemetryEvent("ball_pop", { teamId });
          break;
        default:
          break;
      }
    },
    [emitTelemetryEvent, updateMomentum]
  );

  const handlePowerZoneEnter = useCallback(
    (zone) => {
      if (gameState !== GAME_STATES.IN_PLAY) {
        return;
      }

      const config = POWER_PLAY_CONFIG.TYPES[zone.type];
      if (!config) {
        return;
      }

      const capturedAt = nowMs();
      const comboWindowActive = comboExpiresAtRef.current > capturedAt && comboStreakRef.current > 0;
      const nextComboStreak = comboWindowActive
        ? Math.min(comboStreakRef.current + 1, COMBO_CONFIG.MAX_STREAK)
        : 1;
      const nextComboMultiplier = clamp(
        1 + nextComboStreak * COMBO_CONFIG.STEP_MULTIPLIER,
        1,
        COMBO_CONFIG.MAX_MULTIPLIER
      );

      comboStreakRef.current = nextComboStreak;
      comboExpiresAtRef.current = capturedAt + COMBO_CONFIG.WINDOW_MS;
      comboPauseRemainingRef.current = 0;

      setComboStreak(nextComboStreak);
      setComboMultiplier(nextComboMultiplier);
      setComboTimeLeftMs(COMBO_CONFIG.WINDOW_MS);
      setActivePowerZone((current) => (current?.id === zone.id ? null : current));

      const expiresAt = capturedAt + POWER_PLAY_CONFIG.BOOST_DURATION_MS;
      setActiveBoost({
        type: zone.type,
        label: config.label,
        color: config.color,
        expiresAt,
      });

      if (boostExpireTimeoutRef.current) {
        clearTimeout(boostExpireTimeoutRef.current);
      }

      boostExpireTimeoutRef.current = setTimeout(() => {
        setActiveBoost(null);
      }, POWER_PLAY_CONFIG.BOOST_DURATION_MS);

      setMatchEvent({
        type: "boost",
        label: config.label,
        comboMultiplier: nextComboMultiplier,
        id: `boost-${Date.now()}`,
      });
      triggerOverlayPulse("boost");
      triggerCameraNudge(0.95);
    },
    [gameState, triggerCameraNudge, triggerOverlayPulse]
  );

  useEffect(() => {
    comboStreakRef.current = comboStreak;
  }, [comboStreak]);

  useReplayOrchestration({
    replayDirectorRef,
    setReplayState,
    setReplayFrame,
    nowMs,
  });

  useEffect(() => {
    if (gameState !== GAME_STATES.IN_PLAY || replayActive) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMatchStats((previousStats) => {
        const teamOneTarget =
          possessionState?.teamId === TEAM_IDS.TEAM_ONE
            ? 0.72
            : possessionState?.teamId === TEAM_IDS.TEAM_TWO
              ? 0.28
              : 0.5;
        const nextTeamOnePossession = clamp(
          lerp(previousStats.possession.teamOne, teamOneTarget, 0.08),
          0.06,
          0.94
        );
        const nextMomentum = lerp(
          previousStats.momentum,
          0,
          MATCH_STATS_CONFIG.MOMENTUM_DECAY_PER_TICK
        );

        return {
          ...previousStats,
          momentum: nextMomentum,
          possession: {
            teamOne: nextTeamOnePossession,
            teamTwo: 1 - nextTeamOnePossession,
          },
        };
      });
    }, 250);

    return () => clearInterval(timer);
  }, [gameState, possessionState?.teamId, replayActive]);

  useOpponentAI({
    enabled: gameState === GAME_STATES.IN_PLAY && !replayActive,
    ballSnapshot,
    difficulty,
    aiConfig: AI_CONFIG,
    teamOnePlayerIds: TEAM_ONE_PLAYER_IDS,
    teamTwoPlayerIds: TEAM_TWO_PLAYER_IDS,
    teamIds: TEAM_IDS,
    teamGoalTargets: TEAM_GOAL_TARGETS,
    createInitialOpponentState,
    getPlayerProfile,
    updateOpponentController,
    setPlayerStates,
    setOpponentAiStates,
    setExternalBallCommand,
    aiLastUpdateAtRef,
    nowMs,
  });

  useGoalkeeperAI({
    enabled: gameState === GAME_STATES.IN_PLAY && !replayActive,
    ballSnapshot,
    difficulty,
    goalkeeperConfig: GOALKEEPER_CONFIG,
    updateGoalkeeperController,
    setGoalkeeperState,
    setExternalBallCommand,
    goalkeeperLastUpdateAtRef,
    nowMs,
  });

  usePowerPlay({
    activePowerZone,
    activeBoost,
    gameState,
    inPlayState: GAME_STATES.IN_PLAY,
    spawnDelayMs: POWER_PLAY_CONFIG.SPAWN_DELAY_MS,
    spawnPowerZone,
    powerZoneSpawnTimeoutRef,
    powerZoneExpireTimeoutRef,
    setActivePowerZone,
    setBoostTimeLeftMs,
    nowMs,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateQuality = () => {
      setQualityMode(detectQualityMode());
    };

    const updateMotionPreference = (event) => {
      if (event?.matches !== undefined) {
        setPrefersReducedMotion(event.matches);
        return;
      }

      if (typeof window.matchMedia === "function") {
        setPrefersReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
    };

    updateQuality();
    updateMotionPreference();

    const cleanupCallbacks = [];
    if (typeof window.matchMedia === "function") {
      const coarseQuery = window.matchMedia("(pointer: coarse)");
      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      cleanupCallbacks.push(bindMediaQueryListener(coarseQuery, updateQuality));
      cleanupCallbacks.push(bindMediaQueryListener(motionQuery, updateMotionPreference));
    }

    window.addEventListener("resize", updateQuality);

    return () => {
      window.removeEventListener("resize", updateQuality);
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    if (gameState !== GAME_STATES.IN_PLAY || replayActive) {
      return undefined;
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          setGameState(GAME_STATES.ENDED);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, replayActive]);

  useEffect(() => {
    const halfTimeMark = Math.ceil(MATCH_DURATION_SECONDS / 2);
    if (gameState !== GAME_STATES.IN_PLAY || halftimeTriggeredRef.current || timeLeft !== halfTimeMark) {
      return;
    }

    halftimeTriggeredRef.current = true;
    setMatchEvent({
      type: "halftime",
      id: `halftime-${Date.now()}`,
    });
  }, [gameState, timeLeft]);

  useEffect(() => {
    if (!matchEvent) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setMatchEvent((current) => (current?.id === matchEvent.id ? null : current));
    }, 1800);

    return () => clearTimeout(timeout);
  }, [matchEvent]);

  useEffect(() => {
    if (gameState === GAME_STATES.ENDED && previousGameStateRef.current !== GAME_STATES.ENDED) {
      setMatchEvent({
        type: "end",
        id: `end-${Date.now()}`,
      });
      clearComboState();
      setShotMeterState(createShotMeterState());
      setActiveBoost(null);
      setActivePowerZone(null);
    }

    previousGameStateRef.current = gameState;
  }, [clearComboState, gameState]);

  useEffect(() => {
    if (gameState !== GAME_STATES.IN_PLAY || comboStreak <= 0) {
      return undefined;
    }

    if (comboExpiresAtRef.current === 0) {
      comboExpiresAtRef.current = nowMs() + COMBO_CONFIG.WINDOW_MS;
    }

    const timer = setInterval(() => {
      const remainingMs = Math.max(0, comboExpiresAtRef.current - nowMs());
      setComboTimeLeftMs(remainingMs);

      if (remainingMs <= 0) {
        clearComboState();
      }
    }, 100);

    return () => clearInterval(timer);
  }, [clearComboState, comboStreak, gameState]);

  useEffect(() => {
    if (comboStreak <= 0) {
      return;
    }

    if (gameState === GAME_STATES.PAUSED) {
      if (comboExpiresAtRef.current > 0) {
        comboPauseRemainingRef.current = Math.max(0, comboExpiresAtRef.current - nowMs());
        comboExpiresAtRef.current = 0;
        setComboTimeLeftMs(comboPauseRemainingRef.current);
      }
      return;
    }

    if (
      gameState === GAME_STATES.IN_PLAY &&
      comboExpiresAtRef.current === 0 &&
      comboPauseRemainingRef.current > 0
    ) {
      comboExpiresAtRef.current = nowMs() + comboPauseRemainingRef.current;
      comboPauseRemainingRef.current = 0;
    }
  }, [comboStreak, gameState]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const normalizedKey = typeof event.key === "string" ? event.key.toLowerCase() : "";

      if ((event.key === "r" || event.key === "R") && replayState.canSkip) {
        event.preventDefault();
        replayDirectorRef.current.skip(nowMs());
        return;
      }

      const activeElement = typeof document !== "undefined" ? document.activeElement : null;
      const cameraHotkeysEnabled =
        !isEditableElement(activeElement) &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey;

      if (cameraHotkeysEnabled && !event.repeat && (normalizedKey === "q" || normalizedKey === "e")) {
        event.preventDefault();
        setCameraPovMode((currentMode) => {
          const currentIndex = CAMERA_POV_OPTIONS.findIndex((option) => option.value === currentMode);
          const safeIndex = currentIndex >= 0 ? currentIndex : 0;
          const direction = normalizedKey === "e" ? 1 : -1;
          const nextIndex =
            (safeIndex + direction + CAMERA_POV_OPTIONS.length) % CAMERA_POV_OPTIONS.length;
          return CAMERA_POV_OPTIONS[nextIndex].value;
        });
        return;
      }

      if (cameraHotkeysEnabled && !event.repeat && /^[1-8]$/.test(normalizedKey)) {
        const directIndex = Number.parseInt(normalizedKey, 10) - 1;
        if (directIndex >= 0 && directIndex < CAMERA_POV_OPTIONS.length) {
          event.preventDefault();
          setCameraPovMode(CAMERA_POV_OPTIONS[directIndex].value);
          return;
        }
      }

      if (event.key === PLAYER_SWITCH_CONFIG.KEY) {
        event.preventDefault();
        if (!playerControlsEnabled) {
          return;
        }
        if (possessionState?.teamId === TEAM_IDS.TEAM_ONE) {
          return;
        }
        const now = nowMs();
        if (now - lastPlayerSwitchAtRef.current < PLAYER_SWITCH_CONFIG.COOLDOWN_MS) {
          return;
        }
        setActivePlayerId((current) => getNextTeamOnePlayerId(current));
        lastPlayerSwitchAtRef.current = now;
        return;
      }

      if (!playerControlsEnabled) {
        return;
      }

      if (normalizedKey === PLAYER_PASS_CONFIG.KEY) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        triggerPass();
        return;
      }

      if (normalizedKey === PLAYER_SPRINT_KEY) {
        event.preventDefault();
        setIsSprintHeld(true);
        return;
      }

      if (!(event.key in playerInputRef.current)) {
        return;
      }

      event.preventDefault();
      playerInputRef.current[event.key] = true;
    };

    const handleKeyUp = (event) => {
      const normalizedKey = typeof event.key === "string" ? event.key.toLowerCase() : "";
      if (normalizedKey === PLAYER_SPRINT_KEY) {
        setIsSprintHeld(false);
        return;
      }

      if (!(event.key in playerInputRef.current)) {
        return;
      }

      playerInputRef.current[event.key] = false;
    };

    const handleWindowBlur = () => {
      clearPlayerInput();
      setIsSprintHeld(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    clearPlayerInput,
    playerControlsEnabled,
    possessionState?.teamId,
    replayState.canSkip,
    triggerPass,
  ]);

  useEffect(() => {
    if (!playerControlsEnabled) {
      clearPlayerInput();
      setIsSprintHeld(false);
      setShotMeterState(createShotMeterState());
      return undefined;
    }

    const timer = setInterval(() => {
      movePlayer(1 / 60);
    }, 16);

    return () => clearInterval(timer);
  }, [clearPlayerInput, movePlayer, playerControlsEnabled]);

  useEffect(() => {
    return () => {
      if (goalResetTimeoutRef.current) {
        clearTimeout(goalResetTimeoutRef.current);
      }

      if (overlayPulseTimeoutRef.current) {
        clearTimeout(overlayPulseTimeoutRef.current);
      }

      if (cameraNudgeTimeoutRef.current) {
        clearTimeout(cameraNudgeTimeoutRef.current);
      }

      clearIntroTimers();
      clearPowerPlayTimers();
      clearPlayerInput();
    };
  }, [clearIntroTimers, clearPlayerInput, clearPowerPlayTimers]);

  return (
    <div
      className={`app-shell quality-${qualityMode}${
        prefersReducedMotion ? " reduced-motion" : ""
      }`}
    >
      <BroadcastScoreboard
        teamOne={TEAM_ONE}
        teamTwo={TEAM_TWO}
        teamOneScore={teamOneScore}
        teamTwoScore={teamTwoScore}
        timeLeft={timeLeft}
        gameState={gameState}
        matchEvent={matchEvent}
        pulseType={overlayPulseType}
      />
      <MatchEventBanner event={matchEvent} />

      <div className={`overlay${overlayPulseType ? ` pulse-${overlayPulseType}` : ""}`}>
        <div className="overlay-header">
          <h1>Soccer 3D</h1>
          <p className="status-label">
            Status: {statusText(gameState)}
            {replayState.isPlaying ? " | Replay" : ""}
          </p>
        </div>

        <p className="fixture-label">
          <span>{TEAM_ONE.name}</span>
          <span className="fixture-vs">vs</span>
          <span>{TEAM_TWO.name}</span>
        </p>

        <p className="active-player-chip" data-testid="active-player-label">
          <span>Active Player:</span>
          <strong>{activeProfile.label}</strong>
          <span>{activePlayerStrength}</span>
          <span className="active-player-speed">{activeMovementSpeed.toFixed(1)} SPD</span>
        </p>

        <p className={`boost-label ${activeBoost ? "is-active" : ""}`}>
          Boost:{" "}
          {activeBoost
            ? `${activeBoost.label} ${Math.max(1, Math.ceil(boostTimeLeftMs / 1000))}s x${appliedComboMultiplier.toFixed(2)}`
            : "None"}
        </p>

        <p
          className={`combo-label ${comboStreak > 0 ? "is-active" : ""}${
            comboWarning ? " is-warning" : ""
          }`}
          data-testid="combo-status"
        >
          Combo:{" "}
          {comboStreak > 0
            ? `x${comboMultiplier.toFixed(2)} | Streak ${comboStreak} | ${Math.max(
                0.1,
                comboTimeLeftMs / 1000
              ).toFixed(1)}s`
            : "None"}
        </p>

        {showShotMeter && (
          <div
            className={`shot-meter${playerControlsEnabled ? " is-active" : ""}${
              shotMeterState.isCharging ? " is-charging" : ""
            }${shotMeterState.isPerfect ? " is-perfect" : ""}`}
            data-testid="shot-meter"
          >
            <span className="shot-meter-row">
              <span>Shot Meter</span>
              <strong data-testid="shot-meter-value">{shotMeterPercent}%</strong>
            </span>
            <div className="shot-meter-track" aria-hidden="true">
              <span className="shot-meter-fill" style={{ width: `${shotMeterPercent}%` }} />
              <span
                className="shot-meter-perfect-window"
                style={{
                  left: `${perfectWindowStartPercent}%`,
                  width: `${perfectWindowWidthPercent}%`,
                }}
              />
            </div>
            <small className="shot-meter-hint">
              {playerControlsEnabled
                ? shotMeterState.isCharging
                  ? shotMeterState.isPerfect
                    ? "Perfect window"
                    : "Charging shot"
                  : "Hold D, release to shoot"
                : "Shot meter activates during live player control"}
            </small>
          </div>
        )}

        {showShotMeter && (
          <div className={`stamina-meter ${staminaToneClass}`} data-testid="stamina-meter">
            <span className="stamina-meter-row">
              <span>
                Stamina: <strong data-testid="stamina-value">{activeStaminaPercent}%</strong>
              </span>
              <span data-testid="sprint-state">Sprint: {sprintStatusLabel}</span>
            </span>
            <div className="stamina-meter-track" aria-hidden="true">
              <span className="stamina-meter-fill" style={{ width: `${activeStaminaPercent}%` }} />
            </div>
          </div>
        )}

        <label className="slider-wrap">
          <span className="slider-row">
            <span>Ball Size</span>
            <strong className="slider-value">{ballScale.toFixed(2)}</strong>
          </span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={ballScale}
            aria-label="Ball Size"
            onChange={(event) => setBallScale(parseFloat(event.target.value))}
          />
        </label>

        <label className="slider-wrap camera-pov-wrap">
          <span className="slider-row">
            <span>Camera POV</span>
            <strong className="slider-value">
              {CAMERA_POV_OPTIONS.find((option) => option.value === cameraPovMode)?.label || "Custom"}
            </strong>
          </span>
          <select
            className="camera-pov-select"
            aria-label="Camera POV"
            value={cameraPovMode}
            onChange={(event) => setCameraPovMode(event.target.value)}
          >
            {CAMERA_POV_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="slider-wrap camera-pov-wrap">
          <span className="slider-row">
            <span>Movement Mapping</span>
            <strong className="slider-value">
              {MOVEMENT_MAPPING_OPTIONS.find((option) => option.value === movementMappingMode)
                ?.label || "Auto (Per Camera)"}
            </strong>
          </span>
          <select
            className="camera-pov-select"
            aria-label="Movement Mapping"
            value={movementMappingMode}
            onChange={(event) => setMovementMappingMode(event.target.value)}
            disabled={replayState.isPlaying}
          >
            {MOVEMENT_MAPPING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="controls">
          <button
            className={controlTarget === CONTROL_TARGETS.PLAYER ? "btn-primary" : "btn-ghost"}
            onClick={() => setControlTarget(CONTROL_TARGETS.PLAYER)}
            type="button"
            aria-pressed={controlTarget === CONTROL_TARGETS.PLAYER}
          >
            Control Player
          </button>

          <button
            className={controlTarget === CONTROL_TARGETS.BALL ? "btn-primary" : "btn-ghost"}
            onClick={() => setControlTarget(CONTROL_TARGETS.BALL)}
            type="button"
            aria-pressed={controlTarget === CONTROL_TARGETS.BALL}
          >
            Control Ball
          </button>

          {!matchStarted && (
            <button className="btn-primary" onClick={startMatch} type="button">
              Start Match
            </button>
          )}

          {gameState === GAME_STATES.INTRO && (
            <button className="btn-ghost" onClick={skipIntro} type="button">
              Skip Intro
            </button>
          )}

          {(gameState === GAME_STATES.IN_PLAY || gameState === GAME_STATES.PAUSED) && (
            <button
              className={gameState === GAME_STATES.PAUSED ? "btn-primary" : "btn-warning"}
              onClick={togglePause}
              type="button"
              disabled={replayState.isPlaying}
            >
              {gameState === GAME_STATES.PAUSED ? "Resume" : "Pause"}
            </button>
          )}

          {matchStarted && (
            <button className="btn-ghost" onClick={safeResetBall} type="button">
              Reset Ball
            </button>
          )}

          {matchStarted && (
            <button className="btn-danger" onClick={startMatch} type="button">
              Restart Match
            </button>
          )}
        </div>

        <p className="help-text">
          {controlTarget === CONTROL_TARGETS.PLAYER
            ? "Controls: Arrow keys move your player. Hold A to sprint. Touch the ball to dribble, hold D to charge, release to kick. Press S to pass to your teammate. Press Tab to switch players when Team One has no possession."
            : "Controls: Arrow keys move the ball and D pops it upward. Switch to Player mode to run the player."}{" "}
          Capture power-play zones quickly to build combo multipliers. Press R to skip replay. Camera hotkeys: Q/E
          cycle POV and 1-8 jumps to camera slots. Movement Mapping lets you force camera-relative or world-relative
          movement.
        </p>

        <MatchStoryPanel
          matchStats={matchStats}
          eventTimeline={eventTimeline}
          replayState={replayState}
          aiState={primaryOpponentAiState}
          difficulty={difficulty}
        />
      </div>

      <Canvas
        shadows
        dpr={canvasDpr}
        style={{ height: "100vh", width: "100vw" }}
        gl={{ antialias: true }}
      >
        <PerspectiveCamera ref={cameraRef} makeDefault position={cameraPosition} fov={cameraFov} />
        <CameraDirector
          cameraRef={cameraRef}
          mode={cameraPovMode}
          ballPosition={cameraBallPosition}
          playerPositions={cameraPlayerPositions}
          goalkeeperPositions={cameraKeeperPositions}
          activePlayerPosition={activePlayerState.position}
          replayFrame={replayFrame}
          isReplay={replayState.isPlaying}
          introProgress={introProgress}
          gameState={gameState}
          cameraNudge={cameraNudge}
          onCameraStateChange={handleCameraStateChange}
        />
        <fog attach="fog" args={["#04101f", 120, 410]} />
        <hemisphereLight skyColor="#8ed4ff" groundColor="#1f2c42" intensity={0.62} />
        <directionalLight
          position={[28, 45, 26]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
        />
        <Environment preset="city" />

        <OrbitControls
          enablePan
          enabled={gameState !== GAME_STATES.INTRO && freeRoamCameraEnabled}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={0}
          maxDistance={340}
          minDistance={55}
          target={[0, 0, 0]}
        />

        <Suspense fallback={<LoadingFallback />}>
          <Physics gravity={[0, -9.81, 0]} iterations={12} tolerance={0.0001}>
            <SoccerField activePowerZone={activePowerZone} />
            {PLAYER_IDS.map((playerId) => {
              const profile = getPlayerProfile(playerId);
              const replayPlayer = replayFrame?.players?.find((item) => item.playerId === playerId);
              const playerState = playerStates[playerId] || {
                position: [...profile.startPosition],
                rotation: [...profile.startRotation],
              };
              const renderedPosition = replayPlayer?.position || playerState.position;
              const renderedRotation = replayPlayer?.rotation || playerState.rotation;
              const isTeamOnePlayer = TEAM_ONE_PLAYER_IDS.includes(playerId);
              const opponentAiState = opponentAiStates[playerId];
              const animationState = isTeamOnePlayer
                ? playerId === activePlayerId
                  ? playerOneAnimationState
                  : "track"
                : getOpponentAnimationState(opponentAiState);
              const animationBlend = isTeamOnePlayer
                ? playerId === activePlayerId && playerControlsEnabled && isSprintHeld
                  ? 1
                  : 0.35
                : opponentAiState?.mode === OPPONENT_STATES.INTERCEPT
                  ? 0.9
                  : opponentAiState?.mode === OPPONENT_STATES.TRACK
                    ? 0.7
                    : 0.2;

              return (
                <SoccerPlayer
                  key={playerId}
                  playerId={playerId}
                  position={renderedPosition}
                  rotation={renderedRotation}
                  isActive={playerId === activePlayerId && isTeamOnePlayer}
                  kitVariant={isTeamOnePlayer ? "primary" : "secondary"}
                  animationState={animationState}
                  animationBlend={animationBlend}
                  celebrationLevel={celebrationLevel}
                />
              );
            })}

            {[
              { id: "keeper-team-one", teamKey: TEAM_IDS.TEAM_ONE, kitVariant: "primary" },
              { id: "keeper-team-two", teamKey: TEAM_IDS.TEAM_TWO, kitVariant: "secondary" },
            ].map((keeperEntry) => {
              const keeper = goalkeeperState[keeperEntry.teamKey];
              const replayKeeper = replayFrame?.keepers?.find(
                (entry) => entry.teamId === keeperEntry.teamKey
              );


              

              return (
                <SoccerPlayer
                  key={keeperEntry.id}
                  playerId={keeperEntry.id}
                  position={replayKeeper?.position || keeper.position}
                  rotation={replayKeeper?.rotation || keeper.rotation}
                  isActive={false}
                  kitVariant={keeperEntry.kitVariant}
                  animationState={
                    keeperEntry.teamKey === TEAM_IDS.TEAM_ONE
                      ? keeperOneAnimationState
                      : keeperTwoAnimationState
                  }
                  animationBlend={0.9}
                  isGoalkeeper
                  celebrationLevel={celebrationLevel * 0.5}
                />
              );
            })}

            {matchStarted && (
              <SoccerBallModel
                key={`ball-${ballScale.toFixed(1)}`}
                scale={ballScale}
                resetRef={ballResetRef}
                kickoffRef={kickoffRef}
                externalBallCommand={externalBallCommand}
                controlsEnabled={ballControlsEnabled}
                mapMovementKeyToForce={mapMovementKeyToForce}
                teamOnePlayers={TEAM_ONE_PLAYER_IDS.map((playerId) => ({
                  playerId,
                  position: playerStates[playerId]?.position || getPlayerProfile(playerId).startPosition,
                  rotation: playerStates[playerId]?.rotation || getPlayerProfile(playerId).startRotation,
                }))}
                playerControlsEnabled={playerControlsEnabled}
                passCommand={passCommand}
                onPassCommandConsumed={handlePassCommandConsumed}
                onOutOfBounds={handleOutOfBounds}
                activePowerZone={activePowerZone}
                onPowerZoneEnter={handlePowerZoneEnter}
                speedMultiplier={speedMultiplier}
                shotPowerMultiplier={shotPowerMultiplier}
                controlAssistMultiplier={controlAssistMultiplier}
                onShotChargeChange={handleShotChargeChange}
                onKickRelease={handleKickRelease}
                onBallSnapshot={handleBallSnapshot}
                onPossessionChange={handlePossessionChange}
                onShotEvent={handleShotEvent}
                replayActive={replayState.isPlaying}
                replayFrameBall={replayFrame?.ball || null}
              />
            )}

            <GoalNet
              position={[0, 0.5, -78]}
              scale={GOAL_CONFIG.SCALE}
              rotation={[0, 0, 0]}
              goalId="teamOne"
              active={canScore}
              onGoal={handleGoal}
            />
            <GoalNet
              position={[0, 0.5, 78]}
              scale={GOAL_CONFIG.SCALE}
              rotation={[0, Math.PI, 0]}
              goalId="teamTwo"
              active={canScore}
              onGoal={handleGoal}
            />
          </Physics>

          {gameState === GAME_STATES.INTRO && (
            <IntroSequenceOverlay
              introProgress={introProgress}
              teamOneName={TEAM_ONE.name}
              teamTwoName={TEAM_TWO.name}
            />
          )}

          {gameState === GAME_STATES.ENDED && (
            <EndMatchScoreboard3D
              teamOneScore={teamOneScore}
              teamTwoScore={teamTwoScore}
              teamOneName={TEAM_ONE.name}
              teamTwoName={TEAM_TWO.name}
            />
          )}
        </Suspense>
      </Canvas>
    </div>

  );

  
}



export default App;
