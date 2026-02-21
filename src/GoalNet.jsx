import React, { useEffect, useMemo, useRef } from "react";
import { useCompoundBody, useBox } from "@react-three/cannon";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BALL_BODY_NAME, GOAL_CONFIG } from "./config/gameConfig";

function GoalNet({ position, scale, rotation, onGoal, goalId, active }) {
  const { scene } = useGLTF("/goalnet.gltf");
  const triggerLockRef = useRef(0);
  const activeRef = useRef(active);
  const onGoalRef = useRef(onGoal);
  const goalIdRef = useRef(goalId);
  const goalScene = useMemo(() => scene.clone(), [scene]);
  const [positionX = 0, positionY = 0, positionZ = 0] = position;
  const [rotationX = 0, rotationY = 0, rotationZ = 0] = rotation;

  activeRef.current = active;
  onGoalRef.current = onGoal;
  goalIdRef.current = goalId;

  const triggerPosition = useMemo(() => {
    const localDepthOffset = -0.105 * scale;

    return [
      positionX + Math.sin(rotationY) * localDepthOffset,
      positionY + 0.055 * scale,
      positionZ + Math.cos(rotationY) * localDepthOffset,
    ];
  }, [positionX, positionY, positionZ, rotationY, scale]);

  useCompoundBody(() => ({
    mass: 0,
    position: [positionX, positionY, positionZ],
    rotation: [rotationX, rotationY, rotationZ],
    shapes: [
      {
        type: "Box",
        position: [0, 0.9 * scale, -0.9 * scale],
        args: [4 * scale, 2 * scale, 0.1 * scale],
      },
      {
        type: "Box",
        position: [-2.5 * scale, 1.0 * scale, 0],
        args: [0.1 * scale, 2 * scale, 1.5 * scale],
      },
      {
        type: "Box",
        position: [2.5 * scale, 1.0 * scale, 0],
        args: [0.1 * scale, 2 * scale, 1.5 * scale],
      },
    ],
  }), undefined, [positionX, positionY, positionZ, rotationX, rotationY, rotationZ, scale]);

  useBox(() => ({
    type: "Static",
    isTrigger: true,
    position: triggerPosition,
    rotation: [rotationX, rotationY, rotationZ],
    args: [4.5 * scale, 0.1 * scale, 1.6 * scale],
    onCollide: (event) => {
      if (!activeRef.current) {
        return;
      }

      const body = event.body;
      const isBallBody =
        body?.name === BALL_BODY_NAME || body?.userData?.bodyType === BALL_BODY_NAME;
      if (!isBallBody) {
        return;
      }

      const now = performance.now();
      if (now < triggerLockRef.current) {
        return;
      }

      triggerLockRef.current = now + GOAL_CONFIG.TRIGGER_DEBOUNCE_MS;
      onGoalRef.current?.(goalIdRef.current);
    },
  }), undefined, [
    triggerPosition[0],
    triggerPosition[1],
    triggerPosition[2],
    rotationX,
    rotationY,
    rotationZ,
    scale,
  ]);

  useEffect(() => {
    goalScene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: "#f8f8f8",
          metalness: 0.25,
          roughness: 0.55,
        });
      }
    });
  }, [goalScene]);

  return (
    <group position={position} rotation={rotation}>
      <primitive object={goalScene} scale={scale} castShadow receiveShadow />
      <group />
      <mesh visible={false} />
    </group>
  );
}

useGLTF.preload("/goalnet.gltf");

export default GoalNet;
