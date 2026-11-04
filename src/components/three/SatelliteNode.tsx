import React, { useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { COLORS, type SatelliteStatus } from '../../lib/constants';

export interface SatelliteNodeProps {
  position: [number, number, number];
  status: SatelliteStatus | string;
  id: string;
  name?: string;
  isSelected?: boolean;
  onClick?: () => void;
  orbitalElements?: {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    raan: number;
    [key: string]: any;
  };
  hardware?: {
    processor: string;
    power: number;
    memory: number;
  };
  health?: {
    powerLevel: number;
    radiationDose: number;
    computeLoad: number;
    fuelRemaining: number;
  };
}

export const SatelliteNode: React.FC<SatelliteNodeProps> = ({
  position,
  status,
  id,
  name,
  isSelected = false,
  onClick,
  orbitalElements,
  hardware,
  health,
}) => {
  const [hovered, setHovered] = useState(false);
  const busRef = useRef<THREE.Group>(null);
  const selectionRingRef = useRef<THREE.Mesh>(null);
  const thrustRef = useRef<THREE.Mesh>(null);

  // Status color mapping
  const getColor = (s: string): string => {
    switch (s.toLowerCase()) {
      case 'nominal':
        return COLORS.NOMINAL;
      case 'alert':
        return COLORS.ALERT;
      case 'critical':
        return COLORS.CRITICAL;
      case 'maneuvering':
        return COLORS.MANEUVERING;
      case 'migrating':
        return COLORS.MIGRATING;
      default:
        return COLORS.NOMINAL;
    }
  };

  const nodeColor = getColor(status);
  const isManeuvering = status.toLowerCase() === 'maneuvering';

  // Orbital Calculations
  const sma = orbitalElements?.semiMajorAxis ?? 6921.4;
  const altitude = sma - 6371; // km
  const ecc = orbitalElements?.eccentricity ?? 0.0008;

  // Internal calculation of orbital period in minutes: T = 2π√(a³/μ) / 60
  const orbitalPeriodMin = useMemo(() => {
    const mu = 398600.4418; // km^3 / s^2 (Earth standard gravitational parameter)
    return (2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu)) / 60;
  }, [sma]);

  // Convert inclination & RAAN from radians to degrees if needed
  const rawInc = orbitalElements?.inclination ?? 53.2;
  const incDeg = Math.abs(rawInc) <= Math.PI + 0.01 ? (rawInc * 180) / Math.PI : rawInc;

  const rawRaan = orbitalElements?.raan ?? 0;
  const raanDeg =
    Math.abs(rawRaan) <= 2 * Math.PI + 0.01 && rawRaan !== 0
      ? (rawRaan * 180) / Math.PI
      : rawRaan;

  // Hardware metrics with fallbacks
  const hwProcessor = hardware?.processor ?? 'PolarFire SoC';
  const hwPower = hardware?.power ?? 4.5;
  const hwMemory = hardware?.memory ?? 2048;

  // Subsystem health with fallbacks
  const pwrLevel = health?.powerLevel ?? 96.0;
  const radDose = health?.radiationDose ?? 1.25;
  const compLoad = health?.computeLoad ?? 28.5;
  const fuelRem = health?.fuelRemaining ?? 91.2;

  // Health bar color scales
  const pwrColor = pwrLevel > 70 ? '#10b981' : pwrLevel > 30 ? '#f59e0b' : '#ef4444';
  const compColor = compLoad < 60 ? '#10b981' : compLoad < 85 ? '#f59e0b' : '#ef4444';
  const fuelColor = fuelRem > 50 ? '#10b981' : fuelRem > 20 ? '#f59e0b' : '#ef4444';

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Tumbling/rotation applied to the satellite bus only (solar panels remain sun-facing/static)
    if (busRef.current) {
      busRef.current.rotation.x = t * 0.6;
      busRef.current.rotation.y = t * 0.9;
    }

    // Pulsing selection ring
    if (selectionRingRef.current && isSelected) {
      const pulse = 1.0 + 0.25 * Math.sin(t * 5);
      selectionRingRef.current.scale.set(pulse, pulse, pulse);
      const mat = selectionRingRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = 0.5 + 0.4 * Math.sin(t * 5);
      }
    }

    // Maneuvering thrust flame flicker
    if (thrustRef.current && isManeuvering) {
      const flicker = 0.9 + 0.3 * Math.sin(t * 20);
      thrustRef.current.scale.set(flicker, 1 + flicker * 0.4, flicker);
    }
  });

  return (
    <group position={position}>
      {/* Invisible Interactive Raycast Hit Sphere for responsive clicking & hovering */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Rotating Satellite Bus Group (Bus + Antenna Dish + Optics) */}
      <group ref={busRef}>
        {/* Main Satellite Bus: BoxGeometry(0.07, 0.04, 0.1) */}
        <mesh>
          <boxGeometry args={[0.07, 0.04, 0.1]} />
          <meshStandardMaterial
            color={nodeColor}
            emissive={nodeColor}
            emissiveIntensity={isSelected ? 1.0 : hovered ? 0.8 : 0.4}
            roughness={0.25}
            metalness={0.85}
          />
        </mesh>

        {/* Small Antenna Dish: CylinderGeometry(0.01, 0.025, 0.04) pointing up (+Y) */}
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.01, 0.025, 0.04, 16]} />
          <meshStandardMaterial
            color="#94a3b8"
            emissive="#38bdf8"
            emissiveIntensity={0.2}
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>

        {/* High-Gain Antenna Feed Needle */}
        <mesh position={[0, 0.065, 0]}>
          <cylinderGeometry args={[0.0015, 0.0015, 0.015, 8]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>

        {/* Gold MLI Multi-Layer Insulation / Optical Sensor Aperture */}
        <mesh position={[0, 0, 0.051]}>
          <planeGeometry args={[0.04, 0.022]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#d97706"
            emissiveIntensity={0.25}
            metalness={0.95}
            roughness={0.15}
          />
        </mesh>
      </group>

      {/* Static Sun-Facing Solar Panels (Offset ±0.15 on X axis) */}
      {/* Left Solar Panel */}
      <group position={[-0.15, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.22, 0.008, 0.06]} />
          <meshStandardMaterial
            color="#1e3a8a"
            emissive="#2563eb"
            emissiveIntensity={0.25}
            metalness={0.9}
            roughness={0.25}
          />
        </mesh>
        {/* Photovoltaic Cell Top Surface */}
        <mesh position={[0, 0.0045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.21, 0.054]} />
          <meshStandardMaterial
            color="#0f172a"
            emissive="#1d4ed8"
            emissiveIntensity={0.35}
            metalness={0.95}
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* Right Solar Panel */}
      <group position={[0.15, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.22, 0.008, 0.06]} />
          <meshStandardMaterial
            color="#1e3a8a"
            emissive="#2563eb"
            emissiveIntensity={0.25}
            metalness={0.9}
            roughness={0.25}
          />
        </mesh>
        {/* Photovoltaic Cell Top Surface */}
        <mesh position={[0, 0.0045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.21, 0.054]} />
          <meshStandardMaterial
            color="#0f172a"
            emissive="#1d4ed8"
            emissiveIntensity={0.35}
            metalness={0.95}
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* Solar Panel Mount Booms connecting bus to panels */}
      <mesh position={[-0.038, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.003, 0.003, 0.015, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.038, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.003, 0.003, 0.015, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Maneuvering Thrust Vector Indicator */}
      {isManeuvering && (
        <group position={[0, -0.11, 0]} rotation={[Math.PI, 0, 0]}>
          <mesh ref={thrustRef}>
            <coneGeometry args={[0.035, 0.12, 12]} />
            <meshBasicMaterial
              color="#00ffff"
              transparent
              opacity={0.85}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <pointLight color="#00ffff" intensity={0.5} distance={0.5} />
        </group>
      )}

      {/* Pulsing Selection Ring */}
      {isSelected && (
        <mesh ref={selectionRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.22, 32]} />
          <meshBasicMaterial
            color={nodeColor}
            side={THREE.DoubleSide}
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Hover or Selected Beacon Halo */}
      {(hovered || isSelected) && (
        <mesh>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshBasicMaterial
            color={nodeColor}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Rich Aerospace Dark HUD Telemetry Tooltip on Hover or Selection */}
      {(hovered || isSelected) && (
        <Html
          position={[0, 0.35, 0]}
          center
          distanceFactor={16}
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="flex flex-col items-center pointer-events-none select-none">
            <div className="w-80 rounded-sm bg-zinc-950/95 border border-zinc-700/80  shadow-xl shadow-black/50 shadow-black/80 p-3 text-xs font-mono text-zinc-200">
              {/* Header: Node ID, Name, Status Badge */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full inline-block animate-pulse shadow-md"
                    style={{ backgroundColor: nodeColor }}
                  />
                  <span className="font-bold text-sm text-zinc-100 tracking-wide">{id}</span>
                  {name && <span className="text-[11px] text-zinc-400 font-normal">({name})</span>}
                </div>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: nodeColor,
                    backgroundColor: `${nodeColor}18`,
                    border: `1px solid ${nodeColor}40`,
                  }}
                >
                  {status}
                </span>
              </div>

              {/* Orbital Telemetry */}
              <div className="mt-2">
                <div className="text-[9px] uppercase tracking-wider text-blue-400 font-bold mb-1 flex items-center justify-between">
                  <span>Orbital Telemetry</span>
                  <span className="text-zinc-500 font-normal">LEO Walker</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                    <div className="text-[9px] text-zinc-400">ALTITUDE</div>
                    <div className="text-blue-300 font-semibold">{altitude.toFixed(1)} km</div>
                  </div>
                  <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                    <div className="text-[9px] text-zinc-400">PERIOD (T)</div>
                    <div className="text-blue-300 font-semibold">{orbitalPeriodMin.toFixed(1)} min</div>
                  </div>
                  <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                    <div className="text-[9px] text-zinc-400">SEMI-MAJOR AXIS</div>
                    <div className="text-zinc-300 font-semibold">{sma.toFixed(1)} km</div>
                  </div>
                  <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                    <div className="text-[9px] text-zinc-400">INCLINATION</div>
                    <div className="text-zinc-300 font-semibold">{incDeg.toFixed(1)}°</div>
                  </div>
                  <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                    <div className="text-[9px] text-zinc-400">RAAN (Ω)</div>
                    <div className="text-zinc-300 font-semibold">{raanDeg.toFixed(1)}°</div>
                  </div>
                  <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800">
                    <div className="text-[9px] text-zinc-400">ECCENTRICITY</div>
                    <div className="text-zinc-300 font-semibold">{ecc.toFixed(4)}</div>
                  </div>
                </div>
              </div>

              {/* Hardware Architecture */}
              <div className="mt-2.5 pt-2 border-t border-zinc-800">
                <div className="text-[9px] uppercase tracking-wider text-indigo-400 font-bold mb-1 flex items-center justify-between">
                  <span>Hardware Architecture</span>
                  <span className="text-zinc-500 font-normal">Payload Bus</span>
                </div>
                <div className="bg-zinc-900 p-1.5 rounded border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">PROCESSOR:</span>
                    <span
                      className="text-indigo-200 font-semibold truncate max-w-[170px]"
                      title={hwProcessor}
                    >
                      {hwProcessor}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">BUS POWER:</span>
                    <span className="text-amber-300 font-semibold">{hwPower.toFixed(1)} W</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">ONBOARD MEMORY:</span>
                    <span className="text-zinc-200 font-semibold">{hwMemory} MB</span>
                  </div>
                </div>
              </div>

              {/* Subsystem Health & Diagnostics */}
              <div className="mt-2.5 pt-2 border-t border-zinc-800">
                <div className="text-[9px] uppercase tracking-wider text-emerald-500 font-bold mb-1.5 flex items-center justify-between">
                  <span>Subsystem Health</span>
                  <span className="text-zinc-400 text-[10px] font-normal">
                    RAD DOSE:{' '}
                    <span className="text-emerald-300 font-semibold">{radDose.toFixed(2)} Gy</span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  {/* Power Level Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-300 mb-0.5">
                      <span className="text-zinc-400">POWER LEVEL</span>
                      <span className="font-semibold" style={{ color: pwrColor }}>
                        {pwrLevel.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, pwrLevel))}%`,
                          backgroundColor: pwrColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* Compute Load Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-300 mb-0.5">
                      <span className="text-zinc-400">COMPUTE LOAD</span>
                      <span className="font-semibold" style={{ color: compColor }}>
                        {compLoad.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, compLoad))}%`,
                          backgroundColor: compColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* Fuel Remaining Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-300 mb-0.5">
                      <span className="text-zinc-400">FUEL REMAINING</span>
                      <span className="font-semibold" style={{ color: fuelColor }}>
                        {fuelRem.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, fuelRem))}%`,
                          backgroundColor: fuelColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pointer arrow pointing down to satellite */}
            <div className="w-2.5 h-2.5 bg-zinc-950 rotate-45 -mt-1.5 border-r border-b border-zinc-700/80 shadow-md" />
          </div>
        </Html>
      )}
    </group>
  );
};

export default SatelliteNode;
