import React from 'react';
import {
  ShieldCheck,
  Wifi,
  WifiOff,
  Clock,
  Cpu,
  Terminal,
  Activity,
  Layers,
  CheckCircle,
  FileCode,
  Network,
} from 'lucide-react';
import { formatDurationMs } from './formatters';

interface VVHeaderStatusProps {
  isOnline: boolean;
  uptimeSec: number;
  lastRunId: string | null;
  lastRunTimestamp: string | null;
  lastRoundTripMs: number | null;
  activeTab: 'pipeline' | 'epg' | 'selftest' | 'cdm' | 'all';
  onTabChange: (tab: 'pipeline' | 'epg' | 'selftest' | 'cdm' | 'all') => void;
}

export const VVHeaderStatus: React.FC<VVHeaderStatusProps> = ({
  isOnline,
  uptimeSec,
  lastRunId,
  lastRunTimestamp,
  lastRoundTripMs,
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-space-600/80">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isOnline ? 'bg-cyber-green animate-pulse' : 'bg-alert-red'
              }`}
            />
            <span className="text-xs font-mono tracking-widest text-cyber-green uppercase font-semibold">
              AEGIS-MESH DETERMINISTIC ASSURANCE
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs font-mono text-zinc-400">
              ORACLES & REACHABILITY CERTIFICATES
            </span>
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white mt-1 flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-cyber-green shrink-0" />
            Validation & Verification (V&V) Proof
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-3xl">
            Live proof that AEGIS-MESH autonomous evasion is mathematically grounded: Foster 2D B-plane quadrature,
            EPG/KGDSL-style rule graph (in-process), Isaacs Hamilton-Jacobi reachability certificates, and High-Order
            Control Barrier Function safety invariance.
          </p>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          {/* Online/Offline */}
          <div
            className={`px-3 py-1.5 rounded-sm border flex items-center gap-2 ${
              isOnline
                ? 'bg-space-800/80 border-cyber-green/40 text-cyber-green'
                : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-cyber-green" />
                <span className="font-semibold">BACKEND ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-alert-red" />
                <span className="font-semibold">BACKEND OFFLINE</span>
              </>
            )}
          </div>

          {/* Uptime */}
          <div className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2 text-zinc-300">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>UPTIME {uptimeSec}s</span>
          </div>

          {/* Last Run ID */}
          {lastRunId && (
            <div
              className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2 text-zinc-300"
              title={`Full Run ID: ${lastRunId}\nTimestamp: ${lastRunTimestamp ?? 'N/A'}`}
            >
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>
                RUN <span className="text-blue-300 font-bold">{lastRunId.slice(0, 8)}</span>
              </span>
            </div>
          )}

          {/* Round-trip Latency */}
          {lastRoundTripMs !== null && (
            <div className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2 text-zinc-300">
              <Activity className="w-3.5 h-3.5 text-yellow-400" />
              <span>
                RTT <span className="text-yellow-300 font-bold">{formatDurationMs(lastRoundTripMs)}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-alert-red/10 border border-alert-red/40 rounded-sm p-3.5 text-xs font-mono text-zinc-200 flex items-start gap-3">
          <Terminal className="w-5 h-5 text-alert-red shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-alert-red flex items-center gap-2">
              FASTAPI ENGINE NOT DETECTED ON PORT 8000
            </div>
            <p className="text-zinc-300">
              To activate live numerical validation and reachability certificates, launch the backend server:
            </p>
            <div className="bg-zinc-950 px-2.5 py-1.5 rounded border border-space-700 text-blue-300 select-all inline-block font-bold">
              cd backend &amp;&amp; uvicorn app.main:app --port 8000
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => onTabChange('pipeline')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border transition-all ${
            activeTab === 'pipeline'
              ? 'bg-cyber-green/15 border-cyber-green text-cyber-green font-bold shadow-md shadow-cyber-green/10'
              : 'bg-space-800/60 border-space-700 text-zinc-400 hover:text-zinc-200 hover:bg-space-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>AUTONOMOUS EVASION PIPELINE</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('epg')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border transition-all ${
            activeTab === 'epg'
              ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold shadow-md shadow-amber-500/10'
              : 'bg-space-800/60 border-space-700 text-zinc-400 hover:text-zinc-200 hover:bg-space-800'
          }`}
        >
          <Network className="w-4 h-4 text-amber-400" />
          <span>EPG KNOWLEDGE GRAPH</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('selftest')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border transition-all ${
            activeTab === 'selftest'
              ? 'bg-purple-500/15 border-purple-500 text-purple-300 font-bold shadow-md shadow-purple-500/10'
              : 'bg-space-800/60 border-space-700 text-zinc-400 hover:text-zinc-200 hover:bg-space-800'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>VERIFICATION SUITE (16 ORACLES)</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('cdm')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border transition-all ${
            activeTab === 'cdm'
              ? 'bg-blue-500/15 border-blue-500 text-blue-300 font-bold shadow-md shadow-black/10'
              : 'bg-space-800/60 border-space-700 text-zinc-400 hover:text-zinc-200 hover:bg-space-800'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>CDM VALIDATOR (CCSDS 508.0)</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('all')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-sm border transition-all ml-auto ${
            activeTab === 'all'
              ? 'bg-slate-700/60 border-slate-400 text-white font-bold'
              : 'bg-space-800/40 border-space-700 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>VIEW ALL PANELS</span>
        </button>
      </div>
    </div>
  );
};
