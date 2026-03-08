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
import useOutfieldAI from "./hooks/useOutfieldAI";
import usePowerPlay from "./hooks/usePowerPlay";
import useReplayOrchestration from "./hooks/useReplayOrchestration";
import {
  buildLobClearCommand,
  buildPassCommand,
  buildRestartPassCommand,
  buildTackleCommand,
} from "./input/playerCommands";
import { MATCH_EVENT_TYPES } from "./match/events";
import {
  classifyOutOfBoundsRestart,
  createKickoffRestartSetup,
  createRestartSetup,
  RESTART_TYPES,
} from "./match/restarts";
import {
  buildTeamGoalTargets,
  createInitialTeamAttackDirections,
  createOutfieldRosterForAttackDirections,
  createPlayerStatesForAttackDirections,
  flipTeamAttackDirections,
  getGoalAssignments,
  getTeamAttackDirection,
} from "./match/teamDirections";
import { createReplayDirector } from "./replay/ReplayDirector";
import {
  BALL_ZONES,
  createInitialOutfieldAiState,
  deriveCpuPhaseLabel,
  OUTFIELD_STATES,
  updateOutfieldController,
} from "./ai/outfieldController";
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
  GOALKEEPER_PROFILES,
  GOAL_COOLDOWN_MS,
  INTRO_CONFIG,
  KICKOFF_CONFIG,
  MATCH_STATS_CONFIG,
  MATCH_DURATION_SECONDS,
  OUTFIELD_ROSTER,
  PLAYER_LOB_CLEAR_CONFIG,
  PLAYER_PASS_CONFIG,
  PLAYER_IDS,
  PLAYER_PROFILES,
  PLAYER_STAMINA_CONFIG,
  PLAYER_TACKLE_CONFIG,
  PLAYER_SWITCH_CONFIG,
  TEAM_IDS,
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

const PLAYER_BOUNDARY_MARGIN = 2;
const PLAYER_SPRINT_KEY = "a";
const ACTIVE_PLAYER_STRENGTHS = {
  player_one: "Kick + Speed",
  player_two: "Support Runner",
};
const DEFAULT_OUTFIELD_PROFILE = PLAYER_PROFILES[PLAYER_IDS[0]];
const GOALKEEPER_PROFILES_BY_PLAYER_ID = Object.values(GOALKEEPER_PROFILES).reduce(
  (profilesByPlayerId, profile) => {
    profilesByPlayerId[profile.playerId] = {
      ...DEFAULT_OUTFIELD_PROFILE,
      ...profile,
      startPosition: [...profile.spawnPosition],
      startRotation: [...profile.spawnRotation],
      spawnPosition: [...profile.spawnPosition],
      spawnRotation: [...profile.spawnRotation],
      kickPowerMultiplier: 1,
      sprintMultiplier: 1,
    };
    return profilesByPlayerId;
  },
  {}
);
const INITIAL_TEAM_ATTACK_DIRECTIONS = createInitialTeamAttackDirections();
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

const DIFFICULTY_OPTIONS = [
  {
    value: "easy",
    label: "Easy",
    detail: "More space, slower pressure",
  },
  {
    value: "normal",
    label: "Normal",
    detail: "Balanced match pace",
  },
  {
    value: "hard",
    label: "Hard",
    detail: "Faster pressure and earlier shots",
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

function createPendingRestartState(
  restartSetup,
  delayMs,
  status,
  commandId = null,
  id = null,
  extraState = {}
) {
  if (!restartSetup) {
    return null;
  }

  return {
    id: id || `${restartSetup.type}-${restartSetup.takerId}-${Math.round(nowMs())}`,
    type: restartSetup.type,
    teamId: restartSetup.teamId,
    takerId: restartSetup.takerId,
    receiverId: restartSetup.receiverId,
    spotPosition: [...restartSetup.spotPosition],
    receiverPosition: Array.isArray(restartSetup.receiverPosition)
      ? [...restartSetup.receiverPosition]
      : null,
    delayMs,
    commandId,
    status,
    ...extraState,
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
  return (
    PLAYER_PROFILES[playerId] ||
    GOALKEEPER_PROFILES_BY_PLAYER_ID[playerId] ||
    PLAYER_PROFILES[PLAYER_IDS[0]]
  );
}

function createInitialPlayerStates(teamAttackDirections = createInitialTeamAttackDirections()) {
  return createPlayerStatesForAttackDirections(teamAttackDirections);
}

function createInitialOutfieldAiStates(outfieldRoster = OUTFIELD_ROSTER) {
  return outfieldRoster.reduce((accumulator, player) => {
    accumulator[player.playerId] = createInitialOutfieldAiState(player.spawnPosition);
    return accumulator;
  }, {});
}

function createInitialGoalkeeperStates(teamAttackDirections = createInitialTeamAttackDirections()) {
  return {
    teamOne: createInitialGoalkeeperState(TEAM_IDS.TEAM_ONE, { teamAttackDirections }),
    teamTwo: createInitialGoalkeeperState(TEAM_IDS.TEAM_TWO, { teamAttackDirections }),
  };
}

function createInitialTeamAttackMemory() {
  return {
    [TEAM_IDS.TEAM_ONE]: {
      possessionStartMs: null,
      ballZone: BALL_ZONES.MIDFIELD,
      actionLocks: {},
    },
    [TEAM_IDS.TEAM_TWO]: {
      possessionStartMs: null,
      ballZone: BALL_ZONES.MIDFIELD,
      actionLocks: {},
    },
  };
}

function isCpuBallActionCommand(command) {
  if (!command) {
    return false;
  }

  return TEAM_TWO_PLAYER_IDS.includes(command.actorId) || command.id?.startsWith("cpu-") === true;
}

function createScenarioPlayerStates(overrides = {}) {
  const nextStates = createInitialPlayerStates();

  Object.entries(overrides).forEach(([playerId, override]) => {
    if (!nextStates[playerId]) {
      return;
    }

    nextStates[playerId] = {
      ...nextStates[playerId],
      ...override,
      position: override.position ? [...override.position] : nextStates[playerId].position,
      rotation: override.rotation ? [...override.rotation] : nextStates[playerId].rotation,
    };
  });

  return nextStates;
}

function createScenarioGoalkeeperState(overrides = {}) {
  const nextState = createInitialGoalkeeperStates();

  Object.entries(overrides).forEach(([teamId, override]) => {
    if (!nextState[teamId]) {
      return;
    }

    nextState[teamId] = {
      ...nextState[teamId],
      ...override,
      position: override.position ? [...override.position] : nextState[teamId].position,
      rotation: override.rotation ? [...override.rotation] : nextState[teamId].rotation,
    };
  });

  return nextState;
}

function getOpposingTeamId(teamId) {
  return teamId === TEAM_IDS.TEAM_ONE ? TEAM_IDS.TEAM_TWO : TEAM_IDS.TEAM_ONE;
}

function getNextTeamOnePlayerId(activePlayerId) {
  const currentIndex = TEAM_ONE_PLAYER_IDS.indexOf(activePlayerId);
  if (currentIndex === -1) {
    return TEAM_ONE_PLAYER_IDS[0];
  }

  return TEAM_ONE_PLAYER_IDS[(currentIndex + 1) % TEAM_ONE_PLAYER_IDS.length];
}

function getBestDefensivePlayerId(
  playerStates,
  ballSnapshot,
  currentActivePlayerId,
  teamOneAttackDirection
) {
  if (!ballSnapshot?.position) {
    return getNextTeamOnePlayerId(currentActivePlayerId);
  }

  const [ballX, , ballZ] = ballSnapshot.position;
  const defendDirection = -teamOneAttackDirection;
  const opponentDriveBiasZ = ballZ * defendDirection > 0 ? 1.15 : 1;

  const scoredPlayers = TEAM_ONE_PLAYER_IDS.filter((playerId) => playerId !== currentActivePlayerId)
    .map((playerId) => {
      const playerState = playerStates[playerId];
      if (!playerState) {
        return null;
      }

      const distanceToBall = Math.hypot(
        playerState.position[0] - ballX,
        playerState.position[2] - ballZ
      );
      const directionOfPlayBias =
        Math.max(0, playerState.position[2] * defendDirection) * opponentDriveBiasZ;
      const laneBias = Math.max(0, 20 - Math.abs(playerState.position[0] - ballX));
      const score = distanceToBall * 0.68 - directionOfPlayBias * 0.06 - laneBias * 0.04;

      return { playerId, score };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score);

  return scoredPlayers[0]?.playerId || getNextTeamOnePlayerId(currentActivePlayerId);
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

function interpolateVector(from, to, alpha) {
  return [
    lerp(from[0], to[0], alpha),
    lerp(from[1], to[1], alpha),
    lerp(from[2], to[2], alpha),
  ];
}

function resolveScoringTeamId(goalDescriptor, goalAssignments) {
  if (goalDescriptor === TEAM_IDS.TEAM_ONE || goalDescriptor === "teamOne") {
    return TEAM_IDS.TEAM_ONE;
  }

  if (goalDescriptor === TEAM_IDS.TEAM_TWO || goalDescriptor === "teamTwo") {
    return TEAM_IDS.TEAM_TWO;
  }

  return goalDescriptor === "negativeZ" ? goalAssignments.negativeZ : goalAssignments.positiveZ;
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
    case GAME_STATES.KICKOFF:
      return "Kickoff";
    case GAME_STATES.RESTART:
      return "Restart";
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
    case GAME_STATES.KICKOFF:
      return "Kickoff";
    case GAME_STATES.RESTART:
      return "Restart";
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
    gameState === GAME_STATES.GOAL_SCORED || matchEvent?.type === MATCH_EVENT_TYPES.GOAL
      ? "is-goal"
      : "",
    matchEvent?.type === MATCH_EVENT_TYPES.HALFTIME ? "is-halftime" : "",
    gameState === GAME_STATES.ENDED || matchEvent?.type === MATCH_EVENT_TYPES.END
      ? "is-end"
      : "",
    matchEvent?.type === MATCH_EVENT_TYPES.BOOST ? "is-boost" : "",
    matchEvent?.type === MATCH_EVENT_TYPES.SAVE ? "is-save" : "",
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

  if (event.type === MATCH_EVENT_TYPES.GOAL) {
    return <p className="match-event-banner event-goal">{event.teamName.toUpperCase()} GOAL</p>;
  }

  if (event.type === MATCH_EVENT_TYPES.HALFTIME) {
    return <p className="match-event-banner event-halftime">HALF-TIME</p>;
  }

  if (event.type === MATCH_EVENT_TYPES.BOOST) {
    return (
      <p className="match-event-banner event-boost">
        {event.label.toUpperCase()} BOOST x{event.comboMultiplier.toFixed(2)}
      </p>
    );
  }

  if (event.type === "perfect_shot") {
    return <p className="match-event-banner event-perfect">PERFECT SHOT</p>;
  }

  if (event.type === MATCH_EVENT_TYPES.SAVE) {
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
  const [difficulty, setDifficulty] = useState(AI_CONFIG.DEFAULT_DIFFICULTY);
  const [aiPaceMultiplier, setAiPaceMultiplier] = useState(0.85);
  const [ballScale, setBallScale] = useState(1);
  const [teamOneScore, setTeamOneScore] = useState(0);
  const [teamTwoScore, setTeamTwoScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MATCH_DURATION_SECONDS);
  const [currentHalf, setCurrentHalf] = useState(1);
  const [teamAttackDirections, setTeamAttackDirections] = useState(() => ({
    ...INITIAL_TEAM_ATTACK_DIRECTIONS,
  }));
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [introProgress, setIntroProgress] = useState(0);
  const [activePowerZone, setActivePowerZone] = useState(null);
  const [activeBoost, setActiveBoost] = useState(null);
  const [boostTimeLeftMs, setBoostTimeLeftMs] = useState(0);
  const [matchEvent, setMatchEvent] = useState(null);
  const [controlTarget, setControlTarget] = useState(CONTROL_TARGETS.PLAYER);
  const [cameraPovMode, setCameraPovMode] = useState(CAMERA_CONFIG.MODES.BROADCAST_WIDE);
  const [movementMappingMode, setMovementMappingMode] = useState(MOVEMENT_MAPPING_MODES.AUTO);
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const [playerStates, setPlayerStates] = useState(() =>
    createInitialPlayerStates(INITIAL_TEAM_ATTACK_DIRECTIONS)
  );
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
  const [outfieldAiStates, setOutfieldAiStates] = useState(() =>
    createInitialOutfieldAiStates(
      createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, INITIAL_TEAM_ATTACK_DIRECTIONS)
    )
  );
  const [goalkeeperState, setGoalkeeperState] = useState(() =>
    createInitialGoalkeeperStates(INITIAL_TEAM_ATTACK_DIRECTIONS)
  );
  const [, setCameraState] = useState(() => createInitialCameraState());
  const [replayState, setReplayState] = useState(() => createInitialReplayState());
  const [replayFrame, setReplayFrame] = useState(null);
  const [matchStats, setMatchStats] = useState(() => createInitialMatchStats());
  const [eventTimeline, setEventTimeline] = useState([]);
  const [ballSnapshot, setBallSnapshot] = useState(null);
  const [ballActionCommand, setBallActionCommand] = useState(null);
  const [tackleCommand, setTackleCommand] = useState(null);
  const [possessionState, setPossessionState] = useState(null);
  const [pendingRestart, setPendingRestart] = useState(null);

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
  const lobClearCooldownUntilRef = useRef(0);
  const tackleCooldownUntilRef = useRef(0);
  const matchEventIdRef = useRef(0);
  const aiLastUpdateAtRef = useRef(0);
  const goalkeeperLastUpdateAtRef = useRef(0);
  const lastPossessionTickAtRef = useRef(0);
  const pendingGoalReplayResetRef = useRef(null);
  const pendingControlTransferRef = useRef(null);
  const pendingKickoffRef = useRef(null);
  const kickoffCommandTimeoutRef = useRef(null);
  const keeperPuntSequenceRef = useRef(null);
  const lastKickoffRef = useRef(null);
  const teamAttackMemoryRef = useRef(createInitialTeamAttackMemory());
  const teamAttackDirectionsRef = useRef({
    ...INITIAL_TEAM_ATTACK_DIRECTIONS,
  });
  const previousReplayPlayingRef = useRef(false);
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
  const aiPacePercent = Math.round(aiPaceMultiplier * 100);
  const shotMeterPercent = Math.round(shotMeterState.chargeRatio * 100);
  const perfectWindowStartPercent = Math.round(SHOT_METER_CONFIG.PERFECT_WINDOW_START * 100);
  const perfectWindowWidthPercent = Math.max(
    0,
    Math.round((SHOT_METER_CONFIG.PERFECT_WINDOW_END - SHOT_METER_CONFIG.PERFECT_WINDOW_START) * 100)
  );
  const comboWarning = comboStreak > 0 && comboTimeLeftMs <= COMBO_CONFIG.HUD_WARNING_MS;
  const outfieldRoster = useMemo(
    () => createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, teamAttackDirections),
    [teamAttackDirections]
  );
  const teamGoalTargets = useMemo(
    () => buildTeamGoalTargets(teamAttackDirections),
    [teamAttackDirections]
  );
  const goalAssignments = useMemo(
    () => getGoalAssignments(teamAttackDirections),
    [teamAttackDirections]
  );
  const teamOneAttackDirection = getTeamAttackDirection(
    teamAttackDirections,
    TEAM_IDS.TEAM_ONE
  );
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
  const getOutfieldAnimationState = useCallback((outfieldAiState) => {
    if (!outfieldAiState) {
      return "idle";
    }
    if (outfieldAiState.mode === OUTFIELD_STATES.SHOOT) {
      return "shoot";
    }
    if (outfieldAiState.mode === OUTFIELD_STATES.PRESS) {
      return "intercept";
    }
    if (
      outfieldAiState.mode === OUTFIELD_STATES.CARRY ||
      outfieldAiState.mode === OUTFIELD_STATES.SUPPORT ||
      outfieldAiState.mode === OUTFIELD_STATES.RECEIVE
    ) {
      return "track";
    }
    if (outfieldAiState.mode === OUTFIELD_STATES.RECOVER) {
      return "track";
    }
    return "idle";
  }, []);
  const primaryOpponentSpawnPosition =
    outfieldRoster.find((player) => player.playerId === TEAM_TWO_PLAYER_IDS[0])?.spawnPosition ||
    getPlayerProfile(TEAM_TWO_PLAYER_IDS[0]).spawnPosition;
  const primaryOpponentAiState =
    outfieldAiStates[TEAM_TWO_PLAYER_IDS[0]] ||
    createInitialOutfieldAiState(primaryOpponentSpawnPosition);
  const cpuPhaseLabel = deriveCpuPhaseLabel({
    teamId: TEAM_IDS.TEAM_TWO,
    possessionState,
    aiStates: TEAM_TWO_PLAYER_IDS.map((playerId) => outfieldAiStates[playerId]),
  });
  const possessionOwnerLabel = possessionState
    ? possessionState.teamId === TEAM_IDS.TEAM_ONE
      ? getPlayerProfile(possessionState.playerId).label
      : getPlayerProfile(possessionState.playerId).label
    : "Loose Ball";
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
  const protectedPossessionTeamId =
    possessionState && GOALKEEPER_PROFILES_BY_PLAYER_ID[possessionState.playerId]
      ? possessionState.teamId
      : null;
  const ballActors = useMemo(
    () => [
      ...outfieldRoster.map((player) => ({
        ...player,
        position: playerStates[player.playerId]?.position || player.spawnPosition,
        rotation: playerStates[player.playerId]?.rotation || player.spawnRotation,
      })),
      ...Object.values(GOALKEEPER_PROFILES).map((keeperProfile) => {
        const keeperState = goalkeeperState[keeperProfile.teamId];
        return {
          ...keeperProfile,
          position: keeperState?.position || keeperProfile.spawnPosition,
          rotation: keeperState?.rotation || keeperProfile.spawnRotation,
        };
      }),
    ],
    [goalkeeperState, outfieldRoster, playerStates]
  );
  const canvasDpr = qualityMode === "mobile" ? [1, 1.2] : [1, 1.5];
  const shadowMapSize = qualityMode === "mobile" ? 512 : 1024;
  const replayBallPosition = replayFrame?.ball?.position || null;
  const liveBallPosition = ballSnapshot?.position || [0, 0, 0];
  const cameraBallPosition = replayBallPosition || liveBallPosition;
  const playerPositionsForCamera = useMemo(
    () =>
      PLAYER_IDS.map((playerId) => {
        const profile =
          outfieldRoster.find((player) => player.playerId === playerId) || getPlayerProfile(playerId);
        const state = playerStates[playerId];
        return state?.position || [...(profile.spawnPosition || profile.startPosition)];
      }),
    [outfieldRoster, playerStates]
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
  const selectedDifficultyOption =
    DIFFICULTY_OPTIONS.find((option) => option.value === difficulty) || DIFFICULTY_OPTIONS[1];
  const selectedCameraOption =
    CAMERA_POV_OPTIONS.find((option) => option.value === cameraPovMode) || CAMERA_POV_OPTIONS[0];
  const optionsPanel = optionsExpanded ? (
    <div className="options-panel" data-testid="options-panel">
      <div className="options-panel-header">
        <strong>Advanced Options</strong>
        <span>Tune physics, pace, and fallback selectors.</span>
      </div>

      {matchStarted && (
        <>
          <section className="selection-section is-compact">
            <div className="selection-heading">
              <strong>Difficulty</strong>
              <span>{selectedDifficultyOption.detail}</span>
            </div>
            <div className="selection-grid selection-grid-three">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`selection-card${difficulty === option.value ? " is-active" : ""}`}
                  onClick={() => setDifficulty(option.value)}
                  type="button"
                  aria-pressed={difficulty === option.value}
                >
                  <span className="selection-card-label">{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="selection-section is-compact">
            <div className="selection-heading">
              <strong>Camera POV</strong>
              <span>{selectedCameraOption.label}</span>
            </div>
            <div className="selection-grid selection-grid-camera">
              {CAMERA_POV_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`selection-card selection-card-compact${
                    cameraPovMode === option.value ? " is-active" : ""
                  }`}
                  onClick={() => setCameraPovMode(option.value)}
                  type="button"
                  aria-pressed={cameraPovMode === option.value}
                >
                  <span className="selection-card-label">{option.label}</span>
                </button>
              ))}
            </div>
          </section>
        </>
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

      <label className="slider-wrap">
        <span className="slider-row">
          <span>AI Pace</span>
          <strong className="slider-value">{aiPacePercent}%</strong>
        </span>
        <input
          type="range"
          min="0.6"
          max="1.15"
          step="0.05"
          value={aiPaceMultiplier}
          aria-label="AI Pace"
          onChange={(event) => setAiPaceMultiplier(parseFloat(event.target.value))}
        />
      </label>

      <label className="slider-wrap camera-pov-wrap">
        <span className="slider-row">
          <span>Difficulty</span>
          <strong className="slider-value">{difficulty}</strong>
        </span>
        <select
          className="camera-pov-select"
          aria-label="Difficulty"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
        >
          <option value="easy">easy</option>
          <option value="normal">normal</option>
          <option value="hard">hard</option>
        </select>
      </label>

      <label className="slider-wrap camera-pov-wrap">
        <span className="slider-row">
          <span>Camera POV</span>
          <strong className="slider-value">{selectedCameraOption.label}</strong>
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
            {MOVEMENT_MAPPING_OPTIONS.find((option) => option.value === movementMappingMode)?.label ||
              "Auto (Per Camera)"}
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
    </div>
  ) : null;

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

  const safeResetBall = useCallback((resetOptions = null) => {
    ballResetRef.current?.(resetOptions);
  }, []);

  const clearOutfieldAttackMemory = useCallback(() => {
    teamAttackMemoryRef.current = createInitialTeamAttackMemory();
  }, []);

  const clearCpuAutomationState = useCallback(() => {
    clearOutfieldAttackMemory();
    setBallActionCommand((currentCommand) =>
      isCpuBallActionCommand(currentCommand) ? null : currentCommand
    );
  }, [clearOutfieldAttackMemory]);

  const clearPlayerInput = useCallback(() => {
    playerInputRef.current.ArrowUp = false;
    playerInputRef.current.ArrowDown = false;
    playerInputRef.current.ArrowLeft = false;
    playerInputRef.current.ArrowRight = false;
  }, []);

  const applyTeamAttackDirections = useCallback((nextTeamAttackDirections) => {
    teamAttackDirectionsRef.current = {
      [TEAM_IDS.TEAM_ONE]: getTeamAttackDirection(nextTeamAttackDirections, TEAM_IDS.TEAM_ONE),
      [TEAM_IDS.TEAM_TWO]: getTeamAttackDirection(nextTeamAttackDirections, TEAM_IDS.TEAM_TWO),
    };
    setTeamAttackDirections(teamAttackDirectionsRef.current);
  }, []);

  const resetPlayers = useCallback((nextTeamAttackDirections = teamAttackDirectionsRef.current) => {
    clearPlayerInput();
    setIsSprintHeld(false);
    setActivePlayerId(TEAM_ONE_PLAYER_IDS[0]);
    setPlayerStates(createInitialPlayerStates(nextTeamAttackDirections));
    pendingControlTransferRef.current = null;
    lastPlayerSwitchAtRef.current = 0;
    passCooldownUntilRef.current = 0;
    lobClearCooldownUntilRef.current = 0;
    tackleCooldownUntilRef.current = 0;
  }, [clearPlayerInput]);

  const clearKickoffSequence = useCallback(() => {
    if (kickoffCommandTimeoutRef.current) {
      clearTimeout(kickoffCommandTimeoutRef.current);
      kickoffCommandTimeoutRef.current = null;
    }

    pendingKickoffRef.current = null;
    keeperPuntSequenceRef.current = null;
    setPendingRestart(null);
  }, []);

  const resetFieldForRestart = useCallback((restartSetup) => {
    const activeDirections = restartSetup?.teamAttackDirections || teamAttackDirectionsRef.current;
    clearCpuAutomationState();
    resetPlayers(activeDirections);
    setPlayerStates(restartSetup.playerStates);
    setOutfieldAiStates(
      createInitialOutfieldAiStates(
        createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, activeDirections)
      )
    );
    setGoalkeeperState(createInitialGoalkeeperStates(activeDirections));
    setBallActionCommand(null);
    setTackleCommand(null);
    setPossessionState(null);
    aiLastUpdateAtRef.current = 0;
    goalkeeperLastUpdateAtRef.current = 0;
    return restartSetup;
  }, [clearCpuAutomationState, resetPlayers]);

  const startRestart = useCallback(
    (nextRestartSetup, delayMs = 0) => {
      clearKickoffSequence();
      const restartSetup = resetFieldForRestart(nextRestartSetup);
      const restartSequenceId = `restart-seq-${restartSetup.type}-${restartSetup.takerId}-${Math.round(
        nowMs()
      )}`;

      setPendingRestart(
        createPendingRestartState(
          restartSetup,
          delayMs,
          delayMs > 0 ? "staged" : "arming",
          null,
          restartSequenceId
        )
      );

      if (restartSetup.type === RESTART_TYPES.KICKOFF) {
        lastKickoffRef.current = {
          id: restartSequenceId,
          commandId: null,
          teamId: restartSetup.teamId,
          takerId: restartSetup.takerId,
          receiverId: restartSetup.receiverId,
          status: delayMs > 0 ? "staged" : "arming",
        };
      } else {
        lastKickoffRef.current = null;
      }

      setGameState((current) => {
        if (current === GAME_STATES.ENDED) {
          return GAME_STATES.ENDED;
        }

        return restartSetup.type === RESTART_TYPES.KICKOFF
          ? GAME_STATES.KICKOFF
          : GAME_STATES.RESTART;
      });

      const launchRestart = () => {
        const kickoffHandle = kickoffRef.current;
        if (!kickoffHandle) {
          setPendingRestart((current) =>
            current?.id === restartSequenceId ? { ...current, status: "failed" } : current
          );
          lastKickoffRef.current = lastKickoffRef.current
            ? { ...lastKickoffRef.current, status: "failed" }
            : null;
          safeResetBall();
          setGameState((current) =>
            current === GAME_STATES.ENDED ? GAME_STATES.ENDED : GAME_STATES.IN_PLAY
          );
          return;
        }

        const command = buildRestartPassCommand({
          type: restartSetup.type,
          actorId: restartSetup.takerId,
          receiverId: restartSetup.receiverId,
          receiverPosition: restartSetup.receiverPosition,
          nowMs: nowMs(),
          teamId: restartSetup.teamId,
        });
        pendingKickoffRef.current = {
          commandId: command.id,
          restartId: restartSequenceId,
          type: restartSetup.type,
          teamId: restartSetup.teamId,
        };
        setPendingRestart((current) =>
          current?.id === restartSequenceId
            ? { ...current, commandId: command.id, status: "launched" }
            : current
        );

        if (restartSetup.type === RESTART_TYPES.KICKOFF) {
          lastKickoffRef.current = lastKickoffRef.current
            ? { ...lastKickoffRef.current, commandId: command.id, status: "launched" }
            : null;
        }

        emitTelemetryEvent(restartSetup.type, { teamId: restartSetup.teamId });
        kickoffHandle({
          id: `setup-${command.id}`,
          type: restartSetup.type,
          teamId: restartSetup.teamId,
          takerId: restartSetup.takerId,
          spotPosition: restartSetup.spotPosition,
        });
        setBallActionCommand(command);
      };

      if (delayMs > 0) {
        kickoffCommandTimeoutRef.current = setTimeout(() => {
          kickoffCommandTimeoutRef.current = null;
          launchRestart();
        }, delayMs);
        return;
      }

      launchRestart();
    },
    [clearKickoffSequence, emitTelemetryEvent, resetFieldForRestart, safeResetBall]
  );

  const startKickoffRestart = useCallback(
    (kickingTeamId, delayMs = 0, nextTeamAttackDirections = teamAttackDirectionsRef.current) => {
      startRestart(createKickoffRestartSetup(kickingTeamId, nextTeamAttackDirections), delayMs);
    },
    [startRestart]
  );

  const startKeeperPuntRestart = useCallback(
    (keeperTeamId, keeperPlayerId) => {
      const activeDirections = teamAttackDirectionsRef.current;
      const keeper = goalkeeperState[keeperTeamId];
      if (!keeper || !keeperPlayerId) {
        return;
      }

      clearKickoffSequence();
      clearCpuAutomationState();
      clearPlayerInput();
      setIsSprintHeld(false);
      pendingControlTransferRef.current = null;
      setBallActionCommand(null);
      setTackleCommand(null);
      aiLastUpdateAtRef.current = 0;
      goalkeeperLastUpdateAtRef.current = 0;

      const now = nowMs();
      const attackDirection = getTeamAttackDirection(activeDirections, keeperTeamId);
      const teamPlayerIds =
        keeperTeamId === TEAM_IDS.TEAM_ONE ? TEAM_ONE_PLAYER_IDS : TEAM_TWO_PLAYER_IDS;
      const holdingRestartId = `restart-seq-${RESTART_TYPES.KEEPER_PUNT}-${keeperPlayerId}-${Math.round(
        now
      )}`;
      const spotPosition = [
        clamp(keeper.position[0], -10, 10),
        0,
        clamp(
          keeper.position[2],
          -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 8,
          FIELD_CONFIG.BOUNDARY.Z_LIMIT - 8
        ),
      ];
      const initialTargets = createInitialPlayerStates(activeDirections);
      const preferredReceiver = teamPlayerIds
        .map((playerId) => {
          const playerState = playerStates[playerId] || initialTargets[playerId];
          if (!playerState) {
            return null;
          }

          return {
            playerId,
            position: [...playerState.position],
            progress: playerState.position[2] * attackDirection,
            widthPenalty: Math.abs(playerState.position[0]),
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (right.progress !== left.progress) {
            return right.progress - left.progress;
          }

          return left.widthPenalty - right.widthPenalty;
        })[0] || null;
      const fallbackReceiverPosition = [
        0,
        0,
        clamp(
          spotPosition[2] + attackDirection * 34,
          -FIELD_CONFIG.BOUNDARY.Z_LIMIT + 4,
          FIELD_CONFIG.BOUNDARY.Z_LIMIT - 4
        ),
      ];
      const restartSetup = createRestartSetup({
        type: RESTART_TYPES.KEEPER_PUNT,
        teamId: keeperTeamId,
        spotPosition,
        teamAttackDirections: activeDirections,
        takerId: keeperPlayerId,
        receiverId: preferredReceiver?.playerId || null,
        receiverPosition: preferredReceiver?.position || fallbackReceiverPosition,
      });
      const targetGoalkeeperStates = createInitialGoalkeeperStates(activeDirections);
      targetGoalkeeperStates[keeperTeamId] = {
        ...targetGoalkeeperStates[keeperTeamId],
        ...keeper,
        mode: GOALKEEPER_STATES.DISTRIBUTE,
        position: [...restartSetup.spotPosition],
        rotation: [...(keeper.rotation || targetGoalkeeperStates[keeperTeamId].rotation)],
      };

      keeperPuntSequenceRef.current = {
        id: holdingRestartId,
        possessionKey: `${keeperTeamId}-${keeperPlayerId}-${Math.round(now)}`,
        startedAtMs: now,
        holdUntilMs: now + GOALKEEPER_CONFIG.RESTART_HOLD_MS,
        teamId: keeperTeamId,
        keeperPlayerId,
        originPlayerStates: PLAYER_IDS.reduce((result, playerId) => {
          const state = playerStates[playerId] || restartSetup.playerStates[playerId];
          result[playerId] = {
            position: [...(state?.position || getPlayerProfile(playerId).startPosition)],
            rotation: [...(state?.rotation || getPlayerProfile(playerId).startRotation)],
          };
          return result;
        }, {}),
        targetPlayerStates: restartSetup.playerStates,
        targetGoalkeeperStates,
        restartSetup,
      };

      setGoalkeeperState(targetGoalkeeperStates);
      setOutfieldAiStates(
        createInitialOutfieldAiStates(
          createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, activeDirections)
        )
      );
      setPendingRestart(
        createPendingRestartState(
          restartSetup,
          GOALKEEPER_CONFIG.RESTART_HOLD_MS,
          "staged",
          null,
          holdingRestartId,
          {
            createdAtMs: now,
            holdUntilMs: now + GOALKEEPER_CONFIG.RESTART_HOLD_MS,
            progress: 0,
          }
        )
      );
      setGameState((current) =>
        current === GAME_STATES.ENDED ? GAME_STATES.ENDED : GAME_STATES.RESTART
      );
    },
    [
      clearCpuAutomationState,
      clearKickoffSequence,
      clearPlayerInput,
      goalkeeperState,
      nowMs,
      playerStates,
    ]
  );

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
    const initialTeamDirections = createInitialTeamAttackDirections();
    clearIntroTimers();
    clearPowerPlayTimers();
    clearComboState();
    clearKickoffSequence();
    clearCpuAutomationState();
    if (goalResetTimeoutRef.current) {
      clearTimeout(goalResetTimeoutRef.current);
      goalResetTimeoutRef.current = null;
    }

    pendingGoalReplayResetRef.current = null;
    goalCooldownUntilRef.current = 0;
    setTeamOneScore(0);
    setTeamTwoScore(0);
    setTimeLeft(MATCH_DURATION_SECONDS);
    setCurrentHalf(1);
    setOptionsExpanded(false);
    applyTeamAttackDirections(initialTeamDirections);
    setActivePowerZone(null);
    setActiveBoost(null);
    setBoostTimeLeftMs(0);
    setMatchEvent(null);
    setEventTimeline([]);
    setShotMeterState(createShotMeterState());
    setOutfieldAiStates(
      createInitialOutfieldAiStates(
        createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, initialTeamDirections)
      )
    );
    setGoalkeeperState(createInitialGoalkeeperStates(initialTeamDirections));
    setMatchStats(createInitialMatchStats());
    const initialCameraState = {
      ...createInitialCameraState(),
      mode: cameraPovMode,
    };
    cameraTelemetryRef.current = initialCameraState;
    setCameraState(initialCameraState);
    setReplayState(createInitialReplayState());
    setReplayFrame(null);
    setBallSnapshot(null);
    setBallActionCommand(null);
    setTackleCommand(null);
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
    resetPlayers(initialTeamDirections);

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
      startKickoffRestart(TEAM_IDS.TEAM_ONE, 0, initialTeamDirections);
    }, INTRO_CONFIG.DURATION_MS);
  }, [
    applyTeamAttackDirections,
    clearComboState,
    clearCpuAutomationState,
    clearIntroTimers,
    clearKickoffSequence,
    clearPowerPlayTimers,
    cameraPovMode,
    resetPlayers,
    safeResetBall,
    startKickoffRestart,
  ]);

  const skipIntro = useCallback(() => {
    if (gameState !== GAME_STATES.INTRO) {
      return;
    }

    clearIntroTimers();
    setIntroProgress(1);
    startKickoffRestart(TEAM_IDS.TEAM_ONE, 0, teamAttackDirectionsRef.current);
  }, [clearIntroTimers, gameState, startKickoffRestart]);

  const togglePause = useCallback(() => {
    if (gameState === GAME_STATES.IN_PLAY || gameState === GAME_STATES.PAUSED) {
      clearCpuAutomationState();
    }

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
  }, [clearCpuAutomationState, gameState, replayActive]);

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
    (goalDescriptor) => {
      if (!canScore) {
        return;
      }

      const now = nowMs();
      if (now < goalCooldownUntilRef.current) {
        return;
      }

      goalCooldownUntilRef.current = now + GOAL_COOLDOWN_MS;
      clearCpuAutomationState();
      setPendingRestart(null);
      setGameState(GAME_STATES.GOAL_SCORED);
      const scoringTeamId = resolveScoringTeamId(goalDescriptor, goalAssignments);
      const kickoffTeamId = getOpposingTeamId(scoringTeamId);

      if (scoringTeamId === TEAM_IDS.TEAM_ONE) {
        setTeamOneScore((prev) => prev + 1);
      } else {
        setTeamTwoScore((prev) => prev + 1);
      }

      const telemetryEvent = emitTelemetryEvent(MATCH_EVENT_TYPES.GOAL, { teamId: scoringTeamId });
      setMatchEvent({
        type: MATCH_EVENT_TYPES.GOAL,
        teamName: telemetryEvent.teamName,
        id: telemetryEvent.id,
      });
      updateMomentum(scoringTeamId, MATCH_STATS_CONFIG.MOMENTUM_GOAL_SWING);
      const replayArmed = replayDirectorRef.current.armReplay(
        {
          type: MATCH_EVENT_TYPES.GOAL,
          id: telemetryEvent.id,
        },
        now
      );
      triggerOverlayPulse("goal");
      triggerCameraNudge(1.1);

      if (goalResetTimeoutRef.current) {
        clearTimeout(goalResetTimeoutRef.current);
        goalResetTimeoutRef.current = null;
      }

      if (replayArmed) {
        pendingGoalReplayResetRef.current = {
          eventId: telemetryEvent.id,
          kickoffTeamId,
          playbackStarted: false,
        };
        return;
      }

      pendingGoalReplayResetRef.current = null;
      goalResetTimeoutRef.current = setTimeout(() => {
        startKickoffRestart(kickoffTeamId);
        goalResetTimeoutRef.current = null;
      }, BALL_RESET_DELAY_MS);
    },
    [
      canScore,
      clearCpuAutomationState,
      emitTelemetryEvent,
      goalAssignments,
      startKickoffRestart,
      triggerCameraNudge,
      triggerOverlayPulse,
      updateMomentum,
    ]
  );

  const handleOutOfBounds = useCallback((outOfBoundsSnapshot) => {
    if (gameState !== GAME_STATES.IN_PLAY || replayActive) {
      return;
    }

    const restartDecision = classifyOutOfBoundsRestart(
      outOfBoundsSnapshot,
      teamAttackDirectionsRef.current
    );
    if (!restartDecision) {
      safeResetBall();
      return;
    }

    startRestart(
      createRestartSetup({
        ...restartDecision,
        teamAttackDirections: teamAttackDirectionsRef.current,
      }),
      restartDecision.delayMs
    );
  }, [gameState, replayActive, safeResetBall, startRestart]);

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
          emitTelemetryEvent(MATCH_EVENT_TYPES.POSSESSION, { teamId: nextTeamId });
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

  const handleBallActionResolved = useCallback((resolution) => {
    setBallActionCommand((current) => (current?.id === resolution?.id ? null : current));
    if (
      resolution?.accepted &&
      resolution.type === "pass" &&
      resolution.targetPlayerId &&
      pendingControlTransferRef.current?.commandId === resolution.id
    ) {
      setActivePlayerId(resolution.targetPlayerId);
      lastPlayerSwitchAtRef.current = nowMs();
    }

    if (pendingControlTransferRef.current?.commandId === resolution?.id) {
      pendingControlTransferRef.current = null;
    }

    if (pendingKickoffRef.current?.commandId === resolution?.id) {
      const pendingRestartResolution = pendingKickoffRef.current;
      setPendingRestart((current) =>
        current?.id === pendingRestartResolution.restartId
          ? {
              ...current,
              commandId: resolution.id,
              status: resolution.accepted ? "completed" : "failed",
            }
          : current
      );

      lastKickoffRef.current =
        pendingRestartResolution.type === RESTART_TYPES.KICKOFF &&
        lastKickoffRef.current &&
        lastKickoffRef.current.id === pendingRestartResolution.restartId
          ? {
              ...lastKickoffRef.current,
              commandId: resolution.id,
              status: resolution.accepted ? "completed" : "failed",
            }
          : lastKickoffRef.current;
      pendingKickoffRef.current = null;
      if (!resolution?.accepted) {
        safeResetBall();
      }
      setGameState((current) =>
        current === GAME_STATES.ENDED ? GAME_STATES.ENDED : GAME_STATES.IN_PLAY
      );
    }
  }, [safeResetBall]);

  const handleTackleResolved = useCallback((resolution) => {
    setTackleCommand((current) => (current?.id === resolution?.id ? null : current));
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

    const command = buildPassCommand({
      actorId: activePlayerId,
      receiverId,
      receiverPosition: receiverState.position,
      nowMs: now,
    });
    pendingControlTransferRef.current = {
      commandId: command.id,
      receiverId,
    };
    setBallActionCommand(command);
    passCooldownUntilRef.current = now + PLAYER_PASS_CONFIG.COOLDOWN_MS;
  }, [
    activePlayerId,
    playerControlsEnabled,
    playerStates,
      possessionState?.playerId,
      possessionState?.teamId,
  ]);

  const triggerLobClear = useCallback(() => {
    if (
      !playerControlsEnabled ||
      possessionState?.teamId !== TEAM_IDS.TEAM_ONE ||
      possessionState?.playerId !== activePlayerId
    ) {
      return;
    }

    const now = nowMs();
    if (now < lobClearCooldownUntilRef.current) {
      return;
    }

    const actorState = playerStates[activePlayerId];
    if (!actorState) {
      return;
    }

    setBallActionCommand(
      buildLobClearCommand({
        actorId: activePlayerId,
        actorPosition: actorState.position,
        actorRotation: actorState.rotation,
        nowMs: now,
        teamId: TEAM_IDS.TEAM_ONE,
      })
    );
    lobClearCooldownUntilRef.current = now + PLAYER_LOB_CLEAR_CONFIG.COOLDOWN_MS;
  }, [
    activePlayerId,
    nowMs,
    playerControlsEnabled,
    playerStates,
    possessionState?.playerId,
    possessionState?.teamId,
  ]);

  const triggerTackle = useCallback(() => {
    if (
      !playerControlsEnabled ||
      possessionState?.teamId !== TEAM_IDS.TEAM_TWO ||
      !activePlayerId ||
      tackleCommand?.id
    ) {
      return;
    }

    const now = nowMs();
    if (now < tackleCooldownUntilRef.current) {
      return;
    }

    tackleCooldownUntilRef.current = now + PLAYER_TACKLE_CONFIG.COOLDOWN_MS;
    setTackleCommand(
      buildTackleCommand({
        actorId: activePlayerId,
        carrierId: possessionState.playerId,
        nowMs: now,
      })
    );
  }, [
    activePlayerId,
    nowMs,
    playerControlsEnabled,
    possessionState?.playerId,
    possessionState?.teamId,
    tackleCommand?.id,
  ]);

  const handleShotEvent = useCallback(
    (shotEvent) => {
      if (!shotEvent || !shotEvent.type) {
        return;
      }

      const teamId = shotEvent.teamId || TEAM_IDS.TEAM_ONE;

      switch (shotEvent.type) {
        case MATCH_EVENT_TYPES.SHOT: {
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
          emitTelemetryEvent(MATCH_EVENT_TYPES.SHOT, { teamId });
          break;
        }
        case MATCH_EVENT_TYPES.SAVE: {
          setMatchStats((previousStats) => ({
            ...previousStats,
            saves: {
              ...previousStats.saves,
              [teamId]: (previousStats.saves[teamId] || 0) + 1,
            },
          }));
          updateMomentum(teamId, MATCH_STATS_CONFIG.MOMENTUM_SAVE_SWING);
          const telemetryEvent = emitTelemetryEvent(MATCH_EVENT_TYPES.SAVE, { teamId });
          setMatchEvent({
            type: MATCH_EVENT_TYPES.SAVE,
            teamName: telemetryEvent.teamName,
            id: telemetryEvent.id,
          });
          replayDirectorRef.current.armReplay(
            {
              type: MATCH_EVENT_TYPES.SAVE,
              id: telemetryEvent.id,
            },
            nowMs()
          );
          break;
        }
        case MATCH_EVENT_TYPES.BALL_POP:
          // Ball-pop is a control event and should not impact shot/save metrics.
          emitTelemetryEvent(MATCH_EVENT_TYPES.BALL_POP, { teamId });
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

      const telemetryEvent = emitTelemetryEvent(MATCH_EVENT_TYPES.POWER_PLAY, {
        teamId: possessionState?.teamId || null,
        label: config.label,
      });
      setMatchEvent({
        type: MATCH_EVENT_TYPES.BOOST,
        label: config.label,
        comboMultiplier: nextComboMultiplier,
        id: telemetryEvent.id,
      });
      triggerOverlayPulse("boost");
      triggerCameraNudge(0.95);
    },
    [emitTelemetryEvent, gameState, possessionState?.teamId, triggerCameraNudge, triggerOverlayPulse]
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
    if (previousReplayPlayingRef.current === replayState.isPlaying) {
      return;
    }

    previousReplayPlayingRef.current = replayState.isPlaying;
    clearCpuAutomationState();
  }, [clearCpuAutomationState, replayState.isPlaying]);

  useEffect(() => {
    const pendingReplayReset = pendingGoalReplayResetRef.current;
    if (!pendingReplayReset) {
      return;
    }

    const isMatchingReplay = replayState.eventId === pendingReplayReset.eventId;
    if (replayState.isPlaying && isMatchingReplay) {
      pendingReplayReset.playbackStarted = true;
      return;
    }

    const replayFinished =
      pendingReplayReset.playbackStarted &&
      !replayState.isPlaying &&
      (isMatchingReplay ||
        replayState.mode === REPLAY_CONFIG.STATE.COOLDOWN ||
        replayState.mode === REPLAY_CONFIG.STATE.IDLE);
    const replayFailedToStart = isMatchingReplay && replayState.mode === REPLAY_CONFIG.STATE.IDLE;
    if (!replayFinished && !replayFailedToStart) {
      return;
    }

    pendingGoalReplayResetRef.current = null;
    if (goalResetTimeoutRef.current) {
      clearTimeout(goalResetTimeoutRef.current);
      goalResetTimeoutRef.current = null;
    }

    startKickoffRestart(pendingReplayReset.kickoffTeamId, KICKOFF_CONFIG.POST_GOAL_DELAY_MS);
  }, [
    replayState.eventId,
    replayState.isPlaying,
    replayState.mode,
    startKickoffRestart,
  ]);

  const stageE2EScenario = useCallback(
    (scenarioName) => {
      const scenarios = {
        teamTwoAttack: {
          activePlayerId: TEAM_ONE_PLAYER_IDS[0],
          playerStates: createScenarioPlayerStates({
            player_one: {
              position: [-12, 0, 48],
              rotation: [0, Math.PI, 0],
            },
            player_two: {
              position: [10, 0, 42],
              rotation: [0, Math.PI, 0],
            },
            opponent_one: {
              position: [6, 0, 73.5],
              rotation: [0, 0.03, 0],
            },
            opponent_two: {
              position: [13, 0, 60],
              rotation: [0, -0.05, 0],
            },
          }),
          goalkeeperState: createScenarioGoalkeeperState({
            teamOne: {
              position: [-19, 0, 72.5],
              rotation: [0, Math.PI, 0],
            },
          }),
          ballReset: {
            attach: true,
            actorId: "opponent_one",
          },
        },
        teamTwoTackle: {
          activePlayerId: TEAM_ONE_PLAYER_IDS[0],
          playerStates: createScenarioPlayerStates({
            player_one: {
              position: [1.9, 0, 9.5],
              rotation: [0, -1.87, 0],
            },
            player_two: {
              position: [8, 0, 18],
              rotation: [0, Math.PI, 0],
            },
            opponent_one: {
              position: [0, 0, 8.9],
              rotation: [0, 0, 0],
            },
            opponent_two: {
              position: [-7, 0, 4.8],
              rotation: [0, 0.18, 0],
            },
          }),
          ballReset: {
            attach: true,
            actorId: "opponent_one",
          },
        },
        teamTwoPress: {
          activePlayerId: TEAM_ONE_PLAYER_IDS[0],
          playerStates: createScenarioPlayerStates({
            player_one: {
              position: [0, 0, 10],
              rotation: [0, Math.PI, 0],
            },
            player_two: {
              position: [10, 0, 16],
              rotation: [0, Math.PI, 0],
            },
            opponent_one: {
              position: [1, 0, 9.4],
              rotation: [0, 0, 0],
            },
            opponent_two: {
              position: [-3.2, 0, 8.8],
              rotation: [0, 0, 0],
            },
          }),
          ballReset: {
            attach: true,
            actorId: "player_one",
          },
        },
        teamOneCarry: {
          activePlayerId: TEAM_ONE_PLAYER_IDS[0],
          playerStates: createScenarioPlayerStates({
            player_one: {
              position: [0, 0, 6],
              rotation: [0, 0, 0],
            },
            player_two: {
              position: [12, 0, 18],
              rotation: [0, 0.2, 0],
            },
            opponent_one: {
              position: [-6, 0, 28],
              rotation: [0, Math.PI, 0],
            },
            opponent_two: {
              position: [8, 0, 34],
              rotation: [0, Math.PI, 0],
            },
          }),
          ballReset: {
            attach: true,
            actorId: "player_one",
          },
        },
        teamOneKeeperCatch: {
          activePlayerId: TEAM_ONE_PLAYER_IDS[1],
          playerStates: createScenarioPlayerStates({
            player_one: {
              position: [-16, 0, 18],
              rotation: [0, Math.PI, 0],
            },
            player_two: {
              position: [14, 0, 12],
              rotation: [0, Math.PI, 0],
            },
            opponent_one: {
              position: [-8, 0, 54],
              rotation: [0, 0, 0],
            },
            opponent_two: {
              position: [10, 0, 48],
              rotation: [0, 0, 0],
            },
          }),
          goalkeeperState: createScenarioGoalkeeperState({
            teamOne: {
              position: [3, 0, 64],
              rotation: [0, Math.PI, 0],
            },
          }),
          ballReset: {
            attach: true,
            actorId: "keeper-team-one",
          },
        },
      };
      const selectedScenario = scenarios[scenarioName];

      if (!selectedScenario) {
        return false;
      }

      const initialTeamDirections = createInitialTeamAttackDirections();
      clearIntroTimers();
      clearPowerPlayTimers();
      clearComboState();
      clearKickoffSequence();
      clearCpuAutomationState();
      if (goalResetTimeoutRef.current) {
        clearTimeout(goalResetTimeoutRef.current);
        goalResetTimeoutRef.current = null;
      }

      pendingGoalReplayResetRef.current = null;
      lastKickoffRef.current = null;
      setCurrentHalf(1);
      setOptionsExpanded(false);
      applyTeamAttackDirections(initialTeamDirections);
      setActivePowerZone(null);
      setActiveBoost(null);
      setBoostTimeLeftMs(0);
      setMatchEvent(null);
      setReplayState(createInitialReplayState());
      setReplayFrame(null);
      setBallSnapshot(null);
      setBallActionCommand(null);
      setTackleCommand(null);
      setPossessionState(null);
      setOutfieldAiStates(
        createInitialOutfieldAiStates(
          createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, initialTeamDirections)
        )
      );
      setGoalkeeperState(createInitialGoalkeeperStates(initialTeamDirections));
      setShotMeterState(createShotMeterState());
      setOverlayPulseType(null);
      setCameraNudge([0, 0, 0]);
      setGameState(GAME_STATES.PAUSED);
      aiLastUpdateAtRef.current = 0;
      goalkeeperLastUpdateAtRef.current = 0;
      tackleCooldownUntilRef.current = 0;

      setTimeout(() => {
        setActivePlayerId(selectedScenario.activePlayerId);
        setPlayerStates(selectedScenario.playerStates);
        setOutfieldAiStates(
          createInitialOutfieldAiStates(
            createOutfieldRosterForAttackDirections(OUTFIELD_ROSTER, initialTeamDirections)
          )
        );
        setGoalkeeperState(
          selectedScenario.goalkeeperState || createInitialGoalkeeperStates(initialTeamDirections)
        );

        setTimeout(() => {
          ballResetRef.current?.(selectedScenario.ballReset);
          setGameState(GAME_STATES.IN_PLAY);
        }, 30);
      }, 30);

      return true;
    },
    [
      applyTeamAttackDirections,
      clearComboState,
      clearCpuAutomationState,
      clearIntroTimers,
      clearKickoffSequence,
      clearPowerPlayTimers,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined" || window.__SOCCER_E2E__ !== true) {
      return undefined;
    }

    window.__SOCCER_TEST_API__ = {
      triggerGoal: (goalId) => {
        handleGoal(goalId);
      },
      triggerPhysicalGoal: (goalSide) => {
        handleGoal(goalSide);
      },
      triggerOutOfBounds: (outOfBoundsSnapshot) => {
        handleOutOfBounds(outOfBoundsSnapshot);
      },
      stageScenario: (scenarioName) => {
        stageE2EScenario(scenarioName);
      },
      setTimeLeft: (nextTimeLeft) => {
        const safeTimeLeft = Number.isFinite(nextTimeLeft)
          ? Math.max(0, Math.round(nextTimeLeft))
          : 0;
        setTimeLeft(safeTimeLeft);
      },
      setActivePlayerId: (nextActivePlayerId) => {
        setActivePlayerId(nextActivePlayerId);
      },
      getSnapshot: () => ({
        currentHalf,
        teamAttackDirections: {
          [TEAM_IDS.TEAM_ONE]: teamAttackDirections[TEAM_IDS.TEAM_ONE],
          [TEAM_IDS.TEAM_TWO]: teamAttackDirections[TEAM_IDS.TEAM_TWO],
        },
        goalAssignments: {
          ...goalAssignments,
        },
        gameState,
        replayState: {
          ...replayState,
        },
        score: {
          teamOne: teamOneScore,
          teamTwo: teamTwoScore,
        },
        activePlayerId,
        possessionState: possessionState
          ? {
              ...possessionState,
            }
          : null,
        ballSnapshot: ballSnapshot
          ? {
              timestampMs: ballSnapshot.timestampMs,
              position: [...ballSnapshot.position],
              velocity: [...ballSnapshot.velocity],
              mode: ballSnapshot.mode,
              possession: ballSnapshot.possession ? { ...ballSnapshot.possession } : null,
            }
          : null,
        pendingBallAction: ballActionCommand
          ? {
              id: ballActionCommand.id,
              type: ballActionCommand.type,
              actorId: ballActionCommand.actorId,
              targetPlayerId: ballActionCommand.targetPlayerId || null,
            }
          : null,
        pendingRestart: pendingRestart
          ? {
              ...pendingRestart,
              spotPosition: [...pendingRestart.spotPosition],
              receiverPosition: Array.isArray(pendingRestart.receiverPosition)
                ? [...pendingRestart.receiverPosition]
                : null,
            }
          : null,
        eventTimeline: eventTimeline.map((event) => ({
          id: event.id,
          type: event.type,
          teamId: event.teamId || null,
        })),
        lastKickoff: lastKickoffRef.current ? { ...lastKickoffRef.current } : null,
        outfieldAiStates: TEAM_TWO_PLAYER_IDS.reduce((result, playerId) => {
          const aiState = outfieldAiStates[playerId];
          if (!aiState) {
            return result;
          }

          result[playerId] = {
            mode: aiState.mode,
            assignment: aiState.assignment || null,
            targetPlayerId: aiState.targetPlayerId || null,
            phase: aiState.phase,
            targetPosition: Array.isArray(aiState.targetPosition)
              ? [...aiState.targetPosition]
              : null,
          };
          return result;
        }, {}),
        playerStates: PLAYER_IDS.reduce((result, playerId) => {
          const profile = getPlayerProfile(playerId);
          const state = playerStates[playerId];
          result[playerId] = {
            position: [...(state?.position || profile.startPosition)],
            rotation: [...(state?.rotation || profile.startRotation)],
          };
          return result;
        }, {}),
      }),
    };

    return () => {
      delete window.__SOCCER_TEST_API__;
    };
  }, [
    activePlayerId,
    ballActionCommand,
    ballSnapshot,
    currentHalf,
    eventTimeline,
    gameState,
    goalAssignments,
    handleGoal,
    handleOutOfBounds,
    outfieldAiStates,
    pendingRestart,
    playerStates,
    possessionState,
    replayState,
    stageE2EScenario,
    teamAttackDirections,
    teamOneScore,
    teamTwoScore,
  ]);

  useEffect(() => {
    const restartBusy =
      pendingRestart &&
      pendingRestart.status !== "completed" &&
      pendingRestart.status !== "failed";

    if (
      gameState !== GAME_STATES.IN_PLAY ||
      replayActive ||
      restartBusy ||
      ballSnapshot?.mode !== "attached" ||
      !possessionState?.teamId ||
      !possessionState?.playerId
    ) {
      return;
    }

    const keeperProfile = GOALKEEPER_PROFILES_BY_PLAYER_ID[possessionState.playerId];
    if (
      !keeperProfile ||
      ballSnapshot?.possession?.teamId !== possessionState.teamId ||
      ballSnapshot?.possession?.playerId !== possessionState.playerId
    ) {
      return;
    }

    startKeeperPuntRestart(possessionState.teamId, possessionState.playerId);
  }, [
    ballSnapshot?.mode,
    ballSnapshot?.possession?.playerId,
    ballSnapshot?.possession?.teamId,
    gameState,
    pendingRestart,
    possessionState?.playerId,
    possessionState?.teamId,
    replayActive,
    startKeeperPuntRestart,
  ]);

  useEffect(() => {
    if (
      pendingRestart?.type !== RESTART_TYPES.KEEPER_PUNT ||
      pendingRestart.status !== "staged" ||
      !keeperPuntSequenceRef.current
    ) {
      return undefined;
    }

    const sequenceId = pendingRestart.id;
    const totalHoldMs = Math.max(1, GOALKEEPER_CONFIG.RESTART_HOLD_MS);
    let launched = false;

    const applySequenceFrame = () => {
      const sequence = keeperPuntSequenceRef.current;
      if (!sequence || sequence.id !== sequenceId) {
        return;
      }

      const now = nowMs();
      const progress = clamp((now - sequence.startedAtMs) / totalHoldMs, 0, 1);

      setPlayerStates((currentStates) => {
        const nextStates = { ...currentStates };

        PLAYER_IDS.forEach((playerId) => {
          const originState = sequence.originPlayerStates[playerId];
          const targetState = sequence.targetPlayerStates[playerId] || currentStates[playerId];
          const currentState = currentStates[playerId] || targetState || originState;

          if (!originState || !targetState || !currentState) {
            return;
          }

          nextStates[playerId] = {
            ...currentState,
            ...targetState,
            position: interpolateVector(originState.position, targetState.position, progress),
            rotation: interpolateVector(originState.rotation, targetState.rotation, progress),
          };
        });

        return nextStates;
      });
      setGoalkeeperState(sequence.targetGoalkeeperStates);
      setPendingRestart((current) =>
        current?.id === sequenceId && Math.abs((current.progress || 0) - progress) > 0.0001
          ? { ...current, progress }
          : current
      );

      if (launched || now < sequence.holdUntilMs) {
        return;
      }

      launched = true;
      const restartSetup = sequence.restartSetup;
      const command = buildRestartPassCommand({
        type: RESTART_TYPES.KEEPER_PUNT,
        actorId: sequence.keeperPlayerId,
        receiverId: restartSetup.receiverId,
        receiverPosition: restartSetup.receiverPosition,
        targetPosition: restartSetup.receiverPosition,
        nowMs: now,
        teamId: sequence.teamId,
        actionType: "clear",
        power: 1.3,
      });

      pendingKickoffRef.current = {
        commandId: command.id,
        restartId: sequenceId,
        type: RESTART_TYPES.KEEPER_PUNT,
        teamId: sequence.teamId,
      };
      setPlayerStates(restartSetup.playerStates);
      setPendingRestart((current) =>
        current?.id === sequenceId
          ? {
              ...current,
              progress: 1,
              commandId: command.id,
              status: "launched",
            }
          : current
      );
      emitTelemetryEvent(MATCH_EVENT_TYPES.KEEPER_PUNT, { teamId: sequence.teamId });
      setBallActionCommand(command);
    };

    applySequenceFrame();
    const timer = setInterval(applySequenceFrame, 16);

    return () => {
      clearInterval(timer);
    };
  }, [
    emitTelemetryEvent,
    nowMs,
    pendingRestart?.id,
    pendingRestart?.status,
    pendingRestart?.type,
  ]);

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

  useOutfieldAI({
    enabled:
      gameState === GAME_STATES.IN_PLAY && !replayActive && !protectedPossessionTeamId,
    ballSnapshot,
    possessionState,
    protectedPossessionTeamId,
    difficulty,
    aiPaceMultiplier,
    aiConfig: AI_CONFIG,
    roster: outfieldRoster,
    activePlayerId,
    teamGoalTargets,
    createInitialOutfieldAiState,
    updateOutfieldController,
    setPlayerStates,
    setOutfieldAiStates,
    setBallActionCommand,
    aiLastUpdateAtRef,
    nowMs,
    teamAttackMemoryRef,
  });

  useGoalkeeperAI({
    enabled:
      gameState === GAME_STATES.IN_PLAY && !replayActive && !protectedPossessionTeamId,
    ballSnapshot,
    difficulty,
    aiPaceMultiplier,
    goalkeeperConfig: GOALKEEPER_CONFIG,
    updateGoalkeeperController,
    setGoalkeeperState,
    setBallActionCommand,
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
    if (!TEAM_ONE_PLAYER_IDS.includes(activePlayerId)) {
      const fallbackPlayerId =
        possessionState?.teamId === TEAM_IDS.TEAM_TWO
          ? getBestDefensivePlayerId(
              playerStates,
              ballSnapshot,
              TEAM_ONE_PLAYER_IDS[0],
              teamOneAttackDirection
            )
          : TEAM_ONE_PLAYER_IDS[0];
      setActivePlayerId(fallbackPlayerId);
      lastPlayerSwitchAtRef.current = nowMs();
      return;
    }

    if (
      possessionState?.teamId === TEAM_IDS.TEAM_ONE &&
      TEAM_ONE_PLAYER_IDS.includes(possessionState.playerId) &&
      possessionState.playerId &&
      possessionState.playerId !== activePlayerId
    ) {
      setActivePlayerId(possessionState.playerId);
      lastPlayerSwitchAtRef.current = nowMs();
    }
  }, [
    activePlayerId,
    ballSnapshot,
    nowMs,
    playerStates,
    possessionState?.playerId,
    possessionState?.teamId,
    teamOneAttackDirection,
  ]);

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
    if (
      gameState !== GAME_STATES.IN_PLAY ||
      replayActive ||
      currentHalf !== 1 ||
      halftimeTriggeredRef.current ||
      timeLeft > halfTimeMark
    ) {
      return;
    }

    halftimeTriggeredRef.current = true;
    const telemetryEvent = emitTelemetryEvent(MATCH_EVENT_TYPES.HALFTIME);
    const nextTeamAttackDirections = flipTeamAttackDirections(teamAttackDirectionsRef.current);
    setMatchEvent({
      type: MATCH_EVENT_TYPES.HALFTIME,
      id: telemetryEvent.id,
    });
    setCurrentHalf(2);
    applyTeamAttackDirections(nextTeamAttackDirections);
    clearComboState();
    clearPowerPlayTimers();
    setActivePowerZone(null);
    setActiveBoost(null);
    setBoostTimeLeftMs(0);
    setShotMeterState(createShotMeterState());
    startKickoffRestart(TEAM_IDS.TEAM_TWO, 0, nextTeamAttackDirections);
  }, [
    applyTeamAttackDirections,
    clearComboState,
    clearPowerPlayTimers,
    currentHalf,
    emitTelemetryEvent,
    gameState,
    replayActive,
    startKickoffRestart,
    timeLeft,
  ]);

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
      const telemetryEvent = emitTelemetryEvent(MATCH_EVENT_TYPES.END);
      setMatchEvent({
        type: MATCH_EVENT_TYPES.END,
        id: telemetryEvent.id,
      });
      clearComboState();
      setShotMeterState(createShotMeterState());
      setActiveBoost(null);
      setActivePowerZone(null);
    }

    previousGameStateRef.current = gameState;
  }, [clearComboState, emitTelemetryEvent, gameState]);

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
      const editableTarget = isEditableElement(activeElement);
      const cameraHotkeysEnabled =
        !editableTarget &&
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
        setActivePlayerId((current) =>
          getBestDefensivePlayerId(
            playerStates,
            ballSnapshot,
            current,
            teamOneAttackDirection
          )
        );
        lastPlayerSwitchAtRef.current = now;
        return;
      }

      if (editableTarget) {
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

      if (normalizedKey === PLAYER_LOB_CLEAR_CONFIG.KEY) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        triggerLobClear();
        return;
      }

      if (normalizedKey === PLAYER_TACKLE_CONFIG.KEY) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        triggerTackle();
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
    ballSnapshot,
    clearPlayerInput,
    playerControlsEnabled,
    playerStates,
    possessionState?.teamId,
    replayState.canSkip,
    teamOneAttackDirection,
    triggerLobClear,
    triggerPass,
    triggerTackle,
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

      clearKickoffSequence();
      clearIntroTimers();
      clearPowerPlayTimers();
      clearPlayerInput();
    };
  }, [clearIntroTimers, clearKickoffSequence, clearPlayerInput, clearPowerPlayTimers]);

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

      <div
        className={`overlay ${matchStarted ? "is-live" : "is-hub"}${
          overlayPulseType ? ` pulse-${overlayPulseType}` : ""
        }`}
      >
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

        {!matchStarted && (
          <>
            <section className="hub-intro">
              <p className="hub-kicker">Arcade-real football</p>
              <h2 className="hub-title">Pick the feel, camera, and kickoff setup.</h2>
              <p className="hub-copy">
                Hard shots now separate from runners, keepers pause before punting, and `C`
                sends a lofted clear into space.
              </p>
              <div className="hub-actions">
                <button className="btn-primary hub-start-button" onClick={startMatch} type="button">
                  Start Match
                </button>
                <button
                  className={`btn-ghost options-toggle${optionsExpanded ? " is-active" : ""}`}
                  onClick={() => setOptionsExpanded((current) => !current)}
                  type="button"
                  aria-expanded={optionsExpanded}
                >
                  Options
                </button>
              </div>
            </section>

            <section className="selection-section">
              <div className="selection-heading">
                <strong>Difficulty</strong>
                <span>{selectedDifficultyOption.detail}</span>
              </div>
              <div className="selection-grid selection-grid-three">
                {DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`selection-card${difficulty === option.value ? " is-active" : ""}`}
                    onClick={() => setDifficulty(option.value)}
                    type="button"
                    aria-pressed={difficulty === option.value}
                  >
                    <span className="selection-card-label">{option.label}</span>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="selection-section">
              <div className="selection-heading">
                <strong>Camera POV</strong>
                <span>{selectedCameraOption.label}</span>
              </div>
              <div className="selection-grid selection-grid-camera">
                {CAMERA_POV_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`selection-card selection-card-compact${
                      cameraPovMode === option.value ? " is-active" : ""
                    }`}
                    onClick={() => setCameraPovMode(option.value)}
                    type="button"
                    aria-pressed={cameraPovMode === option.value}
                  >
                    <span className="selection-card-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="selection-section">
              <div className="selection-heading">
                <strong>Control Focus</strong>
                <span>
                  {controlTarget === CONTROL_TARGETS.PLAYER
                    ? "Player movement and shooting"
                    : "Direct ball physics"}
                </span>
              </div>
              <div className="controls controls-compact">
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
              </div>
            </section>

            {optionsPanel}
          </>
        )}

        {matchStarted && (
          <div className="controls controls-compact">
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

            <button
              className={optionsExpanded ? "btn-primary" : "btn-ghost"}
              onClick={() => setOptionsExpanded((current) => !current)}
              type="button"
              aria-expanded={optionsExpanded}
            >
              Options
            </button>

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

            <button className="btn-ghost" onClick={() => safeResetBall()} type="button">
              Reset Ball
            </button>

            <button className="btn-danger" onClick={startMatch} type="button">
              Restart Match
            </button>
          </div>
        )}

        <p className="active-player-chip" data-testid="active-player-label">
          <span>Active Player:</span>
          <strong>{activeProfile.label}</strong>
          <span>{activePlayerStrength}</span>
          <span className="active-player-speed">{activeMovementSpeed.toFixed(1)} SPD</span>
        </p>

        <p className="boost-label" data-testid="hud-possession-owner">
          Possession: {possessionState ? possessionOwnerLabel : "Loose Ball"}
        </p>

        <p className="combo-label" data-testid="hud-cpu-phase">
          CPU Phase: {cpuPhaseLabel}
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

        {matchStarted && optionsPanel}

        <p className="help-text">
          {controlTarget === CONTROL_TARGETS.PLAYER
            ? "Controls: Arrow keys move your player. Hold A to sprint. Touch the ball to dribble, hold D to charge, release to kick. Press S to pass to your teammate. Press C to loft a clear into space. Press F to tackle near the ball carrier. Press Tab to switch players when Team One has no possession."
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
          possessionOwnerLabel={possessionOwnerLabel}
          cpuPhaseLabel={cpuPhaseLabel}
        />
      </div>

      <Canvas
        shadows="percentage"
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
          replayEventType={replayState.eventType}
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
              const outfieldAiState = outfieldAiStates[playerId];
              const animationState = isTeamOnePlayer
                ? playerId === activePlayerId
                  ? playerOneAnimationState
                  : getOutfieldAnimationState(outfieldAiState)
                : getOutfieldAnimationState(outfieldAiState);
              const animationBlend = isTeamOnePlayer
                ? playerId === activePlayerId && playerControlsEnabled && isSprintHeld
                  ? 1
                  : outfieldAiState?.mode === OUTFIELD_STATES.RECEIVE ||
                      outfieldAiState?.mode === OUTFIELD_STATES.SUPPORT
                    ? 0.65
                    : 0.2
                : outfieldAiState?.mode === OUTFIELD_STATES.PRESS
                  ? 0.9
                  : outfieldAiState?.mode === OUTFIELD_STATES.CARRY ||
                      outfieldAiState?.mode === OUTFIELD_STATES.SUPPORT ||
                      outfieldAiState?.mode === OUTFIELD_STATES.RECEIVE
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
                ballActionCommand={ballActionCommand}
                onBallActionResolved={handleBallActionResolved}
                tackleCommand={tackleCommand}
                onTackleResolved={handleTackleResolved}
                controlsEnabled={ballControlsEnabled}
                mapMovementKeyToForce={mapMovementKeyToForce}
                players={ballActors}
                controlledPlayerId={activePlayerId}
                controlledTeamId={TEAM_IDS.TEAM_ONE}
                playerControlsEnabled={playerControlsEnabled}
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
              goalId={goalAssignments.negativeZ}
              goalSide="negativeZ"
              active={canScore}
              onGoal={handleGoal}
            />
            <GoalNet
              position={[0, 0.5, 78]}
              scale={GOAL_CONFIG.SCALE}
              rotation={[0, Math.PI, 0]}
              goalId={goalAssignments.positiveZ}
              goalSide="positiveZ"
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
