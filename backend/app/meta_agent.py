"""Meta neuro-symbolic agent: Muse directives grounded by V&V proof oracles.

Oracle-first design: every call runs the deterministic 5-stage V&V pipeline
(Foster Pc, retrieval, EPG physics rules, HJ reachability, CBF filter) and the
EPG knowledge graph BEFORE contacting the Meta Model API, so the model reasons
over verified proof state instead of raw telemetry.

Model routing: mode="fast" targets Muse Spark (tactical screening),
mode="deep" targets Muse Wonder (constellation-scale planning). The Meta Model
API is OpenAI-SDK compatible; endpoint and model ids are overridable via env.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from .vv.epg import build_epg_knowledge_graph
from .vv.pipeline import run_vv_pipeline

try:
    from openai import OpenAI
except ImportError:  # Optional dependency; live mode reports not-configured.
    OpenAI = None

DEFAULT_SPARK_MODEL = "muse-spark-1.3"
DEFAULT_WONDER_MODEL = "muse-wonder-1.0"
# Default from the hackathon brief; override with META_BASE_URL.
DEFAULT_BASE_URL = "https://api.meta.ai/v1"

SYSTEM_PROMPT = (
    "You are the AEGIS-MESH Autonomous Flight Director powered by Meta Muse. "
    "You NEVER hallucinate physics: you must strictly obey the Symbolic Physics "
    "Rule Graph (EPG), Hamilton-Jacobi-Isaacs (HJI) reachability margin, and "
    "High-Order Control Barrier Function (HOCBF) invariance certificates provided. "
    "If the verdict is ABORT_NO_SAFE_MANEUVER or UNVERIFIED, recommend holding "
    "and state which certificate failed."
)


class MetaAgentError(Exception):
    """Base error for Meta agent failures (model call errors map to HTTP 502)."""


class MetaAgentNotConfigured(MetaAgentError):
    """Live mode requested without API key or SDK (maps to HTTP 503)."""


def resolve_model(mode: str) -> str:
    """Map an agent mode to a Meta model id (env-overridable)."""
    if mode == "fast":
        return os.getenv("META_SPARK_MODEL", DEFAULT_SPARK_MODEL)
    if mode == "deep":
        return os.getenv("META_WONDER_MODEL", DEFAULT_WONDER_MODEL)
    raise ValueError(f"unknown mode {mode!r}: expected 'fast' or 'deep'")


def get_meta_client() -> Any:
    """Build an OpenAI-compatible Meta Model API client from environment."""
    if OpenAI is None:
        raise MetaAgentNotConfigured(
            "openai package is not installed; add it via backend/requirements.txt "
            "to enable live Meta agent mode."
        )
    api_key = os.getenv("META_API_KEY", "")
    if not api_key:
        raise MetaAgentNotConfigured(
            "META_API_KEY is not set; live Meta agent mode is unavailable."
        )
    return OpenAI(base_url=os.getenv("META_BASE_URL", DEFAULT_BASE_URL), api_key=api_key)


def build_agent_prompt(cdm_summary: str, vv_result: dict, epg_graph: dict) -> str:
    """Render verified V&V proof state as the model's user prompt."""
    verdict = vv_result.get("verdict", {}) or {}
    hj = vv_result.get("hj", {}) or {}
    cbf = vv_result.get("cbf", {}) or {}
    assessment = vv_result.get("assessment", {}) or {}
    selected = vv_result.get("selected") or {}
    reasoning = epg_graph.get("reasoning_state", {}) or {}
    prop_eval = reasoning.get("propellant_evaluation", {}) or {}
    thrust_eval = reasoning.get("thrust_evaluation", {}) or {}
    pruning = reasoning.get("pruning_stats", {}) or {}

    if selected:
        maneuver = f"{selected.get('label')} dv={selected.get('delta_v_mps')} m/s"
    else:
        maneuver = "none (all candidates pruned by physics rules)"

    lines = [
        f"CDM Event: {cdm_summary}",
        f"V&V Verdict: {verdict.get('status')}",
        *[f"  - {reason}" for reason in (verdict.get("reasons") or [])],
        f"Selected maneuver: {maneuver}",
        f"Pc pre={assessment.get('pc_pre')} post={assessment.get('pc_post')} "
        f"threshold={assessment.get('threshold')}",
        f"HJI Certified: {hj.get('maneuver_certified')} "
        f"(Guaranteed Miss: {hj.get('maneuver_guaranteed_miss_m')}m)",
        f"CBF Forward Invariant: {cbf.get('forward_invariant')} "
        f"(min h after entry: {cbf.get('min_h_after_entry')})",
        f"EPG Reasoning State: verdict={reasoning.get('verdict')}, "
        f"propellant={prop_eval.get('status')}, thrust={thrust_eval.get('status')}, "
        f"screened={pruning.get('total_candidates_screened')}",
        "Synthesize the flight-director decision strictly from these certificates.",
    ]
    return "\n".join(lines)


def run_neuro_symbolic_agent(
    cdm_summary: str,
    telemetry_params: Optional[dict] = None,
    mode: str = "fast",
    client: Any = None,
) -> dict:
    """Run oracle-first neuro-symbolic reasoning and return directive + proofs.

    Args:
        cdm_summary: Short human description of the conjunction event.
        telemetry_params: V&V pipeline overrides (same schema as /api/vv/pipeline).
        mode: 'fast' (Muse Spark) or 'deep' (Muse Wonder).
        client: Optional prebuilt OpenAI-compatible client (used by tests to
            avoid network); when None, a live client is built from environment.
    """
    model = resolve_model(mode)
    params = dict(telemetry_params) if telemetry_params else {}

    vv_result = run_vv_pipeline(params)
    epg_graph = build_epg_knowledge_graph(params=params)

    user_prompt = build_agent_prompt(cdm_summary, vv_result, epg_graph)
    live_client = client if client is not None else get_meta_client()
    try:
        completion = live_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
    except MetaAgentNotConfigured:
        raise
    except Exception as exc:
        raise MetaAgentError(f"Meta model call failed: {exc}") from exc

    return {
        "model": model,
        "mode": mode,
        "agent_directive": completion.choices[0].message.content,
        "vv_proof": vv_result,
        "epg": epg_graph,
    }


def _offline_directive(model: str, vv_result: dict, epg_graph: dict) -> str:
    """Deterministic fallback directive used when no live Meta call is possible."""
    verdict = vv_result.get("verdict", {}) or {}
    reasons = verdict.get("reasons") or []
    selected = vv_result.get("selected") or {}
    maneuver = (
        f"{selected.get('label')} dv={selected.get('delta_v_mps')} m/s"
        if selected
        else "none (all candidates pruned)"
    )
    return (
        "OFFLINE DIRECTIVE (deterministic fallback; no live Meta call was made). "
        f"Requested model: {model}. V&V verdict: {verdict.get('status')}. "
        f"Selected maneuver: {maneuver}. "
        f"Certificate summary: {'; '.join(reasons) if reasons else 'no reasons recorded'}. "
        "Hold this decision unless a certificate changes; configure META_API_KEY "
        "for live Muse reasoning."
    )


def run_flight_director(
    cdm_summary: str,
    telemetry_params: Optional[dict] = None,
    mode: str = "fast",
) -> dict:
    """Supervisory flight-director endpoint logic with honest offline fallback.

    Fast mode targets Muse Spark (tactical), deep mode Muse Wonder
    (constellation planning). On missing key/SDK or model-call failure this
    returns a deterministic offline directive grounded in the same oracle
    output instead of failing the request.
    """
    try:
        result = run_neuro_symbolic_agent(cdm_summary, telemetry_params, mode=mode)
        result["source"] = result["model"]
        return result
    except MetaAgentError:
        model = resolve_model(mode)
        params = dict(telemetry_params) if telemetry_params else {}
        vv_result = run_vv_pipeline(params)
        epg_graph = build_epg_knowledge_graph(params=params)
        return {
            "model": model,
            "mode": mode,
            "source": "offline-fallback",
            "agent_directive": _offline_directive(model, vv_result, epg_graph),
            "vv_proof": vv_result,
            "epg": epg_graph,
        }


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "evaluate_vv_pipeline",
            "description": "Run the deterministic 5-stage V&V pipeline and return Pc, Pc-max dilution, HJ and CBF certificates.",
            "parameters": {"type": "object", "properties": {"telemetry_params": {"type": "object"}}, "required": ["telemetry_params"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "refine_optical_tracklet_sam31",
            "description": "Segment a star-tracker frame and return centroid, angular uncertainty and covariance shrink scale.",
            "parameters": {"type": "object", "properties": {"prompts": {"type": "array", "items": {"type": "string"}}, "frame_ref": {"type": "string"}}, "required": ["prompts"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_eps_eclipse_budget",
            "description": "Evaluate Rule R6 EPS eclipse depth-of-discharge margin from the selected candidate rule results.",
            "parameters": {"type": "object", "properties": {"telemetry_params": {"type": "object"}}, "required": ["telemetry_params"]},
        },
    },
]


def _simulate_star_tracker_segment(prompt: str, frame_ref: Optional[str], index: int) -> dict:
    """Segment a deterministic synthetic star-tracker frame.

    This is a real threshold/centroid measurement on a generated 96x96 frame
    (star field + bright RSO streak), used when no live SAM 3.1 endpoint or
    camera frame is configured.  It is labelled as simulated everywhere.
    """
    import hashlib

    import numpy as np

    seed_material = f"{frame_ref or 'demo-frame'}::{prompt}".encode()
    seed = int(hashlib.sha256(seed_material).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    frame = rng.normal(18.0, 5.0, size=(96, 96))
    # Sparse star field.
    star_y, star_x = rng.integers(0, 96, size=28), rng.integers(0, 96, size=28)
    frame[star_y, star_x] += rng.uniform(45.0, 90.0, size=28)
    # Bright resident-space-object streak (the prompted tracklet).
    y0 = int(rng.integers(18, 72))
    x0 = int(rng.integers(8, 42))
    length = int(rng.integers(24, 44))
    slope = float(rng.uniform(-0.28, 0.28))
    xs, ys = [], []
    for k in range(length):
        x = x0 + k
        y = int(round(y0 + slope * k + rng.normal(0.0, 0.35)))
        if 0 <= x < 96 and 0 <= y < 96:
            frame[y, x] = 255.0
            xs.append(x)
            ys.append(y)
    mask = frame >= 200.0
    my, mx = np.nonzero(mask)
    if len(mx) == 0:  # pragma: no cover - streak injection guarantees pixels
        mx, my = np.array(xs), np.array(ys)
    cx, cy = float(np.mean(mx)), float(np.mean(my))
    w_px, h_px = int(np.max(mx) - np.min(mx) + 1), int(np.max(my) - np.min(my) + 1)
    spread_px = float(np.sqrt(np.var(mx) + np.var(my)))
    focal_px = 800.0
    angular_uncertainty_mrad = round(max(0.05, spread_px / focal_px * 1000.0), 3)
    snr = float((np.max(frame) - np.mean(frame)) / max(np.std(frame), 1e-6))
    confidence = round(float(min(0.99, max(0.55, 0.72 + snr / 90.0))), 3)
    return {
        "prompt": str(prompt),
        "tracklet_id": f"RSO-SIM-{index:02d}",
        "bbox_norm": [
            round(float(np.min(mx) / 96.0), 3),
            round(float(np.min(my) / 96.0), 3),
            round(float(w_px / 96.0), 3),
            round(float(h_px / 96.0), 3),
        ],
        "centroid_px": [round(cx, 2), round(cy, 2)],
        "mask_area_px": int(len(mx)),
        "angular_uncertainty_mrad": angular_uncertainty_mrad,
        "snr": round(snr, 2),
        "area_frac": round(float(len(mx) / frame.size), 4),
        "confidence": confidence,
    }


def run_vision_segment(prompts: list, frame_ref: Optional[str] = None) -> dict:
    """SAM 3.1 segmentation seam (simulated-frame provider when offline).

    When a live Meta SAM endpoint contract is configured this function is the
    single provider seam to replace.  Offline it measures a synthetic
    star-tracker frame (threshold + centroid + angular uncertainty) and
    returns a covariance shrink scale for the closed-loop director; it never
    fabricates a live SAM call.
    """
    segments = [
        _simulate_star_tracker_segment(str(prompt), frame_ref, i)
        for i, prompt in enumerate(prompts)
    ]
    mean_conf = (
        sum(float(s["confidence"]) for s in segments) / len(segments) if segments else 0.0
    )
    sigma_scale = 0.1 if mean_conf >= 0.8 else 0.35
    return {
        "provider": "sam31-offline-simulated",
        "frame_ref": frame_ref,
        "frame": {"width": 96, "height": 96, "source": "synthetic_star_tracker_frame"},
        "segments": segments,
        "covariance_refinement": {
            "sigma_scale": sigma_scale,
            "mean_confidence": round(float(mean_conf), 3),
            "mode": "simulated_sam31_covariance_shrink",
        },
        "note": (
            "Offline simulated SAM 3.1 seam: segments were measured on a "
            "synthetic star-tracker frame, not a live SAM 3.1 call. Wire the "
            "hosted SAM 3.1 endpoint behind run_vision_segment when available."
        ),
    }


def run_closed_loop_flight_director(
    cdm_summary: str,
    telemetry_params: Optional[dict] = None,
    mode: str = "fast",
) -> dict:
    """Closed-loop director: V&V -> (dilution ? SAM shrink) -> (abort ? longer TCA).

    Executes deterministic symbolic tools locally and records a tool trace.
    If the initial verdict is ABORT/UNVERIFIED, escalates lead time
    (120 s -> 240 s -> 600 s) and re-proves with the oracle; the final
    synthesis is escalated to Muse Wonder (deep) when a recovery succeeds.
    """
    params = dict(telemetry_params) if telemetry_params else {}
    tool_trace: list[dict] = []

    vv_result = run_vv_pipeline(params)
    assessment = vv_result.get("assessment", {}) or {}
    initial_status = (vv_result.get("verdict", {}) or {}).get("status")
    tool_trace.append(
        {
            "tool": "evaluate_vv_pipeline",
            "status": initial_status,
            "pc_pre": assessment.get("pc_pre"),
            "pc_max": assessment.get("pc_max"),
            "probability_dilution_risk": assessment.get("probability_dilution_risk"),
        }
    )

    vision_refinement = None
    if assessment.get("probability_dilution_risk"):
        vision = run_vision_segment(
            ["resident space object streak", "uncataloged debris tracklet"],
            frame_ref=str(params.get("frame_ref", "dilution-demo-frame")),
        )
        sigma_scale = float(vision["covariance_refinement"]["sigma_scale"])
        refined_params = dict(params)
        refined_params["sigma_xi_m"] = float(params.get("sigma_xi_m", 120.0)) * sigma_scale
        refined_params["sigma_zeta_m"] = float(params.get("sigma_zeta_m", 60.0)) * sigma_scale
        refined_vv = run_vv_pipeline(refined_params)
        refined_assessment = refined_vv.get("assessment", {}) or {}
        vision_refinement = {
            "provider": vision["provider"],
            "sigma_scale": sigma_scale,
            "segments": vision["segments"],
            "pc_before": assessment.get("pc_pre"),
            "pc_after_refinement": refined_assessment.get("pc_pre"),
        }
        tool_trace.append(
            {
                "tool": "refine_optical_tracklet_sam31",
                "provider": vision["provider"],
                "sigma_scale": sigma_scale,
                "pc_before": assessment.get("pc_pre"),
                "pc_after_refinement": refined_assessment.get("pc_pre"),
                "status": (refined_vv.get("verdict", {}) or {}).get("status"),
            }
        )
        params, vv_result = refined_params, refined_vv
        assessment = refined_assessment

    recovered = False
    if (vv_result.get("verdict", {}) or {}).get("status") in (
        "ABORT_NO_SAFE_MANEUVER",
        "UNVERIFIED",
    ):
        for candidate_tca in (90.0, 180.0, 360.0, 600.0):
            if candidate_tca <= float(params.get("tca_s", 40.0)):
                continue
            trial_params = {**params, "tca_s": candidate_tca}
            trial_vv = run_vv_pipeline(trial_params)
            trial_status = (trial_vv.get("verdict", {}) or {}).get("status")
            tool_trace.append(
                {
                    "tool": "evaluate_vv_pipeline",
                    "trial_tca_s": candidate_tca,
                    "status": trial_status,
                    "pc_post": (trial_vv.get("assessment", {}) or {}).get("pc_post"),
                }
            )
            if trial_status == "EXECUTE":
                params, vv_result = trial_params, trial_vv
                recovered = True
                mode = "deep"
                break

    # EPS eclipse budget check from the final selected candidate's R6 result.
    selected = vv_result.get("selected") or {}
    r6 = next((r for r in (selected.get("rules") or []) if r.get("id") == "R6"), None)
    tool_trace.append(
        {
            "tool": "check_eps_eclipse_budget",
            "status": "PASSED" if (r6 and r6.get("passed")) else ("VIOLATED" if r6 else "UNAVAILABLE"),
            "peak_dod_pct": (r6 or {}).get("value"),
            "limit_pct": (r6 or {}).get("limit"),
        }
    )

    result = run_flight_director(cdm_summary, params, mode=mode)
    result["initial_verdict"] = initial_status
    result["final_verdict"] = (result.get("vv_proof", {}).get("verdict", {}) or {}).get("status")
    result["recovered_with_extended_lead_time"] = recovered
    result["tool_trace"] = tool_trace
    result["tool_schemas"] = TOOL_SCHEMAS
    result["vision_refinement"] = vision_refinement
    return result
