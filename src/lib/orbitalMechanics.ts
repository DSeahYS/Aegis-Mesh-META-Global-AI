import { EARTH_MU, type OrbitalElements, type Vec3 } from './constants';

export function keplerianToCartesian(
  elements: OrbitalElements,
  mu: number = EARTH_MU
): { position: Vec3; velocity: Vec3 } {
  const { semiMajorAxis: a, eccentricity: e, inclination: i, raan, trueAnomaly: nu } = elements;
  const omega = elements.argPerigee ?? elements.argumentOfPerigee ?? 0;

  const sinNu = Math.sin(nu);
  const cosNu = Math.cos(nu);
  const sqrtOneMinusESq = Math.sqrt(Math.max(0, 1 - e * e));

  // Compute Eccentric Anomaly E from True Anomaly nu
  const sinE = (sqrtOneMinusESq * sinNu) / (1 + e * cosNu);
  const cosE = (e + cosNu) / (1 + e * cosNu);
  const E = Math.atan2(sinE, cosE);

  // Position and velocity in orbital perifocal plane (PQW frame)
  const r = a * (1 - e * Math.cos(E));
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * sqrtOneMinusESq * Math.sin(E);

  const nA = Math.sqrt(mu * a);
  const vxOrb = (-nA * Math.sin(E)) / r;
  const vyOrb = (nA * sqrtOneMinusESq * Math.cos(E)) / r;

  // Rotation matrix from orbital plane to Earth-Centered Inertial (ECI)
  const cosRaan = Math.cos(raan);
  const sinRaan = Math.sin(raan);
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const cosInc = Math.cos(i);
  const sinInc = Math.sin(i);

  // Unit vector P pointing toward periapsis
  const px = cosRaan * cosOmega - sinRaan * sinOmega * cosInc;
  const py = sinRaan * cosOmega + cosRaan * sinOmega * cosInc;
  const pz = sinOmega * sinInc;

  // Unit vector Q perpendicular to P in orbital plane
  const qx = -cosRaan * sinOmega - sinRaan * cosOmega * cosInc;
  const qy = -sinRaan * sinOmega + cosRaan * cosOmega * cosInc;
  const qz = cosOmega * sinInc;

  const position: Vec3 = [
    xOrb * px + yOrb * qx,
    xOrb * py + yOrb * qy,
    xOrb * pz + yOrb * qz,
  ];

  const velocity: Vec3 = [
    vxOrb * px + vyOrb * qx,
    vxOrb * py + vyOrb * qy,
    vxOrb * pz + vyOrb * qz,
  ];

  return { position, velocity };
}

export function propagateOrbit(
  elements: OrbitalElements,
  deltaTimeSec: number,
  mu: number = EARTH_MU
): OrbitalElements {
  const { semiMajorAxis: a, eccentricity: e, trueAnomaly: nu } = elements;

  const sqrtOneMinusESq = Math.sqrt(Math.max(0, 1 - e * e));
  const sinNu = Math.sin(nu);
  const cosNu = Math.cos(nu);

  // Derive initial Mean Anomaly M if not explicitly provided
  let M: number;
  if (elements.meanAnomaly !== undefined) {
    M = elements.meanAnomaly;
  } else {
    const sinE = (sqrtOneMinusESq * sinNu) / (1 + e * cosNu);
    const cosE = (e + cosNu) / (1 + e * cosNu);
    const E = Math.atan2(sinE, cosE);
    M = E - e * Math.sin(E);
  }

  // Mean motion (rad/s)
  const n = Math.sqrt(mu / Math.pow(a, 3));
  let mNew = (M + n * deltaTimeSec) % (2 * Math.PI);
  if (mNew < 0) {
    mNew += 2 * Math.PI;
  }

  // Solve Kepler's equation: E - e*sin(E) = M via Newton-Raphson
  let eNew = mNew;
  for (let iter = 0; iter < 20; iter++) {
    const f = eNew - e * Math.sin(eNew) - mNew;
    const fPrime = 1 - e * Math.cos(eNew);
    const delta = f / fPrime;
    eNew -= delta;
    if (Math.abs(delta) < 1e-12) {
      break;
    }
  }

  // Convert solved Eccentric Anomaly to True Anomaly
  const sinNuNew = (sqrtOneMinusESq * Math.sin(eNew)) / (1 - e * Math.cos(eNew));
  const cosNuNew = (Math.cos(eNew) - e) / (1 - e * Math.cos(eNew));
  let nuNew = Math.atan2(sinNuNew, cosNuNew);
  if (nuNew < 0) {
    nuNew += 2 * Math.PI;
  }

  return {
    ...elements,
    trueAnomaly: nuNew,
    meanAnomaly: mNew,
    epoch: (elements.epoch ?? 0) + deltaTimeSec,
  };
}

export function getOrbitalPeriod(
  semiMajorAxis: number,
  mu: number = EARTH_MU
): number {
  return 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
}

export function generateOrbitPoints(
  elements: OrbitalElements,
  numPoints: number = 128,
  mu: number = EARTH_MU
): Vec3[] {
  const points: Vec3[] = [];
  const step = (2 * Math.PI) / numPoints;

  for (let k = 0; k <= numPoints; k++) {
    const nu = k * step;
    const state = keplerianToCartesian({ ...elements, trueAnomaly: nu }, mu);
    points.push(state.position);
  }

  return points;
}

export function calculateRelativeVelocity(sat1Vel: Vec3, sat2Vel: Vec3): number {
  const dx = sat1Vel[0] - sat2Vel[0];
  const dy = sat1Vel[1] - sat2Vel[1];
  const dz = sat1Vel[2] - sat2Vel[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
