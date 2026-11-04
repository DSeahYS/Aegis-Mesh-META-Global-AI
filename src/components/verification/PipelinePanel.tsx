import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  Zap,
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import type {
  PipelineRequest,
  PipelineResponse,
  VerdictStatus,
} from '../../lib/apiClient';
import { DEFAULT_PIPELINE_REQUEST } from '../../lib/apiClient';
import { formatProbability, formatDurationMs } from './formatters';
import { CandidatesTable } from './CandidatesTable';
import { HJHeatmapCanvas } from './HJHeatmapCanvas';
import { CBFCharts } from './CBFCharts';
import { EPGGraph } from './EPGGraph';

interface PipelinePanelProps {
  data: PipelineResponse | null;
  loading: boolean;
  onRunPipeline: (req: PipelineRequest) => void;
  isBackendOnline: boolean;
}

export const PipelinePanel: React.FC<PipelinePanelProps> = ({
  data,
  loading,
  onRunPipeline,
  isBackendOnline,
}) => {
  const [params, setParams] = useState<PipelineRequest>({ ...DEFAULT_PIPELINE_REQUEST });
  const [isFormExpanded, setIsFormExpanded] = useState<boolean>(true);

  const handleInputChange = (key: keyof PipelineRequest, valStr: string) => {
    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      setParams((prev) => ({ ...prev, [key]: val }));
    }
  };

  const handleReset = () => {
    const fresh = { ...DEFAULT_PIPELINE_REQUEST };
    setParams(fresh);
    if (isBackendOnline) {
      onRunPipeline(fresh);
    }
  };

  const handlePreset = (patch: Partial<PipelineRequest>) => {
    const updated: PipelineRequest = { ...params, ...patch };
    setParams(updated);
    if (isBackendOnline) {
      onRunPipeline(updated);
    }
  };

  // Verdict style helpers
  const getVerdictStyle = (status: VerdictStatus | string) => {
    switch (status) {
      case 'EXECUTE':
        return {
          bg: 'bg-cyber-green/15 border-cyber-green/50 text-cyber-green',
          icon: ShieldCheck,
          label: 'EXECUTE MANEUVER',
          badge: 'bg-cyber-green text-space-950',
        };
      case 'NO_ACTION_REQUIRED':
        return {
          bg: 'bg-cyber-blue/15 border-cyber-blue/50 text-cyber-blue',
          icon: Info,
          label: 'NO ACTION REQUIRED',
          badge: 'bg-cyber-blue text-white',
        };
      case 'ABORT_NO_SAFE_MANEUVER':
        return {
          bg: 'bg-alert-red/15 border-alert-red/50 text-alert-red',
          icon: AlertOctagon,
          label: 'ABORT — NO SAFE MANEUVER',
          badge: 'bg-alert-red text-white',
        };
      case 'UNVERIFIED':
      default:
        return {
          bg: 'bg-alert-amber/15 border-alert-amber/50 text-alert-amber',
          icon: AlertTriangle,
          label: 'UNVERIFIED ENVELOPE',
          badge: 'bg-alert-amber text-space-950',
        };
    }
  };

  const verdict = data?.verdict;
  const verdictStyle = verdict ? getVerdictStyle(verdict.status) : null;
  const timings = data?.stage_timings_ms;

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm p-5 space-y-6 font-mono shadow-xl">
      {/* Panel Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-space-600/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/70 text-cyber-green border border-cyber-green/30 uppercase font-bold">
              AUTONOMOUS V&amp;V PIPELINE
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs text-zinc-400">5-STAGE FORMAL VERIFICATION ENVELOPE</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
            Autonomous Evasion V&amp;V Pipeline
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5 max-w-3xl font-sans">
            <span className="text-zinc-300 font-semibold">What is being proven:</span> The end-to-end evasion pipeline validates conjunction risk with Foster 2D B-plane quadrature, ranks candidate maneuvers via CLM latent dot-product, filters them through an EPG/KGDSL-style rule graph (in-process), computes an Isaacs Hamilton-Jacobi reachability certificate, and enforces High-Order Control Barrier Function forward safety invariance.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-sm bg-zinc-900 hover:bg-space-700 text-zinc-300 border border-space-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET DEFAULTS
          </button>

          <button
            type="button"
            onClick={() => onRunPipeline(params)}
            disabled={loading || !isBackendOnline}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-900/30 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>SOLVING PIPELINE…</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>RUN PIPELINE</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Fault Injection Presets Strip */}
      <div className="bg-zinc-900/90 border border-space-700 rounded-sm p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5 font-bold text-zinc-200">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            FAULT-INJECTION PRESETS (CLICK TO INJECT &amp; RUN LIVE):
          </span>
          <span className="text-[10px] text-zinc-500">
            Demonstrates deterministic rule rejection &amp; safety barriers
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => handlePreset({ ...DEFAULT_PIPELINE_REQUEST })}
            className="px-2.5 py-1.5 rounded-md bg-space-800 hover:bg-space-700 border border-space-600 text-xs text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-cyber-green" />
            <span>Nominal Default</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset({ propellant_mass_kg: 0.02 })}
            className="px-2.5 py-1.5 rounded-md bg-alert-red/10 hover:bg-alert-red/20 border border-alert-red/40 text-xs text-alert-red font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-alert-red" />
            <span>Starved Propellant (20g)</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset({ max_thrust_n: 0.5 })}
            className="px-2.5 py-1.5 rounded-md bg-yellow-950/40 hover:bg-yellow-900/50 border border-yellow-500/40 text-xs text-yellow-300 font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span>Weak Thruster (0.5N)</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset({ d_max_mps2: 0.3 })}
            className="px-2.5 py-1.5 rounded-md bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/40 text-xs text-purple-300 font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span>Strong Disturbance (0.3 m/s²)</span>
          </button>

          <button
            type="button"
            onClick={() => handlePreset({ miss_xi_m: 2000.0, miss_zeta_m: 1500.0 })}
            className="px-2.5 py-1.5 rounded-md bg-zinc-950/40 hover:bg-zinc-900/50 border border-blue-500/40 text-xs text-blue-300 font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Safe Pass (2.5 km miss)</span>
          </button>
        </div>
      </div>

      {/* Scenario Parameters Form (Collapsible) */}
      <div className="bg-zinc-900/60 border border-space-700/80 rounded-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setIsFormExpanded(!isFormExpanded)}
          className="w-full px-4 py-2.5 bg-zinc-900 flex items-center justify-between text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <span className="font-bold flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            SCENARIO CONFIGURATION PARAMETERS (18 INPUTS)
          </span>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-[10px]">{isFormExpanded ? 'HIDE INPUTS' : 'EDIT INPUTS'}</span>
            {isFormExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isFormExpanded && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs border-t border-space-700/80">
            {/* Group 1: Encounter */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">TCA Horizon (s)</label>
              <input
                type="number"
                step="5"
                value={params.tca_s}
                onChange={(e) => handleInputChange('tca_s', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Miss ξ (m)</label>
              <input
                type="number"
                step="10"
                value={params.miss_xi_m}
                onChange={(e) => handleInputChange('miss_xi_m', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Miss ζ (m)</label>
              <input
                type="number"
                step="10"
                value={params.miss_zeta_m}
                onChange={(e) => handleInputChange('miss_zeta_m', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Rel Speed (km/s)</label>
              <input
                type="number"
                step="0.5"
                value={params.rel_velocity_km_s}
                onChange={(e) => handleInputChange('rel_velocity_km_s', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Debris Mass (kg)</label>
              <input
                type="number"
                step="5"
                value={params.debris_mass_kg}
                onChange={(e) => handleInputChange('debris_mass_kg', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Hard-Body R (m)</label>
              <input
                type="number"
                step="1"
                value={params.hard_body_radius_m}
                onChange={(e) => handleInputChange('hard_body_radius_m', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>

            {/* Group 2: Covariance */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Sigma ξ (m)</label>
              <input
                type="number"
                step="10"
                value={params.sigma_xi_m}
                onChange={(e) => handleInputChange('sigma_xi_m', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Sigma ζ (m)</label>
              <input
                type="number"
                step="10"
                value={params.sigma_zeta_m}
                onChange={(e) => handleInputChange('sigma_zeta_m', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Correlation ρ</label>
              <input
                type="number"
                step="0.05"
                min="-0.99"
                max="0.99"
                value={params.rho}
                onChange={(e) => handleInputChange('rho', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Pc Threshold</label>
              <input
                type="number"
                step="0.00001"
                value={params.pc_threshold}
                onChange={(e) => handleInputChange('pc_threshold', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>

            {/* Group 3: Spacecraft Propulsion */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Sat Mass (kg)</label>
              <input
                type="number"
                step="10"
                value={params.sat_mass_kg}
                onChange={(e) => handleInputChange('sat_mass_kg', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Propellant Mass (kg)</label>
              <input
                type="number"
                step="0.1"
                value={params.propellant_mass_kg}
                onChange={(e) => handleInputChange('propellant_mass_kg', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Isp (s)</label>
              <input
                type="number"
                step="10"
                value={params.isp_s}
                onChange={(e) => handleInputChange('isp_s', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Max Thrust (N)</label>
              <input
                type="number"
                step="1"
                value={params.max_thrust_n}
                onChange={(e) => handleInputChange('max_thrust_n', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Altitude (km)</label>
              <input
                type="number"
                step="25"
                value={params.altitude_km}
                onChange={(e) => handleInputChange('altitude_km', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Min Perigee (km)</label>
              <input
                type="number"
                step="20"
                value={params.min_perigee_km}
                onChange={(e) => handleInputChange('min_perigee_km', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>

            {/* Group 4: Disturbances & Top K */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Disturbance d_max (m/s²)</label>
              <input
                type="number"
                step="0.01"
                value={params.d_max_mps2}
                onChange={(e) => handleInputChange('d_max_mps2', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Top-K CLM Search</label>
              <input
                type="number"
                step="5"
                min="5"
                max="50"
                value={params.top_k}
                onChange={(e) => handleInputChange('top_k', e.target.value)}
                className="w-full bg-zinc-950 border border-space-700 rounded px-2 py-1 text-zinc-100 font-bold focus:border-cyber-green focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5-Stage Stepper Bar */}
      {data && (
        <div className="bg-zinc-950 border border-space-700 rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 uppercase font-bold">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              PIPELINE EXECUTION STEPPER
            </span>
            <span>Total Compute: {formatDurationMs(timings?.total)}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {/* Stage 1: Foster Assess */}
            <div className="p-2 rounded bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-500 font-bold">1. ASSESS Pc</div>
              <div className="text-white font-bold truncate">Foster 2D B-plane</div>
              <div className="text-[10px] text-blue-300 mt-0.5">{formatDurationMs(timings?.assess)}</div>
            </div>

            {/* Stage 2: CLM Rank */}
            <div className="p-2 rounded bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-500 font-bold">2. CLM RANK</div>
              <div className="text-white font-bold truncate">Dot-Score Codebook</div>
              <div className="text-[10px] text-blue-300 mt-0.5">{formatDurationMs(timings?.clm)}</div>
            </div>

            {/* Stage 3: Physics Rules */}
            <div className="p-2 rounded bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-500 font-bold">3. PHYSICS RULES</div>
              <div className="text-white font-bold truncate">EPG/KGDSL Graph</div>
              <div className="text-[10px] text-blue-300 mt-0.5">{formatDurationMs(timings?.validation)}</div>
            </div>

            {/* Stage 4: HJ Reachability */}
            <div className="p-2 rounded bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-500 font-bold">4. HJ REACHABILITY</div>
              <div className="text-white font-bold truncate">Isaacs DP Grid</div>
              <div className="text-[10px] text-blue-300 mt-0.5">{formatDurationMs(timings?.hj)}</div>
            </div>

            {/* Stage 5: CBF Filter */}
            <div className="p-2 rounded bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-500 font-bold">5. CBF FILTER</div>
              <div className="text-white font-bold truncate">HOCBF Simulation</div>
              <div className="text-[10px] text-blue-300 mt-0.5">{formatDurationMs(timings?.cbf)}</div>
            </div>

            {/* Verdict Stage */}
            <div className={`p-2 rounded border ${verdictStyle ? verdictStyle.bg : 'bg-zinc-900 border-space-700'}`}>
              <div className="text-[10px] opacity-75 font-bold">6. VERDICT</div>
              <div className="font-black truncate">{verdict?.status ?? 'PENDING'}</div>
              <div className="text-[10px] opacity-90 mt-0.5">Formal Certificate</div>
            </div>
          </div>
        </div>
      )}

      {/* Verdict Banner */}
      {verdict && verdictStyle && (
        <div className={`p-4 rounded-sm border-2 space-y-3 ${verdictStyle.bg}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <verdictStyle.icon className="w-8 h-8 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                  AUTONOMOUS DECISION VERDICT
                </div>
                <div className="text-xl font-black tracking-tight">{verdictStyle.label}</div>
              </div>
            </div>

            {/* Pc Pre vs Post Metric Pill */}
            {data.assessment && (
              <div className="bg-zinc-950/80 px-4 py-2 rounded-sm border border-space-700/80 flex items-center gap-4 text-xs">
                <div>
                  <div className="text-[10px] text-zinc-400">PRE-MANEUVER Pc</div>
                  <div className="text-alert-amber font-bold text-sm">
                    {formatProbability(data.assessment.pc_pre)}
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />

                <div>
                  <div className="text-[10px] text-zinc-400">POST-MANEUVER Pc</div>
                  <div className="text-cyber-green font-bold text-sm flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-cyber-green" />
                    {formatProbability(data.assessment.pc_post)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Verdict Reasons */}
          {verdict.reasons && verdict.reasons.length > 0 && (
            <div className="border-t border-space-600/40 pt-2 text-xs font-sans space-y-1">
              <div className="font-bold font-mono text-[11px] opacity-90">VERDICT RATIONALE:</div>
              <ul className="list-disc list-inside space-y-0.5 text-zinc-200">
                {verdict.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Subsections: Candidates Table + Heatmap + CBF */}
      {data && (
        <div className="space-y-6">
          {/* Candidates Table */}
          <CandidatesTable
            candidates={data.validation.candidates}
            selectedIndex={data.validation.selected_index}
            selectedCandidate={data.selected}
          />

          {/* EPG Neuro-Symbolic Knowledge Graph */}
          <EPGGraph
            pipelineData={data}
            isBackendOnline={isBackendOnline}
          />

          {/* Grid Layout: HJ Heatmap + CBF Invariance */}
          <div className="space-y-6">
            {/* HJ Heatmap */}
            <HJHeatmapCanvas hj={data.hj} />

            {/* CBF Charts */}
            <CBFCharts cbf={data.cbf} />
          </div>
        </div>
      )}
    </div>
  );
};
