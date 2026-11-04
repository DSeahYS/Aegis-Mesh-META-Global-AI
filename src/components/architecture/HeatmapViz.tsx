import React, { useState } from 'react';
import { Flame, Layers, Award } from 'lucide-react';
import { getActionMetadata } from '../../lib/clmInferenceEngine';

export interface HeatmapVizProps {
  similarities: number[];
  topIndices?: number[];
  selectedIndex?: number | null;
  onSelectAction?: (actionIndex: number) => void;
  title?: string;
  temperature?: number;
}

export const HeatmapViz: React.FC<HeatmapVizProps> = ({
  similarities,
  topIndices,
  selectedIndex = null,
  onSelectAction,
  title = 'InfoNCE Contrastive Similarity Matrix (Top 64 Actions)',
  temperature = 0.07,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Take top 64 actions for 8x8 matrix display
  const displayCount = Math.min(64, similarities.length);
  const displayScores = similarities.slice(0, displayCount);

  const minScore = displayScores.length > 0 ? Math.min(...displayScores) : -1;
  const maxScore = displayScores.length > 0 ? Math.max(...displayScores) : 1;
  const scoreRange = Math.max(1e-5, maxScore - minScore);

  // Map normalized similarity [0, 1] to Tailwind classes
  const getColorClass = (val: number, isSelected: boolean) => {
    const norm = (val - minScore) / scoreRange;

    if (isSelected) {
      return 'bg-yellow-400 border-yellow-200 text-slate-950 font-bold shadow-md ring-1 ring-yellow-500/50';
    }

    if (norm >= 0.85) {
      return 'bg-red-500 border-red-400 text-white font-bold shadow-md';
    }
    if (norm >= 0.70) {
      return 'bg-amber-500 border-amber-400 text-slate-950 font-semibold';
    }
    if (norm >= 0.50) {
      return 'bg-amber-600/80 border-amber-500/70 text-amber-100';
    }
    if (norm >= 0.35) {
      return 'bg-teal-700/80 border-teal-500/60 text-teal-100';
    }
    if (norm >= 0.20) {
      return 'bg-zinc-900/90 border-cyan-700/60 text-cyan-200';
    }
    if (norm >= 0.10) {
      return 'bg-zinc-950 border-zinc-800/60 text-blue-300';
    }
    return 'bg-zinc-950 border-zinc-800 text-zinc-500';
  };

  const activeHover = hoveredIdx !== null ? {
    score: displayScores[hoveredIdx] ?? 0,
    actionIdx: topIndices ? topIndices[hoveredIdx] : hoveredIdx,
    rank: hoveredIdx + 1,
  } : null;

  const activeMeta = activeHover?.actionIdx !== undefined ? getActionMetadata(activeHover.actionIdx) : null;

  return (
    <div className="bg-zinc-950 border border-zinc-950/80 rounded-sm p-4 shadow-xl text-zinc-100 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2 font-mono">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-zinc-400">
            Peak: <span className="text-emerald-300 font-bold">{maxScore.toFixed(3)}</span>
          </span>
          <span className="text-zinc-400">
            Floor: <span className="text-blue-400 font-bold">{minScore.toFixed(3)}</span>
          </span>
          <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/40 text-purple-300 text-[10px]">
            τ = {temperature.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 8x8 Contrastive Heatmap Matrix */}
      <div className="mt-4 flex flex-col items-center">
        <div className="w-full max-w-[420px]">
          {/* Top Axis Rank Labels */}
          <div className="grid grid-cols-8 gap-1 mb-1 text-[9px] font-mono text-zinc-500 text-center">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i}>+{i}</span>
            ))}
          </div>

          {/* Grid Container */}
          <div className="grid grid-cols-8 gap-1 bg-zinc-950 p-1.5 rounded-sm border border-zinc-800">
            {displayScores.map((score, idx) => {
              const actionCodebookIdx = topIndices ? topIndices[idx] : idx;
              const isSelected = selectedIndex === actionCodebookIdx;
              const isTop1 = idx === 0;

              return (
                <button
                  key={idx}
                  type="button"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => onSelectAction?.(actionCodebookIdx)}
                  className={`relative aspect-square rounded-[3px] border transition-all duration-150 flex items-center justify-center cursor-pointer group ${getColorClass(
                    score,
                    isSelected
                  )}`}
                  title={`Rank #${idx + 1} | Action ${actionCodebookIdx} | Sim: ${score.toFixed(3)}`}
                >
                  {isTop1 && (
                    <Award className="w-3 h-3 text-white absolute drop-shadow-md " />
                  )}
                  <span className="text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover / Selection Inspection Strip */}
      <div className="mt-3.5 min-h-[46px] p-2.5 rounded-sm bg-zinc-950 border border-zinc-800 font-mono text-xs flex items-center justify-between">
        {activeHover && activeMeta ? (
          <div className="flex flex-wrap items-center justify-between w-full gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 text-blue-300 font-bold border border-zinc-800/50">
                Rank #{activeHover.rank}
              </span>
              <span className="text-white font-bold">{activeMeta.label}</span>
              <span className="text-zinc-400 text-[10px] uppercase">({activeMeta.category})</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-zinc-400">
                Similarity: <span className="text-emerald-500 font-bold">{activeHover.score.toFixed(4)}</span>
              </span>
              <span className="text-zinc-400">
                Δv: <span className="text-blue-300 font-bold">{activeMeta.deltaV.magnitude} m/s</span>
              </span>
              <span className="text-zinc-400">
                Fuel: <span className="text-amber-300">{activeMeta.fuelCostKg} kg</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Hover over any of the 64 matrix cells to inspect manifold dot-product & maneuver telemetry.</span>
          </div>
        )}
      </div>

      {/* Thermal Gradient Legend */}
      <div className="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span>Orthogonal / Low</span>
          <div className="h-2 w-28 rounded bg-gradient-to-r from-blue-950 via-teal-700 via-amber-500 to-red-500 border border-zinc-700" />
          <span>High Contrast Alignment</span>
        </div>
        <span className="text-zinc-500">64 / 256 Quantized Subspace</span>
      </div>
    </div>
  );
};

export default HeatmapViz;
