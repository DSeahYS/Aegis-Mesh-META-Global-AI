import { create } from 'zustand';

export type ActiveView = 'dashboard' | 'orbital' | 'conjunction' | 'mesh' | 'architecture' | 'clm-lab' | 'clm-gpu' | 'backend' | 'verification';
export type AlertType = 'conjunction' | 'radiation' | 'migration' | 'maneuver';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type TelemetryType = 'info' | 'warning' | 'critical';

export interface ActiveAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
}

export interface TelemetryMessage {
  id: string;
  message: string;
  timestamp: number;
  type: TelemetryType;
}

export interface SimulationState {
  // Time
  simulationTime: number; // seconds since epoch
  timeScale: number; // 1 = realtime, 10 = 10x, etc.
  isPlaying: boolean;

  // Navigation
  activeView: ActiveView;

  // Selection
  selectedSatelliteId: string | null;
  selectedEventId: string | null;
  activeCatalogs: string[];

  // Alerts
  activeAlerts: ActiveAlert[];

  // Telemetry ticker messages
  telemetryMessages: TelemetryMessage[];

  // Actions
  setActiveView: (view: ActiveView) => void;
  togglePlayback: () => void;
  setTimeScale: (scale: number) => void;
  advanceTime: (deltaSec: number) => void;
  selectSatellite: (id: string | null) => void;
  selectEvent: (id: string | null) => void;
  toggleCatalog: (id: string) => void;
  addAlert: (alert: Omit<ActiveAlert, 'id'>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  addTelemetryMessage: (msg: Omit<TelemetryMessage, 'id'>) => void;
}

let alertCounter = 1;
let telemetryCounter = 1;

const nowSec = Date.now() / 1000;

export const useSimulationStore = create<SimulationState>((set) => ({
  // Time
  simulationTime: nowSec,
  timeScale: 1,
  isPlaying: true,

  // Navigation
  activeView: 'dashboard',

  // Selection
  selectedSatelliteId: null,
  selectedEventId: null,
  activeCatalogs: ['aegis-mesh'],

  // Initial realistic alerts
  activeAlerts: [
    {
      id: `alert-${alertCounter++}`,
      type: 'conjunction',
      severity: 'critical',
      message: 'Conjunction TCA < 42s detected for AEGIS-04 with DEB-2024-981A. Miss distance: 0.18 km. Collision prob: 2.8e-3',
      timestamp: nowSec - 145,
    },
    {
      id: `alert-${alertCounter++}`,
      type: 'radiation',
      severity: 'medium',
      message: 'South Atlantic Anomaly boundary crossing detected by AEGIS-02 dosimeter array. Flux: 380 MeV/cm²',
      timestamp: nowSec - 320,
    },
    {
      id: `alert-${alertCounter++}`,
      type: 'maneuver',
      severity: 'low',
      message: 'Autonomous low-thrust avoidance burn calculated by CLM agent for AEGIS-07 (Δv: 0.14 m/s)',
      timestamp: nowSec - 650,
    },
  ],

  // Initial realistic telemetry messages
  telemetryMessages: [
    {
      id: `tlm-${telemetryCounter++}`,
      type: 'info',
      message: 'AEGIS constellation heartbeats verified: 12/12 orbital nodes operational.',
      timestamp: nowSec - 45,
    },
    {
      id: `tlm-${telemetryCounter++}`,
      type: 'info',
      message: 'Optical Inter-Satellite Links (ISL) active: 22 full-duplex laser cross-links established at 2.5 Gbps.',
      timestamp: nowSec - 32,
    },
    {
      id: `tlm-${telemetryCounter++}`,
      type: 'warning',
      message: 'AEGIS-04 onboard CLM neural engine workload at 78% capacity computing avoidance manifold.',
      timestamp: nowSec - 20,
    },
    {
      id: `tlm-${telemetryCounter++}`,
      type: 'critical',
      message: 'CONJUNCTION WARNING: Uncataloged fragment crossing AEGIS-04 orbital path in 41.8s.',
      timestamp: nowSec - 12,
    },
    {
      id: `tlm-${telemetryCounter++}`,
      type: 'info',
      message: 'Workload migration initiated: shifting heavy inference tasks from AEGIS-04 to AEGIS-05 and AEGIS-03.',
      timestamp: nowSec - 4,
    },
  ],

  // Actions
  setActiveView: (view: ActiveView) => set({ activeView: view }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setTimeScale: (scale: number) => set({ timeScale: scale }),

  advanceTime: (deltaSec: number) =>
    set((state) => ({ simulationTime: state.simulationTime + deltaSec })),

  selectSatellite: (id: string | null) => set({ selectedSatelliteId: id }),

  selectEvent: (id: string | null) => set({ selectedEventId: id }),
  
  toggleCatalog: (id: string) => set((state) => ({
    activeCatalogs: state.activeCatalogs.includes(id)
      ? state.activeCatalogs.filter(c => c !== id)
      : [...state.activeCatalogs, id]
  })),

  addAlert: (alert) =>
    set((state) => ({
      activeAlerts: [
        {
          ...alert,
          id: `alert-${alertCounter++}`,
        },
        ...state.activeAlerts.slice(0, 99),
      ],
    })),

  clearAlerts: () => set({ activeAlerts: [] }),

  dismissAlert: (id: string) =>
    set((state) => ({
      activeAlerts: state.activeAlerts.filter((a) => a.id !== id),
    })),

  addTelemetryMessage: (msg) =>
    set((state) => ({
      telemetryMessages: [
        ...state.telemetryMessages.slice(-49),
        {
          ...msg,
          id: `tlm-${telemetryCounter++}`,
        },
      ],
    })),
}));
