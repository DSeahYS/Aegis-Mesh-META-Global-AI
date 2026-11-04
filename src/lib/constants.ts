export const EARTH_RADIUS_KM = 6371;
export const EARTH_MU = 398600.4418; // Standard gravitational parameter of Earth (km^3/s^2)
export const LEO_ALT_MIN = 400; // km
export const LEO_ALT_MAX = 800; // km
export const SPEED_OF_LIGHT = 299792.458; // km/s
export const PC_THRESHOLD = 1e-4; // Collision probability threshold triggering avoidance
export const CLM_INFERENCE_TIME_MS = 16;
export const LEGACY_RESPONSE_TIME_HOURS: readonly [number, number] = [8, 24];

export const COLOR_PALETTE = {
  NOMINAL: '#10b981',
  ALERT: '#f59e0b',
  CRITICAL: '#ef4444',
  MANEUVERING: '#3b82f6',
  MIGRATING: '#8b5cf6',
  ISL_LINK: '#3b82f6',
  DEBRIS: '#f87171',
  EARTH_GLOW: '#60a5fa',
} as const;

export const COLORS = COLOR_PALETTE;
export const SCALE_FACTOR = 1 / 1000;

export type Vec3 = [number, number, number];

export interface OrbitalElements {
  semiMajorAxis: number; // km (a)
  eccentricity: number; // dimensionless (e)
  inclination: number; // radians or degrees (i)
  raan: number; // Right Ascension of Ascending Node (Omega)
  argPerigee?: number; // Argument of Perigee in radians (omega)
  argumentOfPerigee?: number; // Argument of Perigee (degrees or radians)
  trueAnomaly: number; // True anomaly in radians or degrees (nu)
  meanAnomaly?: number; // Mean anomaly in radians (M)
  epoch?: number; // Unix timestamp in seconds
}

export type SatelliteStatus =
  | 'nominal'
  | 'alert'
  | 'critical'
  | 'maneuvering'
  | 'migrating';

export interface Satellite {
  id: string;
  name: string;
  elements: OrbitalElements;
  position: Vec3;
  velocity: Vec3;
  status: SatelliteStatus;
  computeLoad?: number; // 0.0 - 1.0
  activeWorkloads?: number;
  hardBodyRadius?: number; // km
}

export type DebrisRiskLevel =
  | 'nominal'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export interface DebrisObject {
  id: string;
  position: Vec3;
  velocity: Vec3;
  size: number; // cm
  cataloged: boolean; // ~20% cataloged
  riskLevel: DebrisRiskLevel;
  elements?: OrbitalElements;
}

export type ConjunctionSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ConjunctionEvent {
  id: string;
  satelliteId: string;
  debrisId: string;
  tca: number; // Time to Closest Approach (seconds relative to current or timestamp)
  missDistance: number; // km
  pc: number; // Probability of Collision
  bPlane: {
    xi: number;
    zeta: number;
    bMagnitude: number;
  };
  relativeVelocity: number; // km/s
  severity: ConjunctionSeverity;
  timestamp?: number;
}

export interface ManeuverAction {
  id: string;
  name: string;
  embedding: number[];
  deltaV: {
    magnitude: number; // m/s
    direction: Vec3; // unit vector [x, y, z]
  };
  burnDurationSec?: number;
  propellantCostKg?: number;
  executionTimeSec?: number;
}
