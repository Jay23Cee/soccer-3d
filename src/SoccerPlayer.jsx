import React from "react";

const KIT_COLORS = {
  jersey: "#1f6feb",
  jerseyTrim: "#dbeafe",
  shorts: "#0f172a",
  socks: "#f8fafc",
  boots: "#111827",
  skin: "#f1c9a8",
  hair: "#2f241f",
};

const MATERIALS = {
  jersey: { color: KIT_COLORS.jersey, roughness: 0.42, metalness: 0.08 },
  jerseyTrim: { color: KIT_COLORS.jerseyTrim, roughness: 0.5, metalness: 0.04 },
  shorts: { color: KIT_COLORS.shorts, roughness: 0.55, metalness: 0.08 },
  socks: { color: KIT_COLORS.socks, roughness: 0.62, metalness: 0.03 },
  boots: { color: KIT_COLORS.boots, roughness: 0.38, metalness: 0.2 },
  skin: { color: KIT_COLORS.skin, roughness: 0.7, metalness: 0.03 },
  hair: { color: KIT_COLORS.hair, roughness: 0.72, metalness: 0.02 },
};

const SHADOW_PROPS = {
  castShadow: true,
  receiveShadow: true,
};

function SoccerPlayer({ position = [0, 0, 22], rotation = [0, Math.PI, 0] }) {
  return (
    <group name="player-one" position={position} rotation={rotation}>
      <group name="torso" position={[0, 1.72, 0]}>
        <mesh name="torso-core" {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.4, 1, 8, 18]} />
          <meshStandardMaterial {...MATERIALS.jersey} />
        </mesh>
        <mesh name="jersey-trim" position={[0, -0.58, 0]} {...SHADOW_PROPS}>
          <torusGeometry args={[0.36, 0.045, 10, 32]} />
          <meshStandardMaterial {...MATERIALS.jerseyTrim} />
        </mesh>
      </group>

      <group name="head" position={[0, 2.58, 0]}>
        <mesh name="head-skin" {...SHADOW_PROPS}>
          <sphereGeometry args={[0.31, 22, 22]} />
          <meshStandardMaterial {...MATERIALS.skin} />
        </mesh>
        <mesh name="head-hair" position={[0, 0.08, -0.01]} {...SHADOW_PROPS}>
          <sphereGeometry args={[0.315, 22, 22, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial {...MATERIALS.hair} />
        </mesh>
        <mesh name="neck" position={[0, -0.32, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.11, 0.13, 0.18, 14]} />
          <meshStandardMaterial {...MATERIALS.skin} />
        </mesh>
      </group>

      <group name="left-arm" position={[-0.57, 1.88, 0.04]} rotation={[0, 0, 0.42]}>
        <mesh name="left-sleeve" position={[0, -0.08, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.12, 0.14, 0.25, 12]} />
          <meshStandardMaterial {...MATERIALS.jersey} />
        </mesh>
        <mesh name="left-arm-segment" position={[0, -0.31, 0.02]} rotation={[0, 0, 0.18]} {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.09, 0.36, 6, 12]} />
          <meshStandardMaterial {...MATERIALS.skin} />
        </mesh>
      </group>

      <group name="right-arm" position={[0.57, 1.88, 0.04]} rotation={[0, 0, -0.42]}>
        <mesh name="right-sleeve" position={[0, -0.08, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.12, 0.14, 0.25, 12]} />
          <meshStandardMaterial {...MATERIALS.jersey} />
        </mesh>
        <mesh
          name="right-arm-segment"
          position={[0, -0.31, 0.02]}
          rotation={[0, 0, -0.18]}
          {...SHADOW_PROPS}
        >
          <capsuleGeometry args={[0.09, 0.36, 6, 12]} />
          <meshStandardMaterial {...MATERIALS.skin} />
        </mesh>
      </group>

      <group name="left-leg" position={[-0.23, 0.84, 0.04]} rotation={[0.02, 0, 0.07]}>
        <mesh name="left-shorts-panel" position={[0, 0.27, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.16, 0.18, 0.33, 12]} />
          <meshStandardMaterial {...MATERIALS.shorts} />
        </mesh>
        <mesh name="left-leg-segment" position={[0, 0.02, 0]} {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.115, 0.42, 6, 12]} />
          <meshStandardMaterial {...MATERIALS.skin} />
        </mesh>
        <mesh name="left-sock" position={[0, -0.42, 0.02]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.1, 0.11, 0.44, 12]} />
          <meshStandardMaterial {...MATERIALS.socks} />
        </mesh>
        <mesh name="left-boot" position={[0, -0.72, 0.12]} {...SHADOW_PROPS}>
          <boxGeometry args={[0.2, 0.24, 0.42]} />
          <meshStandardMaterial {...MATERIALS.boots} />
        </mesh>
      </group>

      <group name="right-leg" position={[0.23, 0.84, 0.04]} rotation={[-0.02, 0, -0.07]}>
        <mesh name="right-shorts-panel" position={[0, 0.27, 0]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.16, 0.18, 0.33, 12]} />
          <meshStandardMaterial {...MATERIALS.shorts} />
        </mesh>
        <mesh name="right-leg-segment" position={[0, 0.02, 0]} {...SHADOW_PROPS}>
          <capsuleGeometry args={[0.115, 0.42, 6, 12]} />
          <meshStandardMaterial {...MATERIALS.skin} />
        </mesh>
        <mesh name="right-sock" position={[0, -0.42, 0.02]} {...SHADOW_PROPS}>
          <cylinderGeometry args={[0.1, 0.11, 0.44, 12]} />
          <meshStandardMaterial {...MATERIALS.socks} />
        </mesh>
        <mesh name="right-boot" position={[0, -0.72, 0.12]} {...SHADOW_PROPS}>
          <boxGeometry args={[0.2, 0.24, 0.42]} />
          <meshStandardMaterial {...MATERIALS.boots} />
        </mesh>
      </group>
    </group>
  );
}

export default SoccerPlayer;
