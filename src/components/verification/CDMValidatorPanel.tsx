import React, { useState } from 'react';
import {
  FileText,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Send,
  RotateCw,
} from 'lucide-react';
import type { CDMValidationResponse } from '../../lib/apiClient';

const SAMPLE_CDM = `COMMENT Conjunction Data Message
CCSDS_CDM_VERS = 2.0
CREATION_DATE = 2026-09-29T10:00:00.000Z
ORIGINATOR = AEGIS-MESH
META_START
OBJECT = OBJECT_A
OBJECT_NAME = ISS (ZARYA)
OBJECT_ID = 1998-067A
EPOCH = 2026-09-29T11:30:00.000Z
META_STOP
META_START
OBJECT = OBJECT_B
OBJECT_NAME = CSS (TIANHE)
OBJECT_ID = 2021-035A
EPOCH = 2026-09-29T11:30:00.000Z
META_STOP
RELATIVE_POSITION_R = 1200.0
RELATIVE_POSITION_T = -850.0
RELATIVE_POSITION_N = 300.0
RELATIVE_SPEED = 10.5
MISS_DISTANCE = 1.49
TCA = 2026-09-29T11:30:00.000Z
COLLISION_PROBABILITY = 2.5E-05`;

interface CDMValidatorPanelProps {
  data: CDMValidationResponse | null;
  loading: boolean;
  onValidate: (cdmText: string) => void;
  isBackendOnline: boolean;
}

export const CDMValidatorPanel: React.FC<CDMValidatorPanelProps> = ({
  data,
  loading,
  onValidate,
  isBackendOnline,
}) => {
  const [cdmText, setCdmText] = useState<string>(SAMPLE_CDM);

  const handleValidate = () => {
    if (!cdmText.trim()) return;
    onValidate(cdmText);
  };

  const handleResetSample = () => {
    setCdmText(SAMPLE_CDM);
  };

  const getSeverityBadge = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return {
          chip: 'bg-alert-red/15 text-alert-red border-alert-red/40',
          icon: XCircle,
        };
      case 'warning':
        return {
          chip: 'bg-alert-amber/15 text-alert-amber border-alert-amber/40',
          icon: AlertTriangle,
        };
      case 'info':
      default:
        return {
          chip: 'bg-zinc-950/60 text-blue-300 border-blue-500/40',
          icon: Info,
        };
    }
  };

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm p-5 space-y-5 font-mono shadow-xl">
      {/* Panel Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-space-600/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-950/70 text-blue-300 border border-blue-500/30 uppercase font-bold">
              CCSDS 508.0-B-1 CONFORMANCE
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs text-zinc-400">STRUCTURAL &amp; KINEMATIC INTEGRITY</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            Conjunction Data Message (CDM) Validator
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5 max-w-3xl font-sans">
            <span className="text-zinc-300 font-semibold">What is being proven:</span> The CDM validator parses CCSDS 508.0-B-1 messages and rigorously verifies metadata keywords, ISO-8601 timestamps, collision probability ranges, and mathematical consistency between stated MISS_DISTANCE and the Euclidean norm of RELATIVE_POSITION [R, T, N].
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handleResetSample}
            className="px-3 py-2 rounded-sm bg-zinc-900 hover:bg-space-700 text-zinc-300 border border-space-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            SAMPLE CDM
          </button>

          <button
            type="button"
            onClick={handleValidate}
            disabled={loading || !isBackendOnline || !cdmText.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-900/30 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>CHECKING CONFORMANCE…</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>VALIDATE CDM</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor & Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: CDM Text Area */}
        <div className="lg:col-span-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>CCSDS 508.0 KEYVALUE PAYLOAD</span>
            <span className="text-[10px] text-zinc-500">{cdmText.split('\n').length} lines</span>
          </div>
          <textarea
            value={cdmText}
            onChange={(e) => setCdmText(e.target.value)}
            rows={15}
            className="w-full bg-zinc-950 border border-space-700 rounded-sm p-3 text-xs text-zinc-200 font-mono leading-relaxed focus:border-emerald-500 focus:outline-none resize-y"
            placeholder="Paste CCSDS 508.0 Conjunction Data Message here..."
          />
        </div>

        {/* Right: Validation Checks Outcome */}
        <div className="lg:col-span-6 space-y-3">
          {data ? (
            <div className="space-y-3">
              {/* Overall Validity Header */}
              <div
                className={`p-3 rounded-sm border flex items-center justify-between ${
                  data.valid
                    ? 'bg-cyber-green/10 border-cyber-green/40 text-cyber-green'
                    : 'bg-alert-red/10 border-alert-red/40 text-alert-red'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {data.valid ? (
                    <CheckCircle2 className="w-6 h-6 text-cyber-green" />
                  ) : (
                    <XCircle className="w-6 h-6 text-alert-red" />
                  )}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide">
                      {data.valid ? 'VALID CCSDS MESSAGE' : 'INCONSISTENCIES FLAGGED'}
                    </div>
                    <div className="text-[10px] opacity-80">
                      {data.valid
                        ? 'All structural, kinematic and range tests passed'
                        : `${data.errors} errors, ${data.warnings} warnings detected`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="px-2 py-0.5 rounded bg-alert-red/20 text-alert-red border border-alert-red/40">
                    {data.errors} ERR
                  </span>
                  <span className="px-2 py-0.5 rounded bg-alert-amber/20 text-alert-amber border border-alert-amber/40">
                    {data.warnings} WARN
                  </span>
                </div>
              </div>

              {/* List of Check Items */}
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {data.checks.map((chk, i) => {
                  const style = getSeverityBadge(chk.severity);
                  const Icon = style.icon;

                  return (
                    <div
                      key={`${chk.id}-${i}`}
                      className="p-2.5 rounded-sm bg-zinc-900 border border-space-700/80 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${style.chip}`}
                          >
                            {chk.severity}
                          </span>
                          <span className="font-bold text-zinc-200">{chk.id}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          {chk.passed ? (
                            <span className="text-cyber-green font-bold text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> PASS
                            </span>
                          ) : (
                            <span className="text-alert-red font-bold text-[10px] flex items-center gap-1">
                              <Icon className="w-3 h-3" /> FAIL
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-300 font-sans">{chk.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="p-8 text-center border border-dashed border-space-700 rounded-sm space-y-2">
              <FileText className="w-8 h-8 text-zinc-500 mx-auto" />
              <div className="text-xs font-bold text-zinc-300">Awaiting CDM Validation</div>
              <p className="text-[11px] text-zinc-400 font-sans max-w-xs mx-auto">
                Click <strong>VALIDATE CDM</strong> to run formal CCSDS 508.0 kinematic checks on the message.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
