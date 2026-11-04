import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { SCALE_FACTOR, EARTH_RADIUS_KM } from '../../lib/constants';

export interface SwarmSatellite {
  id: string;
  name?: string;
  position: [number, number, number];
  velocity?: [number, number, number];
  color?: string | THREE.Color;
  constellation?: string;
  altitudeKm?: number;
  inclinationDeg?: number;
  size?: number;
}

export interface SatelliteSwarmProps {
  satellites?: SwarmSatellite[];
  maxCount?: number;
  geometryType?: 'octahedron' | 'box';
  baseSize?: number;
  defaultColor?: string;
  isPropagating?: boolean;
  propagationSpeed?: number;
  visible?: boolean;
  interactive?: boolean;
  onSatelliteClick?: (satellite: SwarmSatellite, index: number) => void;
  onSatelliteHover?: (satellite: SwarmSatellite | null, index: number | null) => void;
}

// Deterministic fast PRNG for procedural constellation generation fallback
function createSeededRng(seed: number) {
  let s = Math.imul(seed, 0x6d2b79f5);
  return () => {
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    s = (s + 0x6d2b79f5) | 0;
    return ((t >>> 0) / 4294967296);
  };
}

/**
 * Procedural fallback generator for mega-constellations (Starlink, OneWeb, Kuiper)
 * Generates up to targetCount (~8,000 to 10,000) realistic Walker constellation nodes
 */
function generateDefaultSwarm(targetCount: number = 8500): SwarmSatellite[] {
  const rng = createSeededRng(948216);
  const result: SwarmSatellite[] = new Array(targetCount);

  // Shell configurations
  // 1. Starlink Shell 1: 550 km, 53.0 deg inclination, 72 planes
  // 2. Starlink Shell 2: 540 km, 53.2 deg inclination, 48 planes
  // 3. OneWeb Shell: 1,200 km, 87.9 deg polar inclination, 36 planes
  // 4. Project Kuiper Shell: 630 km, 51.9 deg inclination, 34 planes
  const starlink1Count = Math.floor(targetCount * 0.52);
  const starlink2Count = Math.floor(targetCount * 0.22);
  const onewebCount = Math.floor(targetCount * 0.14);
  const kuiperCount = targetCount - (starlink1Count + starlink2Count + onewebCount);

  let idx = 0;

  // Starlink Shell 1
  const sl1Planes = 72;
  const sl1PerPlane = Math.ceil(starlink1Count / sl1Planes);
  for (let i = 0; i < starlink1Count; i++, idx++) {
    const plane = Math.floor(i / sl1PerPlane);
    const inPlane = i % sl1PerPlane;
    const altKm = 550 + (rng() - 0.5) * 6;
    const r = (EARTH_RADIUS_KM + altKm) * SCALE_FACTOR;
    const inc = (53.0 * Math.PI) / 180;
    const raan = (plane * (360 / sl1Planes) * Math.PI) / 180;
    const nu = ((inPlane * (360 / sl1PerPlane) + (rng() - 0.5) * 0.4) * Math.PI) / 180;

    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x = xOrb * Math.cos(raan) - yOrb * Math.sin(raan) * Math.cos(inc);
    const y = xOrb * Math.sin(raan) + yOrb * Math.cos(raan) * Math.cos(inc);
    const z = yOrb * Math.sin(inc);

    result[idx] = {
      id: `STARLINK-${10000 + idx}`,
      name: `Starlink-v2M #${idx + 1}`,
      constellation: 'Starlink Shell 1',
      position: [x, y, z],
      color: '#38bdf8',
      altitudeKm: Math.round(altKm),
      inclinationDeg: 53.0,
    };
  }

  // Starlink Shell 2
  const sl2Planes = 48;
  const sl2PerPlane = Math.ceil(starlink2Count / sl2Planes);
  for (let i = 0; i < starlink2Count; i++, idx++) {
    const plane = Math.floor(i / sl2PerPlane);
    const inPlane = i % sl2PerPlane;
    const altKm = 540 + (rng() - 0.5) * 8;
    const r = (EARTH_RADIUS_KM + altKm) * SCALE_FACTOR;
    const inc = (53.2 * Math.PI) / 180;
    const raan = ((plane * (360 / sl2Planes) + 15) * Math.PI) / 180;
    const nu = ((inPlane * (360 / sl2PerPlane) + (rng() - 0.5) * 0.4) * Math.PI) / 180;

    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x = xOrb * Math.cos(raan) - yOrb * Math.sin(raan) * Math.cos(inc);
    const y = xOrb * Math.sin(raan) + yOrb * Math.cos(raan) * Math.cos(inc);
    const z = yOrb * Math.sin(inc);

    result[idx] = {
      id: `STARLINK-${10000 + idx}`,
      name: `Starlink-v2M #${idx + 1}`,
      constellation: 'Starlink Shell 2',
      position: [x, y, z],
      color: '#60a5fa',
      altitudeKm: Math.round(altKm),
      inclinationDeg: 53.2,
    };
  }

  // OneWeb Polar Shell
  const owPlanes = 36;
  const owPerPlane = Math.ceil(onewebCount / owPlanes);
  for (let i = 0; i < onewebCount; i++, idx++) {
    const plane = Math.floor(i / owPerPlane);
    const inPlane = i % owPerPlane;
    const altKm = 1200 + (rng() - 0.5) * 10;
    const r = (EARTH_RADIUS_KM + altKm) * SCALE_FACTOR;
    const inc = (87.9 * Math.PI) / 180;
    const raan = (plane * (360 / owPlanes) * Math.PI) / 180;
    const nu = ((inPlane * (360 / owPerPlane) + (rng() - 0.5) * 0.3) * Math.PI) / 180;

    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x = xOrb * Math.cos(raan) - yOrb * Math.sin(raan) * Math.cos(inc);
    const y = xOrb * Math.sin(raan) + yOrb * Math.cos(raan) * Math.cos(inc);
    const z = yOrb * Math.sin(inc);

    result[idx] = {
      id: `ONEWEB-${1000 + i}`,
      name: `OneWeb-LEO #${i + 1}`,
      constellation: 'OneWeb Polar',
      position: [x, y, z],
      color: '#a855f7',
      altitudeKm: Math.round(altKm),
      inclinationDeg: 87.9,
    };
  }

  // Project Kuiper Shell
  const kpPlanes = 34;
  const kpPerPlane = Math.ceil(kuiperCount / kpPlanes);
  for (let i = 0; i < kuiperCount && idx < targetCount; i++, idx++) {
    const plane = Math.floor(i / kpPerPlane);
    const inPlane = i % kpPerPlane;
    const altKm = 630 + (rng() - 0.5) * 6;
    const r = (EARTH_RADIUS_KM + altKm) * SCALE_FACTOR;
    const inc = (51.9 * Math.PI) / 180;
    const raan = (plane * (360 / kpPlanes) * Math.PI) / 180;
    const nu = ((inPlane * (360 / kpPerPlane) + (rng() - 0.5) * 0.5) * Math.PI) / 180;

    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x = xOrb * Math.cos(raan) - yOrb * Math.sin(raan) * Math.cos(inc);
    const y = xOrb * Math.sin(raan) + yOrb * Math.cos(raan) * Math.cos(inc);
    const z = yOrb * Math.sin(inc);

    result[idx] = {
      id: `KUIPER-${3000 + i}`,
      name: `Kuiper-Sat #${i + 1}`,
      constellation: 'Project Kuiper',
      position: [x, y, z],
      color: '#34d399',
      altitudeKm: Math.round(altKm),
      inclinationDeg: 51.9,
    };
  }

  return result;
}

export const SatelliteSwarm: React.FC<SatelliteSwarmProps> = ({
  satellites: propSatellites,
  maxCount = 10000,
  geometryType = 'octahedron',
  baseSize = 0.032,
  defaultColor = '#00d4ff',
  isPropagating = true,
  propagationSpeed = 1.0,
  visible = true,
  interactive = true,
  onSatelliteClick,
  onSatelliteHover,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Active satellite dataset (either passed as prop or generated mega-constellation fallback)
  const activeSats = useMemo(() => {
    if (propSatellites && propSatellites.length > 0) {
      return propSatellites.slice(0, maxCount);
    }
    return generateDefaultSwarm(Math.min(maxCount, 8500));
  }, [propSatellites, maxCount]);

  const totalInstances = activeSats.length;

  // Geometry: lightweight Octahedron or Box
  const geometry = useMemo(() => {
    if (geometryType === 'box') {
      return new THREE.BoxGeometry(baseSize, baseSize, baseSize);
    }
    return new THREE.OctahedronGeometry(baseSize, 0);
  }, [geometryType, baseSize]);

  // Basic material for maximum WebGL rendering performance (no lighting overhead for 10,000 instances)
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
  }, []);

  // Shared reusable Three.js math primitives to avoid GC churn
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Hovered satellite state for interactive HUD
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const hoveredSat = hoveredIndex !== null && hoveredIndex < activeSats.length ? activeSats[hoveredIndex] : null;

  // Populate InstancedMesh matrices and colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = activeSats.length;
    mesh.count = count;

    for (let i = 0; i < count; i++) {
      const sat = activeSats[i];
      const p = sat.position;

      // Handle raw km coordinates vs already scaled scene coordinates
      const isKm = Math.hypot(p[0], p[1], p[2]) > 50;
      const scale = isKm ? SCALE_FACTOR : 1.0;
      const x = p[0] * scale;
      const y = p[1] * scale;
      const z = p[2] * scale;

      tempMatrix.setPosition(x, y, z);
      mesh.setMatrixAt(i, tempMatrix);

      // Assign instance color
      if (sat.color) {
        tempColor.set(sat.color);
      } else {
        tempColor.set(defaultColor);
      }
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [activeSats, defaultColor, tempMatrix, tempColor]);

  // Smooth orbital motion propagation
  useFrame((_, delta) => {
    if (!isPropagating || !groupRef.current) return;
    // Rotate swarm shell around Earth's polar axis (Y) smoothly at 60 FPS
    groupRef.current.rotation.y += delta * 0.02 * propagationSpeed;
  });

  // Handle pointer hover detection on instances
  const handlePointerMove = useCallback(
    (e: any) => {
      if (!interactive) return;
      e.stopPropagation();
      const id = e.instanceId;
      if (id !== undefined && id >= 0 && id < activeSats.length) {
        if (hoveredIndex !== id) {
          setHoveredIndex(id);
          onSatelliteHover?.(activeSats[id], id);
          document.body.style.cursor = 'pointer';
        }
      }
    },
    [interactive, activeSats, hoveredIndex, onSatelliteHover]
  );

  const handlePointerOut = useCallback(
    (e: any) => {
      e.stopPropagation();
      setHoveredIndex(null);
      onSatelliteHover?.(null, null);
      document.body.style.cursor = 'auto';
    },
    [onSatelliteHover]
  );

  const handleClick = useCallback(
    (e: any) => {
      if (!interactive) return;
      e.stopPropagation();
      const id = e.instanceId;
      if (id !== undefined && id >= 0 && id < activeSats.length) {
        onSatelliteClick?.(activeSats[id], id);
      }
    },
    [interactive, activeSats, onSatelliteClick]
  );

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, Math.max(10000, totalInstances)]}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        frustumCulled={true}
      />

      {/* Floating Tactical Aerospace Tooltip for Hovered Swarm Node */}
      {hoveredSat && (
        <Html
          position={hoveredSat.position}
          distanceFactor={18}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="flex flex-col items-center pointer-events-none -translate-y-8">
            <div className="px-2.5 py-1.5 rounded-sm bg-zinc-950/95 border border-cyan-500/50  shadow-xl shadow-black/40 text-[11px] font-mono text-zinc-100 whitespace-nowrap">
              <div className="flex items-center gap-1.5 pb-1 border-b border-zinc-800">
                <span className="w-2 h-2 rounded-full bg-cyan-400 " />
                <span className="font-bold text-blue-300">{hoveredSat.id}</span>
                {hoveredSat.constellation && (
                  <span className="text-[10px] text-zinc-400">({hoveredSat.constellation})</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[10px] text-zinc-300">
                <div>
                  <span className="text-zinc-500">ALT:</span> {hoveredSat.altitudeKm ?? 550} km
                </div>
                <div>
                  <span className="text-zinc-500">INC:</span> {hoveredSat.inclinationDeg ?? 53.0}°
                </div>
                <div>
                  <span className="text-zinc-500">TYPE:</span> MEGA-SWARM
                </div>
                <div>
                  <span className="text-emerald-500 font-semibold">COOPERATIVE</span>
                </div>
              </div>
            </div>
            <div className="w-1.5 h-1.5 bg-zinc-950 rotate-45 -mt-1 border-r border-b border-cyan-500/50" />
          </div>
        </Html>
      )}
    </group>
  );
};

export default SatelliteSwarm;
