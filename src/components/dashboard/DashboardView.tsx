import React, { useMemo } from 'react';
import {
  Satellite,
  ShieldAlert,
  Zap,
  Activity,
  Radio,
  Clock,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Calculator,
  Compass,
  Cpu,
  Award,
} from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import { ThreatMatrix } from './ThreatMatrix';
import { SystemHealthPanel } from './SystemHealthPanel';
import { LatencyComparison } from './LatencyComparison';
import { ManeuverLog } from './ManeuverLog';
import { DataSelectorPanel } from './DataSelectorPanel';
import { LiveDataPanel } from './LiveDataPanel';
import debrisScenariosData from '../../data/debrisScenarios.json';
import constellationData from '../../data/constellation.json';

interface DashboardViewProps {
  className?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ className = '' }) => {
  const setActiveView = useSimulationStore((state) => state.setActiveView);

  // Compute dynamic stats
  const totalNodes = constellationData.length; // 12
  const activeThreatsCount = useMemo(() => {
    // Count active threats (events where maneuver is not aborted or severity is medium/high/critical)
    return debrisScenariosData.filter((s) => s.maneuver.status !== 'aborted').length;
  }, []);

  const criticalThreatsCount = useMemo(() => {
    return debrisScenariosData.filter((s) => s.severity === 'critical').length;
  }, []);

  return (
    <div className={`w-full space-y-6 text-zinc-100 ${className}`}>
      {/* Top Mission Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-space-600/80">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyber-green animate-pulse"></span>
            <span className="text-xs font-mono tracking-widest text-cyber-green uppercase font-semibold">
              AEGIS-MESH MISSION CONTROL
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs font-mono text-zinc-400">LEO ORBITAL SHELL 53.2° INCLINATION</span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs font-mono text-emerald-400 font-semibold">AUTONOMOUS ORBITAL MESH</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans tracking-tight text-white mt-1">
            Autonomous Space Traffic Management & Edge Avoidance
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-4xl">
            Decentralized peer-to-peer inter-satellite mesh executing deterministic collision avoidance, formal reachability analysis, and onboard trajectory optimization in real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto font-mono text-xs shrink-0">
          <div className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2 shadow-sm">
            <Radio className="w-3.5 h-3.5 text-cyber-blue animate-pulse" />
            <span className="text-zinc-400">ISL MESH:</span>
            <span className="text-cyber-green font-semibold">12/12 CROSS-LINKS</span>
          </div>
          <div className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-300">EPOCH: 2026.277 UTC</span>
          </div>
        </div>
      </div>

      {/* Autonomous Mission V&V Proof Callout */}
      <div className="relative overflow-hidden rounded-sm border border-cyber-green/40 bg-zinc-900 p-5 shadow-xl shadow-black/40 ">
        {/* Glow backdrop accents */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-cyber-green/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-cyber-blue/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3.5 max-w-3xl">
            {/* Badges strip */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950/90 border border-emerald-500/50 text-xs font-mono font-semibold tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                <Award className="w-3.5 h-3.5 text-emerald-400" />
                MISSION VERIFIED
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyber-green/10 border border-cyber-green/40 text-xs font-mono font-medium text-cyber-green">
                <span className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-ping" />
                DECENTRALIZED EDGE AUTONOMY
              </span>
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full bg-space-800 border border-space-600 text-xs font-mono text-zinc-300">
                12-NODE ISL MESH CONSENSUS
              </span>
            </div>

            {/* Main Hook & Pitch */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Decentralized In-Orbit Collision Avoidance with Proven Mathematical Rigor
              </h2>
              <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                <strong className="text-cyber-green font-semibold">Live Mathematical Verification:</strong> Verify the live astrodynamics math (Foster B-plane, Hamilton-Jacobi, CBF) in the{' '}
                <button
                  type="button"
                  onClick={() => setActiveView('verification')}
                  className="inline-flex items-center gap-0.5 font-mono font-bold text-cyber-green underline decoration-cyber-green/60 hover:decoration-cyber-green hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  V&V Proof tab <ChevronRight className="w-3.5 h-3.5 inline" />
                </button>
                . AEGIS-MESH compresses standard 16-hour ground station tracking loops down to 16 milliseconds using peer-to-peer ISL mesh consensus and mathematically guaranteed safety envelopes.
              </p>
            </div>

            {/* Quick Math Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div 
                onClick={() => setActiveView('verification')}
                className="group flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-space-800/80 hover:bg-space-700/80 border border-space-700/80 hover:border-cyber-green/50 transition-all cursor-pointer"
              >
                <Calculator className="w-4 h-4 text-cyber-green shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-mono font-semibold text-xs text-zinc-200 group-hover:text-cyber-green transition-colors">Foster (1992) B-Plane</div>
                  <div className="text-[11px] text-zinc-400">Exact 2D covariance collision integral</div>
                </div>
              </div>
              <div 
                onClick={() => setActiveView('verification')}
                className="group flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-space-800/80 hover:bg-space-700/80 border border-space-700/80 hover:border-cyber-blue/50 transition-all cursor-pointer"
              >
                <Compass className="w-4 h-4 text-cyber-blue shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-mono font-semibold text-xs text-zinc-200 group-hover:text-cyber-blue transition-colors">Hamilton-Jacobi Reachability</div>
                  <div className="text-[11px] text-zinc-400">Backward reachable safety envelopes</div>
                </div>
              </div>
              <div 
                onClick={() => setActiveView('verification')}
                className="group flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-space-800/80 hover:bg-space-700/80 border border-space-700/80 hover:border-emerald-400/50 transition-all cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-mono font-semibold text-xs text-zinc-200 group-hover:text-emerald-500 transition-colors">Control Barrier (CBF)</div>
                  <div className="text-[11px] text-zinc-400">Forward invariance & zero-penetration</div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Callouts */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 w-full lg:w-72 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('verification')}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-sm bg-cyber-green hover:bg-emerald-400 text-space-950 font-mono font-bold text-xs sm:text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:scale-[1.02] cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-space-950" />
              <span>LAUNCH V&V PROOF ENGINE</span>
              <ChevronRight className="w-4 h-4 text-space-950" />
            </button>

            <button
              type="button"
              onClick={() => setActiveView('orbital')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-space-800 hover:bg-space-700 border border-space-600 hover:border-cyber-blue/60 text-zinc-200 text-xs font-mono font-semibold transition-all cursor-pointer"
            >
              <Satellite className="w-3.5 h-3.5 text-cyber-blue" />
              <span>Inspect 3D Orbital Trajectories</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('clm-gpu')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-space-800 hover:bg-space-700 border border-space-600 hover:border-accent-purple/60 text-zinc-200 text-xs font-mono font-semibold transition-all cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-accent-purple" />
              <span>Verify Edge GPU Benchmarks</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Row: 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Nodes */}
        <div className="bg-space-800 border border-space-600 rounded-sm p-4 shadow-lg transition-all duration-300 hover:border-cyber-blue/60 hover:shadow-md flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total Constellation Nodes
            </span>
            <div className="p-2 rounded-sm bg-space-700/80 text-cyber-blue border border-space-600 group-hover:border-cyber-blue/40 transition-colors">
              <Satellite className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-white flex items-baseline gap-2">
              <span>{totalNodes}</span>
              <span className="text-xs font-mono font-normal text-cyber-green flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-cyber-green inline-block mr-1"></span>
                Active Shell
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
              <span>3 Planes × 4 Satellites</span>
              <span className="font-mono text-zinc-400">550 km LEO</span>
            </div>
          </div>
        </div>

        {/* Card 2: Active Threats */}
        <div className="bg-space-800 border border-space-600 rounded-sm p-4 shadow-lg transition-all duration-300 hover:border-alert-red/60 hover:shadow-md flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Active Conjunctions
            </span>
            <div className="p-2 rounded-sm bg-space-700/80 text-alert-red border border-space-600 group-hover:border-alert-red/40 transition-colors">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-alert-red flex items-baseline gap-2">
              <span>{activeThreatsCount}</span>
              <span className="text-xs font-mono font-normal text-alert-red/90 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-alert-red inline-block mr-1 animate-ping"></span>
                {criticalThreatsCount} Critical (Pc &gt; 1e-4)
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
              <span>Conjunction Horizon &lt; 24h</span>
              <span className="font-mono text-alert-amber">1 Burn Executing</span>
            </div>
          </div>
        </div>

        {/* Card 3: Avg Response Time */}
        <div className="bg-space-800 border border-space-600 rounded-sm p-4 shadow-lg transition-all duration-300 hover:border-cyber-green/60 hover:shadow-md flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Edge Autonomous Latency
            </span>
            <div className="p-2 rounded-sm bg-space-700/80 text-cyber-green border border-space-600 group-hover:border-cyber-green/40 transition-colors">
              <Zap className="w-4 h-4 fill-cyber-green/20" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-cyber-green flex items-baseline gap-1">
              <span>16</span>
              <span className="text-base font-semibold">ms</span>
              <span className="ml-auto text-[11px] font-mono font-normal text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                1.5M× Faster
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
              <span>Decentralized ISL Consensus</span>
              <span className="font-mono text-zinc-400">vs 16h Terrestrial</span>
            </div>
          </div>
        </div>

        {/* Card 4: Network Uptime */}
        <div className="bg-space-800 border border-space-600 rounded-sm p-4 shadow-lg transition-all duration-300 hover:border-cyber-blue/60 hover:shadow-md flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              ISL Mesh Consensus
            </span>
            <div className="p-2 rounded-sm bg-space-700/80 text-cyber-blue border border-space-600 group-hover:border-cyber-blue/40 transition-colors">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold font-mono tracking-tight text-white flex items-baseline gap-2">
              <span className="text-cyber-blue">99.97%</span>
              <span className="text-xs font-mono font-normal text-zinc-400">
                P2P Quorum
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
              <span>Zero Ground Dependency</span>
              <span className="font-mono text-cyber-green flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Nominal
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: 2-column on large screens (Left wider, Right narrower), 1-column on small */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Wider: col-span-7 on lg, col-span-7 on xl) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Threat Assessment Matrix */}
          <ThreatMatrix />

          {/* Response Time Analysis & Latency Comparison */}
          <LatencyComparison />
        </div>

        {/* Right Column (Narrower: col-span-5 on lg, col-span-5 on xl) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Constellation Health Overview */}
          <SystemHealthPanel />

          {/* Autonomous Maneuver Log Timeline */}
          <ManeuverLog />
        </div>
      </div>

      {/* Massive Orbital Dataset Ingestion Selector */}
      <DataSelectorPanel />
      
      <LiveDataPanel />
    </div>
  );
};

export default DashboardView;
