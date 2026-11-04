"""V&V Pipeline orchestration module."""

import math
import time
import uuid
from datetime import datetime, timezone
import numpy as np

from ..cara_engine import CARAEngine
from ..clm_engine import CLMEngine
from .physics_validator import validate_candidates
from .hj_reachability import solve_hj_reachability
from .cbf_filter import run_cbf_filter


DEFAULT_PIPELINE_PARAMS = {
    "tca_s": 40.0,
    "miss_xi_m": 160.0,
    "miss_zeta_m": 120.0,
    "rel_velocity_km_s": 11.0,
    "debris_mass_kg": 45.0,
    "sigma_xi_m": 120.0,
    "sigma_zeta_m": 60.0,
    "rho": 0.2,
    "hard_body_radius_m": 15.0,
    "sat_mass_kg": 150.0,
    "propellant_mass_kg": 2.0,
    "isp_s": 220.0,
    "max_thrust_n": 22.0,
    "altitude_km": 550.0,
    "min_perigee_km": 300.0,
    "d_max_mps2": 0.01,
    "pc_threshold": 1e-4,
    "top_k": 10,
}


def sanitize_json(obj):
    """Recursively convert numpy types to native Python types, replacing non-finite with None."""
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, (np.floating, float)):
        val = float(obj)
        return val if math.isfinite(val) else None
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return [sanitize_json(x) for x in obj.tolist()]
    elif isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_json(v) for v in obj]
    return obj


def run_vv_pipeline(user_params: dict | None = None, cara_engine: CARAEngine | None = None, clm_engine: CLMEngine | None = None) -> dict:
    """Execute the full V&V pipeline from collision assessment to verification verdict."""
    total_start = time.perf_counter()

    # Merge inputs with defaults
    params = dict(DEFAULT_PIPELINE_PARAMS)
    if user_params:
        params.update({k: v for k, v in user_params.items() if v is not None})

    tca_s = float(params["tca_s"])
    miss_xi = float(params["miss_xi_m"])
    miss_zeta = float(params["miss_zeta_m"])
    rel_vel = float(params["rel_velocity_km_s"])
    debris_mass = float(params["debris_mass_kg"])
    sigma_xi = float(params["sigma_xi_m"])
    sigma_zeta = float(params["sigma_zeta_m"])
    rho = float(params["rho"])
    hbr_m = float(params["hard_body_radius_m"])
    sat_mass = float(params["sat_mass_kg"])
    prop_mass = float(params["propellant_mass_kg"])
    isp = float(params["isp_s"])
    max_thrust = float(params["max_thrust_n"])
    d_max = float(params["d_max_mps2"])
    pc_threshold = float(params["pc_threshold"])

    cara = cara_engine or CARAEngine()
    clm = clm_engine or CLMEngine()

    # Derived physics quantities
    u_max = max_thrust / sat_mass if sat_mass > 0.0 else 0.0
    if sat_mass > prop_mass and prop_mass > 0.0:
        dv_avail = isp * 9.80665 * math.log(sat_mass / (sat_mass - prop_mass))
    else:
        dv_avail = 0.0

    miss_vec = np.array([miss_xi, miss_zeta], dtype=float)
    miss_m = float(np.linalg.norm(miss_vec))

    cov_2x2 = np.array([
        [sigma_xi ** 2, rho * sigma_xi * sigma_zeta],
        [rho * sigma_xi * sigma_zeta, sigma_zeta ** 2]
    ], dtype=float)

    # Stage 1: Assess initial risk
    t0 = time.perf_counter()
    pc_pre = float(cara.compute_probability(miss_vec, cov_2x2, hbr_m))
    triggered = bool(pc_pre >= pc_threshold)
    t_assess = (time.perf_counter() - t0) * 1000.0

    # Stage 2: CLM candidate generation
    t0 = time.perf_counter()
    telemetry = [tca_s, miss_m / 1000.0, rel_vel, debris_mass]
    candidates = clm.rank_candidates(telemetry)
    t_clm = (time.perf_counter() - t0) * 1000.0

    # Stage 3: Physics validation (rule graph)
    t0 = time.perf_counter()
    (
        val_candidates,
        selected_candidate,
        evaluated_count,
        rejected_count,
        selected_index,
    ) = validate_candidates(candidates, params, cov_2x2)
    t_val = (time.perf_counter() - t0) * 1000.0

    # Stage 4: Hamilton-Jacobi Reachability
    t0 = time.perf_counter()
    if selected_candidate is not None:
        dv = float(selected_candidate["delta_v_mps"])
        dir_rtn = selected_candidate["direction_rtn"]
        dv_lat = dv * np.array([float(dir_rtn[0]), float(dir_rtn[2])], dtype=float)
        t_burn = dv / u_max if u_max > 0.0 else 0.0
        p_tca = miss_vec + dv_lat * max(0.0, tca_s - 0.5 * t_burn)
        post_miss_norm = float(np.linalg.norm(p_tca))
        dv_lat_norm = float(np.linalg.norm(dv_lat))
    else:
        p_tca = miss_vec.copy()
        post_miss_norm = miss_m
        dv_lat_norm = 0.0

    hj_results = solve_hj_reachability(
        miss_norm_m=miss_m,
        p_tca_norm_m=post_miss_norm,
        dv_lat_norm_mps=dv_lat_norm,
        u_max_mps2=u_max,
        d_max_mps2=d_max,
        hard_body_radius_m=hbr_m,
        horizon_s=tca_s,
    )
    t_hj = (time.perf_counter() - t0) * 1000.0

    # Stage 5: Control Barrier Function (CBF) Filter
    t0 = time.perf_counter()
    cbf_results = run_cbf_filter(
        miss_vec=miss_vec,
        cov_2x2=cov_2x2,
        u_max_mps2=u_max,
        d_max_mps2=d_max,
        tca_s=tca_s,
        hard_body_radius_m=hbr_m,
        pc_threshold=pc_threshold,
        selected_candidate=selected_candidate,
        cara_engine=cara,
    )
    t_cbf = (time.perf_counter() - t0) * 1000.0

    final_p_f = cbf_results.pop("_final_p_f", p_tca)
    miss_post_m = float(np.linalg.norm(final_p_f))
    pc_post = float(cbf_results["final_pc_filtered"])

    # Stage 6: Verdict synthesis
    maneuver_certified = hj_results["maneuver_certified"]
    forward_invariant = cbf_results["forward_invariant"]

    reasons = []
    if not triggered:
        status = "NO_ACTION_REQUIRED"
        reasons.append(f"Initial collision probability ({pc_pre:.2e}) is below safety threshold ({pc_threshold:.2e}).")
    elif selected_candidate is None:
        status = "ABORT_NO_SAFE_MANEUVER"
        reasons.append(f"All {evaluated_count} candidate maneuvers were rejected by physics validation rules.")
    elif maneuver_certified and forward_invariant:
        status = "EXECUTE"
        reasons.append(f"Selected maneuver {selected_candidate['label']} certified by HJ reachability (guaranteed miss {hj_results['maneuver_guaranteed_miss_m']:.1f} m > 0).")
        reasons.append(f"CBF safety envelope verified forward invariant (min h after entry = {cbf_results['min_h_after_entry']:.4f} >= 0).")
    else:
        status = "UNVERIFIED"
        if not maneuver_certified:
            reasons.append("HJ reachability certification failed under worst-case disturbance.")
        if not forward_invariant:
            reasons.append("CBF filter safety barrier forward invariance could not be certified.")

    total_time = (time.perf_counter() - total_start) * 1000.0

    response = {
        "run_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "inputs": sanitize_json(params),
        "derived": {
            "u_max_mps2": float(round(u_max, 4)),
            "dv_available_mps": float(round(dv_avail, 2)),
            "miss_m": float(round(miss_m, 2)),
            "covariance_2x2": [
                [float(round(cov_2x2[0, 0], 2)), float(round(cov_2x2[0, 1], 2))],
                [float(round(cov_2x2[1, 0], 2)), float(round(cov_2x2[1, 1], 2))],
            ],
        },
        "assessment": {
            "pc_pre": float(pc_pre),
            "pc_post": float(pc_post),
            "threshold": float(pc_threshold),
            "triggered": bool(triggered),
            "method": "Foster 1992 2D B-plane (numerical polar quadrature)",
            "miss_post_m": float(round(miss_post_m, 2)),
            "miss_vector_pre_m": [float(round(miss_xi, 2)), float(round(miss_zeta, 2))],
            "miss_vector_post_m": [float(round(float(final_p_f[0]), 2)), float(round(float(final_p_f[1]), 2))],
        },
        "validation": {
            "engine": "EPG/KGDSL-style rule graph (in-process)",
            "evaluated": int(evaluated_count),
            "rejected": int(rejected_count),
            "selected_index": selected_index,
            "candidates": sanitize_json(val_candidates),
        },
        "selected": sanitize_json(selected_candidate),
        "hj": hj_results,
        "cbf": cbf_results,
        "verdict": {
            "status": status,
            "reasons": reasons,
        },
        "stage_timings_ms": {
            "assess": float(round(t_assess, 2)),
            "clm": float(round(t_clm, 2)),
            "validation": float(round(t_val, 2)),
            "hj": float(round(t_hj, 2)),
            "cbf": float(round(t_cbf, 2)),
            "total": float(round(total_time, 2)),
        },
    }

    return sanitize_json(response)
