import React, { useState } from 'react';
import { PipelineDiagram } from './PipelineDiagram';
import { HardwareStack } from './HardwareStack';
import { CLMExplainer } from './CLMExplainer';
import {
  Layers,
  Workflow,
  Cpu,
  Brain,
  Sliders,
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'pipeline' | 'hardware' | 'clm'>('all');

  return (
    <div className="w-full space-y-6 text-zinc-100">
      {/* Top Architecture Overview Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5 shadow-xl shadow-black/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <Layers className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold tracking-tight text-white uppercase">
                SYSTEM ARCHITECTURE & EDGE COMPUTE STACK
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-mono">
              RADIATION-HARDENED RISC-V + FPGA HETEROGENEOUS COMPUTING • 16MS LATENT CLM RETRIEVAL
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1.5 bg-zinc-950 p-1.5 rounded-sm border border-zinc-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm transition-all ${
                activeTab === 'all'
                  ? 'bg-cyan-500/20 text-blue-300 border border-cyan-500/40 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Full Stack</span>
            </button>

            <button
              onClick={() => setActiveTab('pipeline')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm transition-all ${
                activeTab === 'pipeline'
                  ? 'bg-cyan-500/20 text-blue-300 border border-cyan-500/40 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Pipeline</span>
            </button>

            <button
              onClick={() => setActiveTab('hardware')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm transition-all ${
                activeTab === 'hardware'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Hardware</span>
            </button>

            <button
              onClick={() => setActiveTab('clm')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm transition-all ${
                activeTab === 'clm'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>CLM Cache</span>
            </button>
          </div>
        </div>

        {/* Global Architecture Spec Metric Strip */}
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">PRIMARY SOC</span>
            <span className="text-zinc-200 font-bold mt-0.5 block">Microchip PolarFire RISC-V</span>
            <span className="text-[10px] text-emerald-500">SEU Immune FPGA Fabric</span>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">ACTION LOOKUP LATENCY</span>
            <span className="text-blue-400 font-bold mt-0.5 block">&lt; 16 ms Deterministic</span>
            <span className="text-[10px] text-zinc-400">Vs. 8-24h Ground Cycle</span>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">ON-BOARD ACTION CACHE</span>
            <span className="text-purple-300 font-bold mt-0.5 block">75 MB Product Quantized</span>
            <span className="text-[10px] text-zinc-400">10,000+ Pre-computed Burns</span>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-sm border border-zinc-800">
            <span className="text-zinc-500 text-[10px] block">FORMAL SAFETY GUARANTEE</span>
            <span className="text-emerald-500 font-bold mt-0.5 block">Hamilton-Jacobi + CBF</span>
            <span className="text-[10px] text-zinc-400">Provable Forward Invariance</span>
          </div>
        </div>
      </div>

      {/* Render Selected View or All Views */}
      {(activeTab === 'all' || activeTab === 'pipeline') && (
        <section id="pipeline-section">
          <PipelineDiagram />
        </section>
      )}

      {(activeTab === 'all' || activeTab === 'clm') && (
        <section id="clm-section">
          <CLMExplainer />
        </section>
      )}

      {(activeTab === 'all' || activeTab === 'hardware') && (
        <section id="hardware-section">
          <HardwareStack />
        </section>
      )}
    </div>
  );
};
