import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { useCompoundBody, useBox, useSphere, Physics, Debug } from "@react-three/cannon";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

// Preload assets
useGLTF.preload("/goalnet.gltf");
useGLTF.preload("/ball/scene.gltf");

// SoccerField Component
function SoccerField() {
  const grassTexture = useLoader(THREE.TextureLoader, "Grass001_2K-JPG/Grass001_2K-JPG_Color.jpg");
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

// GoalNet Component
function GoalNet({ position, scale, rotation, onGoal }) {
  const { scene } = useGLTF("/goalnet.gltf");
  const [ref] = useCompoundBody(() => ({
    mass: 0,
    position: position,
    rotation: rotation,
    shapes: [
      { type: "Box", position: [0, 1.5 * scale, -0.5 * scale], args: [4 * scale, 3 * scale, 0.1 * scale] },
      { type: "Box", position: [-2 * scale, 1.5 * scale, 0], args: [0.1 * scale, 3 * scale, 1.5 * scale] },
      { type: "Box", position: [2 * scale, 1.5 * scale, 0], args: [0.1 * scale, 3 * scale, 1.5 * scale] },
      { type: "Box", position: [0, -0.28 * scale, -0.005 * scale], args: [4 * scale, 0.1 * scale, 1.6 * scale] },
    ],
    onCollide: (e) => {
      if (e.body && e.body.name === "soccerBall") {
        onGoal();
      }
    },
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
      <primitive object={scene.clone()} scale={scale} />
    </group>
  );
}

// SoccerBallModel Component
function SoccerBallModel({ scale, resetRef }) {
  const { scene } = useGLTF("/ball/scene.gltf");
  const [ref, api] = useSphere(() => ({
    mass: 1,
    position: [0, 15, -12], // Set initial position higher up
    args: [scale],
    restitution: 0.7,
    friction: 0.5,
    linearDamping: 0.3,
    angularDamping: 0.3,
  }));

  // Naming the ball to identify it in collision detection
  useEffect(() => {
    if (ref.current) {
      ref.current.name = "soccerBall";
    }
  }, [ref]);

  const direction = useRef([0, 0, 0]);
  const MAX_SPEED = 15;
  const FORCE = 15;

  // Function to reset the ball position
  const resetBall = () => {
    api.position.set(0, 15, -12); // Reset position from above
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
  };

  // Expose the reset function to the parent component via resetRef
  useEffect(() => {
    if (resetRef) {
      resetRef.current = resetBall;
    }
  }, [resetRef]);

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

// App Component
function App() {
  const [ballScale, setBallScale] = useState(1);
  const [controlsEnabled, setControlsEnabled] = useState(false);
  const [teamOneScore, setTeamOneScore] = useState(0);
  const [teamTwoScore, setTeamTwoScore] = useState(0);
  const ballResetRef = useRef(null);

  const handleActivateControls = () => setControlsEnabled(true);

  const handleGoalTeamOne = () => {
    setTeamOneScore((prevScore) => prevScore + 1);
    if (ballResetRef.current) ballResetRef.current();
  };

  const handleGoalTeamTwo = () => {
    setTeamTwoScore((prevScore) => prevScore + 1);
    if (ballResetRef.current) ballResetRef.current();
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
        <button onClick={handleActivateControls}>Activate Ball Controls</button>
        <p>Team 1 Score: {teamOneScore}</p>
        <p>Team 2 Score: {teamTwoScore}</p>
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
            {controlsEnabled && <SoccerBallModel scale={ballScale} resetRef={ballResetRef} />}
            <SoccerField />
            <GoalNet key="goalnet-1" position={[0, 0.5, -18]} scale={2.0} rotation={[0, 0, 0]} onGoal={handleGoalTeamOne} />
            <GoalNet key="goalnet-2" position={[0, 0.5, 18]} scale={2.0} rotation={[0, Math.PI, 0]} onGoal={handleGoalTeamTwo} />
          </Debug>
        </Physics>
      </Canvas>
    </>
  );
}

export default App;
