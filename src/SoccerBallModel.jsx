import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useSphere } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BALL_BODY_NAME, BALL_CONFIG } from "./config/gameConfig";

function SoccerBallModel({ scale, resetRef, controlsEnabled, onOutOfBounds }) {
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
  const directionRef = useRef([0, 0, 0]);
  const outOfBoundsLockRef = useRef(false);
  const outOfBoundsTimerRef = useRef(null);

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
    api.position.set(...BALL_CONFIG.SPAWN_POSITION);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
  }, [api]);

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
    const handleKeyDown = (event) => {
      if (!controlsEnabled) {
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          directionRef.current = [0, 0, -BALL_CONFIG.FORCE];
          break;
        case "ArrowDown":
          event.preventDefault();
          directionRef.current = [0, 0, BALL_CONFIG.FORCE];
          break;
        case "ArrowLeft":
          event.preventDefault();
          directionRef.current = [-BALL_CONFIG.FORCE, 0, 0];
          break;
        case "ArrowRight":
          event.preventDefault();
          directionRef.current = [BALL_CONFIG.FORCE, 0, 0];
          break;
        case " ":
          event.preventDefault();
          api.applyImpulse([0, BALL_CONFIG.JUMP_IMPULSE, 0], [0, 0, 0]);
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
  }, [api, controlsEnabled]);

  useEffect(() => {
    const unsubscribeVelocity = api.velocity.subscribe((velocity) => {
      velocityRef.current = velocity;
    });

    const unsubscribePosition = api.position.subscribe(([x, y, z]) => {
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
    });

    return () => {
      unsubscribeVelocity();
      unsubscribePosition();
      if (outOfBoundsTimerRef.current) {
        clearTimeout(outOfBoundsTimerRef.current);
      }
    };
  }, [api, onOutOfBounds]);

  useFrame(() => {
    const [vx, vy, vz] = velocityRef.current;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed > BALL_CONFIG.MAX_SPEED) {
      const scaleVelocity = BALL_CONFIG.MAX_SPEED / speed;
      api.velocity.set(vx * scaleVelocity, vy * scaleVelocity, vz * scaleVelocity);
    }

    if (
      controlsEnabled &&
      (directionRef.current[0] !== 0 || directionRef.current[2] !== 0)
    ) {
      api.applyForce(directionRef.current, [0, 0, 0]);
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
