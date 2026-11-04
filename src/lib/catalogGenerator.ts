import { EARTH_RADIUS_KM, EARTH_MU, type Vec3, type OrbitalElements } from './constants';
import { keplerianToCartesian } from './orbitalMechanics';

export interface CatalogObject {
  id: string;
  position: Vec3;
  velocity: Vec3;
  type: string;
  name?: string;
  altitudeKm?: number;
  inclinationDeg?: number;
  sizeCm?: number;
  rcs?: 'small' | 'medium' | 'large';
}

export interface CatalogMeta {
  id: string;
  name: string;
  category: 'constellation' | 'debris';
  count: number;
  description: string;
  nominalAltitudeKm: string;
  inclination: string;
  color: string;
  accentBg: string;
  badge: string;
  dangerLevel: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
}

export const CATALOG_DEFINITIONS: Record<string, CatalogMeta> = {
  'starlink': {
    id: 'starlink',
    name: 'SpaceX Starlink Gen1/2',
    category: 'constellation',
    count: 5000,
    description: 'Megaconstellation active broadband nodes in Shell 1 & Shell 2 low-inclination LEO',
    nominalAltitudeKm: '540 – 570 km',
    inclination: '53.2° / 70.0°',
    color: '#00d4ff',
    accentBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    badge: 'ACTIVE COOPERATIVE',
    dangerLevel: 'LOW',
  },
  'oneweb': {
    id: 'oneweb',
    name: 'Eutelsat OneWeb Constellation',
    category: 'constellation',
    count: 648,
    description: 'High-altitude polar LEO Walker-Delta internet constellation',
    nominalAltitudeKm: '1,200 km',
    inclination: '87.9° (Near-Polar)',
    color: '#a855f7',
    accentBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
    badge: 'ACTIVE COOPERATIVE',
    dangerLevel: 'LOW',
  },
  'cosmos-1408': {
    id: 'cosmos-1408',
    name: 'Cosmos-1408 ASAT Debris Field',
    category: 'debris',
    count: 1500,
    description: 'High-inclination fragments from Russian DA-ASAT intercept (Nov 15, 2021)',
    nominalAltitudeKm: '350 – 850 km',
    inclination: '82.6°',
    color: '#f97316',
    accentBg: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
    badge: 'UNCATALOGUED DEBRIS',
    dangerLevel: 'HIGH',
  },
  'fengyun-1c': {
    id: 'fengyun-1c',
    name: 'Fengyun-1C Breakup Cloud',
    category: 'debris',
    count: 3000,
    description: 'Most severe orbital breakup event in history from kinetic ASAT test (Jan 11, 2007)',
    nominalAltitudeKm: '200 – 2,800 km',
    inclination: '98.6° (Sun-Sync)',
    color: '#ff3355',
    accentBg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    badge: 'LETHAL FRAGMENTS',
    dangerLevel: 'CRITICAL',
  },
  'uncatalogued': {
    id: 'uncatalogued',
    name: 'Uncatalogued Micro-Debris Swarm',
    category: 'debris',
    count: 10000,
    description: 'Sub-centimeter lethal non-trackable fragments (NASA ORDEM & ESA MASTER statistical distribution)',
    nominalAltitudeKm: '350 – 1,100 km',
    inclination: '28.5° – 98.6°',
    color: '#eab308',
    accentBg: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
    badge: 'STATISTICAL SWARM',
    dangerLevel: 'HIGH',
  },
  'kuiper': {
    id: 'kuiper',
    name: 'Project Kuiper Constellation',
    category: 'constellation',
    count: 3236,
    description: 'Amazon broadband mega-constellation nodes in low earth orbit',
    nominalAltitudeKm: '590 - 630 km',
    inclination: '33.0° / 42.0° / 51.9°',
    color: '#fbbf24',
    accentBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    badge: 'ACTIVE COOPERATIVE',
    dangerLevel: 'LOW',
  },
  'guowang': {
    id: 'guowang',
    name: 'Guowang (GW) Network',
    category: 'constellation',
    count: 12992,
    description: 'Massive Chinese national broadband mega-constellation (planned deployment)',
    nominalAltitudeKm: '500 - 1,145 km',
    inclination: '30.0° - 85.0°',
    color: '#ef4444',
    accentBg: 'bg-red-500/10 border-red-500/30 text-red-300',
    badge: 'ACTIVE UNCOOPERATIVE',
    dangerLevel: 'MED',
  },
  'iridium-next': {
    id: 'iridium-next',
    name: 'Iridium NEXT',
    category: 'constellation',
    count: 75,
    description: 'L-band satellite constellation in 6 polar orbital planes',
    nominalAltitudeKm: '780 km',
    inclination: '86.4°',
    color: '#8b5cf6',
    accentBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
    badge: 'ACTIVE COOPERATIVE',
    dangerLevel: 'LOW',
  },
  'gps-nav': {
    id: 'gps-nav',
    name: 'GPS / GLONASS / Galileo',
    category: 'constellation',
    count: 98,
    description: 'Global Navigation Satellite Systems operating in MEO',
    nominalAltitudeKm: '19,100 - 23,200 km',
    inclination: '55.0° - 64.8°',
    color: '#3b82f6',
    accentBg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    badge: 'ACTIVE COOPERATIVE',
    dangerLevel: 'LOW',
  },
};

// In-memory catalog cache to avoid recalculating massive arrays on every render
const catalogCache = new Map<string, CatalogObject[]>();

// Fast seeded PRNG (Mulberry32) for deterministic, reproducible orbital generation
function createSeededRandom(seed: number) {
  let s = Math.imul(seed, 0x6D2B79F5);
  return function () {
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    s = (s + 0x6D2B79F5) | 0;
    return ((t >>> 0) / 4294967296);
  };
}

/**
 * Generate procedural Starlink mega-constellation (~5,000 satellites)
 * Distributed across 72 orbital planes at 53.2° and polar shells at 70°
 */
function generateStarlinkCatalog(count: number = 5000): CatalogObject[] {
  const rng = createSeededRandom(101357);
  const items: CatalogObject[] = new Array(count);

  const primaryPlanes = 72;
  const primaryPerPlane = 60; // 4,320 in main 550km shell
  const primaryAlt = 550;
  const polarAlt = 560;

  for (let i = 0; i < count; i++) {
    let altKm: number;
    let incDeg: number;
    let planeIdx: number;
    let satInPlane: number;
    let totalInPlane: number;

    if (i < 4320) {
      altKm = primaryAlt + (rng() - 0.5) * 6; // tight 547-553 km altitude corridor
      incDeg = 53.2 + (rng() - 0.5) * 0.05;
      planeIdx = Math.floor(i / primaryPerPlane);
      satInPlane = i % primaryPerPlane;
      totalInPlane = primaryPerPlane;
    } else {
      altKm = polarAlt + (rng() - 0.5) * 10;
      incDeg = 70.0 + (rng() - 0.5) * 0.1;
      planeIdx = Math.floor((i - 4320) / 36);
      satInPlane = (i - 4320) % 36;
      totalInPlane = 36;
    }

    const a = EARTH_RADIUS_KM + altKm;
    const e = 0.0001 + rng() * 0.0008; // circular frozen orbit
    const iRad = (incDeg * Math.PI) / 180;
    const raanRad = ((planeIdx * (360 / primaryPlanes)) * Math.PI) / 180;
    const meanNu = (satInPlane * (360 / totalInPlane) + (rng() - 0.5) * 0.5) % 360;
    const nuRad = (meanNu * Math.PI) / 180;

    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: raanRad,
      argPerigee: rng() * Math.PI * 2,
      trueAnomaly: nuRad,
    };

    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);

    items[i] = {
      id: `STARLINK-${10000 + i}`,
      name: `Starlink-v2-Mini-${i + 1}`,
      position,
      velocity,
      type: 'starlink',
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm: 320,
      rcs: 'large',
    };
  }

  return items;
}

/**
 * Generate procedural OneWeb constellation (~648 satellites)
 * Distributed across 18 near-polar planes at 1,200 km
 */
function generateOneWebCatalog(count: number = 648): CatalogObject[] {
  const rng = createSeededRandom(402851);
  const items: CatalogObject[] = new Array(count);

  const numPlanes = 18;
  const perPlane = 36;
  const baseAlt = 1200;
  const baseInc = 87.9; // near polar

  for (let i = 0; i < count; i++) {
    const planeIdx = Math.floor(i / perPlane);
    const satInPlane = i % perPlane;

    const altKm = baseAlt + (rng() - 0.5) * 5;
    const incDeg = baseInc + (rng() - 0.5) * 0.04;
    const a = EARTH_RADIUS_KM + altKm;
    const e = 0.0002 + rng() * 0.0005;
    const iRad = (incDeg * Math.PI) / 180;
    const raanRad = ((planeIdx * (360 / numPlanes)) * Math.PI) / 180;
    const nuRad = ((satInPlane * (360 / perPlane) + (rng() - 0.5) * 0.2) * Math.PI) / 180;

    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: raanRad,
      argPerigee: rng() * Math.PI * 2,
      trueAnomaly: nuRad,
    };

    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);

    items[i] = {
      id: `ONEWEB-${1000 + i}`,
      name: `OneWeb-${i + 1}`,
      position,
      velocity,
      type: 'oneweb',
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm: 180,
      rcs: 'medium',
    };
  }

  return items;
}

/**
 * Generate procedural Cosmos-1408 ASAT debris field (~1,500 fragments)
 * Modeled after Russian direct-ascent anti-satellite test of Nov 15, 2021
 * Realistic Gabbard diagram asymmetric fragmentation spread
 */
function generateCosmos1408Catalog(count: number = 1500): CatalogObject[] {
  const rng = createSeededRandom(772109);
  const items: CatalogObject[] = new Array(count);

  const parentAlt = 485;
  const parentInc = 82.6;
  const parentRaan = 114.5 * (Math.PI / 180);

  for (let i = 0; i < count; i++) {
    // Hypervelocity impulse along velocity vector produces asymmetric apogee/perigee spread
    const u = rng() - 0.5;
    const impulse = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * 380; // impulse up to ±380 km delta-SMA
    const altKm = parentAlt + impulse;
    const a = EARTH_RADIUS_KM + altKm;

    // Eccentricity increases proportionally with impulse distance from parent orbit
    const e = Math.min(0.09, 0.003 + Math.abs(impulse) * 0.00018 + rng() * 0.015);
    const incDeg = parentInc + (rng() - 0.5) * 2.2;
    const iRad = (incDeg * Math.PI) / 180;

    // Dispersion in RAAN from explosion lateral velocity
    const raanRad = parentRaan + (rng() - 0.5) * (18 * (Math.PI / 180));
    const argPerigee = rng() * Math.PI * 2;
    const nuRad = rng() * Math.PI * 2;

    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: raanRad,
      argPerigee,
      trueAnomaly: nuRad,
    };

    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    const sizeCm = Math.round((2 + rng() * rng() * 45) * 10) / 10;

    items[i] = {
      id: `COSMOS1408-${i + 1}`,
      name: `COSMOS 1408 DEB #${i + 1}`,
      position,
      velocity,
      type: 'cosmos-1408',
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm,
      rcs: sizeCm > 20 ? 'large' : sizeCm > 8 ? 'medium' : 'small',
    };
  }

  return items;
}

/**
 * Generate procedural Fengyun-1C debris cloud (~3,000 fragments)
 * Modeled after January 11, 2007 ASAT kinetic hit (SC-19)
 * Extreme altitude dispersion across LEO (200 km to >2,800 km)
 */
function generateFengyunCatalog(count: number = 3000): CatalogObject[] {
  const rng = createSeededRandom(903141);
  const items: CatalogObject[] = new Array(count);

  const parentAlt = 865;
  const parentInc = 98.6; // Retrograde Sun-synchronous
  const parentRaan = 24.2 * (Math.PI / 180);

  for (let i = 0; i < count; i++) {
    // FY-1C was a catastrophic head-on impact imparting up to ±1.5 km/s delta-V
    const u = rng() - 0.5;
    const impulse = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * 1250; // widespread spread
    const altKm = Math.max(180, parentAlt + impulse);
    const a = EARTH_RADIUS_KM + altKm;

    const e = Math.min(0.18, 0.005 + Math.abs(impulse) * 0.000085 + rng() * 0.035);
    const incDeg = parentInc + (rng() - 0.5) * 4.8;
    const iRad = (incDeg * Math.PI) / 180;
    const raanRad = parentRaan + (rng() - 0.5) * (35 * (Math.PI / 180));
    const argPerigee = rng() * Math.PI * 2;
    const nuRad = rng() * Math.PI * 2;

    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: raanRad,
      argPerigee,
      trueAnomaly: nuRad,
    };

    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    const sizeCm = Math.round((1 + rng() * rng() * 38) * 10) / 10;

    items[i] = {
      id: `FY1C-DEB-${i + 1}`,
      name: `FENGYUN-1C DEB #${i + 1}`,
      position,
      velocity,
      type: 'fengyun-1c',
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm,
      rcs: sizeCm > 25 ? 'large' : sizeCm > 6 ? 'medium' : 'small',
    };
  }

  return items;
}

/**
 * Generate procedural uncatalogued micro-debris swarm (~10,000 particles)
 * Simulates untracked millimeter-to-centimeter lethal space debris
 * Clustered in high-flux density bands (500 km, 780 km, 850 km, 980 km)
 */
function generateUncataloguedCatalog(count: number = 10000): CatalogObject[] {
  const rng = createSeededRandom(618033);
  const items: CatalogObject[] = new Array(count);

  // Common debris orbit inclination bands (degrees)
  const popularInclinations = [28.5, 51.6, 53.2, 65.0, 74.0, 82.6, 98.6];

  for (let i = 0; i < count; i++) {
    // Multi-modal altitude distribution peaking in dense LEO choke points
    let altKm: number;
    const dice = rng();
    if (dice < 0.35) {
      // 700 - 850 km (Iridium-33 / Cosmos-2251 & Fengyun-1C zone)
      altKm = 720 + rng() * 150;
    } else if (dice < 0.65) {
      // 500 - 620 km (Starlink / Megaconstellation shell)
      altKm = 510 + rng() * 110;
    } else if (dice < 0.85) {
      // 900 - 1050 km (Cold war zenith)
      altKm = 900 + rng() * 150;
    } else {
      // General 350 - 1200 km spread
      altKm = 350 + rng() * 850;
    }

    const a = EARTH_RADIUS_KM + altKm;
    const e = rng() * rng() * 0.08; // mostly low eccentricity

    // Select random inclination corridor
    const baseInc = popularInclinations[Math.floor(rng() * popularInclinations.length)];
    const incDeg = baseInc + (rng() - 0.5) * 3.5;
    const iRad = (incDeg * Math.PI) / 180;
    const raanRad = rng() * Math.PI * 2;
    const argPerigee = rng() * Math.PI * 2;
    const nuRad = rng() * Math.PI * 2;

    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: raanRad,
      argPerigee,
      trueAnomaly: nuRad,
    };

    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    // Sub-centimeter micro-debris size (0.2 cm - 4.5 cm)
    const sizeCm = Math.round((0.2 + rng() * rng() * 4.3) * 10) / 10;

    items[i] = {
      id: `UNCAT-${i + 1}`,
      name: `LEO-µDebris [${sizeCm}cm] #${i + 1}`,
      position,
      velocity,
      type: 'uncatalogued',
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm,
      rcs: sizeCm > 2.0 ? 'medium' : 'small',
    };
  }

  return items;
}

/**
 * Generate procedural Kuiper constellation (~3,236 satellites)
 * Walker-Delta broadband constellation across 3 shell altitudes
 */
function generateKuiperCatalog(count: number = 3236): CatalogObject[] {
  const rng = createSeededRandom(443322);
  const items: CatalogObject[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const altKm = 590 + (rng() - 0.5) * 40;
    const incDeg = 51.9 + (rng() - 0.5) * 2;
    const a = EARTH_RADIUS_KM + altKm;
    const e = 0.001;
    const iRad = (incDeg * Math.PI) / 180;
    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: rng() * 2 * Math.PI,
      argPerigee: 0,
      trueAnomaly: rng() * 2 * Math.PI,
    };
    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    items[i] = {
      id: `KUIPER-${i}`,
      position,
      velocity,
      type: 'kuiper',
      name: `Kuiper-${i}`,
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm: 250,
      rcs: 'large',
    };
  }
  return items;
}

/**
 * Generate procedural Guowang (GW) Network (~12,992 satellites planned)
 * Massive Chinese national broadband mega-constellation
 */
function generateGuowangCatalog(count: number = 12992): CatalogObject[] {
  const rng = createSeededRandom(998877);
  const items: CatalogObject[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const altKm = 500 + (rng() * 645);
    const incDeg = 30 + (rng() * 55);
    const a = EARTH_RADIUS_KM + altKm;
    const e = 0.001;
    const iRad = (incDeg * Math.PI) / 180;
    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: rng() * 2 * Math.PI,
      argPerigee: 0,
      trueAnomaly: rng() * 2 * Math.PI,
    };
    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    items[i] = {
      id: `GW-${i}`,
      position,
      velocity,
      type: 'guowang',
      name: `GW-${i}`,
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm: 200,
      rcs: 'large',
    };
  }
  return items;
}

/**
 * Generate procedural Iridium NEXT constellation (~75 active satellites)
 * 6 polar orbital planes at 780 km
 */
function generateIridiumCatalog(count: number = 75): CatalogObject[] {
  const rng = createSeededRandom(112233);
  const items: CatalogObject[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const altKm = 780 + (rng() - 0.5) * 5;
    const incDeg = 86.4 + (rng() - 0.5) * 0.1;
    const a = EARTH_RADIUS_KM + altKm;
    const e = 0.001;
    const iRad = (incDeg * Math.PI) / 180;
    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: rng() * 2 * Math.PI,
      argPerigee: 0,
      trueAnomaly: rng() * 2 * Math.PI,
    };
    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    items[i] = {
      id: `IRIDIUM-${i}`,
      position,
      velocity,
      type: 'iridium-next',
      name: `Iridium-${i}`,
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm: 300,
      rcs: 'large',
    };
  }
  return items;
}

/**
 * Generate procedural GNSS navigation satellites (~98 across GPS, GLONASS, Galileo)
 * Medium Earth Orbit at ~20,000 km
 */
function generateGpsCatalog(count: number = 98): CatalogObject[] {
  const rng = createSeededRandom(556677);
  const items: CatalogObject[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const altKm = 20000 + (rng() - 0.5) * 1000;
    const incDeg = 55.0 + (rng() * 10);
    const a = EARTH_RADIUS_KM + altKm;
    const e = 0.001;
    const iRad = (incDeg * Math.PI) / 180;
    const elements: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: iRad,
      raan: rng() * 2 * Math.PI,
      argPerigee: 0,
      trueAnomaly: rng() * 2 * Math.PI,
    };
    const { position, velocity } = keplerianToCartesian(elements, EARTH_MU);
    items[i] = {
      id: `GNSS-${i}`,
      position,
      velocity,
      type: 'gps-nav',
      name: `GNSS-${i}`,
      altitudeKm: Math.round(altKm * 10) / 10,
      inclinationDeg: Math.round(incDeg * 10) / 10,
      sizeCm: 400,
      rcs: 'large',
    };
  }
  return items;
}

/**
 * Main procedural catalog generator
 * @param type 'starlink' | 'oneweb' | 'cosmos-1408' | 'fengyun-1c' | 'uncatalogued'
 */
export function generateCatalog(type: string): CatalogObject[] {
  const normalizedType = type.toLowerCase().trim();

  // Return cached dataset if already compiled
  if (catalogCache.has(normalizedType)) {
    return catalogCache.get(normalizedType)!;
  }

  let generated: CatalogObject[];

  switch (normalizedType) {
    case 'starlink':
      generated = generateStarlinkCatalog(5000);
      break;

    case 'oneweb':
      generated = generateOneWebCatalog(648);
      break;

    case 'cosmos-1408':
    case 'cosmos1408':
      generated = generateCosmos1408Catalog(1500);
      break;

    case 'fengyun-1c':
    case 'fengyun1c':
      generated = generateFengyunCatalog(3000);
      break;

    case 'uncatalogued':
    case 'microdebris':
    case 'micro-debris':
      generated = generateUncataloguedCatalog(10000);
      break;

    case 'kuiper':
      generated = generateKuiperCatalog(3236);
      break;

    case 'guowang':
      generated = generateGuowangCatalog(12992);
      break;

    case 'iridium-next':
      generated = generateIridiumCatalog(75);
      break;

    case 'gps-nav':
      generated = generateGpsCatalog(98);
      break;

    default:
      console.warn(`Unknown catalog type '${type}'. Defaulting to empty catalog.`);
      generated = [];
      break;
  }

  catalogCache.set(normalizedType, generated);
  return generated;
}

/**
 * Get catalog metadata definition
 */
export function getCatalogMetadata(type: string): CatalogMeta | undefined {
  const normalized = type.toLowerCase().trim();
  return CATALOG_DEFINITIONS[normalized];
}

/**
 * Get all available catalog keys
 */
export function getAvailableCatalogTypes(): string[] {
  return Object.keys(CATALOG_DEFINITIONS);
}

/**
 * Preload all catalogs into memory for instant switching
 */
export function preloadAllCatalogs(): void {
  for (const key of Object.keys(CATALOG_DEFINITIONS)) {
    generateCatalog(key);
  }
}

/**
 * Clear memory cache if needed
 */
export function clearCatalogCache(): void {
  catalogCache.clear();
}
