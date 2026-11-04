export * from "./constants";
export * from "./orbitalMechanics";
export * from "./debrisModel";
export * from "./meshNetwork";
export * from "./catalogGenerator";

// Explicit re-exports to resolve name collisions across modules
export { encodeState } from "./clmInferenceEngine";
export { computeSimilarities } from "./clmInferenceEngine";
export { computeSimilaritiesAsync } from "./clmInferenceEngine";
export { fetchLiveInference } from "./clmInferenceEngine";
export { projectTo2D } from "./clmInferenceEngine";
export { getActionMetadata } from "./clmInferenceEngine";
export { DEFAULT_TEMPERATURE } from "./clmInferenceEngine";
export { ACTION_CODEBOOK, ACTION_METADATA } from "./clmInferenceEngine";
export type { ActionMetadata, CLMSimilarityResult, LiveInferenceAction, LiveInferenceResult, TelemetryInputState } from "./clmInferenceEngine";

export * as clmInferenceEngine from "./clmInferenceEngine";
export * as apiClient from "./apiClient";