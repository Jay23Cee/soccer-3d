import React from "react";
import { useBox } from "@react-three/cannon";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

function SoccerField() {
    // Load PBR textures
    const grassColor = useLoader(THREE.TextureLoader, "Grass001_2K-JPG/Grass001_2K-JPG_Color.jpg");
    const grassRoughness = useLoader(THREE.TextureLoader, "Grass001_2K-JPG/Grass001_2K-JPG_Roughness.jpg");

    // Set texture wrapping and tiling
    grassColor.wrapS = grassColor.wrapT = THREE.RepeatWrapping;
    grassRoughness.wrapS = grassRoughness.wrapT = THREE.RepeatWrapping;

    grassColor.repeat.set(50, 25);
    grassRoughness.repeat.set(50, 25);

    const fieldSize = [100, 0.1, 160];
    const [ref] = useBox(() => ({
        type: "Static",
        position: [0, -0.05, 0],
        args: fieldSize,
    }));

    return (
        <mesh ref={ref} receiveShadow>
            {/* Field Plane */}
            <boxGeometry args={fieldSize} />
            <meshStandardMaterial
                map={grassColor}
                roughnessMap={grassRoughness}
                roughness={0.8}
            />

            {/* Lighting */}
            <ambientLight intensity={0.3} />
            <directionalLight
                position={[10, 20, 5]}
                intensity={1}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
            />

            {/* Field Markings */}
            <group>
{/* Center Circle */}
{/* Center Circle (Hollow Ring) */}
<mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <ringGeometry args={[9.5, 10, 64]} /> {/* Inner Radius: 9.5, Outer Radius: 10 */}
    <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
</mesh>


{/* Center Spot */}
<mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <circleGeometry args={[0.5, 32]} />
    <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
</mesh>

{/* Halfway Line */}
<mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[100, 0.5]} /> {/* Width matches the field size */}
    <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
</mesh>


{/* Goal and Penalty Areas */}
{[{ z: -75 }, { z: 75 }].map(({ z }, idx) => (
    <group key={`goal-group-${idx}`}>
        {/* Goal Box Lines */}
        <lineSegments position={[0, 0.08, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <edgesGeometry attach="geometry" args={[new THREE.PlaneGeometry(36, 6)]} />
            <lineBasicMaterial attach="material" color="#FFFFFF" linewidth={1} />
        </lineSegments>

        {/* Penalty Area Lines */}
        <lineSegments position={[0, 0.08, z < 0 ? -70 : 70]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <edgesGeometry attach="geometry" args={[new THREE.PlaneGeometry(44, 18)]} />
            <lineBasicMaterial attach="material" color="#FFFFFF" linewidth={1} />
        </lineSegments>

        {/* Penalty Spot */}
        <mesh position={[0, 0.98, z < 0 ? -65 : 65]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[0.5, 32]} />
            <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
        </mesh>

        {/* Penalty Arc */}
        <mesh
            position={[0, 0.08, z < 0 ? -68 : 68]}
            rotation={[-Math.PI / 2, 0, z < 0 ? Math.PI : 0]}
            receiveShadow
        >
            <ringGeometry args={[9.8, 10, 64, 1, Math.PI / 4, Math.PI / 2]} />
            <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
        </mesh>
    </group>
))}

{/* Corner Arcs */}
{[-1, 1].map((x) =>
    [-1, 1].map((z) => (
        <mesh
            key={`corner-${x}-${z}`}
            position={[x * (fieldSize[0] / 2 - 0.5), 0.08, z * (fieldSize[2] / 2 - 0.5)]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
        >
            <circleGeometry args={[1.5, 32, 0, Math.PI / 2]} />
            <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
        </mesh>
    ))
)}


                {/* Corner Arcs */}
                {[-1, 1].map((x) =>
                    [-1, 1].map((z) => (
                        <mesh
                            key={`corner-${x}-${z}`}
                            position={[x * (fieldSize[0] / 2 - 0.5), 0.06, z * (fieldSize[2] / 2 - 0.5)]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            receiveShadow
                        >
                            <circleGeometry args={[1.5, 32, 0, Math.PI / 2]} />
                            <meshBasicMaterial color="#FFFFFF" side={THREE.DoubleSide} />
                        </mesh>
                    ))
                )}
            </group>
        </mesh>
    );
}

export default SoccerField;
