import React, { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, PerspectiveCamera, CameraControls } from "@react-three/drei";
import { Physics, useBox, useSphere } from "@react-three/cannon";

// Preload the goal net model
useGLTF.preload("/goalnet.gltf");

// Load the soccer ball from the GLTF file
function SoccerBallModel({ scale, yPosition }) {
  const { scene } = useGLTF("/ball/scene.gltf");
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: [0, yPosition, -12],
    args: [scale],
    restitution: 1.3, // Adjusted restitution for better bouncing
    friction: 0.5,
    linearDamping: 0.3, // Increased damping to reduce rolling off
    angularDamping: 0.3,
  }));

  // Store the direction of the force to apply gradually
  const direction = useRef([0, 0, 0]);

  // Keyboard Controls for Movement
  useEffect(() => {
    const handleKeyDown = (event) => {
      switch (event.key) {
        case "ArrowUp":
          direction.current = [0, 0, -50]; // Set direction for forward movement
          break;
        case "ArrowDown":
          direction.current = [0, 0, 50]; // Set direction for backward movement
          break;
        case "ArrowLeft":
          direction.current = [-50, 0, 0]; // Set direction for left movement
          break;
        case "ArrowRight":
          direction.current = [50, 0, 0]; // Set direction for right movement
          break;
        case " ":
          api.applyImpulse([0, 10, 0], [0, 0, 0]); // Jump effect
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event) => {
      // Stop applying force when the key is released
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        direction.current = [0, 0, 0];
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [api]);

  // Apply force every frame based on the current direction
  useFrame(() => {
    if (direction.current[0] !== 0 || direction.current[2] !== 0) {
      api.applyForce(direction.current, [0, 0, 0]);
    }
  });

  return (
    <group ref={ref} position={[0, yPosition, 0]} scale={[scale, scale, scale]}>
      <primitive object={scene} />
    </group>
  );
}

// Load the soccer field (stadium) from the GLTF file
function SoccerField() {
  const { scene } = useGLTF("/isolated_stadium/scene.gltf");

  const fieldSize = 40;

  // Create a static box to act as the physical ground for the soccer field
  const [ref] = useBox(() => ({
    type: "Static",
    position: [0, -0.05, 0],
    args: [fieldSize, 0.1, fieldSize],
  }));

  return (
    <>
      {/* Physics Box Collider for the ground */}
      <mesh ref={ref} visible={false}>
        <boxGeometry args={[fieldSize, 0.1, fieldSize]} />
        <meshStandardMaterial color="green" />
      </mesh>

      {/* The visual soccer field model */}
      {scene && (
        <primitive
          object={scene}
          scale={[100, 10, 120]}
          position={[0, -0.05, 0]}
        />
      )}
    </>
  );
}

// Load the goal net model only once and reuse it
function GoalNet({ position, scale, rotation }) {
  const { scene } = useGLTF("/goalnet.gltf");

  return (
    <primitive object={scene.clone()} scale={scale} position={position} rotation={rotation} />
  );
}

// Boundary Walls with Physics
function BoundaryWall({ position, size }) {
  const [ref] = useBox(() => ({
    type: "Static",
    position: position,
    args: size,
    restitution: 1.1, // Increased restitution for a more consistent bounce
    friction: 0.6,
  }));

  return (
    <mesh ref={ref}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}

// Main Canvas and Physics Setup
function App() {
  const [ballScale, setBallScale] = useState(1);
  const [yPosition, setYPosition] = useState(5);
  const controlsRef = useRef();
  const [controlsEnabled, setControlsEnabled] = useState(false);

  const handleActivateControls = () => {
    setControlsEnabled(true);
  };

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
        <label>
          Y Position: {yPosition.toFixed(2)}
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={yPosition}
            onChange={(e) => setYPosition(parseFloat(e.target.value))}
          />
        </label>
        <br />
        <button onClick={handleActivateControls}>
          Activate Ball Controls
        </button>
      </div>

      <Canvas style={{ height: "100vh" }}>
        <PerspectiveCamera makeDefault position={[0, 20, 30]} fov={75} />
        <ambientLight intensity={2} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />

        {/* Enhanced Camera Controls */}
        <CameraControls ref={controlsRef} />

        {/* Keep OrbitControls for additional control */}
        <OrbitControls
          enablePan={true}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 3}
          maxDistance={50}
          minDistance={10}
        />

        <Physics gravity={[0, -9.81, 0]} iterations={20} tolerance={0.0001}>
          {controlsEnabled && <SoccerBallModel scale={ballScale} yPosition={yPosition} />}
          <SoccerField />

          {/* Boundary Walls */}
          <BoundaryWall position={[0, 2.5, -20]} size={[40, 5, 0.5]} /> {/* Back Wall */}
          <BoundaryWall position={[0, 2.5, 20]} size={[40, 5, 0.5]} />  {/* Front Wall */}
          <BoundaryWall position={[-20, 2.5, 0]} size={[0.5, 5, 40]} /> {/* Left Wall */}
          <BoundaryWall position={[20, 2.5, 0]} size={[0.5, 5, 40]} />  {/* Right Wall */}

          <GoalNet key="goalnet-1" position={[0, 0.5, -18]} scale={2.0} />
          <GoalNet key="goalnet-2" position={[0, 0.5, 18]} scale={2.0} rotation={[0, Math.PI, 0]} />
        </Physics>
      </Canvas>
    </>
  );
}

export default App;
