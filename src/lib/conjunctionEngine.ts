import {
  PC_THRESHOLD,
  type ConjunctionSeverity,
  type Vec3,
} from './constants';

export const SEVERITY_THRESHOLDS = {
  CRITICAL_PC: 1e-3,
  HIGH_PC: PC_THRESHOLD, // 1e-4
  MEDIUM_PC: 1e-5,
  CRITICAL_MISS_KM: 0.1,
  HIGH_MISS_KM: 0.5,
  MEDIUM_MISS_KM: 2.0,
} as const;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: Vec3): Vec3 {
  const len = norm(v);
  if (len < 1e-12) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function calculateBPlane(
  primaryPos: Vec3,
  primaryVel: Vec3,
  secondaryPos: Vec3,
  secondaryVel: Vec3
): { xi: number; zeta: number; bMagnitude: number } {
  // Relative geometry: secondary with respect to primary
  const relPos: Vec3 = [
    secondaryPos[0] - primaryPos[0],
    secondaryPos[1] - primaryPos[1],
    secondaryPos[2] - primaryPos[2],
  ];

  const relVel: Vec3 = [
    secondaryVel[0] - primaryVel[0],
    secondaryVel[1] - primaryVel[1],
    secondaryVel[2] - primaryVel[2],
  ];

  const relSpeed = norm(relVel);
  if (relSpeed < 1e-8) {
    const miss = norm(relPos);
    return { xi: miss, zeta: 0, bMagnitude: miss };
  }

  // Encounter axis (eta) along relative velocity vector (Foster 1992)
  const eta = normalize(relVel);

  // Reference vector: primary orbital angular momentum h = r x v
  let refAxis = cross(primaryPos, primaryVel);
  if (norm(refAxis) < 1e-6) {
    refAxis = primaryPos;
  }

  // xi axis perpendicular to relative velocity and reference axis
  let xi = cross(refAxis, eta);
  if (norm(xi) < 1e-6) {
    // If degenerate, choose an arbitrary non-parallel reference vector
    const fallback: Vec3 = Math.abs(eta[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    xi = cross(fallback, eta);
  }
  xi = normalize(xi);

  // zeta axis completes the orthonormal triad in the encounter plane
  const zeta = cross(eta, xi);

  // Project relative position onto the B-plane (perpendicular to relative velocity)
  const bXi = dot(relPos, xi);
  const bZeta = dot(relPos, zeta);
  const bMagnitude = Math.sqrt(bXi * bXi + bZeta * bZeta);

  return {
    xi: bXi,
    zeta: bZeta,
    bMagnitude,
  };
}

export function calculatePc(
  bPlane: { xi: number; zeta: number },
  covarianceMatrix: [number, number, number, number],
  hardBodyRadius: number
): number {
  const [c00, c01, c10, c11] = covarianceMatrix;
  const det = c00 * c11 - c01 * c10;

  if (det <= 1e-18 || hardBodyRadius <= 0) {
    return 0;
  }

  // Inverse covariance matrix elements
  const inv00 = c11 / det;
  const inv01 = -c01 / det;
  const inv11 = c00 / det;

  // Mahalanobis distance squared to collision center
  const xi = bPlane.xi;
  const zeta = bPlane.zeta;
  const mahalSq = inv00 * xi * xi + 2 * inv01 * xi * zeta + inv11 * zeta * zeta;

  // Foster (1992) 2D Gaussian integral approximation over hard-body disk
  const sigmaProduct = Math.sqrt(Math.max(1e-18, det));
  const exponent = -0.5 * mahalSq;

  if (exponent < -50) {
    return 0;
  }

  // Exact disk integral approximation: (1 - exp(-R^2 / (2 * sqrt(det)))) * exp(-D^2 / 2)
  const scale = 1 - Math.exp(-Math.pow(hardBodyRadius, 2) / (2 * sigmaProduct));
  const pc = scale * Math.exp(exponent);

  return Math.min(1.0, Math.max(0.0, pc));
}

export function assessConjunction(
  satellite: { position: Vec3; velocity: Vec3 },
  debris: { position: Vec3; velocity: Vec3; size: number }
): {
  pc: number;
  missDistance: number;
  tca: number;
  bPlane: { xi: number; zeta: number };
  severity: ConjunctionSeverity;
} {
  const relPos: Vec3 = [
    debris.position[0] - satellite.position[0],
    debris.position[1] - satellite.position[1],
    debris.position[2] - satellite.position[2],
  ];

  const relVel: Vec3 = [
    debris.velocity[0] - satellite.velocity[0],
    debris.velocity[1] - satellite.velocity[1],
    debris.velocity[2] - satellite.velocity[2],
  ];

  const relSpeedSq = dot(relVel, relVel);

  // Time to Closest Approach (TCA) in seconds
  let tca = 0;
  if (relSpeedSq > 1e-10) {
    tca = -dot(relPos, relVel) / relSpeedSq;
  }

  // Positions at TCA under linearized relative motion
  const satPosTca: Vec3 = [
    satellite.position[0] + satellite.velocity[0] * tca,
    satellite.position[1] + satellite.velocity[1] * tca,
    satellite.position[2] + satellite.velocity[2] * tca,
  ];

  const debPosTca: Vec3 = [
    debris.position[0] + debris.velocity[0] * tca,
    debris.position[1] + debris.velocity[1] * tca,
    debris.position[2] + debris.velocity[2] * tca,
  ];

  const bPlaneResult = calculateBPlane(
    satPosTca,
    satellite.velocity,
    debPosTca,
    debris.velocity
  );

  const missDistance = bPlaneResult.bMagnitude;

  // Hard body radius (combined): Satellite bus ~5m (0.005 km) + debris radius (cm converted to km)
  const debrisRadiusKm = debris.size / 200000;
  const hardBodyRadiusKm = 0.005 + debrisRadiusKm;

  // Typical LEO tracking positional uncertainty (1-sigma ~ 50m = 0.05 km)
  const sigmaKm = 0.05;
  const covariance: [number, number, number, number] = [
    sigmaKm * sigmaKm,
    0,
    0,
    sigmaKm * sigmaKm,
  ];

  const pc = calculatePc(bPlaneResult, covariance, hardBodyRadiusKm);

  let severity: ConjunctionSeverity;
  if (pc >= SEVERITY_THRESHOLDS.CRITICAL_PC || missDistance < SEVERITY_THRESHOLDS.CRITICAL_MISS_KM) {
    severity = 'critical';
  } else if (pc >= SEVERITY_THRESHOLDS.HIGH_PC || missDistance < SEVERITY_THRESHOLDS.HIGH_MISS_KM) {
    severity = 'high';
  } else if (pc >= SEVERITY_THRESHOLDS.MEDIUM_PC || missDistance < SEVERITY_THRESHOLDS.MEDIUM_MISS_KM) {
    severity = 'medium';
  } else {
    severity = 'low';
  }

  return {
    pc,
    missDistance,
    tca,
    bPlane: {
      xi: bPlaneResult.xi,
      zeta: bPlaneResult.zeta,
    },
    severity,
  };
}
