import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Award,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type { PipelineCandidate, PipelineRuleResult } from '../../lib/apiClient';
import { formatNumberSmart } from './formatters';

interface CandidatesTableProps {
  candidates: PipelineCandidate[];
  selectedIndex: number | null;
  selectedCandidate: PipelineCandidate | null;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export const CandidatesTable: React.FC<CandidatesTableProps> = ({
  candidates,
  selectedIndex,
  selectedCandidate,
}) => {
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeTooltip, setActiveTooltip] = useState<{
    candidateId: number;
    ruleId: string;
    rule: PipelineRuleResult;
    x: number;
    y: number;
  } | null>(null);

  const totalCandidates = candidates ? candidates.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalCandidates / pageSize));

  // If a candidate is selected, automatically jump to the page containing that candidate
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < totalCandidates) {
      const targetPage = Math.floor(selectedIndex / pageSize) + 1;
      if (targetPage !== currentPage && targetPage <= totalPages) {
        setCurrentPage(targetPage);
      }
    }
  }, [selectedIndex, pageSize, totalCandidates, totalPages, currentPage]);

  // Ensure currentPage remains valid if candidates list shrinks
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Paginated slice
  const paginatedCandidates = useMemo(() => {
    if (!candidates || candidates.length === 0) return [];
    const startIndex = (currentPage - 1) * pageSize;
    return candidates.slice(startIndex, startIndex + pageSize);
  }, [candidates, currentPage, pageSize]);

  if (!candidates || candidates.length === 0) {
    return (
      <div className="p-6 text-center border border-dashed border-space-700 rounded-sm text-zinc-400 font-mono text-xs">
        No CLM candidates evaluated yet.
      </div>
    );
  }

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLButtonElement>,
    candId: number,
    rule: PipelineRuleResult
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveTooltip({
      candidateId: candId,
      ruleId: rule.id,
      rule,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  };

  const handleMouseLeave = () => {
    setActiveTooltip(null);
  };

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCandidates);

  return (
    <div className="space-y-2 relative">
      {/* Header controls: Title & Pagination controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-200">CLM CANDIDATE MANEUVER EVALUATION</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-space-700 text-zinc-300 font-bold">
            {totalCandidates.toLocaleString()} MANEUVERS
          </span>
          {totalCandidates > pageSize && (
            <span className="text-[10px] text-blue-400 font-mono hidden md:inline">
              (Viewing {startIndex + 1}–{endIndex})
            </span>
          )}
        </div>

        {/* Page size selector & hover instruction */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-zinc-500">Rows:</span>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  pageSize === size
                    ? 'bg-cyber-green text-space-950 font-bold'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-space-700'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="text-[10px] text-zinc-500 hidden lg:inline">
            Hover R1–R5 for details
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-sm border border-space-700 bg-zinc-950">
        <table className="w-full text-left text-xs border-collapse font-mono">
          <thead>
            <tr className="border-b border-space-700 bg-zinc-900/90 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              <th className="py-2.5 px-3 w-12 text-center">Rank</th>
              <th className="py-2.5 px-3">Candidate Label &amp; Category</th>
              <th className="py-2.5 px-3 text-right">Δv (m/s)</th>
              <th className="py-2.5 px-3 text-center">Direction [R, T, N]</th>
              <th className="py-2.5 px-3 text-right">Confidence</th>
              <th className="py-2.5 px-3 text-right">Score</th>
              <th className="py-2.5 px-4 text-center">EPG/KGDSL Rules (R1–R5)</th>
              <th className="py-2.5 px-3 text-center w-24">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-space-800 text-[11px]">
            {paginatedCandidates.map((cand, pageIdx) => {
              const globalIdx = startIndex + pageIdx;
              const isSelected =
                selectedIndex === globalIdx ||
                (selectedCandidate && selectedCandidate.id === cand.id) ||
                (cand.accepted && selectedIndex === null && globalIdx === 0);

              const isRejected = !cand.accepted;
              const rules = Array.isArray(cand.rules) ? cand.rules : [];
              const rtn = Array.isArray(cand.direction_rtn) ? cand.direction_rtn : [0, 0, 0];
              const dv = typeof cand.delta_v_mps === 'number' && Number.isFinite(cand.delta_v_mps)
                ? cand.delta_v_mps.toFixed(2)
                : '—';
              const conf = typeof cand.confidence === 'number' && Number.isFinite(cand.confidence)
                ? `${(cand.confidence * 100).toFixed(1)}%`
                : '—';
              const score = typeof cand.score === 'number' && Number.isFinite(cand.score)
                ? cand.score.toFixed(3)
                : '—';

              return (
                <tr
                  key={`${cand.id}-${globalIdx}`}
                  className={`transition-colors ${
                    isSelected
                      ? 'bg-cyber-green/15 border-l-4 border-l-cyber-green font-semibold'
                      : isRejected
                      ? 'bg-zinc-950/40 text-zinc-500 hover:bg-zinc-900/40'
                      : 'bg-zinc-900/40 text-zinc-200 hover:bg-zinc-900/70'
                  }`}
                >
                  {/* Rank */}
                  <td className="py-2 px-3 text-center">
                    <span className={isSelected ? 'text-cyber-green font-bold' : 'text-zinc-500'}>
                      #{cand.rank ?? globalIdx + 1}
                    </span>
                  </td>

                  {/* Label & Category */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isSelected ? 'text-white' : isRejected ? 'text-zinc-400' : 'text-zinc-200'}`}>
                        {cand.label || `CLM-CAND-${cand.id}`}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-space-800 text-zinc-400 border border-space-700 uppercase">
                        {cand.category || 'generic'}
                      </span>
                    </div>
                  </td>

                  {/* Delta-V */}
                  <td className="py-2 px-3 text-right">
                    <span className={isSelected ? 'text-blue-300 font-bold' : isRejected ? 'text-zinc-500' : 'text-zinc-300'}>
                      {dv}
                    </span>
                  </td>

                  {/* RTN Direction */}
                  <td className="py-2 px-3 text-center text-[10px] text-zinc-400">
                    [{rtn.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '0.00')).join(', ')}]
                  </td>

                  {/* Confidence */}
                  <td className="py-2 px-3 text-right text-zinc-400">
                    {conf}
                  </td>

                  {/* Score */}
                  <td className="py-2 px-3 text-right text-zinc-400">
                    {score}
                  </td>

                  {/* Rule Chips R1..R5 */}
                  <td className="py-2 px-4">
                    <div className="flex items-center justify-center gap-1.5">
                      {rules.map((rule) => {
                        const passed = Boolean(rule.passed);
                        return (
                          <button
                            key={rule.id}
                            type="button"
                            onMouseEnter={(e) => handleMouseEnter(e, cand.id, rule)}
                            onMouseLeave={handleMouseLeave}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                              passed
                                ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/40 hover:bg-cyber-green/20'
                                : 'bg-alert-red/10 text-alert-red border-alert-red/40 hover:bg-alert-red/20'
                            }`}
                            title={`${rule.id} (${rule.name}): ${passed ? 'PASSED' : 'FAILED'} — Val: ${formatNumberSmart(rule.value)} / Lim: ${formatNumberSmart(rule.limit)} ${rule.unit ?? ''}\n${rule.detail || ''}`}
                          >
                            <span>{rule.id}</span>
                            {passed ? (
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            ) : (
                              <XCircle className="w-2.5 h-2.5" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* Outcome Badge */}
                  <td className="py-2 px-3 text-center">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-cyber-green text-space-950 shadow-sm shadow-cyber-green/50">
                        <Award className="w-3 h-3" />
                        SELECTED
                      </span>
                    ) : cand.accepted ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950/60 text-emerald-500 border border-emerald-500/30">
                        ACCEPTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-zinc-900 text-zinc-500 border border-zinc-800">
                        REJECTED
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-900/60 border border-space-700 rounded-sm text-xs font-mono text-zinc-400">
          <div className="text-[11px]">
            Showing <span className="text-white font-bold">{startIndex + 1}</span> to{' '}
            <span className="text-white font-bold">{endIndex}</span> of{' '}
            <span className="text-cyber-green font-bold">{totalCandidates.toLocaleString()}</span> maneuvers
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded bg-space-800 hover:bg-space-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 transition-colors"
              title="First Page"
              aria-label="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded bg-space-800 hover:bg-space-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 transition-colors"
              title="Previous Page"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2 text-[11px] text-zinc-300">
              Page <span className="font-bold text-white">{currentPage}</span> of{' '}
              <span className="font-bold text-zinc-400">{totalPages}</span>
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded bg-space-800 hover:bg-space-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 transition-colors"
              title="Next Page"
              aria-label="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded bg-space-800 hover:bg-space-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 transition-colors"
              title="Last Page"
              aria-label="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Rule Tooltip */}
      {activeTooltip && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-zinc-900 border border-space-600 rounded-sm p-2.5 shadow-xl shadow-black/40 text-[11px] font-mono text-zinc-200 max-w-sm "
          style={{ left: activeTooltip.x, top: activeTooltip.y }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-space-700 pb-1 mb-1.5">
            <span className="font-bold text-white flex items-center gap-1.5">
              <span className="text-blue-300">{activeTooltip.rule.id}</span>
              <span>{activeTooltip.rule.name}</span>
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
                activeTooltip.rule.passed
                  ? 'bg-cyber-green/15 text-cyber-green border-cyber-green/40'
                  : 'bg-alert-red/15 text-alert-red border-alert-red/40'
              }`}
            >
              {activeTooltip.rule.passed ? 'PASSED' : 'REJECTED'}
            </span>
          </div>
          <div className="space-y-0.5 text-[10px]">
            <div className="text-zinc-400">
              Evaluated Value:{' '}
              <span className="text-zinc-200 font-bold">
                {formatNumberSmart(activeTooltip.rule.value)} {activeTooltip.rule.unit}
              </span>
            </div>
            <div className="text-zinc-400">
              Threshold Limit:{' '}
              <span className="text-zinc-200 font-bold">
                {formatNumberSmart(activeTooltip.rule.limit)} {activeTooltip.rule.unit}
              </span>
            </div>
            <div className="text-zinc-300 font-sans mt-1 text-[10px] border-t border-zinc-800 pt-1 leading-tight">
              {activeTooltip.rule.detail}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
