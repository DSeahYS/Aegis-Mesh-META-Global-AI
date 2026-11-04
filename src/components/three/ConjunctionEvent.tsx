import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { ConjunctionSeverity } from '../../lib/constants';

export interface ConjunctionEventProps {
  position: [number, number, number];
  severity: ConjunctionSeverity;
  active: boolean;
  missDistance?: number; // km
  pc?: number; // Collision probability
  label?: string;
}

export const ConjunctionEvent: React.FC<ConjunctionEventProps> = ({
  position,
  severity,
  active,
  missDistance,
  pc,
  label,
}) => {
  const pulseSphereRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Severity color grading: green -> yellow -> orange -> red
  const getColor = (sev: ConjunctionSeverity): string => {
    switch (sev) {
      case 'low':
        return '#10b981'; // Green
      case 'medium':
        return '#f59e0b'; // Amber / Yellow
      case 'high':
        return '#f97316'; // Orange
      case 'critical':
        return '#ef4444'; // Red
      default:
        return '#ef4444';
    }
  };

  // Base size proportional to severity
  const getBaseRadius = (sev: ConjunctionSeverity): number => {
    switch (sev) {
      case 'low':
        return 0.16;
      case 'medium':
        return 0.26;
      case 'high':
        return 0.38;
      case 'critical':
        return 0.52;
      default:
        return 0.3;
    }
  };

  const color = getColor(severity);
  const baseRadius = getBaseRadius(severity);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();

    // Pulse core sphere
    if (pulseSphereRef.current) {
      const pulseSpeed = severity === 'critical' ? 7 : 4;
      const s = 1.0 + 0.22 * Math.sin(t * pulseSpeed);
      pulseSphereRef.current.scale.set(s, s, s);

      const mat = pulseSphereRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = 0.25 + 0.15 * Math.sin(t * pulseSpeed);
      }
    }

    // Expanding shockwave alert ring
    if (ringRef.current) {
      const ringCycle = (t * 1.5) % 1; // 0 to 1
      const ringScale = 1.0 + ringCycle * 1.8;
      ringRef.current.scale.set(ringScale, ringScale, ringScale);

      const ringMat = ringRef.current.material as THREE.MeshBasicMaterial;
      if (ringMat) {
        ringMat.opacity = Math.max(0, 0.7 * (1 - ringCycle));
      }
    }
  });

  return (
    <group position={position}>
      {/* Central danger point marker */}
      <mesh>
        <octahedronGeometry args={[baseRadius * 0.25, 0]} />
        <meshBasicMaterial
          color={color}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Pulsing Danger Zone Volume */}
      <mesh ref={pulseSphereRef}>
        <sphereGeometry args={[baseRadius, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 0.3 : 0.1}
          wireframe={severity !== 'critical'}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Solid inner transparent threat bubble */}
      <mesh>
        <sphereGeometry args={[baseRadius * 0.7, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={active ? 0.18 : 0.05}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Expanding shockwave ring when active */}
      {active && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[baseRadius * 0.8, baseRadius * 0.95, 32]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Tactical Beacon Tag */}
      {active && (
        <Html
          position={[0, baseRadius + 0.15, 0]}
          center
          distanceFactor={20}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="flex flex-col items-center">
            <div
              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider  shadow-md border ${
                severity === 'critical'
                  ? 'bg-red-950/85 text-red-200 border-red-500 '
                  : 'bg-zinc-900/85 text-amber-200 border-amber-500/60'
              }`}
            >
              <span>{label ?? `CONJUNCTION (${severity})`}</span>
              {missDistance !== undefined && (
                <div className="text-[9px] text-zinc-300">
                  d: {missDistance.toFixed(2)} km
                  {pc !== undefined && ` | Pc: ${pc.toExponential(1)}`}
                </div>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default ConjunctionEvent;
