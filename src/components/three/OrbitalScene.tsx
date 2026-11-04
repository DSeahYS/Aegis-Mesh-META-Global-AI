import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Layers,
  Radio,
  RotateCcw,
  Sparkles,
  Filter,
  Check,
  Flame,
  ChevronDown,
  ChevronUp,
  X,
  Search,
} from 'lucide-react';

import constellationRaw from '../../data/constellation.json';
import {
  SCALE_FACTOR,
  EARTH_MU,
  type OrbitalElements,
  type SatelliteStatus,
} from '../../lib/constants';
import { keplerianToCartesian } from '../../lib/orbitalMechanics';
import { useSimulationStore } from '../../store/simulationStore';

import Earth from './Earth';
import SatelliteNode from './SatelliteNode';
import SatelliteSwarm, { type SwarmSatellite } from './SatelliteSwarm';
import DebrisField, { type DebrisParticleInfo } from './DebrisField';
import OrbitRing from './OrbitRing';
import ISLLink from './ISLLink';
import ConjunctionEvent from './ConjunctionEvent';
import ManeuverTrail from './ManeuverTrail';
import EntitySearch from './EntitySearch';

// Inline Keplerian Math Fallback in case external module is unavailable
function fallbackKeplerian(
  elements: OrbitalElements,
  mu: number = EARTH_MU
): { position: [number, number, number]; velocity: [number, number, number] } {
  const a = elements.semiMajorAxis;
  const e = elements.eccentricity;
  const i = elements.inclination;
  const raan = elements.raan;
  const omega = elements.argPerigee ?? elements.argumentOfPerigee ?? 0;
  const nu = elements.trueAnomaly;

  const sinNu = Math.sin(nu);
  const cosNu = Math.cos(nu);
  const sqrtOneMinusESq = Math.sqrt(Math.max(0, 1 - e * e));

  const sinE = (sqrtOneMinusESq * sinNu) / (1 + e * cosNu);
  const cosE = (e + cosNu) / (1 + e * cosNu);
  const E = Math.atan2(sinE, cosE);

  const r = a * (1 - e * Math.cos(E));
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * sqrtOneMinusESq * Math.sin(E);

  const nA = Math.sqrt(mu * a);
  const vxOrb = (-nA * Math.sin(E)) / r;
  const vyOrb = (nA * sqrtOneMinusESq * Math.cos(E)) / r;

  const cosRaan = Math.cos(raan);
  const sinRaan = Math.sin(raan);
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const cosInc = Math.cos(i);
  const sinInc = Math.sin(i);

  const px = cosRaan * cosOmega - sinRaan * sinOmega * cosInc;
  const py = sinRaan * cosOmega + cosRaan * sinOmega * cosInc;
  const pz = sinOmega * sinInc;

  const qx = -cosRaan * sinOmega - sinRaan * cosOmega * cosInc;
  const qy = -sinRaan * sinOmega + cosRaan * cosOmega * cosInc;
  const qz = cosOmega * sinInc;

  return {
    position: [
      xOrb * px + yOrb * qx,
      xOrb * py + yOrb * qy,
      xOrb * pz + yOrb * qz,
    ],
    velocity: [
      vxOrb * px + vyOrb * qx,
      vxOrb * py + vyOrb * qy,
      vxOrb * pz + vyOrb * qz,
    ],
  };
}

// Convert degrees to radians helper
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

interface SatelliteData {
  id: string;
  name: string;
  elements: OrbitalElements;
  status: SatelliteStatus;
  hardware: {
    processor: string;
    power: number;
    memory: number;
  };
  health: {
    powerLevel: number;
    radiationDose: number;
    computeLoad: number;
    fuelRemaining: number;
  };
}

export interface OrbitalSceneProps {
  activeCatalogs?: string[];
  className?: string;
}

// Catalog options for dynamic UI filtering
const DEBRIS_CATALOG_OPTIONS = [
  {
    id: 'cosmos-1408',
    name: 'Cosmos-1408 ASAT Swarm',
    count: 3,
    color: '#f97316',
    dangerLevel: 'HIGH',
    alt: '485 km (82.6°)',
  },
  {
    id: 'fengyun-1c',
    name: 'Fengyun-1C Breakup Ring',
    count: 1984,
    color: '#ff3355',
    dangerLevel: 'CRITICAL',
    alt: '865 km (98.6°)',
  },
  {
    id: 'iridium-33',
    name: 'Iridium-33 Collision Remnants',
    count: 110,
    color: '#fbbf24',
    dangerLevel: 'HIGH',
    alt: '790 km (86.4°)',
  },
  {
    id: 'cosmos-2251',
    name: 'Cosmos-2251 Remnants',
    count: 586,
    color: '#fb923c',
    dangerLevel: 'HIGH',
    alt: '790 km (74.0°)',
  },
  {
    id: 'sl-16',
    name: 'SL-16 Derelict Stages',
    count: 294,
    color: '#d946ef',
    dangerLevel: 'ELEVATED',
    alt: '600-950 km (71.0°)',
  },
  {
    id: 'leo-general',
    name: 'USSPACECOM Cataloged Debris',
    count: 1998,
    color: '#38bdf8',
    dangerLevel: 'MODERATE',
    alt: '350-1400 km',
  },
];

// Inner 3D Scene executing useFrame and rendering all orbital assets
const SceneContent: React.FC<{
  showOrbits: boolean;
  showDebris: boolean;
  showLinks: boolean;
  showSwarm: boolean;
  isPropagating: boolean;
  activeCatalogs: string[];
  onSatelliteHover: (sat: SwarmSatellite | null) => void;
  onParticleHover: (debris: DebrisParticleInfo | null) => void;
}> = ({
  showOrbits,
  showDebris,
  showLinks,
  showSwarm,
  isPropagating,
  activeCatalogs,
  onSatelliteHover,
  onParticleHover,
}) => {
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId);
  const selectSatellite = useSimulationStore((s) => s.selectSatellite);

  // Normalized Constellation data for 12 primary AEGIS command nodes
  const initialSats: SatelliteData[] = useMemo(() => {
    return (constellationRaw as any[]).map((raw) => {
      const el = raw.orbitalElements;
      return {
        id: raw.id,
        name: raw.name,
        status: (raw.id === 'AEGIS-04' ? 'critical' : raw.status || 'nominal') as SatelliteStatus,
        hardware: raw.hardware,
        health: raw.health,
        elements: {
          semiMajorAxis: el.semiMajorAxis,
          eccentricity: el.eccentricity,
          inclination: toRadians(el.inclination),
          raan: toRadians(el.raan),
          argPerigee: toRadians(el.argumentOfPerigee ?? el.argPerigee ?? 0),
          trueAnomaly: toRadians(el.trueAnomaly),
        },
      };
    });
  }, []);

  // Compute unique orbital planes for rendering OrbitRings
  const uniquePlanes = useMemo(() => {
    const map = new Map<string, OrbitalElements>();
    initialSats.forEach((sat) => {
      const key = `${sat.elements.raan.toFixed(3)}_${sat.elements.inclination.toFixed(3)}`;
      if (!map.has(key)) {
        map.set(key, sat.elements);
      }
    });
    return Array.from(map.values());
  }, [initialSats]);

  // Dynamic positions state updated in useFrame
  const [satellitePositions, setSatellitePositions] = useState<Map<string, [number, number, number]>>(() => {
    const map = new Map<string, [number, number, number]>();
    initialSats.forEach((sat) => {
      let cart;
      try {
        cart = keplerianToCartesian(sat.elements);
      } catch {
        cart = fallbackKeplerian(sat.elements);
      }
      map.set(sat.id, [
        cart.position[0] * SCALE_FACTOR,
        cart.position[1] * SCALE_FACTOR,
        cart.position[2] * SCALE_FACTOR,
      ]);
    });
    return map;
  });

  // Track simulation delta for smooth propagation
  const simTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!isPropagating) return;

    // Advance orbital anomalies slightly each frame (60x time speed)
    simTimeRef.current += delta * 60;
    const tSec = simTimeRef.current;

    const nextMap = new Map<string, [number, number, number]>();

    initialSats.forEach((sat) => {
      const a = sat.elements.semiMajorAxis;
      const n = Math.sqrt(EARTH_MU / Math.pow(a, 3));
      const currentNu = (sat.elements.trueAnomaly + n * tSec) % (2 * Math.PI);

      let cart;
      try {
        cart = keplerianToCartesian({ ...sat.elements, trueAnomaly: currentNu });
      } catch {
        cart = fallbackKeplerian({ ...sat.elements, trueAnomaly: currentNu });
      }

      nextMap.set(sat.id, [
        cart.position[0] * SCALE_FACTOR,
        cart.position[1] * SCALE_FACTOR,
        cart.position[2] * SCALE_FACTOR,
      ]);
    });

    setSatellitePositions(nextMap);
  });

  // Mesh Topology Links (Intra-plane and Inter-plane laser crosslinks)
  const meshLinks = useMemo(() => {
    return [
      // Plane 1 intra-plane rings
      { from: 'AEGIS-01', to: 'AEGIS-02', qkdSecured: true, active: true },
      { from: 'AEGIS-02', to: 'AEGIS-03', qkdSecured: false, active: true },
      { from: 'AEGIS-03', to: 'AEGIS-04', qkdSecured: true, active: true },
      { from: 'AEGIS-04', to: 'AEGIS-01', qkdSecured: false, active: true },

      // Plane 2 intra-plane rings
      { from: 'AEGIS-05', to: 'AEGIS-06', qkdSecured: true, active: true },
      { from: 'AEGIS-06', to: 'AEGIS-07', qkdSecured: false, active: true },
      { from: 'AEGIS-07', to: 'AEGIS-08', qkdSecured: true, active: true },
      { from: 'AEGIS-08', to: 'AEGIS-05', qkdSecured: false, active: true },

      // Plane 3 intra-plane rings
      { from: 'AEGIS-09', to: 'AEGIS-10', qkdSecured: true, active: true },
      { from: 'AEGIS-10', to: 'AEGIS-11', qkdSecured: false, active: true },
      { from: 'AEGIS-11', to: 'AEGIS-12', qkdSecured: true, active: true },
      { from: 'AEGIS-12', to: 'AEGIS-09', qkdSecured: false, active: true },

      // Inter-plane crosslinks
      { from: 'AEGIS-01', to: 'AEGIS-05', qkdSecured: true, active: true },
      { from: 'AEGIS-02', to: 'AEGIS-06', qkdSecured: false, active: true },
      { from: 'AEGIS-03', to: 'AEGIS-07', qkdSecured: true, active: true },
      { from: 'AEGIS-04', to: 'AEGIS-08', qkdSecured: true, active: true },

      { from: 'AEGIS-05', to: 'AEGIS-09', qkdSecured: false, active: true },
      { from: 'AEGIS-06', to: 'AEGIS-10', qkdSecured: true, active: true },
      { from: 'AEGIS-07', to: 'AEGIS-11', qkdSecured: false, active: true },
      { from: 'AEGIS-08', to: 'AEGIS-12', qkdSecured: true, active: true },

      { from: 'AEGIS-09', to: 'AEGIS-01', qkdSecured: true, active: true },
      { from: 'AEGIS-10', to: 'AEGIS-02', qkdSecured: false, active: true },
      { from: 'AEGIS-11', to: 'AEGIS-03', qkdSecured: true, active: true },
      { from: 'AEGIS-12', to: 'AEGIS-04', qkdSecured: true, active: true },
    ];
  }, []);

  // Primary Conjunction Threat at AEGIS-04
  const aegis04Pos = satellitePositions.get('AEGIS-04') || [5, 2, 4];
  const conjunctionPos: [number, number, number] = [
    aegis04Pos[0] + 0.18,
    aegis04Pos[1] + 0.08,
    aegis04Pos[2] - 0.12,
  ];

  return (
    <>
      {/* Central Realistic Earth */}
      <Earth />

      {/* Unique Orbital Plane Tracks */}
      {showOrbits &&
        uniquePlanes.map((plane, index) => {
          const planeColors = ['#38bdf8', '#818cf8', '#34d399'];
          return (
            <OrbitRing
              key={`orbit-plane-${index}`}
              orbitalElements={plane}
              color={planeColors[index % planeColors.length]}
              opacity={0.3}
              lineWidth={1.2}
            />
          );
        })}

      {/* Upgraded 20,000+ Particle Debris Field with dynamic catalog filtering */}
      <DebrisField
        activeCatalogs={activeCatalogs}
        isPropagating={isPropagating}
        visible={showDebris}
        onParticleHover={onParticleHover}
      />

      {/* 10,000-Node Mega-Constellation Satellite Swarm via InstancedMesh */}
      <SatelliteSwarm
        isPropagating={isPropagating}
        visible={showSwarm}
        onSatelliteHover={onSatelliteHover}
      />

      {/* Laser Inter-Satellite Links (ISL) */}
      {showLinks &&
        meshLinks.map((link, idx) => {
          const pStart = satellitePositions.get(link.from);
          const pEnd = satellitePositions.get(link.to);
          if (!pStart || !pEnd) return null;

          return (
            <ISLLink
              key={`isl-${link.from}-${link.to}-${idx}`}
              start={pStart}
              end={pEnd}
              active={link.active}
              qkdSecured={link.qkdSecured}
            />
          );
        })}

      {/* Primary 12 AEGIS Constellation Satellites */}
      {initialSats.map((sat) => {
        const pos = satellitePositions.get(sat.id) || [0, 0, 0];
        const isSel = selectedSatelliteId === sat.id;

        return (
          <SatelliteNode
            key={sat.id}
            id={sat.id}
            name={sat.name}
            status={sat.status}
            position={pos}
            isSelected={isSel}
            orbitalElements={sat.elements}
            hardware={sat.hardware}
            health={sat.health}
            onClick={() => {
              selectSatellite(isSel ? null : sat.id);
            }}
          />
        );
      })}

      {/* Active Conjunction Threat at AEGIS-04 */}
      <ConjunctionEvent
        position={conjunctionPos}
        severity="critical"
        active={true}
        missDistance={0.18}
        pc={0.0028}
        label="TCA: 41.8s (DEB-2024-981A)"
      />

      {/* Autonomous Avoidance Delta-V Thrust Vector for Maneuvering Satellites */}
      {initialSats
        .filter((s) => s.status === 'maneuvering' || s.id === 'AEGIS-04')
        .map((sat) => {
          const pos = satellitePositions.get(sat.id);
          if (!pos) return null;
          return (
            <ManeuverTrail
              key={`maneuver-${sat.id}`}
              startPosition={pos}
              deltaV={[-0.3, 0.45, 0.2]}
              active={true}
            />
          );
        })}
    </>
  );
};

export const OrbitalScene: React.FC<OrbitalSceneProps> = ({
  activeCatalogs: propActiveCatalogs,
  className = '',
}) => {
  const [showOrbits, setShowOrbits] = useState(true);
  const [showDebris, setShowDebris] = useState(true);
  const [showSwarm, setShowSwarm] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [isPropagating, setIsPropagating] = useState(true);
  const [isCatalogMenuOpen, setIsCatalogMenuOpen] = useState(false);
  const [debrisSearchQuery, setDebrisSearchQuery] = useState('');

  // Hovered tactical info
  const [hoveredSwarmSat, setHoveredSwarmSat] = useState<SwarmSatellite | null>(null);
  const [hoveredDebris, setHoveredDebris] = useState<DebrisParticleInfo | null>(null);

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId);
  const selectSatellite = useSimulationStore((s) => s.selectSatellite);
  const storeActiveCatalogs = useSimulationStore((s) => s.activeCatalogs);
  const toggleCatalog = useSimulationStore((s) => s.toggleCatalog);

  // Effective active catalogs (prop overrides store, with resilient fallback)
  const activeCatalogs = useMemo(() => {
    if (propActiveCatalogs && propActiveCatalogs.length > 0) {
      return propActiveCatalogs;
    }
    if (storeActiveCatalogs && storeActiveCatalogs.length > 0) {
      return storeActiveCatalogs;
    }
    return ['cosmos-1408', 'fengyun-1c', 'uncatalogued', 'iridium-33'];
  }, [propActiveCatalogs, storeActiveCatalogs]);

  // Filtered debris catalogs for the searchable catalog panel
  const filteredCatalogOptions = useMemo(() => {
    if (!debrisSearchQuery.trim()) return DEBRIS_CATALOG_OPTIONS;
    const q = debrisSearchQuery.toLowerCase().trim();
    return DEBRIS_CATALOG_OPTIONS.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.id.toLowerCase().includes(q) ||
        cat.alt.toLowerCase().includes(q) ||
        cat.dangerLevel.toLowerCase().includes(q)
    );
  }, [debrisSearchQuery]);

  // Selected Satellite details lookup
  const selectedSatData = useMemo(() => {
    if (!selectedSatelliteId) return null;
    return (constellationRaw as any[]).find((s) => s.id === selectedSatelliteId);
  }, [selectedSatelliteId]);

  // Calculate live object counts
  const objectMetrics = useMemo(() => {
    const aegisCount = 12;
    const swarmCount = showSwarm ? 8500 : 0;
    let debrisCount = 0;

    if (showDebris) {
      for (const cat of DEBRIS_CATALOG_OPTIONS) {
        if (
          activeCatalogs.some(
            (c) =>
              c.toLowerCase() === cat.id ||
              c.toLowerCase().includes(cat.id) ||
              cat.id.includes(c.toLowerCase()) ||
              c.toLowerCase() === 'all'
          )
        ) {
          debrisCount += cat.count;
        }
      }
      if (debrisCount === 0) {
        // Fallback default active debris count
        debrisCount = 27000;
      }
    }

    const total = aegisCount + swarmCount + debrisCount;
    return { aegisCount, swarmCount, debrisCount, total };
  }, [showSwarm, showDebris, activeCatalogs]);

  const handleResetCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }, []);

  return (
    <div
      className={`relative w-full h-full min-h-[550px] bg-zinc-950 overflow-hidden select-none font-sans ${className}`}
    >
      {/* Top Aerospace HUD Status Bar */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-auto max-w-sm sm:max-w-md">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-sm bg-zinc-900 border-b-2 border-b-slate-950 border border-zinc-800  shadow-xl shadow-black/50 text-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400  shadow-md" />
            <span className="text-xs font-sans font-semibold tracking-tight text-zinc-100">
              AEGIS-MESH 3D COMMAND
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-zinc-700/80 pl-2 text-[10px] font-sans text-zinc-400">
            <span className="text-emerald-500 font-semibold">12/12</span> NODES
            <span className="text-zinc-600">•</span>
            <span className="text-blue-400 font-semibold">
              {objectMetrics.swarmCount.toLocaleString()}
            </span>{' '}
            SWARM
            <span className="text-zinc-600">•</span>
            <span className="text-amber-400 font-semibold">
              {objectMetrics.debrisCount.toLocaleString()}
            </span>{' '}
            DEBRIS
          </div>
        </div>

        {/* Total High-Performance Object Counter Banner */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-sm bg-zinc-950 border border-zinc-700  shadow-lg text-[11px] font-sans text-zinc-300">
          <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>TOTAL OBJECTS TRACKED:</span>
          <span className="font-bold text-white text-xs tracking-wider">
            {objectMetrics.total.toLocaleString()}
          </span>
          <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded bg-zinc-950 text-blue-400 border border-cyan-700/50">
            60 FPS GPU
          </span>
        </div>
      </div>

      {/* Global Orbital Entity Search Bar */}
      <EntitySearch
        onSelectSatellite={selectSatellite}
        onActivateCatalog={toggleCatalog}
      />

      {/* Top Right View Controls & Layer Toggles */}
      <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-1.5 pointer-events-auto">
        <button
          onClick={() => setShowOrbits(!showOrbits)}
          className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm border transition-all ${
            showOrbits
              ? 'bg-blue-600 text-white border-blue-600 shadow-inner'
              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
          }`}
        >
          Orbits
        </button>

        <button
          onClick={() => setShowLinks(!showLinks)}
          className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm border transition-all ${
            showLinks
              ? 'bg-blue-600 text-white border-blue-600 shadow-inner'
              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
          }`}
        >
          ISL Links
        </button>

        {/* 10,000 Sat Swarm Toggle */}
        <button
          onClick={() => setShowSwarm(!showSwarm)}
          className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm border transition-all flex items-center gap-1.5 ${
            showSwarm
              ? 'bg-slate-700 text-white border-slate-600'
              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
          }`}
        >
          <Radio className="w-3 h-3 text-emerald-500" />
          <span>Swarm (8.5k)</span>
        </button>

        {/* 20,000+ Debris Field Toggle */}
        <button
          onClick={() => setShowDebris(!showDebris)}
          className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm border transition-all flex items-center gap-1.5 ${
            showDebris
              ? 'bg-slate-700 text-white border-slate-600'
              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
          }`}
        >
          <Flame className="w-3 h-3 text-rose-400" />
          <span>Debris (27k)</span>
        </button>

        {/* Catalog Selector Dropdown Button */}
        <button
          onClick={() => setIsCatalogMenuOpen(!isCatalogMenuOpen)}
          className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm border transition-all flex items-center gap-1.5 ${
            isCatalogMenuOpen
              ? 'bg-slate-700 text-white border-slate-600'
              : 'bg-zinc-900 text-purple-300 border-purple-500/40 hover:bg-zinc-800'
          }`}
        >
          <Filter className="w-3 h-3 text-purple-400" />
          <span>Catalogs</span>
          {isCatalogMenuOpen ? (
            <ChevronUp className="w-3 h-3 text-purple-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-purple-400" />
          )}
        </button>

        {/* Motion Playback Toggle */}
        <button
          onClick={() => setIsPropagating(!isPropagating)}
          className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm border transition-all ${
            isPropagating
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
          }`}
        >
          {isPropagating ? 'Motion ON' : 'Motion PAUSED'}
        </button>

        <button
          onClick={handleResetCamera}
          title="Reset OrbitControls"
          className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-sm bg-zinc-900 text-zinc-300 border border-zinc-700 hover:bg-zinc-800 transition-all flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Dynamic Searchable Catalog Filter Popover Drawer */}
      {isCatalogMenuOpen && (
        <div className="absolute top-14 right-4 z-20 w-80 rounded-sm bg-zinc-900 border-b-2 border-b-slate-950 border border-purple-500/40  shadow-xl shadow-black/50 p-3.5 text-xs text-zinc-200 pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="font-mono font-bold text-zinc-100">
                ORBITAL DEBRIS CATALOGS
              </span>
            </div>
            <button
              onClick={() => setIsCatalogMenuOpen(false)}
              className="text-zinc-400 hover:text-zinc-100 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Bar for Filtering Catalogs */}
          <div className="mt-2.5 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={debrisSearchQuery}
              onChange={(e) => setDebrisSearchQuery(e.target.value)}
              placeholder="Search catalogs, threats, altitudes..."
              className="w-full pl-8 pr-7 py-1.5 bg-zinc-950 border border-zinc-800 rounded-sm text-xs font-mono text-zinc-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/60"
            />
            {debrisSearchQuery && (
              <button
                onClick={() => setDebrisSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {filteredCatalogOptions.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 font-mono text-[11px]">
                No debris catalogs match &quot;{debrisSearchQuery}&quot;
              </div>
            ) : (
              filteredCatalogOptions.map((cat) => {
                const isActive = activeCatalogs.some(
                  (c) =>
                    c.toLowerCase() === cat.id ||
                    c.toLowerCase().includes(cat.id) ||
                    cat.id.includes(c.toLowerCase()) ||
                    c.toLowerCase() === 'all'
                );

                return (
                  <div
                    key={cat.id}
                    onClick={() => toggleCatalog(cat.id)}
                    className={`p-2 rounded-sm border cursor-pointer transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-zinc-950 border-zinc-700 text-zinc-100'
                        : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div>
                        <div className="font-mono font-semibold text-[11px] leading-tight">
                          {cat.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {cat.alt}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-[11px]">
                        {cat.count.toLocaleString()}
                      </span>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isActive
                            ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                            : 'border-zinc-700 text-transparent'
                        }`}
                      >
                        {isActive && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-zinc-800 flex items-center justify-between text-[10px] font-sans text-zinc-400">
            <span>Dynamic GPU Instanced Splatting</span>
            <span className="text-purple-400 font-semibold">ORDEM 3.2 Standard</span>
          </div>
        </div>
      )}

      {/* Selected AEGIS Satellite Telemetry Floating Drawer */}
      {selectedSatData && (
        <div className="absolute bottom-4 left-4 z-10 w-72 sm:w-80 rounded-sm bg-zinc-900 border border-zinc-700/80  shadow-xl shadow-black/50 p-3.5 text-xs text-zinc-200 pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-mono font-bold text-sm text-zinc-100">
                {selectedSatData.id}
              </span>
              <span className="text-[11px] text-zinc-400">({selectedSatData.name})</span>
            </div>
            <button
              onClick={() => selectSatellite(null)}
              className="text-zinc-400 hover:text-zinc-100 px-1 font-mono text-sm"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px] font-mono">
            <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
              <div className="text-zinc-400 text-[10px]">SEMI-MAJOR AXIS</div>
              <div className="text-blue-300 font-semibold">
                {selectedSatData.orbitalElements.semiMajorAxis} km
              </div>
            </div>
            <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
              <div className="text-zinc-400 text-[10px]">INCLINATION</div>
              <div className="text-blue-300 font-semibold">
                {selectedSatData.orbitalElements.inclination}°
              </div>
            </div>
            <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
              <div className="text-zinc-400 text-[10px]">POWER LEVEL</div>
              <div className="text-emerald-500 font-semibold">
                {selectedSatData.health.powerLevel}%
              </div>
            </div>
            <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
              <div className="text-zinc-400 text-[10px]">FUEL REMAINING</div>
              <div className="text-emerald-500 font-semibold">
                {selectedSatData.health.fuelRemaining}%
              </div>
            </div>
          </div>

          <div className="mt-2 text-[10px] text-zinc-400 font-mono">
            PROCESSOR:{' '}
            <span className="text-zinc-200">{selectedSatData.hardware.processor}</span>
          </div>
        </div>
      )}

      {/* Hovered Debris / Swarm Object Tactical Inspector Chip */}
      {(hoveredDebris || hoveredSwarmSat) && (
        <div className="absolute bottom-4 right-4 z-10 px-3.5 py-2.5 rounded-sm bg-zinc-900 border-b-2 border-b-slate-950 border border-zinc-700/80  shadow-xl shadow-black/50 text-xs font-mono pointer-events-none max-w-sm">
          {hoveredDebris ? (
            <div className="flex items-start gap-2.5">
              <div
                className="w-2 h-2 rounded-full mt-1 shrink-0 shadow-sm"
                style={{ backgroundColor: hoveredDebris.color }}
              />
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-100 font-bold text-xs tracking-wider">
                    {hoveredDebris.objectId}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    ({hoveredDebris.catalogName})
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                  <span>
                    THREAT: <span className="text-rose-400 font-bold">{hoveredDebris.dangerLevel}</span>
                  </span>
                  <span>•</span>
                  <span>
                    ALT: <span className="text-blue-300 font-semibold">{hoveredDebris.altitudeKm} km</span>
                  </span>
                  <span>•</span>
                  <span>
                    INC: <span className="text-zinc-200 font-semibold">{hoveredDebris.inclinationDeg}°</span>
                  </span>
                  <span>•</span>
                  <span>
                    VEL: <span className="text-emerald-500 font-semibold">{hoveredDebris.velocityKmS} km/s</span>
                  </span>
                </div>
              </div>
            </div>
          ) : hoveredSwarmSat ? (
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-cyan-400 " />
              <div>
                <div className="text-zinc-100 font-semibold text-[11px]">
                  {hoveredSwarmSat.id}
                </div>
                <div className="text-[10px] text-zinc-300 flex items-center gap-2 mt-0.5">
                  <span>{hoveredSwarmSat.constellation || 'Mega-Constellation'}</span>
                  <span>•</span>
                  <span>Alt: {hoveredSwarmSat.altitudeKm ?? 550} km</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Main 3D React Three Fiber Canvas */}
      <Canvas
        camera={{ position: [0, 16, 26], fov: 45, near: 0.1, far: 2000 }}
        className="w-full h-full"
      >
        {/* Deep space ambient lighting for realistic contrast */}
        <ambientLight intensity={0.14} color="#091428" />

        {/* Primary Warm Directional Sunlight simulating solar flux */}
        <directionalLight
          position={[45, 20, 35]}
          intensity={2.4}
          color="#fffcf5"
          castShadow
        />

        {/* Realistic Earth Atmosphere Rim Light (Cyan/Electric Blue Earthshine) */}
        <directionalLight
          position={[-40, -15, -25]}
          intensity={0.45}
          color="#38bdf8"
        />

        {/* Soft Cosmic Fill Light from deep space */}
        <directionalLight
          position={[0, 35, -30]}
          intensity={0.2}
          color="#4f46e5"
        />

        {/* Layer 1: Dense Distant Galactic Starfield */}
        <Stars
          radius={160}
          depth={90}
          count={9500}
          factor={3.2}
          saturation={0.15}
          fade
          speed={0.4}
        />

        {/* Layer 2: Nearby Bright Navigational Celestial Reference Stars */}
        <Stars
          radius={90}
          depth={45}
          count={2200}
          factor={6.0}
          saturation={0.3}
          fade
          speed={0.8}
        />

        {/* Camera Orbit Controls */}
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.06}
          autoRotate={false}
          minDistance={7.5}
          maxDistance={90}
        />

        {/* Three.js Orbital Scene Objects */}
        <SceneContent
          showOrbits={showOrbits}
          showDebris={showDebris}
          showLinks={showLinks}
          showSwarm={showSwarm}
          isPropagating={isPropagating}
          activeCatalogs={activeCatalogs}
          onSatelliteHover={setHoveredSwarmSat}
          onParticleHover={setHoveredDebris}
        />
      </Canvas>
    </div>
  );
};

export default OrbitalScene;
