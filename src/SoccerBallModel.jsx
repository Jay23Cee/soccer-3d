import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useSphere } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BALL_BODY_NAME, BALL_CONFIG, SHOT_METER_CONFIG } from "./config/gameConfig";

const PLAYER_POSSESSION_CONFIG = {
  TOUCH_RADIUS: 1.75,
  HEIGHT_TOLERANCE: 2.2,
  FOLLOW_OFFSET: 1.2,
  FOLLOW_HEIGHT_MULTIPLIER: 1.02,
  KICK_DECAY_DURATION_MS: 950,
  KICK_END_SPEED: 8.5,
  REACQUIRE_COOLDOWN_MS: 300,
};

const PRE_POSSESSION_AUTO_TAP_WINDOW_MS = 200;
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

function SoccerBallModel({
  scale,
  resetRef,
  kickoffRef,
  externalBallCommand,
  controlsEnabled,
  teamOnePlayers = [],
  playerControlsEnabled = false,
  passCommand,
  onPassCommandConsumed,
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
}) {
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
  const kickRequestedRef = useRef(null);
  const possessionRef = useRef(null);
  const possessionLockUntilRef = useRef(0);
  const spaceHeldRef = useRef(false);
  const pendingAutoTapRef = useRef(null);
  const shotChargeStartAtRef = useRef(0);
  const shotChargeRatioRef = useRef(0);
  const shotChargingRef = useRef(false);
  const shotChargeCooldownUntilRef = useRef(0);
  const lastShotChargeStateRef = useRef(SHOT_CHARGE_IDLE);
  const kickDecayStartAtRef = useRef(0);
  const kickDecayEndAtRef = useRef(0);
  const kickStartSpeedRef = useRef(0);
  const outOfBoundsLockRef = useRef(false);
  const outOfBoundsTimerRef = useRef(null);
  const triggeredZoneIdRef = useRef(null);
  const lastPossessionRef = useRef(null);
  const lastSnapshotAtMsRef = useRef(0);
  const appliedExternalCommandIdRef = useRef(null);
  const appliedPassCommandIdRef = useRef(null);

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
      const unchanged = previousTeamId === nextTeamId && previousPlayerId === nextPlayerId;
      if (unchanged) {
        return;
      }

      lastPossessionRef.current = nextPossession
        ? {
            teamId: nextTeamId,
            playerId: nextPlayerId,
          }
        : null;
      onPossessionChange(lastPossessionRef.current);
    },
    [onPossessionChange]
  );

  const resetShotCharge = useCallback(() => {
    shotChargeStartAtRef.current = 0;
    shotChargeRatioRef.current = 0;
    shotChargingRef.current = false;
    shotChargeCooldownUntilRef.current = 0;
    spaceHeldRef.current = false;
    pendingAutoTapRef.current = null;
    kickRequestedRef.current = null;
    emitShotChargeState(SHOT_CHARGE_IDLE);
  }, [emitShotChargeState]);

  const startShotCharge = useCallback(
    (startedAtMs) => {
      shotChargingRef.current = true;
      shotChargeStartAtRef.current = startedAtMs;
      shotChargeRatioRef.current = 0;
      emitShotChargeState({
        isCharging: true,
        chargeRatio: 0,
        isPerfect: false,
        canShoot: true,
      });
    },
    [emitShotChargeState]
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

  const resetBall = useCallback(() => {
    directionRef.current = [0, 0, 0];
    kickRequestedRef.current = null;
    possessionRef.current = null;
    possessionLockUntilRef.current = 0;
    shotChargeStartAtRef.current = 0;
    shotChargeRatioRef.current = 0;
    shotChargingRef.current = false;
    shotChargeCooldownUntilRef.current = 0;
    spaceHeldRef.current = false;
    pendingAutoTapRef.current = null;
    kickDecayStartAtRef.current = 0;
    kickDecayEndAtRef.current = 0;
    kickStartSpeedRef.current = 0;
    outOfBoundsLockRef.current = false;
    triggeredZoneIdRef.current = null;
    lastPossessionRef.current = null;
    emitShotChargeState(SHOT_CHARGE_IDLE);
    emitPossessionChange(null);
    ballPositionRef.current = [...BALL_CONFIG.SPAWN_POSITION];
    api.position.set(...BALL_CONFIG.SPAWN_POSITION);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
  }, [api, emitPossessionChange, emitShotChargeState]);

  const kickoffBall = useCallback(() => {
    kickRequestedRef.current = null;
    possessionRef.current = null;
    possessionLockUntilRef.current = getNowMs() + PLAYER_POSSESSION_CONFIG.REACQUIRE_COOLDOWN_MS;
    shotChargeStartAtRef.current = 0;
    shotChargeRatioRef.current = 0;
    shotChargingRef.current = false;
    shotChargeCooldownUntilRef.current = 0;
    spaceHeldRef.current = false;
    pendingAutoTapRef.current = null;
    kickDecayStartAtRef.current = 0;
    kickDecayEndAtRef.current = 0;
    kickStartSpeedRef.current = 0;
    emitShotChargeState(SHOT_CHARGE_IDLE);
    emitPossessionChange(null);
    const directionSign = Math.random() > 0.5 ? 1 : -1;
    api.applyImpulse([0, 2.2 * shotPowerMultiplier, directionSign * 8], [0, 0, 0]);
  }, [api, emitPossessionChange, emitShotChargeState, shotPowerMultiplier]);

  useEffect(() => {
    if (resetRef) {
      resetRef.current = resetBall;
    }

    return () => {
      if (resetRef?.current === resetBall) {
        resetRef.current = null;
      }
    };
  }, [resetRef, resetBall]);

  useEffect(() => {
    if (kickoffRef) {
      kickoffRef.current = kickoffBall;
    }

    return () => {
      if (kickoffRef?.current === kickoffBall) {
        kickoffRef.current = null;
      }
    };
  }, [kickoffRef, kickoffBall]);

  useEffect(() => {
    if (!activePowerZone) {
      triggeredZoneIdRef.current = null;
    }
  }, [activePowerZone]);

  useEffect(() => {
    if (!controlsEnabled) {
      directionRef.current = [0, 0, 0];
    }
  }, [controlsEnabled]);

  useEffect(() => {
    if (playerControlsEnabled) {
      return;
    }

    kickRequestedRef.current = null;
    possessionRef.current = null;
    emitPossessionChange(null);
    resetShotCharge();
  }, [emitPossessionChange, playerControlsEnabled, resetShotCharge]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!playerControlsEnabled || !isShootKey(event.key)) {
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

      if (possessionRef.current?.teamId === "teamOne") {
        pendingAutoTapRef.current = null;
        startShotCharge(now);
        return;
      }

      pendingAutoTapRef.current = {
        expiresAt: now + PRE_POSSESSION_AUTO_TAP_WINDOW_MS,
      };
    };

    const handleKeyUp = (event) => {
      if (!playerControlsEnabled || !isShootKey(event.key)) {
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

      shotChargeRatioRef.current = uiChargeRatio;
      kickRequestedRef.current = {
        uiChargeRatio,
        effectiveChargeRatio,
        isPerfect,
      };
      emitShotChargeState({
        isCharging: false,
        chargeRatio: uiChargeRatio,
        isPerfect,
        canShoot: true,
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [emitShotChargeState, playerControlsEnabled, startShotCharge]);

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
          teamId: "teamOne",
          releasedAtMs: getNowMs(),
        });
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          directionRef.current = [0, 0, -directionalForce];
          break;
        case "ArrowDown":
          event.preventDefault();
          directionRef.current = [0, 0, directionalForce];
          break;
        case "ArrowLeft":
          event.preventDefault();
          directionRef.current = [-directionalForce, 0, 0];
          break;
        case "ArrowRight":
          event.preventDefault();
          directionRef.current = [directionalForce, 0, 0];
          break;
        default:
          break;
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
  }, [api, controlsEnabled, onShotEvent, shotPowerMultiplier, speedMultiplier]);

  useEffect(() => {
    if (!externalBallCommand || !externalBallCommand.id) {
      return;
    }

    if (appliedExternalCommandIdRef.current === externalBallCommand.id) {
      return;
    }

    appliedExternalCommandIdRef.current = externalBallCommand.id;

    if (externalBallCommand.type === "impulse" && Array.isArray(externalBallCommand.vector)) {
      const [x = 0, y = 0, z = 0] = externalBallCommand.vector;
      api.applyImpulse([x, y, z], [0, 0, 0]);
    }

    if (externalBallCommand.type === "velocity" && Array.isArray(externalBallCommand.vector)) {
      const [x = 0, y = 0, z = 0] = externalBallCommand.vector;
      api.velocity.set(x, y, z);
    }

    if (externalBallCommand.event) {
      onShotEvent?.(externalBallCommand.event);
    }
  }, [api, externalBallCommand, onShotEvent]);

  useEffect(() => {
    if (!passCommand || !passCommand.id) {
      return;
    }

    if (appliedPassCommandIdRef.current === passCommand.id) {
      return;
    }

    appliedPassCommandIdRef.current = passCommand.id;
    kickRequestedRef.current = null;
    possessionRef.current = null;
    emitPossessionChange(null);
    possessionLockUntilRef.current = getNowMs() + PLAYER_POSSESSION_CONFIG.REACQUIRE_COOLDOWN_MS;
    resetShotCharge();

    if (Array.isArray(passCommand.velocity)) {
      const [x = 0, y = 0, z = 0] = passCommand.velocity;
      api.velocity.set(x, y, z);
      api.angularVelocity.set(0, 0, 0);
    }

    onPassCommandConsumed?.(passCommand.id);
  }, [api, emitPossessionChange, onPassCommandConsumed, passCommand, resetShotCharge]);

  useEffect(() => {
    const unsubscribeVelocity = api.velocity.subscribe((velocity) => {
      velocityRef.current = velocity;
    });

    const unsubscribePosition = api.position.subscribe(([x, y, z]) => {
      ballPositionRef.current = [x, y, z];

      if (replayActive) {
        return;
      }

      if (!onOutOfBounds || outOfBoundsLockRef.current) {
        return;
      }

      if (
        Math.abs(x) > BALL_CONFIG.OUT_OF_BOUNDS.X ||
        Math.abs(z) > BALL_CONFIG.OUT_OF_BOUNDS.Z ||
        y < BALL_CONFIG.OUT_OF_BOUNDS.Y
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
      if (possessionRef.current) {
        possessionRef.current = null;
        emitPossessionChange(null);
      }
      return;
    }

    if (onBallSnapshot && now - lastSnapshotAtMsRef.current >= 32) {
      lastSnapshotAtMsRef.current = now;
      onBallSnapshot({
        timestampMs: now,
        position: [...ballPositionRef.current],
        velocity: [vx, vy, vz],
      });
    }

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const kickDecayActive = now < kickDecayEndAtRef.current;
    const boostedMaxSpeed = BALL_CONFIG.MAX_SPEED * (speedMultiplier > 1 ? 1.35 : 1);
    const maxSpeed = kickDecayActive
      ? Math.max(boostedMaxSpeed, kickStartSpeedRef.current)
      : boostedMaxSpeed;

    if (speed > maxSpeed) {
      const scaleVelocity = maxSpeed / speed;
      vx *= scaleVelocity;
      vy *= scaleVelocity;
      vz *= scaleVelocity;
      api.velocity.set(vx, vy, vz);
    }

    if (kickDecayActive) {
      const decayProgress = THREE.MathUtils.clamp(
        (now - kickDecayStartAtRef.current) / PLAYER_POSSESSION_CONFIG.KICK_DECAY_DURATION_MS,
        0,
        1
      );
      const planarSpeed = Math.hypot(vx, vz);
      const targetPlanarSpeed = THREE.MathUtils.lerp(
        kickStartSpeedRef.current,
        PLAYER_POSSESSION_CONFIG.KICK_END_SPEED,
        decayProgress
      );

      if (planarSpeed > targetPlanarSpeed + 0.001) {
        const planarScale = targetPlanarSpeed / planarSpeed;
        vx *= planarScale;
        vz *= planarScale;
        api.velocity.set(vx, vy, vz);
      }

      if (decayProgress >= 1) {
        kickDecayStartAtRef.current = 0;
        kickDecayEndAtRef.current = 0;
        kickStartSpeedRef.current = 0;
      }
    }

    if (
      controlsEnabled &&
      (directionRef.current[0] !== 0 || directionRef.current[2] !== 0)
    ) {
      api.applyForce(directionRef.current, [0, 0, 0]);

      if (controlAssistMultiplier > 1) {
        const directionalMagnitude = Math.hypot(
          directionRef.current[0],
          directionRef.current[2]
        );

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

    const teamOneRoster = Array.isArray(teamOnePlayers) ? teamOnePlayers : [];
    const currentTeamOnePossessorId =
      possessionRef.current?.teamId === "teamOne" ? possessionRef.current.playerId : null;
    const currentTeamOnePossessor =
      currentTeamOnePossessorId
        ? teamOneRoster.find((player) => player?.playerId === currentTeamOnePossessorId) || null
        : null;
    const currentRotation = currentTeamOnePossessor?.rotation || [0, Math.PI, 0];
    const currentYaw = Number.isFinite(currentRotation?.[1]) ? currentRotation[1] : 0;
    const facingX = Math.sin(currentYaw);
    const facingZ = Math.cos(currentYaw);

    if (shotChargingRef.current) {
      if (!playerControlsEnabled || !currentTeamOnePossessor) {
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

    const pendingKick = kickRequestedRef.current;
    if (pendingKick) {
      kickRequestedRef.current = null;

      if (currentTeamOnePossessor) {
        possessionRef.current = null;
        emitPossessionChange(null);
        possessionLockUntilRef.current = now + PLAYER_POSSESSION_CONFIG.REACQUIRE_COOLDOWN_MS;
        const kickPowerMultiplier = THREE.MathUtils.clamp(shotPowerMultiplier, 1, 1.6);
        const baseLaunchSpeed = THREE.MathUtils.lerp(
          SHOT_METER_CONFIG.MIN_LAUNCH_SPEED,
          SHOT_METER_CONFIG.MAX_LAUNCH_SPEED,
          pendingKick.effectiveChargeRatio
        );
        const launchSpeedWithPerfect = baseLaunchSpeed * (pendingKick.isPerfect ? 1.1 : 1);
        const launchSpeed = Math.min(
          launchSpeedWithPerfect * kickPowerMultiplier,
          SHOT_METER_CONFIG.MAX_LAUNCH_SPEED * kickPowerMultiplier
        );

        const baseUpwardSpeed = THREE.MathUtils.lerp(
          SHOT_METER_CONFIG.MIN_UPWARD_SPEED,
          SHOT_METER_CONFIG.MAX_UPWARD_SPEED,
          pendingKick.effectiveChargeRatio
        );
        const launchUpwardSpeed =
          baseUpwardSpeed * THREE.MathUtils.clamp(shotPowerMultiplier, 1, 1.35);

        kickDecayStartAtRef.current = now;
        kickDecayEndAtRef.current = now + PLAYER_POSSESSION_CONFIG.KICK_DECAY_DURATION_MS;
        kickStartSpeedRef.current = launchSpeed;
        shotChargeCooldownUntilRef.current = now + SHOT_METER_CONFIG.RECHARGE_COOLDOWN_MS;
        shotChargeStartAtRef.current = 0;
        shotChargeRatioRef.current = 0;
        emitShotChargeState(SHOT_CHARGE_IDLE);

        onKickRelease?.({
          chargeRatio: pendingKick.effectiveChargeRatio,
          isPerfect: pendingKick.isPerfect,
          launchSpeed,
          upwardSpeed: launchUpwardSpeed,
          releasedAtMs: now,
        });
        onShotEvent?.({
          type: "shot",
          teamId: "teamOne",
          chargeRatio: pendingKick.effectiveChargeRatio,
          isPerfect: pendingKick.isPerfect,
          releasedAtMs: now,
          launchSpeed,
          upwardSpeed: launchUpwardSpeed,
        });

        api.velocity.set(
          facingX * launchSpeed,
          launchUpwardSpeed,
          facingZ * launchSpeed
        );
      }
    }

    if (!playerControlsEnabled || now < possessionLockUntilRef.current) {
      if (possessionRef.current) {
        possessionRef.current = null;
        emitPossessionChange(null);
      }
      return;
    }

    if (teamOneRoster.length === 0) {
      if (possessionRef.current) {
        possessionRef.current = null;
        emitPossessionChange(null);
      }
      return;
    }

    const [ballX, ballY, ballZ] = ballPositionRef.current;
    const touchDistance = PLAYER_POSSESSION_CONFIG.TOUCH_RADIUS + scale * 0.35;
    const evaluatePossessionCandidate = (player) => {
      if (!player || !Array.isArray(player.position)) {
        return null;
      }
      const [candidateX, candidateY, candidateZ] = player.position;
      const distanceToCandidate = Math.hypot(ballX - candidateX, ballZ - candidateZ);
      const targetHeight =
        candidateY +
        Math.max(0.55, scale * PLAYER_POSSESSION_CONFIG.FOLLOW_HEIGHT_MULTIPLIER);
      const alignedByHeight =
        Math.abs(ballY - targetHeight) <= PLAYER_POSSESSION_CONFIG.HEIGHT_TOLERANCE;
      return {
        player,
        distanceToCandidate,
        targetHeight,
        inRange: distanceToCandidate <= touchDistance && alignedByHeight,
      };
    };

    let possessionCandidate = null;
    if (currentTeamOnePossessor) {
      const stickyCandidate = evaluatePossessionCandidate(currentTeamOnePossessor);
      if (stickyCandidate?.inRange) {
        possessionCandidate = stickyCandidate;
      }
    }

    if (!possessionCandidate) {
      for (const player of teamOneRoster) {
        const candidate = evaluatePossessionCandidate(player);
        if (!candidate?.inRange) {
          continue;
        }
        if (
          !possessionCandidate ||
          candidate.distanceToCandidate < possessionCandidate.distanceToCandidate
        ) {
          possessionCandidate = candidate;
        }
      }
    }

    if (!possessionCandidate) {
      if (possessionRef.current) {
        possessionRef.current = null;
        emitPossessionChange(null);
      }
      return;
    }

    const hadPossession = Boolean(possessionRef.current);
    const samePossessor =
      possessionRef.current?.teamId === "teamOne" &&
      possessionRef.current?.playerId === possessionCandidate.player.playerId;
    const nextPossession = {
      teamId: "teamOne",
      playerId: possessionCandidate.player.playerId,
    };
    possessionRef.current = nextPossession;
    emitPossessionChange(nextPossession);

    const pendingAutoTap = pendingAutoTapRef.current;
    if (
      !hadPossession &&
      !samePossessor &&
      pendingAutoTap &&
      spaceHeldRef.current &&
      now <= pendingAutoTap.expiresAt
    ) {
      kickRequestedRef.current = {
        uiChargeRatio: 0,
        effectiveChargeRatio: SHOT_METER_CONFIG.MIN_CHARGE_RATIO,
        isPerfect: false,
      };
      pendingAutoTapRef.current = null;
    } else if (pendingAutoTap && now > pendingAutoTap.expiresAt) {
      pendingAutoTapRef.current = null;
    }

    const playerPosition = possessionCandidate.player.position || [0, 0, 0];
    const playerRotation = possessionCandidate.player.rotation || [0, Math.PI, 0];
    const [playerX, , playerZ] = playerPosition;
    const targetBallHeight = possessionCandidate.targetHeight;
    const targetYaw = Number.isFinite(playerRotation?.[1]) ? playerRotation[1] : 0;
    const targetFacingX = Math.sin(targetYaw);
    const targetFacingZ = Math.cos(targetYaw);
    const targetX =
      playerX + targetFacingX * (PLAYER_POSSESSION_CONFIG.FOLLOW_OFFSET + scale * 0.35);
    const targetY = targetBallHeight;
    const targetZ =
      playerZ + targetFacingZ * (PLAYER_POSSESSION_CONFIG.FOLLOW_OFFSET + scale * 0.35);

    api.position.set(targetX, targetY, targetZ);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
    ballPositionRef.current = [targetX, targetY, targetZ];
  });

  return (
    <group ref={ref} name={BALL_BODY_NAME} scale={[scale, scale, scale]}>
      <primitive object={ballScene} castShadow receiveShadow />
    </group>
  );
}

useGLTF.preload("/ball/scene.gltf");

export default SoccerBallModel;
