import React from "react";
import * as THREE from "three";
import { buildPlayerPose, PLAYER_ANIMATION_STATES } from "./playerAnimation";

const KIT_VARIANTS = {
  primary: {
    jersey: "#1f6feb",
    jerseyTrim: "#dbeafe",
  },
  secondary: {
    jersey: "#facc15",
    jerseyTrim: "#fef08a",
  },
};

const BASE_COLORS = {
  shorts: "#114066",
  socks: "#f8fafc",
  boots: "#14213d",
  skin: "#f2c5a6",
  face: "#fbe0c6",
  hair: "#8b4c25",
  eyes: "#163c7a",
  outline: "#0a1020",
};

const SHADOW_PROPS = {
  castShadow: true,
  receiveShadow: true,
};

const TOON_GRADIENT_MAP = new THREE.DataTexture(new Uint8Array([24, 160, 255]), 3, 1, THREE.RedFormat);
TOON_GRADIENT_MAP.colorSpace = THREE.NoColorSpace;
TOON_GRADIENT_MAP.generateMipmaps = false;
TOON_GRADIENT_MAP.magFilter = THREE.NearestFilter;
TOON_GRADIENT_MAP.minFilter = THREE.NearestFilter;
TOON_GRADIENT_MAP.needsUpdate = true;

function buildMaterials(kitVariant) {
  const kit = KIT_VARIANTS[kitVariant] || KIT_VARIANTS.primary;

  return {
    jersey: { color: kit.jersey },
    jerseyTrim: { color: kit.jerseyTrim },
    shorts: { color: BASE_COLORS.shorts },
    socks: { color: BASE_COLORS.socks },
    boots: { color: BASE_COLORS.boots },
    skin: { color: BASE_COLORS.skin },
    face: { color: BASE_COLORS.face },
    hair: { color: BASE_COLORS.hair },
  };
}

function normalizeScale(scale) {
  if (Array.isArray(scale)) {
    return scale;
  }

  return [scale, scale, scale];
}

function ToonPart({
  name,
  geometry,
  geometryArgs,
  material,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  outline = false,
  outlineScale = 1.08,
  castShadow = true,
  receiveShadow = true,
}) {
  const Geometry = geometry;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {outline && (
        <mesh scale={normalizeScale(outlineScale)}>
          <Geometry args={geometryArgs} />
          <meshBasicMaterial color={BASE_COLORS.outline} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      )}
      <mesh name={name} castShadow={castShadow} receiveShadow={receiveShadow}>
        <Geometry args={geometryArgs} />
        <meshToonMaterial color={material.color} gradientMap={TOON_GRADIENT_MAP} />
      </mesh>
    </group>
  );
}

function FeaturePart({
  name,
  geometry = "boxGeometry",
  geometryArgs,
  color,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  toneMapped = true,
}) {
  const Geometry = geometry;

  return (
    <mesh name={name} position={position} rotation={rotation} scale={scale}>
      <Geometry args={geometryArgs} />
      <meshBasicMaterial color={color} toneMapped={toneMapped} />
    </mesh>
  );
}

function SoccerPlayer({
  position = [0, 0, 22],
  rotation = [0, Math.PI, 0],
  playerId,
  isActive = false,
  kitVariant = "primary",
  animationState = PLAYER_ANIMATION_STATES.IDLE,
  animationBlend = 0,
  isGoalkeeper = false,
  celebrationLevel = 0,
}) {
  const materials = buildMaterials(kitVariant);
  const pose = buildPlayerPose(animationState, animationBlend, celebrationLevel);
  const rootPosition = [position[0], position[1] + pose.bodyLift, position[2]];
  const keeperColor = kitVariant === "secondary" ? "#fde047" : "#9fd9ff";
  const leftArmRoll = 0.28 - pose.leftArm * 0.16;
  const rightArmRoll = -0.28 + pose.rightArm * 0.16;

  return (
    <group name={playerId || "player-one"} position={rootPosition} rotation={rotation}>
      {isActive && (
        <mesh name="active-marker" position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[0.76, 1.02, 40]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      )}

      <group name="torso" position={[0, 1.52, 0.03]} rotation={[pose.torsoTilt, 0, 0]}>
        <ToonPart
          name="torso-core"
          geometry="boxGeometry"
          geometryArgs={[0.84, 0.94, 0.48]}
          material={materials.jersey}
          outline
          outlineScale={[1.08, 1.08, 1.14]}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="jersey-trim"
          geometry="boxGeometry"
          geometryArgs={[0.9, 0.18, 0.5]}
          position={[0, -0.09, 0.01]}
          material={materials.jerseyTrim}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="waist-band"
          geometry="boxGeometry"
          geometryArgs={[0.82, 0.12, 0.46]}
          position={[0, -0.48, 0]}
          material={materials.shorts}
          {...SHADOW_PROPS}
        />
      </group>

      <group name="head" position={[0, 2.38, 0.05]}>
        <ToonPart
          name="head-skin"
          geometry="boxGeometry"
          geometryArgs={[0.88, 0.9, 0.58]}
          material={materials.skin}
          outline
          outlineScale={[1.08, 1.08, 1.15]}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="head-hair"
          geometry="boxGeometry"
          geometryArgs={[0.92, 0.42, 0.6]}
          position={[0, 0.18, 0]}
          material={materials.hair}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="hair-front"
          geometry="boxGeometry"
          geometryArgs={[0.34, 0.16, 0.22]}
          position={[0.16, 0.35, 0.22]}
          rotation={[0, 0, -0.38]}
          material={materials.hair}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="neck"
          geometry="boxGeometry"
          geometryArgs={[0.18, 0.16, 0.16]}
          position={[0, -0.53, 0]}
          material={materials.skin}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="face-panel"
          geometry="boxGeometry"
          geometryArgs={[0.48, 0.52, 0.04]}
          position={[0.02, 0.02, 0.3]}
          material={materials.face}
          castShadow={false}
          receiveShadow={false}
        />
        <group name="face-features" position={[0.02, 0.08, 0.33]}>
          <FeaturePart name="left-eye" geometryArgs={[0.08, 0.19, 0.02]} position={[-0.1, 0.02, 0]} color={BASE_COLORS.eyes} />
          <FeaturePart name="right-eye" geometryArgs={[0.08, 0.19, 0.02]} position={[0.1, 0.02, 0]} color={BASE_COLORS.eyes} />
          <FeaturePart
            name="mouth"
            geometryArgs={[0.13, 0.03, 0.02]}
            position={[0.02, -0.14, 0]}
            color="#7c3d2a"
          />
        </group>
      </group>

      <group name="left-arm" position={[-0.62, 1.72, 0.03]} rotation={[pose.leftArm, 0, leftArmRoll]}>
        <ToonPart
          name="left-sleeve"
          geometry="boxGeometry"
          geometryArgs={[0.24, 0.26, 0.22]}
          position={[0, -0.02, 0]}
          material={materials.jersey}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="left-arm-segment"
          geometry="boxGeometry"
          geometryArgs={[0.18, 0.4, 0.19]}
          position={[0, -0.34, 0.01]}
          rotation={[0, 0, 0.1]}
          material={materials.skin}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="left-hand"
          geometry="boxGeometry"
          geometryArgs={[0.2, 0.18, 0.18]}
          position={[0, -0.62, 0.02]}
          material={materials.skin}
          outline
          outlineScale={[1.1, 1.1, 1.16]}
          {...SHADOW_PROPS}
        />
      </group>

      <group name="right-arm" position={[0.62, 1.72, 0.03]} rotation={[pose.rightArm, 0, rightArmRoll]}>
        <ToonPart
          name="right-sleeve"
          geometry="boxGeometry"
          geometryArgs={[0.24, 0.26, 0.22]}
          position={[0, -0.02, 0]}
          material={materials.jersey}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="right-arm-segment"
          geometry="boxGeometry"
          geometryArgs={[0.18, 0.4, 0.19]}
          position={[0, -0.34, 0.01]}
          rotation={[0, 0, -0.1]}
          material={materials.skin}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="right-hand"
          geometry="boxGeometry"
          geometryArgs={[0.2, 0.18, 0.18]}
          position={[0, -0.62, 0.02]}
          material={materials.skin}
          outline
          outlineScale={[1.1, 1.1, 1.16]}
          {...SHADOW_PROPS}
        />
      </group>

      <group name="left-leg" position={[-0.24, 0.82, 0.03]} rotation={[0.05 + pose.leftLeg, 0, 0.1]}>
        <ToonPart
          name="left-shorts-panel"
          geometry="boxGeometry"
          geometryArgs={[0.28, 0.32, 0.24]}
          position={[0, 0.25, 0]}
          material={materials.shorts}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="left-leg-segment"
          geometry="boxGeometry"
          geometryArgs={[0.22, 0.48, 0.2]}
          position={[0, -0.06, 0]}
          material={materials.skin}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="left-sock"
          geometry="boxGeometry"
          geometryArgs={[0.2, 0.38, 0.18]}
          position={[0, -0.46, 0.01]}
          material={materials.socks}
          {...SHADOW_PROPS}
        />
        <group name="left-boot-cluster" position={[0, -0.7, 0.08]}>
          <ToonPart
            name="left-boot"
            geometry="boxGeometry"
            geometryArgs={[0.32, 0.18, 0.26]}
            material={materials.boots}
            outline
            outlineScale={[1.12, 1.12, 1.18]}
            {...SHADOW_PROPS}
          />
          <ToonPart
            name="left-boot-toe"
            geometry="boxGeometry"
            geometryArgs={[0.24, 0.14, 0.22]}
            position={[0, -0.01, 0.16]}
            material={materials.boots}
            {...SHADOW_PROPS}
          />
        </group>
      </group>

      <group name="right-leg" position={[0.24, 0.82, 0.03]} rotation={[-0.05 + pose.rightLeg, 0, -0.1]}>
        <ToonPart
          name="right-shorts-panel"
          geometry="boxGeometry"
          geometryArgs={[0.28, 0.32, 0.24]}
          position={[0, 0.25, 0]}
          material={materials.shorts}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="right-leg-segment"
          geometry="boxGeometry"
          geometryArgs={[0.22, 0.48, 0.2]}
          position={[0, -0.06, 0]}
          material={materials.skin}
          {...SHADOW_PROPS}
        />
        <ToonPart
          name="right-sock"
          geometry="boxGeometry"
          geometryArgs={[0.2, 0.38, 0.18]}
          position={[0, -0.46, 0.01]}
          material={materials.socks}
          {...SHADOW_PROPS}
        />
        <group name="right-boot-cluster" position={[0, -0.7, 0.08]}>
          <ToonPart
            name="right-boot"
            geometry="boxGeometry"
            geometryArgs={[0.32, 0.18, 0.26]}
            material={materials.boots}
            outline
            outlineScale={[1.12, 1.12, 1.18]}
            {...SHADOW_PROPS}
          />
          <ToonPart
            name="right-boot-toe"
            geometry="boxGeometry"
            geometryArgs={[0.24, 0.14, 0.22]}
            position={[0, -0.01, 0.16]}
            material={materials.boots}
            {...SHADOW_PROPS}
          />
        </group>
      </group>

      {isGoalkeeper && (
        <group name="keeper-gloves">
          <group position={[-0.62, 1.72, 0.03]} rotation={[pose.leftArm, 0, leftArmRoll]}>
            <ToonPart
              name="left-glove"
              geometry="boxGeometry"
              geometryArgs={[0.24, 0.19, 0.2]}
              position={[0, -0.62, 0.08]}
              material={{ color: keeperColor }}
              outline
              outlineScale={[1.1, 1.1, 1.18]}
              {...SHADOW_PROPS}
            />
          </group>
          <group position={[0.62, 1.72, 0.03]} rotation={[pose.rightArm, 0, rightArmRoll]}>
            <ToonPart
              name="right-glove"
              geometry="boxGeometry"
              geometryArgs={[0.24, 0.19, 0.2]}
              position={[0, -0.62, 0.08]}
              material={{ color: keeperColor }}
              outline
              outlineScale={[1.1, 1.1, 1.18]}
              {...SHADOW_PROPS}
            />
          </group>
        </group>
      )}
    </group>
  );
}

export default SoccerPlayer;
