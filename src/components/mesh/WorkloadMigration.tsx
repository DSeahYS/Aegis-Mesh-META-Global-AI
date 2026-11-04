import React, { useState, useEffect } from 'react';
import {
  Layers,
  Cpu,
  FileCode2,
  Radio,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Server,
} from 'lucide-react';

export interface MigrationStageInfo {
  id: string;
  name: string;
  subtitle: string;
  minProgress: number;
  maxProgress: number;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: MigrationStageInfo[] = [
  {
    id: 'checkpoint',
    name: '1. Checkpoint',
    subtitle: 'WASM linear memory snapshot',
    minProgress: 0,
    maxProgress: 25,
    icon: Cpu,
  },
  {
    id: 'serialize',
    name: '2. Serialize',
    subtitle: 'CBOR compression & SHA-256',
    minProgress: 25,
    maxProgress: 50,
    icon: FileCode2,
  },
  {
    id: 'transfer',
    name: '3. Transfer',
    subtitle: '10 Gbps Optical ISL Laser',
    minProgress: 50,
    maxProgress: 85,
    icon: Radio,
  },
  {
    id: 'restore',
    name: '4. Restore',
    subtitle: 'Wasmtime target instantiation',
    minProgress: 85,
    maxProgress: 100,
    icon: Layers,
  },
];

export const WorkloadMigration: React.FC = () => {
  const [sourceNode, setSourceNode] = useState('AEGIS-04');
  const [targetNode, setTargetNode] = useState('AEGIS-05');
  const [dataSize, setDataSize] = useState(512); // MB
  const [progress, setProgress] = useState(64);
  const [isPlaying, setIsPlaying] = useState(true);

  // Smooth animation effect
  useEffect(() => {
    if (!isPlaying) return;

    if (progress >= 100) {
      setIsPlaying(false);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => Math.min(100, prev + 1.2));
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, progress]);

  // Determine current active stage
  const getStageStatus = (stage: MigrationStageInfo) => {
    if (progress >= stage.maxProgress) {
      return 'completed';
    }
    if (progress >= stage.minProgress && progress < stage.maxProgress) {
      return 'active';
    }
    return 'pending';
  };

  const overallStatus =
    progress >= 100
      ? 'MIGRATION COMPLETE'
      : progress >= 85
      ? 'RESTORING TARGET RUNTIME'
      : progress >= 50
      ? 'TRANSMITTING OVER ISL'
      : progress >= 25
      ? 'SERIALIZING BINARY MEMORY'
      : 'CHECKPOINTING THREADS';

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40">
        <div className="flex items-center space-x-2.5">
          <Layers className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
            WASM WORKLOAD MIGRATION
          </h3>
        </div>

        {/* Live Simulation Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded bg-zinc-900 border border-zinc-700 hover:border-cyan-500 text-zinc-300 hover:text-blue-300 transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              setProgress(0);
              setIsPlaying(true);
            }}
            className="p-1.5 rounded bg-zinc-900 border border-zinc-700 hover:border-cyan-500 text-zinc-300 hover:text-blue-300 transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 space-y-5 bg-zinc-950">
        {/* Source -> Target Nodes Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center p-3.5 rounded-sm bg-zinc-950 border border-zinc-800">
          {/* Source Node */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block">SOURCE NODE (EVADING)</span>
              <select
                value={sourceNode}
                onChange={(e) => setSourceNode(e.target.value)}
                className="bg-transparent text-sm font-bold text-amber-300 font-mono focus:outline-none cursor-pointer"
              >
                <option value="AEGIS-04" className="bg-zinc-900">AEGIS-04</option>
                <option value="AEGIS-07" className="bg-zinc-900">AEGIS-07</option>
                <option value="AEGIS-02" className="bg-zinc-900">AEGIS-02</option>
              </select>
              <span className="text-[10px] text-amber-400/80 font-mono block">Compute Load: 78.4%</span>
            </div>
          </div>

          {/* Transfer Channel Arrow */}
          <div className="flex flex-col items-center justify-center font-mono">
            <div className="flex items-center space-x-2 text-blue-400">
              <span className="text-[10px] text-zinc-400">10 Gbps ISL</span>
              <ArrowRight className="w-4 h-4 " />
            </div>
            <span className="text-[10px] text-zinc-500 mt-0.5">TLS 1.3 + QKD OTP</span>
          </div>

          {/* Target Node */}
          <div className="flex items-center space-x-3 md:justify-end text-left md:text-right">
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block">TARGET NODE (RECEIVING)</span>
              <select
                value={targetNode}
                onChange={(e) => setTargetNode(e.target.value)}
                className="bg-transparent text-sm font-bold text-emerald-500 font-mono focus:outline-none cursor-pointer"
              >
                <option value="AEGIS-05" className="bg-zinc-900">AEGIS-05</option>
                <option value="AEGIS-01" className="bg-zinc-900">AEGIS-01</option>
                <option value="AEGIS-09" className="bg-zinc-900">AEGIS-09</option>
              </select>
              <span className="text-[10px] text-emerald-500/80 font-mono block">Compute Load: 22.3%</span>
            </div>
            <div className="p-2 rounded bg-emerald-950/50 border border-emerald-800/50 text-emerald-500">
              <Server className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Progress Bar & Telemetry */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-blue-400 font-semibold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 " />
              <span>STATUS: {overallStatus}</span>
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-zinc-300 font-bold">
                {progress.toFixed(1)}% ({((progress / 100) * dataSize).toFixed(1)} / {dataSize} MB)
              </span>
              <select
                value={dataSize}
                onChange={(e) => setDataSize(Number(e.target.value))}
                className="bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-300 rounded px-1.5 py-0.5"
              >
                <option value={256}>256 MB</option>
                <option value={512}>512 MB</option>
                <option value={1024}>1024 MB</option>
              </select>
            </div>
          </div>

          {/* High-tech Progress Bar */}
          <div className="w-full h-3 bg-zinc-900 border border-zinc-700/80 rounded-full overflow-hidden p-0.5 shadow-inner">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-150 relative shadow-md"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 " />
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>T_START: +0.00s</span>
            <span>TRANSFER RATE: ~256 MB/s</span>
            <span>EST. COMPLETION: {((100 - progress) * 0.02).toFixed(1)}s</span>
          </div>
        </div>

        {/* 4 Migration Stages Stepper */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STAGES.map((stage) => {
            const status = getStageStatus(stage);
            const Icon = stage.icon;

            let borderStyle = 'border-zinc-800 bg-zinc-950/40 text-zinc-500';
            let iconColor = 'text-zinc-600';
            let statusBadge = (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                WAITING
              </span>
            );

            if (status === 'completed') {
              borderStyle = 'border-emerald-500/40 bg-emerald-950/20 text-zinc-200';
              iconColor = 'text-emerald-500';
              statusBadge = (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono flex items-center space-x-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>DONE</span>
                </span>
              );
            } else if (status === 'active') {
              borderStyle = 'border-cyan-500/60 bg-zinc-950/30 text-white shadow-md';
              iconColor = 'text-blue-400 ';
              statusBadge = (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-blue-300 font-mono font-bold ">
                  IN PROGRESS
                </span>
              );
            }

            return (
              <div
                key={stage.id}
                className={`p-3 rounded-sm border transition-all duration-200 flex flex-col justify-between space-y-2 ${borderStyle}`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                  {statusBadge}
                </div>

                <div>
                  <h4 className="text-xs font-bold font-mono tracking-wide">{stage.name}</h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{stage.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tech Badges Footer */}
        <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[11px] font-semibold">
              WebAssembly State
            </span>
            <span className="px-2.5 py-1 rounded bg-zinc-950/50 border border-zinc-800/50 text-blue-300 text-[11px] font-semibold">
              TLS-Secured ISL
            </span>
            <span className="px-2.5 py-1 rounded bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-[11px] font-semibold">
              ISA-Agnostic
            </span>
          </div>

          <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>ZERO MEMORY DRIFT CONFIRMED</span>
          </div>
        </div>
      </div>
    </div>
  );
};
