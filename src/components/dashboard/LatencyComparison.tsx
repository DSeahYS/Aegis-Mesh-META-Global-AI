import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Timer, Zap, AlertTriangle, ShieldCheck, ArrowRight, Clock } from 'lucide-react';

interface LatencyDataPoint {
  system: string;
  name: string;
  displayTime: string;
  timeMs: number;
  logValue: number;
  color: string;
  details: string;
}

const chartData: LatencyDataPoint[] = [
  {
    system: 'Legacy Ground STM',
    name: 'Ground-Based STM',
    displayTime: '8 – 24 Hours (avg 16h)',
    timeMs: 57600000,
    logValue: Math.log10(57600000), // ~7.76
    color: '#ff3355',
    details: 'Batch orbit determination + ground station pass latency + human in the loop',
  },
  {
    system: 'AEGIS-MESH Edge AI',
    name: 'AEGIS-MESH Edge AI',
    displayTime: '16 Milliseconds',
    timeMs: 16,
    logValue: Math.log10(16), // ~1.20
    color: '#00ff88',
    details: 'Neuromorphic visual processing + ISL mesh consensus + autonomous avoidance burn',
  },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: LatencyDataPoint;
  }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isLegacy = data.system.includes('Legacy');
    return (
      <div className="bg-zinc-900 border border-space-600 p-3 rounded-sm shadow-xl text-xs font-mono max-w-xs">
        <div className="flex items-center gap-1.5 font-bold mb-1 text-zinc-100">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: data.color }}
          ></span>
          <span>{data.name}</span>
        </div>
        <div className="text-zinc-300 mb-1">
          Response Latency: <span className="font-bold text-white">{data.displayTime}</span>
        </div>
        <div className="text-[11px] text-zinc-400 mb-2">
          Raw Duration: <span className="text-cyber-blue">{data.timeMs.toLocaleString()} ms</span>
        </div>
        <div className="border-t border-space-700 pt-1.5 text-[10px] text-zinc-400">
          {data.details}
        </div>
        <div className="mt-1.5 text-[10px]">
          {isLegacy ? (
            <span className="text-alert-red font-semibold">
              Warning: Exceeds orbital collision warning horizon for uncatalogued debris.
            </span>
          ) : (
            <span className="text-cyber-green font-semibold">
              Ultra-low latency real-time reactive collision avoidance.
            </span>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const LatencyComparison: React.FC = () => {
  return (
    <div className="bg-space-800 border border-space-600 rounded-sm shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-space-600 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-cyber-green" />
          <h2 className="uppercase text-xs font-semibold tracking-wider text-zinc-400">
            Response Time Analysis
          </h2>
        </div>

        {/* Highlight badge: ~1,500,000x faster */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-cyber-green/40 text-cyber-green text-xs font-mono font-bold flex items-center gap-1.5 shadow-md ">
            <Zap className="w-3.5 h-3.5 fill-cyber-green" />
            <span>~1,500,000x FASTER</span>
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Metric Cards Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Legacy Card */}
          <div className="p-3 rounded-sm bg-zinc-900/60 border border-alert-red/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-alert-red" />
                Legacy Ground STM
              </span>
              <span className="text-[10px] font-mono text-alert-red bg-alert-red/10 px-1.5 py-0.5 rounded border border-alert-red/20">
                CRITICAL BOTTLENECK
              </span>
            </div>
            <div className="mt-1">
              <div className="text-2xl font-bold font-mono text-alert-red tracking-tight">
                8 – 24 hrs
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                28,800,000 – 86,400,000 ms
              </div>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400 leading-snug">
              Dependent on Space Surveillance Network batch tracking, orbital pass windows, and ground human review cycles.
            </div>
          </div>

          {/* AEGIS-MESH Card */}
          <div className="p-3 rounded-sm bg-zinc-900/60 border border-cyber-green/40 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyber-green" />
                AEGIS-MESH Edge AI
              </span>
              <span className="text-[10px] font-mono text-cyber-green bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                EDGE AUTONOMOUS
              </span>
            </div>
            <div className="mt-1">
              <div className="text-2xl font-bold font-mono text-cyber-green tracking-tight flex items-baseline gap-1">
                <span>16</span>
                <span className="text-sm font-semibold">ms</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                0.016 seconds end-to-end
              </div>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400 leading-snug">
              Real-time on-satellite vision inference, low-latency inter-satellite laser consensus, and automated thrust execution.
            </div>
          </div>
        </div>

        {/* Horizontal Bar Chart (Log Scale Normalized) */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-zinc-400 uppercase font-mono tracking-wider text-[11px]">
              Relative Response Time (Log₁₀ Scale)
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              10⁰ (1 ms) ───────── 10⁸ (100,000,000 ms)
            </span>
          </div>

          <div className="h-32 w-full bg-zinc-900/50 rounded-sm p-2 border border-space-700/60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 8.5]}
                  ticks={[1, 3, 5, 7, 8]}
                  tickFormatter={(val) => {
                    if (val === 1) return '10 ms';
                    if (val === 3) return '1 sec';
                    if (val === 5) return '1.6 min';
                    if (val === 7) return '2.7 hrs';
                    if (val === 8) return '27 hrs';
                    return `${val}`;
                  }}
                  stroke="#64748b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="system"
                  stroke="#94a3b8"
                  fontSize={11}
                  fontFamily="monospace"
                  width={140}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="logValue" radius={[0, 4, 4, 0]} barSize={18}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke={entry.color}
                      strokeOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency Pipeline Breakdown & Annotation */}
        <div className="p-3 rounded-sm bg-zinc-900/60 border border-space-700 text-xs">
          <div className="flex items-start gap-2 text-zinc-300 leading-relaxed font-sans">
            <AlertTriangle className="w-4 h-4 text-alert-amber flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-zinc-200">
                Ground-Based Latency Bottleneck Analysis:
              </p>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Conventional Space Situational Awareness (SSA) relies on batch radar tracking from terrestrial stations. A Conjunction Data Message (CDM) requires multiple orbit passes (4–8h), ground processing queues (2–4h), human orbital analyst review (2–6h), and next-available telecommand uplink windows (2–6h). In sudden breakups or uncatalogued millimeter-class intercept trajectories, ground warning latency exceeds the Time to Closest Approach (TCA), guaranteeing catastrophic impact.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-mono text-zinc-300">
                <span className="text-cyber-blue font-semibold">AEGIS Edge Architecture:</span>
                <span className="px-1.5 py-0.5 rounded bg-space-800 border border-space-700">Neuromorphic Vision (2.1ms)</span>
                <ArrowRight className="w-2.5 h-2.5 text-zinc-500" />
                <span className="px-1.5 py-0.5 rounded bg-space-800 border border-space-700">Mesh Consensus (6.4ms)</span>
                <ArrowRight className="w-2.5 h-2.5 text-zinc-500" />
                <span className="px-1.5 py-0.5 rounded bg-space-800 border border-space-700">CLM Avoidance Burn (7.5ms)</span>
                <span className="text-cyber-green font-bold ml-1">= 16.0 ms Total</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LatencyComparison;
