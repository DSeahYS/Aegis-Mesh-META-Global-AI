"""Verification & Validation (V&V) package for AEGIS-MESH."""

from .pipeline import run_vv_pipeline
from .selftest import run_selftest
from .cdm_validator import validate_cdm
from .physics_validator import evaluate_candidate, validate_candidates, compute_keepout_k
from .hj_reachability import solve_hj_reachability, solve_hj_grid
from .cbf_filter import run_cbf_filter
from .epg import build_epg_knowledge_graph, EPG_SCHEMA

__all__ = [
    "run_vv_pipeline",
    "run_selftest",
    "validate_cdm",
    "evaluate_candidate",
    "validate_candidates",
    "compute_keepout_k",
    "solve_hj_reachability",
    "solve_hj_grid",
    "run_cbf_filter",
    "build_epg_knowledge_graph",
    "EPG_SCHEMA",
]
