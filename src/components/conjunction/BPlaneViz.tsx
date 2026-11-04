import React, { useState } from 'react';
import { Crosshair } from 'lucide-react';

export interface BPlaneVizProps {
  xi: number;
  zeta: number;
  missDistance: number;
  hardBodyRadius?: number;
}

export const BPlaneViz: React.FC<BPlaneVizProps> = ({
  xi,
  zeta,
  missDistance,
  hardBodyRadius = 10,
}) => {
  const [zoomMode, setZoomMode] = useState<'auto' | 'close' | 'medium' | 'wide'>('auto');
  const [hovered, setHovered] = useState(false);

  // Compute adaptive range radius in meters
  const dynamicMax = Math.max(Math.abs(xi), Math.abs(zeta), missDistance, 15);
  let effectiveRange: number;

  switch (zoomMode) {
    case 'close':
      effectiveRange = 100;
      break;
    case 'medium':
      effectiveRange = 600;
      break;
    case 'wide':
      effectiveRange = 1600;
      break;
    case 'auto':
    default:
      effectiveRange = Math.max(25, dynamicMax * 1.3);
      break;
  }

  const center = 250;
  const radius = 200; // max pixel radius
  const scale = radius / effectiveRange;

  // Screen coordinates for miss distance point (+zeta points UP, +xi points RIGHT)
  const px = center + xi * scale;
  const py = center - zeta * scale;

  // Hard Body Radius in pixels
  const hbrPx = Math.max(5, hardBodyRadius * scale);

  // Color based on proximity
  let statusColor = '#00ff88'; // green (safe)
  let statusText = 'NOMINAL';
  let badgeBg = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';

  if (missDistance < 50 || missDistance <= hardBodyRadius * 2) {
    statusColor = '#ff3355'; // red (critical)
    statusText = 'CRITICAL PROXIMITY';
    badgeBg = 'bg-red-500/10 text-red-400 border-red-500/30';
  } else if (missDistance < 200) {
    statusColor = '#ffaa00'; // yellow/amber (warning)
    statusText = 'ELEVATED RISK';
    badgeBg = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  }

  // Generate 4 concentric range rings
  const ringFractions = [0.25, 0.5, 0.75, 1.0];

  // Covariance ellipse dimensions (scaled with proximity)
  const ellipseMajor = Math.max(16, Math.min(52, 28 + effectiveRange * 0.015));
  const ellipseMinor = ellipseMajor * 0.52;
  const ellipseRotation = -32; // degrees

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40">
        <div className="flex items-center space-x-2.5">
          <Crosshair className="w-5 h-5 text-blue-400 " />
          <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
            B-PLANE ENCOUNTER GEOMETRY
          </h3>
        </div>

        {/* Zoom selector controls */}
        <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 rounded-sm p-1 text-xs">
          <span className="text-zinc-500 px-1 font-mono text-[10px] uppercase">Scale:</span>
          {(['auto', 'close', 'medium', 'wide'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setZoomMode(mode)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                zoomMode === mode
                  ? 'bg-cyan-500/20 text-blue-300 border border-cyan-500/40 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {mode === 'auto' ? 'Auto' : mode === 'close' ? '100m' : mode === 'medium' ? '600m' : '1.6km'}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative p-3 flex justify-center items-center bg-zinc-950 select-none">
        <svg
          viewBox="0 0 500 500"
          className="w-full max-w-[480px] h-auto drop-shadow-lg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="bplane-grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(0, 212, 255, 0.05)" strokeWidth="0.5" />
            </pattern>

            {/* Radial glow for center */}
            <radialGradient id="hbr-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff3355" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#ff3355" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#ff3355" stopOpacity="0" />
            </radialGradient>

            {/* Target miss point glow */}
            <radialGradient id="target-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={statusColor} stopOpacity="0.8" />
              <stop offset="100%" stopColor={statusColor} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Grid */}
          <rect width="500" height="500" fill="#070c14" />
          <rect width="500" height="500" fill="url(#bplane-grid)" />

          {/* Concentric Range Rings */}
          {ringFractions.map((frac, idx) => {
            const rPx = radius * frac;
            const distM = Math.round(effectiveRange * frac);
            return (
              <g key={`ring-${idx}`}>
                <circle
                  cx={center}
                  cy={center}
                  r={rPx}
                  fill="none"
                  stroke="rgba(0, 212, 255, 0.18)"
                  strokeWidth="0.75"
                  strokeDasharray={idx === ringFractions.length - 1 ? 'none' : '3 3'}
                />
                {/* Distance text along diagonal */}
                <text
                  x={center + rPx * 0.707 + 4}
                  y={center - rPx * 0.707 - 4}
                  fill="rgba(0, 212, 255, 0.5)"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="start"
                >
                  {distM}m
                </text>
              </g>
            );
          })}

          {/* Diagonal Guides (45 deg spokes) */}
          <line x1="108" y1="108" x2="392" y2="392" stroke="rgba(0, 212, 255, 0.08)" strokeWidth="0.75" strokeDasharray="2 4" />
          <line x1="108" y1="392" x2="392" y2="108" stroke="rgba(0, 212, 255, 0.08)" strokeWidth="0.75" strokeDasharray="2 4" />

          {/* Axes: ξ (horizontal, cross-track) and ζ (vertical, radial) */}
          <g>
            {/* Horizontal Axis (ξ) */}
            <line
              x1="30"
              y1={center}
              x2="470"
              y2={center}
              stroke="rgba(0, 212, 255, 0.65)"
              strokeWidth="1.2"
            />
            <polygon points="475,250 465,246 465,254" fill="#00d4ff" />
            <polygon points="25,250 35,246 35,254" fill="#00d4ff" opacity="0.6" />

            {/* Vertical Axis (ζ) */}
            <line
              x1={center}
              y1="470"
              x2={center}
              y2="30"
              stroke="rgba(0, 212, 255, 0.65)"
              strokeWidth="1.2"
            />
            <polygon points="250,25 246,35 254,35" fill="#00d4ff" />
            <polygon points="250,475 246,465 254,465" fill="#00d4ff" opacity="0.6" />

            {/* Axis Labels */}
            <text
              x="475"
              y="266"
              fill="#00d4ff"
              fontSize="12"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="end"
            >
              +ξ (Cross-Track)
            </text>
            <text
              x="25"
              y="266"
              fill="rgba(0, 212, 255, 0.5)"
              fontSize="10"
              fontFamily="sans-serif"
              textAnchor="start"
            >
              -ξ
            </text>
            <text
              x="262"
              y="32"
              fill="#00d4ff"
              fontSize="12"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="start"
            >
              +ζ (Radial/In-Track)
            </text>
            <text
              x="262"
              y="475"
              fill="rgba(0, 212, 255, 0.5)"
              fontSize="10"
              fontFamily="sans-serif"
              textAnchor="start"
            >
              -ζ
            </text>
          </g>

          {/* Hard Body Radius (HBR) at Center */}
          <circle
            cx={center}
            cy={center}
            r={hbrPx * 2.2}
            fill="url(#hbr-glow)"
          />
          <circle
            cx={center}
            cy={center}
            r={hbrPx}
            fill="rgba(255, 51, 85, 0.3)"
            stroke="#ff3355"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
          <circle cx={center} cy={center} r="2" fill="#ff3355" />
          <text
            x={center + hbrPx + 4}
            y={center + 12}
            fill="#ff6b81"
            fontSize="9"
            fontFamily="monospace"
            fontWeight="bold"
          >
            HBR ({hardBodyRadius}m)
          </text>

          {/* Vector Line from Primary to Debris Encounter */}
          <line
            x1={center}
            y1={center}
            x2={px}
            y2={py}
            stroke={statusColor}
            strokeWidth="1.5"
            strokeDasharray="4 2"
            opacity="0.8"
          />

          {/* 3-Sigma Covariance Ellipse */}
          <ellipse
            cx={px}
            cy={py}
            rx={ellipseMajor * 1.8}
            ry={ellipseMinor * 1.8}
            transform={`rotate(${ellipseRotation} ${px} ${py})`}
            fill="none"
            stroke={statusColor}
            strokeWidth="0.8"
            strokeDasharray="2 3"
            opacity="0.35"
          />

          {/* 1-Sigma Covariance Ellipse */}
          <ellipse
            cx={px}
            cy={py}
            rx={ellipseMajor}
            ry={ellipseMinor}
            transform={`rotate(${ellipseRotation} ${px} ${py})`}
            fill={statusColor}
            fillOpacity="0.12"
            stroke={statusColor}
            strokeWidth="1.2"
            strokeDasharray="4 2"
          />

          {/* Miss Distance Encounter Point */}
          <circle
            cx={px}
            cy={py}
            r="16"
            fill="url(#target-glow)"
          />
          <circle
            cx={px}
            cy={py}
            r="5"
            fill={statusColor}
            stroke="#0a0e1a"
            strokeWidth="1.5"
            className="cursor-pointer"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          />

          {/* Pulse ring around miss point */}
          <circle
            cx={px}
            cy={py}
            r="9"
            fill="none"
            stroke={statusColor}
            strokeWidth="1"
            opacity="0.75"
          >
            <animate
              attributeName="r"
              values="5;14;5"
              dur="2.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;0.1;0.8"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Coordinate Tag near Miss Point */}
          <g transform={`translate(${px > 300 ? px - 110 : px + 12}, ${py < 80 ? py + 22 : py - 14})`}>
            <rect
              width="100"
              height="36"
              rx="4"
              fill="rgba(10, 14, 26, 0.88)"
              stroke={statusColor}
              strokeWidth="0.75"
            />
            <text x="6" y="14" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
              ξ: {xi >= 0 ? `+${xi.toFixed(1)}` : xi.toFixed(1)}m
            </text>
            <text x="6" y="28" fill="#cbd5e1" fontSize="9" fontFamily="monospace">
              ζ: {zeta >= 0 ? `+${zeta.toFixed(1)}` : zeta.toFixed(1)}m
            </text>
          </g>

          {/* Scale Legend Indicator (Corner) */}
          <g transform="translate(18, 455)">
            <rect width="110" height="26" rx="4" fill="rgba(15, 23, 42, 0.8)" stroke="rgba(51, 65, 85, 0.6)" strokeWidth="0.5" />
            <line x1="10" y1="13" x2="50" y2="13" stroke="#00d4ff" strokeWidth="2" />
            <line x1="10" y1="9" x2="10" y2="17" stroke="#00d4ff" strokeWidth="1.5" />
            <line x1="50" y1="9" x2="50" y2="17" stroke="#00d4ff" strokeWidth="1.5" />
            <text x="58" y="16" fill="#94a3b8" fontSize="9" fontFamily="monospace">
              {(40 / scale).toFixed(0)}m bar
            </text>
          </g>
        </svg>

        {/* Hover Tooltip Overlay if active */}
        {hovered && (
          <div className="absolute top-4 left-4 bg-zinc-900/95 border border-cyan-500/50 p-2.5 rounded shadow-xl text-xs font-mono space-y-1 z-10 pointer-events-none">
            <div className="text-blue-400 font-bold">ENCOUNTER STATE</div>
            <div className="text-zinc-300">Miss Distance: <span className="text-emerald-500 font-bold">{missDistance.toFixed(2)} m</span></div>
            <div className="text-zinc-300">B-Vector (ξ, ζ): ({xi.toFixed(1)}, {zeta.toFixed(1)}) m</div>
            <div className="text-zinc-300">Dispersion: 1σ / 3σ Covariance</div>
          </div>
        )}
      </div>

      {/* Footer Readout */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-zinc-950 border-t border-zinc-900/30 text-xs font-mono">
        <div>
          <span className="text-zinc-500 text-[10px] block">MISS DISTANCE</span>
          <span className="text-zinc-100 font-bold text-sm tracking-wide">
            {missDistance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m
          </span>
        </div>
        <div>
          <span className="text-zinc-500 text-[10px] block">COORDINATE PAIR</span>
          <span className="text-blue-400 font-semibold text-xs">
            ξ: {xi.toFixed(1)} / ζ: {zeta.toFixed(1)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-zinc-500 text-[10px] block">STATUS</span>
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badgeBg}`}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
};
