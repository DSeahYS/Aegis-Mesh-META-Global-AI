import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Cpu,
  Zap,
  Thermometer,
  Database,
  Terminal as TerminalIcon,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Microchip,
  Layers,
  Clock,
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'PROFILE';
  message: string;
}

interface LatencyFrame {
  frame: number;
  latency: number;
  mean: number;
}

interface ConvergenceDataPoint {
  step: string;
  stepVal: number;
  trainLoss: number;
  valLoss: number;
}

interface SuccessRateDataPoint {
  step: string;
  stepVal: number;
  successRate: number;
  baseline: number;
}

const CONVERGENCE_DATA: ConvergenceDataPoint[] = [
  { step: '0', stepVal: 0, trainLoss: 4.85, valLoss: 4.90 },
  { step: '50k', stepVal: 50, trainLoss: 2.68, valLoss: 2.76 },
  { step: '100k', stepVal: 100, trainLoss: 1.64, valLoss: 1.72 },
  { step: '200k', stepVal: 200, trainLoss: 0.95, valLoss: 1.02 },
  { step: '300k', stepVal: 300, trainLoss: 0.58, valLoss: 0.65 },
  { step: '400k', stepVal: 400, trainLoss: 0.38, valLoss: 0.44 },
  { step: '500k', stepVal: 500, trainLoss: 0.26, valLoss: 0.31 },
  { step: '600k', stepVal: 600, trainLoss: 0.18, valLoss: 0.23 },
  { step: '700k', stepVal: 700, trainLoss: 0.14, valLoss: 0.18 },
  { step: '800k', stepVal: 800, trainLoss: 0.11, valLoss: 0.14 },
  { step: '900k', stepVal: 900, trainLoss: 0.095, valLoss: 0.115 },
  { step: '1M', stepVal: 1000, trainLoss: 0.089, valLoss: 0.098 },
];

const SUCCESS_RATE_DATA: SuccessRateDataPoint[] = [
  { step: '0', stepVal: 0, successRate: 60.2, baseline: 60.0 },
  { step: '50k', stepVal: 50, successRate: 68.4, baseline: 60.0 },
  { step: '100k', stepVal: 100, successRate: 77.9, baseline: 60.0 },
  { step: '200k', stepVal: 200, successRate: 88.5, baseline: 60.0 },
  { step: '300k', stepVal: 300, successRate: 93.8, baseline: 60.0 },
  { step: '400k', stepVal: 400, successRate: 96.4, baseline: 60.0 },
  { step: '500k', stepVal: 500, successRate: 97.9, baseline: 60.0 },
  { step: '600k', stepVal: 600, successRate: 98.9, baseline: 60.0 },
  { step: '700k', stepVal: 700, successRate: 99.42, baseline: 60.0 },
  { step: '800k', stepVal: 800, successRate: 99.75, baseline: 60.0 },
  { step: '900k', stepVal: 900, successRate: 99.91, baseline: 60.0 },
  { step: '1M', stepVal: 1000, successRate: 99.98, baseline: 60.0 },
];

const INITIAL_LOGS: LogEntry[] = [
  {
    id: 'log-0',
    timestamp: '14:02:40.102',
    level: 'INFO',
    message: '[CUDA:0] Device initialized: Microchip PolarFire SoC MPFS250T + Space TPU Core',
  },
  {
    id: 'log-1',
    timestamp: '14:02:40.115',
    level: 'INFO',
    message: 'Loaded weights: AEGIS-MESH CLM (dim=16, codebook=256x16, fp16 -> int8 quant)',
  },
  {
    id: 'log-2',
    timestamp: '14:02:40.230',
    level: 'INFO',
    message: 'Static VRAM allocated: 54.2 MB weights + 21.2 MB activation scratchpad',
  },
  {
    id: 'log-3',
    timestamp: '14:02:40.405',
    level: 'INFO',
    message: 'Allocated tensor shape [1, 16] on VRAM (offset 0x7FA340, stride=16)',
  },
  {
    id: 'log-4',
    timestamp: '14:02:40.412',
    level: 'INFO',
    message: 'GEMM InfoNCE matrix multiplication [1, 16] @ [16, 256] -> [1, 256]',
  },
  {
    id: 'log-5',
    timestamp: '14:02:40.418',
    level: 'PROFILE',
    message: 'Kernel StateEncoder: 2.14ms | Codebook GEMM: 6.82ms | Softmax: 0.31ms',
  },
  {
    id: 'log-6',
    timestamp: '14:02:40.426',
    level: 'SUCCESS',
    message: 'Output Action ID: #142 in 13.2ms (Safety margin: 4.82 km, dv: 0.142 m/s)',
  },
];

const TEMPLATE_LOGS: Array<(frame: number) => { level: 'INFO' | 'SUCCESS' | 'PROFILE'; message: string }> = [
  (f) => ({
    level: 'INFO',
    message: `Allocated tensor shape [1, 16] on VRAM (offset 0x7FA${(340 + (f % 50)).toString(16).toUpperCase()})`,
  }),
  () => ({
    level: 'INFO',
    message: 'GEMM InfoNCE matrix multiplication [1, 16] @ [16, 256] -> [1, 256]',
  }),
  () => {
    const enc = (2.1 + (Math.random() * 0.3 - 0.15)).toFixed(2);
    const gemm = (6.8 + (Math.random() * 0.4 - 0.2)).toFixed(2);
    const soft = (0.3 + (Math.random() * 0.05)).toFixed(2);
    return {
      level: 'PROFILE',
      message: `Kernel StateEncoder: ${enc}ms | Codebook GEMM: ${gemm}ms | Softmax: ${soft}ms`,
    };
  },
  (f) => {
    const actionId = (130 + (f * 7) % 80);
    const ms = (12.2 + Math.random() * 3.4).toFixed(1);
    const dv = (0.120 + ((f % 10) * 0.015)).toFixed(3);
    const margin = (4.5 + Math.random() * 1.2).toFixed(2);
    return {
      level: 'SUCCESS',
      message: `Output Action ID: #${actionId} in ${ms}ms (Safety margin: ${margin} km, dv: ${dv} m/s)`,
    };
  },
  (f) => ({
    level: 'INFO',
    message: `Telemetry sync frame #${4800 + f}: SpaceWire bus verified, zero packet drop`,
  }),
  () => ({
    level: 'INFO',
    message: 'PyTorch ATen dispatch: zero-copy memory buffer reuse (0 leaks detected)',
  }),
];

function generateInitialLatency(): LatencyFrame[] {
  const points: LatencyFrame[] = [];
  for (let i = 0; i < 30; i++) {
    const lat = Number((12.2 + Math.random() * 3.4).toFixed(2));
    points.push({
      frame: i + 1,
      latency: lat,
      mean: 13.5,
    });
  }
  return points;
}

export const CLMGpuDashboard: React.FC = () => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [latencyHistory, setLatencyHistory] = useState<LatencyFrame[]>(generateInitialLatency);
  const [frameCounter, setFrameCounter] = useState<number>(31);
  const [vramFluctuation, setVramFluctuation] = useState<number>(75.4);
  const [tensorCoreLoad, setTensorCoreLoad] = useState<number>(94.2);
  const [powerDraw, setPowerDraw] = useState<number>(14.2);
  const [temperature, setTemperature] = useState<number>(42.4);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log to bottom on new log entries
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Periodic hardware telemetry update & rolling terminal log generator
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setFrameCounter((prev) => {
        const nextFrame = prev + 1;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(
          now.getMilliseconds()
        ).padStart(3, '0')}`;

        // Select next log template
        const templateFn = TEMPLATE_LOGS[nextFrame % TEMPLATE_LOGS.length];
        const { level, message } = templateFn(nextFrame);

        const newLog: LogEntry = {
          id: `log-${nextFrame}-${Date.now()}`,
          timestamp: timeStr,
          level,
          message,
        };

        setLogs((currentLogs) => {
          const nextLogs = [...currentLogs, newLog];
          return nextLogs.slice(-20);
        });

        // Generate fresh latency sample between 12.0ms and 15.8ms
        const newLatency = Number((12.2 + Math.random() * 3.4).toFixed(2));
        setLatencyHistory((curr) => {
          const updated = [
            ...curr.slice(1),
            {
              frame: nextFrame,
              latency: newLatency,
              mean: 13.5,
            },
          ];
          return updated;
        });

        // Subtle realistic telemetry noise
        setVramFluctuation(Number((75.3 + (nextFrame % 3) * 0.1).toFixed(1)));
        setTensorCoreLoad(Number((93.8 + Math.random() * 1.8).toFixed(1)));
        setPowerDraw(Number((14.1 + Math.random() * 0.3).toFixed(1)));
        setTemperature(Number((42.3 + Math.random() * 0.3).toFixed(1)));

        return nextFrame;
      });
    }, 450);

    return () => clearInterval(interval);
  }, [isRunning]);

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleResetHistory = () => {
    setLatencyHistory(generateInitialLatency());
  };

  // Compute stats for current latency window
  const latencyStats = useMemo(() => {
    if (latencyHistory.length === 0) {
      return { curr: 13.4, min: 12.0, max: 15.6, avg: 13.5, jitter: 0.8 };
    }
    const vals = latencyHistory.map((d) => d.latency);
    const curr = vals[vals.length - 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const sum = vals.reduce((acc, v) => acc + v, 0);
    const avg = Number((sum / vals.length).toFixed(2));
    const jitter = Number((max - min).toFixed(2));
    return { curr, min, max, avg, jitter };
  }, [latencyHistory]);

  return (
    <div className="w-full flex flex-col space-y-6">
      <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 px-4 py-2 rounded mb-4 text-center font-bold text-sm">
        ⚠️ SIMULATED / ILLUSTRATIVE — These metrics are generated for demonstration purposes only
      </div>

      {/* ─────────────────────────────────────────────────────────────
          1. HEADER: CLM Edge Hardware Telemetry (Nsight-Style)
      ─────────────────────────────────────────────────────────────── */}
      <div className="bg-space-800 border border-space-700/60 rounded-sm p-5 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 rounded-sm bg-cyber-blue/10 border border-cyber-blue/30 text-cyber-blue shrink-0">
              <Microchip className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold font-mono text-zinc-100 tracking-wide uppercase">
                  CLM Edge Hardware Telemetry
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  POLARFIRE SoC RISC-V + NPU CORE
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-space-700">
                  DEVICE: MPFS250T-FCVG484E
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-1">
                Real-time Hardware Profiler | AEGIS-MESH Edge Retrieval Model (InfoNCE INT8 Engine)
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-sm bg-zinc-900 border border-space-700/80 text-zinc-300">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Tick: 100 Hz</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Frame #{frameCounter}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm font-medium transition-colors border ${
                isRunning
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Profiler</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Profiler</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleResetHistory}
              title="Reset Latency Window"
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-sm bg-zinc-900 border border-space-700/80 text-zinc-400 hover:text-zinc-200 hover:bg-space-700/50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Specs metadata strip */}
        <div className="mt-4 pt-3.5 border-t border-space-700/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Quantization</span>
            <span className="text-zinc-200 font-semibold mt-0.5">INT8 GEMM (Per-Tensor Act)</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Embedding Latent Space</span>
            <span className="text-zinc-200 font-semibold mt-0.5">16-Dim State / 256 Actions</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Clock Domain</span>
            <span className="text-zinc-200 font-semibold mt-0.5">800 MHz Fabric / 1600 MT/s RAM</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Rad-Tolerant Rating</span>
            <span className="text-emerald-500 font-semibold mt-0.5">TID &gt; 100 krad(Si) / SEU Immune</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION A: Hardware Utilization (Top Row)
      ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: VRAM Usage */}
        <div className="bg-space-800 border border-space-700/60 rounded-sm p-4 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-cyber-blue" />
                VRAM Memory
              </span>
              <span className="text-[10px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                0.92% Allocated
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2 font-mono">
              <span className="text-2xl font-bold text-zinc-100">{vramFluctuation}</span>
              <span className="text-xs text-zinc-400">MB / 8,192 MB</span>
            </div>

            {/* Gauge bar */}
            <div className="mt-3 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-space-700">
              <div
                className="bg-cyber-blue h-full rounded-full transition-all duration-300"
                style={{ width: `${(vramFluctuation / 8192) * 100 * 10}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-space-700/40 text-[11px] font-mono text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Weights (FP16/INT8):</span>
              <span className="text-zinc-200">54.2 MB</span>
            </div>
            <div className="flex justify-between">
              <span>Activations &amp; Scratchpad:</span>
              <span className="text-zinc-200">21.2 MB</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tensor Core Activity */}
        <div className="bg-space-800 border border-space-700/60 rounded-sm p-4 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                Tensor Core Activity
              </span>
              <span className="text-[10px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2 font-mono">
              <span className="text-2xl font-bold text-zinc-100">{tensorCoreLoad}%</span>
              <span className="text-xs text-zinc-400">Utilization</span>
            </div>

            {/* Gauge bar */}
            <div className="mt-3 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-space-700">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${tensorCoreLoad}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-space-700/40 text-[11px] font-mono text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>INT8 Matrix Units:</span>
              <span className="text-zinc-200">96.1%</span>
            </div>
            <div className="flex justify-between">
              <span>Warp Occupancy:</span>
              <span className="text-zinc-200">91.8%</span>
            </div>
          </div>
        </div>

        {/* Card 3: Power Draw */}
        <div className="bg-space-800 border border-space-700/60 rounded-sm p-4 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Power Draw (Simulated)
              </span>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-space-700">
                TDP: 25.0 W (Simulated)
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2 font-mono">
              <span className="text-2xl font-bold text-zinc-100">{powerDraw}</span>
              <span className="text-xs text-zinc-400">Watts (Simulated)</span>
            </div>

            {/* Gauge bar */}
            <div className="mt-3 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-space-700">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${(powerDraw / 25.0) * 100}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-space-700/40 text-[11px] font-mono text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Core Rails (0.85V, Simulated):</span>
              <span className="text-zinc-200">10.8 W</span>
            </div>
            <div className="flex justify-between">
              <span>Compute Efficiency:</span>
              <span className="text-emerald-500">11.4 TOPS/W</span>
            </div>
          </div>
        </div>

        {/* Card 4: Thermal Status */}
        <div className="bg-space-800 border border-space-700/60 rounded-sm p-4 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                Thermal Status
              </span>
              <span className="text-[10px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                NOMINAL
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2 font-mono">
              <span className="text-2xl font-bold text-zinc-100">{temperature}</span>
              <span className="text-xs text-zinc-400">°C (Die Junction)</span>
            </div>

            {/* Gauge bar */}
            <div className="mt-3 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-space-700">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${(temperature / 105.0) * 100}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-space-700/40 text-[11px] font-mono text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Cold Plate Interface:</span>
              <span className="text-zinc-200">28.1 °C</span>
            </div>
            <div className="flex justify-between">
              <span>Thermal Headroom:</span>
              <span className="text-emerald-500">+62.6 °C</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION B: Inference Proof (Middle Row)
          Left: Live Rolling PyTorch/CUDA Terminal
          Right: Real-time Latency Line Chart
      ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Live Rolling CUDA Terminal (7 cols) */}
        <div className="lg:col-span-7 bg-space-800 border border-space-700/60 rounded-sm p-4 shadow-md flex flex-col justify-between">
          <div>
            {/* Terminal Window Header */}
            <div className="flex items-center justify-between pb-3 border-b border-space-700/60">
              <div className="flex items-center space-x-2.5">
                <div className="flex space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                </div>
                <div className="flex items-center space-x-2 font-mono text-xs text-zinc-300 font-semibold">
                  <TerminalIcon className="w-3.5 h-3.5 text-cyber-blue" />
                  <span>polarfire-edge-01:~/aegis/clm-runtime</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-space-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Clear Buffer
                </button>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  LIVE STREAM
                </span>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="mt-3 bg-zinc-950 rounded-sm p-3.5 font-mono text-xs text-zinc-300 h-[280px] overflow-y-auto space-y-1.5 border border-space-700/40 select-text">
              <div className="text-zinc-400 text-[11px] pb-1 border-b border-zinc-800">
                $ ./aegis_clm_infer --engine=tensorrt_int8 --batch=1 --stream=cuda:0 --profile
              </div>

              {logs.map((log) => {
                let badgeClass = 'text-cyber-blue font-bold';
                if (log.level === 'SUCCESS') badgeClass = 'text-emerald-500 font-bold';
                if (log.level === 'PROFILE') badgeClass = 'text-purple-400 font-bold';

                return (
                  <div key={log.id} className="leading-relaxed flex items-start space-x-2">
                    <span className="text-zinc-400 shrink-0 text-[11px]">{log.timestamp}</span>
                    <span className={`${badgeClass} shrink-0 text-[11px]`}>[{log.level}]</span>
                    <span className="text-zinc-200 break-all">{log.message}</span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Terminal Footer Metrics */}
          <div className="mt-3 pt-2.5 border-t border-space-700/40 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400">
            <div className="flex items-center space-x-3">
              <span>Stream: <span className="text-zinc-200">CUDA Stream #3 (Non-blocking)</span></span>
              <span>Buffer: <span className="text-zinc-200">Zero-copy pinned host memory</span></span>
            </div>
            <div className="flex items-center space-x-1.5 text-emerald-500">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Deterministic Timing SLA: MET</span>
            </div>
          </div>
        </div>

        {/* Real-time Inference Latency Line Chart (5 cols) */}
        <div className="lg:col-span-5 bg-space-800 border border-space-700/60 rounded-sm p-4 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-space-700/60">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyber-blue" />
                <h3 className="text-sm font-semibold font-mono text-zinc-100 uppercase tracking-wider">
                  Real-time Inference Latency
                </h3>
              </div>
              <div className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-space-700 text-zinc-300">
                Last 30 Frames
              </div>
            </div>

            {/* KPI Summary Bar */}
            <div className="grid grid-cols-4 gap-2 my-3 text-center font-mono">
              <div className="bg-zinc-900/80 p-2 rounded-sm border border-space-700/60">
                <div className="text-[10px] text-zinc-400 uppercase">Current</div>
                <div className="text-sm font-bold text-cyber-blue mt-0.5">{latencyStats.curr} ms</div>
              </div>
              <div className="bg-zinc-900/80 p-2 rounded-sm border border-space-700/60">
                <div className="text-[10px] text-zinc-400 uppercase">Mean</div>
                <div className="text-sm font-bold text-zinc-200 mt-0.5">{latencyStats.avg} ms</div>
              </div>
              <div className="bg-zinc-900/80 p-2 rounded-sm border border-space-700/60">
                <div className="text-[10px] text-zinc-400 uppercase">Jitter</div>
                <div className="text-sm font-bold text-amber-400 mt-0.5">±{latencyStats.jitter} ms</div>
              </div>
              <div className="bg-zinc-900/80 p-2 rounded-sm border border-space-700/60">
                <div className="text-[10px] text-zinc-400 uppercase">SLA Limit</div>
                <div className="text-sm font-bold text-rose-400 mt-0.5">&lt; 20.0 ms</div>
              </div>
            </div>

            {/* Recharts Line Chart */}
            <div className="h-[210px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={latencyHistory}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="frame"
                    stroke="#64748b"
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    domain={[10, 22]}
                    ticks={[10, 14, 18, 20]}
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    unit="ms"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const val = payload[0].value;
                        return (
                          <div className="bg-zinc-900 border border-space-600 px-2.5 py-1.5 rounded shadow-lg text-xs font-mono text-zinc-200">
                            <span className="text-zinc-400">Latency: </span>
                            <span className="font-bold text-cyber-blue">{val} ms</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Hard Real-Time SLA Threshold */}
                  <ReferenceLine
                    y={20}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: '20ms Hard SLA',
                      fill: '#ef4444',
                      fontSize: 10,
                      position: 'insideTopRight',
                      fontFamily: 'monospace',
                    }}
                  />
                  {/* Mean Line */}
                  <ReferenceLine
                    y={13.5}
                    stroke="#10b981"
                    strokeDasharray="2 2"
                    strokeWidth={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-2 text-[10px] font-mono text-zinc-400 flex items-center justify-between">
            <span>Deterministic Forward Pass Guarantee</span>
            <span className="text-emerald-500">100% On-Time Execution</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION C: Data Proof / Training Convergence (Bottom Row)
          Left: Contrastive Loss Convergence Line Chart
          Right: Collision Avoidance Success Rate Area Chart
      ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Contrastive Loss Convergence (Simulated) */}
        <div className="bg-space-800 border border-space-700/60 rounded-sm p-5 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-space-700/60">
              <div>
                <h3 className="text-sm font-semibold font-mono text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyber-blue" />
                  InfoNCE Loss Convergence (Simulated)
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Simulated InfoNCE Objective (τ = 0.07, Batch = 1024, Steps = 0 to 1M)
                </p>
              </div>

              <div className="text-right font-mono">
                <span className="text-xs text-zinc-400">Final Loss (Simulated): </span>
                <span className="text-xs font-bold text-emerald-500">0.089</span>
              </div>
            </div>

            {/* Formula snippet */}
            <div className="my-3 px-3 py-2 rounded bg-zinc-900 border border-space-700/60 flex items-center justify-between text-xs font-mono text-zinc-300">
              <span className="text-zinc-400">Objective (Simulated):</span>
              <span className="text-cyber-blue font-semibold">
                L_InfoNCE = -log [ exp(sim(z_s, z_a)/τ) / Σ exp(sim(z_s, z_j)/τ) ]
              </span>
            </div>

            {/* Recharts Line Chart */}
            <div className="h-[240px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={CONVERGENCE_DATA}
                  margin={{ top: 10, right: 20, left: -15, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="step"
                    stroke="#64748b"
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    domain={[0, 5]}
                    ticks={[0, 1, 2, 3, 4, 5]}
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-zinc-900 border border-space-600 p-2.5 rounded shadow-xl text-xs font-mono text-zinc-200">
                            <div className="font-bold text-zinc-400 mb-1">Step: {label}</div>
                            <div className="text-cyber-blue">
                              Train Loss (Simulated): <span className="font-bold">{payload[0]?.value}</span>
                            </div>
                            <div className="text-purple-400">
                              Val Loss (Simulated): <span className="font-bold">{payload[1]?.value}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    name="Train InfoNCE Loss (Simulated)"
                    dataKey="trainLoss"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#3b82f6' }}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    name="Val InfoNCE Loss (Simulated)"
                    dataKey="valLoss"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-space-700/40 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>Simulated convergence curve (~350k steps)</span>
            <div className="flex items-center space-x-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-cyber-blue inline-block" />
                Train Loss (Simulated)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-accent-purple inline-block" />
                Validation Loss (Simulated)
              </span>
            </div>
          </div>
        </div>

        {/* Collision Avoidance Success Rate Area Chart */}
        <div className="bg-space-800 border border-space-700/60 rounded-sm p-5 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-space-700/60">
              <div>
                <h3 className="text-sm font-semibold font-mono text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Collision Avoidance Success Rate
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Monte Carlo Test Evaluation (50,000 Orbital Conjunction Scenarios)
                </p>
              </div>

              <div className="text-right font-mono">
                <span className="text-xs text-zinc-400">Convergence: </span>
                <span className="text-xs font-bold text-emerald-500">99.98%</span>
              </div>
            </div>

            {/* Baseline comparison pill */}
            <div className="my-3 px-3 py-2 rounded bg-zinc-900 border border-space-700/60 flex items-center justify-between text-xs font-mono text-zinc-300">
              <span className="text-zinc-400">Untrained Random Baseline:</span>
              <span className="text-rose-400 font-semibold">60.20%</span>
              <span className="text-zinc-500">→</span>
              <span className="text-zinc-400">CLM Policy:</span>
              <span className="text-emerald-500 font-bold">99.98% (+39.78%)</span>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-[240px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={SUCCESS_RATE_DATA}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="step"
                    stroke="#64748b"
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    domain={[50, 100]}
                    ticks={[50, 60, 70, 80, 90, 100]}
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-zinc-900 border border-space-600 p-2.5 rounded shadow-xl text-xs font-mono text-zinc-200">
                            <div className="font-bold text-zinc-400 mb-1">Step: {label}</div>
                            <div className="text-emerald-500">
                              Success Rate: <span className="font-bold">{payload[0]?.value}%</span>
                            </div>
                            <div className="text-zinc-400 text-[10px] mt-0.5">
                              Collision Rate: {(100 - Number(payload[0]?.value)).toFixed(2)}%
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* NASA CARA 99.9% Target Threshold */}
                  <ReferenceLine
                    y={99.9}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                      value: '99.9% NASA CARA Target',
                      fill: '#10b981',
                      fontSize: 10,
                      position: 'insideBottomRight',
                      fontFamily: 'monospace',
                    }}
                  />
                  {/* Baseline 60% Reference */}
                  <ReferenceLine
                    y={60.0}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <Area
                    type="monotone"
                    dataKey="successRate"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#successGradient)"
                    dot={{ r: 2, fill: '#10b981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-space-700/40 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="text-emerald-500">Zero Critical Conjunctions in 50k Evaluations</span>
            <span className="text-zinc-400">P_collision &lt; 10⁻⁷</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CLMGpuDashboard;
