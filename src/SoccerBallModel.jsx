import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useSphere } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BALL_BODY_NAME, BALL_CONFIG } from "./config/gameConfig";

const PLAYER_POSSESSION_CONFIG = {
  TOUCH_RADIUS: 1.75,
  HEIGHT_TOLERANCE: 2.2,
  FOLLOW_OFFSET: 1.2,
  FOLLOW_HEIGHT_MULTIPLIER: 1.02,
  KICK_FORWARD_IMPULSE: 6.8,
  KICK_UPWARD_IMPULSE: 0.9,
  REACQUIRE_COOLDOWN_MS: 300,
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
  playerControlsEnabled = false,
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
  const kickRequestedRef = useRef(false);
  const possessionRef = useRef(false);
  const possessionLockUntilRef = useRef(0);
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
    kickRequestedRef.current = false;
    possessionRef.current = false;
    possessionLockUntilRef.current = 0;
    outOfBoundsLockRef.current = false;
    triggeredZoneIdRef.current = null;
    ballPositionRef.current = [...BALL_CONFIG.SPAWN_POSITION];
    api.position.set(...BALL_CONFIG.SPAWN_POSITION);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
  }, [api]);

  const kickoffBall = useCallback(() => {
    kickRequestedRef.current = false;
    possessionRef.current = false;
    possessionLockUntilRef.current = getNowMs() + PLAYER_POSSESSION_CONFIG.REACQUIRE_COOLDOWN_MS;
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
    if (playerControlsEnabled) {
      return;
    }

    kickRequestedRef.current = false;
    possessionRef.current = false;
  }, [playerControlsEnabled]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!playerControlsEnabled || event.key !== " ") {
        return;
      }

      event.preventDefault();
      kickRequestedRef.current = true;
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [playerControlsEnabled]);

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

  useFrame(() => {
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

    const now = getNowMs();
    const yaw = Number.isFinite(playerRotation?.[1]) ? playerRotation[1] : 0;
    const facingX = Math.sin(yaw);
    const facingZ = Math.cos(yaw);

    if (kickRequestedRef.current) {
      kickRequestedRef.current = false;

      if (possessionRef.current) {
        possessionRef.current = false;
        possessionLockUntilRef.current = now + PLAYER_POSSESSION_CONFIG.REACQUIRE_COOLDOWN_MS;

        api.applyImpulse(
          [
            facingX * PLAYER_POSSESSION_CONFIG.KICK_FORWARD_IMPULSE * shotPowerMultiplier,
            PLAYER_POSSESSION_CONFIG.KICK_UPWARD_IMPULSE * shotPowerMultiplier,
            facingZ * PLAYER_POSSESSION_CONFIG.KICK_FORWARD_IMPULSE * shotPowerMultiplier,
          ],
          [0, 0, 0]
        );
      }
    }

    if (!playerControlsEnabled || now < possessionLockUntilRef.current) {
      return;
    }

    const [ballX, ballY, ballZ] = ballPositionRef.current;
    const [playerX, playerY, playerZ] = playerPosition;
    const distanceToPlayer = Math.hypot(ballX - playerX, ballZ - playerZ);
    const touchDistance = PLAYER_POSSESSION_CONFIG.TOUCH_RADIUS + scale * 0.35;
    const targetBallHeight = playerY + Math.max(0.55, scale * PLAYER_POSSESSION_CONFIG.FOLLOW_HEIGHT_MULTIPLIER);
    const alignedByHeight = Math.abs(ballY - targetBallHeight) <= PLAYER_POSSESSION_CONFIG.HEIGHT_TOLERANCE;

    if (!possessionRef.current && (distanceToPlayer > touchDistance || !alignedByHeight)) {
      return;
    }

    possessionRef.current = true;

    const targetX = playerX + facingX * (PLAYER_POSSESSION_CONFIG.FOLLOW_OFFSET + scale * 0.35);
    const targetY = targetBallHeight;
    const targetZ = playerZ + facingZ * (PLAYER_POSSESSION_CONFIG.FOLLOW_OFFSET + scale * 0.35);

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
