import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { useCompoundBody, useBox, useSphere, Physics, Debug } from "@react-three/cannon";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import SoccerField from "./SoccerField";
import SoccerBallModel from "./SoccerBallModel";
import GoalNet from "./GoalNet";

// Preload assets
useGLTF.preload("/goalnet.gltf");
useGLTF.preload("/ball/scene.gltf");

// SoccerField Component

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
        <PerspectiveCamera makeDefault position={[0, 50, 200]} fov={60} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[30, 50, 30]} intensity={1.8} castShadow />
        <pointLight position={[-20, 20, 20]} intensity={0.5} />

        <OrbitControls
          enablePan={true}
          maxPolarAngle={Math.PI}
          minPolarAngle={0}
          maxDistance={400}
          minDistance={10}
        />

        <Physics gravity={[0, -9.81, 0]} iterations={15} tolerance={0.0001}>
          <Debug color="hotpink">
            {controlsEnabled && <SoccerBallModel scale={ballScale} resetRef={ballResetRef} />}
            <SoccerField />
            <GoalNet key="goalnet-1" position={[0, 0.5, -78]} scale={2.0} rotation={[0, 0, 0]} onGoal={handleGoalTeamOne} />
            <GoalNet key="goalnet-2" position={[0, 0.5, 78]} scale={2.0} rotation={[0, Math.PI, 0]} onGoal={handleGoalTeamTwo} />
          </Debug>
        </Physics>
      </Canvas>
    </>
  );
}

export default App;