import React, { useState } from 'react';
import constellationData from '../../data/constellation.json';
import { Network, Cpu, Battery, Radio } from 'lucide-react';

export interface ConstellationNode {
  id: string;
  name: string;
  orbitalElements: {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    raan: number;
    argumentOfPerigee: number;
    trueAnomaly: number;
  };
  status: string;
  hardware: {
    processor: string;
    power: number;
    memory: number;
  };
  health: {
    powerLevel: number;
    radiationDose: number;
    computeLoad: number;
    fuelRemaining: number;
  };
}

const satellites = constellationData as ConstellationNode[];

interface GraphLink {
  from: string;
  to: string;
  sourceIdx: number;
  targetIdx: number;
  type: 'intra-plane' | 'cross-plane';
}

export const TopologyGraph: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('AEGIS-04'); // default to alert node

  const N = satellites.length;
  const svgWidth = 600;
  const svgHeight = 520;
  const cx = svgWidth / 2;
  const cy = svgHeight / 2 - 10;
  const radius = 195;

  // Compute node coordinates along circular constellation perimeter
  const nodePositions = satellites.map((sat, i) => {
    const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
    return {
      sat,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
    };
  });

  // Build links: intra-ring (neighbors) and cross-plane (inter-orbit)
  const links: GraphLink[] = [];
  const linkKeySet = new Set<string>();

  const addLink = (i: number, j: number, type: 'intra-plane' | 'cross-plane') => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (!linkKeySet.has(key)) {
      linkKeySet.add(key);
      links.push({
        from: satellites[i].id,
        to: satellites[j].id,
        sourceIdx: i,
        targetIdx: j,
        type,
      });
    }
  };

  // Ring neighbors
  for (let i = 0; i < N; i++) {
    addLink(i, (i + 1) % N, 'intra-plane');
  }

  // Cross-plane ISL links (e.g. Plane 1 (0-3), Plane 2 (4-7), Plane 3 (8-11))
  for (let i = 0; i < 4; i++) {
    addLink(i, i + 4, 'cross-plane');
    addLink(i + 4, i + 8, 'cross-plane');
    addLink(i, (i + 6) % N, 'cross-plane');
  }

  // Get selected node details
  const selectedNode = satellites.find((s) => s.id === selectedNodeId) || satellites[0];

  const getNodeColor = (status: string) => {
    switch (status) {
      case 'alert':
        return '#ffaa00'; // amber
      case 'maneuvering':
        return '#00d4ff'; // blue/cyan
      case 'critical':
        return '#ff3355'; // red
      case 'nominal':
      default:
        return '#00ff88'; // green
    }
  };

  const isConnected = (satId: string) => {
    if (satId === selectedNodeId) return true;
    return links.some(
      (l) =>
        (l.from === selectedNodeId && l.to === satId) ||
        (l.to === selectedNodeId && l.from === satId)
    );
  };

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40">
        <div className="flex items-center space-x-2.5">
          <Network className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
              MESH NETWORK TOPOLOGY
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              12 ACTIVE NODES • 22 FULL-DUPLEX OPTICAL ISL LINKS
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center space-x-3 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-zinc-400">Nominal</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-zinc-400">Alert</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-zinc-400">Maneuver</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative p-2 flex justify-center items-center bg-zinc-950 select-none">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full max-w-[560px] h-auto drop-shadow-xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Background constellation radial glow */}
            <radialGradient id="mesh-center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.08" />
              <stop offset="70%" stopColor="#00ff88" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
            </radialGradient>

            {/* Selected Node Glow */}
            <filter id="node-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00d4ff" />
            </filter>
          </defs>

          {/* Background Ambient Glow & Guide Rings */}
          <circle cx={cx} cy={cy} r={radius + 35} fill="url(#mesh-center-glow)" />
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(0, 212, 255, 0.08)" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx={cx} cy={cy} r={radius * 0.55} fill="none" stroke="rgba(0, 212, 255, 0.05)" strokeWidth="1" strokeDasharray="2 4" />
          <circle cx={cx} cy={cy} r={20} fill="none" stroke="rgba(0, 212, 255, 0.15)" strokeWidth="1" />
          <circle cx={cx} cy={cy} r="3" fill="rgba(0, 212, 255, 0.4)" />

          {/* Earth/Core Cluster Label */}
          <text
            x={cx}
            y={cy + 32}
            fill="rgba(148, 163, 184, 0.35)"
            fontSize="8"
            fontFamily="monospace"
            textAnchor="middle"
            letterSpacing="2"
          >
            LEO 550KM SHELL
          </text>

          {/* Render Network Links */}
          {links.map((link) => {
            const p1 = nodePositions[link.sourceIdx];
            const p2 = nodePositions[link.targetIdx];
            const isRelevant = link.from === selectedNodeId || link.to === selectedNodeId;
            const strokeColor = isRelevant ? '#00d4ff' : 'rgba(0, 212, 255, 0.22)';
            const strokeW = isRelevant ? 2.2 : 1.0;
            const opacity = isRelevant ? 1.0 : selectedNodeId ? 0.3 : 0.6;
            const pathD = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;

            return (
              <g key={`link-${link.from}-${link.to}`}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  opacity={opacity}
                  strokeDasharray={link.type === 'cross-plane' ? '4 2' : 'none'}
                />

                {/* Animated data packet flowing along active/relevant link */}
                {isRelevant && (
                  <circle r="3" fill="#00ff88" opacity="0.9">
                    <animateMotion
                      path={pathD}
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Render Nodes */}
          {nodePositions.map(({ sat, x, y }) => {
            const isSelected = sat.id === selectedNodeId;
            const connected = isConnected(sat.id);
            const color = getNodeColor(sat.status);

            return (
              <g
                key={sat.id}
                className="cursor-pointer transition-transform duration-150"
                onClick={() => setSelectedNodeId(sat.id)}
              >
                {/* Outer Selection Highlight Ring */}
                {isSelected && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r="22"
                      fill="none"
                      stroke="#00d4ff"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from={`0 ${x} ${y}`}
                        to={`360 ${x} ${y}`}
                        dur="10s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={y}
                      r="17"
                      fill="rgba(0, 212, 255, 0.15)"
                    />
                  </>
                )}

                {/* Satellite Node Body */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 13 : 10}
                  fill="#0b1324"
                  stroke={color}
                  strokeWidth={isSelected ? 2.5 : 1.75}
                  filter={isSelected ? 'url(#node-glow)' : undefined}
                  opacity={connected ? 1.0 : 0.4}
                />

                {/* Core Status Dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 5 : 3.5}
                  fill={color}
                  opacity={connected ? 1.0 : 0.5}
                />

                {/* Satellite Label */}
                {(() => {
                  const labelOffset = 22;
                  const lx = x + (x > cx ? labelOffset : -labelOffset);
                  const ly = y + (y > cy ? 12 : -4);
                  const textAnchor = x > cx ? 'start' : 'end';

                  return (
                    <text
                      x={lx}
                      y={ly}
                      fill={isSelected ? '#ffffff' : connected ? '#94a3b8' : '#475569'}
                      fontSize={isSelected ? '10' : '9'}
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      fontFamily="monospace"
                      textAnchor={textAnchor}
                    >
                      {sat.id}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Node Telemetry Card */}
      <div className="p-4 bg-zinc-950 border-t border-zinc-900/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <span
              className="w-3 h-3 rounded-full "
              style={{ backgroundColor: getNodeColor(selectedNode.status) }}
            />
            <div>
              <span className="text-sm font-bold text-white font-mono tracking-wide">
                {selectedNode.id} • {selectedNode.name}
              </span>
              <span className="text-[10px] text-zinc-400 font-mono block">
                STATUS: {selectedNode.status.toUpperCase()} • RAAN: {selectedNode.orbitalElements.raan}°
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-zinc-950/60 border border-zinc-800/40 text-blue-300">
              {selectedNode.hardware.processor}
            </span>
          </div>
        </div>

        {/* Health Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs font-mono">
          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px]">
              <Cpu className="w-3 h-3 text-blue-400" />
              <span>COMPUTE LOAD</span>
            </div>
            <div className="text-zinc-100 font-bold mt-1">
              {selectedNode.health.computeLoad}%
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded mt-1.5 overflow-hidden">
              <div
                className={`h-full ${
                  selectedNode.health.computeLoad > 75
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${selectedNode.health.computeLoad}%` }}
              />
            </div>
          </div>

          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px]">
              <Battery className="w-3 h-3 text-emerald-500" />
              <span>BATTERY / POWER</span>
            </div>
            <div className="text-zinc-100 font-bold mt-1">
              {selectedNode.health.powerLevel}%
            </div>
            <div className="w-full bg-zinc-800 h-1 rounded mt-1.5 overflow-hidden">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${selectedNode.health.powerLevel}%` }}
              />
            </div>
          </div>

          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px]">
              <Radio className="w-3 h-3 text-purple-400" />
              <span>TID RADIATION</span>
            </div>
            <div className="text-zinc-100 font-bold mt-1">
              {selectedNode.health.radiationDose} krad
            </div>
            <span className="text-[9px] text-zinc-500">Rated: 100 krad</span>
          </div>

          <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px]">
              <Radio className="w-3 h-3 text-amber-400" />
              <span>FUEL REMAINING</span>
            </div>
            <div className="text-zinc-100 font-bold mt-1">
              {selectedNode.health.fuelRemaining}%
            </div>
            <span className="text-[9px] text-zinc-500">High-Isp Ion Prop</span>
          </div>
        </div>
      </div>
    </div>
  );
};
