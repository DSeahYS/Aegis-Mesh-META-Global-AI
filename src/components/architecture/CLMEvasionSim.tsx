import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import {
  Flame,
  ShieldAlert,
  ShieldCheck,
  Play,
  Pause,
  Maximize2,
  Zap,
} from 'lucide-react';

export interface CLMEvasionSimProps {
  deltaV: [number, number, number];
  isEvading: boolean;
  className?: string;
  actionLabel?: string;
  tcaSeconds?: number;
}

// -------------------------------------------------------------
// Realistic 3D Satellite Component with Solar Panels & Thrusters
// -------------------------------------------------------------
const SatelliteCraft: React.FC<{
  position: [number, number, number];
  burnActive: boolean;
  deltaVDirection: THREE.Vector3;
}> = ({ position, burnActive, deltaVDirection }) => {
  const satelliteGroupRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  // Orient the satellite and align thruster opposite to the deltaV direction
  const thrusterQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    const dir = deltaVDirection.lengthSq() > 0.001
      ? deltaVDirection.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    // Thruster points in -deltaV direction (opposite to thrust acceleration)
    const exhaustDir = dir.clone().negate();
    q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), exhaustDir);
    return q;
  }, [deltaVDirection]);

  // Exhaust particle buffers
  const particleCount = 30;
  const { particlePositions, particleColors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const cyan = new THREE.Color('#38bdf8');
    const amber = new THREE.Color('#f59e0b');

    for (let i = 0; i < particleCount; i++) {
      const frac = i / particleCount;
      pos[i * 3] = (Math.random() - 0.5) * 0.08 * frac;
      pos[i * 3 + 1] = -frac * 0.9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.08 * frac;

      const c = frac < 0.4 ? amber : cyan;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { particlePositions: pos, particleColors: col };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Gentle satellite attitude stabilization oscillation
    if (satelliteGroupRef.current) {
      satelliteGroupRef.current.rotation.z = Math.sin(t * 0.8) * 0.04;
    }

    // Dynamic thruster flame pulsation
    if (flameRef.current && burnActive) {
      const flicker = 1.0 + 0.25 * Math.sin(t * 35) + 0.15 * Math.cos(t * 60);
      flameRef.current.scale.set(flicker, flicker * 1.3, flicker);
    }

    // Exhaust particle animation
    if (particlesRef.current && burnActive) {
      const posAttr = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < particleCount; i++) {
          const frac = (i / particleCount + t * 4) % 1.0;
          posAttr.setXYZ(
            i,
            (Math.sin(t * 20 + i) * 0.06) * frac,
            -frac * 1.1,
            (Math.cos(t * 20 + i) * 0.06) * frac
          );
        }
        posAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={satelliteGroupRef} position={position}>
      {/* Satellite Bus Main Body (Aerospace Gold Foil / Deep Metallic Blue) */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.4, 0.6]} />
        <meshStandardMaterial
          color="#1e3a8a"
          metalness={0.85}
          roughness={0.25}
          emissive="#0c4a6e"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Gold Foil Thermal MLI Blanket Accent */}
      <mesh position={[0, 0.205, 0]}>
        <boxGeometry args={[0.42, 0.02, 0.52]} />
        <meshStandardMaterial
          color="#d97706"
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>

      {/* Forward Sensor Optical Aperture / Star Tracker */}
      <mesh position={[0, 0, 0.31]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.08, 16]} />
        <meshStandardMaterial color="#0284c7" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Primary High-Gain Dish Antenna */}
      <group position={[0, 0.32, -0.1]} rotation={[-Math.PI / 6, 0, 0]}>
        <mesh>
          <coneGeometry args={[0.22, 0.1, 16, 1, true]} />
          <meshStandardMaterial
            color="#e2e8f0"
            metalness={0.9}
            roughness={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.12, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} />
        </mesh>
      </group>

      {/* Left Solar Panel Boom & Array */}
      <group position={[-0.85, 0, 0]}>
        <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshStandardMaterial color="#475569" metalness={0.8} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.9, 0.03, 0.45]} />
          <meshStandardMaterial
            color="#0284c7"
            metalness={0.7}
            roughness={0.2}
            emissive="#0369a1"
            emissiveIntensity={0.2}
          />
        </mesh>
      </group>

      {/* Right Solar Panel Boom & Array */}
      <group position={[0.85, 0, 0]}>
        <mesh position={[-0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshStandardMaterial color="#475569" metalness={0.8} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.9, 0.03, 0.45]} />
          <meshStandardMaterial
            color="#0284c7"
            metalness={0.7}
            roughness={0.2}
            emissive="#0369a1"
            emissiveIntensity={0.2}
          />
        </mesh>
      </group>

      {/* Thruster Gimbal & Flame Assembly */}
      <group quaternion={thrusterQuat} position={[0, -0.22, 0]}>
        {/* Thruster Bell Nozzle */}
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.08, 0.14, 16, 1, true]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.95}
            roughness={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Active Plasma Thrust Flame & Particle Exhaust */}
        {burnActive && (
          <>
            {/* Core Intense White-Cyan Flame */}
            <mesh ref={flameRef} position={[0, -0.16, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.065, 0.32, 16]} />
              <meshBasicMaterial
                color="#67e8f9"
                transparent
                opacity={0.92}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            {/* Outer Ion Burn Plume (Amber/Cyan) */}
            <mesh position={[0, -0.22, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.11, 0.45, 16]} />
              <meshBasicMaterial
                color="#0284c7"
                transparent
                opacity={0.5}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            {/* Thruster Point Light illuminating nearby space */}
            <pointLight
              color="#38bdf8"
              intensity={2.5}
              distance={4}
              position={[0, -0.2, 0]}
            />

            {/* Exhaust Particle Plume */}
            <points ref={particlesRef}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[particlePositions, 3]}
                />
                <bufferAttribute
                  attach="attributes-color"
                  args={[particleColors, 3]}
                />
              </bufferGeometry>
              <pointsMaterial
                size={0.035}
                vertexColors
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </points>
          </>
        )}
      </group>
    </group>
  );
};

// -------------------------------------------------------------
// Jagged Lethal Hypervelocity Debris Fragment
// -------------------------------------------------------------
const DebrisObject: React.FC<{
  position: [number, number, number];
  isCriticalProximity: boolean;
}> = ({ position, isCriticalProximity }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 1.8;
      meshRef.current.rotation.y += delta * 2.4;
      meshRef.current.rotation.z += delta * 1.1;
    }
    if (glowRef.current && isCriticalProximity) {
      const s = 1.0 + 0.3 * Math.sin(Date.now() * 0.015);
      glowRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={position}>
      {/* Lethal ASAT Kinetic Fragment */}
      <mesh ref={meshRef} castShadow>
        <dodecahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial
          color="#ef4444"
          metalness={0.9}
          roughness={0.35}
          emissive="#b91c1c"
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* Threat Radiation Bubble */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshBasicMaterial
          color="#f43f5e"
          transparent
          opacity={isCriticalProximity ? 0.35 : 0.15}
          wireframe={!isCriticalProximity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Dynamic Red Point Light */}
      <pointLight
        color="#ef4444"
        intensity={isCriticalProximity ? 3.0 : 1.2}
        distance={3.5}
      />
    </group>
  );
};

// -------------------------------------------------------------
// Trajectory Pathway Rails
// -------------------------------------------------------------
const TrajectoryLines: React.FC<{
  isEvading: boolean;
  deltaVDirection: THREE.Vector3;
}> = ({ isEvading, deltaVDirection }) => {
  // Nominal straight path for satellite (faint dashed reference)
  const nominalPoints = useMemo(() => {
    return [new THREE.Vector3(-8, 0, 0), new THREE.Vector3(8, 0, 0)];
  }, []);

  const nominalLineGeom = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(nominalPoints);
  }, [nominalPoints]);

  // Debris straight approach path (red)
  const debrisPoints = useMemo(() => {
    return [new THREE.Vector3(8, 0.04, -0.02), new THREE.Vector3(-8, 0.04, -0.02)];
  }, []);

  const debrisLineGeom = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(debrisPoints);
  }, [debrisPoints]);

  // Evasive curved trajectory when deltaV is applied
  const evasiveLineGeom = useMemo(() => {
    if (!isEvading) return null;
    const curvePoints: THREE.Vector3[] = [];
    const steps = 60;
    const dvNorm = deltaVDirection.lengthSq() > 0.001
      ? deltaVDirection.clone().normalize()
      : new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= steps; i++) {
      const u = i / steps; // 0 to 1
      const x = -8 + u * 16;
      let y = 0;
      let z = 0;

      // Burn phase between u=0.2 and u=0.5
      if (u > 0.2) {
        const burnU = Math.min(1.0, (u - 0.2) / 0.3);
        const disp = 2.4 * (burnU * burnU) + (u > 0.5 ? (u - 0.5) * 4.0 : 0);
        y = dvNorm.y * disp;
        z = dvNorm.z * disp;
      }

      curvePoints.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.BufferGeometry().setFromPoints(curvePoints);
  }, [isEvading, deltaVDirection]);

  // Build full THREE.Line objects so we can render via <primitive>,
  // avoiding the JSX <line> / SVG element type collision.
  const nominalLine = useMemo(() => {
    const mat = new THREE.LineDashedMaterial({
      color: '#475569',
      dashSize: 0.3,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.4,
    });
    const line = new THREE.Line(nominalLineGeom, mat);
    line.computeLineDistances();
    return line;
  }, [nominalLineGeom]);

  const debrisLine = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: '#f43f5e',
      transparent: true,
      opacity: 0.65,
    });
    return new THREE.Line(debrisLineGeom, mat);
  }, [debrisLineGeom]);

  const evasiveLine = useMemo(() => {
    if (!evasiveLineGeom) return null;
    const mat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.9,
    });
    return new THREE.Line(evasiveLineGeom, mat);
  }, [evasiveLineGeom]);

  return (
    <group>
      {/* Nominal Ballistic Line (Dashed Slate) */}
      <primitive object={nominalLine} />

      {/* Debris Trajectory (Red) */}
      <primitive object={debrisLine} />

      {/* Evasive Arc (Bright Cyan) */}
      {evasiveLine && <primitive object={evasiveLine} />}
    </group>
  );
};

// -------------------------------------------------------------
// Interactive 3D Inner Scene Animation
// -------------------------------------------------------------
const SimulationScene: React.FC<{
  deltaV: [number, number, number];
  isEvading: boolean;
  isPlaying: boolean;
  simSpeed: number;
  onTelemetryUpdate: (data: {
    distanceKm: number;
    tcaSeconds: number;
    burnState: 'STANDBY' | 'BURN' | 'COAST' | 'CLOSEST_APPROACH';
    isCloseDanger: boolean;
  }) => void;
}> = ({ deltaV, isEvading, isPlaying, simSpeed, onTelemetryUpdate }) => {
  const cycleTimeRef = useRef(0);
  const [satPos, setSatPos] = useState<[number, number, number]>([-7, 0, 0]);
  const [debPos, setDebPos] = useState<[number, number, number]>([7, 0.04, -0.02]);
  const [burnActive, setBurnActive] = useState(false);
  const [isDanger, setIsDanger] = useState(false);

  // Vector interpretation of deltaV
  const deltaVDirection = useMemo(() => {
    return new THREE.Vector3(deltaV[0], deltaV[1], deltaV[2]);
  }, [deltaV]);

  const dvNorm = useMemo(() => {
    return deltaVDirection.lengthSq() > 0.001
      ? deltaVDirection.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
  }, [deltaVDirection]);

  const dvMagnitude = useMemo(() => {
    return Math.max(0.1, deltaVDirection.length());
  }, [deltaVDirection]);

  const CYCLE_DURATION = 6.0; // seconds for full encounter pass

  useFrame((_, delta) => {
    if (!isPlaying) return;

    cycleTimeRef.current = (cycleTimeRef.current + delta * simSpeed) % CYCLE_DURATION;
    const progress = cycleTimeRef.current / CYCLE_DURATION; // 0 to 1

    // Nominal positions
    const startX = -7.5;
    const endX = 7.5;
    const currentSatX = startX + progress * (endX - startX);
    const currentDebX = endX - progress * (endX - startX);

    // Evasion burn physics
    let curSatY = 0;
    let curSatZ = 0;
    let isBurning = false;
    let burnState: 'STANDBY' | 'BURN' | 'COAST' | 'CLOSEST_APPROACH' = 'STANDBY';

    // Burn occurs between progress 0.20 and 0.48 (just before CPA at 0.50)
    if (isEvading) {
      if (progress >= 0.20 && progress <= 0.48) {
        isBurning = true;
        burnState = 'BURN';
        const burnU = (progress - 0.20) / 0.28;
        const disp = (1.2 + dvMagnitude * 0.35) * (burnU * burnU);
        curSatY = dvNorm.y * disp;
        curSatZ = dvNorm.z * disp;
      } else if (progress > 0.48) {
        burnState = progress >= 0.48 && progress <= 0.54 ? 'CLOSEST_APPROACH' : 'COAST';
        const finalBurnDisp = 1.2 + dvMagnitude * 0.35;
        const coastTime = progress - 0.48;
        const disp = finalBurnDisp + coastTime * (2.0 + dvMagnitude * 0.5);
        curSatY = dvNorm.y * disp;
        curSatZ = dvNorm.z * disp;
      }
    } else {
      if (progress >= 0.47 && progress <= 0.53) {
        burnState = 'CLOSEST_APPROACH';
      }
    }

    const nextSatPos: [number, number, number] = [currentSatX, curSatY, curSatZ];
    const nextDebPos: [number, number, number] = [
      currentDebX,
      0.04,
      -0.02,
    ];

    setSatPos(nextSatPos);
    setDebPos(nextDebPos);
    setBurnActive(isBurning);

    // Physical separation distance calculation
    const dx = nextSatPos[0] - nextDebPos[0];
    const dy = nextSatPos[1] - nextDebPos[1];
    const dz = nextSatPos[2] - nextDebPos[2];
    const simDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Convert simulation distance to real-world kilometers
    // In sim scale, 1 unit = ~1.2 km; close proximity < 0.3 units (< 360m)
    const distanceKm = Math.round(simDist * 1.2 * 100) / 100;
    const isCritical = simDist < 0.35 && !isEvading;
    setIsDanger(isCritical);

    // TCA Countdown (CPA at progress = 0.5)
    const tcaSec = Math.max(0, (0.5 - progress) * CYCLE_DURATION * 8.0);

    onTelemetryUpdate({
      distanceKm,
      tcaSeconds: Math.round(tcaSec * 10) / 10,
      burnState,
      isCloseDanger: isCritical,
    });
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={1.4} castShadow />
      <pointLight position={[-10, -5, -5]} intensity={0.3} color="#38bdf8" />

      {/* Deep Space Starfield Background */}
      <Stars radius={120} depth={60} count={2400} factor={4} saturation={0} fade />

      {/* Subtle Orbital Reference Plane Grid */}
      <gridHelper
        args={[24, 24, '#1e293b', '#0f172a']}
        position={[0, -1.2, 0]}
      />

      {/* Visual Trajectory Rails */}
      <TrajectoryLines
        isEvading={isEvading}
        deltaVDirection={deltaVDirection}
      />

      {/* Satellite Asset */}
      <SatelliteCraft
        position={satPos}
        burnActive={burnActive}
        deltaVDirection={deltaVDirection}
      />

      {/* Debris Fragment Asset */}
      <DebrisObject
        position={debPos}
        isCriticalProximity={isDanger}
      />

      {/* Critical Proximity Shockwave Indicator at CPA when not evading */}
      {isDanger && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.8, 24, 24]} />
          <meshBasicMaterial
            color="#ef4444"
            transparent
            opacity={0.3}
            wireframe
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </>
  );
};

// -------------------------------------------------------------
// Standalone Exported CLMEvasionSim Canvas Component
// -------------------------------------------------------------
export const CLMEvasionSim: React.FC<CLMEvasionSimProps> = ({
  deltaV,
  isEvading,
  className = '',
  actionLabel = 'RETRO-DIVE-042',
  tcaSeconds = 41.8,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [telemetry, setTelemetry] = useState({
    distanceKm: 14.2,
    tcaSeconds: tcaSeconds,
    burnState: 'STANDBY' as 'STANDBY' | 'BURN' | 'COAST' | 'CLOSEST_APPROACH',
    isCloseDanger: false,
  });

  const dvMag = useMemo(() => {
    return Math.sqrt(deltaV[0] * deltaV[0] + deltaV[1] * deltaV[1] + deltaV[2] * deltaV[2]);
  }, [deltaV]);

  return (
    <div
      className={`relative w-full h-full min-h-[380px] bg-zinc-950 rounded-sm overflow-hidden border border-zinc-800 shadow-xl shadow-black/40 select-none font-sans ${className}`}
    >
      {/* 3D React Three Fiber Canvas */}
      <Canvas
        camera={{ position: [0, 5, 11], fov: 42 }}
        className="w-full h-full"
      >
        <SimulationScene
          deltaV={deltaV}
          isEvading={isEvading}
          isPlaying={isPlaying}
          simSpeed={simSpeed}
          onTelemetryUpdate={setTelemetry}
        />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          minDistance={3}
          maxDistance={25}
          maxPolarAngle={Math.PI / 1.7}
        />
      </Canvas>

      {/* Top Left HUD: Real-time Encounter Status & Evasion State */}
      <div className="absolute top-3.5 left-3.5 z-10 flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-950/85 border border-zinc-800  shadow-xl font-mono text-xs text-white">
          <div
            className={`w-2 h-2 rounded-full ${
              isEvading
                ? 'bg-cyan-400 shadow-md '
                : 'bg-rose-500 shadow-md '
            }`}
          />
          <span className="font-bold tracking-wider">
            {isEvading ? 'AUTONOMOUS EVASION ARMED' : 'UNCONTROLLED CONJUNCTION'}
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
              isEvading
                ? 'bg-zinc-950 text-blue-300 border border-cyan-500/40'
                : 'bg-rose-950 text-rose-300 border border-rose-500/40'
            }`}
          >
            {isEvading ? 'CLM ACTIVE' : 'COLLISION RISK'}
          </span>
        </div>

        {/* Burn Phase Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-sm bg-zinc-950 border border-zinc-800  font-mono text-[10px] text-zinc-300">
          <Zap className="w-3 h-3 text-blue-400" />
          <span>FDIR Phase:</span>
          <span
            className={`font-bold uppercase ${
              telemetry.burnState === 'BURN'
                ? 'text-amber-400 '
                : telemetry.burnState === 'CLOSEST_APPROACH'
                ? isEvading
                  ? 'text-emerald-500'
                  : 'text-rose-400'
                : 'text-blue-300'
            }`}
          >
            {telemetry.burnState}
          </span>
          {telemetry.burnState === 'BURN' && (
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce ml-auto" />
          )}
        </div>
      </div>

      {/* Top Right Simulation Playback Toolbar */}
      <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5 pointer-events-auto">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`p-1.5 rounded-sm border font-mono text-xs transition-all flex items-center gap-1 ${
            isPlaying
              ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
              : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
          }`}
          title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => setSimSpeed(simSpeed === 1.0 ? 0.35 : 1.0)}
          className={`px-2 py-1 rounded-sm border font-mono text-[10px] transition-all ${
            simSpeed < 1.0
              ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
          title="Toggle Slow Motion"
        >
          {simSpeed < 1.0 ? '0.35x SLOW' : '1.0x SPEED'}
        </button>

        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-sm bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-400">
          <Maximize2 className="w-3 h-3 text-blue-400" />
          <span>Rotate: Drag • Zoom: Scroll</span>
        </div>
      </div>

      {/* Bottom Floating Telemetry & Clearance Card */}
      <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-auto">
        <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3  shadow-xl shadow-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          {/* Live Separation Clearance */}
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-sm border ${
                telemetry.isCloseDanger
                  ? 'bg-rose-950/80 border-rose-500/80 text-rose-300 '
                  : isEvading
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              {telemetry.isCloseDanger ? (
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
              )}
            </div>

            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                Relative Separation Distance
              </div>
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span
                  className={
                    telemetry.isCloseDanger
                      ? 'text-rose-400 text-lg'
                      : isEvading
                      ? 'text-emerald-500'
                      : 'text-amber-300'
                  }
                >
                  {telemetry.distanceKm.toFixed(2)} km
                </span>
                <span className="text-[10px] font-normal text-zinc-400">
                  ({telemetry.distanceKm < 0.4 ? 'CRITICAL PROXIMITY' : 'NOMINAL CLEARANCE'})
                </span>
              </div>
            </div>
          </div>

          {/* Action Details & Thrust Vector */}
          <div className="flex flex-wrap items-center gap-3 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-2 sm:pt-0 sm:pl-4 text-[11px]">
            <div>
              <span className="text-[9px] text-zinc-500 block uppercase">
                Applied Action ID
              </span>
              <span className="text-blue-300 font-bold">{actionLabel}</span>
            </div>

            <div>
              <span className="text-[9px] text-zinc-500 block uppercase">
                THRUST VECTOR (Δv)
              </span>
              <span className="text-purple-300 font-bold">
                {dvMag.toFixed(2)} m/s
              </span>
              <span className="text-[9px] text-zinc-400 block font-normal">
                [{deltaV.map((v) => v.toFixed(2)).join(', ')}]
              </span>
            </div>

            <div>
              <span className="text-[9px] text-zinc-500 block uppercase">
                TCA Timer
              </span>
              <span className="text-amber-300 font-bold">
                T-{telemetry.tcaSeconds.toFixed(1)}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CLMEvasionSim;
