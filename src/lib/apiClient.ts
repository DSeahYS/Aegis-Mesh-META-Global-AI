export interface InferenceAction {
  action: string;
  confidence: number;
  score: number;
}

export interface InferenceResult {
  top_actions: InferenceAction[];
  latency_ms: number;
  source: "polarfire-backend" | "in-browser-fallback";
}

export interface ConjunctionResult {
  probability: number;
  timeOfClosestApproach: string;
  missDistance: number;
  relativeVelocityKmS: number;
  bPlaneB: number;
}

export interface CDMData {
  messageId: string;
  creationDate: string;
  primaryObject: string;
  secondaryObject: string;
}

export interface TLEData {
  norad_id: string;
  name: string;
  line1: string;
  line2: string;
}

export interface StateVector {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface ConjunctionScreenResult {
  conjunctions: ConjunctionResult[];
}

export interface HealthStatus {
  status: string;
  uptime: number;
}

export interface BenchmarkReport {
  latency_ms: { mean: number; p50: number; p95: number; max: number };
  memory_bytes: { peak: number };
  power_watts: { estimated: number };
}

const DEFAULT_TIMEOUT = 5000;

async function fetchWithTimeout<T = unknown>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(id);
    console.error("API Error:", error);
    return null;
  }
}

export async function runInference(telemetry: number[]): Promise<InferenceResult | null> {
  return fetchWithTimeout("/api/inference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telemetry }),
  });
}

export async function assessConjunction(
  primary: TLEData,
  secondary: TLEData,
  epoch: string,
  hardBodyRadius: number = 10.0
): Promise<ConjunctionResult | null> {
  const raw = await fetchWithTimeout<{
    miss_distance_km: number;
    probability_of_collision: number;
    tca: string;
    b_plane: { xi: number; zeta: number; b_mag: number };
    relative_velocity_km_s: number;
  }>("/api/conjunction/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primary_tle: primary, secondary_tle: secondary, epoch, hard_body_radius: hardBodyRadius }),
  });
  if (!raw) return null;
  return {
    probability: raw.probability_of_collision,
    timeOfClosestApproach: raw.tca,
    missDistance: raw.miss_distance_km,
    relativeVelocityKmS: raw.relative_velocity_km_s,
    bPlaneB: raw.b_plane?.b_mag ?? 0,
  };
}

export async function parseCDM(cdmText: string): Promise<CDMData | null> {
  const raw = await fetchWithTimeout<{ status: string; data: Record<string, any> }>("/api/cdm/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cdmText }),
  });
  if (!raw || raw.status !== "success") return null;

  const parsed = raw.data ?? {};
  const metadata = parsed.metadata ?? {};
  const dataSection = parsed.data ?? {};
  const objectKeys = Object.keys(metadata);
  const dataObjectKeys = Object.keys(dataSection).filter((k) => typeof dataSection[k] === "object");

  return {
    messageId: parsed.header?.MESSAGE_ID ?? parsed.header?.CCSDS_MSGID ?? "",
    creationDate: parsed.header?.CREATION_DATE ?? dataSection.TCA ?? "",
    primaryObject: metadata[objectKeys[0]]?.OBJECT ?? objectKeys[0] ?? "",
    secondaryObject: metadata[objectKeys[1]]?.OBJECT ?? objectKeys[1] ?? dataObjectKeys[0] ?? "",
  };
}

export async function fetchTLEs(params: Record<string, any>): Promise<TLEData[] | null> {
  const query = new URLSearchParams(params).toString();
  const raw = await fetchWithTimeout<{ tles: TLEData[] }>(`/api/tle/query?${query}`);
  return raw?.tles ?? null;
}

export async function propagateOrbit(
  tleLine1: string,
  tleLine2: string,
  epoch?: string
): Promise<StateVector | null> {
  return fetchWithTimeout("/api/tle/propagate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tle_line1: tleLine1, tle_line2: tleLine2, epoch: epoch || null }),
  });
}

export async function screenConjunctions(
  primaryTle: string,
  debrisTles: string[],
  windowHours: number = 24.0
): Promise<ConjunctionScreenResult | null> {
  return fetchWithTimeout("/api/conjunction/screen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primary_tle: primaryTle, debris_tles: debrisTles, window_hours: windowHours }),
  });
}

export async function getHealth(): Promise<HealthStatus | null> {
  return fetchWithTimeout<HealthStatus>("/api/health");
}

export async function getBenchmarkResults(): Promise<BenchmarkReport | null> {
  return fetchWithTimeout<BenchmarkReport>("/api/benchmark/results");
}

// -------------------------------------------------------------
// V&V Proof API Interfaces & Functions (CCSDS / AIAA / Isaacs HJ / HOCBF)
// -------------------------------------------------------------

export interface PipelineRequest {
  tca_s: number;
  miss_xi_m: number;
  miss_zeta_m: number;
  rel_velocity_km_s: number;
  debris_mass_kg: number;
  sigma_xi_m: number;
  sigma_zeta_m: number;
  rho: number;
  hard_body_radius_m: number;
  sat_mass_kg: number;
  propellant_mass_kg: number;
  isp_s: number;
  max_thrust_n: number;
  altitude_km: number;
  min_perigee_km: number;
  d_max_mps2: number;
  pc_threshold: number;
  top_k: number;
}

export interface PipelineRuleResult {
  id: string;
  name: string;
  passed: boolean;
  value: number;
  limit: number;
  unit: string;
  detail: string;
}

export interface PipelineCandidate {
  rank: number;
  id: number;
  label: string;
  category: string;
  delta_v_mps: number;
  direction_rtn: [number, number, number];
  confidence: number;
  score: number;
  accepted: boolean;
  rules: PipelineRuleResult[];
}

export interface PipelineDerived {
  u_max_mps2: number;
  dv_available_mps: number;
  miss_m: number;
  covariance_2x2: [[number, number], [number, number]];
}

export interface PipelineAssessment {
  pc_pre: number;
  pc_post: number | null;
  threshold: number;
  triggered: boolean;
  method: string;
  miss_post_m: number | null;
  miss_vector_pre_m: [number, number];
  miss_vector_post_m: [number, number] | null;
}

export interface PipelineValidation {
  engine: string;
  evaluated: number;
  rejected: number;
  selected_index: number | null;
  candidates: PipelineCandidate[];
}

export interface HJGrid {
  y_m: number[];
  v_mps: number[];
  value_m: number[][]; // rows = v index, cols = y index
}

export interface HJState {
  y_m: number;
  v_mps: number;
}

export interface HJSolverStats {
  grid_n: number;
  dt_s: number;
  steps: number;
  solve_ms: number;
}

export interface PipelineHJ {
  method: string;
  u_max_mps2: number;
  d_max_mps2: number;
  horizon_s: number;
  in_brt: boolean;
  value_at_state_m: number;
  value_at_state_analytic_m: number;
  maneuver_certified: boolean;
  maneuver_guaranteed_miss_m: number;
  grid: HJGrid;
  state: HJState;
  post_maneuver_state: HJState;
  solver: HJSolverStats;
}

export interface PipelineCBF {
  keepout_k: number;
  alpha1: number;
  alpha2: number;
  t_s: number[];
  h_filtered: number[];
  h_nominal: number[];
  miss_filtered_m: number[];
  miss_nominal_m: number[];
  u_filtered_norm: number[];
  u_nominal_norm: number[];
  interventions: number;
  saturated_steps: number;
  entered_safe_set_at_s: number | null;
  min_h_after_entry: number;
  forward_invariant: boolean;
  nominal_min_h_after_entry: number;
  final_pc_filtered: number;
  final_pc_nominal: number;
}

export type VerdictStatus =
  | 'EXECUTE'
  | 'NO_ACTION_REQUIRED'
  | 'ABORT_NO_SAFE_MANEUVER'
  | 'UNVERIFIED';

export interface PipelineVerdict {
  status: VerdictStatus;
  reasons: string[];
}

export interface PipelineStageTimings {
  assess: number;
  clm: number;
  validation: number;
  hj: number;
  cbf: number;
  total: number;
}

export interface PipelineResponse {
  run_id: string;
  timestamp: string;
  inputs: PipelineRequest;
  derived: PipelineDerived;
  assessment: PipelineAssessment;
  validation: PipelineValidation;
  selected: PipelineCandidate | null;
  hj: PipelineHJ;
  cbf: PipelineCBF;
  verdict: PipelineVerdict;
  stage_timings_ms: PipelineStageTimings;
}

export interface SelfTestItem {
  id: string;
  category: 'verification' | 'validation';
  name: string;
  description: string;
  method: string;
  reference: string;
  expected: number | string;
  actual: number | string;
  error: number | string | null;
  tolerance: number | string | null;
  unit: string;
  passed: boolean;
  duration_ms: number;
  details?: Record<string, unknown> | null;
}

export interface SelfTestSummary {
  total: number;
  passed: number;
  failed: number;
}

export interface SelfTestEnvironment {
  python: string;
  numpy: string;
  scipy: string;
  sgp4: string;
  platform: string;
  [key: string]: string;
}

export interface SelfTestResponse {
  run_id: string;
  timestamp: string;
  total_duration_ms: number;
  environment: SelfTestEnvironment;
  summary: SelfTestSummary;
  tests: SelfTestItem[];
}

export interface CDMCheckItem {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  passed: boolean;
  detail: string;
}

export interface CDMValidationResponse {
  valid: boolean;
  errors: number;
  warnings: number;
  checks: CDMCheckItem[];
  parsed: Record<string, unknown>;
}

export const DEFAULT_PIPELINE_REQUEST: PipelineRequest = {
  tca_s: 40.0,
  miss_xi_m: 160.0,
  miss_zeta_m: 120.0,
  rel_velocity_km_s: 11.0,
  debris_mass_kg: 45.0,
  sigma_xi_m: 120.0,
  sigma_zeta_m: 60.0,
  rho: 0.2,
  hard_body_radius_m: 15.0,
  sat_mass_kg: 150.0,
  propellant_mass_kg: 2.0,
  isp_s: 220.0,
  max_thrust_n: 22.0,
  altitude_km: 550.0,
  min_perigee_km: 300.0,
  d_max_mps2: 0.01,
  pc_threshold: 1e-4,
  top_k: 10,
};

export async function runVVSelfTest(): Promise<SelfTestResponse | null> {
  return fetchWithTimeout<SelfTestResponse>('/api/vv/selftest', {}, 30000);
}

export async function runVVPipeline(
  req: Partial<PipelineRequest> = {}
): Promise<PipelineResponse | null> {
  return fetchWithTimeout<PipelineResponse>(
    '/api/vv/pipeline',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    20000
  );
}

export async function validateCDM(cdmText: string): Promise<CDMValidationResponse | null> {
  return fetchWithTimeout<CDMValidationResponse>(
    '/api/vv/validate-cdm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cdmText }),
    },
    DEFAULT_TIMEOUT
  );
}

export interface EPGNode {
  id: string;
  label: string;
  type: 'concept' | 'rule' | 'instance';
  properties: Record<string, unknown>;
  description?: string;
}

export interface EPGEdge {
  source: string;
  target: string;
  relation: string;
  properties?: Record<string, unknown>;
}

export interface EPGReasoningState {
  clm_vector: {
    id: number;
    label: string;
    category: string;
    delta_v_mps: number;
    direction_rtn: number[];
    confidence: number;
    score: number;
  };
  propellant_evaluation: {
    node_id: string;
    rule_id: string;
    initial_propellant_kg: number;
    consumed_propellant_kg: number | null;
    remaining_propellant_kg: number;
    delta_v_required_mps: number;
    delta_v_allowable_mps: number;
    margin_mps: number;
    status: 'PASSED' | 'VIOLATED';
  };
  thrust_evaluation: {
    node_id: string;
    rule_id: string;
    max_thrust_n: number;
    max_acceleration_mps2: number;
    burn_time_s: number | null;
    max_allowable_burn_time_s: number;
    margin_s: number;
    status: 'PASSED' | 'VIOLATED';
  };
  rule_results: Array<{
    id: string;
    name: string;
    passed: boolean;
    value: number;
    limit: number;
    unit: string;
    detail: string;
  }>;
  verdict: 'ACCEPTED' | 'PRUNED';
  pruning_stats?: {
    total_candidates_screened: number;
    candidates_pruned: number;
    selected_rank_index: number;
  };
}

export interface EPGGraphResponse {
  nodes: EPGNode[];
  edges: EPGEdge[];
  reasoning_state: EPGReasoningState;
  schema: Record<string, unknown>;
  graph: {
    nodes: EPGNode[];
    edges: EPGEdge[];
  };
  summary: {
    total_nodes: number;
    concept_nodes: number;
    rule_nodes: number;
    instance_nodes: number;
    total_edges: number;
    evaluation_verdict: string;
  };
}

export async function fetchEPGGraph(
  params?: Record<string, unknown>
): Promise<EPGGraphResponse | null> {
  const query = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params)
          .filter(([_, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';
  return fetchWithTimeout<EPGGraphResponse>(`/api/epg/graph${query}`, {}, DEFAULT_TIMEOUT);
}
