import React, { useState } from 'react';
import { Workflow } from 'lucide-react';

export interface PipelineStage {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  category: 'optical' | 'ai' | 'control' | 'physical';
  latency: string;
  description: string;
  inputs: string;
  outputs: string;
}

const STAGES: PipelineStage[] = [
  {
    id: 'star-tracker',
    number: 1,
    name: 'Star Tracker',
    subtitle: 'Optical CMOS Sensor',
    category: 'optical',
    latency: '10 Hz (100 ms)',
    description: 'Autonomous wide-field-of-view star tracker captures optical streaks of non-catalogued orbital debris against celestial star backgrounds.',
    inputs: 'Raw photon flux on 4MP sensor',
    outputs: 'Calibrated 2D pixel coordinate frames',
  },
  {
    id: 'stray-light',
    number: 2,
    name: 'Stray Light Filter',
    subtitle: 'SPICE Ephemeris Masking',
    category: 'optical',
    latency: '4.2 ms',
    description: 'Projects solar, lunar, and Earth limb exclusion cones using SPICE ephemerides to eliminate stray light glint and camera saturation.',
    inputs: 'SPICE planetary vectors & attitude quaternion',
    outputs: 'Cleaned background-subtracted image',
  },
  {
    id: 'sub-pixel',
    number: 3,
    name: 'Sub-Pixel Detection',
    subtitle: 'Hough & Radon Transform',
    category: 'optical',
    latency: '8.5 ms',
    description: 'FPGA-accelerated Radon and Hough transforms detect faint hypervelocity debris streak trajectories below 1-pixel resolution.',
    inputs: 'Background-subtracted frame',
    outputs: 'Streak vectors (centroid, length, angle)',
  },
  {
    id: 'tracklet-gen',
    number: 4,
    name: 'Tracklet Generation',
    subtitle: 'Angles-Only Orbit Est.',
    category: 'optical',
    latency: '6.1 ms',
    description: 'Correlates multi-frame streaks across sequential frames using Gooding/Gauss angles-only initial orbit determination (IOD).',
    inputs: 'Sequential streak centroids & timestamps',
    outputs: 'Preliminary orbital state & covariance',
  },
  {
    id: 'pc-calc',
    number: 5,
    name: 'P_c Calculation',
    subtitle: 'Foster & Hall B-Plane Int.',
    category: 'ai',
    latency: '3.8 ms',
    description: 'Transforms state vectors to encounter B-plane and evaluates the 2D Gaussian probability density over the combined hard-body disk.',
    inputs: 'Relative state vector & 6x6 covariance',
    outputs: 'Instantaneous collision probability (P_c)',
  },
  {
    id: 'clm-retrieval',
    number: 6,
    name: 'CLM Retrieval',
    subtitle: 'Contrastive Latent Model',
    category: 'ai',
    latency: '16 ms',
    description: 'Encodes 16-D conjunction state and retrieves optimal evasion maneuver from quantized 75MB action cache via cosine similarity.',
    inputs: '16-D normalized encounter state embedding',
    outputs: 'Ranked candidate ΔV vectors & burn timings',
  },
  {
    id: 'epg-val',
    number: 7,
    name: 'EPG Validation',
    subtitle: 'Semantic Plan Verification',
    category: 'control',
    latency: '5.4 ms',
    description: 'Verifies candidate maneuver against satellite operational constraints: solar panel orientation, battery reserves, and downlink pointing.',
    inputs: 'Retrieved maneuver action & subsystem states',
    outputs: 'Constraint-compliant maneuver envelope',
  },
  {
    id: 'cbf-filter',
    number: 8,
    name: 'CBF Safety Filter',
    subtitle: 'Control Barrier Functions',
    category: 'control',
    latency: '2.1 ms',
    description: 'Enforces hard forward invariance using Control Barrier Functions (CBF), guaranteeing zero collision trajectory during thrust burn.',
    inputs: 'Maneuver trajectory & debris boundary cone',
    outputs: 'Safety-certified control vector u(t)',
  },
  {
    id: 'hj-reachability',
    number: 9,
    name: 'HJ Reachability',
    subtitle: 'Hamilton-Jacobi Verification',
    category: 'control',
    latency: '7.6 ms',
    description: 'Solves Hamilton-Jacobi-Isaacs PDE backward reachability set to guarantee no secondary conjunctions with other catalogued debris.',
    inputs: 'Post-burn orbit & secondary catalog objects',
    outputs: 'Conjunction-free certification token',
  },
  {
    id: 'thruster-act',
    number: 10,
    name: 'Thruster Actuation',
    subtitle: 'Cold-Gas / Ion Firing',
    category: 'physical',
    latency: 'Deterministic HW',
    description: 'Direct FPGA PWM firing command to cold-gas reaction control system (RCS) or high-Isp electric propulsion thrusters.',
    inputs: 'Safety-certified ΔV firing parameters',
    outputs: 'Orbital deviation & trajectory correction',
  },
];

export const PipelineDiagram: React.FC = () => {
  const [selectedStage, setSelectedStage] = useState<PipelineStage>(STAGES[5]); // Default to CLM

  const getCategoryColor = (cat: PipelineStage['category']) => {
    switch (cat) {
      case 'optical':
        return {
          stroke: '#00d4ff',
          bg: 'rgba(0, 212, 255, 0.12)',
          border: 'border-cyan-500/40',
          badge: 'bg-cyan-500/20 text-blue-300 border-cyan-500/30',
          text: 'text-blue-400',
        };
      case 'ai':
        return {
          stroke: '#00ff88',
          bg: 'rgba(0, 255, 136, 0.12)',
          border: 'border-emerald-500/40',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          text: 'text-emerald-500',
        };
      case 'control':
        return {
          stroke: '#ffaa00',
          bg: 'rgba(255, 170, 0, 0.12)',
          border: 'border-amber-500/40',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          text: 'text-amber-400',
        };
      case 'physical':
        return {
          stroke: '#ff3355',
          bg: 'rgba(255, 51, 85, 0.12)',
          border: 'border-red-500/40',
          badge: 'bg-red-500/20 text-red-300 border-red-500/30',
          text: 'text-red-400',
        };
    }
  };

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40 gap-3">
        <div className="flex items-center space-x-2.5">
          <Workflow className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
              EDGE AI PROCESSING PIPELINE
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              END-TO-END AUTONOMOUS OPTICAL DETECTION TO SAFE THRUSTER ACTUATION
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-zinc-300">Optical Sensing</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-300">AI / ML</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-zinc-300">Control & Safety</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-zinc-300">Actuation</span>
          </div>
        </div>
      </div>

      {/* Pipeline SVG Graphic (Serpentine 2-Row Flow) */}
      <div className="p-4 bg-zinc-950 overflow-x-auto">
        <div className="min-w-[860px]">
          <svg
            viewBox="0 0 920 270"
            className="w-full h-auto select-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Arrow Marker Definitions */}
              <marker id="arrow-cyan" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#00d4ff" />
              </marker>
              <marker id="arrow-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#00ff88" />
              </marker>
              <marker id="arrow-amber" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#ffaa00" />
              </marker>
              <marker id="arrow-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#ff3355" />
              </marker>
            </defs>

            {/* Row 1: Stages 1 to 5 (y = 20) */}
            {STAGES.slice(0, 5).map((stage, idx) => {
              const x = 15 + idx * 178;
              const y = 20;
              const isSelected = selectedStage.id === stage.id;
              const catColors = getCategoryColor(stage.category);

              return (
                <g
                  key={stage.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedStage(stage)}
                >
                  {/* Card Background */}
                  <rect
                    x={x}
                    y={y}
                    width="150"
                    height="85"
                    rx="10"
                    fill={isSelected ? '#131e36' : '#0d1527'}
                    stroke={isSelected ? '#ffffff' : catColors.stroke}
                    strokeWidth={isSelected ? 2.5 : 1.2}
                    filter={isSelected ? 'drop-shadow(0 0 8px rgba(0,212,255,0.4))' : undefined}
                  />

                  {/* Stage Number Badge */}
                  <circle cx={x + 18} cy={y + 18} r="10" fill={catColors.stroke} fillOpacity="0.25" />
                  <text x={x + 18} y={y + 22} fill={catColors.stroke} fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {stage.number}
                  </text>

                  {/* Stage Latency Pill */}
                  <rect x={x + 82} y={y + 10} width="58" height="16" rx="4" fill="rgba(15,23,42,0.8)" stroke="rgba(71,85,105,0.5)" strokeWidth="0.5" />
                  <text x={x + 111} y={y + 21} fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">
                    {stage.latency}
                  </text>

                  {/* Stage Title */}
                  <text x={x + 12} y={y + 48} fill="#f1f5f9" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                    {stage.name}
                  </text>

                  {/* Subtitle */}
                  <text x={x + 12} y={y + 65} fill="rgba(148,163,184,0.8)" fontSize="8.5" fontFamily="monospace">
                    {stage.subtitle}
                  </text>

                  {/* Connector Arrow to next card in Row 1 */}
                  {idx < 4 && (
                    <line
                      x1={x + 150}
                      y1={y + 42}
                      x2={x + 172}
                      y2={y + 42}
                      stroke={catColors.stroke}
                      strokeWidth="1.5"
                      markerEnd={`url(#arrow-${stage.category === 'optical' ? 'cyan' : 'green'})`}
                    />
                  )}
                </g>
              );
            })}

            {/* Transition Elbow from Stage 5 to Stage 6 (Wrap from Row 1 end down to Row 2 start) */}
            <path
              d="M 877 62 L 905 62 Q 912 62 912 72 L 912 135 Q 912 145 905 145 L 8 145 Q 2 145 2 155 L 2 195 Q 2 205 10 205 L 14 205"
              fill="none"
              stroke="#00ff88"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />

            {/* Row 2: Stages 6 to 10 (y = 160) */}
            {STAGES.slice(5, 10).map((stage, idx) => {
              const x = 15 + idx * 178;
              const y = 160;
              const isSelected = selectedStage.id === stage.id;
              const isClm = stage.id === 'clm-retrieval';
              const catColors = getCategoryColor(stage.category);

              return (
                <g
                  key={stage.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedStage(stage)}
                >
                  {/* Card Background */}
                  <rect
                    x={x}
                    y={y}
                    width="150"
                    height="85"
                    rx="10"
                    fill={isSelected ? '#131e36' : isClm ? '#0d1f2d' : '#0d1527'}
                    stroke={isClm ? '#00ff88' : isSelected ? '#ffffff' : catColors.stroke}
                    strokeWidth={isClm ? 2.5 : isSelected ? 2.5 : 1.2}
                    filter={isClm || isSelected ? 'drop-shadow(0 0 10px rgba(0,255,136,0.35))' : undefined}
                  />

                  {/* Stage Number Badge */}
                  <circle cx={x + 18} cy={y + 18} r="10" fill={catColors.stroke} fillOpacity="0.25" />
                  <text x={x + 18} y={y + 22} fill={catColors.stroke} fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    {stage.number}
                  </text>

                  {/* Latency Pill */}
                  <rect
                    x={x + 76}
                    y={y + 10}
                    width={isClm ? 64 : 60}
                    height="16"
                    rx="4"
                    fill={isClm ? 'rgba(0, 255, 136, 0.2)' : 'rgba(15,23,42,0.8)'}
                    stroke={isClm ? '#00ff88' : 'rgba(71,85,105,0.5)'}
                    strokeWidth={isClm ? 1 : 0.5}
                  />
                  <text
                    x={x + (isClm ? 108 : 106)}
                    y={y + 21}
                    fill={isClm ? '#00ff88' : '#94a3b8'}
                    fontSize="8.5"
                    fontWeight={isClm ? 'bold' : 'normal'}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {stage.latency}
                  </text>

                  {/* Stage Title */}
                  <text x={x + 12} y={y + 48} fill="#f1f5f9" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                    {stage.name}
                  </text>

                  {/* Subtitle */}
                  <text x={x + 12} y={y + 65} fill="rgba(148,163,184,0.8)" fontSize="8.5" fontFamily="monospace">
                    {stage.subtitle}
                  </text>

                  {/* Highlight Ribbon for CLM Stage */}
                  {isClm && (
                    <g transform={`translate(${x + 12}, ${y + 73})`}>
                      <text fill="#00ff88" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                        ★ CLM 16ms HARD REAL-TIME
                      </text>
                    </g>
                  )}

                  {/* Connector Arrow to next card in Row 2 */}
                  {idx < 4 && (
                    <line
                      x1={x + 150}
                      y1={y + 42}
                      x2={x + 172}
                      y2={y + 42}
                      stroke={catColors.stroke}
                      strokeWidth="1.5"
                      markerEnd={`url(#arrow-${stage.category === 'ai' ? 'green' : stage.category === 'control' ? 'amber' : 'red'})`}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Selected Stage Detail Drawer */}
      <div className="p-4 bg-zinc-950/95 border-t border-zinc-900/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <span
              className={`w-7 h-7 rounded-sm flex items-center justify-center font-mono font-bold text-xs ${
                getCategoryColor(selectedStage.category).badge
              }`}
            >
              {selectedStage.number}
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-white font-mono">{selectedStage.name}</h4>
                <span className="text-zinc-500 font-mono text-xs">({selectedStage.subtitle})</span>
              </div>
              <span className={`text-[10px] font-mono uppercase ${getCategoryColor(selectedStage.category).text}`}>
                CATEGORY: {selectedStage.category.toUpperCase()} • LATENCY: {selectedStage.latency}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">
              Deterministic Verification: 100%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 text-xs font-mono">
          <div className="md:col-span-2 space-y-1">
            <span className="text-zinc-400 text-[10px] block font-sans uppercase tracking-wider">
              OPERATIONAL SPECIFICATION
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed font-sans">
              {selectedStage.description}
            </p>
          </div>

          <div className="space-y-2 bg-zinc-900 p-3 rounded-sm border border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-500 block">DATA INPUTS:</span>
              <span className="text-blue-300 text-[11px] block">{selectedStage.inputs}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block">DATA OUTPUTS:</span>
              <span className="text-emerald-300 text-[11px] block">{selectedStage.outputs}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
