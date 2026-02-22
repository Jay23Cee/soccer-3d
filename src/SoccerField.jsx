import React, { useEffect, useMemo, useRef } from "react";
import { useBox, usePlane } from "@react-three/cannon";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FIELD_CONFIG } from "./config/gameConfig";

const GRASS_TEXTURES = [
  "/Grass001_2K-JPG/Grass001_2K-JPG_Color.jpg",
  "/Grass001_2K-JPG/Grass001_2K-JPG_Roughness.jpg",
  "/Grass001_2K-JPG/Grass001_2K-JPG_NormalGL.jpg",
  "/Grass001_2K-JPG/Grass001_2K-JPG_Displacement.jpg",
];

const TRACK_CONFIG = {
  WIDTH: 12, // wider track while keeping about five lanes
  COLOR: "#2c2445",
  LANE_COUNT: 5,
  LANE_COLOR: "#5ea3d8",
};

const FIELD_BORDER_CONFIG = {
  COLOR: "#c8f6ff",
  OPACITY: 0.9,
};

function BoundaryWall({ position, args }) {
  useBox(() => ({
    type: "Static",
    position,
    args,
  }));

  return null;
}

function SoccerField({ activePowerZone }) {
  const [grassColor, grassRoughness, grassNormal, grassDisplacement] =
    useTexture(GRASS_TEXTURES);
  const { WIDTH, LENGTH, MARKING_OFFSET_Y, BOUNDARY } = FIELD_CONFIG;
  const powerZoneRef = useRef(null);
  const powerZoneMaterialRef = useRef(null);
  const trackOuterHalfWidth = WIDTH / 2 + TRACK_CONFIG.WIDTH;
  const trackOuterHalfLength = LENGTH / 2 + TRACK_CONFIG.WIDTH;
  const boundaryXLimit = trackOuterHalfWidth + 2;
  const boundaryZLimit = trackOuterHalfLength + 2;
  const laneStep = TRACK_CONFIG.WIDTH / TRACK_CONFIG.LANE_COUNT;
  const laneOffsets = useMemo(
    () =>
      Array.from({ length: TRACK_CONFIG.LANE_COUNT - 1 }, (_, index) => (index + 1) * laneStep),
    [laneStep]
  );
  const trackShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-trackOuterHalfWidth, -trackOuterHalfLength);
    shape.lineTo(trackOuterHalfWidth, -trackOuterHalfLength);
    shape.lineTo(trackOuterHalfWidth, trackOuterHalfLength);
    shape.lineTo(-trackOuterHalfWidth, trackOuterHalfLength);
    shape.lineTo(-trackOuterHalfWidth, -trackOuterHalfLength);

    const fieldHole = new THREE.Path();
    fieldHole.moveTo(-WIDTH / 2, -LENGTH / 2);
    fieldHole.lineTo(-WIDTH / 2, LENGTH / 2);
    fieldHole.lineTo(WIDTH / 2, LENGTH / 2);
    fieldHole.lineTo(WIDTH / 2, -LENGTH / 2);
    fieldHole.lineTo(-WIDTH / 2, -LENGTH / 2);
    shape.holes.push(fieldHole);

    return shape;
  }, [LENGTH, WIDTH, trackOuterHalfLength, trackOuterHalfWidth]);
  const fieldBoundaryGeometry = useMemo(() => new THREE.PlaneGeometry(WIDTH, LENGTH), [WIDTH, LENGTH]);
  const laneBoundaryGeometries = useMemo(
    () =>
      laneOffsets.map(
        (offset) => new THREE.PlaneGeometry(WIDTH + offset * 2, LENGTH + offset * 2)
      ),
    [LENGTH, WIDTH, laneOffsets]
  );
  const goalOuterBoxGeometry = useMemo(() => new THREE.PlaneGeometry(44, 18), []);
  const goalInnerBoxGeometry = useMemo(() => new THREE.PlaneGeometry(36, 6), []);

  useEffect(
    () => () => {
      fieldBoundaryGeometry.dispose();
      laneBoundaryGeometries.forEach((geometry) => geometry.dispose());
      goalOuterBoxGeometry.dispose();
      goalInnerBoxGeometry.dispose();
    },
    [fieldBoundaryGeometry, goalOuterBoxGeometry, goalInnerBoxGeometry, laneBoundaryGeometries]
  );

  grassColor.colorSpace = THREE.SRGBColorSpace;

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

  useFrame(({ clock }) => {
    if (!activePowerZone || !powerZoneRef.current || !powerZoneMaterialRef.current) {
      return;
    }

    const pulse = 1 + Math.sin(clock.elapsedTime * 5.5) * 0.1;
    powerZoneRef.current.scale.set(pulse, pulse, pulse);
    powerZoneMaterialRef.current.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 8) * 0.55;
  });

  return (
    <>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[trackShape]} />
        <meshStandardMaterial
          color={TRACK_CONFIG.COLOR}
          emissive="#0f1230"
          emissiveIntensity={0.36}
          roughness={0.86}
          metalness={0.12}
        />
      </mesh>

      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[WIDTH, LENGTH, 64, 64]} />
        <meshStandardMaterial
          map={grassColor}
          roughnessMap={grassRoughness}
          normalMap={grassNormal}
          displacementMap={grassDisplacement}
          displacementScale={0.08}
          roughness={0.8}
          emissive="#06222c"
          emissiveIntensity={0.22}
        />
      </mesh>

      <mesh position={[0, MARKING_OFFSET_Y - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[11.2, 12.4, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.13} side={THREE.DoubleSide} />
      </mesh>

      <group>
        <lineSegments position={[0, MARKING_OFFSET_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <edgesGeometry args={[fieldBoundaryGeometry]} />
          <lineBasicMaterial
            color={FIELD_BORDER_CONFIG.COLOR}
            transparent
            opacity={FIELD_BORDER_CONFIG.OPACITY}
          />
        </lineSegments>

        {laneOffsets.map((offset, index) => (
          <lineSegments
            key={`track-lane-${index}`}
            position={[0, MARKING_OFFSET_Y - 0.015, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <edgesGeometry args={[laneBoundaryGeometries[index]]} />
            <lineBasicMaterial color={TRACK_CONFIG.LANE_COLOR} transparent opacity={0.46} />
          </lineSegments>
        ))}

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
              <edgesGeometry args={[goalOuterBoxGeometry]} />
              <lineBasicMaterial color="#ffffff" />
            </lineSegments>

            <lineSegments position={[0, MARKING_OFFSET_Y, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <edgesGeometry args={[goalInnerBoxGeometry]} />
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

      {activePowerZone && (
        <group
          ref={powerZoneRef}
          position={[
            activePowerZone.position[0],
            MARKING_OFFSET_Y + 0.05,
            activePowerZone.position[1],
          ]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[activePowerZone.radius * 0.58, activePowerZone.radius, 60]} />
            <meshStandardMaterial
              ref={powerZoneMaterialRef}
              color={activePowerZone.color}
              emissive={activePowerZone.color}
              emissiveIntensity={1}
              transparent
              opacity={0.72}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <circleGeometry args={[activePowerZone.radius * 0.25, 40]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      <BoundaryWall
        position={[0, BOUNDARY.HEIGHT / 2, boundaryZLimit]}
        args={[trackOuterHalfWidth + 4, BOUNDARY.HEIGHT / 2, BOUNDARY.THICKNESS / 2]}
      />
      <BoundaryWall
        position={[0, BOUNDARY.HEIGHT / 2, -boundaryZLimit]}
        args={[trackOuterHalfWidth + 4, BOUNDARY.HEIGHT / 2, BOUNDARY.THICKNESS / 2]}
      />
      <BoundaryWall
        position={[boundaryXLimit, BOUNDARY.HEIGHT / 2, 0]}
        args={[BOUNDARY.THICKNESS / 2, BOUNDARY.HEIGHT / 2, trackOuterHalfLength + 4]}
      />
      <BoundaryWall
        position={[-boundaryXLimit, BOUNDARY.HEIGHT / 2, 0]}
        args={[BOUNDARY.THICKNESS / 2, BOUNDARY.HEIGHT / 2, trackOuterHalfLength + 4]}
      />
    </>
  );
}

useTexture.preload(GRASS_TEXTURES);

export default SoccerField;
