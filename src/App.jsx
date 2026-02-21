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
import {
  BALL_RESET_DELAY_MS,
  FIELD_CONFIG,
  GAME_STATES,
  GOAL_CONFIG,
  GOAL_COOLDOWN_MS,
  INTRO_CONFIG,
  MATCH_DURATION_SECONDS,
  POWER_PLAY_CONFIG,
} from "./config/gameConfig";
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

const PLAYER_START_POSITION = [0, 0, 22];
const PLAYER_START_ROTATION = [0, Math.PI, 0];
const PLAYER_CONTROL_SPEED = 32;
const PLAYER_BOUNDARY_MARGIN = 2;

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
}) {
  const scoreboardClassName = [
    "broadcast-scoreboard",
    gameState === GAME_STATES.GOAL_SCORED || matchEvent?.type === "goal" ? "is-goal" : "",
    matchEvent?.type === "halftime" ? "is-halftime" : "",
    gameState === GAME_STATES.ENDED || matchEvent?.type === "end" ? "is-end" : "",
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
  const [playerPosition, setPlayerPosition] = useState([...PLAYER_START_POSITION]);
  const [playerRotation, setPlayerRotation] = useState([...PLAYER_START_ROTATION]);

  const ballResetRef = useRef(null);
  const kickoffRef = useRef(null);
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
  const playerInputRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  });

  const controlsEnabled = gameState === GAME_STATES.IN_PLAY;
  const ballControlsEnabled = controlsEnabled && controlTarget === CONTROL_TARGETS.BALL;
  const playerControlsEnabled = controlsEnabled && controlTarget === CONTROL_TARGETS.PLAYER;
  const canScore = gameState === GAME_STATES.IN_PLAY;
  const matchStarted = gameState !== GAME_STATES.IDLE;
  const playerBounds = useMemo(
    () => ({
      x: FIELD_CONFIG.BOUNDARY.X_LIMIT - PLAYER_BOUNDARY_MARGIN,
      z: FIELD_CONFIG.BOUNDARY.Z_LIMIT - PLAYER_BOUNDARY_MARGIN,
    }),
    []
  );

  const activeBoostConfig = activeBoost
    ? POWER_PLAY_CONFIG.TYPES[activeBoost.type] || null
    : null;
  const speedMultiplier = activeBoostConfig?.speedMultiplier || 1;
  const shotPowerMultiplier = activeBoostConfig?.shotPowerMultiplier || 1;
  const controlAssistMultiplier = activeBoostConfig?.controlAssistMultiplier || 1;

  const cameraPosition = useMemo(() => {
    if (gameState !== GAME_STATES.INTRO) {
      return INTRO_CONFIG.CAMERA_END;
    }

    return [
      lerp(INTRO_CONFIG.CAMERA_START[0], INTRO_CONFIG.CAMERA_END[0], introProgress),
      lerp(INTRO_CONFIG.CAMERA_START[1], INTRO_CONFIG.CAMERA_END[1], introProgress),
      lerp(INTRO_CONFIG.CAMERA_START[2], INTRO_CONFIG.CAMERA_END[2], introProgress),
    ];
  }, [gameState, introProgress]);

  const cameraFov =
    gameState === GAME_STATES.INTRO
      ? lerp(INTRO_CONFIG.CAMERA_START_FOV, INTRO_CONFIG.CAMERA_END_FOV, introProgress)
      : INTRO_CONFIG.CAMERA_END_FOV;

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

  const safeResetBall = useCallback(() => {
    ballResetRef.current?.();
  }, []);

  const clearPlayerInput = useCallback(() => {
    playerInputRef.current.ArrowUp = false;
    playerInputRef.current.ArrowDown = false;
    playerInputRef.current.ArrowLeft = false;
    playerInputRef.current.ArrowRight = false;
  }, []);

  const resetPlayer = useCallback(() => {
    clearPlayerInput();
    setPlayerPosition([...PLAYER_START_POSITION]);
    setPlayerRotation([...PLAYER_START_ROTATION]);
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
    setIntroProgress(0);
    setGameState(GAME_STATES.INTRO);
    halftimeTriggeredRef.current = false;
    resetPlayer();

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
  }, [clearIntroTimers, clearPowerPlayTimers, resetPlayer, safeResetBall]);

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
      if (current === GAME_STATES.IN_PLAY) {
        return GAME_STATES.PAUSED;
      }

      if (current === GAME_STATES.PAUSED) {
        return GAME_STATES.IN_PLAY;
      }

      return current;
    });
  }, []);

  const movePlayer = useCallback(
    (deltaSeconds) => {
      const input = playerInputRef.current;
      let directionX = 0;
      let directionZ = 0;

      if (input.ArrowLeft) {
        directionX -= 1;
      }
      if (input.ArrowRight) {
        directionX += 1;
      }
      if (input.ArrowUp) {
        directionZ -= 1;
      }
      if (input.ArrowDown) {
        directionZ += 1;
      }

      if (directionX === 0 && directionZ === 0) {
        return;
      }

      const directionMagnitude = Math.hypot(directionX, directionZ);
      const normalizedX = directionX / directionMagnitude;
      const normalizedZ = directionZ / directionMagnitude;
      const nextYaw = Math.atan2(normalizedX, normalizedZ);

      setPlayerRotation((currentRotation) => {
        if (Math.abs(currentRotation[1] - nextYaw) < 0.0001) {
          return currentRotation;
        }

        return [0, nextYaw, 0];
      });

      setPlayerPosition((currentPosition) => {
        const nextX = clamp(
          currentPosition[0] + normalizedX * PLAYER_CONTROL_SPEED * deltaSeconds,
          -playerBounds.x,
          playerBounds.x
        );
        const nextZ = clamp(
          currentPosition[2] + normalizedZ * PLAYER_CONTROL_SPEED * deltaSeconds,
          -playerBounds.z,
          playerBounds.z
        );

        if (nextX === currentPosition[0] && nextZ === currentPosition[2]) {
          return currentPosition;
        }

        return [nextX, PLAYER_START_POSITION[1], nextZ];
      });
    },
    [playerBounds.x, playerBounds.z]
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

      if (goalId === "teamOne") {
        setTeamOneScore((prev) => prev + 1);
      } else if (goalId === "teamTwo") {
        setTeamTwoScore((prev) => prev + 1);
      }

      setMatchEvent({
        type: "goal",
        teamName: goalId === "teamOne" ? TEAM_ONE.name : TEAM_TWO.name,
        id: `${goalId}-${Date.now()}`,
      });

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
    [canScore, safeResetBall]
  );

  const handleOutOfBounds = useCallback(() => {
    if (gameState === GAME_STATES.IDLE || gameState === GAME_STATES.ENDED) {
      return;
    }

    safeResetBall();
  }, [gameState, safeResetBall]);

  const handlePowerZoneEnter = useCallback(
    (zone) => {
      if (gameState !== GAME_STATES.IN_PLAY) {
        return;
      }

      const config = POWER_PLAY_CONFIG.TYPES[zone.type];
      if (!config) {
        return;
      }

      setActivePowerZone((current) => (current?.id === zone.id ? null : current));

      const expiresAt = nowMs() + POWER_PLAY_CONFIG.BOOST_DURATION_MS;
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
    },
    [gameState]
  );

  useEffect(() => {
    if (gameState !== GAME_STATES.IN_PLAY) {
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
  }, [gameState]);

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
    }

    previousGameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (gameState === GAME_STATES.IN_PLAY && !activePowerZone) {
      if (powerZoneSpawnTimeoutRef.current) {
        clearTimeout(powerZoneSpawnTimeoutRef.current);
      }

      powerZoneSpawnTimeoutRef.current = setTimeout(() => {
        spawnPowerZone();
      }, POWER_PLAY_CONFIG.SPAWN_DELAY_MS);

      return () => {
        if (powerZoneSpawnTimeoutRef.current) {
          clearTimeout(powerZoneSpawnTimeoutRef.current);
          powerZoneSpawnTimeoutRef.current = null;
        }
      };
    }

    return undefined;
  }, [activePowerZone, gameState, spawnPowerZone]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!playerControlsEnabled) {
        return;
      }

      if (!(event.key in playerInputRef.current)) {
        return;
      }

      event.preventDefault();
      playerInputRef.current[event.key] = true;
    };

    const handleKeyUp = (event) => {
      if (!(event.key in playerInputRef.current)) {
        return;
      }

      playerInputRef.current[event.key] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [playerControlsEnabled]);

  useEffect(() => {
    if (!playerControlsEnabled) {
      clearPlayerInput();
      return undefined;
    }

    const timer = setInterval(() => {
      movePlayer(1 / 60);
    }, 16);

    return () => clearInterval(timer);
  }, [clearPlayerInput, movePlayer, playerControlsEnabled]);

  useEffect(() => {
    if (gameState === GAME_STATES.IN_PLAY) {
      return;
    }

    if (powerZoneSpawnTimeoutRef.current) {
      clearTimeout(powerZoneSpawnTimeoutRef.current);
      powerZoneSpawnTimeoutRef.current = null;
    }

    if (powerZoneExpireTimeoutRef.current) {
      clearTimeout(powerZoneExpireTimeoutRef.current);
      powerZoneExpireTimeoutRef.current = null;
    }

    setActivePowerZone(null);
  }, [gameState]);

  useEffect(() => {
    if (!activeBoost) {
      setBoostTimeLeftMs(0);
      return undefined;
    }

    const updateRemaining = () => {
      const msLeft = Math.max(0, activeBoost.expiresAt - nowMs());
      setBoostTimeLeftMs(msLeft);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 100);

    return () => clearInterval(timer);
  }, [activeBoost]);

  useEffect(() => {
    return () => {
      if (goalResetTimeoutRef.current) {
        clearTimeout(goalResetTimeoutRef.current);
      }

      clearIntroTimers();
      clearPowerPlayTimers();
      clearPlayerInput();
    };
  }, [clearIntroTimers, clearPlayerInput, clearPowerPlayTimers]);

  return (
    <>
      <BroadcastScoreboard
        teamOne={TEAM_ONE}
        teamTwo={TEAM_TWO}
        teamOneScore={teamOneScore}
        teamTwoScore={teamTwoScore}
        timeLeft={timeLeft}
        gameState={gameState}
        matchEvent={matchEvent}
      />
      <MatchEventBanner event={matchEvent} />

      <div className="overlay">
        <div className="overlay-header">
          <h1>Soccer 3D</h1>
          <p className="status-label">Status: {statusText(gameState)}</p>
        </div>

        <p className="fixture-label">
          <span>{TEAM_ONE.name}</span>
          <span className="fixture-vs">vs</span>
          <span>{TEAM_TWO.name}</span>
        </p>

        <p className={`boost-label ${activeBoost ? "is-active" : ""}`}>
          Boost:{" "}
          {activeBoost
            ? `${activeBoost.label} ${Math.max(1, Math.ceil(boostTimeLeftMs / 1000))}s`
            : "None"}
        </p>

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
            ? "Controls: Arrow keys move the player. Touch the ball to dribble it, then press Space to kick it forward."
            : "Controls: Arrow keys move the ball and Space pops it upward. Switch to Player mode to run the player."}{" "}
          Capture power-play zones for boosts.
        </p>
      </div>

      <Canvas
        shadows
        dpr={[1, 1.5]}
        style={{ height: "100vh", width: "100vw" }}
        gl={{ antialias: true }}
      >
        <PerspectiveCamera makeDefault position={cameraPosition} fov={cameraFov} />
        <hemisphereLight skyColor="#ffffff" groundColor="#4a4a4a" intensity={0.55} />
        <directionalLight
          position={[28, 45, 26]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Environment preset="sunset" />

        <OrbitControls
          enablePan
          enabled={gameState !== GAME_STATES.INTRO}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={0}
          maxDistance={340}
          minDistance={55}
          target={[0, 0, 0]}
        />

        <Suspense fallback={<LoadingFallback />}>
          <Physics gravity={[0, -9.81, 0]} iterations={12} tolerance={0.0001}>
            <SoccerField activePowerZone={activePowerZone} />
            <SoccerPlayer position={playerPosition} rotation={playerRotation} />

            {matchStarted && (
              <SoccerBallModel
                key={`ball-${ballScale.toFixed(1)}`}
                scale={ballScale}
                resetRef={ballResetRef}
                kickoffRef={kickoffRef}
                controlsEnabled={ballControlsEnabled}
                playerPosition={playerPosition}
                playerRotation={playerRotation}
                playerControlsEnabled={playerControlsEnabled}
                onOutOfBounds={handleOutOfBounds}
                activePowerZone={activePowerZone}
                onPowerZoneEnter={handlePowerZoneEnter}
                speedMultiplier={speedMultiplier}
                shotPowerMultiplier={shotPowerMultiplier}
                controlAssistMultiplier={controlAssistMultiplier}
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
    </>
  );
}

export default App;
