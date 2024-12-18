import React, { useEffect } from "react";
import { useCompoundBody, useBox } from "@react-three/cannon";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

function GoalNet({ position, scale, rotation, onGoal }) {
  const { scene } = useGLTF("/goalnet.gltf");

  const [ref] = useCompoundBody(() => ({
    mass: 0,
    position,
    rotation,
    shapes: [
      { type: "Box", position: [0, 0.9 * scale, -0.9 * scale], args: [4 * scale, 2 * scale, 0.1 * scale] },
      { type: "Box", position: [-2.5 * scale, 1.0 * scale, 0], args: [0.1 * scale, 2 * scale, 1.5 * scale] },
      { type: "Box", position: [2.5 * scale, 1.0 * scale, 0], args: [0.1 * scale, 2 * scale, 1.5 * scale] },
    ],
  }));

  const [bottomRef] = useBox(() => ({
    type: "Static",
    position: [position[0], position[1] + 0.055 * scale, position[2] - 0.105 * scale],
    rotation,
    args: [4.5 * scale, 0.1 * scale, 1.6 * scale],
    isTrigger: true,
    onCollide: (e) => {
      if (e.body.name === "soccerBall") onGoal();
    },
  }));

  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: "red" });
      });
    }
  }, [scene]);

  return (
    <group position={position} rotation={rotation}>
      <primitive object={scene.clone()} scale={scale} />
      <group ref={ref} />
      <mesh ref={bottomRef} visible={false} />
    </group>
  );
}

export default GoalNet;
