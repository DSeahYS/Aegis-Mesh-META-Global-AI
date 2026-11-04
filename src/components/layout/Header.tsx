import type { FC } from 'react';
import { Play, Pause, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Mission Dashboard',
  orbital: '3D Orbital View',
  conjunction: 'Conjunction Assessment',
  mesh: 'Mesh Network & ISL',
  architecture: 'System Architecture',
  'clm-lab': 'AEGIS-MESH',
  'clm-gpu': 'GPU Inference Proof',
  backend: 'Backend Console',
  verification: 'V&V Proof & Math Engine',
};

const TIME_SCALES = [1, 10, 100, 1000] as const;

function formatUtcTime(epochSeconds: number): string {
  if (!epochSeconds || isNaN(epochSeconds)) return '--:--:-- UTC';
  const d = new Date(epochSeconds * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

export const Header: FC = () => {
  const activeView = useSimulationStore((state) => state.activeView);
  const setActiveView = useSimulationStore((state) => state.setActiveView);
  const simulationTime = useSimulationStore((state) => state.simulationTime);
  const timeScale = useSimulationStore((state) => state.timeScale);
  const isPlaying = useSimulationStore((state) => state.isPlaying);
  const activeAlerts = useSimulationStore((state) => state.activeAlerts);
  const togglePlayback = useSimulationStore((state) => state.togglePlayback);
  const setTimeScale = useSimulationStore((state) => state.setTimeScale);

  const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length;
  const warningCount = activeAlerts.filter((a) => a.severity === 'high' || a.severity === 'medium').length;
  const totalAlerts = activeAlerts.length;

  return (
    <header className="h-12 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between z-20 shrink-0 select-none">
      {/* Left: AEGIS-MESH Title + Status Badge + Current View Name */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm tracking-widest text-zinc-100">
            AEGIS<span className="text-emerald-500">-</span>MESH
          </span>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="font-mono text-xs font-semibold text-emerald-500 uppercase tracking-wider">
            {VIEW_TITLES[activeView] || activeView}
          </span>
        </div>

        {/* Autonomous Edge C2 Pro Badge */}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none bg-zinc-800 border border-zinc-700 text-[10px] font-mono tracking-wider text-zinc-300">
          <span className="w-1.5 h-1.5 rounded-none bg-emerald-500" />
          <span className="font-bold tracking-wider text-zinc-100">AUTONOMOUS EDGE C2</span>
        </div>

        <span className="hidden 2xl:inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-mono tracking-wider bg-zinc-800 border border-zinc-700 text-zinc-400">
          CLM v4.2
        </span>
      </div>

      {/* Center: Simulation Clock & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Clock Display */}
        <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-950 rounded-none border border-zinc-800 font-mono text-xs sm:text-sm text-zinc-200">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="tracking-wider">{formatUtcTime(simulationTime)}</span>
        </div>

        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlayback}
          className={`flex items-center justify-center w-7 h-7 rounded-none border transition-colors ${
            isPlaying
              ? 'bg-zinc-800 border-zinc-700 text-emerald-500 hover:bg-zinc-700 hover:text-emerald-300'
              : 'bg-zinc-800 border-amber-600 text-amber-400 hover:bg-zinc-700'
          }`}
          title={isPlaying ? 'Pause Simulation' : 'Resume Simulation'}
          aria-label={isPlaying ? 'Pause Simulation' : 'Resume Simulation'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        {/* Speed Controls (1x, 10x, 100x, 1000x) */}
        <div className="flex items-center rounded-none bg-zinc-950 p-0.5 border border-zinc-800">
          {TIME_SCALES.map((scale) => {
            const isCurrent = timeScale === scale;
            return (
              <button
                key={scale}
                type="button"
                onClick={() => setTimeScale(scale)}
                className={`px-2 py-0.5 rounded-none text-xs font-mono transition-colors ${
                  isCurrent
                    ? 'bg-zinc-800 text-emerald-500 border border-zinc-700 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent font-medium'
                }`}
              >
                {scale}x
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: System Status Indicators & Active Alerts */}
      <div className="flex items-center gap-3">
        {/* Geometric Status Indicators */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-none bg-zinc-950 border border-zinc-800 text-xs font-mono">
          {/* Green: Nominal Systems */}
          <div className="flex items-center gap-1.5" title="Systems: Nominal">
            <span className="w-2 h-2 rounded-none bg-emerald-500" />
            <span className="hidden lg:inline text-[10px] text-zinc-300">NOM</span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Amber: Warnings */}
          <div className="flex items-center gap-1.5" title={`${warningCount} Warning(s)`}>
            <span
              className={`w-2 h-2 rounded-none ${
                warningCount > 0 ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            />
            <span className="hidden lg:inline text-[10px] text-zinc-300">WARN</span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Red: Critical */}
          <div className="flex items-center gap-1.5" title={`${criticalCount} Critical Event(s)`}>
            <span
              className={`w-2 h-2 rounded-none ${
                criticalCount > 0 ? 'bg-red-500' : 'bg-zinc-700'
              }`}
            />
            <span className="hidden lg:inline text-[10px] text-zinc-300">CRIT</span>
          </div>
        </div>

        {/* Count of Active Alerts */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-none border text-xs font-mono font-bold ${
            criticalCount > 0
              ? 'bg-red-950/80 border-red-700 text-red-300'
              : totalAlerts > 0
              ? 'bg-amber-950/80 border-amber-700 text-amber-300'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400'
          }`}
          title={`${totalAlerts} Active Alerts (${criticalCount} Critical)`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{totalAlerts} ALERTS</span>
        </div>

        {/* Quick Link to V&V Proof Tab */}
        <button
          type="button"
          onClick={() => setActiveView('verification')}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-none border text-xs font-mono font-bold transition-colors cursor-pointer ${
            activeView === 'verification'
              ? 'bg-zinc-800 border-emerald-500 text-emerald-500'
              : 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-emerald-500'
          }`}
          title="Verify live astrodynamics math (Foster B-plane, Hamilton-Jacobi, CBF) in the V&V Proof pipeline"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>V&V PROOF</span>
        </button>
      </div>
    </header>
  );
};