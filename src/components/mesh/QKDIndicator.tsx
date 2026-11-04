import React from 'react';
import { Shield, Key, Radio, Lock, Zap, ShieldCheck } from 'lucide-react';

export interface ISLLinkStatus {
  id: string;
  from: string;
  to: string;
  bandwidth: string;
  latency: number;
  qkdSecured: boolean;
  qber: number; // Quantum Bit Error Rate in %
  active: boolean;
}

const DEFAULT_LINKS: ISLLinkStatus[] = [
  { id: 'L01-02', from: 'AEGIS-01', to: 'AEGIS-02', bandwidth: '10 Gbps', latency: 2.1, qkdSecured: true, qber: 1.2, active: true },
  { id: 'L02-03', from: 'AEGIS-02', to: 'AEGIS-03', bandwidth: '10 Gbps', latency: 2.3, qkdSecured: true, qber: 1.4, active: true },
  { id: 'L03-04', from: 'AEGIS-03', to: 'AEGIS-04', bandwidth: '10 Gbps', latency: 1.9, qkdSecured: true, qber: 1.1, active: true },
  { id: 'L04-05', from: 'AEGIS-04', to: 'AEGIS-05', bandwidth: '10 Gbps', latency: 3.4, qkdSecured: true, qber: 1.8, active: true },
  { id: 'L05-06', from: 'AEGIS-05', to: 'AEGIS-06', bandwidth: '10 Gbps', latency: 2.0, qkdSecured: false, qber: 0, active: true },
  { id: 'L06-07', from: 'AEGIS-06', to: 'AEGIS-07', bandwidth: '10 Gbps', latency: 2.8, qkdSecured: true, qber: 1.5, active: true },
  { id: 'L07-08', from: 'AEGIS-07', to: 'AEGIS-08', bandwidth: '10 Gbps', latency: 3.1, qkdSecured: true, qber: 1.6, active: true },
  { id: 'L08-09', from: 'AEGIS-08', to: 'AEGIS-09', bandwidth: '10 Gbps', latency: 2.5, qkdSecured: false, qber: 0, active: true },
  { id: 'L09-10', from: 'AEGIS-09', to: 'AEGIS-10', bandwidth: '10 Gbps', latency: 2.2, qkdSecured: true, qber: 1.3, active: true },
  { id: 'L10-11', from: 'AEGIS-10', to: 'AEGIS-11', bandwidth: '10 Gbps', latency: 2.4, qkdSecured: true, qber: 1.2, active: true },
  { id: 'L11-12', from: 'AEGIS-11', to: 'AEGIS-12', bandwidth: '10 Gbps', latency: 2.7, qkdSecured: true, qber: 1.4, active: true },
  { id: 'L12-01', from: 'AEGIS-12', to: 'AEGIS-01', bandwidth: '10 Gbps', latency: 3.0, qkdSecured: true, qber: 1.7, active: true },
];

export const QKDIndicator: React.FC = () => {
  const qkdCount = DEFAULT_LINKS.filter((l) => l.qkdSecured).length;
  const totalCount = DEFAULT_LINKS.length;

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40 gap-3">
        <div className="flex items-center space-x-2.5">
          <Key className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
              QUANTUM-SECURE INTER-SATELLITE LINKS
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              ENTANGLED PHOTON DISTRIBUTION & INFORMATION-THEORETIC INTEGRITY
            </span>
          </div>
        </div>

        {/* Global Security Metrics */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 rounded bg-purple-950/40 border border-purple-500/40 text-purple-300 flex items-center space-x-1.5">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span>QKD COVERAGE: {qkdCount}/{totalCount} ({( (qkdCount / totalCount) * 100 ).toFixed(0)}%)</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-zinc-950/40 border border-cyan-500/40 text-blue-300 flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>RATE: 256.4 kbps</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>AVG QBER: 1.4% (&lt; 11% THRESHOLD)</span>
          </div>
        </div>
      </div>

      {/* ISL Links Horizontal Bar / Grid */}
      <div className="p-4 bg-zinc-950">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {DEFAULT_LINKS.map((link) => {
            const isQkd = link.qkdSecured;

            return (
              <div
                key={link.id}
                className={`p-3 rounded-sm border transition-all duration-200 flex flex-col justify-between font-mono space-y-2 ${
                  isQkd
                    ? 'bg-purple-950/20 border-purple-500/40 hover:border-purple-400 shadow-md'
                    : 'bg-zinc-950/15 border-cyan-500/30 hover:border-cyan-400'
                }`}
              >
                {/* Node Pair and Status Shield */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-200">
                    {link.from.replace('AEGIS-', 'A')} ↔ {link.to.replace('AEGIS-', 'A')}
                  </span>
                  {isQkd ? (
                    <div className="flex items-center space-x-0.5 text-purple-400" title="Quantum Key Distribution Active">
                      <Shield className="w-3.5 h-3.5 fill-purple-400/20" />
                    </div>
                  ) : (
                    <div className="flex items-center space-x-0.5 text-blue-400" title="Standard TLS Laser ISL">
                      <Radio className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Bandwidth & Latency Readout */}
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between text-zinc-400">
                    <span>BW:</span>
                    <span className="text-zinc-200 font-semibold">{link.bandwidth}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>RTT:</span>
                    <span className="text-emerald-500 font-semibold">{link.latency} ms</span>
                  </div>
                  {isQkd && (
                    <div className="flex justify-between text-zinc-400">
                      <span>QBER:</span>
                      <span className="text-purple-300 font-semibold">{link.qber}%</span>
                    </div>
                  )}
                </div>

                {/* Security Tag */}
                <div className="pt-1.5 border-t border-zinc-800">
                  <span
                    className={`block text-center text-[9px] py-0.5 rounded font-bold uppercase tracking-wider ${
                      isQkd
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-cyan-500/10 text-blue-300 border border-cyan-500/30'
                    }`}
                  >
                    {isQkd ? 'QKD SECURED' : 'STANDARD ISL'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Security Specification Footer */}
        <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-zinc-400 gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 " />
            <span>ENCRYPTION STANDARD: BB84 DECOY-STATE PROTOCOL + ONE-TIME PAD (OTP)</span>
          </div>
          <div className="text-zinc-500">
            EAVESDROPPING SENSITIVITY: 100% QUANTUM DETECTION PROBABILITY
          </div>
        </div>
      </div>
    </div>
  );
};
