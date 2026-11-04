import React from 'react';
import { Terminal, Clock, Activity, ArrowUpRight } from 'lucide-react';

export interface RelativeStateVector {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface StateVectorPanelData {
  tca: string | number;
  missDistance: number;
  pc?: number;
  relativeStateVector?: RelativeStateVector;
  debris?: {
    catalogId?: string | null;
    estimatedSize?: number;
    relativeVelocity?: number;
    type?: string;
  };
  primarySatellite?: string;
  severity?: string;
  maneuver?: {
    deltaV?: number[];
    burnDuration?: number;
    fuelCost?: number;
    status?: string;
  };
  bPlane?: {
    xi: number;
    zeta: number;
  };
}

export interface StateVectorPanelProps {
  data: StateVectorPanelData;
}

export const StateVectorPanel: React.FC<StateVectorPanelProps> = ({ data }) => {
  const {
    tca,
    missDistance,
    relativeStateVector = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    debris,
    primarySatellite,
    severity = 'low',
    maneuver,
  } = data;

  const { x, y, z, vx, vy, vz } = relativeStateVector;

  // Calculate relative velocity magnitude if not provided explicitly
  const calculatedRelSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const relVelocityMagnitude = debris?.relativeVelocity ?? calculatedRelSpeed;

  // Position magnitude in km
  const posMagnitude = Math.sqrt(x * x + y * y + z * z);

  // Format TCA date string
  let tcaFormatted = 'UNKNOWN';
  if (typeof tca === 'string') {
    try {
      const d = new Date(tca);
      tcaFormatted = d.toUTCString().replace('GMT', 'UTC');
    } catch {
      tcaFormatted = tca;
    }
  } else if (typeof tca === 'number') {
    tcaFormatted = `+${tca.toFixed(1)}s (TCA RELATIVE)`;
  }

  // Miss distance color-coding
  let missColor = 'text-emerald-500';
  let missBg = 'border-emerald-500/30 bg-emerald-950/20';
  if (missDistance < 50) {
    missColor = 'text-red-400 font-bold';
    missBg = 'border-red-500/40 bg-red-950/30';
  } else if (missDistance < 200) {
    missColor = 'text-amber-400 font-semibold';
    missBg = 'border-amber-500/30 bg-amber-950/20';
  }

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-900/50 rounded-sm overflow-hidden shadow-xl shadow-black/40 font-mono">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900 border-b border-zinc-900/40">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-semibold tracking-wider text-zinc-100 uppercase">
            RELATIVE STATE VECTOR
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-[10px] text-zinc-400">
          <span>FRAME: RIC (HILL)</span>
          <span className="text-blue-500">|</span>
          <span className="text-emerald-500 ">● LIVE TELEMETRY</span>
        </div>
      </div>

      {/* Main Terminal Body */}
      <div className="p-4 space-y-3.5 bg-zinc-900">
        {/* Top Summary Readouts: TCA & Miss Distance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* TCA Block */}
          <div className="p-2.5 rounded-sm bg-zinc-950 border border-zinc-800 flex items-start space-x-2.5">
            <Clock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                TIME OF CLOSEST APPROACH (TCA)
              </span>
              <span className="text-xs text-zinc-100 font-bold tracking-wide truncate block">
                {tcaFormatted}
              </span>
            </div>
          </div>

          {/* Miss Distance Block */}
          <div className={`p-2.5 rounded-sm border flex items-start space-x-2.5 ${missBg}`}>
            <Activity className={`w-4 h-4 mt-0.5 shrink-0 ${missColor}`} />
            <div>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                MISS DISTANCE
              </span>
              <span className={`text-sm tracking-wide ${missColor}`}>
                {missDistance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m
              </span>
            </div>
          </div>
        </div>

        {/* Relative Velocity Magnitude Banner */}
        <div className="p-2.5 rounded-sm bg-zinc-950/20 border border-zinc-800/30 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <ArrowUpRight className="w-4 h-4 text-blue-400" />
            <span className="text-zinc-300">RELATIVE VELOCITY MAGNITUDE (|v_rel|):</span>
          </div>
          <span className="text-blue-300 font-bold text-sm tracking-wide">
            {relVelocityMagnitude.toFixed(3)} km/s
            <span className="text-[10px] text-zinc-400 font-normal ml-1">
              ({(relVelocityMagnitude * 3600).toFixed(0)} km/h)
            </span>
          </span>
        </div>

        {/* State Vector Grid: Position & Velocity Components */}
        <div className="grid grid-cols-2 gap-3">
          {/* Position Vector */}
          <div className="p-3 rounded-sm bg-zinc-950 border border-zinc-900/30 space-y-2">
            <div className="flex items-center justify-between text-[11px] pb-1 border-b border-zinc-800">
              <span className="text-blue-400 font-bold">RELATIVE POSITION (r)</span>
              <span className="text-[10px] text-zinc-500">|r| = {posMagnitude.toFixed(2)} km</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">ΔX (Radial):</span>
                <span className="text-emerald-500 font-semibold">{x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2)} km</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">ΔY (In-Track):</span>
                <span className="text-emerald-500 font-semibold">{y >= 0 ? `+${y.toFixed(2)}` : y.toFixed(2)} km</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">ΔZ (Cross-Track):</span>
                <span className="text-emerald-500 font-semibold">{z >= 0 ? `+${z.toFixed(2)}` : z.toFixed(2)} km</span>
              </div>
            </div>
          </div>

          {/* Velocity Vector */}
          <div className="p-3 rounded-sm bg-zinc-950 border border-zinc-900/30 space-y-2">
            <div className="flex items-center justify-between text-[11px] pb-1 border-b border-zinc-800">
              <span className="text-blue-400 font-bold">RELATIVE VELOCITY (v)</span>
              <span className="text-[10px] text-zinc-500">|v| = {calculatedRelSpeed.toFixed(2)} km/s</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">V_x (Radial):</span>
                <span className="text-blue-300 font-semibold">{vx >= 0 ? `+${vx.toFixed(2)}` : vx.toFixed(2)} km/s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">V_y (In-Track):</span>
                <span className="text-blue-300 font-semibold">{vy >= 0 ? `+${vy.toFixed(2)}` : vy.toFixed(2)} km/s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">V_z (Cross-Track):</span>
                <span className="text-blue-300 font-semibold">{vz >= 0 ? `+${vz.toFixed(2)}` : vz.toFixed(2)} km/s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Target & Maneuver Metadata Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[10px]">
          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-500 block">PRIMARY NODE</span>
            <span className="text-zinc-200 font-semibold">{primarySatellite || 'AEGIS SATELLITE'}</span>
          </div>
          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-500 block">DEBRIS TARGET</span>
            <span className="text-blue-400 font-semibold">{debris?.catalogId || 'UNCATALOGUED'}</span>
          </div>
          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-500 block">SEVERITY / SIZE</span>
            <span className="text-zinc-200 font-semibold">{severity.toUpperCase()} ({debris?.estimatedSize ?? 'N/A'} cm)</span>
          </div>
          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-500 block">MANEUVER STATUS</span>
            <span className={`font-semibold uppercase ${
              maneuver?.status === 'executed' ? 'text-emerald-500' :
              maneuver?.status === 'planned' ? 'text-amber-400' : 'text-zinc-400'
            }`}>
              {maneuver?.status || 'MONITORING'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
