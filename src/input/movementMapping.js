import { CAMERA_CONFIG } from "../config/gameConfig";

export const MOVEMENT_MAPPING_MODES = {
  AUTO: "auto",
  CAMERA: "camera",
  WORLD: "world",
};

const PLANAR_EPSILON = 0.0001;
const ZERO_VECTOR = [0, 0, 0];
const WORLD_FORWARD = [0, 0, -1];
const WORLD_RIGHT = [1, 0, 0];
const CAMERA_RELATIVE_AUTO_MODES = new Set([
  CAMERA_CONFIG.MODES.BROADCAST_WIDE,
  CAMERA_CONFIG.MODES.PLAYER_CHASE,
  CAMERA_CONFIG.MODES.BEHIND_PLAYER_WEST,
  CAMERA_CONFIG.MODES.ATTACKING_THIRD,
  CAMERA_CONFIG.MODES.GOAL_LINE,
  CAMERA_CONFIG.MODES.SIDE_LEFT,
  CAMERA_CONFIG.MODES.SIDE_RIGHT,
]);

function normalizePlanar(x, z) {
  const magnitude = Math.hypot(x, z);
  if (magnitude <= PLANAR_EPSILON) {
    return null;
  }

  return [x / magnitude, z / magnitude];
}

function basisFromModeAndState(effectiveMode, cameraState) {
  if (effectiveMode === MOVEMENT_MAPPING_MODES.CAMERA) {
    return buildCameraPlanarBasis(cameraState);
  }

  return {
    forward: WORLD_FORWARD,
    right: WORLD_RIGHT,
  };
}

function keyToPlanarUnitVector(key, basis) {
  switch (key) {
    case "ArrowUp":
      return basis.forward;
    case "ArrowDown":
      return [-basis.forward[0], 0, -basis.forward[2]];
    case "ArrowLeft":
      return [-basis.right[0], 0, -basis.right[2]];
    case "ArrowRight":
      return basis.right;
    default:
      return null;
  }
}

export function getAutoMappingForCamera(cameraMode) {
  if (cameraMode === CAMERA_CONFIG.MODES.FREE_ROAM) {
    return MOVEMENT_MAPPING_MODES.WORLD;
  }

  if (CAMERA_RELATIVE_AUTO_MODES.has(cameraMode)) {
    return MOVEMENT_MAPPING_MODES.CAMERA;
  }

  return MOVEMENT_MAPPING_MODES.WORLD;
}

export function resolveEffectiveMappingMode(overrideMode, cameraMode) {
  if (
    overrideMode === MOVEMENT_MAPPING_MODES.CAMERA ||
    overrideMode === MOVEMENT_MAPPING_MODES.WORLD
  ) {
    return overrideMode;
  }

  return getAutoMappingForCamera(cameraMode);
}

export function buildCameraPlanarBasis(cameraState) {
  const cameraPosition = Array.isArray(cameraState?.position) ? cameraState.position : null;
  const cameraTarget = Array.isArray(cameraState?.target) ? cameraState.target : null;

  if (!cameraPosition || !cameraTarget) {
    return {
      forward: WORLD_FORWARD,
      right: WORLD_RIGHT,
    };
  }

  const planarForward = normalizePlanar(
    cameraTarget[0] - cameraPosition[0],
    cameraTarget[2] - cameraPosition[2]
  );

  if (!planarForward) {
    return {
      forward: WORLD_FORWARD,
      right: WORLD_RIGHT,
    };
  }

  return {
    forward: [planarForward[0], 0, planarForward[1]],
    right: [-planarForward[1], 0, planarForward[0]],
  };
}

export function mapArrowStateToWorldDirection(inputState = {}, mappingContext = {}) {
  const effectiveMode = resolveEffectiveMappingMode(
    mappingContext.overrideMode,
    mappingContext.cameraMode
  );
  const basis = basisFromModeAndState(effectiveMode, mappingContext.cameraState);
  const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

  let x = 0;
  let z = 0;

  for (const key of keys) {
    if (!inputState[key]) {
      continue;
    }

    const nextVector = keyToPlanarUnitVector(key, basis);
    if (!nextVector) {
      continue;
    }

    x += nextVector[0];
    z += nextVector[2];
  }

  const normalized = normalizePlanar(x, z);
  if (!normalized) {
    return ZERO_VECTOR;
  }

  return [normalized[0], 0, normalized[1]];
}

export function mapSingleArrowKeyToWorldForce(key, magnitude, mappingContext = {}) {
  const normalizedMagnitude = Number.isFinite(magnitude) ? magnitude : 0;
  if (normalizedMagnitude <= 0) {
    return ZERO_VECTOR;
  }

  const effectiveMode = resolveEffectiveMappingMode(
    mappingContext.overrideMode,
    mappingContext.cameraMode
  );
  const basis = basisFromModeAndState(effectiveMode, mappingContext.cameraState);
  const unitVector = keyToPlanarUnitVector(key, basis);
  if (!unitVector) {
    return ZERO_VECTOR;
  }

  return [
    unitVector[0] * normalizedMagnitude,
    0,
    unitVector[2] * normalizedMagnitude,
  ];
}
