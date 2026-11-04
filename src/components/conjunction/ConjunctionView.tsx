import React, { useState } from 'react';
import debrisScenariosData from '../../data/debrisScenarios.json';
import { BPlaneViz } from './BPlaneViz';
import { PcGauge } from './PcGauge';
import { StateVectorPanel } from './StateVectorPanel';
import { PcVolatilityChart } from './PcVolatilityChart';
import { TradeSpacePlot } from './TradeSpacePlot';
import { ShieldAlert, Satellite, Target, Flame, ChevronDown } from 'lucide-react';

export interface DebrisScenario {
  id: string;
  name: string;
  timestamp: string;
  primarySatellite: string;
  debris: {
    catalogId: string | null;
    estimatedSize: number;
    relativeVelocity: number;
    type: string;
  };
  conjunction: {
    tca: string;
    missDistance: number;
    pc: number;
    bPlane: {
      xi: number;
      zeta: number;
    };
    relativeStateVector: {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
    };
  };
  maneuver: {
    deltaV: number[];
    burnDuration: number;
    fuelCost: number;
    status: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const scenarios = debrisScenariosData as unknown as DebrisScenario[];

export const ConjunctionView: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(scenarios[0]?.id || 'CONJ-2026-001');

  const activeScenario = scenarios.find((s) => s.id === selectedId) || scenarios[0];

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/50 ';
      case 'high':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    }
  };

  return (
    <div className="w-full space-y-6 text-zinc-100">
      {/* Top Header & Scenario Selection Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5 shadow-xl shadow-black/40 ">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <ShieldAlert className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold tracking-tight text-white uppercase">
                CONJUNCTION ASSESSMENT & COLLISION AVOIDANCE
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-mono">
              REAL-TIME ORBITAL ENCOUNTER TELEMETRY • B-PLANE DISPERSION & FOSTER-HALL RISK PROJECTION
            </p>
          </div>

          {/* Scenario Selector Dropdown */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="appearance-none bg-zinc-900 border border-cyan-700/50 text-zinc-200 text-xs font-mono rounded-sm px-4 py-2.5 pr-9 focus:outline-none focus:border-cyan-400 cursor-pointer shadow-inner"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-900 text-zinc-200">
                    [{s.id}] {s.name.substring(0, 36)}... ({s.severity.toUpperCase()})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-blue-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            <span className={`px-3 py-1.5 rounded-sm text-xs font-mono font-bold uppercase border ${getSeverityBadge(activeScenario.severity)}`}>
              {activeScenario.severity} RISK
            </span>
          </div>
        </div>

        {/* Selected Scenario Metadata Strip */}
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">PRIMARY SATELLITE</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <Satellite className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-zinc-200 font-bold">{activeScenario.primarySatellite}</span>
            </div>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">DEBRIS BODY</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-zinc-200 font-bold">{activeScenario.debris.catalogId || 'UNCATALOGUED'}</span>
            </div>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">ESTIMATED SIZE</span>
            <span className="text-zinc-200 font-bold mt-0.5 block">{activeScenario.debris.estimatedSize} cm ({activeScenario.debris.type})</span>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">PLANNED MANEUVER ΔV</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <Flame className="w-3.5 h-3.5 text-red-400" />
              <span className="text-emerald-500 font-bold">
                {activeScenario.maneuver.burnDuration > 0
                  ? `${activeScenario.maneuver.burnDuration}s burn (${activeScenario.maneuver.fuelCost} kg)`
                  : 'Zero thrust required'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: B-Plane Encounter Visualization */}
        <div className="lg:col-span-6 flex flex-col justify-start">
          <BPlaneViz
            xi={activeScenario.conjunction.bPlane.xi}
            zeta={activeScenario.conjunction.bPlane.zeta}
            missDistance={activeScenario.conjunction.missDistance}
            hardBodyRadius={10}
          />
        </div>

        {/* Right Column: Stacked PcGauge + StateVectorPanel */}
        <div className="lg:col-span-6 flex flex-col space-y-6">
          <PcGauge
            pc={activeScenario.conjunction.pc}
            threshold={1e-4}
            missDistance={activeScenario.conjunction.missDistance}
          />

          <StateVectorPanel
            data={{
              tca: activeScenario.conjunction.tca,
              missDistance: activeScenario.conjunction.missDistance,
              pc: activeScenario.conjunction.pc,
              relativeStateVector: activeScenario.conjunction.relativeStateVector,
              debris: activeScenario.debris,
              primarySatellite: activeScenario.primarySatellite,
              severity: activeScenario.severity,
              maneuver: activeScenario.maneuver,
              bPlane: activeScenario.conjunction.bPlane,
            }}
          />
        </div>
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PcVolatilityChart />
        <TradeSpacePlot />
      </div>
    </div>
  );
};
