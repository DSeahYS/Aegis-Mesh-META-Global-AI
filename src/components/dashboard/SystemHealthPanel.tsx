import React, { useState } from 'react';
import { Cpu, Zap, Radio, Fuel, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import constellationData from '../../data/constellation.json';

export interface ConstellationNode {
  id: string;
  name: string;
  orbitalElements: {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    raan: number;
    argumentOfPerigee: number;
    trueAnomaly: number;
  };
  status: 'nominal' | 'alert' | 'maneuvering' | 'critical' | string;
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

const constellation = constellationData as ConstellationNode[];

const abbreviateProcessor = (procName: string): string => {
  if (procName.includes('PolarFire')) return 'PolarFire SoC';
  if (procName.includes('Myriad')) return 'Myriad X NCS';
  if (procName.includes('SpaceCloud')) return 'SpaceCloud iX5';
  return procName.split(' ')[0] ?? procName;
};

const getProgressBarColor = (value: number, isInverted: boolean = false): string => {
  if (isInverted) {
    // High is bad (e.g. radiation)
    if (value > 80) return 'bg-alert-red';
    if (value >= 50) return 'bg-alert-amber';
    return 'bg-cyber-green';
  }
  // Standard: >80% green, 50-80% yellow, <50% red
  if (value > 80) return 'bg-cyber-green';
  if (value >= 50) return 'bg-alert-amber';
  return 'bg-alert-red';
};

const getTextColor = (value: number, isInverted: boolean = false): string => {
  if (isInverted) {
    if (value > 80) return 'text-alert-red';
    if (value >= 50) return 'text-alert-amber';
    return 'text-cyber-green';
  }
  if (value > 80) return 'text-cyber-green';
  if (value >= 50) return 'text-alert-amber';
  return 'text-alert-red';
};

export const SystemHealthPanel: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'nominal' | 'attention'>('all');

  const statusSummary = {
    nominal: constellation.filter((n) => n.status === 'nominal').length,
    alert: constellation.filter((n) => n.status === 'alert').length,
    maneuvering: constellation.filter((n) => n.status === 'maneuvering').length,
    total: constellation.length,
  };

  const filteredNodes = constellation.filter((node) => {
    if (filter === 'nominal') return node.status === 'nominal';
    if (filter === 'attention') return node.status !== 'nominal';
    return true;
  });

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-space-600 flex flex-wrap items-center justify-between gap-2 bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyber-blue" />
          <h2 className="uppercase text-xs font-semibold tracking-wider text-zinc-400">
            Constellation Health
          </h2>
        </div>

        {/* Status badges & filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] font-mono mr-2">
            <span className="flex items-center gap-1 text-cyber-green">
              <span className="w-2 h-2 rounded-full bg-cyber-green inline-block"></span>
              <span>{statusSummary.nominal} NOM</span>
            </span>
            {statusSummary.alert > 0 && (
              <span className="flex items-center gap-1 text-alert-amber">
                <span className="w-2 h-2 rounded-full bg-alert-amber inline-block "></span>
                <span>{statusSummary.alert} ALR</span>
              </span>
            )}
            {statusSummary.maneuvering > 0 && (
              <span className="flex items-center gap-1 text-cyber-blue">
                <span className="w-2 h-2 rounded-full bg-cyber-blue inline-block "></span>
                <span>{statusSummary.maneuvering} MNV</span>
              </span>
            )}
          </div>

          <div className="inline-flex rounded border border-space-600 p-0.5 bg-zinc-900/60 text-[10px] font-mono">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'all'
                  ? 'bg-space-700 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilter('attention')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'attention'
                  ? 'bg-alert-amber/20 text-alert-amber font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ACTIVE ({statusSummary.alert + statusSummary.maneuvering})
            </button>
          </div>
        </div>
      </div>

      {/* Satellite Node Mini-Cards Grid */}
      <div className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
          {filteredNodes.map((node) => {
            const isNominal = node.status === 'nominal';
            const isAlert = node.status === 'alert';
            const isManeuvering = node.status === 'maneuvering';

            // Radiation max scale reference: 3.0 krad safe LEO benchmark
            const radPercent = Math.min(100, Math.round((node.health.radiationDose / 3.0) * 100));

            return (
              <div
                key={node.id}
                className={`p-2.5 rounded-sm border transition-all duration-200 flex flex-col justify-between ${
                  isAlert
                    ? 'bg-zinc-900/90 border-alert-amber/60 shadow-md ring-1 ring-alert-amber/30'
                    : isManeuvering
                    ? 'bg-zinc-900/90 border-cyber-blue/60 shadow-md ring-1 ring-cyber-blue/30'
                    : isNominal
                    ? 'bg-zinc-900/50 border-space-600 hover:border-space-500/80 hover:bg-zinc-900/70'
                    : 'bg-zinc-900/50 border-space-600'
                }`}
              >
                {/* Node Card Header */}
                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-space-700/60">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Status Dot */}
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      {!isNominal && (
                        <span
                          className={` absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            isAlert ? 'bg-alert-amber' : 'bg-cyber-blue'
                          }`}
                        ></span>
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                          isNominal
                            ? 'bg-cyber-green'
                            : isAlert
                            ? 'bg-alert-amber'
                            : 'bg-cyber-blue'
                        }`}
                      ></span>
                    </span>

                    <span className="font-mono font-bold text-xs text-zinc-100 tracking-tight truncate">
                      {node.id}
                    </span>
                    <span className="text-[10px] text-zinc-400 truncate max-w-[65px]">
                      {node.name.replace(' Node', '')}
                    </span>
                  </div>

                  {/* Processor Badge */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-space-800 text-zinc-300 border border-space-700">
                      {abbreviateProcessor(node.hardware.processor)}
                    </span>
                  </div>
                </div>

                {/* Status indicator line if non-nominal */}
                {!isNominal && (
                  <div className="mb-2 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase flex items-center justify-between bg-space-800/80 border border-space-700">
                    <span className="flex items-center gap-1">
                      {isAlert ? (
                        <AlertTriangle className="w-2.5 h-2.5 text-alert-amber" />
                      ) : (
                        <Radio className="w-2.5 h-2.5 text-cyber-blue" />
                      )}
                      <span className={isAlert ? 'text-alert-amber font-semibold' : 'text-cyber-blue font-semibold'}>
                        {node.status}
                      </span>
                    </span>
                    <span className="text-zinc-400 text-[9px]">ATTENTION REQUIRED</span>
                  </div>
                )}

                {/* 4 Telemetry Progress Bars */}
                <div className="space-y-1.5 text-[10px] font-mono">
                  {/* 1. Power Level */}
                  <div>
                    <div className="flex justify-between items-center text-zinc-400 mb-0.5">
                      <span className="flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-zinc-400" />
                        Power
                      </span>
                      <span className={`font-semibold ${getTextColor(node.health.powerLevel)}`}>
                        {node.health.powerLevel.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-space-700/80 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                          node.health.powerLevel
                        )}`}
                        style={{ width: `${Math.min(100, node.health.powerLevel)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 2. Radiation Dose (Inverted: high is bad) */}
                  <div>
                    <div className="flex justify-between items-center text-zinc-400 mb-0.5">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5 text-zinc-400" />
                        Rad Dose
                      </span>
                      <span className={`font-semibold ${getTextColor(radPercent, true)}`}>
                        {node.health.radiationDose.toFixed(2)} krad
                      </span>
                    </div>
                    <div className="w-full bg-space-700/80 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                          radPercent,
                          true
                        )}`}
                        style={{ width: `${radPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 3. Compute Load */}
                  <div>
                    <div className="flex justify-between items-center text-zinc-400 mb-0.5">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-2.5 h-2.5 text-zinc-400" />
                        Compute
                      </span>
                      <span className={`font-semibold ${getTextColor(node.health.computeLoad)}`}>
                        {node.health.computeLoad.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-space-700/80 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                          node.health.computeLoad
                        )}`}
                        style={{ width: `${Math.min(100, node.health.computeLoad)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 4. Fuel Remaining */}
                  <div>
                    <div className="flex justify-between items-center text-zinc-400 mb-0.5">
                      <span className="flex items-center gap-1">
                        <Fuel className="w-2.5 h-2.5 text-zinc-400" />
                        Propellant
                      </span>
                      <span className={`font-semibold ${getTextColor(node.health.fuelRemaining)}`}>
                        {node.health.fuelRemaining.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-space-700/80 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                          node.health.fuelRemaining
                        )}`}
                        style={{ width: `${Math.min(100, node.health.fuelRemaining)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SystemHealthPanel;
