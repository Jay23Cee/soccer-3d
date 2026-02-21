import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import {
  BALL_RESET_DELAY_MS,
  GAME_STATES,
  GOAL_CONFIG,
  GOAL_COOLDOWN_MS,
  MATCH_DURATION_SECONDS,
} from "./config/gameConfig";
import "./App.css";

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function statusText(gameState) {
  switch (gameState) {
    case GAME_STATES.IDLE:
      return "Idle";
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

function LoadingFallback() {
  return (
    <Html center>
      <div className="loading-pill">Loading 3D assets...</div>
    </Html>
  );
}

function EndMatchScoreboard3D({ teamOneScore, teamTwoScore }) {
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
          TEAM 1
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
          TEAM 2
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

  const ballResetRef = useRef(null);
  const goalCooldownUntilRef = useRef(0);
  const goalResetTimeoutRef = useRef(null);

  const controlsEnabled = gameState === GAME_STATES.IN_PLAY;
  const canScore = gameState === GAME_STATES.IN_PLAY;
  const matchStarted = gameState !== GAME_STATES.IDLE;

  const safeResetBall = useCallback(() => {
    ballResetRef.current?.();
  }, []);

  const startMatch = useCallback(() => {
    if (goalResetTimeoutRef.current) {
      clearTimeout(goalResetTimeoutRef.current);
      goalResetTimeoutRef.current = null;
    }

    goalCooldownUntilRef.current = 0;
    setTeamOneScore(0);
    setTeamTwoScore(0);
    setTimeLeft(MATCH_DURATION_SECONDS);
    setGameState(GAME_STATES.IN_PLAY);

    setTimeout(() => {
      safeResetBall();
    }, 0);
  }, [safeResetBall]);

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

  const handleGoal = useCallback(
    (goalId) => {
      if (!canScore) {
        return;
      }

      const now = performance.now();
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
    return () => {
      if (goalResetTimeoutRef.current) {
        clearTimeout(goalResetTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className="overlay">
        <h1>Soccer 3D</h1>
        <p className="status-label">Status: {statusText(gameState)}</p>

        <div className="scoreboard">
          <p>Team 1: {teamOneScore}</p>
          <p>Team 2: {teamTwoScore}</p>
          <p>Time: {formatClock(timeLeft)}</p>
        </div>

        <label className="slider-wrap">
          Ball Size: {ballScale.toFixed(2)}
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={ballScale}
            onChange={(event) => setBallScale(parseFloat(event.target.value))}
          />
        </label>

        <div className="controls">
          {!matchStarted && (
            <button onClick={startMatch} type="button">
              Start Match
            </button>
          )}

          {matchStarted && (
            <button onClick={togglePause} type="button">
              {gameState === GAME_STATES.PAUSED ? "Resume" : "Pause"}
            </button>
          )}

          {matchStarted && (
            <button onClick={safeResetBall} type="button">
              Reset Ball
            </button>
          )}

          {matchStarted && (
            <button onClick={startMatch} type="button">
              Restart Match
            </button>
          )}
        </div>

        <p className="help-text">Controls: Arrow keys to move, Space to pop the ball upward.</p>
      </div>

      <Canvas
        shadows
        dpr={[1, 1.5]}
        style={{ height: "100vh", width: "100vw" }}
        gl={{ antialias: true }}
      >
        <PerspectiveCamera makeDefault position={[0, 145, 0]} fov={58} />
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
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={0}
          maxDistance={340}
          minDistance={55}
          target={[0, 0, 0]}
        />

        <Suspense fallback={<LoadingFallback />}>
          <Physics gravity={[0, -9.81, 0]} iterations={12} tolerance={0.0001}>
            <SoccerField />

            {matchStarted && (
              <SoccerBallModel
                key={`ball-${ballScale.toFixed(1)}`}
                scale={ballScale}
                resetRef={ballResetRef}
                controlsEnabled={controlsEnabled}
                onOutOfBounds={handleOutOfBounds}
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

          {gameState === GAME_STATES.ENDED && (
            <EndMatchScoreboard3D
              teamOneScore={teamOneScore}
              teamTwoScore={teamTwoScore}
            />
          )}
        </Suspense>
      </Canvas>
    </>
  );
}

export default App;
