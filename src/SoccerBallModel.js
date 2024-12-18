import React, { useEffect, useRef } from "react";
import { useSphere } from "@react-three/cannon";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

function SoccerBallModel({ scale, resetRef }) {
  const { scene } = useGLTF("/ball/scene.gltf");
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: [0, 15, -12],
    args: [scale],
    restitution: 0.7,
    friction: 0.5,
    linearDamping: 0.3,
    angularDamping: 0.3,
  }));

  const direction = useRef([0, 0, 0]);
  const MAX_SPEED = 15;
  const FORCE = 15;

  const resetBall = () => {
    api.position.set(0, 15, -12);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
  };

  useEffect(() => {
    if (resetRef) resetRef.current = resetBall;
  }, [resetRef]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case "ArrowUp":
          direction.current = [0, 0, -FORCE];
          break;
        case "ArrowDown":
          direction.current = [0, 0, FORCE];
          break;
        case "ArrowLeft":
          direction.current = [-FORCE, 0, 0];
          break;
        case "ArrowRight":
          direction.current = [FORCE, 0, 0];
          break;
        case " ":
          api.applyImpulse([0, 10, 0], [0, 0, 0]);
          break;
        default:
          break;
      }
    };

    const handleKeyUp = () => (direction.current = [0, 0, 0]);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [api]);

  useFrame(() => {
    api.velocity.subscribe(([vx, vy, vz]) => {
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        api.velocity.set(vx * scale, vy * scale, vz * scale);
      }
    });
    if (direction.current[0] !== 0 || direction.current[2] !== 0) {
      api.applyForce(direction.current, [0, 0, 0]);
    }
  });

  return (
    <group ref={ref} scale={[scale, scale, scale]}>
      <primitive object={scene} />
    </group>
  );
}

export default SoccerBallModel;
