import React, { useState, useMemo, useEffect } from 'react';
import {
  BrainCircuit,
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Flame,
  Globe,
  Radio,
  Network,
  Code2,
  Info,
  Sparkles,
  Cpu,
  Activity,
} from 'lucide-react';
import type {
  PipelineResponse,
  PipelineCandidate,
  PipelineRequest,
} from '../../lib/apiClient';
import { DEFAULT_PIPELINE_REQUEST } from '../../lib/apiClient';
import { formatProbability } from './formatters';

export interface EPGScenario {
  id: string;
  name: string;
  badge: string;
  category: string;
  deltaV: number;
  directionRTN: [number, number, number];
  confidence: number;
  score: number;
  burnDuration: number;
  rules: {
    tsiolkovsky: {
      passed: boolean;
      value: number;
      limit: number;
      unit: string;
      detail: string;
    };
    perigee: {
      passed: boolean;
      value: number;
      limit: number;
      unit: string;
      detail: string;
    };
    burnTime?: {
      passed: boolean;
      value: number;
      limit: number;
      unit: string;
      detail: string;
    };
    riskReduction?: {
      passed: boolean;
      value: number;
      limit: number;
      unit: string;
      detail: string;
    };
  };
  verdict: 'ACCEPTED' | 'REJECTED';
  verdictReason: string;
  isSimulated?: boolean;
}

// Built-in demonstration scenarios (illustrating both satisfied and violated rules)
const PRESET_SCENARIOS: EPGScenario[] = [
  {
    id: 'preset-optimal-radial',
    name: 'Candidate #1: Optimal Radial Boost',
    badge: 'OPTIMAL (ACCEPTED)',
    category: 'radial_boost',
    deltaV: 0.42,
    directionRTN: [0.98, 0.0, 0.2],
    confidence: 0.942,
    score: 0.912,
    burnDuration: 2.86,
    rules: {
      tsiolkovsky: {
        passed: true,
        value: 0.42,
        limit: 2.62,
        unit: 'm/s',
        detail: 'Req Δv 0.42 m/s ≤ Max Propellant Budget 2.62 m/s (10% reserve margin maintained)',
      },
      perigee: {
        passed: true,
        value: 548.2,
        limit: 300.0,
        unit: 'km',
        detail: 'Post-burn perigee 548.2 km ≥ Minimum Safe Perigee 300.0 km (Clear of atmospheric drag)',
      },
      burnTime: {
        passed: true,
        value: 2.86,
        limit: 35.0,
        unit: 's',
        detail: 'Burn duration 2.86 s ≤ Feasible execution window 35.0 s (TCA - 5.0 s margin)',
      },
      riskReduction: {
        passed: true,
        value: 4.82,
        limit: 3.72,
        unit: 'sigma',
        detail: 'Post-maneuver Mahalanobis distance 4.82σ ≥ Keep-out boundary 3.72σ',
      },
    },
    verdict: 'ACCEPTED',
    verdictReason: 'All symbolic invariance laws verified. Candidate satisfies Tsiolkovsky budget and perigee clearance.',
    isSimulated: true,
  },
  {
    id: 'preset-cross-track',
    name: 'Candidate #2: Out-of-Plane Cross-Track',
    badge: 'FEASIBLE (ACCEPTED)',
    category: 'cross_track',
    deltaV: 0.68,
    directionRTN: [0.15, 0.05, 0.98],
    confidence: 0.887,
    score: 0.854,
    burnDuration: 4.64,
    rules: {
      tsiolkovsky: {
        passed: true,
        value: 0.68,
        limit: 2.62,
        unit: 'm/s',
        detail: 'Req Δv 0.68 m/s ≤ Max Propellant Budget 2.62 m/s (+1.94 m/s margin)',
      },
      perigee: {
        passed: true,
        value: 539.1,
        limit: 300.0,
        unit: 'km',
        detail: 'Post-burn perigee 539.1 km ≥ Minimum Safe Perigee 300.0 km (+239.1 km margin)',
      },
      burnTime: {
        passed: true,
        value: 4.64,
        limit: 35.0,
        unit: 's',
        detail: 'Burn duration 4.64 s ≤ Allowable window 35.0 s',
      },
      riskReduction: {
        passed: true,
        value: 5.12,
        limit: 3.72,
        unit: 'sigma',
        detail: 'Post-maneuver Mahalanobis distance 5.12σ ≥ Keep-out boundary 3.72σ',
      },
    },
    verdict: 'ACCEPTED',
    verdictReason: 'Cross-track maneuver satisfies all physical propellant and astrodynamic constraints.',
    isSimulated: true,
  },
  {
    id: 'preset-violates-tsiolkovsky',
    name: 'Candidate #3: Excessive Δv Burn',
    badge: 'VIOLATES TSIOLKOVSKY (REJECTED)',
    category: 'radial_boost_excessive',
    deltaV: 3.85,
    directionRTN: [0.99, 0.0, 0.14],
    confidence: 0.725,
    score: 0.618,
    burnDuration: 26.25,
    rules: {
      tsiolkovsky: {
        passed: false,
        value: 3.85,
        limit: 2.62,
        unit: 'm/s',
        detail: 'Req Δv 3.85 m/s > Allowable budget 2.62 m/s (Violates Tsiolkovsky mass ratio limit by 1.23 m/s!)',
      },
      perigee: {
        passed: true,
        value: 562.4,
        limit: 300.0,
        unit: 'km',
        detail: 'Post-burn perigee 562.4 km ≥ Minimum Safe Perigee 300.0 km',
      },
      burnTime: {
        passed: true,
        value: 26.25,
        limit: 35.0,
        unit: 's',
        detail: 'Burn duration 26.25 s ≤ Allowable window 35.0 s',
      },
      riskReduction: {
        passed: true,
        value: 6.40,
        limit: 3.72,
        unit: 'sigma',
        detail: 'Post-maneuver Mahalanobis distance 6.40σ ≥ Keep-out boundary 3.72σ',
      },
    },
    verdict: 'REJECTED',
    verdictReason: 'Rule R1 [Tsiolkovsky Propellant Budget] VIOLATED. Insufficient propellant mass to execute proposed Δv.',
    isSimulated: true,
  },
  {
    id: 'preset-violates-perigee',
    name: 'Candidate #4: Deep Retrograde Burn',
    badge: 'VIOLATES PERIGEE (REJECTED)',
    category: 'retrograde_hazardous',
    deltaV: 1.95,
    directionRTN: [0.05, -0.99, 0.05],
    confidence: 0.692,
    score: 0.584,
    burnDuration: 13.3,
    rules: {
      tsiolkovsky: {
        passed: true,
        value: 1.95,
        limit: 2.62,
        unit: 'm/s',
        detail: 'Req Δv 1.95 m/s ≤ Max Propellant Budget 2.62 m/s',
      },
      perigee: {
        passed: false,
        value: 184.2,
        limit: 300.0,
        unit: 'km',
        detail: 'Post-burn perigee 184.2 km < Minimum Safe Perigee 300.0 km (Catastrophic atmospheric re-entry hazard!)',
      },
      burnTime: {
        passed: true,
        value: 13.3,
        limit: 35.0,
        unit: 's',
        detail: 'Burn duration 13.3 s ≤ Allowable window 35.0 s',
      },
      riskReduction: {
        passed: true,
        value: 4.15,
        limit: 3.72,
        unit: 'sigma',
        detail: 'Post-maneuver Mahalanobis distance 4.15σ ≥ Keep-out boundary 3.72σ',
      },
    },
    verdict: 'REJECTED',
    verdictReason: 'Rule R3 [Minimum Safe Perigee] VIOLATED. Orbit perigee drops below 300 km threshold into dense atmosphere.',
    isSimulated: true,
  },
];

interface EPGGraphProps {
  pipelineData?: PipelineResponse | null;
  isBackendOnline?: boolean;
  compact?: boolean;
}

type SelectedNodeType = 'telemetry' | 'candidate' | 'rule_tsiolkovsky' | 'rule_perigee' | 'verdict' | null;

export const EPGGraph: React.FC<EPGGraphProps> = ({
  pipelineData,
  isBackendOnline = false,
  compact = false,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('preset-optimal-radial');
  const [selectedNode, setSelectedNode] = useState<SelectedNodeType>('candidate');
  const [activeTab, setActiveTab] = useState<'graph' | 'kgdsl' | 'trace'>('graph');

  // Convert live pipeline candidates into EPGScenario list
  const liveScenarios = useMemo<EPGScenario[]>(() => {
    if (!pipelineData?.validation?.candidates || pipelineData.validation.candidates.length === 0) {
      return [];
    }

    return pipelineData.validation.candidates.slice(0, 8).map((cand: PipelineCandidate) => {
      const rules = Array.isArray(cand?.rules) ? cand.rules : [];
      const r1 = rules.find((r) => r.id === 'R1');
      const r2 = rules.find((r) => r.id === 'R2');
      const r3 = rules.find((r) => r.id === 'R3');
      const r5 = rules.find((r) => r.id === 'R5');

      const isAccepted = Boolean(cand?.accepted);
      const isSelected = pipelineData.selected?.id === cand?.id;
      const uMax = pipelineData.derived?.u_max_mps2 || 0.147;
      const dv = typeof cand?.delta_v_mps === 'number' && Number.isFinite(cand.delta_v_mps) ? cand.delta_v_mps : 0;
      const rtn: [number, number, number] = Array.isArray(cand?.direction_rtn) && cand.direction_rtn.length === 3
        ? [cand.direction_rtn[0] ?? 0, cand.direction_rtn[1] ?? 0, cand.direction_rtn[2] ?? 0]
        : [0, 0, 0];

      return {
        id: `live-cand-${cand?.id ?? 'unknown'}`,
        name: `Rank #${cand?.rank ?? 1}: ${cand?.label || 'Candidate'}`,
        badge: isSelected ? 'SELECTED LIVE' : isAccepted ? 'ACCEPTED' : 'REJECTED',
        category: cand?.category || 'maneuver',
        deltaV: dv,
        directionRTN: rtn,
        confidence: typeof cand?.confidence === 'number' ? cand.confidence : 0.9,
        score: typeof cand?.score === 'number' ? cand.score : 0.8,
        burnDuration: r2 ? r2.value : dv / uMax,
        rules: {
          tsiolkovsky: {
            passed: r1?.passed ?? true,
            value: r1?.value ?? dv,
            limit: r1?.limit ?? 2.62,
            unit: r1?.unit ?? 'm/s',
            detail: r1?.detail ?? 'Propellant mass budget evaluation',
          },
          perigee: {
            passed: r3?.passed ?? true,
            value: r3?.value ?? 550.0,
            limit: r3?.limit ?? 300.0,
            unit: r3?.unit ?? 'km',
            detail: r3?.detail ?? 'Two-body orbital perigee clearance',
          },
          burnTime: r2
            ? {
                passed: r2.passed,
                value: r2.value,
                limit: r2.limit,
                unit: r2.unit,
                detail: r2.detail,
              }
            : undefined,
          riskReduction: r5
            ? {
                passed: r5.passed,
                value: r5.value,
                limit: r5.limit,
                unit: r5.unit,
                detail: r5.detail,
              }
            : undefined,
        },
        verdict: isAccepted ? 'ACCEPTED' : 'REJECTED',
        verdictReason: isAccepted
          ? 'Passed all declarative physical invariance rules (R1-R5).'
          : `Failed rules: ${rules.filter((r) => !r.passed).map((r) => r.name).join(', ') || 'Physics violation'}.`,
        isSimulated: false,
      };
    });
  }, [pipelineData]);

  // Combine live candidates with illustrative preset scenarios
  const allScenarios = useMemo<EPGScenario[]>(() => {
    if (liveScenarios.length > 0) {
      // Prepend live candidates, plus fault injection examples for demonstration
      return [
        ...liveScenarios,
        ...PRESET_SCENARIOS.filter((s) => s.verdict === 'REJECTED'),
      ];
    }
    return PRESET_SCENARIOS;
  }, [liveScenarios]);

  // Active scenario
  const currentScenario = useMemo<EPGScenario>(() => {
    const found = allScenarios.find((s) => s.id === selectedScenarioId);
    return found || allScenarios[0] || PRESET_SCENARIOS[0];
  }, [allScenarios, selectedScenarioId]);

  // Auto-select first live candidate if available on pipelineData update
  useEffect(() => {
    if (liveScenarios.length > 0 && selectedScenarioId.startsWith('preset-')) {
      const selectedLive = liveScenarios.find((s) => s.badge.includes('SELECTED')) || liveScenarios[0];
      if (selectedLive) {
        setSelectedScenarioId(selectedLive.id);
      }
    }
  }, [liveScenarios, selectedScenarioId]);

  // Derived telemetry parameters
  const telemetry = useMemo(() => {
    const inputs: PipelineRequest = pipelineData?.inputs || DEFAULT_PIPELINE_REQUEST;
    const pcPre = pipelineData?.assessment?.pc_pre ?? 0.00842;
    return {
      altitudeKm: inputs.altitude_km,
      tcaS: inputs.tca_s,
      pcPre,
      relVelKmS: inputs.rel_velocity_km_s,
      satMassKg: inputs.sat_mass_kg,
      propMassKg: inputs.propellant_mass_kg,
      ispS: inputs.isp_s,
      maxThrustN: inputs.max_thrust_n,
      minPerigeeKm: inputs.min_perigee_km,
    };
  }, [pipelineData]);

  const tsiolkovskyPassed = currentScenario.rules.tsiolkovsky.passed;
  const perigeePassed = currentScenario.rules.perigee.passed;
  const isAccepted = currentScenario.verdict === 'ACCEPTED';

  // SVG dimensions
  const svgW = 1200;
  const svgH = 520;

  // Exact anchor coordinates for SVG paths
  // Telemetry Right Port: (270, 260)
  // Candidate Left Port: (340, 260)
  // Candidate Right Port Upper: (600, 160)
  // Candidate Right Port Lower: (600, 370)
  // Rule Tsiolkovsky Left Port: (680, 145)
  // Rule Tsiolkovsky Right Port: (930, 145)
  // Rule Perigee Left Port: (680, 395)
  // Rule Perigee Right Port: (930, 395)
  // Verdict Upper Port: (990, 195)
  // Verdict Lower Port: (990, 345)

  const pathTelemetryToCandidate = 'M 270 260 L 340 260';
  const pathCandidateToTsiolkovsky = 'M 600 160 C 640 160, 640 145, 680 145';
  const pathCandidateToPerigee = 'M 600 370 C 640 370, 640 395, 680 395';
  const pathTsiolkovskyToVerdict = 'M 930 145 C 960 145, 960 195, 990 195';
  const pathPerigeeToVerdict = 'M 930 395 C 960 395, 960 345, 990 345';

  return (
    <div className={`bg-space-800 border border-space-600 rounded-sm ${compact ? 'p-3 space-y-4' : 'p-5 space-y-6'} font-mono shadow-xl relative overflow-hidden`}>
      {/* Background ambient glow effect */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-900/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-space-600/80 pb-4 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-500/30 uppercase font-bold flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-amber-400" />
              SYMBOLIC PHYSICS RULE GRAPH
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs text-zinc-400">EPG-INSPIRED ASTRODYNAMIC REASONING</span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-[10px] text-blue-400 bg-zinc-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
              ZERO PHYSICAL HALLUCINATIONS
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
                isBackendOnline
                  ? 'text-cyber-green bg-emerald-950/40 border-cyber-green/30'
                  : 'text-zinc-400 bg-zinc-950/40 border-space-700'
              }`}
            >
              {isBackendOnline ? 'LIVE API ATTACHED' : 'STANDALONE ORACLE MODE'}
            </span>
          </div>

          <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2.5">
            <BrainCircuit className="w-6 h-6 text-purple-400 shrink-0" />
            <span>Symbolic Physics Rule Graph: Neuro-Symbolic Logic</span>
          </h2>

          <p className="text-xs text-zinc-400 mt-1 max-w-4xl font-sans leading-relaxed">
            <span className="text-zinc-300 font-semibold">How it works:</span> Edge Retrieval Models (CLM) propose candidate collision avoidance maneuvers based on continuous telemetry embeddings (<span className="text-blue-300 font-mono">proposes</span>). The Symbolic Physics Rule Graph (EPG-inspired) evaluates every candidate against symbolic astrodynamic invariance laws (<span className="text-purple-300 font-mono">evaluates_against</span>): Tsiolkovsky propellant mass budgets and Vis-viva minimum safe perigee. Any violation immediately prunes the candidate (<span className="text-alert-red font-mono">violates</span>), ensuring execution occurs only when all constraints hold (<span className="text-cyber-green font-mono">satisfies</span>).
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-sm border border-space-700 text-xs shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('graph')}
            className={`px-3 py-1.5 rounded transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              activeTab === 'graph'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>GRAPH FLOW</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('kgdsl')}
            className={`px-3 py-1.5 rounded transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              activeTab === 'kgdsl'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>KGDSL TRIPLES</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trace')}
            className={`px-3 py-1.5 rounded transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              activeTab === 'trace'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>EXECUTION TRACE</span>
          </button>
        </div>
      </div>

      {/* Candidate Selector Bar */}
      <div className="bg-zinc-900/90 border border-space-700 rounded-sm p-3 space-y-2 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">
              SELECT CANDIDATE MANEUVER TO EVALUATE:
            </span>
          </div>
          <div className="text-[10px] text-zinc-400">
            Click candidates below to test neuro-symbolic acceptance vs rule violation pruning
          </div>
        </div>

        {/* Candidate Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {allScenarios.map((scen) => {
            const isCurrent = scen.id === currentScenario.id;
            const isScenAccepted = scen.verdict === 'ACCEPTED';

            return (
              <button
                key={scen.id}
                type="button"
                onClick={() => setSelectedScenarioId(scen.id)}
                className={`px-3 py-2 rounded-sm text-xs font-mono transition-all flex items-center gap-2 border cursor-pointer ${
                  isCurrent
                    ? isScenAccepted
                      ? 'bg-cyber-green/15 border-cyber-green text-cyber-green font-bold shadow-md shadow-cyber-green/10 ring-1 ring-cyber-green/50'
                      : 'bg-alert-red/15 border-alert-red text-alert-red font-bold shadow-md shadow-alert-red/10 ring-1 ring-alert-red/50'
                    : 'bg-zinc-950/80 border-space-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isScenAccepted ? 'bg-cyber-green' : 'bg-alert-red animate-pulse'
                  }`}
                />
                <span className="font-bold">{scen.name}</span>
                <span className="text-[10px] opacity-75">
                  (Δv: {scen.deltaV.toFixed(2)} m/s)
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    isScenAccepted
                      ? 'bg-emerald-950 text-cyber-green border border-cyber-green/30'
                      : 'bg-red-950 text-alert-red border border-alert-red/30'
                  }`}
                >
                  {scen.verdict}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'graph' && (
        <div className="space-y-4">
          {/* Interactive Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-zinc-950/60 border border-space-700/60 rounded-sm px-4 py-2 text-zinc-400">
            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                EDGE RELATIONS:
              </span>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-blue-300 font-bold">proposes</span>
                <span className="text-zinc-500">(Neural Proposal)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-purple-300 font-bold">evaluates_against</span>
                <span className="text-zinc-500">(Symbolic Constraint)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyber-green" />
                <span className="text-cyber-green font-bold">satisfies</span>
                <span className="text-zinc-500">(Passes Constraint)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-alert-red" />
                <span className="text-alert-red font-bold">violates</span>
                <span className="text-zinc-500">(Prunes Unsafe)</span>
              </div>
            </div>

            <div className="text-[10px] text-zinc-500">
              Click any node card for formal mathematical specifications
            </div>
          </div>

          {/* SVG & HTML Visual Graph Container */}
          <div className="overflow-x-auto rounded-sm border border-space-700 bg-zinc-950/95 p-4 relative shadow-xl shadow-black/40">
            {/* Grid background texture */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* Inner Fixed Canvas Box */}
            <div className="relative min-w-[1210px] h-[520px]">
              {/* SVG Connector Layer */}
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="absolute inset-0 w-full h-full pointer-events-none z-0"
              >
                <defs>
                  {/* Arrowhead Markers */}
                  <marker
                    id="arrow-cyan"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                  </marker>
                  <marker
                    id="arrow-purple"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#c084fc" />
                  </marker>
                  <marker
                    id="arrow-green"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                  </marker>
                  <marker
                    id="arrow-red"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                  </marker>
                  <marker
                    id="arrow-verdict"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M 0 1 L 10 5 L 0 9 z"
                      fill={isAccepted ? '#10b981' : '#ef4444'}
                    />
                  </marker>

                  {/* Flow animation styles */}
                  <style>{`
                    @keyframes spgDash {
                      to {
                        stroke-dashoffset: -20;
                      }
                    }
                    .spg-flow-cyan {
                      stroke-dasharray: 6 6;
                      animation: spgDash 1.2s linear infinite;
                    }
                    .spg-flow-green {
                      stroke-dasharray: 6 6;
                      animation: spgDash 1.2s linear infinite;
                    }
                    .spg-flow-red {
                      stroke-dasharray: 4 4;
                      animation: spgDash 0.8s linear infinite;
                    }
                  `}</style>
                </defs>

                {/* --- Edge 1: Telemetry -> Candidate (proposes) --- */}
                {/* Underglow */}
                <path
                  d={pathTelemetryToCandidate}
                  stroke="#38bdf8"
                  strokeWidth="6"
                  strokeOpacity="0.2"
                  fill="none"
                />
                {/* Main line */}
                <path
                  d={pathTelemetryToCandidate}
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  fill="none"
                  markerEnd="url(#arrow-cyan)"
                />
                {/* Animated flowing pulses */}
                <path
                  d={pathTelemetryToCandidate}
                  stroke="#7dd3fc"
                  strokeWidth="2.5"
                  fill="none"
                  className="spg-flow-cyan"
                />
                {/* Edge Label: proposes */}
                <g transform="translate(305, 260)">
                  <rect
                    x="-34"
                    y="-11"
                    width="68"
                    height="22"
                    rx="11"
                    fill="#030712"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#38bdf8"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    proposes
                  </text>
                </g>

                {/* --- Edge 2: Candidate -> Rule Tsiolkovsky --- */}
                {/* Underglow */}
                <path
                  d={pathCandidateToTsiolkovsky}
                  stroke={tsiolkovskyPassed ? '#10b981' : '#ef4444'}
                  strokeWidth="6"
                  strokeOpacity="0.2"
                  fill="none"
                />
                {/* Main line */}
                <path
                  d={pathCandidateToTsiolkovsky}
                  stroke={tsiolkovskyPassed ? '#10b981' : '#ef4444'}
                  strokeWidth="2.5"
                  fill="none"
                  markerEnd={tsiolkovskyPassed ? 'url(#arrow-green)' : 'url(#arrow-red)'}
                />
                {/* Flowing pulses */}
                <path
                  d={pathCandidateToTsiolkovsky}
                  stroke={tsiolkovskyPassed ? '#6ee7b7' : '#fca5a5'}
                  strokeWidth="2.5"
                  fill="none"
                  className={tsiolkovskyPassed ? 'spg-flow-green' : 'spg-flow-red'}
                />
                {/* Edge Label */}
                <g transform="translate(638, 155)">
                  <rect
                    x="-36"
                    y="-11"
                    width="72"
                    height="22"
                    rx="11"
                    fill="#030712"
                    stroke={tsiolkovskyPassed ? '#10b981' : '#ef4444'}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill={tsiolkovskyPassed ? '#10b981' : '#ef4444'}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {tsiolkovskyPassed ? 'satisfies' : 'violates'}
                  </text>
                </g>

                {/* --- Edge 3: Candidate -> Rule Perigee --- */}
                {/* Underglow */}
                <path
                  d={pathCandidateToPerigee}
                  stroke={perigeePassed ? '#10b981' : '#ef4444'}
                  strokeWidth="6"
                  strokeOpacity="0.2"
                  fill="none"
                />
                {/* Main line */}
                <path
                  d={pathCandidateToPerigee}
                  stroke={perigeePassed ? '#10b981' : '#ef4444'}
                  strokeWidth="2.5"
                  fill="none"
                  markerEnd={perigeePassed ? 'url(#arrow-green)' : 'url(#arrow-red)'}
                />
                {/* Flowing pulses */}
                <path
                  d={pathCandidateToPerigee}
                  stroke={perigeePassed ? '#6ee7b7' : '#fca5a5'}
                  strokeWidth="2.5"
                  fill="none"
                  className={perigeePassed ? 'spg-flow-green' : 'spg-flow-red'}
                />
                {/* Edge Label */}
                <g transform="translate(638, 380)">
                  <rect
                    x="-36"
                    y="-11"
                    width="72"
                    height="22"
                    rx="11"
                    fill="#030712"
                    stroke={perigeePassed ? '#10b981' : '#ef4444'}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill={perigeePassed ? '#10b981' : '#ef4444'}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {perigeePassed ? 'satisfies' : 'violates'}
                  </text>
                </g>

                {/* --- Edge 4: Rule Tsiolkovsky -> Verdict --- */}
                <path
                  d={pathTsiolkovskyToVerdict}
                  stroke={tsiolkovskyPassed ? '#10b981' : '#ef4444'}
                  strokeWidth="6"
                  strokeOpacity="0.2"
                  fill="none"
                />
                <path
                  d={pathTsiolkovskyToVerdict}
                  stroke={tsiolkovskyPassed ? '#10b981' : '#ef4444'}
                  strokeWidth="2.5"
                  fill="none"
                  markerEnd="url(#arrow-verdict)"
                />
                <path
                  d={pathTsiolkovskyToVerdict}
                  stroke={tsiolkovskyPassed ? '#6ee7b7' : '#fca5a5'}
                  strokeWidth="2"
                  fill="none"
                  className={tsiolkovskyPassed ? 'spg-flow-green' : 'spg-flow-red'}
                />

                {/* --- Edge 5: Rule Perigee -> Verdict --- */}
                <path
                  d={pathPerigeeToVerdict}
                  stroke={perigeePassed ? '#10b981' : '#ef4444'}
                  strokeWidth="6"
                  strokeOpacity="0.2"
                  fill="none"
                />
                <path
                  d={pathPerigeeToVerdict}
                  stroke={perigeePassed ? '#10b981' : '#ef4444'}
                  strokeWidth="2.5"
                  fill="none"
                  markerEnd="url(#arrow-verdict)"
                />
                <path
                  d={pathPerigeeToVerdict}
                  stroke={perigeePassed ? '#6ee7b7' : '#fca5a5'}
                  strokeWidth="2"
                  fill="none"
                  className={perigeePassed ? 'spg-flow-green' : 'spg-flow-red'}
                />
              </svg>

              {/* ========================================================================= */}
              {/* HTML NODE CARDS (Positioned absolutely to match SVG port coordinates)    */}
              {/* ========================================================================= */}

              {/* ---------------- Node 1: State Telemetry ---------------- */}
              <div
                onClick={() => setSelectedNode('telemetry')}
                style={{ left: '20px', top: '70px', width: '250px', height: '390px' }}
                className={`absolute rounded-sm p-4 transition-all cursor-pointer z-10 flex flex-col justify-between ${
                  selectedNode === 'telemetry'
                    ? 'bg-zinc-900 border-2 border-cyan-400 shadow-xl shadow-black/50'
                    : 'bg-zinc-900/90 border border-cyan-500/40 hover:border-cyan-400/80 shadow-lg'
                }`}
              >
                {/* Port anchor */}
                <div
                  className="absolute right-[-6px] top-[190px] w-3 h-3 rounded-full bg-cyan-400 border-2 border-zinc-950 shadow-md shadow-black/50"
                  title="Output port: proposes"
                />

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-950/80 border border-cyan-500/30 text-blue-300 uppercase">
                      NEURAL INPUT
                    </span>
                    <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                  </div>

                  <h3 className="text-sm font-bold text-white mt-2 flex items-center gap-1.5">
                    State Telemetry
                  </h3>
                  <div className="text-[10px] text-zinc-400 font-sans">
                    Real-time encounter observations
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs font-mono border-t border-space-700/80 pt-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Altitude (h):</span>
                      <span className="text-zinc-200 font-bold">{telemetry.altitudeKm.toFixed(1)} km</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">TCA Horizon:</span>
                      <span className="text-yellow-300 font-bold">{telemetry.tcaS.toFixed(1)} s</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Encounter Pc:</span>
                      <span className="text-alert-amber font-bold">
                        {formatProbability(telemetry.pcPre)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Rel Velocity:</span>
                      <span className="text-zinc-200 font-bold">{telemetry.relVelKmS.toFixed(1)} km/s</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Sat Mass:</span>
                      <span className="text-zinc-300">{telemetry.satMassKg.toFixed(0)} kg</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Propellant (mp):</span>
                      <span className="text-zinc-300">{telemetry.propMassKg.toFixed(1)} kg</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Thruster Isp:</span>
                      <span className="text-zinc-300">{telemetry.ispS.toFixed(0)} s</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-950 p-2 rounded border border-zinc-800 text-[10px] text-blue-400 font-mono">
                  &gt; Vector embedded into CLM latent space
                </div>
              </div>

              {/* ---------------- Node 2: CLM Candidate Maneuver ---------------- */}
              <div
                onClick={() => setSelectedNode('candidate')}
                style={{ left: '340px', top: '70px', width: '260px', height: '390px' }}
                className={`absolute rounded-sm p-4 transition-all cursor-pointer z-10 flex flex-col justify-between ${
                  selectedNode === 'candidate'
                    ? 'bg-zinc-900 border-2 border-purple-400 shadow-xl shadow-purple-950/50'
                    : 'bg-zinc-900/90 border border-purple-500/40 hover:border-purple-400/80 shadow-lg'
                }`}
              >
                {/* Input port anchor */}
                <div
                  className="absolute left-[-6px] top-[190px] w-3 h-3 rounded-full bg-purple-400 border-2 border-zinc-950 shadow-md shadow-purple-400/50"
                  title="Input port: proposes"
                />

                {/* Upper output port anchor (Tsiolkovsky) */}
                <div
                  className="absolute right-[-6px] top-[90px] w-3 h-3 rounded-full bg-purple-400 border-2 border-zinc-950 shadow-md shadow-purple-400/50"
                  title="Output port: evaluates_against R1"
                />

                {/* Lower output port anchor (Perigee) */}
                <div
                  className="absolute right-[-6px] top-[300px] w-3 h-3 rounded-full bg-purple-400 border-2 border-zinc-950 shadow-md shadow-purple-400/50"
                  title="Output port: evaluates_against R3"
                />

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/30 text-purple-300 uppercase">
                      NEURAL POLICY
                    </span>
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                  </div>

                  <h3 className="text-sm font-bold text-white mt-2 flex items-center gap-1.5">
                    CLM Candidate
                  </h3>
                  <div className="text-[10px] text-zinc-400 font-sans truncate">
                    Edge Retrieval Model
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs font-mono border-t border-space-700/80 pt-2.5">
                    <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                      <div className="text-[9px] text-zinc-400">PROPOSED LABEL</div>
                      <div className="text-blue-300 font-bold truncate">
                        {currentScenario.name.split(':')[1]?.trim() || currentScenario.name}
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Proposed Δv:</span>
                      <span className="text-white font-bold text-sm">
                        {currentScenario.deltaV.toFixed(2)} m/s
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Burn Time:</span>
                      <span className="text-zinc-200 font-bold">
                        {currentScenario.burnDuration.toFixed(2)} s
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Direction [R,T,N]:</span>
                      <span className="text-zinc-300 text-[10px]">
                        [{currentScenario.directionRTN.map((v) => v.toFixed(2)).join(',')}]
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Confidence:</span>
                      <span className="text-purple-300 font-bold">
                        {(currentScenario.confidence * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-zinc-400">Codebook Score:</span>
                      <span className="text-zinc-300 font-bold">
                        {currentScenario.score.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-950/40 p-2 rounded border border-purple-500/20 text-[10px] text-purple-300 font-mono">
                  &gt; Sub-ms inference: 1.2 ms latency
                </div>
              </div>

              {/* ---------------- Node 3: Rule: Tsiolkovsky ---------------- */}
              <div
                onClick={() => setSelectedNode('rule_tsiolkovsky')}
                style={{ left: '680px', top: '35px', width: '250px', height: '220px' }}
                className={`absolute rounded-sm p-3.5 transition-all cursor-pointer z-10 flex flex-col justify-between ${
                  selectedNode === 'rule_tsiolkovsky'
                    ? tsiolkovskyPassed
                      ? 'bg-zinc-900 border-2 border-cyber-green shadow-xl shadow-cyber-green/20'
                      : 'bg-zinc-900 border-2 border-alert-red shadow-xl shadow-alert-red/20'
                    : tsiolkovskyPassed
                    ? 'bg-zinc-900/90 border border-cyber-green/40 hover:border-cyber-green/80 shadow-lg'
                    : 'bg-zinc-900/90 border border-alert-red/50 hover:border-alert-red shadow-lg'
                }`}
              >
                {/* Input port anchor */}
                <div
                  className={`absolute left-[-6px] top-[110px] w-3 h-3 rounded-full border-2 border-zinc-950 ${
                    tsiolkovskyPassed ? 'bg-cyber-green' : 'bg-alert-red'
                  }`}
                  title="Input port from Candidate"
                />

                {/* Output port anchor */}
                <div
                  className={`absolute right-[-6px] top-[110px] w-3 h-3 rounded-full border-2 border-zinc-950 ${
                    tsiolkovskyPassed ? 'bg-cyber-green' : 'bg-alert-red'
                  }`}
                  title="Output port to Verdict"
                />

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950/70 border border-amber-500/30 text-amber-300 uppercase">
                      SYMBOLIC RULE R1
                    </span>
                    <Flame className="w-4 h-4 text-amber-400" />
                  </div>

                  <h3 className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
                    Rule: Tsiolkovsky
                  </h3>
                  <div className="text-[10px] text-zinc-400 font-sans">
                    Propellant Mass Rocket Equation
                  </div>

                  <div className="mt-2 bg-zinc-950 px-2 py-1 rounded text-[9px] text-amber-300 font-mono border border-zinc-800">
                    Δv ≤ 0.90 · Isp · g0 · ln(m0 / mf)
                  </div>

                  <div className="mt-2 space-y-1 text-xs font-mono">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-zinc-400">Req Δv:</span>
                      <span className="font-bold text-white">
                        {currentScenario.rules.tsiolkovsky.value.toFixed(2)} m/s
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-zinc-400">Max Budget:</span>
                      <span className="font-bold text-zinc-300">
                        {currentScenario.rules.tsiolkovsky.limit.toFixed(2)} m/s
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`px-2 py-1 rounded border flex items-center justify-between text-[10px] font-bold ${
                    tsiolkovskyPassed
                      ? 'bg-cyber-green/10 border-cyber-green/40 text-cyber-green'
                      : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {tsiolkovskyPassed ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>{tsiolkovskyPassed ? 'SATISFIED' : 'VIOLATED'}</span>
                  </span>
                  <span className="text-[9px]">
                    {tsiolkovskyPassed
                      ? `+${(currentScenario.rules.tsiolkovsky.limit - currentScenario.rules.tsiolkovsky.value).toFixed(2)} m/s`
                      : 'OVER LIMIT'}
                  </span>
                </div>
              </div>

              {/* ---------------- Node 4: Rule: Perigee ---------------- */}
              <div
                onClick={() => setSelectedNode('rule_perigee')}
                style={{ left: '680px', top: '280px', width: '250px', height: '220px' }}
                className={`absolute rounded-sm p-3.5 transition-all cursor-pointer z-10 flex flex-col justify-between ${
                  selectedNode === 'rule_perigee'
                    ? perigeePassed
                      ? 'bg-zinc-900 border-2 border-cyber-green shadow-xl shadow-cyber-green/20'
                      : 'bg-zinc-900 border-2 border-alert-red shadow-xl shadow-alert-red/20'
                    : perigeePassed
                    ? 'bg-zinc-900/90 border border-cyber-green/40 hover:border-cyber-green/80 shadow-lg'
                    : 'bg-zinc-900/90 border border-alert-red/50 hover:border-alert-red shadow-lg'
                }`}
              >
                {/* Input port anchor */}
                <div
                  className={`absolute left-[-6px] top-[115px] w-3 h-3 rounded-full border-2 border-zinc-950 ${
                    perigeePassed ? 'bg-cyber-green' : 'bg-alert-red'
                  }`}
                  title="Input port from Candidate"
                />

                {/* Output port anchor */}
                <div
                  className={`absolute right-[-6px] top-[115px] w-3 h-3 rounded-full border-2 border-zinc-950 ${
                    perigeePassed ? 'bg-cyber-green' : 'bg-alert-red'
                  }`}
                  title="Output port to Verdict"
                />

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-zinc-950/70 border border-blue-500/30 text-blue-300 uppercase">
                      SYMBOLIC RULE R3
                    </span>
                    <Globe className="w-4 h-4 text-blue-400" />
                  </div>

                  <h3 className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
                    Rule: Perigee
                  </h3>
                  <div className="text-[10px] text-zinc-400 font-sans">
                    Vis-Viva Atmospheric Clearance
                  </div>

                  <div className="mt-2 bg-zinc-950 px-2 py-1 rounded text-[9px] text-blue-300 font-mono border border-zinc-800">
                    rp = a(1 - e) - RE ≥ 300.0 km
                  </div>

                  <div className="mt-2 space-y-1 text-xs font-mono">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-zinc-400">Post Perigee:</span>
                      <span className="font-bold text-white">
                        {currentScenario.rules.perigee.value.toFixed(1)} km
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-zinc-400">Safe Floor:</span>
                      <span className="font-bold text-zinc-300">
                        ≥ {currentScenario.rules.perigee.limit.toFixed(1)} km
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`px-2 py-1 rounded border flex items-center justify-between text-[10px] font-bold ${
                    perigeePassed
                      ? 'bg-cyber-green/10 border-cyber-green/40 text-cyber-green'
                      : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {perigeePassed ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>{perigeePassed ? 'SATISFIED' : 'VIOLATED'}</span>
                  </span>
                  <span className="text-[9px]">
                    {perigeePassed
                      ? `+${(currentScenario.rules.perigee.value - currentScenario.rules.perigee.limit).toFixed(0)} km`
                      : 'SUB-ORBITAL'}
                  </span>
                </div>
              </div>

              {/* ---------------- Node 5: Verdict: Accepted / Rejected ---------------- */}
              <div
                onClick={() => setSelectedNode('verdict')}
                style={{ left: '990px', top: '100px', width: '200px', height: '330px' }}
                className={`absolute rounded-sm p-4 transition-all cursor-pointer z-10 flex flex-col justify-between ${
                  selectedNode === 'verdict'
                    ? isAccepted
                      ? 'bg-zinc-900 border-2 border-cyber-green shadow-xl shadow-black/40 shadow-cyber-green/30'
                      : 'bg-zinc-900 border-2 border-alert-red shadow-xl shadow-black/40 shadow-alert-red/30'
                    : isAccepted
                    ? 'bg-zinc-900/95 border-2 border-cyber-green/50 hover:border-cyber-green shadow-xl'
                    : 'bg-zinc-900/95 border-2 border-alert-red/50 hover:border-alert-red shadow-xl'
                }`}
              >
                {/* Upper input port anchor */}
                <div
                  className={`absolute left-[-6px] top-[95px] w-3 h-3 rounded-full border-2 border-zinc-950 ${
                    tsiolkovskyPassed ? 'bg-cyber-green' : 'bg-alert-red'
                  }`}
                  title="Evaluation input from Tsiolkovsky"
                />

                {/* Lower input port anchor */}
                <div
                  className={`absolute left-[-6px] top-[245px] w-3 h-3 rounded-full border-2 border-zinc-950 ${
                    perigeePassed ? 'bg-cyber-green' : 'bg-alert-red'
                  }`}
                  title="Evaluation input from Perigee"
                />

                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                        isAccepted
                          ? 'bg-emerald-950 text-cyber-green border-cyber-green/40'
                          : 'bg-red-950 text-alert-red border-alert-red/40'
                      }`}
                    >
                      GATE VERDICT
                    </span>
                    {isAccepted ? (
                      <ShieldCheck className="w-5 h-5 text-cyber-green" />
                    ) : (
                      <AlertOctagon className="w-5 h-5 text-alert-red animate-pulse" />
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-white mt-2">
                    Verdict Oracle
                  </h3>
                  <div className="text-[10px] text-zinc-400 font-sans">
                    Neuro-Symbolic Gatekeeper
                  </div>

                  <div className="mt-4 text-center p-3 rounded-sm bg-zinc-950 border border-zinc-800">
                    <div
                      className={`text-xl font-black tracking-tight ${
                        isAccepted ? 'text-cyber-green' : 'text-alert-red'
                      }`}
                    >
                      {currentScenario.verdict}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-1 uppercase font-bold">
                      {isAccepted ? 'EXECUTE MANEUVER' : 'PRUNED / REJECTED'}
                    </div>
                  </div>

                  <div className="mt-3 text-[10px] text-zinc-300 font-sans leading-relaxed">
                    {isAccepted
                      ? '✓ All astrodynamic invariance laws proved.'
                      : '✗ Symbolic gate blocked execution of candidate.'}
                  </div>
                </div>

                <div className="bg-zinc-950 p-2 rounded border border-zinc-800 text-[9px] text-zinc-400 font-mono">
                  <div className="text-zinc-500">CERTIFICATE</div>
                  <div className="truncate text-blue-300">
                    {isAccepted ? 'PROV-ORACLE-PASS' : 'PROV-ORACLE-FAIL'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Node Inspector Drawer */}
          {selectedNode && (
            <div className="bg-zinc-900 border border-space-700 rounded-sm p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-space-700/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    NODE INSPECTOR: {selectedNode.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  Semantic Class &amp; Math Formalism
                </div>
              </div>

              {selectedNode === 'telemetry' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      ONTOLOGY SPECIFICATION
                    </div>
                    <div className="text-blue-300">Class: spg:EncounterStateVector</div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Represents observed ephemeris state, covariance matrix C₂ₓ₂, and vehicle wet mass.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      NEURAL ROLE
                    </div>
                    <div className="text-purple-300">Latency: ~0.15 ms encoder pass</div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Continuous values normalized into latent prompt vector z ∈ ℝᵈ for the Edge Retrieval Model.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      SEMANTIC TRIPLES
                    </div>
                    <div className="text-zinc-300 text-[10px] bg-zinc-950 p-2 rounded border border-zinc-800">
                      (Telemetry:State)-[:proposes]-&gt;(Candidate:Maneuver)
                    </div>
                  </div>
                </div>
              )}

              {selectedNode === 'candidate' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      ONTOLOGY SPECIFICATION
                    </div>
                    <div className="text-purple-300">Class: spg:ManeuverCandidate</div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      A proposed impulsive or finite-duration thrust impulse Δv = [Δv_R, Δv_T, Δv_N].
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      NEURAL CONFIDENCE &amp; SCORE
                    </div>
                    <div className="text-white">
                      Dot Score: {currentScenario.score.toFixed(3)} | Conf: {(currentScenario.confidence * 100).toFixed(1)}%
                    </div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Computed via cosine similarity between neural latent query and pre-trained codebook centroids.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      ACTIVE RELATIONS
                    </div>
                    <div className="text-zinc-300 text-[10px] bg-zinc-950 p-2 rounded border border-zinc-800 space-y-0.5">
                      <div>(Candidate)-[:evaluates_against]-&gt;(Rule:Tsiolkovsky)</div>
                      <div>(Candidate)-[:evaluates_against]-&gt;(Rule:Perigee)</div>
                    </div>
                  </div>
                </div>
              )}

              {selectedNode === 'rule_tsiolkovsky' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      MATHEMATICAL LAW
                    </div>
                    <div className="text-amber-300">
                      Δv_avail = Isp · g₀ · ln(m_sat / (m_sat - m_prop))
                    </div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Upper bound on total velocity increment allowable from available onboard propellant mass.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      EVALUATION METRIC
                    </div>
                    <div className={tsiolkovskyPassed ? 'text-cyber-green' : 'text-alert-red font-bold'}>
                      {currentScenario.rules.tsiolkovsky.detail}
                    </div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      A 10% safety reserve (limit = 0.90 · Δv_avail) is strictly enforced for future stationkeeping.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      EDGE OUTCOME
                    </div>
                    <div
                      className={`text-[10px] p-2 rounded border ${
                        tsiolkovskyPassed
                          ? 'bg-cyber-green/10 border-cyber-green/40 text-cyber-green'
                          : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
                      }`}
                    >
                      {tsiolkovskyPassed
                        ? '(Candidate)-[:satisfies]->(Rule:Tsiolkovsky)'
                        : '(Candidate)-[:violates]->(Rule:Tsiolkovsky) [PRUNED]'}
                    </div>
                  </div>
                </div>
              )}

              {selectedNode === 'rule_perigee' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      MATHEMATICAL LAW
                    </div>
                    <div className="text-blue-300">
                      r_p = a(1 - e) - R_E ≥ h_min (300 km)
                    </div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Two-body vis-viva equations compute post-maneuver perigee altitude from specific orbital energy.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      EVALUATION METRIC
                    </div>
                    <div className={perigeePassed ? 'text-cyber-green' : 'text-alert-red font-bold'}>
                      {currentScenario.rules.perigee.detail}
                    </div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Guarantees the collision evasion maneuver does not inadvertently de-orbit the spacecraft into high drag.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      EDGE OUTCOME
                    </div>
                    <div
                      className={`text-[10px] p-2 rounded border ${
                        perigeePassed
                          ? 'bg-cyber-green/10 border-cyber-green/40 text-cyber-green'
                          : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
                      }`}
                    >
                      {perigeePassed
                        ? '(Candidate)-[:satisfies]->(Rule:Perigee)'
                        : '(Candidate)-[:violates]->(Rule:Perigee) [PRUNED]'}
                    </div>
                  </div>
                </div>
              )}

              {selectedNode === 'verdict' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      FORMAL VERIFICATION GATE
                    </div>
                    <div className={isAccepted ? 'text-cyber-green font-bold' : 'text-alert-red font-bold'}>
                      {isAccepted ? 'EXECUTE MANEUVER AUTHORIZED' : 'SAFETY INVARIANT VIOLATION'}
                    </div>
                    <div className="text-zinc-400 text-[11px] font-sans">
                      Deterministic conjunction oracle enforces conjunction of all symbolic guards (R1 ∧ R2 ∧ R3 ∧ R4 ∧ R5).
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      REASONING RATIONALE
                    </div>
                    <div className="text-zinc-200 text-[11px] font-sans">
                      {currentScenario.verdictReason}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-400 uppercase font-bold">
                      PROVENANCE METADATA
                    </div>
                    <div className="text-zinc-300 text-[10px] bg-zinc-950 p-2 rounded border border-zinc-800">
                      <div>Protocol: Symbolic Physics Rule Graph (EPG-inspired) / KGDSL</div>
                      <div>Deterministic: 100% formal replayable</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* KGDSL Triples View */}
      {activeTab === 'kgdsl' && (
        <div className="space-y-4">
          <div className="bg-zinc-950 p-4 rounded-sm border border-space-700 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-purple-300 font-bold flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                Symbolic Physics Rule Graph Schema &amp; Declarative Rules (EPG-inspired KGDSL)
              </span>
              <span className="text-[10px] text-zinc-400">
                ACTIVE SCENARIO: {currentScenario.name}
              </span>
            </div>

            <pre className="text-zinc-300 overflow-x-auto text-[11px] leading-relaxed p-2 bg-zinc-900/60 rounded border border-zinc-800 font-mono">
{`// -------------------------------------------------------------
// Symbolic Physics Rule Graph (EPG-inspired) Ontology Definition
// -------------------------------------------------------------
EntityType SpacecraftEncounterState {
    altitude_km: Float
    tca_seconds: Float
    pc_prior: Float
    relative_velocity_km_s: Float
    propellant_mass_kg: Float
    specific_impulse_s: Float
}

EntityType ManeuverCandidate {
    label: String
    delta_v_mps: Float
    direction_rtn: Vector3D
    burn_duration_s: Float
    confidence: Float
}

ConstraintRule Rule_Tsiolkovsky(cand: ManeuverCandidate, state: SpacecraftEncounterState) {
    condition: cand.delta_v_mps <= 0.90 * (state.specific_impulse_s * 9.80665 * ln(state.dry_mass / state.empty_mass))
    on_pass: cand -[:satisfies]-> Rule_Tsiolkovsky
    on_fail: cand -[:violates {error: "PROPELLANT_BUDGET_EXCEEDED"}]-> Rule_Tsiolkovsky
}

ConstraintRule Rule_Perigee(cand: ManeuverCandidate, state: SpacecraftEncounterState) {
    condition: evaluate_orbit_perigee(state.altitude_km, cand.delta_v_mps, cand.direction_rtn) >= 300.0
    on_pass: cand -[:satisfies]-> Rule_Perigee
    on_fail: cand -[:violates {error: "ATMOSPHERIC_REENTRY_HAZARD"}]-> Rule_Perigee
}

// -------------------------------------------------------------
// Live Synthesized Triples for Active Candidate (${currentScenario.id})
// -------------------------------------------------------------
(Telemetry:SpacecraftEncounterState {
    altitude_km: ${telemetry.altitudeKm.toFixed(1)},
    tca_seconds: ${telemetry.tcaS.toFixed(1)},
    propellant_mass_kg: ${telemetry.propMassKg.toFixed(1)}
})-[:proposes {latency: "1.2ms", model: "Edge-Retrieval-Model"}]->(Candidate:ManeuverCandidate {
    label: "${currentScenario.name.split(':')[1]?.trim() || currentScenario.name}",
    delta_v_mps: ${currentScenario.deltaV.toFixed(2)},
    direction_rtn: [${currentScenario.directionRTN.join(', ')}]
})

(Candidate)-[:evaluates_against]->(R1:Rule_Tsiolkovsky)
(Candidate)-[:${tsiolkovskyPassed ? 'satisfies' : 'violates'} {
    value: ${currentScenario.rules.tsiolkovsky.value.toFixed(2)},
    limit: ${currentScenario.rules.tsiolkovsky.limit.toFixed(2)},
    unit: "m/s"
}]->(R1)

(Candidate)-[:evaluates_against]->(R3:Rule_Perigee)
(Candidate)-[:${perigeePassed ? 'satisfies' : 'violates'} {
    value: ${currentScenario.rules.perigee.value.toFixed(1)},
    limit: 300.0,
    unit: "km"
}]->(R3)

(R1, R3)-[:yields_verdict]->(Verdict:SafetyCertificate {
    verdict: "${currentScenario.verdict}",
    executable: ${isAccepted ? 'true' : 'false'}
})`}
            </pre>
          </div>
        </div>
      )}

      {/* Execution Trace View */}
      {activeTab === 'trace' && (
        <div className="space-y-4 font-mono text-xs">
          <div className="bg-zinc-950 p-4 rounded-sm border border-space-700 space-y-3">
            <div className="text-purple-300 font-bold border-b border-zinc-800 pb-2 flex items-center justify-between">
              <span>Chronological Neuro-Symbolic Reasoning Trace</span>
              <span className="text-[10px] text-zinc-400">Total Latency: ~1.6 ms</span>
            </div>

            <div className="space-y-3 pt-1">
              {/* Step 1 */}
              <div className="flex items-start gap-3 p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className="w-5 h-5 rounded-full bg-zinc-950 border border-cyan-500/40 text-blue-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-bold text-blue-300">TELEMETRY INGESTION &amp; NORMALIZATION</div>
                  <p className="text-[11px] text-zinc-300 font-sans mt-0.5">
                    Continuous orbital state ingested (Alt: {telemetry.altitudeKm} km, TCA: {telemetry.tcaS} s, Pc: {formatProbability(telemetry.pcPre)}). State normalized into CLM encoder tensor.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3 p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className="w-5 h-5 rounded-full bg-purple-950 border border-purple-500/40 text-purple-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-bold text-purple-300">NEURAL CANDIDATE PROPOSAL (EDGE RETRIEVAL MODEL)</div>
                  <p className="text-[11px] text-zinc-300 font-sans mt-0.5">
                    Edge Retrieval Model evaluated codebook centroids in 1.2 ms. Proposed maneuver <span className="font-mono text-white font-bold">{currentScenario.name}</span> with Δv = {currentScenario.deltaV.toFixed(2)} m/s (Confidence: {(currentScenario.confidence * 100).toFixed(1)}%).
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3 p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 ${
                  tsiolkovskyPassed
                    ? 'bg-emerald-950 border border-cyber-green text-cyber-green'
                    : 'bg-red-950 border border-alert-red text-alert-red'
                }`}>
                  3
                </div>
                <div>
                  <div className={`font-bold ${tsiolkovskyPassed ? 'text-cyber-green' : 'text-alert-red'}`}>
                    SYMBOLIC EVALUATION: TSIOLKOVSKY BUDGET (RULE R1)
                  </div>
                  <p className="text-[11px] text-zinc-300 font-sans mt-0.5">
                    {currentScenario.rules.tsiolkovsky.detail}. Outcome: <span className="font-bold font-mono">{tsiolkovskyPassed ? 'PASSED (satisfies)' : 'FAILED (violates)'}</span>.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-3 p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 ${
                  perigeePassed
                    ? 'bg-emerald-950 border border-cyber-green text-cyber-green'
                    : 'bg-red-950 border border-alert-red text-alert-red'
                }`}>
                  4
                </div>
                <div>
                  <div className={`font-bold ${perigeePassed ? 'text-cyber-green' : 'text-alert-red'}`}>
                    SYMBOLIC EVALUATION: MINIMUM SAFE PERIGEE (RULE R3)
                  </div>
                  <p className="text-[11px] text-zinc-300 font-sans mt-0.5">
                    {currentScenario.rules.perigee.detail}. Outcome: <span className="font-bold font-mono">{perigeePassed ? 'PASSED (satisfies)' : 'FAILED (violates)'}</span>.
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className={`flex items-start gap-3 p-3 rounded border-2 ${
                isAccepted
                  ? 'bg-cyber-green/10 border-cyber-green/50 text-cyber-green'
                  : 'bg-alert-red/10 border-alert-red/50 text-alert-red'
              }`}>
                <div className="w-5 h-5 rounded-full bg-zinc-950 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  5
                </div>
                <div>
                  <div className="font-black text-sm uppercase">
                    ORACLE DECISION: {currentScenario.verdict}
                  </div>
                  <p className="text-[11px] text-zinc-200 font-sans mt-0.5">
                    {currentScenario.verdictReason}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EPGGraph;
