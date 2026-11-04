import React, { useState } from 'react';
import {
  Brain,
  Zap,
  HardDrive,
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  CheckCircle2,
  Cpu,
} from 'lucide-react';

export const CLMExplainer: React.FC = () => {
  const [activeSubvector, setActiveSubvector] = useState<number>(0);

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-950/80 rounded-sm overflow-hidden shadow-xl shadow-black/40 ">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-900/40 gap-3">
        <div className="flex items-center space-x-2.5">
          <Brain className="w-5 h-5 text-emerald-500" />
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase">
              CONTRASTIVE STATE-ACTION RETRIEVAL
            </h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              LATENT MANIFOLD EMBEDDING • HARD REAL-TIME ACTION MAPPING WITHOUT ON-ORBIT TRAINING
            </span>
          </div>
        </div>

        {/* Key Metrics Strip */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
            <span>75MB CACHE</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-zinc-950/40 border border-cyan-500/40 text-blue-300 flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>16ms INFERENCE</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-purple-950/40 border border-purple-500/40 text-purple-300 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>InfoNCE LOSS</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-5 space-y-6 bg-zinc-950">
        {/* Contrastive Retrieval Diagram (3 Pillars) */}
        <div>
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>CONTRASTIVE LATENT RETRIEVAL PIPELINE</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-center font-mono">
            {/* Left Box: State Embedding */}
            <div className="lg:col-span-3 p-4 rounded-sm bg-zinc-950 border border-cyan-500/40 shadow-lg space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-bold text-blue-400">1. STATE EMBEDDING</span>
                <span className="text-[10px] text-zinc-500">16-D VECTOR</span>
              </div>

              <div className="space-y-1.5 text-[11px] text-zinc-300">
                <div className="text-[10px] text-zinc-500 uppercase">Input Telemetry:</div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Relative Position:</span>
                  <span className="text-blue-300">[Δx, Δy, Δz]</span>
                </div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Relative Velocity:</span>
                  <span className="text-blue-300">[vx, vy, vz]</span>
                </div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>B-Plane Geometry:</span>
                  <span className="text-blue-300">[ξ, ζ, |b|]</span>
                </div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Conjunction TCA:</span>
                  <span className="text-blue-300">t_tca, P_c</span>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 text-[10px] text-zinc-400">
                <span className="text-emerald-500 font-semibold">Encoder:</span> 4-Layer Rad-Hard MLP with L2-Unit Normalization
              </div>
            </div>

            {/* Transition Arrow 1 */}
            <div className="lg:col-span-1 flex justify-center text-blue-400 py-2 lg:py-0">
              <ArrowRight className="w-6 h-6 " />
            </div>

            {/* Center Box: Dot-Product Matrix Similarity */}
            <div className="lg:col-span-3 p-4 rounded-sm bg-zinc-950 border border-emerald-500/40 shadow-lg space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-bold text-emerald-500">2. DOT-PRODUCT SIMILARITY</span>
                <span className="text-[10px] text-zinc-500">SIMD FPGA</span>
              </div>

              <div className="bg-zinc-900 p-2.5 rounded border border-zinc-800 text-center space-y-1">
                <span className="text-[10px] text-zinc-500 block">COSINE SIMILARITY KERNEL:</span>
                <div className="text-xs text-emerald-300 font-bold tracking-wider">
                  sim(z_s, z_a) = (z_s · z_a) / τ
                </div>
                <span className="text-[9px] text-zinc-400 block">Temperature τ = 0.07 (InfoNCE)</span>
              </div>

              {/* Visual Matrix Multiplication Grid Representation */}
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 block">PARALLEL MAC PIPELINE:</span>
                <div className="grid grid-cols-8 gap-1 p-1.5 bg-zinc-900 rounded border border-zinc-800">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-3 rounded-xs bg-emerald-400/20 border border-emerald-500/40 "
                      style={{ animationDelay: `${i * 70}ms` }}
                    />
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-zinc-400 pt-1">
                Latency: <span className="text-emerald-500 font-bold">&lt; 16 ms</span> for 10,000 actions
              </div>
            </div>

            {/* Transition Arrow 2 */}
            <div className="lg:col-span-1 flex justify-center text-emerald-500 py-2 lg:py-0">
              <ArrowRight className="w-6 h-6 " />
            </div>

            {/* Right Box: Action Cache */}
            <div className="lg:col-span-3 p-4 rounded-sm bg-zinc-950 border border-purple-500/40 shadow-lg space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-bold text-purple-300">3. ACTION CACHE</span>
                <span className="text-[10px] text-zinc-500">BEST MATCH</span>
              </div>

              <div className="space-y-1.5 text-[11px] text-zinc-300">
                <div className="text-[10px] text-zinc-500 uppercase">Selected Maneuver:</div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Delta-V Vector:</span>
                  <span className="text-purple-300">[+0.65, -0.25, +0.82] m/s</span>
                </div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Burn Duration:</span>
                  <span className="text-purple-300">62.0 s (RCS Cold-Gas)</span>
                </div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Propellant Cost:</span>
                  <span className="text-emerald-500">0.95 kg</span>
                </div>
                <div className="flex justify-between bg-zinc-900 px-2 py-1 rounded">
                  <span>Post-Burn P_c:</span>
                  <span className="text-emerald-500">&lt; 1.0 × 10⁻⁸</span>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 flex items-center space-x-1.5 text-[10px] text-emerald-500">
                <CheckCircle2 className="w-3 h-3" />
                <span>Hamilton-Jacobi Certified Safe</span>
              </div>
            </div>
          </div>
        </div>

        {/* Product Quantization (PQ) Explainer Section */}
        <div className="pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-300 uppercase tracking-wider">
              <Database className="w-4 h-4 text-purple-400" />
              <span>PRODUCT QUANTIZATION (PQ) COMPRESSION: 94% MEMORY REDUCTION</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Stores 10,000+ certified maneuvers in 75MB rad-hard eNVM
            </span>
          </div>

          <div className="p-4 rounded-sm bg-zinc-950 border border-zinc-800 font-mono space-y-4">
            {/* Visual Transformation Workflow */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              {/* Step 1: Full High-Dim Vector */}
              <div className="p-3 rounded-sm bg-zinc-900 border border-zinc-700/60">
                <span className="text-[10px] text-zinc-400 block uppercase">1. FULL VECTOR (FP32)</span>
                <span className="text-xs font-bold text-zinc-200 mt-1 block">d = 64 dimensions</span>
                <div className="flex items-center space-x-1 mt-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex-1 h-4 rounded-xs bg-cyan-600/30 border border-cyan-500/50" />
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500 mt-1 block">Memory: 256 bytes / action</span>
              </div>

              {/* Step 2: Sub-vector Splitting */}
              <div className="p-3 rounded-sm bg-zinc-900 border border-zinc-700/60">
                <span className="text-[10px] text-zinc-400 block uppercase">2. SUB-VECTOR DECOMPOSITION</span>
                <span className="text-xs font-bold text-emerald-300 mt-1 block">M = 4 sub-vectors (d/4 = 16)</span>
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {['Sub-1', 'Sub-2', 'Sub-3', 'Sub-4'].map((sub, i) => (
                    <button
                      key={sub}
                      onClick={() => setActiveSubvector(i)}
                      className={`text-[9px] py-1 rounded border transition-colors ${
                        activeSubvector === i
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500 mt-1 block">K = 16 Centroids per codebook</span>
              </div>

              {/* Step 3: Quantized Codebook IDs */}
              <div className="p-3 rounded-sm bg-zinc-900 border border-zinc-700/60">
                <span className="text-[10px] text-zinc-400 block uppercase">3. CODEBOOK QUANTIZED IDS</span>
                <span className="text-xs font-bold text-purple-300 mt-1 block">4-byte Byte Array [ID₁, ID₂, ID₃, ID₄]</span>
                <div className="flex items-center space-x-1.5 mt-2">
                  {[12, 4, 15, 7].map((id, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold"
                    >
                      {id}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-emerald-500 mt-1 block font-bold">16 bytes / action (94% compressed)</span>
              </div>
            </div>

            {/* Mathematical Guarantee Note */}
            <div className="p-2.5 rounded bg-zinc-950/20 border border-zinc-900/30 text-xs text-zinc-300 flex items-start space-x-2">
              <Cpu className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="leading-relaxed">
                <span className="text-blue-400 font-bold">Asymmetric Distance Computation (ADC):</span> The online query vector is left unquantized, while cache actions are looked up using pre-computed centroid distance tables in RISC-V L1 cache, achieving deterministic $O(M)$ lookup latency without floating-point decompression overhead.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
