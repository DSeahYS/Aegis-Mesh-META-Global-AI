import {
  EARTH_RADIUS_KM,
  type DebrisObject,
  type DebrisRiskLevel,
  type OrbitalElements,
} from './constants';
import { keplerianToCartesian } from './orbitalMechanics';

export function createPrng(seed: number = 19840224): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rng: () => number, mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.max(1e-15, rng());
  const u2 = rng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}

export function generateDebrisPopulation(
  count: number,
  altitudeRange: [number, number] = [400, 800],
  seed: number = 42
): DebrisObject[] {
  const rng = createPrng(seed);
  const [altMin, altMax] = altitudeRange;
  const debrisList: DebrisObject[] = [];

  // Common LEO debris inclination clusters (radians): ISS (~51.6°), Polar (~82°), Sun-sync (~98°), Cape (~28.5°)
  const inclinationClusters = [0.9006, 1.4312, 1.7104, 0.4974];

  for (let idx = 0; idx < count; idx++) {
    const id = `DEB-${(20000 + idx).toString()}`;

    // ORDEM 3.2 inspired log-normal size distribution (favoring fragments 0.5 - 10 cm)
    const logSize = sampleNormal(rng, 0.9, 0.85);
    const rawSize = Math.exp(logSize);
    const size = Math.round(Math.max(0.1, Math.min(rawSize, 250)) * 10) / 10;

    // USSPACECOM tracking threshold: ~20% cataloged overall (objects >= 10 cm are trackable)
    const catalogProb = size >= 10 ? 0.85 : 0.035;
    const cataloged = rng() < catalogProb;

    let riskLevel: DebrisRiskLevel;
    if (size >= 30) {
      riskLevel = 'critical';
    } else if (size >= 10) {
      riskLevel = 'high';
    } else if (size >= 3) {
      riskLevel = 'medium';
    } else if (size >= 1) {
      riskLevel = 'low';
    } else {
      riskLevel = 'nominal';
    }

    // Altitude and orbital geometry
    const alt = altMin + rng() * (altMax - altMin);
    const semiMajorAxis = EARTH_RADIUS_KM + alt;
    const eccentricity = rng() * 0.035; // typical near-circular LEO debris

    const clusterBase = inclinationClusters[Math.floor(rng() * inclinationClusters.length)];
    const inclination = Math.max(0.05, Math.min(Math.PI - 0.05, clusterBase + (rng() - 0.5) * 0.2));
    const raan = rng() * 2 * Math.PI;
    const argPerigee = rng() * 2 * Math.PI;
    const trueAnomaly = rng() * 2 * Math.PI;

    const elements: OrbitalElements = {
      semiMajorAxis,
      eccentricity,
      inclination,
      raan,
      argPerigee,
      trueAnomaly,
    };

    const { position, velocity } = keplerianToCartesian(elements);

    debrisList.push({
      id,
      position,
      velocity,
      size,
      cataloged,
      riskLevel,
      elements,
    });
  }

  return debrisList;
}

export function updateDebrisPositions(
  debris: DebrisObject[],
  deltaTimeSec: number
): DebrisObject[] {
  return debris.map((obj) => {
    const nextPos: [number, number, number] = [
      obj.position[0] + obj.velocity[0] * deltaTimeSec,
      obj.position[1] + obj.velocity[1] * deltaTimeSec,
      obj.position[2] + obj.velocity[2] * deltaTimeSec,
    ];

    return {
      ...obj,
      position: nextPos,
    };
  });
}
