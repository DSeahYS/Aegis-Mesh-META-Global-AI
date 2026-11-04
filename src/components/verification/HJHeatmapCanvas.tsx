import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { PipelineHJ } from '../../lib/apiClient';
import { formatNumberSmart, formatDurationMs } from './formatters';

interface HJHeatmapCanvasProps {
  hj: PipelineHJ;
}

export const HJHeatmapCanvas: React.FC<HJHeatmapCanvasProps> = ({ hj }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    y: number;
    v: number;
    val: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!hj || !hj.grid) return;
    const { grid, state, post_maneuver_state } = hj;
    const yArr = grid.y_m ?? [];
    const vArr = grid.v_mps ?? [];
    const values = grid.value_m ?? [];

    if (!yArr.length || !vArr.length || !values.length) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width || 600;
    const displayHeight = rect.height || 360;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    // Margins
    const marginLeft = 60;
    const marginRight = 20;
    const marginTop = 30;
    const marginBottom = 45;

    const plotW = displayWidth - marginLeft - marginRight;
    const plotH = displayHeight - marginTop - marginBottom;

    // Clear background
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const yMin = yArr[0];
    const yMax = yArr[yArr.length - 1];
    const vMin = vArr[0];
    const vMax = vArr[vArr.length - 1];

    const ySpan = yMax - yMin || 1;
    const vSpan = vMax - vMin || 1;

    // Coordinate converters
    const toCanvasX = (yVal: number) => marginLeft + ((yVal - yMin) / ySpan) * plotW;
    const toCanvasY = (vVal: number) => marginTop + plotH - ((vVal - vMin) / vSpan) * plotH;

    // Determine value extremes
    let minVal = 0;
    let maxVal = 0;
    for (let r = 0; r < values.length; r++) {
      const row = values[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (typeof val === 'number' && Number.isFinite(val)) {
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
      }
    }
    const absMin = Math.abs(minVal) || 1;
    const absMax = Math.abs(maxVal) || 1;

    // Create offscreen image buffer for grid cells
    const cols = yArr.length;
    const rows = vArr.length;

    // Draw grid cells with diverging colors
    const cellW = plotW / (cols - 1);
    const cellH = plotH / (rows - 1);

    for (let r = 0; r < rows; r++) {
      const vVal = vArr[r];
      const py = toCanvasY(vVal) - cellH / 2;

      for (let c = 0; c < cols; c++) {
        const yVal = yArr[c];
        const px = toCanvasX(yVal) - cellW / 2;
        const val = values[r]?.[c] ?? 0;

        let rCol = 0;
        let gCol = 0;
        let bCol = 0;

        if (val <= 0) {
          // Negative or zero: Backward Reachable Tube / collision risk (Red tones)
          const norm = Math.min(1, Math.abs(val) / absMin);
          rCol = Math.round(130 + norm * 125); // 130 -> 255
          gCol = Math.round(20 * (1 - norm));
          bCol = Math.round(40 * (1 - norm));
        } else {
          // Positive: Safe evasion manifold (Emerald to Cyan tones)
          const norm = Math.min(1, val / absMax);
          rCol = Math.round(16 * (1 - norm));
          gCol = Math.round(120 + norm * 110); // 120 -> 230
          bCol = Math.round(90 + norm * 140);  // 90 -> 230
        }

        ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
        ctx.fillRect(px, py, cellW + 1, cellH + 1);
      }
    }

    // Zero-level contour emphasis (V = 0 boundary between BRT and safe set)
    ctx.strokeStyle = '#fef08a'; // Bright yellow contour line
    ctx.lineWidth = 2.0;
    ctx.setLineDash([4, 2]);

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const v00 = values[r][c];
        const v01 = values[r][c + 1];
        const v10 = values[r + 1][c];

        // Horizontal crossing
        if ((v00 <= 0 && v01 > 0) || (v00 > 0 && v01 <= 0)) {
          const frac = Math.abs(v00) / (Math.abs(v00) + Math.abs(v01) || 1);
          const cx = toCanvasX(yArr[c] + frac * (yArr[c + 1] - yArr[c]));
          const cy = toCanvasY(vArr[r]);
          ctx.beginPath();
          ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        // Vertical crossing
        if ((v00 <= 0 && v10 > 0) || (v00 > 0 && v10 <= 0)) {
          const frac = Math.abs(v00) / (Math.abs(v00) + Math.abs(v10) || 1);
          const cx = toCanvasX(yArr[c]);
          const cy = toCanvasY(vArr[r] + frac * (vArr[r + 1] - vArr[r]));
          ctx.beginPath();
          ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }
    }
    ctx.setLineDash([]); // Reset line dash

    // Grid box border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

    // Coordinate Axes (v=0 and y=0 lines if in range)
    if (vMin <= 0 && vMax >= 0) {
      const y0 = toCanvasY(0);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y0);
      ctx.lineTo(marginLeft + plotW, y0);
      ctx.stroke();
    }
    if (yMin <= 0 && yMax >= 0) {
      const x0 = toCanvasX(0);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, marginTop);
      ctx.lineTo(x0, marginTop + plotH);
      ctx.stroke();
    }

    // Axes Ticks & Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    // X-axis ticks (y lateral miss)
    const xTicks = [yMin, yMin / 2, 0, yMax / 2, yMax];
    xTicks.forEach((tick) => {
      const tx = toCanvasX(tick);
      if (tx >= marginLeft && tx <= marginLeft + plotW) {
        ctx.fillText(`${tick.toFixed(0)}m`, tx, marginTop + plotH + 15);
      }
    });

    // X-axis Title
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText('Lateral Miss y (m)', marginLeft + plotW / 2, displayHeight - 8);

    // Y-axis ticks (v lateral rate)
    ctx.textAlign = 'right';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#94a3b8';
    const yTicks = [vMin, vMin / 2, 0, vMax / 2, vMax];
    yTicks.forEach((tick) => {
      const ty = toCanvasY(tick);
      if (ty >= marginTop && ty <= marginTop + plotH) {
        ctx.fillText(`${tick.toFixed(1)}`, marginLeft - 8, ty + 3);
      }
    });

    // Y-axis Title
    ctx.save();
    ctx.translate(14, marginTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText('Lateral Rate v (m/s)', 0, 0);
    ctx.restore();

    // Draw Transition Impulse Arrow from state to post_maneuver_state
    if (state && post_maneuver_state) {
      const x1 = toCanvasX(state.y_m);
      const y1 = toCanvasY(state.v_mps);
      const x2 = toCanvasX(post_maneuver_state.y_m);
      const y2 = toCanvasY(post_maneuver_state.v_mps);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 8;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    // State Markers
    // 1. Initial State (Amber dot)
    if (state) {
      const sx = toCanvasX(state.y_m);
      const sy = toCanvasY(state.v_mps);

      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`x₀ (${state.y_m.toFixed(0)}m, ${state.v_mps.toFixed(1)})`, sx + 8, sy - 4);
    }

    // 2. Post-Maneuver State (Cyber-Green Star/Dot)
    if (post_maneuver_state) {
      const px = toCanvasX(post_maneuver_state.y_m);
      const py = toCanvasY(post_maneuver_state.v_mps);

      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`x⁺ (${post_maneuver_state.y_m.toFixed(0)}m, ${post_maneuver_state.v_mps.toFixed(1)})`, px + 9, py + 12);
    }
  }, [hj]);

  useEffect(() => {
    drawHeatmap();
    window.addEventListener('resize', drawHeatmap);
    return () => window.removeEventListener('resize', drawHeatmap);
  }, [drawHeatmap]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const marginLeft = 60;
    const marginRight = 20;
    const marginTop = 30;
    const marginBottom = 45;
    const plotW = rect.width - marginLeft - marginRight;
    const plotH = rect.height - marginTop - marginBottom;

    if (mouseX < marginLeft || mouseX > marginLeft + plotW || mouseY < marginTop || mouseY > marginTop + plotH) {
      setHoverInfo(null);
      return;
    }

    const { grid } = hj;
    const yArr = grid.y_m;
    const vArr = grid.v_mps;
    const values = grid.value_m;

    if (!yArr.length || !vArr.length) return;

    const yMin = yArr[0];
    const yMax = yArr[yArr.length - 1];
    const vMin = vArr[0];
    const vMax = vArr[vArr.length - 1];

    const fracX = (mouseX - marginLeft) / plotW;
    const fracY = (marginTop + plotH - mouseY) / plotH;

    const yVal = yMin + fracX * (yMax - yMin);
    const vVal = vMin + fracY * (vMax - vMin);

    // Find nearest cell
    const cIdx = Math.max(0, Math.min(yArr.length - 1, Math.round(fracX * (yArr.length - 1))));
    const rIdx = Math.max(0, Math.min(vArr.length - 1, Math.round(fracY * (vArr.length - 1))));
    const cellVal = values[rIdx]?.[cIdx] ?? 0;

    setHoverInfo({
      y: yVal,
      v: vVal,
      val: cellVal,
      canvasX: mouseX,
      canvasY: mouseY,
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  return (
    <div className="bg-zinc-900 border border-space-700 rounded-sm p-4 space-y-3 font-mono">
      {/* Title & Legend Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-zinc-200">
            ISAACS HAMILTON-JACOBI REACHABILITY VALUE FUNCTION V(y, v, τ)
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          {/* Diverging Colormap Legend */}
          <div className="flex items-center gap-1.5">
            <span className="text-alert-red font-bold">V ≤ 0 (BRT Risk)</span>
            <div className="w-20 h-2.5 rounded bg-gradient-to-r from-red-600 via-yellow-200 to-emerald-500 border border-space-600" />
            <span className="text-cyber-green font-bold">V &gt; 0 (Safe)</span>
          </div>
        </div>
      </div>

      {/* Canvas Heatmap Plot */}
      <div className="relative w-full h-[320px] bg-zinc-950 rounded border border-zinc-800 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Floating Tooltip */}
        {hoverInfo && (
          <div
            className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full bg-zinc-900/95 border border-space-600 rounded px-2.5 py-1.5 text-[10px] text-zinc-200 shadow-xl backdrop-blur"
            style={{ left: hoverInfo.canvasX, top: hoverInfo.canvasY - 8 }}
          >
            <div>Miss y: <span className="text-blue-300 font-bold">{hoverInfo.y.toFixed(1)} m</span></div>
            <div>Rate v: <span className="text-purple-300 font-bold">{hoverInfo.v.toFixed(2)} m/s</span></div>
            <div>
              Value V: <span className={`font-bold ${hoverInfo.val > 0 ? 'text-cyber-green' : 'text-alert-red'}`}>
                {hoverInfo.val.toFixed(1)} m {hoverInfo.val > 0 ? '(SAFE)' : '(BRT HAZARD)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Numerical Certificates & Solver Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
        {/* Certificate Status */}
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
          <div className="text-[10px] text-zinc-500 uppercase font-bold">REACHABILITY CERTIFICATE</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {hj.maneuver_certified ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-cyber-green" />
                <span className="text-cyber-green font-bold">CERTIFIED SAFE</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-alert-red" />
                <span className="text-alert-red font-bold">UNCERTIFIED</span>
              </>
            )}
          </div>
        </div>

        {/* Guaranteed Miss */}
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
          <div className="text-[10px] text-zinc-500 uppercase font-bold">GUARANTEED MISS DISTANCE</div>
          <div className="text-sm font-black text-white mt-0.5">
            {formatNumberSmart(hj.maneuver_guaranteed_miss_m)} <span className="text-xs text-zinc-400 font-normal">m</span>
          </div>
          <div className="text-[9px] text-zinc-500">Worst-case d_max={hj.d_max_mps2} m/s²</div>
        </div>

        {/* BRT Containment */}
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
          <div className="text-[10px] text-zinc-500 uppercase font-bold">BACKWARD REACHABLE TUBE</div>
          <div className="text-sm font-bold mt-0.5">
            {hj.in_brt ? (
              <span className="text-alert-red">INSIDE BRT (COLLISION)</span>
            ) : (
              <span className="text-cyber-green">OUTSIDE BRT (EVADABLE)</span>
            )}
          </div>
          <div className="text-[9px] text-zinc-500">V(state) = {formatNumberSmart(hj.value_at_state_m)} m</div>
        </div>

        {/* Solver Specs */}
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
          <div className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Info className="w-3 h-3 text-blue-400" />
            ISAACS DP SOLVER
          </div>
          <div className="text-[10px] text-zinc-300 mt-0.5">
            Grid: <span className="text-blue-300">{hj.solver.grid_n}×{hj.solver.grid_n}</span> &bull; dt: <span className="text-zinc-200">{hj.solver.dt_s}s</span>
          </div>
          <div className="text-[10px] text-zinc-400">
            {hj.solver.steps} steps in <span className="text-yellow-300 font-bold">{formatDurationMs(hj.solver.solve_ms)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
