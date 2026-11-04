import React, { useMemo } from 'react';
import { Compass, CheckCircle2, Clock, Ban, Fuel, Gauge, Satellite } from 'lucide-react';
import debrisScenariosData from '../../data/debrisScenarios.json';

interface ManeuverItem {
  id: string;
  name: string;
  timestamp: string;
  primarySatellite: string;
  maneuver: {
    deltaV: [number, number, number];
    burnDuration: number;
    fuelCost: number;
    status: 'planned' | 'executed' | 'aborted' | string;
  };
  severity: string;
}

const debrisScenarios = (debrisScenariosData as unknown) as ManeuverItem[];

const formatVectorComponent = (val: number): string => {
  return (val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2));
};

const formatTimestamp = (isoString: string): string => {
  const d = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
};

export const ManeuverLog: React.FC = () => {
  // Chronological list sorted newest first
  const sortedManeuvers = useMemo(() => {
    return [...debrisScenarios].sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'executed':
        return {
          classes: 'bg-emerald-500/10 text-cyber-green border-emerald-500/30',
          icon: <CheckCircle2 className="w-3 h-3 text-cyber-green" />,
          label: 'EXECUTED',
        };
      case 'planned':
        return {
          classes: 'bg-blue-500/10 text-cyber-blue border-blue-500/30',
          icon: <Clock className="w-3 h-3 text-cyber-blue" />,
          label: 'PLANNED',
        };
      case 'aborted':
      default:
        return {
          classes: 'bg-red-500/10 text-alert-red border-red-500/30',
          icon: <Ban className="w-3 h-3 text-alert-red" />,
          label: 'ABORTED',
        };
    }
  };

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-space-600 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyber-blue" />
          <h2 className="uppercase text-xs font-semibold tracking-wider text-zinc-400">
            Autonomous Maneuver Log
          </h2>
        </div>
        <div className="text-[11px] font-mono text-zinc-400">
          <span className="text-cyber-green font-semibold">1 Executed</span>
          <span className="text-zinc-500 mx-1.5">•</span>
          <span className="text-cyber-blue font-semibold">3 Planned</span>
          <span className="text-zinc-500 mx-1.5">•</span>
          <span className="text-alert-red font-semibold">1 Aborted</span>
        </div>
      </div>

      {/* Scrollable Container (Newest first) */}
      <div className="p-3 max-h-[460px] overflow-y-auto space-y-2.5">
        {sortedManeuvers.map((item) => {
          const status = getStatusBadge(item.maneuver.status);
          const [dx, dy, dz] = item.maneuver.deltaV;
          const deltaVMagnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);

          return (
            <div
              key={item.id}
              className={`p-3 rounded-sm border transition-all duration-200 bg-zinc-900/50 hover:bg-zinc-900/80 ${
                item.maneuver.status === 'executed'
                  ? 'border-emerald-500/40 hover:border-emerald-500/60'
                  : item.maneuver.status === 'planned'
                  ? 'border-blue-500/30 hover:border-blue-500/50'
                  : 'border-space-600 hover:border-space-500'
              }`}
            >
              {/* Top row: Target satellite, Event ID, Status Badge */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-space-700 border border-space-600 text-cyber-blue font-mono text-xs font-semibold flex items-center gap-1">
                    <Satellite className="w-3 h-3 text-cyber-blue" />
                    {item.primarySatellite}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {item.id}
                  </span>
                </div>

                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${status.classes}`}
                >
                  {status.icon}
                  <span>{status.label}</span>
                </div>
              </div>

              {/* Event Name */}
              <div className="text-xs font-medium text-zinc-200 mb-2 truncate" title={item.name}>
                {item.name}
              </div>

              {/* Maneuver Telemetry Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 rounded bg-zinc-950/60 border border-space-700/60 font-mono text-[11px]">
                {/* 3D Delta-V Vector Component */}
                <div className="sm:col-span-1">
                  <div className="text-[10px] text-zinc-400 flex items-center gap-1 mb-0.5 uppercase tracking-wider">
                    <Gauge className="w-3 h-3 text-cyber-blue" />
                    <span>ΔV Vector [m/s]</span>
                  </div>
                  <div className="text-zinc-200 font-semibold tracking-tight">
                    [{formatVectorComponent(dx)}, {formatVectorComponent(dy)}, {formatVectorComponent(dz)}]
                  </div>
                  <div className="text-[10px] text-cyber-green mt-0.5">
                    |ΔV|: {deltaVMagnitude.toFixed(3)} m/s
                  </div>
                </div>

                {/* Fuel Cost & Burn Duration */}
                <div className="sm:col-span-1">
                  <div className="text-[10px] text-zinc-400 flex items-center gap-1 mb-0.5 uppercase tracking-wider">
                    <Fuel className="w-3 h-3 text-alert-amber" />
                    <span>Propellant Cost</span>
                  </div>
                  <div className="text-zinc-200 font-semibold">
                    {item.maneuver.fuelCost.toFixed(2)} kg
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Burn: {item.maneuver.burnDuration.toFixed(1)}s
                  </div>
                </div>

                {/* Timestamp */}
                <div className="sm:col-span-1">
                  <div className="text-[10px] text-zinc-400 flex items-center gap-1 mb-0.5 uppercase tracking-wider">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>Timestamp</span>
                  </div>
                  <div className="text-zinc-300 text-[10px] leading-tight">
                    {formatTimestamp(item.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ManeuverLog;
