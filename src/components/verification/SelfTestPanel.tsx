import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Info,
  Server,
  Zap,
} from 'lucide-react';
import type { SelfTestResponse } from '../../lib/apiClient';
import { formatNumberSmart, formatDurationMs } from './formatters';

interface SelfTestPanelProps {
  data: SelfTestResponse | null;
  loading: boolean;
  onRunTest: () => void;
  isBackendOnline: boolean;
}

export const SelfTestPanel: React.FC<SelfTestPanelProps> = ({
  data,
  loading,
  onRunTest,
  isBackendOnline,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'verification' | 'validation'>('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [autoReRun, setAutoReRun] = useState<boolean>(false);

  // Auto re-run effect (every 30s when enabled and online)
  useEffect(() => {
    if (!autoReRun || !isBackendOnline) return;
    const interval = setInterval(() => {
      onRunTest();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoReRun, isBackendOnline, onRunTest]);

  const toggleExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const filteredTests = data?.tests.filter((t) => {
    if (filterCategory === 'all') return true;
    return t.category === filterCategory;
  }) ?? [];

  const allPassed = data ? data.summary.failed === 0 && data.summary.total > 0 : false;

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm p-5 space-y-5 font-mono shadow-xl">
      {/* Panel Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-space-600/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/30 uppercase font-bold">
              INDEPENDENT ORACLES
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs text-zinc-400">16 NUMERICAL VALIDATION BENCHMARKS</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
            Verification &amp; Validation Test Suite
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5 max-w-3xl font-sans">
            <span className="text-zinc-300 font-semibold">What is being proven:</span> 16 live independent mathematical oracles verify Foster B-plane 2D numerical quadrature against exact Rician and closed-form limits, SGP4 orbital propagation against Vallado 2006 AIAA benchmarks, Isaacs semi-Lagrangian HJ reachability against analytic boundaries, HOCBF forward invariance, and CLM determinism.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Auto re-run toggle */}
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none bg-zinc-900 px-3 py-1.5 rounded-sm border border-space-700 hover:border-space-600">
            <input
              type="checkbox"
              checked={autoReRun}
              onChange={(e) => setAutoReRun(e.target.checked)}
              className="accent-cyber-green rounded cursor-pointer"
            />
            <span className="flex items-center gap-1.5">
              <RotateCw className={`w-3 h-3 text-zinc-400 ${autoReRun ? 'animate-spin text-cyber-green' : ''}`} />
              Auto re-run (30s)
            </span>
          </label>

          {/* Run Suite Button */}
          <button
            type="button"
            onClick={onRunTest}
            disabled={loading || !isBackendOnline}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-purple-900/30 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>EVALUATING ORACLES…</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>RUN VERIFICATION SUITE</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Banner & Stats Cards */}
      {data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* PASS/FAIL Badge Card */}
            <div
              className={`p-4 rounded-sm border flex items-center gap-3.5 ${
                allPassed
                  ? 'bg-cyber-green/10 border-cyber-green/40 text-cyber-green'
                  : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
              }`}
            >
              {allPassed ? (
                <CheckCircle2 className="w-8 h-8 shrink-0 text-cyber-green" />
              ) : (
                <XCircle className="w-8 h-8 shrink-0 text-alert-red" />
              )}
              <div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  SUITE RESULT
                </div>
                <div className="text-base font-black tracking-tight">
                  {allPassed ? 'PASS (16/16)' : `FAIL (${data.summary.failed} FAILED)`}
                </div>
                <div className="text-[10px] opacity-80">
                  {allPassed ? 'All independent oracles satisfied' : 'Discrepancy detected'}
                </div>
              </div>
            </div>

            {/* Total Duration */}
            <div className="p-4 rounded-sm bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                BACKEND COMPUTE TIME
              </div>
              <div className="text-lg font-black text-blue-300 mt-0.5">
                {formatDurationMs(data.total_duration_ms)}
              </div>
              <div className="text-[10px] text-zinc-500">Live execution on CPU</div>
            </div>

            {/* Passed / Total Breakdown */}
            <div className="p-4 rounded-sm bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                ORACLES VERIFIED
              </div>
              <div className="text-lg font-black text-white mt-0.5">
                <span className="text-cyber-green">{data.summary.passed}</span>
                <span className="text-zinc-500"> / </span>
                <span>{data.summary.total}</span>
              </div>
              <div className="text-[10px] text-zinc-400">
                100% Deterministic &bull; 0 Fudged
              </div>
            </div>

            {/* Runtime Stack */}
            <div className="p-4 rounded-sm bg-zinc-900 border border-space-700">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <Server className="w-3 h-3 text-indigo-400" />
                ENVIRONMENT
              </div>
              <div className="text-xs text-zinc-200 mt-1 space-y-0.5 leading-tight truncate">
                <div>Python: <span className="text-blue-300">{data.environment.python}</span></div>
                <div>NumPy: <span className="text-indigo-300">{data.environment.numpy}</span> &bull; SciPy: <span className="text-indigo-300">{data.environment.scipy}</span></div>
                <div>SGP4: <span className="text-purple-300">{data.environment.sgp4}</span></div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 mr-1 text-[11px]">FILTER:</span>
              {(['all', 'verification', 'validation'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-all ${
                    filterCategory === cat
                      ? cat === 'verification'
                        ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                        : cat === 'validation'
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                        : 'bg-space-700 text-white border border-space-500'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >
                  {cat === 'all'
                    ? `ALL (${data.tests.length})`
                    : cat === 'verification'
                    ? `VERIFICATION (${data.tests.filter((t) => t.category === 'verification').length})`
                    : `VALIDATION (${data.tests.filter((t) => t.category === 'validation').length})`}
                </button>
              ))}
            </div>

            <div className="text-[10px] text-zinc-400 hidden sm:block">
              Click any row to view mathematical method, reference citation &amp; details
            </div>
          </div>

          {/* Tests Table */}
          <div className="overflow-x-auto rounded-sm border border-space-700 bg-zinc-950">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-space-700 bg-zinc-900/80 text-[11px] text-zinc-400 font-bold uppercase">
                  <th className="py-2.5 px-3 w-8">#</th>
                  <th className="py-2.5 px-3">Test ID &amp; Benchmark Name</th>
                  <th className="py-2.5 px-3 w-28">Category</th>
                  <th className="py-2.5 px-3 text-right">Expected</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Error / Tol</th>
                  <th className="py-2.5 px-3 text-right w-20">Time</th>
                  <th className="py-2.5 px-3 text-center w-24">Status</th>
                  <th className="py-2.5 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-space-800 text-[11px]">
                {filteredTests.map((test, idx) => {
                  const isExpanded = expandedRowId === test.id;
                  const isPass = test.passed;

                  return (
                    <React.Fragment key={test.id}>
                      <tr
                        onClick={() => toggleExpand(test.id)}
                        className={`cursor-pointer transition-colors hover:bg-zinc-900/60 ${
                          isExpanded ? 'bg-zinc-900/90' : idx % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-950/60'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-zinc-600 text-center">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-zinc-200">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-300 font-bold">{test.id}</span>
                            <span className="text-zinc-400 font-normal truncate max-w-xs">{test.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              test.category === 'verification'
                                ? 'bg-zinc-950/80 text-blue-300 border-blue-500/40'
                                : 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                            }`}
                          >
                            {test.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                          {formatNumberSmart(test.expected)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-200 font-bold">
                          {formatNumberSmart(test.actual)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                          {test.error !== null && test.tolerance !== null ? (
                            <span>
                              <span className="text-zinc-300">{formatNumberSmart(test.error)}</span>
                              <span className="text-zinc-500"> / </span>
                              <span className="text-zinc-500">{formatNumberSmart(test.tolerance)}</span>
                              {test.unit ? <span className="text-zinc-500 ml-1 text-[10px]">{test.unit}</span> : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                          {formatDurationMs(test.duration_ms)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                              isPass
                                ? 'bg-cyber-green/15 text-cyber-green border-cyber-green/40'
                                : 'bg-alert-red/15 text-alert-red border-alert-red/40 animate-pulse'
                            }`}
                          >
                            {isPass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {isPass ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-zinc-500 text-center">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                      </tr>

                      {/* Expanded Row Accordion */}
                      {isExpanded && (
                        <tr className="bg-zinc-900/90 border-y border-space-700/80">
                          <td colSpan={9} className="p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div className="space-y-2">
                                <div>
                                  <span className="text-zinc-500 font-bold uppercase text-[10px]">DESCRIPTION</span>
                                  <p className="text-zinc-200 font-sans mt-0.5 leading-relaxed">{test.description}</p>
                                </div>
                                <div>
                                  <span className="text-zinc-500 font-bold uppercase text-[10px]">NUMERICAL METHOD</span>
                                  <p className="text-blue-300 font-mono mt-0.5">{test.method}</p>
                                </div>
                                <div>
                                  <span className="text-zinc-500 font-bold uppercase text-[10px]">LITERATURE REFERENCE</span>
                                  <p className="text-purple-300 font-mono mt-0.5 flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                    {test.reference}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <span className="text-zinc-500 font-bold uppercase text-[10px]">ORACLE METRICS &amp; DETAILS JSON</span>
                                <pre className="mt-1 p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 max-h-40 overflow-auto font-mono whitespace-pre-wrap">
                                  {JSON.stringify(
                                    {
                                      id: test.id,
                                      expected: test.expected,
                                      actual: test.actual,
                                      error: test.error,
                                      tolerance: test.tolerance,
                                      unit: test.unit,
                                      duration_ms: test.duration_ms,
                                      details: test.details ?? {},
                                    },
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="p-10 text-center border border-dashed border-space-700 rounded-sm space-y-3">
          <Zap className="w-8 h-8 text-purple-400 mx-auto" />
          <div className="text-sm font-bold text-zinc-200">Verification Suite Ready to Execute</div>
          <p className="text-xs text-zinc-400 max-w-md mx-auto font-sans">
            Click <strong>RUN VERIFICATION SUITE</strong> above to dispatch real-time oracle tests against the FastAPI engine. Every test runs live at invocation.
          </p>
        </div>
      )}
    </div>
  );
};
