import { CLM_INFERENCE_TIME_MS, type Vec3 } from './constants';

export function encodeState(stateVector: number[]): number[] {
  if (stateVector.length === 0) {
    return new Array(16).fill(0);
  }

  // Mean & standard deviation normalization
  const mean = stateVector.reduce((acc, val) => acc + val, 0) / stateVector.length;
  const variance =
    stateVector.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / stateVector.length;
  const std = Math.sqrt(variance + 1e-8);

  const normalized = stateVector.map((v) => (v - mean) / std);

  // Latent projection into a 16-dimensional embedding space
  const embeddingDim = 16;
  const embedding: number[] = new Array(embeddingDim).fill(0);

  for (let i = 0; i < embeddingDim; i++) {
    let sum = 0;
    for (let j = 0; j < normalized.length; j++) {
      const weight = Math.sin((i + 1) * 1.372 + (j + 1) * 2.193);
      sum += normalized[j] * weight;
    }
    // Non-linear activation (tanh)
    embedding[i] = Math.tanh(sum);
  }

  // L2 unit normalization
  const l2Norm = Math.sqrt(
    embedding.reduce((acc, val) => acc + val * val, 0)
  );

  if (l2Norm < 1e-12) {
    return embedding;
  }

  return embedding.map((val) => val / l2Norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator < 1e-12) {
    return 0;
  }

  return Math.max(-1.0, Math.min(1.0, dotProduct / denominator));
}

export interface ManeuverLibraryItem {
  id?: string;
  name?: string;
  embedding: number[];
  deltaV: {
    magnitude: number; // m/s
    direction: Vec3;
  };
  [key: string]: unknown;
}

export function retrieveManeuver<T extends ManeuverLibraryItem>(
  stateEmbedding: number[],
  actionLibrary: T[]
): {
  bestMatch: T;
  similarity: number;
  inferenceTimeMs: number;
  allScores: { index: number; similarity: number }[];
} {
  if (actionLibrary.length === 0) {
    throw new Error('Action library cannot be empty for maneuver retrieval');
  }

  const allScores = actionLibrary.map((item, index) => ({
    index,
    similarity: cosineSimilarity(stateEmbedding, item.embedding),
  }));

  allScores.sort((a, b) => b.similarity - a.similarity);

  const bestScore = allScores[0];
  const bestMatch = actionLibrary[bestScore.index];

  // CLM inference latency simulation jitter between 14ms and 18ms
  const pseudoJitter = ((Math.sin(stateEmbedding[0] ?? 0.5) + 1) / 2) * 4;
  const inferenceTimeMs = Math.round((14 + pseudoJitter) * 10) / 10;

  return {
    bestMatch,
    similarity: bestScore.similarity,
    inferenceTimeMs: inferenceTimeMs || CLM_INFERENCE_TIME_MS,
    allScores,
  };
}

export function productQuantize(
  embedding: number[],
  codebookSize: number = 16,
  numSubvectors: number = 4
): { quantized: number[]; compressionRatio: number } {
  const d = embedding.length;
  const subvectorDim = Math.max(1, Math.floor(d / numSubvectors));
  const quantizedIndices: number[] = [];

  for (let m = 0; m < numSubvectors; m++) {
    const start = m * subvectorDim;
    const subvector = embedding.slice(start, start + subvectorDim);

    // Find closest centroid among codebook centroids
    let bestCentroidIdx = 0;
    let minDistance = Infinity;

    for (let c = 0; c < codebookSize; c++) {
      let dist = 0;
      for (let k = 0; k < subvector.length; k++) {
        // Deterministic pseudo-codebook centroid projection
        const centroidVal = Math.sin((m + 1) * 3.14 + (c + 1) * 0.73 + (k + 1) * 1.57);
        const diff = (subvector[k] ?? 0) - centroidVal;
        dist += diff * diff;
      }

      if (dist < minDistance) {
        minDistance = dist;
        bestCentroidIdx = c;
      }
    }

    quantizedIndices.push(bestCentroidIdx);
  }

  // Original size: 32 bits per float element
  const originalBits = d * 32;
  // Quantized size: log2(codebookSize) bits per subvector
  const bitsPerSubvector = Math.max(1, Math.ceil(Math.log2(codebookSize)));
  const quantizedBits = numSubvectors * bitsPerSubvector;
  const compressionRatio = Math.round((originalBits / Math.max(1, quantizedBits)) * 10) / 10;

  return {
    quantized: quantizedIndices,
    compressionRatio,
  };
}
