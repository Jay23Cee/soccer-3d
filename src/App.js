import React from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Physics, usePlane, useSphere } from "@react-three/cannon";
import * as THREE from "three";  // Import three.js for the texture loader

// Load the soccer ball from the GLTF file
function SoccerBallModel() {
  const { scene } = useGLTF("/ballscene.gltf");  // Load the ball GLTF model

  const [ref] = useSphere(() => ({
    mass: 1,
    position: [0, 1, 0],  // Lower starting position
    args: [0.25],  // Adjust this to the size of your ball
    restitution: 0.1,  // Less bounce
    friction: 0.3,  // Same friction
    linearDamping: 0.8,  // More damping to slow down linear movement
    angularDamping: 0.8,  // More damping to slow down rotation
  }));

  return (
    // Attach the GLTF scene directly to the physics ref
    <primitive object={scene} ref={ref} scale={0.015} /> 
  );
}

function GrassSurface() {
  const texture = useLoader(THREE.TextureLoader, "/grass-texture.jpg");  // Load the grass texture

  const [ref] = usePlane(() => ({
    type: "Static",
    position: [0, 0, 0],
    rotation: [-Math.PI / 2, 0, 0],
  }));

  return (
    <mesh ref={ref}>
      {/* Expand the grass area */}
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial map={texture} />  {/* Apply the grass texture to the surface */}
    </mesh>
  );
}

// Goal Net Object
function GoalNet() {
  const { scene } = useGLTF("/goalnet.gltf");  // Load the goal net GLTF

  return (
    <primitive object={scene} scale={0.5} position={[0, 0, -4]} />  // Move closer to the ground
  );
}

// Boundary Walls
function FieldBoundary() {
  const wallThickness = 0.1;
  const wallHeight = 0.5;

  return (
    <>
      <mesh position={[0, wallHeight / 2, -5]} visible={true}>
        <boxGeometry args={[10, wallHeight, wallThickness]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <mesh position={[0, wallHeight / 2, 5]} visible={true}>
        <boxGeometry args={[10, wallHeight, wallThickness]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <mesh position={[-5, wallHeight / 2, 0]} visible={true}>
        <boxGeometry args={[wallThickness, wallHeight, 10]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <mesh position={[5, wallHeight / 2, 0]} visible={true}>
        <boxGeometry args={[wallThickness, wallHeight, 10]} />
        <meshStandardMaterial color="red" />
      </mesh>
    </>
  );
}

// Main Canvas and Physics Setup
function App() {
  return (
    <Canvas style={{ height: "100vh" }} camera={{ position: [0, 10, 10], fov: 50 }}>
      <ambientLight intensity={5.8} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
      <spotLight position={[15, 20, 5]} angle={0.3} intensity={2} penumbra={1} castShadow />
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} minPolarAngle={Math.PI / 3} />
      <Physics>
        <SoccerBallModel />  {/* Soccer ball with physics loaded from GLTF file */}
        <GrassSurface />  {/* Ground with grass texture and physics */}
        <FieldBoundary />  {/* Visible red boundary walls */}
        <GoalNet />  {/* Goal net */}
      </Physics>
    </Canvas>
  );
}

export default App;
