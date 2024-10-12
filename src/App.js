import React, { useState, useRef, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, useGLTF, PerspectiveCamera } from "@react-three/drei";
import { Physics, useBox, useSphere, useCompoundBody, Debug } from "@react-three/cannon";
import * as THREE from "three";

// Preload assets
useGLTF.preload("/goalnet.gltf");
useGLTF.preload("/ball/scene.gltf");

function SoccerBallModel({ scale }) {
  const { scene } = useGLTF("/ball/scene.gltf");
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: [0, 0.5, -12],
    args: [scale],
    restitution: 0.7,
    friction: 0.5,
    linearDamping: 0.3,
    angularDamping: 0.3,
  }));
  const direction = useRef([0, 0, 0]);
  const MAX_SPEED = 15;
  const FORCE = 15;

  useEffect(() => {
    const handleKeyDown = (event) => {
      switch (event.key) {
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

function SoccerField() {
  const grassTexture = useLoader(
    THREE.TextureLoader,
    "Grass001_2K-JPG/Grass001_2K-JPG_Color.jpg"
  );
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(20, 20);

  const fieldSize = 40;
  const [ref] = useBox(() => ({
    type: "Static",
    position: [0, -0.05, 0],
    args: [fieldSize, 0.1, fieldSize],
  }));

  return (
    <mesh ref={ref} receiveShadow>
      <boxGeometry args={[fieldSize, 0.1, fieldSize]} />
      <meshStandardMaterial map={grassTexture} />
    </mesh>
  );
}

function GoalNet({ position, scale, rotation }) {
  const { scene } = useGLTF("/goalnet.gltf");
  const [ref] = useCompoundBody(() => ({
    mass: 0,
    position: position,
    rotation: rotation,
    shapes: [
      { type: "Box", position: [0, 1.5 * scale, -0.5 * scale], args: [4 * scale, 3 * scale, 0.1 * scale] }, // Back net
      { type: "Box", position: [-2 * scale, 1.5 * scale, 0], args: [0.1 * scale, 3 * scale, 1.5 * scale] }, // Left post
      { type: "Box", position: [2 * scale, 1.5 * scale, 0], args: [0.1 * scale, 3 * scale, 1.5 * scale] }, // Right post
      { type: "Box", position: [0, 0.15 * scale, 1.5 * scale], args: [4 * scale, 0.1 * scale, 3 * scale] }, // Bottom net
    ],
  }));

  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: "red",
            emissive: "red",
            emissiveIntensity: 1,
          });
        }
      });
    }
  }, [scene]);

  return (
    <group ref={ref} position={position} rotation={rotation}>
      <primitive object={scene} scale={scale} />
    </group>
  );
}

function BoundaryWall({ position, size }) {
  const [ref] = useBox(() => ({
    type: "Static",
    position: position,
    args: size,
    restitution: 0.8,
    friction: 0.6,
  }));

  return (
    <mesh ref={ref}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
    </mesh>
  );
}

function App() {
  const [ballScale, setBallScale] = useState(1);
  const [controlsEnabled, setControlsEnabled] = useState(false);

  const handleActivateControls = () => setControlsEnabled(true);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1,
          background: "#fff",
          padding: "10px",
          borderRadius: "8px",
        }}
      >
        <label>
          Ball Size: {ballScale.toFixed(2)}
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={ballScale}
            onChange={(e) => setBallScale(parseFloat(e.target.value))}
          />
        </label>
        <br />
        <button onClick={handleActivateControls}>Activate Ball Controls</button>
      </div>

      <Canvas style={{ height: "100vh", width: "100vw" }} frameloop="demand">
        <PerspectiveCamera makeDefault position={[0, 20, 50]} fov={50} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[15, 25, 15]} intensity={1.8} castShadow />
        <pointLight position={[-10, 10, 10]} intensity={0.5} />

        <OrbitControls
          enablePan={true}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 3}
          maxDistance={50}
          minDistance={15}
        />

        <Physics gravity={[0, -9.81, 0]} iterations={15} tolerance={0.0001}>
          <Debug color="hotpink">
            {controlsEnabled && <SoccerBallModel scale={ballScale} />}
            <SoccerField />
            <GoalNet key="goalnet-1" position={[0, 0.5, -18]} scale={2.0} rotation={[0, 0, 0]} />
            <GoalNet key="goalnet-2" position={[0, 0.5, 18]} scale={2.0} rotation={[0, Math.PI, 0]} />
          </Debug>
        </Physics>
      </Canvas>
    </>
  );
}

export default App;