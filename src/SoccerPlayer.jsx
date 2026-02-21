import React from "react";

const KIT_VARIANTS = {
  primary: {
    jersey: "#1f6feb",
    jerseyTrim: "#dbeafe",
  },
  secondary: {
    jersey: "#f97316",
    jerseyTrim: "#fed7aa",
  },
};

const BASE_COLORS = {
  shorts: "#0f172a",
  socks: "#f8fafc",
  boots: "#111827",
  skin: "#f1c9a8",
  hair: "#2f241f",
};

const SHADOW_PROPS = {
  castShadow: true,
  receiveShadow: true,
};

function buildMaterials(kitVariant) {
  const kit = KIT_VARIANTS[kitVariant] || KIT_VARIANTS.primary;

  return {
    jersey: { color: kit.jersey, roughness: 0.42, metalness: 0.08 },
    jerseyTrim: { color: kit.jerseyTrim, roughness: 0.5, metalness: 0.04 },
    shorts: { color: BASE_COLORS.shorts, roughness: 0.55, metalness: 0.08 },
    socks: { color: BASE_COLORS.socks, roughness: 0.62, metalness: 0.03 },
    boots: { color: BASE_COLORS.boots, roughness: 0.38, metalness: 0.2 },
    skin: { color: BASE_COLORS.skin, roughness: 0.7, metalness: 0.03 },
    hair: { color: BASE_COLORS.hair, roughness: 0.72, metalness: 0.02 },
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildPose(animationState, animationBlend, celebrationLevel) {
  const blend = clamp(animationBlend || 0, 0, 1);
  const celebration = clamp(celebrationLevel || 0, 0, 1);
  const pose = {
    torsoTilt: 0,
    leftLeg: 0,
    rightLeg: 0,
    leftArm: 0,
    rightArm: 0,
    bodyLift: celebration * 0.08,
  };

  switch (animationState) {
    case "track":
      pose.leftLeg = 0.2 * blend;
      pose.rightLeg = -0.2 * blend;
      pose.leftArm = -0.18 * blend;
      pose.rightArm = 0.18 * blend;
      pose.torsoTilt = 0.06 * blend;
      break;
    case "intercept":
      pose.leftLeg = 0.28 * blend;
      pose.rightLeg = -0.1 * blend;
      pose.leftArm = -0.24 * blend;
      pose.rightArm = 0.22 * blend;
      pose.torsoTilt = 0.1 * blend;
      break;
    case "shoot":
      pose.leftLeg = 0.08;
      pose.rightLeg = -0.66 * Math.max(0.35, blend);
      pose.leftArm = -0.3;
      pose.rightArm = 0.22;
      pose.torsoTilt = 0.18 * Math.max(0.5, blend);
      break;
    case "save":
      pose.leftLeg = 0.16;
      pose.rightLeg = 0.16;
      pose.leftArm = -1.05 * Math.max(0.35, blend);
      pose.rightArm = 1.05 * Math.max(0.35, blend);
      pose.torsoTilt = 0.22 * blend;
      break;
    case "distribute":
      pose.leftLeg = 0.04;
      pose.rightLeg = -0.14 * blend;
      pose.leftArm = -0.18 * blend;
      pose.rightArm = 0.56 * blend;
      pose.torsoTilt = 0.14 * blend;
      break;
    case "celebrate":
      pose.leftLeg = 0.12 * celebration;
      pose.rightLeg = 0.12 * celebration;
      pose.leftArm = -0.85 * celebration;
      pose.rightArm = 0.85 * celebration;
      pose.torsoTilt = -0.08 * celebration;
      pose.bodyLift = 0.1 * celebration;
      break;
    case "run":
    default:
      pose.leftLeg = 0.26 * blend;
      pose.rightLeg = -0.26 * blend;
      pose.leftArm = -0.24 * blend;
      pose.rightArm = 0.24 * blend;
      pose.torsoTilt = 0.08 * blend;
      break;
  }

  return pose;
}

function SoccerPlayer({
  position = [0, 0, 22],
  rotation = [0, Math.PI, 0],
  playerId,
  isActive = false,
  kitVariant = "primary",
  animationState = "idle",
  animationBlend = 0,
  isGoalkeeper = false,
  celebrationLevel = 0,
}) {
  const materials = buildMaterials(kitVariant);
  const pose = buildPose(animationState, animationBlend, celebrationLevel);
  const rootPosition = [position[0], position[1] + pose.bodyLift, position[2]];
  const keeperColor = kitVariant === "secondary" ? "#efb08e" : "#9fd9ff";

  return (
    <group name={playerId || "player-one"} position={rootPosition} rotation={rotation}>
      {isActive && (
        <mesh name="active-marker" position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[0.7, 0.95, 32]} />
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#0891b2"
            emissiveIntensity={0.7}
            transparent
            opacity={0.75}
          />
        </mesh>
      )}
      <group name="torso" position={[0, 1.72, 0]} rotation={[pose.torsoTilt, 0, 0]}>
        <mesh name="torso-core" {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.4, 1, 8, 18]} />
          <meshStandardMaterial {...materials.jersey} />
        </mesh>
        <mesh name="jersey-trim" position={[0, -0.58, 0]} {...SHADOW_PROPS}>
          <torusGeometry args={[0.36, 0.045, 10, 32]} />
          <meshStandardMaterial {...materials.jerseyTrim} />
        </mesh>
      </group>

      <group name="head" position={[0, 2.58, 0]}>
        <mesh name="head-skin" {...SHADOW_PROPS}>
          <sphereGeometry args={[0.31, 22, 22]} />
          <meshStandardMaterial {...materials.skin} />
        </mesh>
        <mesh name="head-hair" position={[0, 0.08, -0.01]} {...SHADOW_PROPS}>
          <sphereGeometry args={[0.315, 22, 22, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial {...materials.hair} />
        </mesh>
        <mesh name="neck" position={[0, -0.32, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.11, 0.13, 0.18, 14]} />
          <meshStandardMaterial {...materials.skin} />
        </mesh>
      </group>

      <group
        name="left-arm"
        position={[-0.57, 1.88, 0.04]}
        rotation={[pose.leftArm, 0, 0.42 - pose.leftArm * 0.2]}
      >
        <mesh name="left-sleeve" position={[0, -0.08, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.12, 0.14, 0.25, 12]} />
          <meshStandardMaterial {...materials.jersey} />
        </mesh>
        <mesh name="left-arm-segment" position={[0, -0.31, 0.02]} rotation={[0, 0, 0.18]} {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.09, 0.36, 6, 12]} />
          <meshStandardMaterial {...materials.skin} />
        </mesh>
      </group>

      <group
        name="right-arm"
        position={[0.57, 1.88, 0.04]}
        rotation={[pose.rightArm, 0, -0.42 + pose.rightArm * 0.2]}
      >
        <mesh name="right-sleeve" position={[0, -0.08, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.12, 0.14, 0.25, 12]} />
          <meshStandardMaterial {...materials.jersey} />
        </mesh>
        <mesh
          name="right-arm-segment"
          position={[0, -0.31, 0.02]}
          rotation={[0, 0, -0.18]}
          {...SHADOW_PROPS}
        >
          <capsuleGeometry args={[0.09, 0.36, 6, 12]} />
          <meshStandardMaterial {...materials.skin} />
        </mesh>
      </group>

      <group
        name="left-leg"
        position={[-0.23, 0.84, 0.04]}
        rotation={[0.02 + pose.leftLeg, 0, 0.07]}
      >
        <mesh name="left-shorts-panel" position={[0, 0.27, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.16, 0.18, 0.33, 12]} />
          <meshStandardMaterial {...materials.shorts} />
        </mesh>
        <mesh name="left-leg-segment" position={[0, 0.02, 0]} {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.115, 0.42, 6, 12]} />
          <meshStandardMaterial {...materials.skin} />
        </mesh>
        <mesh name="left-sock" position={[0, -0.42, 0.02]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.1, 0.11, 0.44, 12]} />
          <meshStandardMaterial {...materials.socks} />
        </mesh>
        <mesh name="left-boot" position={[0, -0.72, 0.12]} {...SHADOW_PROPS}>
          <boxGeometry args={[0.2, 0.24, 0.42]} />
          <meshStandardMaterial {...materials.boots} />
        </mesh>
      </group>

      <group
        name="right-leg"
        position={[0.23, 0.84, 0.04]}
        rotation={[-0.02 + pose.rightLeg, 0, -0.07]}
      >
        <mesh name="right-shorts-panel" position={[0, 0.27, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.16, 0.18, 0.33, 12]} />
          <meshStandardMaterial {...materials.shorts} />
        </mesh>
        <mesh name="right-leg-segment" position={[0, 0.02, 0]} {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.115, 0.42, 6, 12]} />
          <meshStandardMaterial {...materials.skin} />
        </mesh>
        <mesh name="right-sock" position={[0, -0.42, 0.02]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.1, 0.11, 0.44, 12]} />
          <meshStandardMaterial {...materials.socks} />
        </mesh>
        <mesh name="right-boot" position={[0, -0.72, 0.12]} {...SHADOW_PROPS}>
          <boxGeometry args={[0.2, 0.24, 0.42]} />
          <meshStandardMaterial {...materials.boots} />
        </mesh>
      </group>

      {isGoalkeeper && (
        <group name="keeper-gloves">
          <mesh position={[-0.76, 1.38, 0.02]} {...SHADOW_PROPS}>
            <boxGeometry args={[0.18, 0.15, 0.18]} />
            <meshStandardMaterial color={keeperColor} roughness={0.45} metalness={0.12} />
          </mesh>
          <mesh position={[0.76, 1.38, 0.02]} {...SHADOW_PROPS}>
            <boxGeometry args={[0.18, 0.15, 0.18]} />
            <meshStandardMaterial color={keeperColor} roughness={0.45} metalness={0.12} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export default SoccerPlayer;
