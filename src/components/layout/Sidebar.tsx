import { useState } from 'react';
import type { FC } from 'react';
import {
  LayoutDashboard,
  Globe,
  AlertTriangle,
  Network,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Shield,
  BrainCircuit,
  Terminal,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useSimulationStore, type ActiveView } from '../../store/simulationStore';

interface NavItem {
  id: ActiveView;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Mission Dashboard',
    shortLabel: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'orbital',
    label: '3D Orbital View',
    shortLabel: 'Orbital',
    icon: Globe,
    badge: '3D',
  },
  {
    id: 'conjunction',
    label: 'Conjunction Assessment',
    shortLabel: 'Conjunction',
    icon: AlertTriangle,
  },
  {
    id: 'mesh',
    label: 'Mesh Network & ISL',
    shortLabel: 'Mesh ISL',
    icon: Network,
  },
  {
    id: 'architecture',
    label: 'System Architecture',
    shortLabel: 'Architecture',
    icon: Cpu,
  },
  {
    id: 'clm-lab',
    label: 'AEGIS-MESH Edge Lab',
    shortLabel: 'CLM Lab',
    icon: BrainCircuit,
  },
  {
    id: 'clm-gpu',
    label: 'GPU Inference Proof',
    shortLabel: 'GPU Metrics',
    icon: Terminal,
    badge: 'NEW',
  },
  {
    id: 'backend',
    label: 'Backend Live Console',
    shortLabel: 'Backend',
    icon: Server,
    badge: 'API',
  },
  {
    id: 'verification',
    label: 'V&V Proof',
    shortLabel: 'V&V Proof',
    icon: ShieldCheck,
    badge: 'V&V',
  },
];

export const Sidebar: FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const activeView = useSimulationStore((state) => state.activeView);
  const setActiveView = useSimulationStore((state) => state.setActiveView);
  const activeAlerts = useSimulationStore((state) => state.activeAlerts);

  const conjunctionAlertCount = activeAlerts.filter(
    (a) => a.type === 'conjunction' && (a.severity === 'high' || a.severity === 'critical')
  ).length;

  return (
    <aside
      className={`relative flex flex-col justify-between bg-zinc-900 border-r border-zinc-800 transition-all duration-200 ease-in-out z-30 select-none ${
        isExpanded ? 'w-60' : 'w-14'
      }`}
    >
      {/* Top Section: Logo & Brand */}
      <div>
        <div className="h-12 flex items-center px-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {/* Geometric AΞ Tactical Logo */}
            <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-none bg-zinc-950 border border-zinc-700 text-emerald-500 font-mono font-bold text-sm tracking-wider">
              AΞ
            </div>

            {isExpanded && (
              <div className="flex flex-col whitespace-nowrap overflow-hidden">
                <span className="font-bold text-xs tracking-widest text-zinc-100 font-mono">
                  AEGIS<span className="text-emerald-500">-</span>MESH
                </span>
                <span className="text-[9px] uppercase font-mono tracking-wider text-zinc-400">
                  LEO Defense Grid
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-1.5 space-y-1 mt-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const hasAlertBadge = item.id === 'conjunction' && conjunctionAlertCount > 0;

            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-none text-xs font-mono font-medium transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-emerald-500 border-l-2 border-emerald-500 border-t-0 border-r-0 border-b-0'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border-l-2 border-transparent'
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="relative shrink-0 flex items-center justify-center">
                    <Icon className="w-4 h-4 shrink-0" />
                    {hasAlertBadge && !isExpanded && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-none bg-red-500" />
                    )}
                  </div>

                  {isExpanded && (
                    <div className="flex-1 flex items-center justify-between whitespace-nowrap overflow-hidden">
                      <span className="truncate">{item.label}</span>
                      {hasAlertBadge ? (
                        <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-none bg-red-950 border border-red-700 text-red-300">
                          {conjunctionAlertCount} ALERT
                        </span>
                      ) : item.badge ? (
                        <span className="px-1.5 py-0.2 text-[9px] font-mono rounded-none bg-zinc-950 text-zinc-400 border border-zinc-800 uppercase">
                          {item.badge}
                        </span>
                      ) : null}
                    </div>
                  )}
                </button>

                {/* Collapsed Tooltip */}
                {!isExpanded && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-none shadow-md text-xs font-mono text-zinc-200 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    <div className="flex items-center gap-1.5">
                      <span>{item.label}</span>
                      {hasAlertBadge && (
                        <span className="px-1 py-0.2 text-[9px] bg-red-950 text-red-300 border border-red-700 rounded-none font-mono">
                          {conjunctionAlertCount}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Constellation Meter & Collapse Toggle */}
      <div className="p-2 border-t border-zinc-800 space-y-2">
        {isExpanded ? (
          <div className="p-2 rounded-none bg-zinc-950 border border-zinc-800 text-xs font-mono">
            <div className="flex items-center justify-between text-zinc-400 text-[10px] mb-1">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                CONSTELLATION
              </span>
              <span className="text-emerald-500 font-bold">OPTIMAL</span>
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded-none overflow-hidden mb-1">
              <div className="bg-emerald-500 h-full w-full" />
            </div>
            <div className="flex justify-between items-center text-[9px] text-zinc-500">
              <span>12/12 NODES</span>
              <span>100% COVERAGE</span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center p-1.5 rounded-none border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors"
          title={isExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
          aria-label={isExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
        >
          {isExpanded ? (
            <div className="flex items-center gap-1.5 text-xs">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>COLLAPSE</span>
            </div>
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
};