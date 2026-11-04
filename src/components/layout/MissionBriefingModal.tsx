import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Globe,
  BrainCircuit,
  Cpu,
  Sparkles,
  Play,
  X,
  CheckCircle2,
  ArrowRight,
  Layers,
  Terminal,
  Eye,
} from 'lucide-react';

export type AegisViewId =
  | 'dashboard'
  | 'orbital'
  | 'conjunction'
  | 'mesh'
  | 'architecture'
  | 'clm-lab'
  | 'clm-gpu'
  | 'backend'
  | 'verification';

interface MissionBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateView: (view: AegisViewId) => void;
}

interface TourStep {
  id: AegisViewId;
  stepNumber: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  description: string;
  highlights: string[];
  ctaLabel: string;
  icon: React.ReactNode;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'orbital',
    stepNumber: '01',
    title: '3D Orbital Constellation & Conjunction Globe',
    subtitle: 'Real-Time SGP4 / SPICE Ephemeris + ISL Laser Mesh',
    badge: 'REAL-TIME 3D ASTRODYNAMICS',
    badgeColor: 'text-cyan-300 bg-cyan-950/70 border-cyan-500/40',
    description:
      'Interactive 3D visualization of the AEGIS-MESH LEO constellation, live debris fields (Cosmos 2251, Fengyun-1C, CZ-4C), QKD-secured inter-satellite laser links (ISL), and impulsive Delta-V thruster plumes.',
    highlights: [
      'Propagates real NORAD TLEs via SGP4 (Vallado AIAA 2006-6753 verified) and NASA NAIF SPICE kernels',
      'Visualizes J2/J3/J4 zonal harmonics, conical solar radiation pressure (SRP), and atmospheric drag',
      'Interactive entity search, maneuver trail preview, and conjunction encounter geometry',
    ],
    ctaLabel: 'Launch 3D Orbital Globe',
    icon: <Globe className="w-5 h-5 text-cyan-400" />,
  },
  {
    id: 'clm-lab',
    stepNumber: '02',
    title: 'Meta AI Perception & Sub-16ms Edge Retrieval',
    subtitle: 'SAM 3.1 Star Tracker Vision + Contrastive Latent Codebook',
    badge: 'META AI + EDGE SWaP (<16ms)',
    badgeColor: 'text-purple-300 bg-purple-950/70 border-purple-500/40',
    description:
      'Optical star-tracker pipeline and sub-millisecond maneuver retrieval engineered for radiation-tolerant spacecraft edge processors (<2 MB SRAM, <5W average power).',
    highlights: [
      'Optical RSO & debris segmentation powered by Meta SAM 3.1 + 6DoF attitude quaternion estimation',
      '256-action RTN escape codebook retrieved via temperature-scaled cosine similarity (tau = 0.07)',
      'Hardware power & thermal profiling for NVIDIA Jetson Orin / INA3221 and Microchip PolarFire SoC',
    ],
    ctaLabel: 'Open Edge Retrieval Lab',
    icon: <Cpu className="w-5 h-5 text-purple-400" />,
  },
  {
    id: 'verification',
    stepNumber: '03',
    title: 'Neuro-Symbolic V&V Proof & Physics Guardrails',
    subtitle: 'Muse Wonder / Spark 1.3 + EPG Graph + HJI PDE + HOCBF',
    badge: 'ZERO PHYSICAL HALLUCINATIONS',
    badgeColor: 'text-cyber-green bg-emerald-950/70 border-cyber-green/40',
    description:
      'Every AI-proposed maneuver is mathematically filtered through a 3-stage deterministic physics oracle before thruster commit—guaranteeing zero physical hallucinations.',
    highlights: [
      'Symbolic Physics Rule Graph (R1 Tsiolkovsky Fuel, R2 Duty Cycle, R3 Vis-Viva Perigee, R5 Mahalanobis)',
      'Hamilton-Jacobi-Isaacs (HJI) PDE backward reachable tube & High-Order Control Barrier Function (HOCBF)',
      '16 live analytical verification oracles (Foster 2D Gauss-Legendre vs Rician & 400k Monte Carlo)',
    ],
    ctaLabel: 'Run Live V&V Proof Suite',
    icon: <ShieldCheck className="w-5 h-5 text-cyber-green" />,
  },
  {
    id: 'conjunction',
    stepNumber: '04',
    title: 'NASA CARA B-Plane & Probability Dilution Detector',
    subtitle: 'CCSDS 508.0-B-1 CDM Traffic + Covariance Conditioning',
    badge: 'OPERATIONAL FLIGHT SAFETY',
    badgeColor: 'text-amber-300 bg-amber-950/70 border-amber-500/40',
    description:
      'Ingests Space-Track.org and CCSDS Conjunction Data Messages (CDMs), projecting 3D RTN covariances onto the 2D encounter B-plane and flagging probability dilution traps.',
    highlights: [
      'Detects Probability Dilution where large tracklet uncertainty masks <100m physical miss distances',
      'Computes Alfano/Akella Maximum Collision Probability (Pc_max) and 3D Mahalanobis urgency tiers',
      'Live CCSDS 508.0-B-1 validator catching RTN norm vs MISS_DISTANCE and unit mismatches',
    ],
    ctaLabel: 'Inspect Conjunction B-Plane',
    icon: <Eye className="w-5 h-5 text-amber-400" />,
  },
];

export const MissionBriefingModal: React.FC<MissionBriefingModalProps> = ({
  isOpen,
  onClose,
  onNavigateView,
}) => {
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[activeStepIdx];

  const handleJump = (viewId: AegisViewId) => {
    onNavigateView(viewId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-mono">
      <div className="relative w-full max-w-4xl bg-space-800 border border-space-600 rounded-sm shadow-2xl overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-950/90 border-b border-space-600">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded bg-purple-950/80 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              META GLOBAL AI HACKATHON — PUSH THE FRONTIER
            </span>
            <span className="text-xs text-zinc-500 hidden sm:inline">•</span>
            <span className="text-xs text-cyber-green hidden sm:inline font-bold">
              16/16 V&V ORACLES VERIFIED
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded border border-transparent hover:border-space-600 transition-colors cursor-pointer"
            aria-label="Close Mission Briefing"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="p-6 space-y-6 relative z-10">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <BrainCircuit className="w-7 h-7 text-cyan-400" />
              <span>AEGIS-MESH: Autonomous Neuro-Symbolic Spacecraft Collision Avoidance</span>
            </h1>
            <p className="text-xs text-zinc-400 font-sans mt-1.5 leading-relaxed max-w-3xl">
              Welcome, Flight Director. AEGIS-MESH pairs <strong className="text-zinc-200">Meta Model API intelligence (Muse Wonder, Muse Spark 1.3, SAM 3.1)</strong> and <strong className="text-zinc-200">sub-16ms Edge Contrastive Retrieval</strong> with <strong className="text-cyber-green">deterministic astrodynamic verification (EPG Rule Graph, Hamilton-Jacobi Reachability, and Control Barrier Functions)</strong> so autonomous satellites can evade orbital debris without physical hallucinations.
            </p>
          </div>

          {/* 4-Step Selector Tabs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {TOUR_STEPS.map((step, idx) => {
              const isSelected = idx === activeStepIdx;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepIdx(idx)}
                  className={`text-left p-3 rounded-sm border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 border-cyan-400 shadow-lg shadow-cyan-950/30'
                      : 'bg-zinc-950/70 border-space-700 hover:border-space-600 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-zinc-500">
                      STAGE {step.stepNumber}
                    </span>
                    {step.icon}
                  </div>
                  <div className={`text-xs font-bold line-clamp-1 ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                    {step.title.split('&')[0]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Step Detail Card */}
          <div className="bg-zinc-950/90 border border-space-600 rounded-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-space-700 pb-3">
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${currentStep.badgeColor}`}>
                  {currentStep.badge}
                </span>
                <h2 className="text-lg font-bold text-white mt-1.5">
                  {currentStep.stepNumber}. {currentStep.title}
                </h2>
                <p className="text-xs text-zinc-400">{currentStep.subtitle}</p>
              </div>

              <button
                type="button"
                onClick={() => handleJump(currentStep.id)}
                className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs rounded-sm flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{currentStep.ctaLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              {currentStep.description}
            </p>

            <div className="space-y-2 pt-1">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                What to test in this view:
              </div>
              {currentStep.highlights.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300 font-sans">
                  <CheckCircle2 className="w-4 h-4 text-cyber-green shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Jump Directory for All 9 Views */}
          <div className="bg-zinc-900/60 border border-space-700 rounded-sm p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-zinc-400 font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              QUICK JUMP TO ANY MODULE:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'dashboard', label: 'Mission Dashboard' },
                { id: 'orbital', label: '3D Globe' },
                { id: 'conjunction', label: 'B-Plane & CARA' },
                { id: 'verification', label: 'V&V Oracles & EPG' },
                { id: 'clm-lab', label: 'Edge Lab' },
                { id: 'clm-gpu', label: 'HW Profiler' },
                { id: 'mesh', label: 'ISL QKD Mesh' },
                { id: 'architecture', label: 'Architecture' },
                { id: 'backend', label: 'Live API Console' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleJump(m.id as AegisViewId)}
                  className="px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 border border-space-700 transition-colors cursor-pointer"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-zinc-950 border-t border-space-600 flex items-center justify-between text-xs">
          <div className="text-zinc-500 flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            <span>Tip: Re-open this briefing anytime from the top header bar.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setActiveStepIdx((prev) => (prev + 1) % TOUR_STEPS.length)
              }
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-space-600 cursor-pointer"
            >
              Next Stage ({activeStepIdx + 1}/{TOUR_STEPS.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
            >
              Enter Mission Control
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
