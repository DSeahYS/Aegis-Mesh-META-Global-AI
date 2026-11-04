// In-browser Contrastive-LM (CLM) Inference Engine
// Mathematical forward pass, MLP encoder, 256x16 Action Codebook, InfoNCE similarity

export interface ActionMetadata {
  id: number;
  label: string;
  category: 'prograde' | 'retrograde' | 'radial-out' | 'radial-in' | 'cross-north' | 'cross-south' | 'emergency-escape' | 'continuous-phasing';
  clusterIndex: number;
  deltaV: {
    magnitude: number; // m/s
    direction: [number, number, number]; // [radial, along-track, cross-track]
  };
  burnDurationSec: number;
  fuelCostKg: number;
}

export interface CLMSimilarityResult {
  similarities: number[];
  topIndices: number[];
  rawLogits: number[];
  indexedSimilarities: number[];
  softmaxProbabilities: number[];
  bestIndex: number;
  bestSimilarity: number;
}

export const CLM_EMBEDDING_DIM = 16;
export const CODEBOOK_SIZE = 256;
export const DEFAULT_TEMPERATURE = 0.07;
export const NUM_CLUSTERS = 8;

function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function vectorDot(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function vectorNorm(v: number[]): number {
  return Math.sqrt(vectorDot(v, v));
}

export function l2Normalize(v: number[]): number[] {
  const norm = vectorNorm(v);
  if (norm < 1e-12) {
    return new Array(v.length).fill(0);
  }
  return v.map((x) => x / norm);
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// -------------------------------------------------------------
// Procedural Generation of the Static 256x16 ACTION_CODEBOOK
// -------------------------------------------------------------
const CLUSTER_CONFIGS: {
  category: ActionMetadata['category'];
  namePrefix: string;
  dirBase: [number, number, number];
  dvRange: [number, number];
  durationRange: [number, number];
}[] = [
  { category: 'prograde', namePrefix: 'PRO-BOOST', dirBase: [0.05, 0.98, 0.02], dvRange: [1.2, 5.5], durationRange: [6, 24] },
  { category: 'retrograde', namePrefix: 'RETRO-DIVE', dirBase: [-0.04, -0.98, 0.01], dvRange: [1.4, 6.2], durationRange: [8, 30] },
  { category: 'radial-out', namePrefix: 'RADIAL-OUT', dirBase: [0.96, 0.08, -0.05], dvRange: [2.0, 7.8], durationRange: [12, 40] },
  { category: 'radial-in', namePrefix: 'RADIAL-IN', dirBase: [-0.96, -0.06, 0.04], dvRange: [2.0, 7.5], durationRange: [12, 38] },
  { category: 'cross-north', namePrefix: 'INC-NORTH', dirBase: [0.02, 0.04, 0.98], dvRange: [2.5, 9.0], durationRange: [15, 48] },
  { category: 'cross-south', namePrefix: 'INC-SOUTH', dirBase: [-0.03, -0.02, -0.98], dvRange: [2.5, 9.2], durationRange: [15, 50] },
  { category: 'emergency-escape', namePrefix: 'EMERG-EVADE', dirBase: [0.55, 0.65, 0.52], dvRange: [5.0, 14.8], durationRange: [25, 75] },
  { category: 'continuous-phasing', namePrefix: 'E-PHASE', dirBase: [0.12, 0.92, -0.15], dvRange: [0.4, 2.2], durationRange: [40, 180] },
];

function generateCodebookAndMetadata(): {
  codebook: number[][];
  metadata: ActionMetadata[];
  pcaComponents: { v1: number[]; v2: number[]; mean: number[] };
} {
  const rng = createMulberry32(0x504143); // 'PAC' seed

  // Generate 8 distinct cluster centroids in 16D unit hypersphere
  const centroids: number[][] = [];
  for (let c = 0; c < NUM_CLUSTERS; c++) {
    const raw: number[] = [];
    for (let d = 0; d < CLM_EMBEDDING_DIM; d++) {
      raw.push(rng() * 2 - 1);
    }
    centroids.push(l2Normalize(raw));
  }

  const actionsPerCluster = Math.floor(CODEBOOK_SIZE / NUM_CLUSTERS);
  const codebook: number[][] = [];
  const metadata: ActionMetadata[] = [];

  for (let i = 0; i < CODEBOOK_SIZE; i++) {
    const clusterIdx = Math.min(NUM_CLUSTERS - 1, Math.floor(i / actionsPerCluster));
    const centroid = centroids[clusterIdx];
    const cfg = CLUSTER_CONFIGS[clusterIdx];

    // Disperse slightly around centroid
    const perturbed: number[] = [];
    for (let d = 0; d < CLM_EMBEDDING_DIM; d++) {
      perturbed.push(centroid[d] + (rng() * 2 - 1) * 0.22);
    }
    const normalizedEmbedding = l2Normalize(perturbed);
    codebook.push(normalizedEmbedding);

    // Build rich maneuver metadata
    const progress = (i % actionsPerCluster) / actionsPerCluster;
    const dvMag = cfg.dvRange[0] + progress * (cfg.dvRange[1] - cfg.dvRange[0]) + (rng() - 0.5) * 0.3;
    const burnDur = Math.round(cfg.durationRange[0] + progress * (cfg.durationRange[1] - cfg.durationRange[0]));
    const fuelKg = Math.round(dvMag * 0.28 * 100) / 100;

    const dir: [number, number, number] = [
      cfg.dirBase[0] + (rng() - 0.5) * 0.08,
      cfg.dirBase[1] + (rng() - 0.5) * 0.08,
      cfg.dirBase[2] + (rng() - 0.5) * 0.08,
    ];
    const dirNorm = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    const dirUnit: [number, number, number] = [dir[0] / dirNorm, dir[1] / dirNorm, dir[2] / dirNorm];

    metadata.push({
      id: i,
      label: `${cfg.namePrefix}-${String(i).padStart(3, '0')}`,
      category: cfg.category,
      clusterIndex: clusterIdx,
      deltaV: {
        magnitude: Math.round(Math.max(0.1, dvMag) * 100) / 100,
        direction: dirUnit,
      },
      burnDurationSec: burnDur,
      fuelCostKg: fuelKg,
    });
  }

  // Precompute PCA 2D projection vectors via Power Iteration on Covariance Matrix
  const mean: number[] = new Array(CLM_EMBEDDING_DIM).fill(0);
  for (let d = 0; d < CLM_EMBEDDING_DIM; d++) {
    let sum = 0;
    for (let r = 0; r < CODEBOOK_SIZE; r++) {
      sum += codebook[r][d];
    }
    mean[d] = sum / CODEBOOK_SIZE;
  }

  const cov: number[][] = Array.from({ length: CLM_EMBEDDING_DIM }, () => new Array(CLM_EMBEDDING_DIM).fill(0));
  for (let r = 0; r < CLM_EMBEDDING_DIM; r++) {
    for (let c = 0; c < CLM_EMBEDDING_DIM; c++) {
      let sum = 0;
      for (let i = 0; i < CODEBOOK_SIZE; i++) {
        sum += (codebook[i][r] - mean[r]) * (codebook[i][c] - mean[c]);
      }
      cov[r][c] = sum / CODEBOOK_SIZE;
    }
  }

  function powerIter(deflateWith: number[] | null): number[] {
    let v: number[] = [];
    for (let d = 0; d < CLM_EMBEDDING_DIM; d++) {
      v.push(rng() * 2 - 1);
    }
    v = l2Normalize(v);

    for (let iter = 0; iter < 60; iter++) {
      if (deflateWith) {
        const dot = vectorDot(v, deflateWith);
        v = v.map((val, idx) => val - dot * deflateWith[idx]);
        v = l2Normalize(v);
      }
      const next = new Array(CLM_EMBEDDING_DIM).fill(0);
      for (let r = 0; r < CLM_EMBEDDING_DIM; r++) {
        for (let c = 0; c < CLM_EMBEDDING_DIM; c++) {
          next[r] += cov[r][c] * v[c];
        }
      }
      v = l2Normalize(next);
    }
    return v;
  }

  const v1 = powerIter(null);
  const v2 = powerIter(v1);

  return {
    codebook,
    metadata,
    pcaComponents: { v1, v2, mean },
  };
}

const generated = generateCodebookAndMetadata();

export const ACTION_CODEBOOK: number[][] = generated.codebook;
export const ACTION_METADATA: ActionMetadata[] = generated.metadata;
const { v1: PCA_V1, v2: PCA_V2, mean: PCA_MEAN } = generated.pcaComponents;

// -------------------------------------------------------------
// MLP State Encoder (4 inputs -> 32 hidden ReLU -> 16 latent outputs)
// -------------------------------------------------------------
const mlpRng = createMulberry32(0x434c4d); // 'CLM' seed
const MLP_INPUT_DIM = 4;
const MLP_HIDDEN_DIM = 32;

const W1: number[][] = Array.from({ length: MLP_HIDDEN_DIM }, () =>
  Array.from({ length: MLP_INPUT_DIM }, () => (mlpRng() * 2 - 1) * Math.sqrt(2 / MLP_INPUT_DIM))
);
const B1: number[] = Array.from({ length: MLP_HIDDEN_DIM }, () => (mlpRng() * 2 - 1) * 0.05);

const W2: number[][] = Array.from({ length: CLM_EMBEDDING_DIM }, () =>
  Array.from({ length: MLP_HIDDEN_DIM }, () => (mlpRng() * 2 - 1) * Math.sqrt(2 / MLP_HIDDEN_DIM))
);
const B2: number[] = Array.from({ length: CLM_EMBEDDING_DIM }, () => (mlpRng() * 2 - 1) * 0.05);

export function encodeState(telemetry: number[]): number[] {
  // Normalize raw telemetry inputs [TCA (s), Miss Distance (km), Rel Velocity (km/s), Debris Mass (kg)]
  const tca = telemetry[0] ?? 40.0;
  const missDistance = telemetry[1] ?? 0.2;
  const relVelocity = telemetry[2] ?? 11.0;
  const debrisMass = telemetry[3] ?? 45.0;

  const x: [number, number, number, number] = [
    Math.max(-2.5, Math.min(2.5, (tca - 50.0) / 75.0)),
    Math.max(-2.5, Math.min(2.5, (missDistance - 0.5) / 1.2)),
    Math.max(-2.5, Math.min(2.5, (relVelocity - 10.0) / 5.0)),
    Math.max(-2.5, Math.min(2.5, (Math.log10(Math.max(0.1, debrisMass)) - 1.5) / 1.5)),
  ];

  // Hidden Layer with ReLU activation
  const h1 = new Array(MLP_HIDDEN_DIM);
  for (let i = 0; i < MLP_HIDDEN_DIM; i++) {
    let sum = B1[i];
    for (let j = 0; j < MLP_INPUT_DIM; j++) {
      sum += W1[i][j] * x[j];
    }
    h1[i] = Math.max(0, sum); // ReLU
  }

  // Output Projection Layer
  const z = new Array(CLM_EMBEDDING_DIM);
  for (let i = 0; i < CLM_EMBEDDING_DIM; i++) {
    let sum = B2[i];
    for (let j = 0; j < MLP_HIDDEN_DIM; j++) {
      sum += W2[i][j] * h1[j];
    }
    z[i] = sum;
  }

  // L2 unit hypersphere normalization
  return l2Normalize(z);
}

// -------------------------------------------------------------
// InfoNCE Dot-Product & Contrastive Similarities Calculation
// -------------------------------------------------------------
export function computeSimilarities(
  stateVector: number[],
  temperature: number = DEFAULT_TEMPERATURE
): CLMSimilarityResult {
  const tau = Math.max(0.001, temperature);

  // Compute dot products against all 256 codebook vectors
  const indexedSimilarities = new Array<number>(CODEBOOK_SIZE);
  const scoredItems: { index: number; dot: number; logit: number }[] = [];

  for (let i = 0; i < CODEBOOK_SIZE; i++) {
    const actionVec = ACTION_CODEBOOK[i];
    const dot = vectorDot(stateVector, actionVec);
    const logit = dot / tau;

    indexedSimilarities[i] = dot;
    scoredItems.push({ index: i, dot, logit });
  }

  // Sort descending by similarity / logit
  scoredItems.sort((a, b) => b.dot - a.dot);

  const topIndices = scoredItems.map((item) => item.index);
  const similarities = scoredItems.map((item) => item.dot);
  const rawLogits = scoredItems.map((item) => item.logit);

  // Compute Softmax probabilities for InfoNCE attention distribution
  const maxLogit = rawLogits[0] ?? 0;
  const expVals = rawLogits.map((l) => Math.exp(Math.max(-50, l - maxLogit)));
  const sumExp = expVals.reduce((acc, v) => acc + v, 0);
  const softmaxProbabilities = expVals.map((ev) => (sumExp > 0 ? ev / sumExp : 0));

  return {
    similarities,
    topIndices,
    rawLogits,
    indexedSimilarities,
    softmaxProbabilities,
    bestIndex: topIndices[0] ?? 0,
    bestSimilarity: similarities[0] ?? 0,
  };
}

// -------------------------------------------------------------
// Latent 2D Projection (PCA-based mapping from R^16 to R^2)
// -------------------------------------------------------------
export function projectTo2D(vector16D: number[]): [number, number] {
  let x = 0;
  let y = 0;
  const len = Math.min(vector16D.length, CLM_EMBEDDING_DIM);

  for (let i = 0; i < len; i++) {
    const diff = vector16D[i] - (PCA_MEAN[i] ?? 0);
    x += diff * (PCA_V1[i] ?? 0);
    y += diff * (PCA_V2[i] ?? 0);
  }

  return [x, y];
}

export function getActionMetadata(actionIndex: number): ActionMetadata {
  return ACTION_METADATA[actionIndex] ?? {
    id: actionIndex,
    label: `ACT-${actionIndex}`,
    category: 'emergency-escape',
    clusterIndex: 0,
    deltaV: { magnitude: 1.0, direction: [0, 1, 0] },
    burnDurationSec: 10,
    fuelCostKg: 0.3,
  };
}

// -------------------------------------------------------------
// Live FastAPI Edge Hardware Integration (PolarFire SWaP Backend)
// -------------------------------------------------------------

export interface LiveInferenceAction {
  action: string;
  confidence: number;
  score: number;
}

export interface LiveInferenceResult {
  top_actions: LiveInferenceAction[];
  latency_ms: number;
  source: 'polarfire-backend' | 'in-browser-fallback';
}

export type TelemetryInputState =
  | number[]
  | {
      tca?: number;
      missDistance?: number;
      relVelocity?: number;
      debrisMass?: number;
      [key: string]: unknown;
    };

/**
 * Executes live CLM similarity inference against the Microchip PolarFire Edge FastAPI backend
 * (/api/inference) with seamless client-side fallback if the edge container is offline.
 */
export async function fetchLiveInference(
  state: TelemetryInputState
): Promise<LiveInferenceResult> {
  let telemetryVector: number[];

  if (Array.isArray(state)) {
    if (state.length === CLM_EMBEDDING_DIM) {
      telemetryVector = [...state];
    } else if (state.length === 4) {
      telemetryVector = encodeState(state);
    } else if (state.length < CLM_EMBEDDING_DIM) {
      telemetryVector = [...state, ...new Array(CLM_EMBEDDING_DIM - state.length).fill(0)];
    } else {
      telemetryVector = state.slice(0, CLM_EMBEDDING_DIM);
    }
  } else if (typeof state === 'object' && state !== null) {
    const raw = [
      Number(state.tca ?? 40.0),
      Number(state.missDistance ?? 0.2),
      Number(state.relVelocity ?? 11.0),
      Number(state.debrisMass ?? 45.0),
    ];
    telemetryVector = encodeState(raw);
  } else {
    telemetryVector = new Array(CLM_EMBEDDING_DIM).fill(0.1);
  }

  // Ensure normalized 16-D unit embedding
  telemetryVector = l2Normalize(telemetryVector);

  const startTime = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch('/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ telemetry: telemetryVector }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const elapsedMs = performance.now() - startTime;
      return {
        top_actions: data.top_actions || [],
        latency_ms: typeof data.latency_ms === 'number' ? data.latency_ms : elapsedMs,
        source: 'polarfire-backend',
      };
    }
  } catch {
    // Backend unreachable or timeout: fall back gracefully to client-side CLM
  }

  // Local fallback InfoNCE similarity evaluation
  const localResult = computeSimilarities(telemetryVector);
  const elapsedMs = performance.now() - startTime;

  const topActions: LiveInferenceAction[] = localResult.topIndices.slice(0, 3).map((idx, rank) => {
    const meta = getActionMetadata(idx);
    return {
      action: `${meta.label} [${meta.category.toUpperCase()}] dv=${meta.deltaV.magnitude}m/s`,
      confidence: Math.round((localResult.softmaxProbabilities[rank] ?? 0.9) * 1000) / 1000,
      score: Math.round((localResult.similarities[rank] ?? 0.8) * 1000) / 1000,
    };
  });

  return {
    top_actions: topActions,
    latency_ms: elapsedMs,
    source: 'in-browser-fallback',
  };
}

/**
 * Asynchronous variant of computeSimilarities for non-blocking UI pipelines.
 */
export async function computeSimilaritiesAsync(
  stateVector: number[],
  temperature: number = DEFAULT_TEMPERATURE
): Promise<CLMSimilarityResult> {
  return Promise.resolve(computeSimilarities(stateVector, temperature));
}

