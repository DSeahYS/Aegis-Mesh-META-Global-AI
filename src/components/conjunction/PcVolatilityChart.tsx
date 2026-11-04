import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Activity } from 'lucide-react';

const mockData = [
  { time: -72, pc: 1.2e-4, lowerBound: 1e-6, upperBound: 1e-2 },
  { time: -60, pc: 3.5e-4, lowerBound: 5e-6, upperBound: 8e-3 },
  { time: -48, pc: 4.1e-4, lowerBound: 1e-5, upperBound: 5e-3 },
  { time: -36, pc: 2.8e-4, lowerBound: 2e-5, upperBound: 2e-3 },
  { time: -24, pc: 1.5e-4, lowerBound: 4e-5, upperBound: 8e-4 },
  { time: -12, pc: 0.9e-4, lowerBound: 5e-5, upperBound: 3e-4 },
  { time: -6, pc: 0.5e-4, lowerBound: 4e-5, upperBound: 1e-4 },
  { time: 0, pc: 0.2e-4, lowerBound: 0.2e-4, upperBound: 0.2e-4 },
];

export const PcVolatilityChart: React.FC = () => {
  const formatYAxis = (tickItem: number) => {
    return tickItem.toExponential(1);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-sm shadow-xl ">
          <p className="text-zinc-300 text-xs font-mono mb-2">T{label} Hours (TCA)</p>
          <p className="text-blue-400 text-sm font-mono font-bold">
            P_c: {payload[0].value.toExponential(2)}
          </p>
          {payload[1] && payload[2] && (
            <p className="text-zinc-400 text-xs font-mono mt-1">
              Range: {payload[1].value.toExponential(2)} to {payload[2].value.toExponential(2)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5 shadow-xl shadow-black/40  flex flex-col w-full h-full min-h-[350px]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2.5">
          <Activity className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-bold tracking-tight text-zinc-200 uppercase">
            P_c VOLATILITY & DROP-OFF FORECAST
          </h3>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-sm">
          <span className="text-xs font-mono text-emerald-500">
            84% chance this threat naturally resolves below the threshold as covariance shrinks without a burn
          </span>
        </div>
      </div>

      <div className="flex-1 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mockData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
            <defs>
              <linearGradient id="colorPc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorBounds" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#334155" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#334155" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              tick={{ fill: '#64748b', fontSize: 12, fontFamily: 'monospace' }}
              tickFormatter={(val) => `T${val}h`}
            />
            <YAxis 
              scale="log" 
              domain={[1e-7, 1e-1]} 
              stroke="#64748b"
              tickFormatter={formatYAxis}
              tick={{ fill: '#64748b', fontSize: 12, fontFamily: 'monospace' }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            <ReferenceLine y={1e-4} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'NASA LIMIT (1e-4)', fill: '#ef4444', fontSize: 10, fontFamily: 'monospace' }} />
            <ReferenceLine x={-12} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'insideTopRight', value: 'MCP (T-12h)', fill: '#f59e0b', fontSize: 10, fontFamily: 'monospace' }} />
            
            <Area 
              type="monotone" 
              dataKey="upperBound" 
              stroke="none" 
              fill="url(#colorBounds)" 
            />
            <Area 
              type="monotone" 
              dataKey="lowerBound" 
              stroke="none" 
              fill="#0b1120" 
            />
            <Area 
              type="monotone" 
              dataKey="pc" 
              stroke="#22d3ee" 
              strokeWidth={3}
              fill="url(#colorPc)" 
              activeDot={{ r: 6, fill: '#22d3ee', stroke: '#083344', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
