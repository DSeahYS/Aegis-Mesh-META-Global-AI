import React from 'react';
import { Gauge, AlertTriangle, ShieldCheck, AlertOctagon } from 'lucide-react';

export interface PcGaugeProps {
  pc: number;
  threshold?: number;
  missDistance?: number;
}

export const PcGauge: React.FC<PcGaugeProps> = ({
  pc,
  threshold = 1e-4,
  missDistance,
}) => {
  const isExceeded = pc >= threshold;
  
  const showDilutionWarning = missDistance !== undefined && missDistance < 800 && pc < 1e-4;

  // Logarithmic scale mapping: 1e-7 to 1e-1
  const logMin = -7;
  const logMax = -1;
  const safePc = Math.max(1e-8, Math.min(1.0, pc));
  const logPc = Math.log10(safePc);

  // Normalized value from 0 (at 1e-7) to 1 (at 1e-1)
  const t = Math.max(0, Math.min(1, (logPc - logMin) / (logMax - logMin)));

  // Threshold normalized position
  const logThreshold = Math.log10(threshold);
  const tThreshold = Math.max(0, Math.min(1, (logThreshold - logMin) / (logMax - logMin)));

  // SVG dimensions & geometry
  const cx = 160;
  const cy = 135;
  const r = 95;
  const strokeWidth = 14;

  // Angle from 180 deg (pi rad, left) to 0 deg (0 rad, right)
  // angle = 180 - t * 180
  const needleAngleDeg = 180 - t * 180;
  const needleAngleRad = (needleAngleDeg * Math.PI) / 180;

  // Needle tip coordinates
  const needleLen = r - 12;
  const needleTipX = cx + needleLen * Math.cos(needleAngleRad);
  const needleTipY = cy - needleLen * Math.sin(needleAngleRad);

  // Threshold tick coordinates
  const threshAngleRad = Math.PI - tThreshold * Math.PI;
  const threshInnerX = cx + (r - strokeWidth / 2 - 4) * Math.cos(threshAngleRad);
  const threshInnerY = cy - (r - strokeWidth / 2 - 4) * Math.sin(threshAngleRad);
  const threshOuterX = cx + (r + strokeWidth / 2 + 8) * Math.cos(threshAngleRad);
  const threshOuterY = cy - (r + strokeWidth / 2 + 8) * Math.sin(threshAngleRad);

  // Format scientific notation
  const expStr = pc.toExponential(2);
  const [mantissa, exponent] = expStr.split('e');
  const expNumber = parseInt(exponent, 10);

  // Format superscripts for aesthetic display
  const toSuperscript = (num: number) => {
    const supChars: Record<string, string> = {
      '-': '⁻',
      '0': '⁰',
      '1': '¹',
      '2': '²',
      '3': '³',
      '4': '⁴',
      '5': '⁵',
      '6': '⁶',
      '7': '⁷',
      '8': '⁸',
      '9': '⁹',
    };
    return num.toString().split('').map((c) => supChars[c] || c).join('');
  };

  // Color scheme based on severity
  let readoutColor = 'text-emerald-500';
  if (pc >= 1e-2) {
    readoutColor = 'text-red-400 ';
  } else if (pc >= threshold) {
    readoutColor = 'text-red-400';
  } else if (pc >= 1e-5) {
    readoutColor = 'text-amber-400';
  }

  // Semicircle background arc path: M (cx-r), cy A r r 0 0 1 (cx+r), cy
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div
      className={`flex flex-col bg-zinc-950 rounded-sm overflow-hidden shadow-xl transition-all duration-300 border ${
        isExceeded
          ? 'border-red-500/60 shadow-md'
          : 'border-zinc-950/80'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900 border-b border-zinc-900/40">
        <div className="flex items-center space-x-2">
          <Gauge className={`w-4 h-4 ${isExceeded ? 'text-red-400 ' : 'text-blue-400'}`} />
          <h3 className="text-xs font-semibold tracking-wider text-zinc-100 uppercase">
            COLLISION PROBABILITY (P_C)
          </h3>
        </div>

        {isExceeded ? (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold tracking-wide ">
            <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
            <span>THRESHOLD EXCEEDED</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/50 text-emerald-500 text-[10px] font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ACCEPTABLE RISK</span>
          </div>
        )}
      </div>

      {/* Dial SVG Area */}
      <div className="relative pt-2 pb-0 flex flex-col items-center justify-center bg-zinc-950">
        <svg
          viewBox="0 0 320 160"
          className="w-full max-w-[320px] h-auto select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Color spectrum gradient for probability arc */}
            <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00ff88" />
              <stop offset="35%" stopColor="#80e040" />
              <stop offset="50%" stopColor="#ffaa00" />
              <stop offset="75%" stopColor="#ff6633" />
              <stop offset="100%" stopColor="#ff3355" />
            </linearGradient>

            {/* Glowing filter for high risk needle */}
            <filter id="needle-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={isExceeded ? '#ff3355' : '#00d4ff'} />
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcPath}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth + 4}
            strokeLinecap="round"
          />

          {/* Semicircle Gradient Arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="url(#gauge-gradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Scale Tick Marks */}
          {[
            { logVal: -7, label: '10⁻⁷' },
            { logVal: -6, label: '10⁻⁶' },
            { logVal: -5, label: '10⁻⁵' },
            { logVal: -4, label: '10⁻⁴' },
            { logVal: -3, label: '10⁻³' },
            { logVal: -2, label: '10⁻²' },
            { logVal: -1, label: '10⁻¹' },
          ].map(({ logVal, label }) => {
            const frac = (logVal - logMin) / (logMax - logMin);
            const ang = Math.PI - frac * Math.PI;
            const x1 = cx + (r - strokeWidth / 2 - 2) * Math.cos(ang);
            const y1 = cy - (r - strokeWidth / 2 - 2) * Math.sin(ang);
            const x2 = cx + (r - strokeWidth / 2 - 8) * Math.cos(ang);
            const y2 = cy - (r - strokeWidth / 2 - 8) * Math.sin(ang);

            const tx = cx + (r - 28) * Math.cos(ang);
            const ty = cy - (r - 28) * Math.sin(ang);

            return (
              <g key={`tick-${logVal}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(203, 213, 225, 0.4)"
                  strokeWidth="1"
                />
                <text
                  x={tx}
                  y={ty + 3}
                  fill="rgba(148, 163, 184, 0.7)"
                  fontSize="7.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Threshold Marker Indicator */}
          <g>
            <line
              x1={threshInnerX}
              y1={threshInnerY}
              x2={threshOuterX}
              y2={threshOuterY}
              stroke="#ff3355"
              strokeWidth="2.5"
              strokeDasharray="2 1"
            />
            <circle cx={threshOuterX} cy={threshOuterY} r="2.5" fill="#ff3355" />
            <text
              x={threshOuterX}
              y={threshOuterY - 5}
              fill="#ff6b81"
              fontSize="8"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="middle"
            >
              LIMIT: 1e-4
            </text>
          </g>

          {/* Gauge Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={needleTipX}
            y2={needleTipY}
            stroke={isExceeded ? '#ff3355' : '#00d4ff'}
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#needle-glow)"
          />

          {/* Needle Base Hub */}
          <circle cx={cx} cy={cy} r="7" fill="#1e293b" stroke={isExceeded ? '#ff3355' : '#00d4ff'} strokeWidth="2" />
          <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
        </svg>

        {/* Value Readout in Scientific Notation */}
        <div className="flex flex-col items-center justify-center -mt-3 pb-3">
          <div className="text-[11px] font-mono text-zinc-400 tracking-wider uppercase">
            CALCULATED VALUE
          </div>
          <div className={`text-2xl font-mono font-bold tracking-tight ${readoutColor}`}>
            {mantissa} × 10{toSuperscript(expNumber)}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            Decimal: {pc < 0.0001 ? pc.toFixed(7) : pc.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Threshold Status Banner */}
      <div className={`px-4 py-2 border-t text-xs font-mono flex items-center justify-between ${
        isExceeded
          ? 'bg-red-950/40 border-red-500/40 text-red-300'
          : 'bg-zinc-950 border-zinc-900/30 text-zinc-400'
      }`}>
        <div className="flex items-center space-x-1.5">
          {isExceeded ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
          <span>
            {isExceeded
              ? 'Maneuver Required: P_c exceeds NASA 1.0e-4 limit'
              : 'Passes safety rule: P_c within acceptable margin'}
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 uppercase">
          T_EXEC: IMMEDIATE
        </span>
      </div>

      {showDilutionWarning && (
        <div className="px-4 py-3 bg-orange-950/60 border-t border-orange-500/50 flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-orange-300 text-[10px] font-mono leading-relaxed">
            <span className="font-bold text-orange-400">WARNING: DILUTION REGION DETECTED.</span> Probability density artificially diluted by high sensor uncertainty (large covariance).
          </p>
        </div>
      )}
    </div>
  );
};
