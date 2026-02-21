import React from "react";
import { useBox, usePlane } from "@react-three/cannon";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { FIELD_CONFIG } from "./config/gameConfig";

const GRASS_TEXTURES = [
  "/Grass001_2K-JPG/Grass001_2K-JPG_Color.jpg",
  "/Grass001_2K-JPG/Grass001_2K-JPG_Roughness.jpg",
  "/Grass001_2K-JPG/Grass001_2K-JPG_NormalGL.jpg",
  "/Grass001_2K-JPG/Grass001_2K-JPG_Displacement.jpg",
];

function BoundaryWall({ position, args }) {
  useBox(() => ({
    type: "Static",
    position,
    args,
  }));

  return null;
}

function SoccerField() {
  const [grassColor, grassRoughness, grassNormal, grassDisplacement] =
    useTexture(GRASS_TEXTURES);
  const { WIDTH, LENGTH, MARKING_OFFSET_Y, BOUNDARY } = FIELD_CONFIG;

  [grassColor, grassRoughness, grassNormal, grassDisplacement].forEach((map) => {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(50, 25);
  });

  usePlane(() => ({
    type: "Static",
    position: [0, 0, 0],
    rotation: [-Math.PI / 2, 0, 0],
  }));

  return (
    <>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[WIDTH, LENGTH, 64, 64]} />
        <meshStandardMaterial
          map={grassColor}
          roughnessMap={grassRoughness}
          normalMap={grassNormal}
          displacementMap={grassDisplacement}
          displacementScale={0.08}
          roughness={0.8}
        />
      </mesh>

      <group>
        <mesh position={[0, MARKING_OFFSET_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.5, 10, 64]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>

        <mesh position={[0, MARKING_OFFSET_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.5, 32]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>

        <mesh position={[0, MARKING_OFFSET_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[WIDTH, 0.5]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>

        {[{ z: -75 }, { z: 75 }].map(({ z }, idx) => (
          <group key={`goal-marking-${idx}`}>
            <lineSegments position={[0, MARKING_OFFSET_Y, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <edgesGeometry args={[new THREE.PlaneGeometry(44, 18)]} />
              <lineBasicMaterial color="#ffffff" />
            </lineSegments>

            <lineSegments position={[0, MARKING_OFFSET_Y, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <edgesGeometry args={[new THREE.PlaneGeometry(36, 6)]} />
              <lineBasicMaterial color="#ffffff" />
            </lineSegments>

            <mesh position={[0, 0.4, z < 0 ? -68 : 68]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.5, 32]} />
              <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}

        {[-1, 1].map((x) =>
          [-1, 1].map((z) => (
            <mesh
              key={`corner-${x}-${z}`}
              position={[
                x * (WIDTH / 2 - 0.5),
                MARKING_OFFSET_Y,
                z * (LENGTH / 2 - 0.5),
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[1.5, 32, 0, Math.PI / 2]} />
              <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
            </mesh>
          ))
        )}
      </group>

      <BoundaryWall
        position={[0, BOUNDARY.HEIGHT / 2, BOUNDARY.Z_LIMIT]}
        args={[WIDTH / 2 + 4, BOUNDARY.HEIGHT / 2, BOUNDARY.THICKNESS / 2]}
      />
      <BoundaryWall
        position={[0, BOUNDARY.HEIGHT / 2, -BOUNDARY.Z_LIMIT]}
        args={[WIDTH / 2 + 4, BOUNDARY.HEIGHT / 2, BOUNDARY.THICKNESS / 2]}
      />
      <BoundaryWall
        position={[BOUNDARY.X_LIMIT, BOUNDARY.HEIGHT / 2, 0]}
        args={[BOUNDARY.THICKNESS / 2, BOUNDARY.HEIGHT / 2, LENGTH / 2 + 4]}
      />
      <BoundaryWall
        position={[-BOUNDARY.X_LIMIT, BOUNDARY.HEIGHT / 2, 0]}
        args={[BOUNDARY.THICKNESS / 2, BOUNDARY.HEIGHT / 2, LENGTH / 2 + 4]}
      />
    </>
  );
}

useTexture.preload(GRASS_TEXTURES);

export default SoccerField;
