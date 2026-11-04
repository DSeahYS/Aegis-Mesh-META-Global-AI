import React, { useState, useMemo } from 'react';
import { ShieldAlert, ArrowUpDown, ArrowUp, ArrowDown, AlertOctagon } from 'lucide-react';
import debrisScenariosData from '../../data/debrisScenarios.json';

export interface DebrisConjunction {
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
    deltaV: [number, number, number];
    burnDuration: number;
    fuelCost: number;
    status: 'planned' | 'executed' | 'aborted' | string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const debrisScenarios = debrisScenariosData as DebrisConjunction[];

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type SortField = 'severity' | 'missDistance' | 'pc' | 'id';
type SortDirection = 'asc' | 'desc';

export const ThreatMatrix: React.FC = () => {
  const [sortField, setSortField] = useState<SortField>('severity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedScenarios = useMemo(() => {
    return [...debrisScenarios].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'severity') {
        comparison = (SEVERITY_WEIGHTS[a.severity] ?? 0) - (SEVERITY_WEIGHTS[b.severity] ?? 0);
      } else if (sortField === 'missDistance') {
        comparison = a.conjunction.missDistance - b.conjunction.missDistance;
      } else if (sortField === 'pc') {
        comparison = a.conjunction.pc - b.conjunction.pc;
      } else if (sortField === 'id') {
        comparison = a.id.localeCompare(b.id);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [sortField, sortDirection]);

  const criticalCount = useMemo(
    () => debrisScenarios.filter((s) => s.severity === 'critical').length,
    []
  );

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 text-alert-red border-red-500/30';
      case 'high':
        return 'bg-amber-500/10 text-alert-amber border-amber-500/30';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'low':
      default:
        return 'bg-emerald-500/10 text-cyber-green border-emerald-500/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'executed':
        return 'bg-emerald-500/10 text-cyber-green border-emerald-500/30';
      case 'planned':
        return 'bg-cyan-500/10 text-cyber-blue border-cyan-500/30';
      case 'aborted':
      default:
        return 'bg-slate-700/50 text-zinc-400 border-slate-600/40';
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-zinc-500 opacity-60 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1 text-cyber-blue" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-cyber-blue" />
    );
  };

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-space-600 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-alert-red" />
          <h2 className="uppercase text-xs font-semibold tracking-wider text-zinc-400">
            Threat Assessment Matrix
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className=" absolute inline-flex h-full w-full rounded-full bg-alert-red opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-alert-red"></span>
            </span>
            <span className="text-alert-red font-semibold">{criticalCount} CRITICAL</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400">{debrisScenarios.length} TOTAL</span>
          </div>
          <button
            onClick={() => handleSort('severity')}
            className="text-[11px] font-mono px-2 py-0.5 rounded border border-space-600 bg-space-700 text-zinc-300 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1 cursor-pointer"
            title="Sort by severity"
          >
            <span>Severity</span>
            {renderSortIcon('severity')}
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-space-600 bg-zinc-900/60 text-zinc-400 font-mono text-[11px] uppercase tracking-wider select-none">
              <th
                onClick={() => handleSort('id')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-zinc-200 transition-colors group"
              >
                <div className="flex items-center">
                  <span>Event ID</span>
                  {renderSortIcon('id')}
                </div>
              </th>
              <th className="py-2.5 px-3 font-medium">Target Sat</th>
              <th className="py-2.5 px-3 font-medium">Debris Type</th>
              <th
                onClick={() => handleSort('missDistance')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-zinc-200 transition-colors group text-right"
              >
                <div className="flex items-center justify-end">
                  <span>Miss Dist (m)</span>
                  {renderSortIcon('missDistance')}
                </div>
              </th>
              <th
                onClick={() => handleSort('pc')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-zinc-200 transition-colors group text-right"
              >
                <div className="flex items-center justify-end">
                  <span>P<sub>c</sub></span>
                  {renderSortIcon('pc')}
                </div>
              </th>
              <th
                onClick={() => handleSort('severity')}
                className="py-2.5 px-3 font-medium cursor-pointer hover:text-zinc-200 transition-colors group text-center"
              >
                <div className="flex items-center justify-center">
                  <span>Severity</span>
                  {renderSortIcon('severity')}
                </div>
              </th>
              <th className="py-2.5 px-3 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-space-700/60 font-mono text-[12px]">
            {sortedScenarios.map((item) => {
              const isCritical = item.severity === 'critical';
              return (
                <tr
                  key={item.id}
                  className={`transition-colors ${
                    isCritical
                      ? 'bg-alert-red/5 hover:bg-alert-red/10'
                      : 'hover:bg-space-700/40'
                  }`}
                >
                  {/* Event ID with blinking red dot if critical */}
                  <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-zinc-200">
                    <div className="flex items-center gap-1.5">
                      {isCritical ? (
                        <span className="relative flex h-2 w-2 flex-shrink-0" title="Critical conjunction threat">
                          <span className=" absolute inline-flex h-full w-full rounded-full bg-alert-red opacity-80"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-alert-red"></span>
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0 opacity-40"></span>
                      )}
                      <span className={isCritical ? 'text-alert-red' : 'text-zinc-200'}>
                        {item.id}
                      </span>
                    </div>
                  </td>

                  {/* Target Satellite */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 rounded bg-space-700 border border-space-600 text-cyber-blue font-medium text-[11px]">
                      {item.primarySatellite}
                    </span>
                  </td>

                  {/* Debris Type */}
                  <td className="py-2.5 px-3 text-zinc-300 max-w-[190px] truncate" title={item.name}>
                    <div className="flex flex-col">
                      <span className="truncate font-sans text-xs text-zinc-200">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {item.debris.catalogId ? item.debris.catalogId : 'UNCATALOGUED'} (
                        {item.debris.estimatedSize} cm)
                      </span>
                    </div>
                  </td>

                  {/* Miss Distance */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <span
                      className={`font-semibold ${
                        item.conjunction.missDistance < 100
                          ? 'text-alert-red'
                          : item.conjunction.missDistance < 500
                          ? 'text-alert-amber'
                          : 'text-cyber-green'
                      }`}
                    >
                      {item.conjunction.missDistance.toLocaleString('en-US', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-1">m</span>
                  </td>

                  {/* Pc in Scientific Notation */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <span
                      className={`font-bold ${
                        item.conjunction.pc > 1e-3
                          ? 'text-alert-red'
                          : item.conjunction.pc > 1e-4
                          ? 'text-alert-amber'
                          : 'text-zinc-300'
                      }`}
                    >
                      {item.conjunction.pc.toExponential(2)}
                    </span>
                  </td>

                  {/* Severity */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getSeverityBadge(
                        item.severity
                      )}`}
                    >
                      {isCritical && <AlertOctagon className="w-2.5 h-2.5" />}
                      {item.severity}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${getStatusBadge(
                        item.maneuver.status
                      )}`}
                    >
                      {item.maneuver.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ThreatMatrix;
