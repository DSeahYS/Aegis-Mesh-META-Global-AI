import React, { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Target, Compass, Sparkles, AlertCircle } from 'lucide-react';
import { projectTo2D, getActionMetadata } from '../../lib/clmInferenceEngine';

export interface LatentSpaceVizProps {
  stateVector: number[];
  topActions: number[][];
  topIndices?: number[];
  similarities?: number[];
  selectedIndex?: number | null;
  onSelectAction?: (actionIndex: number) => void;
}

interface LatentPoint {
  x: number;
  y: number;
  z: number;
  name: string;
  isState: boolean;
  rank?: number;
  actionIdx?: number;
  similarity?: number;
  category?: string;
  distanceToState?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: LatentPoint;
  }>;
}

const CustomLatentTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-zinc-950/95 border border-cyan-500/50 rounded-sm p-3 shadow-xl shadow-black/40  text-xs font-mono text-zinc-200 min-w-[210px] space-y-1.5 z-50">
      <div className="flex items-center justify-between pb-1 border-b border-zinc-700/80">
        <span className={`font-bold flex items-center gap-1.5 ${point.isState ? 'text-rose-400' : 'text-blue-300'}`}>
          {point.isState ? <Target className="w-3.5 h-3.5 text-rose-400" /> : <Sparkles className="w-3.5 h-3.5 text-blue-400" />}
          {point.name}
        </span>
        {point.rank && (
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/40">
            Rank #{point.rank}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-400 pt-0.5">
        <div>Latent z₁ (PC1):</div>
        <div className="text-right text-zinc-200 font-bold">{point.x.toFixed(4)}</div>
        <div>Latent z₂ (PC2):</div>
        <div className="text-right text-zinc-200 font-bold">{point.y.toFixed(4)}</div>
      </div>

      {!point.isState && (
        <div className="pt-1.5 border-t border-zinc-800 text-[10px] space-y-1">
          {point.similarity !== undefined && (
            <div className="flex justify-between">
              <span className="text-zinc-400">InfoNCE Similarity:</span>
              <span className="text-emerald-500 font-bold">{point.similarity.toFixed(4)}</span>
            </div>
          )}
          {point.distanceToState !== undefined && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Dist to State (‖Δz‖):</span>
              <span className="text-amber-300 font-bold">{point.distanceToState.toFixed(4)}</span>
            </div>
          )}
          {point.category && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Class:</span>
              <span className="text-purple-300 uppercase">{point.category}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const LatentSpaceViz: React.FC<LatentSpaceVizProps> = ({
  stateVector,
  topActions,
  topIndices,
  similarities,
  selectedIndex = null,
  onSelectAction,
}) => {
  // Project State Vector to 2D using PCA coordinates
  const state2D = useMemo(() => {
    return projectTo2D(stateVector);
  }, [stateVector]);

  // Project Action Vectors to 2D
  const actionsData = useMemo<LatentPoint[]>(() => {
    return topActions.map((actionVec, idx) => {
      const coords = projectTo2D(actionVec);
      const actionIdx = topIndices ? topIndices[idx] : idx;
      const meta = getActionMetadata(actionIdx);
      const sim = similarities ? similarities[idx] : undefined;

      const dx = coords[0] - state2D[0];
      const dy = coords[1] - state2D[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      return {
        x: coords[0],
        y: coords[1],
        z: 1,
        name: meta.label,
        isState: false,
        rank: idx + 1,
        actionIdx,
        similarity: sim,
        category: meta.category,
        distanceToState: dist,
      };
    });
  }, [topActions, topIndices, similarities, state2D]);

  const statePoint = useMemo<LatentPoint[]>(() => {
    return [
      {
        x: state2D[0],
        y: state2D[1],
        z: 2,
        name: 'State Vector (z_s)',
        isState: true,
      },
    ];
  }, [state2D]);

  // Find nearest action to the state vector
  const nearestAction = actionsData.length > 0 ? actionsData[0] : null;

  return (
    <div className="bg-zinc-950 border border-zinc-950/80 rounded-sm p-4 shadow-xl text-zinc-100 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2 font-mono">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            2D Latent Manifold Projection (PCA Subspace)
          </h3>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 shadow-md " />
            <span className="text-rose-300 font-bold">State Vector</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-sky-400" />
            <span className="text-blue-300">Action Candidates</span>
          </div>
        </div>
      </div>

      {/* Main 2D Latent Scatter Chart */}
      <div className="w-full h-72 sm:h-80 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 25, bottom: 20, left: 10 }}>
            <XAxis
              type="number"
              dataKey="x"
              name="PC1"
              domain={['auto', 'auto']}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={{ stroke: '#334155' }}
              tickLine={{ stroke: '#334155' }}
              label={{
                value: 'Principal Component 1 (z₁)',
                position: 'insideBottom',
                offset: -12,
                fill: '#94a3b8',
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="PC2"
              domain={['auto', 'auto']}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={{ stroke: '#334155' }}
              tickLine={{ stroke: '#334155' }}
              label={{
                value: 'Principal Component 2 (z₂)',
                angle: -90,
                position: 'insideLeft',
                offset: 5,
                fill: '#94a3b8',
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            />
            <ZAxis type="number" dataKey="z" range={[50, 160]} />
            <Tooltip content={<CustomLatentTooltip />} />

            {/* Action Candidates Scatter Points (Blue / Sky) */}
            <Scatter
              name="Action Embeddings"
              data={actionsData}
              onClick={(node) => {
                if (node && node.actionIdx !== undefined && onSelectAction) {
                  onSelectAction(node.actionIdx);
                }
              }}
              cursor="pointer"
            >
              {actionsData.map((entry, index) => {
                const isSelected = selectedIndex === entry.actionIdx;
                const isTop1 = index === 0;

                let fillColor = '#38bdf8'; // Sky blue
                if (isSelected) {
                  fillColor = '#facc15'; // Amber selected
                } else if (isTop1) {
                  fillColor = '#10b981'; // Top 1 Emerald match
                } else if (index < 4) {
                  fillColor = '#60a5fa'; // Light blue top contingency
                } else {
                  fillColor = '#2563eb'; // Deep blue
                }

                return (
                  <Cell
                    key={`action-dot-${index}`}
                    fill={fillColor}
                    stroke={isSelected || isTop1 ? '#ffffff' : '#0f172a'}
                    strokeWidth={isSelected || isTop1 ? 2 : 1}
                  />
                );
              })}
            </Scatter>

            {/* State Vector Scatter Point (Red Dot) */}
            <Scatter name="State Vector" data={statePoint}>
              <Cell
                fill="#f43f5e"
                stroke="#ffe4e6"
                strokeWidth={2.5}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Cluster Affinity Proximity Footer */}
      <div className="mt-2 p-2.5 rounded-sm bg-zinc-950 border border-zinc-800 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-zinc-400 text-[11px]">
            Latent Clustering:
          </span>
          {nearestAction ? (
            <span className="text-white text-[11px]">
              State aligns with <span className="text-emerald-500 font-bold">{nearestAction.name}</span> cluster
              (‖Δz‖ = <span className="text-blue-300 font-bold">{nearestAction.distanceToState?.toFixed(3)}</span>)
            </span>
          ) : (
            <span className="text-zinc-500 text-[11px]">Evaluating latent manifold...</span>
          )}
        </div>

        <div className="text-[10px] text-zinc-500 self-end sm:self-auto">
          State: [{state2D[0].toFixed(2)}, {state2D[1].toFixed(2)}] ∈ ℝ²
        </div>
      </div>
    </div>
  );
};

export default LatentSpaceViz;
