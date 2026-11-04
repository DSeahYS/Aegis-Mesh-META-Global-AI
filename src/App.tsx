import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { useSimulationStore, type ActiveView } from './store/simulationStore';
import { MissionBriefingModal } from './components/layout/MissionBriefingModal';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { DashboardView } from './components/views/DashboardView';
import { OrbitalView } from './components/views/OrbitalView';
import { ConjunctionView } from './components/views/ConjunctionView';
import { MeshView } from './components/views/MeshView';
import { ArchitectureView } from './components/views/ArchitectureView';
import { CLMLabView } from './components/views/CLMLabView';
import { CLMGpuView } from './components/views/CLMGpuView';
import { BackendView } from './components/views/BackendView';
import { VerificationView } from './components/views/VerificationView';

export const App: FC = () => {
  const activeView = useSimulationStore((state) => state.activeView);
  const isPlaying = useSimulationStore((state) => state.isPlaying);
  const timeScale = useSimulationStore((state) => state.timeScale);
  const advanceTime = useSimulationStore((state) => state.advanceTime);
  const setActiveView = useSimulationStore((state) => state.setActiveView);

  const [briefingOpen, setBriefingOpen] = useState(() => {
    try {
      return !localStorage.getItem('aegis_briefing_seen_v1');
    } catch {
      return true;
    }
  });

  const handleCloseBriefing = () => {
    try {
      localStorage.setItem('aegis_briefing_seen_v1', 'true');
    } catch {
      // localStorage unavailable; still close the briefing.
    }
    setBriefingOpen(false);
  };

  const handleBriefingNavigate = (view: ActiveView) => {
    setActiveView(view);
    handleCloseBriefing();
  };

  // Synchronous simulation clock loop
  useEffect(() => {
    let lastTime = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (isPlaying) {
        advanceTime(dt * timeScale);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, timeScale, advanceTime]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'orbital':
        return <OrbitalView />;
      case 'conjunction':
        return <ConjunctionView />;
      case 'mesh':
        return <MeshView />;
      case 'architecture':
        return <ArchitectureView />;
      case 'clm-lab':
        return <CLMLabView />;
      case 'clm-gpu':
        return <CLMGpuView />;
      case 'backend':
        return <BackendView />;
      case 'verification':
        return <VerificationView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-200 antialiased font-sans select-none">
      {/* Top Header Bar */}
      <Header onOpenBriefing={() => setBriefingOpen(true)} />

      {/* Main Workspace (Sidebar + Active View) */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-zinc-950 relative">
          {renderActiveView()}
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />

      <MissionBriefingModal
        isOpen={briefingOpen}
        onClose={handleCloseBriefing}
        onNavigateView={handleBriefingNavigate}
      />
    </div>
  );
};

export default App;