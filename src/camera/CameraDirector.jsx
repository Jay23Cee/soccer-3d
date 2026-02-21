import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CAMERA_CONFIG, INTRO_CONFIG } from "../config/gameConfig";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

function lerpVector(current, next, alpha) {
  return [
    lerp(current[0], next[0], alpha),
    lerp(current[1], next[1], alpha),
    lerp(current[2], next[2], alpha),
  ];
}

function averagePositions(points) {
  if (!points || points.length === 0) {
    return [0, 0, 0];
  }

  const accumulator = points.reduce(
    (result, point) => [result[0] + point[0], result[1] + point[1], result[2] + point[2]],
    [0, 0, 0]
  );

  return accumulator.map((value) => value / points.length);
}

function modeFov(mode) {
  switch (mode) {
    case CAMERA_CONFIG.MODES.ATTACKING_THIRD:
      return CAMERA_CONFIG.FOV.ATTACKING_THIRD;
    case CAMERA_CONFIG.MODES.SHOT:
      return CAMERA_CONFIG.FOV.SHOT;
    case CAMERA_CONFIG.MODES.GOAL:
      return CAMERA_CONFIG.FOV.GOAL;
    case CAMERA_CONFIG.MODES.SAVE:
      return CAMERA_CONFIG.FOV.SAVE;
    case CAMERA_CONFIG.MODES.REPLAY:
      return CAMERA_CONFIG.FOV.REPLAY;
    default:
      return CAMERA_CONFIG.FOV.BUILD_UP;
  }
}

function getModeTarget(mode, focus, playersCenter, keepersCenter) {
  switch (mode) {
    case CAMERA_CONFIG.MODES.SHOT:
      return [focus[0] * 0.96, 8, focus[2] * 0.94];
    case CAMERA_CONFIG.MODES.GOAL:
      return [focus[0] * 0.88, 10, focus[2] * 0.9];
    case CAMERA_CONFIG.MODES.SAVE:
      return [focus[0] * 0.9, 8, focus[2] * 0.86];
    case CAMERA_CONFIG.MODES.ATTACKING_THIRD:
      return [focus[0] * 0.72, 6, focus[2] * 0.7];
    default:
      return averagePositions([focus, playersCenter, keepersCenter]);
  }
}

function getModeCameraPosition(mode, target, focus) {
  switch (mode) {
    case CAMERA_CONFIG.MODES.SHOT:
      return [target[0] + 54, CAMERA_CONFIG.BASE_HEIGHT - 6, target[2] + 68];
    case CAMERA_CONFIG.MODES.GOAL:
      return [target[0] + 72, CAMERA_CONFIG.BASE_HEIGHT + 4, target[2] + 62];
    case CAMERA_CONFIG.MODES.SAVE:
      return [target[0] - 68, CAMERA_CONFIG.BASE_HEIGHT + 1, target[2] + 58];
    case CAMERA_CONFIG.MODES.ATTACKING_THIRD:
      return [target[0] + 58, CAMERA_CONFIG.BASE_HEIGHT - 3, target[2] + 84];
    case CAMERA_CONFIG.MODES.REPLAY:
      return [target[0] + 78, CAMERA_CONFIG.BASE_HEIGHT + 7, target[2] + 56];
    default:
      return [focus[0] + 76, CAMERA_CONFIG.BASE_HEIGHT, focus[2] + CAMERA_CONFIG.BASE_DISTANCE];
  }
}

function introCamera(introProgress) {
  return [
    lerp(INTRO_CONFIG.CAMERA_START[0], INTRO_CONFIG.CAMERA_END[0], introProgress),
    lerp(INTRO_CONFIG.CAMERA_START[1], INTRO_CONFIG.CAMERA_END[1], introProgress),
    lerp(INTRO_CONFIG.CAMERA_START[2], INTRO_CONFIG.CAMERA_END[2], introProgress),
  ];
}

function CameraDirector({
  cameraRef,
  mode,
  ballPosition,
  playerPositions,
  goalkeeperPositions,
  replayFrame,
  isReplay,
  introProgress,
  gameState,
  cameraNudge = [0, 0, 0],
  onCameraStateChange,
}) {
  const smoothedRef = useRef({
    position: [...INTRO_CONFIG.CAMERA_END],
    target: [0, 4, 0],
    fov: CAMERA_CONFIG.FOV.BUILD_UP,
    lastEmitAtMs: 0,
  });

  const centers = useMemo(() => {
    const playersCenter = averagePositions(
      (playerPositions || []).map((position) => [position[0], 0, position[2]])
    );
    const keepersCenter = averagePositions(
      (goalkeeperPositions || []).map((position) => [position[0], 0, position[2]])
    );

    return { playersCenter, keepersCenter };
  }, [goalkeeperPositions, playerPositions]);

  useFrame(({ clock }) => {
    const camera = cameraRef?.current;
    if (!camera) {
      return;
    }

    const nowMs = clock.elapsedTime * 1000;
    const focus = replayFrame?.ball?.position || ballPosition || [0, 0, 0];
    const targetMode = isReplay ? CAMERA_CONFIG.MODES.REPLAY : mode || CAMERA_CONFIG.MODES.BUILD_UP;
    const desiredTarget = getModeTarget(
      targetMode,
      [focus[0], 4 + clamp(Math.abs(focus[1]) * 0.25, 0, 5), focus[2]],
      centers.playersCenter,
      centers.keepersCenter
    );
    const desiredPosition =
      gameState === "intro"
        ? introCamera(introProgress || 0)
        : getModeCameraPosition(targetMode, desiredTarget, focus);

    const alpha = isReplay
      ? CAMERA_CONFIG.REPLAY_TRANSITION_ALPHA
      : CAMERA_CONFIG.TRANSITION_ALPHA;

    smoothedRef.current.position = lerpVector(smoothedRef.current.position, desiredPosition, alpha);
    smoothedRef.current.target = lerpVector(smoothedRef.current.target, desiredTarget, alpha);
    smoothedRef.current.fov = lerp(smoothedRef.current.fov, modeFov(targetMode), alpha);

    camera.position.set(
      smoothedRef.current.position[0] + cameraNudge[0],
      smoothedRef.current.position[1] + cameraNudge[1],
      smoothedRef.current.position[2] + cameraNudge[2]
    );
    camera.lookAt(
      smoothedRef.current.target[0],
      smoothedRef.current.target[1],
      smoothedRef.current.target[2]
    );
    camera.fov = smoothedRef.current.fov;
    camera.updateProjectionMatrix();

    if (onCameraStateChange && nowMs - smoothedRef.current.lastEmitAtMs > 100) {
      smoothedRef.current.lastEmitAtMs = nowMs;
      onCameraStateChange({
        mode: targetMode,
        position: [...smoothedRef.current.position],
        target: [...smoothedRef.current.target],
        fov: smoothedRef.current.fov,
      });
    }
  });

  return null;
}

export default CameraDirector;
