import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useSphere } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BALL_BODY_NAME, BALL_CONFIG, PLAYER_ROLES, SHOT_METER_CONFIG } from "./config/gameConfig";

const BALL_MODES = {
  LOOSE: "loose",
  ATTACHED: "attached",
  RELEASED: "released",
};

const BALL_OWNERSHIP_CONFIG = {
  CLAIM_RADIUS: 1.85,
  IMMEDIATE_CLAIM_RADIUS: 1.2,
  CLAIM_CONFIRM_MS: 90,
  CONTEST_RADIUS: 1.7,
  CONTEST_CONFIRM_MS: 110,
  HEIGHT_TOLERANCE: 2.4,
  FOLLOW_OFFSET: 1.2,
  FOLLOW_HEIGHT_MULTIPLIER: 1.02,
  RELEASE_CLAIM_LOCK_MS: 220,
  RELEASE_TO_LOOSE_MS: 320,
  REACQUIRE_COOLDOWN_MS: 280,
  PRE_POSSESSION_AUTO_TAP_WINDOW_MS: 200,
};

const PLAYER_SHOOT_KEY = "d";

const SHOT_CHARGE_IDLE = {
  isCharging: false,
  chargeRatio: 0,
  isPerfect: false,
  canShoot: false,
};

function quantizeChargeRatio(chargeRatio) {
  const clamped = THREE.MathUtils.clamp(chargeRatio, 0, 1);
  return Math.min(1, Math.floor(clamped * 100) / 100);
}

function getNowMs() {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

function isShootKey(eventKey) {
  return typeof eventKey === "string" && eventKey.toLowerCase() === PLAYER_SHOOT_KEY;
}

function worldForceFromArrowKey(key, magnitude) {
  switch (key) {
    case "ArrowUp":
      return [0, 0, -magnitude];
    case "ArrowDown":
      return [0, 0, magnitude];
    case "ArrowLeft":
      return [-magnitude, 0, 0];
    case "ArrowRight":
      return [magnitude, 0, 0];
    default:
      return [0, 0, 0];
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalize2D(vector) {
  const magnitude = Math.hypot(vector[0], vector[1]);
  if (magnitude <= 0.0001) {
    return [0, 0];
  }

  return [vector[0] / magnitude, vector[1] / magnitude];
}

function facingVector(rotation) {
  const yaw = Number.isFinite(rotation?.[1]) ? rotation[1] : 0;
  return [Math.sin(yaw), Math.cos(yaw)];
}

function actorBallAnchor(actor, scale) {
  const position = actor?.position || actor?.spawnPosition || [0, 0, 0];
  const rotation = actor?.rotation || actor?.spawnRotation || [0, 0, 0];
  const [facingX, facingZ] = facingVector(rotation);
  const offset =
    BALL_OWNERSHIP_CONFIG.FOLLOW_OFFSET +
    scale * 0.35 +
    (actor?.role === PLAYER_ROLES.GOALKEEPER ? 0.18 : 0);
  const height =
    position[1] + Math.max(0.55, scale * BALL_OWNERSHIP_CONFIG.FOLLOW_HEIGHT_MULTIPLIER);

  return [position[0] + facingX * offset, height, position[2] + facingZ * offset];
}

function candidateScore(actor, ballPosition) {
  const actorPosition = actor?.position || actor?.spawnPosition || [0, 0, 0];
  const toBall = [ballPosition[0] - actorPosition[0], ballPosition[2] - actorPosition[2]];
  const direction = normalize2D(toBall);
  const [facingX, facingZ] = facingVector(actor?.rotation || actor?.spawnRotation);
  const facingAlignment = direction[0] * facingX + direction[1] * facingZ;
  const keeperBonus = actor?.role === PLAYER_ROLES.GOALKEEPER ? 0.08 : 0;

  return Math.hypot(toBall[0], toBall[1]) - facingAlignment * 0.3 - keeperBonus;
}

function buildClaimCandidates(players, ballPosition, ballY, scale) {
  return (Array.isArray(players) ? players : [])
    .filter((player) => player?.playerId && Array.isArray(player.position || player.spawnPosition))
    .map((player) => {
      const position = player.position || player.spawnPosition;
      const distance = Math.hypot(ballPosition[0] - position[0], ballPosition[2] - position[2]);
      const targetHeight =
        position[1] + Math.max(0.55, scale * BALL_OWNERSHIP_CONFIG.FOLLOW_HEIGHT_MULTIPLIER);
      const alignedByHeight =
        Math.abs(ballY - targetHeight) <= BALL_OWNERSHIP_CONFIG.HEIGHT_TOLERANCE;
      const radius =
        BALL_OWNERSHIP_CONFIG.CLAIM_RADIUS +
        scale * 0.35 +
        (player.role === PLAYER_ROLES.GOALKEEPER ? 0.35 : 0);

      return {
        ...player,
        position,
        distance,
        targetHeight,
        inRange: distance <= radius && alignedByHeight,
        score: candidateScore({ ...player, position }, ballPosition),
      };
    })
    .filter((candidate) => candidate.inRange)
    .sort((left, right) => left.score - right.score);
}

function buildLaunchVector({ actor, targetPosition, targetPlayer, type, power = 1, shotPowerMultiplier }) {
  const actorPosition = actor?.position || actor?.spawnPosition || [0, 0, 0];
  const actorRotation = actor?.rotation || actor?.spawnRotation || [0, 0, 0];
  const [facingX, facingZ] = facingVector(actorRotation);
  const desiredTarget = targetPlayer?.position || targetPosition || [
    actorPosition[0] + facingX * 18,
    0,
    actorPosition[2] + facingZ * 18,
  ];
  const direction = normalize2D([
    desiredTarget[0] - actorPosition[0],
    desiredTarget[2] - actorPosition[2],
  ]);
  const resolvedDirection =
    direction[0] === 0 && direction[1] === 0 ? [facingX, facingZ] : direction;

  if (type === "pass") {
    return [
      resolvedDirection[0] * BALL_CONFIG.FORCE * clamp(power, 0.7, 1.45),
      1.15,
      resolvedDirection[1] * BALL_CONFIG.FORCE * clamp(power, 0.7, 1.45),
    ];
  }

  if (type === "clear") {
    return [
      resolvedDirection[0] * BALL_CONFIG.FORCE * clamp(power, 0.9, 1.5),
      2.4,
      resolvedDirection[1] * BALL_CONFIG.FORCE * clamp(power, 0.9, 1.5),
    ];
  }

  const speed = clamp(power, 0.85, 1.35) * shotPowerMultiplier;
  return [
    resolvedDirection[0] * SHOT_METER_CONFIG.MAX_LAUNCH_SPEED * speed,
    SHOT_METER_CONFIG.MIN_UPWARD_SPEED + 1.3 * speed,
    resolvedDirection[1] * SHOT_METER_CONFIG.MAX_LAUNCH_SPEED * speed,
  ];
}

function SoccerBallModel(props) {
  const {
    scale,
    resetRef,
    kickoffRef,
    ballActionCommand,
    onBallActionResolved,
    controlsEnabled,
    mapMovementKeyToForce,
    players = [],
    controlledPlayerId = null,
    controlledTeamId = "teamOne",
    playerControlsEnabled = false,
    onOutOfBounds,
    activePowerZone,
    onPowerZoneEnter,
    speedMultiplier = 1,
    shotPowerMultiplier = 1,
    controlAssistMultiplier = 1,
    onShotChargeChange,
    onKickRelease,
    onBallSnapshot,
    onPossessionChange,
    onShotEvent,
    replayActive = false,
    replayFrameBall = null,
  } = props;

  const { scene } = useGLTF("/ball/scene.gltf");
  const ballScene = useMemo(() => scene.clone(), [scene]);
  const [ref, api] = useSphere(() => ({
    mass: BALL_CONFIG.MASS,
    name: BALL_BODY_NAME,
    userData: { bodyType: BALL_BODY_NAME },
    position: BALL_CONFIG.SPAWN_POSITION,
    args: [scale],
    restitution: BALL_CONFIG.RESTITUTION,
    friction: BALL_CONFIG.FRICTION,
    linearDamping: BALL_CONFIG.LINEAR_DAMPING,
    angularDamping: BALL_CONFIG.ANGULAR_DAMPING,
  }));

  const velocityRef = useRef([0, 0, 0]);
  const ballPositionRef = useRef([...BALL_CONFIG.SPAWN_POSITION]);
  const directionRef = useRef([0, 0, 0]);
  const possessionRef = useRef(null);
  const ballModeRef = useRef(BALL_MODES.LOOSE);
  const kickoffSetupRef = useRef(null);
  const claimCandidateRef = useRef(null);
  const contestCandidateRef = useRef(null);
  const possessionLockUntilRef = useRef(0);
  const releaseToLooseAtRef = useRef(0);
  const spaceHeldRef = useRef(false);
  const pendingAutoTapRef = useRef(null);
  const shotChargeStartAtRef = useRef(0);
  const shotChargeRatioRef = useRef(0);
  const shotChargingRef = useRef(false);
  const shotChargeCooldownUntilRef = useRef(0);
  const lastShotChargeStateRef = useRef(SHOT_CHARGE_IDLE);
  const outOfBoundsLockRef = useRef(false);
  const outOfBoundsTimerRef = useRef(null);
  const triggeredZoneIdRef = useRef(null);
  const lastPossessionRef = useRef(null);
  const lastSnapshotAtMsRef = useRef(0);
  const appliedBallActionIdRef = useRef(null);

  const playersById = useMemo(
    () =>
      (Array.isArray(players) ? players : []).reduce((lookup, player) => {
        lookup[player.playerId] = player;
        return lookup;
      }, {}),
    [players]
  );

  const emitShotChargeState = useCallback(
    (nextState) => {
      if (!onShotChargeChange) {
        return;
      }

      const safeState = {
        ...SHOT_CHARGE_IDLE,
        ...nextState,
      };
      const previousState = lastShotChargeStateRef.current;
      const changed =
        previousState.isCharging !== safeState.isCharging ||
        previousState.isPerfect !== safeState.isPerfect ||
        previousState.canShoot !== safeState.canShoot ||
        Math.abs(previousState.chargeRatio - safeState.chargeRatio) > 0.0001;

      if (!changed) {
        return;
      }

      lastShotChargeStateRef.current = safeState;
      onShotChargeChange(safeState);
    },
    [onShotChargeChange]
  );

  const emitPossessionChange = useCallback(
    (nextPossession) => {
      if (!onPossessionChange) {
        return;
      }

      const previous = lastPossessionRef.current;
      const previousTeamId = previous?.teamId || null;
      const previousPlayerId = previous?.playerId || null;
      const nextTeamId = nextPossession?.teamId || null;
      const nextPlayerId = nextPossession?.playerId || null;
      if (previousTeamId === nextTeamId && previousPlayerId === nextPlayerId) {
        return;
      }

      lastPossessionRef.current = nextPossession
        ? { teamId: nextTeamId, playerId: nextPlayerId }
        : null;
      onPossessionChange(lastPossessionRef.current);
    },
    [onPossessionChange]
  );

  const clearPossession = useCallback(() => {
    possessionRef.current = null;
    emitPossessionChange(null);
  }, [emitPossessionChange]);

  const attachPossession = useCallback(
    (actor) => {
      if (!actor?.playerId || !actor.teamId) {
        return;
      }

      possessionRef.current = {
        teamId: actor.teamId,
        playerId: actor.playerId,
      };
      ballModeRef.current = BALL_MODES.ATTACHED;
      emitPossessionChange(possessionRef.current);
    },
    [emitPossessionChange]
  );

  const alignBallToActor = useCallback(
    (actor) => {
      const anchor = actorBallAnchor(actor, scale);
      api.position.set(anchor[0], anchor[1], anchor[2]);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      ballPositionRef.current = anchor;
      velocityRef.current = [0, 0, 0];
    },
    [api, scale]
  );

  const placeStationaryBall = useCallback(
    (nextPosition) => {
      api.position.set(nextPosition[0], nextPosition[1], nextPosition[2]);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      ballPositionRef.current = [...nextPosition];
      velocityRef.current = [0, 0, 0];
    },
    [api]
  );

  const resetShotCharge = useCallback(() => {
    shotChargeStartAtRef.current = 0;
    shotChargeRatioRef.current = 0;
    shotChargingRef.current = false;
    shotChargeCooldownUntilRef.current = 0;
    spaceHeldRef.current = false;
    pendingAutoTapRef.current = null;
    emitShotChargeState(SHOT_CHARGE_IDLE);
  }, [emitShotChargeState]);

  const releaseBall = useCallback(
    ({
      actor,
      type,
      targetPosition = null,
      targetPlayer = null,
      power = 1,
      triggerShotEvent = true,
      treatAsSave = false,
      triggerKickRelease = null,
    }) => {
      const now = getNowMs();
      const anchor = actorBallAnchor(actor, scale);
      const vector = buildLaunchVector({
        actor,
        targetPosition,
        targetPlayer,
        type,
        power,
        shotPowerMultiplier,
      });

      ballModeRef.current = BALL_MODES.RELEASED;
      possessionLockUntilRef.current = now + BALL_OWNERSHIP_CONFIG.RELEASE_CLAIM_LOCK_MS;
      releaseToLooseAtRef.current = now + BALL_OWNERSHIP_CONFIG.RELEASE_TO_LOOSE_MS;
      claimCandidateRef.current = null;
      contestCandidateRef.current = null;
      api.position.set(anchor[0], anchor[1], anchor[2]);
      api.velocity.set(vector[0], vector[1], vector[2]);
      api.angularVelocity.set(0, 0, 0);
      ballPositionRef.current = anchor;
      velocityRef.current = [...vector];
      clearPossession();

      kickoffSetupRef.current = null;

      if (triggerKickRelease) {
        onKickRelease?.(triggerKickRelease);
      }

      if (triggerShotEvent) {
        if (treatAsSave) {
          onShotEvent?.({
            type: "save",
            teamId: actor.teamId,
            actorId: actor.playerId,
            releasedAtMs: now,
          });
        } else if (type === "shot") {
          onShotEvent?.({
            type: "shot",
            teamId: actor.teamId,
            actorId: actor.playerId,
            releasedAtMs: now,
          });
        }
      }
    },
    [api, clearPossession, onKickRelease, onShotEvent, scale, shotPowerMultiplier]
  );

  const resetBall = useCallback(() => {
    directionRef.current = [0, 0, 0];
    possessionLockUntilRef.current = 0;
    releaseToLooseAtRef.current = 0;
    ballModeRef.current = BALL_MODES.LOOSE;
    kickoffSetupRef.current = null;
    claimCandidateRef.current = null;
    contestCandidateRef.current = null;
    clearPossession();
    resetShotCharge();
    outOfBoundsLockRef.current = false;
    triggeredZoneIdRef.current = null;
    placeStationaryBall(BALL_CONFIG.SPAWN_POSITION);
  }, [clearPossession, placeStationaryBall, resetShotCharge]);

  const kickoffBall = useCallback(
    (kickoffSetup = null) => {
      directionRef.current = [0, 0, 0];
      possessionLockUntilRef.current = 0;
      releaseToLooseAtRef.current = 0;
      ballModeRef.current = BALL_MODES.LOOSE;
      claimCandidateRef.current = null;
      contestCandidateRef.current = null;
      clearPossession();
      resetShotCharge();
      outOfBoundsLockRef.current = false;
      triggeredZoneIdRef.current = null;

      const spotPosition = Array.isArray(kickoffSetup?.spotPosition)
        ? kickoffSetup.spotPosition
        : [0, 0, 0];
      const kickoffHeight = Math.max(0.55, scale * BALL_OWNERSHIP_CONFIG.FOLLOW_HEIGHT_MULTIPLIER);
      kickoffSetupRef.current =
        kickoffSetup?.takerId && kickoffSetup?.teamId
          ? {
              id: kickoffSetup.id || `kickoff-${kickoffSetup.teamId}-${kickoffSetup.takerId}`,
              teamId: kickoffSetup.teamId,
              takerId: kickoffSetup.takerId,
            }
          : null;
      placeStationaryBall([spotPosition[0], kickoffHeight, spotPosition[2]]);
    },
    [clearPossession, placeStationaryBall, resetShotCharge, scale]
  );

  const resolveLegalActor = useCallback(
    (command) => {
      const actor = playersById[command.actorId];
      if (!actor || actor.teamId !== command.teamId) {
        return { actor: null, accepted: false, treatAsSave: false };
      }

      const kickoffSetup = kickoffSetupRef.current;
      if (
        kickoffSetup?.takerId === actor.playerId &&
        kickoffSetup?.teamId === actor.teamId
      ) {
        return { actor, accepted: true, treatAsSave: false };
      }

      const currentPossession = possessionRef.current;
      if (
        currentPossession?.playerId === actor.playerId &&
        currentPossession?.teamId === actor.teamId
      ) {
        return { actor, accepted: true, treatAsSave: false };
      }

      const candidates = buildClaimCandidates(
        players,
        ballPositionRef.current,
        ballPositionRef.current[1],
        scale
      );
      const bestCandidate = candidates[0] || null;
      if (
        bestCandidate?.playerId === actor.playerId &&
        ballModeRef.current !== BALL_MODES.ATTACHED
      ) {
        return { actor: bestCandidate, accepted: true, treatAsSave: false };
      }

      const actorPosition = actor.position || actor.spawnPosition || [0, 0, 0];
      const actorDistance = Math.hypot(
        ballPositionRef.current[0] - actorPosition[0],
        ballPositionRef.current[2] - actorPosition[2]
      );
      const keeperSave =
        actor.role === PLAYER_ROLES.GOALKEEPER &&
        actorDistance <= BALL_OWNERSHIP_CONFIG.CLAIM_RADIUS + 0.6;

      return { actor, accepted: keeperSave, treatAsSave: keeperSave };
    },
    [players, playersById, scale]
  );

  useEffect(() => {
    ballScene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          map: child.material.map,
          normalMap: child.material.normalMap,
          metalness: 0.4,
          roughness: 0.2,
          envMapIntensity: 1,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [ballScene]);

  useEffect(() => {
    if (resetRef) {
      resetRef.current = resetBall;
    }

    return () => {
      if (resetRef?.current === resetBall) {
        resetRef.current = null;
      }
    };
  }, [resetBall, resetRef]);

  useEffect(() => {
    if (kickoffRef) {
      kickoffRef.current = kickoffBall;
    }

    return () => {
      if (kickoffRef?.current === kickoffBall) {
        kickoffRef.current = null;
      }
    };
  }, [kickoffBall, kickoffRef]);

  useEffect(() => {
    if (!activePowerZone) {
      triggeredZoneIdRef.current = null;
    }
  }, [activePowerZone]);

  useEffect(() => {
    if (!controlsEnabled) {
      directionRef.current = [0, 0, 0];
      return;
    }

    kickoffSetupRef.current = null;
    ballModeRef.current = BALL_MODES.LOOSE;
    claimCandidateRef.current = null;
    contestCandidateRef.current = null;
    clearPossession();
    resetShotCharge();
  }, [clearPossession, controlsEnabled, resetShotCharge]);

  useEffect(() => {
    if (playerControlsEnabled) {
      return;
    }

    resetShotCharge();
  }, [playerControlsEnabled, resetShotCharge]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!playerControlsEnabled || !controlledPlayerId || !isShootKey(event.key)) {
        return;
      }

      if (event.repeat) {
        return;
      }

      event.preventDefault();
      spaceHeldRef.current = true;

      const now = getNowMs();
      if (now < shotChargeCooldownUntilRef.current) {
        return;
      }

      const currentPossession = possessionRef.current;
      if (
        currentPossession?.teamId === controlledTeamId &&
        currentPossession?.playerId === controlledPlayerId
      ) {
        shotChargingRef.current = true;
        shotChargeStartAtRef.current = now;
        shotChargeRatioRef.current = 0;
        emitShotChargeState({
          isCharging: true,
          chargeRatio: 0,
          isPerfect: false,
          canShoot: true,
        });
        return;
      }

      pendingAutoTapRef.current = {
        expiresAt: now + BALL_OWNERSHIP_CONFIG.PRE_POSSESSION_AUTO_TAP_WINDOW_MS,
      };
    };

    const handleKeyUp = (event) => {
      if (!playerControlsEnabled || !controlledPlayerId || !isShootKey(event.key)) {
        return;
      }

      event.preventDefault();
      spaceHeldRef.current = false;
      pendingAutoTapRef.current = null;

      if (!shotChargingRef.current) {
        return;
      }

      shotChargingRef.current = false;
      const chargeDurationMs = Math.max(0, getNowMs() - shotChargeStartAtRef.current);
      const uiChargeRatio = quantizeChargeRatio(chargeDurationMs / SHOT_METER_CONFIG.MAX_CHARGE_MS);
      const effectiveChargeRatio = Math.max(uiChargeRatio, SHOT_METER_CONFIG.MIN_CHARGE_RATIO);
      const isPerfect =
        uiChargeRatio >= SHOT_METER_CONFIG.PERFECT_WINDOW_START &&
        uiChargeRatio <= SHOT_METER_CONFIG.PERFECT_WINDOW_END;
      const actor = playersById[controlledPlayerId];

      if (!actor || possessionRef.current?.playerId !== controlledPlayerId) {
        emitShotChargeState(SHOT_CHARGE_IDLE);
        return;
      }

      const baseLaunchSpeed = THREE.MathUtils.lerp(
        SHOT_METER_CONFIG.MIN_LAUNCH_SPEED,
        SHOT_METER_CONFIG.MAX_LAUNCH_SPEED,
        effectiveChargeRatio
      );
      const launchSpeed = Math.min(
        baseLaunchSpeed * shotPowerMultiplier * (isPerfect ? 1.1 : 1),
        SHOT_METER_CONFIG.MAX_LAUNCH_SPEED * shotPowerMultiplier
      );
      const launchUpwardSpeed = THREE.MathUtils.lerp(
        SHOT_METER_CONFIG.MIN_UPWARD_SPEED,
        SHOT_METER_CONFIG.MAX_UPWARD_SPEED,
        effectiveChargeRatio
      );

      shotChargeCooldownUntilRef.current = getNowMs() + SHOT_METER_CONFIG.RECHARGE_COOLDOWN_MS;
      releaseBall({
        actor,
        type: "shot",
        power: launchSpeed / SHOT_METER_CONFIG.MAX_LAUNCH_SPEED,
        triggerKickRelease: {
          chargeRatio: effectiveChargeRatio,
          isPerfect,
          launchSpeed,
          upwardSpeed: launchUpwardSpeed,
          releasedAtMs: getNowMs(),
        },
      });
      emitShotChargeState(SHOT_CHARGE_IDLE);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    controlledPlayerId,
    controlledTeamId,
    emitShotChargeState,
    playerControlsEnabled,
    playersById,
    releaseBall,
    shotPowerMultiplier,
  ]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!controlsEnabled) {
        return;
      }

      const directionalForce = BALL_CONFIG.FORCE * speedMultiplier;
      const normalizedKey = typeof event.key === "string" ? event.key.toLowerCase() : "";

      if (isShootKey(normalizedKey)) {
        event.preventDefault();
        api.applyImpulse([0, BALL_CONFIG.JUMP_IMPULSE * shotPowerMultiplier, 0], [0, 0, 0]);
        onShotEvent?.({
          type: "ball_pop",
          teamId: controlledTeamId,
          releasedAtMs: getNowMs(),
        });
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const mappedForce =
          typeof mapMovementKeyToForce === "function"
            ? mapMovementKeyToForce(event.key, directionalForce)
            : null;

        if (Array.isArray(mappedForce) && mappedForce.length >= 3) {
          const nextX = Number.isFinite(mappedForce[0]) ? mappedForce[0] : 0;
          const nextZ = Number.isFinite(mappedForce[2]) ? mappedForce[2] : 0;
          directionRef.current = [nextX, 0, nextZ];
          return;
        }

        directionRef.current = worldForceFromArrowKey(event.key, directionalForce);
      }
    };

    const handleKeyUp = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        directionRef.current = [0, 0, 0];
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    api,
    controlledTeamId,
    controlsEnabled,
    mapMovementKeyToForce,
    onShotEvent,
    shotPowerMultiplier,
    speedMultiplier,
  ]);

  useEffect(() => {
    if (!ballActionCommand?.id) {
      return;
    }

    if (appliedBallActionIdRef.current === ballActionCommand.id) {
      return;
    }

    appliedBallActionIdRef.current = ballActionCommand.id;
    const resolution = resolveLegalActor(ballActionCommand);
    if (!resolution.accepted || !resolution.actor) {
      onBallActionResolved?.({
        id: ballActionCommand.id,
        accepted: false,
        actorId: ballActionCommand.actorId,
        teamId: ballActionCommand.teamId,
        type: ballActionCommand.type,
        targetPlayerId: ballActionCommand.targetPlayerId || null,
      });
      return;
    }

    const actor = resolution.actor;
    const targetPlayer =
      ballActionCommand.targetPlayerId && playersById[ballActionCommand.targetPlayerId]
        ? playersById[ballActionCommand.targetPlayerId]
        : null;

    if (ballModeRef.current !== BALL_MODES.ATTACHED) {
      attachPossession(actor);
      alignBallToActor(actor);
    }

    releaseBall({
      actor,
      type: ballActionCommand.type,
      targetPosition: ballActionCommand.targetPosition,
      targetPlayer,
      power: ballActionCommand.power,
      triggerShotEvent: ballActionCommand.type !== "pass",
      treatAsSave: resolution.treatAsSave,
    });

    onBallActionResolved?.({
      id: ballActionCommand.id,
      accepted: true,
      actorId: ballActionCommand.actorId,
      teamId: ballActionCommand.teamId,
      type: ballActionCommand.type,
      targetPlayerId: ballActionCommand.targetPlayerId || null,
    });
  }, [
    alignBallToActor,
    attachPossession,
    ballActionCommand,
    onBallActionResolved,
    playersById,
    releaseBall,
    resolveLegalActor,
  ]);

  useEffect(() => {
    const unsubscribeVelocity = api.velocity.subscribe((nextVelocity) => {
      velocityRef.current = nextVelocity;
    });

    const unsubscribePosition = api.position.subscribe(([x, y, z]) => {
      ballPositionRef.current = [x, y, z];

      if (replayActive) {
        return;
      }

      if (
        onOutOfBounds &&
        !outOfBoundsLockRef.current &&
        (Math.abs(x) > BALL_CONFIG.OUT_OF_BOUNDS.X ||
          Math.abs(z) > BALL_CONFIG.OUT_OF_BOUNDS.Z ||
          y < BALL_CONFIG.OUT_OF_BOUNDS.Y)
      ) {
        outOfBoundsLockRef.current = true;
        onOutOfBounds();

        if (outOfBoundsTimerRef.current) {
          clearTimeout(outOfBoundsTimerRef.current);
        }

        outOfBoundsTimerRef.current = setTimeout(() => {
          outOfBoundsLockRef.current = false;
        }, 400);
      }

      if (!activePowerZone || !onPowerZoneEnter) {
        return;
      }

      const [zoneX, zoneZ] = activePowerZone.position;
      const zoneRadius = activePowerZone.radius;
      const dx = x - zoneX;
      const dz = z - zoneZ;
      const isInsideZone = dx * dx + dz * dz <= zoneRadius * zoneRadius && y < 5;

      if (isInsideZone && triggeredZoneIdRef.current !== activePowerZone.id) {
        triggeredZoneIdRef.current = activePowerZone.id;
        onPowerZoneEnter(activePowerZone);
      }
    });

    return () => {
      unsubscribeVelocity();
      unsubscribePosition();
      if (outOfBoundsTimerRef.current) {
        clearTimeout(outOfBoundsTimerRef.current);
      }
    };
  }, [activePowerZone, api, onOutOfBounds, onPowerZoneEnter, replayActive]);

  useFrame(() => {
    const now = getNowMs();
    let [vx, vy, vz] = velocityRef.current;

    if (replayActive && replayFrameBall?.position) {
      const [px, py, pz] = replayFrameBall.position;
      const frameVelocity = replayFrameBall.velocity || [0, 0, 0];
      api.position.set(px, py, pz);
      api.velocity.set(frameVelocity[0], frameVelocity[1], frameVelocity[2]);
      api.angularVelocity.set(0, 0, 0);
      ballPositionRef.current = [px, py, pz];
      velocityRef.current = [...frameVelocity];
      ballModeRef.current = BALL_MODES.LOOSE;
      if (possessionRef.current) {
        clearPossession();
      }
      return;
    }

    if (onBallSnapshot && now - lastSnapshotAtMsRef.current >= 32) {
      lastSnapshotAtMsRef.current = now;
      onBallSnapshot({
        timestampMs: now,
        position: [...ballPositionRef.current],
        velocity: [vx, vy, vz],
        mode: ballModeRef.current,
        possession: possessionRef.current ? { ...possessionRef.current } : null,
      });
    }

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const boostedMaxSpeed = BALL_CONFIG.MAX_SPEED * (speedMultiplier > 1 ? 1.35 : 1);
    if (speed > boostedMaxSpeed && ballModeRef.current !== BALL_MODES.ATTACHED) {
      const scaleVelocity = boostedMaxSpeed / speed;
      vx *= scaleVelocity;
      vy *= scaleVelocity;
      vz *= scaleVelocity;
      api.velocity.set(vx, vy, vz);
    }

    if (controlsEnabled && (directionRef.current[0] !== 0 || directionRef.current[2] !== 0)) {
      api.applyForce(directionRef.current, [0, 0, 0]);

      if (controlAssistMultiplier > 1) {
        const directionalMagnitude = Math.hypot(directionRef.current[0], directionRef.current[2]);
        if (directionalMagnitude > 0.001) {
          const dirX = directionRef.current[0] / directionalMagnitude;
          const dirZ = directionRef.current[2] / directionalMagnitude;
          const perpX = -dirZ;
          const perpZ = dirX;
          const lateralVelocity = vx * perpX + vz * perpZ;
          const correctionMagnitude =
            -lateralVelocity * BALL_CONFIG.FORCE * 0.38 * controlAssistMultiplier;
          api.applyForce([perpX * correctionMagnitude, 0, perpZ * correctionMagnitude], [0, 0, 0]);
        }
      }
    }

    if (shotChargingRef.current) {
      if (possessionRef.current?.playerId !== controlledPlayerId) {
        shotChargingRef.current = false;
        shotChargeStartAtRef.current = 0;
        shotChargeRatioRef.current = 0;
        pendingAutoTapRef.current = null;
        emitShotChargeState(SHOT_CHARGE_IDLE);
      } else {
        const chargeDurationMs = Math.max(0, now - shotChargeStartAtRef.current);
        const chargeRatio = quantizeChargeRatio(chargeDurationMs / SHOT_METER_CONFIG.MAX_CHARGE_MS);
        const isPerfect =
          chargeRatio >= SHOT_METER_CONFIG.PERFECT_WINDOW_START &&
          chargeRatio <= SHOT_METER_CONFIG.PERFECT_WINDOW_END;

        if (Math.abs(chargeRatio - shotChargeRatioRef.current) > 0.0001) {
          shotChargeRatioRef.current = chargeRatio;
          emitShotChargeState({
            isCharging: true,
            chargeRatio,
            isPerfect,
            canShoot: true,
          });
        }
      }
    }

    const currentPossession = possessionRef.current;
    if (currentPossession?.teamId === controlledTeamId && currentPossession?.playerId === controlledPlayerId) {
      const pendingAutoTap = pendingAutoTapRef.current;
      if (
        pendingAutoTap &&
        spaceHeldRef.current &&
        now <= pendingAutoTap.expiresAt &&
        !shotChargingRef.current
      ) {
        pendingAutoTapRef.current = null;
        const actor = playersById[controlledPlayerId];
        if (actor) {
          releaseBall({
            actor,
            type: "shot",
            power: SHOT_METER_CONFIG.MIN_CHARGE_RATIO,
            triggerKickRelease: {
              chargeRatio: SHOT_METER_CONFIG.MIN_CHARGE_RATIO,
              isPerfect: false,
              launchSpeed: SHOT_METER_CONFIG.MIN_LAUNCH_SPEED,
              upwardSpeed: SHOT_METER_CONFIG.MIN_UPWARD_SPEED,
              releasedAtMs: now,
            },
          });
        }
      }
    }

    if (ballModeRef.current === BALL_MODES.RELEASED && now >= releaseToLooseAtRef.current) {
      ballModeRef.current = BALL_MODES.LOOSE;
    }

    if (ballModeRef.current === BALL_MODES.ATTACHED) {
      const possessor = currentPossession ? playersById[currentPossession.playerId] : null;
      if (!possessor) {
        ballModeRef.current = BALL_MODES.LOOSE;
        clearPossession();
      } else {
        alignBallToActor(possessor);

        const challengers = buildClaimCandidates(
          players,
          ballPositionRef.current,
          ballPositionRef.current[1],
          scale
        )
          .filter((candidate) => candidate.teamId !== possessor.teamId)
          .filter((candidate) => candidate.distance <= BALL_OWNERSHIP_CONFIG.CONTEST_RADIUS);
        const challenger = challengers[0] || null;

        if (challenger) {
          const currentContest = contestCandidateRef.current;
          if (currentContest?.playerId !== challenger.playerId) {
            contestCandidateRef.current = {
              playerId: challenger.playerId,
              startedAt: now,
            };
          } else if (now - currentContest.startedAt >= BALL_OWNERSHIP_CONFIG.CONTEST_CONFIRM_MS) {
            attachPossession(challenger);
            contestCandidateRef.current = null;
          }
        } else {
          contestCandidateRef.current = null;
        }
      }

      return;
    }

    if (kickoffSetupRef.current) {
      return;
    }

    if (controlsEnabled || now < possessionLockUntilRef.current) {
      return;
    }

    const candidates = buildClaimCandidates(
      players,
      ballPositionRef.current,
      ballPositionRef.current[1],
      scale
    );
    const bestCandidate = candidates[0] || null;
    if (!bestCandidate) {
      claimCandidateRef.current = null;
      return;
    }

    const currentClaim = claimCandidateRef.current;
    if (currentClaim?.playerId !== bestCandidate.playerId) {
      if (bestCandidate.distance <= BALL_OWNERSHIP_CONFIG.IMMEDIATE_CLAIM_RADIUS) {
        attachPossession(bestCandidate);
        alignBallToActor(bestCandidate);
        claimCandidateRef.current = null;
        return;
      }

      claimCandidateRef.current = {
        playerId: bestCandidate.playerId,
        teamId: bestCandidate.teamId,
        startedAt: now,
      };
      return;
    }

    if (
      bestCandidate.distance <= BALL_OWNERSHIP_CONFIG.IMMEDIATE_CLAIM_RADIUS ||
      now - currentClaim.startedAt >= BALL_OWNERSHIP_CONFIG.CLAIM_CONFIRM_MS
    ) {
      attachPossession(bestCandidate);
      alignBallToActor(bestCandidate);
      claimCandidateRef.current = null;
    }
  });
  return (
    <group ref={ref} name={BALL_BODY_NAME} scale={[scale, scale, scale]}>
      <primitive object={ballScene} castShadow receiveShadow />
    </group>
  );
}

useGLTF.preload("/ball/scene.gltf");

export default SoccerBallModel;
