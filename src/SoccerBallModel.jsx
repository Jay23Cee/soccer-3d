import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useSphere } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BALL_BODY_NAME, BALL_CONFIG } from "./config/gameConfig";

const PLAYER_CONTACT_CONFIG = {
  RADIUS: 1.45,
  HEIGHT_OFFSET: 1.1,
  HEIGHT_TOLERANCE: 1.8,
  MIN_MOVEMENT_SPEED: 1.25,
  IMPULSE_MIN: 0.45,
  IMPULSE_MAX: 1.6,
  IMPULSE_COOLDOWN_MS: 80,
  LIFT_IMPULSE: 0.04,
};

function getNowMs() {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

function SoccerBallModel({
  scale,
  resetRef,
  kickoffRef,
  controlsEnabled,
  playerPosition = [0, 0, 0],
  playerRotation = [0, Math.PI, 0],
  onOutOfBounds,
  activePowerZone,
  onPowerZoneEnter,
  speedMultiplier = 1,
  shotPowerMultiplier = 1,
  controlAssistMultiplier = 1,
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
  const lastPlayerPositionRef = useRef([...playerPosition]);
  const lastTouchImpulseAtRef = useRef(0);
  const outOfBoundsLockRef = useRef(false);
  const outOfBoundsTimerRef = useRef(null);
  const triggeredZoneIdRef = useRef(null);

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
    outOfBoundsLockRef.current = false;
    triggeredZoneIdRef.current = null;
    ballPositionRef.current = [...BALL_CONFIG.SPAWN_POSITION];
    lastTouchImpulseAtRef.current = 0;
    api.position.set(...BALL_CONFIG.SPAWN_POSITION);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
  }, [api]);

  const kickoffBall = useCallback(() => {
    const directionSign = Math.random() > 0.5 ? 1 : -1;
    api.applyImpulse([0, 2.2 * shotPowerMultiplier, directionSign * 8], [0, 0, 0]);
  }, [api, shotPowerMultiplier]);

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
    const handleKeyDown = (event) => {
      if (!controlsEnabled) {
        return;
      }

      const directionalForce = BALL_CONFIG.FORCE * speedMultiplier;

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
        case " ":
          event.preventDefault();
          api.applyImpulse([0, BALL_CONFIG.JUMP_IMPULSE * shotPowerMultiplier, 0], [0, 0, 0]);
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
  }, [api, controlsEnabled, shotPowerMultiplier, speedMultiplier]);

  useEffect(() => {
    const unsubscribeVelocity = api.velocity.subscribe((velocity) => {
      velocityRef.current = velocity;
    });

    const unsubscribePosition = api.position.subscribe(([x, y, z]) => {
      ballPositionRef.current = [x, y, z];

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
  }, [activePowerZone, api, onOutOfBounds, onPowerZoneEnter]);

  useFrame((_, delta) => {
    const [vx, vy, vz] = velocityRef.current;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const boostedMaxSpeed = BALL_CONFIG.MAX_SPEED * (speedMultiplier > 1 ? 1.35 : 1);

    if (speed > boostedMaxSpeed) {
      const scaleVelocity = boostedMaxSpeed / speed;
      api.velocity.set(vx * scaleVelocity, vy * scaleVelocity, vz * scaleVelocity);
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

    const [ballX, ballY, ballZ] = ballPositionRef.current;
    const [playerX, playerY, playerZ] = playerPosition;
    const [previousPlayerX, , previousPlayerZ] = lastPlayerPositionRef.current;
    const playerTravelDistance = Math.hypot(playerX - previousPlayerX, playerZ - previousPlayerZ);
    const playerPlanarSpeed = playerTravelDistance / Math.max(delta, 0.0001);
    lastPlayerPositionRef.current = [playerX, playerY, playerZ];

    if (playerPlanarSpeed < PLAYER_CONTACT_CONFIG.MIN_MOVEMENT_SPEED) {
      return;
    }

    const distanceToPlayer = Math.hypot(ballX - playerX, ballZ - playerZ);
    const touchDistance = PLAYER_CONTACT_CONFIG.RADIUS + scale;
    const playerBodyHeight = playerY + PLAYER_CONTACT_CONFIG.HEIGHT_OFFSET;
    const alignedByHeight =
      Math.abs(ballY - playerBodyHeight) <= PLAYER_CONTACT_CONFIG.HEIGHT_TOLERANCE;

    if (distanceToPlayer > touchDistance || !alignedByHeight) {
      return;
    }

    const now = getNowMs();
    if (now - lastTouchImpulseAtRef.current < PLAYER_CONTACT_CONFIG.IMPULSE_COOLDOWN_MS) {
      return;
    }

    const yaw = Number.isFinite(playerRotation?.[1]) ? playerRotation[1] : 0;
    const facingX = Math.sin(yaw);
    const facingZ = Math.cos(yaw);
    const playerSpeedFactor = Math.min(1, playerPlanarSpeed / 16);
    const impulseMagnitude = THREE.MathUtils.lerp(
      PLAYER_CONTACT_CONFIG.IMPULSE_MIN,
      PLAYER_CONTACT_CONFIG.IMPULSE_MAX,
      playerSpeedFactor
    );

    api.applyImpulse(
      [
        facingX * impulseMagnitude,
        PLAYER_CONTACT_CONFIG.LIFT_IMPULSE,
        facingZ * impulseMagnitude,
      ],
      [0, 0, 0]
    );
    lastTouchImpulseAtRef.current = now;
  });

  return (
    <group ref={ref} name={BALL_BODY_NAME} scale={[scale, scale, scale]}>
      <primitive object={ballScene} castShadow receiveShadow />
    </group>
  );
}

useGLTF.preload("/ball/scene.gltf");

export default SoccerBallModel;
