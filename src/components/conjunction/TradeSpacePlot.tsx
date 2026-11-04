import React from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Layers } from 'lucide-react';

// Generate mock trade space data
const generateTradeSpaceData = () => {
  const data = [];
  for (let i = 0; i < 150; i++) {
    // timeToTca: 1 to 24 hours
    const timeToTca = Math.random() * 23 + 1;
    
    // deltaV: 0.01 to 2.0 m/s
    const deltaV = Math.random() * 1.99 + 0.01;
    
    // Risk (Pc) calculation: more deltaV = lower risk, earlier maneuver (more time) = lower risk
    // Base risk without maneuver ~ 1e-3
    // Efficacy multiplier based on time
    const efficacy = (timeToTca / 24) * deltaV * 1.5;
    
    let pc = 1e-3 * Math.exp(-efficacy * 5);
    // Add some noise
    pc = pc * (0.8 + Math.random() * 0.4);
    
    data.push({
      timeToTca,
      deltaV,
      pc,
      id: i
    });
  }
  
  // Add the specific optimal point
  data.push({
    timeToTca: 12,
    deltaV: 0.35,
    pc: 0.5e-5,
    id: 'optimal',
    isOptimal: true
  });
  
  return data;
};

const tradeData = generateTradeSpaceData();

export const TradeSpacePlot: React.FC = () => {
  const getColorForPc = (pc: number) => {
    if (pc > 1e-4) return '#ef4444'; // Red for high risk
    if (pc > 1e-5) return '#f59e0b'; // Amber for medium risk
    return '#10b981'; // Green for safe
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-zinc-900/95 border border-zinc-700 p-3 rounded-sm shadow-xl ">
          {data.isOptimal && (
            <div className="text-blue-400 font-bold mb-1 text-xs uppercase tracking-wider">
              ★ CLM Optimal Choice
            </div>
          )}
          <p className="text-zinc-300 text-xs font-mono mb-1">
            Maneuver at: <span className="text-white">T-{data.timeToTca.toFixed(1)}h</span>
          </p>
          <p className="text-zinc-300 text-xs font-mono mb-1">
            Delta-V: <span className="text-white">{data.deltaV.toFixed(3)} m/s</span>
          </p>
          <p className="text-zinc-300 text-xs font-mono font-bold" style={{ color: getColorForPc(data.pc) }}>
            Resulting P_c: {data.pc.toExponential(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom Shape for the scatter points to highlight the optimal choice
  const CustomShape = (props: any) => {
    const { cx, cy, payload } = props;
    
    if (payload.isOptimal) {
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon 
            points="0,-8 2,-2 8,-2 3,2 5,8 0,5 -5,8 -3,2 -8,-2 -2,-2" 
            fill="#22d3ee" 
            stroke="#ffffff" 
            strokeWidth={1}
            style={{ filter: 'drop-shadow(0px 0px 4px rgba(34, 211, 238, 0.8))' }}
          />
        </g>
      );
    }
    
    return <circle cx={cx} cy={cy} r={4} fill={getColorForPc(payload.pc)} opacity={0.7} />;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5 shadow-xl shadow-black/40  flex flex-col w-full h-full min-h-[350px]">
      <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 px-3 py-1 rounded mb-2 text-center text-xs">
        Illustrative — points generated for demonstration
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2.5">
          <Layers className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-bold tracking-tight text-zinc-200 uppercase">
            MANEUVER TRADE SPACE
          </h3>
        </div>
      </div>

      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              type="number" 
              dataKey="timeToTca" 
              name="Time to TCA" 
              domain={[24, 0]} 
              reversed 
              stroke="#64748b"
              tickFormatter={(val) => `T-${val}h`}
              tick={{ fill: '#64748b', fontSize: 12, fontFamily: 'monospace' }}
              label={{ value: 'Time to TCA (Hours)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 12 }}
            />
            <YAxis 
              type="number" 
              dataKey="deltaV" 
              name="Delta-V" 
              domain={[0, 2]} 
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12, fontFamily: 'monospace' }}
              label={{ value: 'Delta-V (m/s)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
            />
            <ZAxis type="number" dataKey="pc" range={[20, 400]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
            
            <ReferenceLine x={12} stroke="#334155" strokeDasharray="3 3" label={{ position: 'top', value: 'MCP', fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} />
            
            <Scatter name="TradeSpace" data={tradeData} shape={<CustomShape />} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-2 flex items-center justify-center space-x-6 text-xs font-mono text-zinc-400">
        <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-emerald-500 opacity-70 mr-2"></div>Safe (P_c &lt; 1e-5)</div>
        <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-amber-500 opacity-70 mr-2"></div>Marginal</div>
        <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-red-500 opacity-70 mr-2"></div>High Risk</div>
        <div className="flex items-center"><div className="w-3 h-3 bg-cyan-400 mr-2 flex items-center justify-center" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'}}></div>CLM Optimal</div>
      </div>
    </div>
  );
};
