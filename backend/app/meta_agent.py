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


def run_vision_segment(prompts: list, frame_ref: Optional[str] = None) -> dict:
    """SAM 3.1 segmentation seam with a deterministic offline stub.

    The hosted SAM 3.1 endpoint is not wired to a live star-tracker frame
    pipeline yet, so this returns stable placeholder segments (same input ->
    same output) instead of pretending to segment. Wire the real provider
    behind this function when a frame source exists.
    """
    import hashlib

    segments = []
    for i, prompt in enumerate(prompts):
        seed = int(hashlib.sha256(str(prompt).encode()).hexdigest()[:8], 16)
        x = 0.08 + 0.70 * ((seed % 997) / 997.0)
        y = 0.08 + 0.70 * (((seed // 997) % 991) / 991.0)
        w = 0.10 + 0.25 * (((seed // 7919) % 89) / 89.0)
        h = 0.10 + 0.25 * (((seed // 104729) % 83) / 83.0)
        segments.append(
            {
                "prompt": str(prompt),
                "tracklet_id": f"RSO-STUB-{i:02d}",
                "bbox_norm": [round(x, 3), round(y, 3), round(w, 3), round(h, 3)],
                "area_frac": round(w * h, 4),
                "confidence": None,
            }
        )
    return {
        "provider": "sam-3.1-offline-stub",
        "frame_ref": frame_ref,
        "segments": segments,
        "note": (
            "Deterministic offline stub (no live SAM 3.1 call was made). "
            "Replace the provider behind run_vision_segment with the Meta "
            "SAM 3.1 endpoint when a star-tracker frame source is configured."
        ),
    }
