import React from 'react';
import hardwareSpecsData from '../../data/hardwareSpecs.json';
import {
  Cpu,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  Award,
} from 'lucide-react';

export interface HardwarePlatform {
  name: string;
  architecture: string;
  cores: string;
  dynamicLatency: string;
  peakPower: string;
  targetWorkload: string;
  suitable: boolean;
  pros: string[];
  cons: string[];
}

const hardwarePlatforms = hardwareSpecsData as HardwarePlatform[];

export const HardwareStack: React.FC = () => {
  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40 gap-3">
        <div className="flex items-center space-x-2.5">
          <Cpu className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
              EDGE COMPUTE HARDWARE ANALYSIS
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              SPACE QUALIFICATION, THERMAL DISSIPATION & DETERMINISTIC LATENCY BENCHMARKS
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-emerald-950/50 border border-emerald-800/50 text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>2 Rad-Tolerant Candidates</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-300">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            <span>2 COTS Platforms Disqualified</span>
          </div>
        </div>
      </div>

      {/* Grid of Hardware Cards */}
      <div className="p-5 bg-zinc-950 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {hardwarePlatforms.map((hw) => {
          const isPrimary = hw.name.includes('PolarFire');
          const isSuitable = hw.suitable;

          return (
            <div
              key={hw.name}
              className={`rounded-sm border p-5 transition-all duration-200 relative flex flex-col justify-between ${
                isPrimary
                  ? 'border-emerald-500/80 bg-zinc-900 shadow-md'
                  : isSuitable
                  ? 'border-emerald-500/40 bg-emerald-950/10'
                  : 'border-red-500/40 bg-red-950/10'
              }`}
            >
              {/* Primary Ribbon Banner */}
              {isPrimary && (
                <div className="absolute -top-3 right-4 px-3 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold font-mono tracking-wider flex items-center space-x-1 shadow-lg">
                  <Award className="w-3 h-3 text-slate-950" />
                  <span>PRIMARY FLIGHT COMPUTER</span>
                </div>
              )}

              {/* Card Header & Title */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-base font-bold text-white font-mono">{hw.name}</h4>
                    </div>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">{hw.architecture}</p>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase tracking-wider border shrink-0 ${
                      isSuitable
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border-red-500/40'
                    }`}
                  >
                    {isSuitable ? 'FLIGHT SUITABLE' : 'DISQUALIFIED'}
                  </span>
                </div>

                {/* Cores & Microarchitecture Readout */}
                <div className="mt-3 p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                  <span className="text-zinc-500 text-[10px] block uppercase">CORES & ACCELERATION:</span>
                  <span className="text-blue-300">{hw.cores}</span>
                </div>

                {/* Specs Strip: Latency, Power, Workload */}
                <div className="grid grid-cols-2 gap-2 mt-3 font-mono text-xs">
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-zinc-500 block">DYNAMIC LATENCY</span>
                      <span className="text-zinc-200 font-bold">{hw.dynamicLatency}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-zinc-500 block">PEAK POWER</span>
                      <span className="text-zinc-200 font-bold">{hw.peakPower}</span>
                    </div>
                  </div>
                </div>

                {/* Target Workload */}
                <div className="mt-3 p-2 rounded bg-zinc-900/40 border border-zinc-800 text-[11px] font-mono">
                  <span className="text-zinc-500 text-[10px] block uppercase">ASSIGNED MISSION ROLE:</span>
                  <span className="text-zinc-200">{hw.targetWorkload}</span>
                </div>

                {/* Pros & Cons Lists */}
                <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">
                  {/* Pros */}
                  <div>
                    <span className="text-[10px] font-mono font-bold text-emerald-500 uppercase tracking-wider block mb-1">
                      ADVANTAGES / FLIGHT PEDIGREE:
                    </span>
                    <ul className="space-y-1 text-xs">
                      {hw.pros.map((pro, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5 text-zinc-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          <span className="leading-tight">{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Cons */}
                  <div>
                    <span className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-wider block mb-1">
                      RISKS & THERMAL/RAD VULNERABILITIES:
                    </span>
                    <ul className="space-y-1 text-xs">
                      {hw.cons.map((con, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5 text-zinc-400">
                          <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                          <span className="leading-tight">{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>RAD-HARDNESS: {isSuitable ? '100+ krad TID Verified' : 'None / SEL Vulnerable'}</span>
                <span>SWaP-C: {isSuitable ? 'Optimal CubeSat Budget' : 'Exceeds SmallSat Limits'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
