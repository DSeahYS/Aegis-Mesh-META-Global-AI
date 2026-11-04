import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface ManeuverTrailProps {
  startPosition: [number, number, number];
  deltaV: [number, number, number];
  active: boolean;
  magnitude?: number; // m/s
}

export const ManeuverTrail: React.FC<ManeuverTrailProps> = ({
  startPosition,
  deltaV,
  active,
}) => {
  const particlesRef = useRef<THREE.Points>(null);
  const arrowRef = useRef<THREE.Group>(null);

  // Compute direction and orientation quaternion for the thrust vector
  const { quaternion, length } = useMemo(() => {
    const dv = new THREE.Vector3(deltaV[0], deltaV[1], deltaV[2]);
    const len = dv.length();
    const dir = len > 1e-5 ? dv.clone().normalize() : new THREE.Vector3(0, 1, 0);

    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    return { quaternion: q, length: Math.max(len, 0.4) };
  }, [deltaV]);

  // Generate exhaust particle trail behind satellite (opposite to deltaV)
  const particleCount = 40;
  const { initialOffsets, particleColors } = useMemo(() => {
    const offsets = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const cyan = new THREE.Color('#38bdf8');
    const purple = new THREE.Color('#818cf8');

    for (let i = 0; i < particleCount; i++) {
      // Fraction along trail
      const frac = i / particleCount;
      const spread = frac * 0.05;

      offsets[i * 3] = (Math.random() - 0.5) * spread;
      offsets[i * 3 + 1] = -frac * 0.6; // negative Y in local thrust frame
      offsets[i * 3 + 2] = (Math.random() - 0.5) * spread;

      const c = frac < 0.5 ? cyan : purple;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    return { initialOffsets: offsets, particleColors: colors };
  }, []);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();

    if (particlesRef.current) {
      const posAttr = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < particleCount; i++) {
          const frac = (i / particleCount + t * 2.5) % 1.0;
          const spread = frac * 0.08;

          posAttr.setXYZ(
            i,
            (Math.sin(t * 10 + i) * 0.5) * spread,
            -frac * 0.8,
            (Math.cos(t * 10 + i) * 0.5) * spread
          );
        }
        posAttr.needsUpdate = true;
      }
    }
  });

  if (!active) return null;

  return (
    <group position={startPosition}>
      {/* Thrust Arrow & Plume aligned with deltaV direction */}
      <group ref={arrowRef} quaternion={quaternion}>
        {/* Thrust Vector Head Arrow */}
        <mesh position={[0, length * 0.45, 0]}>
          <coneGeometry args={[0.06, 0.16, 12]} />
          <meshStandardMaterial
            color="#00e5ff"
            emissive="#00b0ff"
            emissiveIntensity={1.2}
            roughness={0.2}
          />
        </mesh>

        {/* Thrust Vector Shaft Line/Cylinder */}
        <mesh position={[0, length * 0.22, 0]}>
          <cylinderGeometry args={[0.015, 0.015, length * 0.45, 8]} />
          <meshBasicMaterial
            color="#00e5ff"
            transparent
            opacity={0.85}
          />
        </mesh>

        {/* Core Ion Thruster Flame */}
        <mesh position={[0, -0.06, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.04, 0.14, 12]} />
          <meshBasicMaterial
            color="#67e8f9"
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Exhaust Fading Particle Plume (trails behind) */}
        <points ref={particlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[initialOffsets, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[particleColors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.03}
            vertexColors
            transparent
            opacity={0.7}
            sizeAttenuation
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>
    </group>
  );
};

export default ManeuverTrail;
