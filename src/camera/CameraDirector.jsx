import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CAMERA_CONFIG, FIELD_CONFIG, INTRO_CONFIG } from "../config/gameConfig";

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
    case CAMERA_CONFIG.MODES.LANDING_HERO:
      return CAMERA_CONFIG.FOV.LANDING_HERO;
    case CAMERA_CONFIG.MODES.BROADCAST_WIDE:
      return CAMERA_CONFIG.FOV.BROADCAST_WIDE;
    case CAMERA_CONFIG.MODES.PLAYER_CHASE:
      return CAMERA_CONFIG.FOV.PLAYER_CHASE;
    case CAMERA_CONFIG.MODES.GOAL_LINE:
      return CAMERA_CONFIG.FOV.GOAL_LINE;
    case CAMERA_CONFIG.MODES.FREE_ROAM:
      return CAMERA_CONFIG.FOV.FREE_ROAM;
    case CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST:
      return CAMERA_CONFIG.FOV.BEHIND_PLAYER_WEST;
    case CAMERA_CONFIG.MODES.SIDE_LEFT:
      return CAMERA_CONFIG.FOV.SIDE_LEFT;
    case CAMERA_CONFIG.MODES.SIDE_RIGHT:
      return CAMERA_CONFIG.FOV.SIDE_RIGHT;
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
    case CAMERA_CONFIG.MODES.END_ORBIT:
      return CAMERA_CONFIG.FOV.END_ORBIT;
    default:
      return CAMERA_CONFIG.FOV.BUILD_UP;
  }
}

function getModeTarget(mode, focus, playersCenter, keepersCenter) {
  switch (mode) {
    case CAMERA_CONFIG.MODES.LANDING_HERO:
      return [...CAMERA_CONFIG.LANDING_HERO.TARGET];
    case CAMERA_CONFIG.MODES.BROADCAST_WIDE:
      return [
        focus[0] * 0.55 + playersCenter[0] * 0.3 + keepersCenter[0] * 0.15,
        8,
        focus[2] * 0.55 + playersCenter[2] * 0.3 + keepersCenter[2] * 0.15,
      ];
    case CAMERA_CONFIG.MODES.PLAYER_CHASE:
      return [focus[0], 5.2, focus[2]];
    case CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST:
      return [focus[0], 5.5, focus[2]];
    case CAMERA_CONFIG.MODES.SIDE_LEFT:
      return [focus[0], 6.5, focus[2]];
    case CAMERA_CONFIG.MODES.SIDE_RIGHT:
      return [focus[0], 6.5, focus[2]];
    case CAMERA_CONFIG.MODES.SHOT:
      return [focus[0] * 0.96, 8, focus[2] * 0.94];
    case CAMERA_CONFIG.MODES.GOAL:
      return [focus[0] * 0.88, 10, focus[2] * 0.9];
    case CAMERA_CONFIG.MODES.SAVE:
      return [focus[0] * 0.9, 8, focus[2] * 0.86];
    case CAMERA_CONFIG.MODES.ATTACKING_THIRD:
      return [focus[0] * 0.72, 6, focus[2] * 0.7];
    case CAMERA_CONFIG.MODES.GOAL_LINE:
      return [focus[0] * 0.78 + playersCenter[0] * 0.22, 7, focus[2] * 0.86];
    default:
      return averagePositions([focus, playersCenter, keepersCenter]);
  }
}

function getModeCameraPosition(mode, target, focus) {
  switch (mode) {
    case CAMERA_CONFIG.MODES.LANDING_HERO:
      return [...CAMERA_CONFIG.LANDING_HERO.BASE_POSITION];
    case CAMERA_CONFIG.MODES.BROADCAST_WIDE:
      return [target[0] + 88, CAMERA_CONFIG.BASE_HEIGHT + 6, target[2] + 108];
    case CAMERA_CONFIG.MODES.PLAYER_CHASE:
      return [focus[0] - 19, CAMERA_CONFIG.BASE_HEIGHT - 40, focus[2] + 22];
    case CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST: {
      return [focus[0] - 32, CAMERA_CONFIG.BASE_HEIGHT - 33, focus[2] + 28];
    }
    case CAMERA_CONFIG.MODES.SIDE_LEFT:
      return [target[0] - 118, CAMERA_CONFIG.BASE_HEIGHT - 19, target[2] + 4];
    case CAMERA_CONFIG.MODES.SIDE_RIGHT:
      return [target[0] + 118, CAMERA_CONFIG.BASE_HEIGHT - 19, target[2] - 4];
    case CAMERA_CONFIG.MODES.SHOT:
      return [target[0] + 54, CAMERA_CONFIG.BASE_HEIGHT - 6, target[2] + 68];
    case CAMERA_CONFIG.MODES.GOAL:
      return [target[0] + 72, CAMERA_CONFIG.BASE_HEIGHT + 4, target[2] + 62];
    case CAMERA_CONFIG.MODES.SAVE:
      return [target[0] - 68, CAMERA_CONFIG.BASE_HEIGHT + 1, target[2] + 58];
    case CAMERA_CONFIG.MODES.ATTACKING_THIRD:
      return [target[0] + 58, CAMERA_CONFIG.BASE_HEIGHT - 3, target[2] + 84];
    case CAMERA_CONFIG.MODES.GOAL_LINE: {
      const goalSign = focus[2] >= 0 ? 1 : -1;
      const goalLineZ = goalSign * (FIELD_CONFIG.LENGTH / 2 - 2);
      return [target[0] * 0.55, CAMERA_CONFIG.BASE_HEIGHT - 22, goalLineZ - goalSign * 18];
    }
    case CAMERA_CONFIG.MODES.REPLAY:
      return [target[0] + 78, CAMERA_CONFIG.BASE_HEIGHT + 7, target[2] + 56];
    default:
      return [focus[0] + 76, CAMERA_CONFIG.BASE_HEIGHT, focus[2] + CAMERA_CONFIG.BASE_DISTANCE];
  }
}

function applyGoalReplayZoom(position, target) {
  const zoomScale = CAMERA_CONFIG.GOAL_REPLAY_ZOOM.POSITION_SCALE;
  return [
    target[0] + (position[0] - target[0]) * zoomScale,
    target[1] + (position[1] - target[1]) * zoomScale,
    target[2] + (position[2] - target[2]) * zoomScale,
  ];
}

function endPresentationTarget() {
  return [...CAMERA_CONFIG.END_PRESENTATION.TARGET];
}

function landingHeroTarget() {
  return [...CAMERA_CONFIG.LANDING_HERO.TARGET];
}

function landingHeroCameraPosition(elapsedTimeMs, prefersReducedMotion) {
  if (prefersReducedMotion) {
    return [...CAMERA_CONFIG.LANDING_HERO.BASE_POSITION];
  }

  const elapsedSeconds = elapsedTimeMs / 1000;
  const basePosition = CAMERA_CONFIG.LANDING_HERO.BASE_POSITION;
  return [
    basePosition[0] + Math.sin(elapsedSeconds * CAMERA_CONFIG.LANDING_HERO.DRIFT_SPEED) * CAMERA_CONFIG.LANDING_HERO.DRIFT_X,
    basePosition[1] + Math.sin(elapsedSeconds * CAMERA_CONFIG.LANDING_HERO.DRIFT_SPEED * 0.7) * CAMERA_CONFIG.LANDING_HERO.DRIFT_Y,
    basePosition[2] + Math.cos(elapsedSeconds * CAMERA_CONFIG.LANDING_HERO.DRIFT_DEPTH_SPEED) * CAMERA_CONFIG.LANDING_HERO.DRIFT_Z,
  ];
}

function endPresentationCameraPosition(elapsedTimeMs, prefersReducedMotion) {
  if (prefersReducedMotion) {
    return [...CAMERA_CONFIG.END_PRESENTATION.STATIC_POSITION];
  }

  const orbitAngle = (elapsedTimeMs / 1000) * CAMERA_CONFIG.END_PRESENTATION.ORBIT_SPEED;
  const [targetX, , targetZ] = CAMERA_CONFIG.END_PRESENTATION.TARGET;

  return [
    targetX + Math.cos(orbitAngle) * CAMERA_CONFIG.END_PRESENTATION.ORBIT_RADIUS,
    CAMERA_CONFIG.END_PRESENTATION.ORBIT_HEIGHT,
    targetZ + Math.sin(orbitAngle) * CAMERA_CONFIG.END_PRESENTATION.ORBIT_RADIUS,
  ];
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
  activePlayerPosition,
  replayFrame,
  isReplay,
  replayEventType,
  introProgress,
  gameState,
  cameraNudge = [0, 0, 0],
  prefersReducedMotion = false,
  onCameraStateChange,
}) {
  const smoothedRef = useRef({
    position: [...INTRO_CONFIG.CAMERA_END],
    target: [0, 4, 0],
    fov: CAMERA_CONFIG.FOV.BROADCAST_WIDE,
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
    const targetMode = mode || CAMERA_CONFIG.MODES.BROADCAST_WIDE;
    const freeRoamActive = targetMode === CAMERA_CONFIG.MODES.FREE_ROAM && gameState !== "intro";
    const effectiveCameraNudge =
      targetMode === CAMERA_CONFIG.MODES.END_ORBIT ? [0, 0, 0] : cameraNudge;
    if (freeRoamActive) {
      const livePosition = [
        Number.isFinite(camera.position?.x)
          ? camera.position.x
          : smoothedRef.current.position[0],
        Number.isFinite(camera.position?.y)
          ? camera.position.y
          : smoothedRef.current.position[1],
        Number.isFinite(camera.position?.z)
          ? camera.position.z
          : smoothedRef.current.position[2],
      ];

      smoothedRef.current.position = livePosition;
      smoothedRef.current.fov = lerp(
        smoothedRef.current.fov,
        modeFov(CAMERA_CONFIG.MODES.FREE_ROAM),
        CAMERA_CONFIG.TRANSITION_ALPHA
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
      return;
    }

    if (targetMode === CAMERA_CONFIG.MODES.END_ORBIT) {
      const desiredTarget = endPresentationTarget();
      const desiredPosition = endPresentationCameraPosition(nowMs, prefersReducedMotion);

      smoothedRef.current.position = lerpVector(
        smoothedRef.current.position,
        desiredPosition,
        CAMERA_CONFIG.TRANSITION_ALPHA
      );
      smoothedRef.current.target = lerpVector(
        smoothedRef.current.target,
        desiredTarget,
        CAMERA_CONFIG.TRANSITION_ALPHA
      );
      smoothedRef.current.fov = lerp(
        smoothedRef.current.fov,
        modeFov(CAMERA_CONFIG.MODES.END_ORBIT),
        CAMERA_CONFIG.TRANSITION_ALPHA
      );

      camera.position.set(
        smoothedRef.current.position[0],
        smoothedRef.current.position[1],
        smoothedRef.current.position[2]
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
      return;
    }

    if (targetMode === CAMERA_CONFIG.MODES.LANDING_HERO) {
      const desiredTarget = landingHeroTarget();
      const desiredPosition = landingHeroCameraPosition(nowMs, prefersReducedMotion);

      smoothedRef.current.position = lerpVector(
        smoothedRef.current.position,
        desiredPosition,
        CAMERA_CONFIG.TRANSITION_ALPHA
      );
      smoothedRef.current.target = lerpVector(
        smoothedRef.current.target,
        desiredTarget,
        CAMERA_CONFIG.TRANSITION_ALPHA
      );
      smoothedRef.current.fov = lerp(
        smoothedRef.current.fov,
        modeFov(CAMERA_CONFIG.MODES.LANDING_HERO),
        CAMERA_CONFIG.TRANSITION_ALPHA
      );

      camera.position.set(
        smoothedRef.current.position[0],
        smoothedRef.current.position[1],
        smoothedRef.current.position[2]
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
      return;
    }

    const effectiveFocus =
      (targetMode === CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST ||
        targetMode === CAMERA_CONFIG.MODES.PLAYER_CHASE) &&
      activePlayerPosition
        ? [
            lerp(
              focus[0],
              activePlayerPosition[0],
              targetMode === CAMERA_CONFIG.MODES.PLAYER_CHASE ? 0.55 : 0.35
            ),
            focus[1],
            lerp(
              focus[2],
              activePlayerPosition[2],
              targetMode === CAMERA_CONFIG.MODES.PLAYER_CHASE ? 0.55 : 0.35
            ),
          ]
        : focus;
    const focusTarget = [
      effectiveFocus[0],
      4 + clamp(Math.abs(effectiveFocus[1]) * 0.25, 0, 5),
      effectiveFocus[2],
    ];
    const replayTarget = Array.isArray(replayFrame?.cameraTarget) ? replayFrame.cameraTarget : null;
    const desiredTarget =
      targetMode === CAMERA_CONFIG.MODES.REPLAY
        ? [
            replayTarget?.[0] ?? focusTarget[0],
            replayTarget?.[1] ?? focusTarget[1],
            replayTarget?.[2] ?? focusTarget[2],
          ]
        : getModeTarget(targetMode, focusTarget, centers.playersCenter, centers.keepersCenter);
    const desiredPosition =
      gameState === "intro"
        ? introCamera(introProgress || 0)
        : getModeCameraPosition(targetMode, desiredTarget, effectiveFocus);
    const goalReplayZoomActive = isReplay && replayEventType === "goal";
    const zoomedPosition = goalReplayZoomActive
      ? applyGoalReplayZoom(desiredPosition, desiredTarget)
      : desiredPosition;
    const targetFov = goalReplayZoomActive
      ? clamp(
          modeFov(targetMode) - CAMERA_CONFIG.GOAL_REPLAY_ZOOM.FOV_REDUCTION,
          CAMERA_CONFIG.GOAL_REPLAY_ZOOM.MIN_FOV,
          modeFov(targetMode)
        )
      : modeFov(targetMode);

    const alpha = isReplay
      ? CAMERA_CONFIG.REPLAY_TRANSITION_ALPHA
      : CAMERA_CONFIG.TRANSITION_ALPHA;

    smoothedRef.current.position = lerpVector(smoothedRef.current.position, zoomedPosition, alpha);
    smoothedRef.current.target = lerpVector(smoothedRef.current.target, desiredTarget, alpha);
    smoothedRef.current.fov = lerp(smoothedRef.current.fov, targetFov, alpha);

    camera.position.set(
      smoothedRef.current.position[0] + effectiveCameraNudge[0],
      smoothedRef.current.position[1] + effectiveCameraNudge[1],
      smoothedRef.current.position[2] + effectiveCameraNudge[2]
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
