"""EPG/KGDSL-style rule graph (in-process) physics validator.

Assumptions:
- Short horizon (TCA <= a few minutes << orbital period) => B-plane lateral motion is a double integrator.
- Encounter frame: xi ≈ R (radial), zeta ≈ N (cross-track).
- Along-track (T) delta_v does not change lateral miss within the short encounter horizon.
"""

import numpy as np


def compute_keepout_k(cov_2x2: np.ndarray, hard_body_radius_m: float, pc_threshold: float) -> float:
    """Compute keep-out ellipse scaling factor k:
    k^2 = 2 * ln(R^2 / (2 * sqrt(|C|) * pc_threshold)), k=0 if arg <= 1.
    """
    det_c = float(np.linalg.det(cov_2x2))
    if not np.isfinite(det_c) or det_c <= 0.0 or pc_threshold <= 0.0 or hard_body_radius_m <= 0.0:
        return 0.0
    denom = 2.0 * np.sqrt(det_c) * float(pc_threshold)
    if denom <= 0.0 or not np.isfinite(denom):
        return 0.0
    arg = (float(hard_body_radius_m) ** 2) / denom
    if not np.isfinite(arg) or arg <= 1.0:
        return 0.0
    log_arg = np.log(arg)
    if not np.isfinite(log_arg) or log_arg <= 0.0:
        return 0.0
    k_val = float(np.sqrt(2.0 * log_arg))
    return k_val if np.isfinite(k_val) else 0.0


def evaluate_orbit_perigee(altitude_km: float, dv_mps: float, direction_rtn: list[float]) -> float:
    """Compute post-maneuver perigee altitude (km) using two-body orbital dynamics.
    
    mu = 398600.4418 km^3/s^2, Re = 6378.137 km.
    Initial orbit is circular at altitude_km.
    """
    mu = 398600.4418
    re = 6378.137
    r0 = max(1.0, re + (float(altitude_km) if np.isfinite(altitude_km) else 500.0))
    v0 = np.sqrt(mu / r0)

    if not (direction_rtn and np.all(np.isfinite(direction_rtn))):
        dir_u = np.array([0.0, 1.0, 0.0])
    else:
        dir_norm = np.linalg.norm(direction_rtn)
        if dir_norm < 1e-8 or not np.isfinite(dir_norm):
            dir_u = np.array([0.0, 1.0, 0.0])
        else:
            dir_u = np.asarray(direction_rtn, dtype=float) / dir_norm

    dv_val = float(dv_mps) if np.isfinite(dv_mps) else 0.0
    dv_km_s = (dv_val / 1000.0) * dir_u
    v_r = dv_km_s[0]
    v_t = v0 + dv_km_s[1]
    v_n = dv_km_s[2]

    v_sq = v_r ** 2 + v_t ** 2 + v_n ** 2
    eps = 0.5 * v_sq - mu / r0
    h = r0 * np.sqrt(v_t ** 2 + v_n ** 2)

    if eps >= 0.0:
        # Parabolic/hyperbolic escape: periapsis is p / (1 + e)
        p = (h ** 2) / mu
        e_sq = max(0.0, 1.0 + (2.0 * eps * (h ** 2)) / (mu ** 2))
        e = np.sqrt(e_sq)
        r_p = p / (1.0 + e) if (1.0 + e) > 0.0 and p > 1e-6 else r0
    else:
        a = -mu / (2.0 * eps)
        e_sq = max(0.0, 1.0 - (h ** 2) / (mu * a))
        e = np.sqrt(e_sq)
        r_p = a * (1.0 - e)

    perigee_alt_km = r_p - re
    return float(perigee_alt_km) if np.isfinite(perigee_alt_km) else 0.0


def evaluate_candidate(candidate: dict, params: dict, k_keepout: float, inv_cov_2x2: np.ndarray) -> dict:
    """Evaluate declarative rules R1..R5 for a single candidate maneuver."""
    sat_mass = float(params["sat_mass_kg"])
    prop_mass = float(params["propellant_mass_kg"])
    isp = float(params["isp_s"])
    max_thrust = float(params["max_thrust_n"])
    tca_s = float(params["tca_s"])
    alt_km = float(params["altitude_km"])
    min_perigee = float(params["min_perigee_km"])
    miss_vec = np.array([float(params["miss_xi_m"]), float(params["miss_zeta_m"])], dtype=float)
    hbr_m = float(params["hard_body_radius_m"])

    # Note: Using total current mass for burn time calculation (not m_dry)
    u_max = max_thrust / sat_mass
    if sat_mass > prop_mass and prop_mass > 0.0:
        dv_avail = isp * 9.80665 * np.log(sat_mass / (sat_mass - prop_mass))
    else:
        dv_avail = 0.0

    dv = float(candidate["delta_v_mps"])
    dir_rtn = [float(x) for x in candidate["direction_rtn"]]
    t_burn = dv / u_max if u_max > 0.0 else float("inf")

    # Lateral burn: encounter frame xi ≈ R (dir_rtn[0]), zeta ≈ N (dir_rtn[2])
    dv_lat = dv * np.array([dir_rtn[0], dir_rtn[2]], dtype=float)
    coast_time = max(0.0, tca_s - 0.5 * t_burn)
    p_tca = miss_vec + dv_lat * coast_time
    norm_p_tca = float(np.linalg.norm(p_tca))
    norm_miss = float(np.linalg.norm(miss_vec))

    # Post-maneuver Mahalanobis distance
    mahal_val = float(p_tca @ inv_cov_2x2 @ p_tca) if np.all(np.isfinite(p_tca)) and np.all(np.isfinite(inv_cov_2x2)) else 0.0
    mahal_post = float(np.sqrt(max(0.0, mahal_val))) if np.isfinite(mahal_val) else 0.0

    rules = []

    # R1: PROPELLANT_BUDGET
    limit_r1 = 0.9 * dv_avail
    passed_r1 = dv <= limit_r1
    rules.append({
        "id": "R1",
        "name": "PROPELLANT_BUDGET",
        "passed": bool(passed_r1),
        "value": float(round(dv, 2)),
        "limit": float(round(limit_r1, 2)),
        "unit": "m/s",
        "detail": f"Required Delta-V {dv:.2f} m/s vs allowable budget {limit_r1:.2f} m/s (10% reserve of {dv_avail:.2f} m/s available)",
    })

    # R2: BURN_TIME_FEASIBLE
    # Assumed parameter — typical thruster thermal limit
    t_limit_thermal = 300.0
    limit_r2 = max(0.0, min(tca_s - 5.0, t_limit_thermal))
    passed_r2 = t_burn <= limit_r2
    rules.append({
        "id": "R2",
        "name": "BURN_TIME_FEASIBLE",
        "passed": bool(passed_r2),
        "value": float(round(t_burn, 2)) if np.isfinite(t_burn) else None,
        "limit": float(round(limit_r2, 2)),
        "unit": "s",
        "detail": f"Burn duration {t_burn:.2f} s vs allowable window {limit_r2:.2f} s (TCA={tca_s:.1f} s minus 5.0 s slew allowance)",
    })

    # R3: MIN_PERIGEE
    perigee_alt = evaluate_orbit_perigee(alt_km, dv, dir_rtn)
    passed_r3 = perigee_alt >= min_perigee
    rules.append({
        "id": "R3",
        "name": "MIN_PERIGEE",
        "passed": bool(passed_r3),
        "value": float(round(perigee_alt, 2)) if np.isfinite(perigee_alt) else None,
        "limit": float(round(min_perigee, 2)),
        "unit": "km",
        "detail": f"Post-burn perigee altitude {perigee_alt:.2f} km vs minimum safe perigee {min_perigee:.2f} km",
    })

    # R4: THRUST_VECTOR_VALID
    dir_norm = float(np.linalg.norm(dir_rtn))
    passed_r4 = bool(np.all(np.isfinite(dir_rtn)) and abs(dir_norm - 1.0) < 1e-6)
    rules.append({
        "id": "R4",
        "name": "THRUST_VECTOR_VALID",
        "passed": passed_r4,
        "value": float(round(dir_norm, 6)),
        "limit": 1.0,
        "unit": "norm",
        "detail": f"Thrust direction vector norm {dir_norm:.6f} (|norm - 1.0| < 1e-6)",
    })

    # R5: RISK_REDUCTION (orchestrator amendment)
    passed_r5 = bool(mahal_post >= k_keepout and norm_p_tca >= norm_miss + 1.0 and norm_p_tca > hbr_m)
    rules.append({
        "id": "R5",
        "name": "RISK_REDUCTION",
        "passed": passed_r5,
        "value": float(round(mahal_post, 4)),
        "limit": float(round(k_keepout, 4)),
        "unit": "sigma",
        "detail": f"Post-maneuver Mahalanobis distance {mahal_post:.3f} sigma vs keep-out threshold {k_keepout:.3f} sigma (|p_tca|={norm_p_tca:.1f} m vs initial {norm_miss:.1f} m)",
    })

    accepted = all(r["passed"] for r in rules)

    evaluated_candidate = dict(candidate)
    evaluated_candidate["accepted"] = bool(accepted)
    evaluated_candidate["rules"] = rules
    return evaluated_candidate


def validate_candidates(candidates: list[dict], params: dict, cov_2x2: np.ndarray):
    """Iterate CLM candidates in rank order, evaluating rules.
    
    Evaluates at least top_k candidates; continues until first accepted candidate (cap 256).
    Returns:
        (evaluated_candidates, selected_candidate, evaluated_count, rejected_count, selected_index)
    """
    hbr_m = float(params["hard_body_radius_m"])
    pc_threshold = float(params["pc_threshold"])
    top_k = int(params.get("top_k", 10))

    k_keepout = compute_keepout_k(cov_2x2, hbr_m, pc_threshold)
    inv_cov_2x2 = np.linalg.pinv(cov_2x2)

    evaluated_candidates = []
    selected_candidate = None
    selected_rank_index = None

    for idx, cand in enumerate(candidates):
        eval_cand = evaluate_candidate(cand, params, k_keepout, inv_cov_2x2)
        evaluated_candidates.append(eval_cand)

        if eval_cand["accepted"] and selected_candidate is None:
            selected_candidate = eval_cand
            selected_rank_index = idx

        if len(evaluated_candidates) >= top_k and selected_candidate is not None:
            break
        if len(evaluated_candidates) >= 256:
            break

    evaluated_count = len(evaluated_candidates)
    rejected_count = sum(1 for c in evaluated_candidates if not c["accepted"])

    # Cap returned candidates to at most 25, always including the selected one
    if len(evaluated_candidates) > 25:
        if selected_rank_index is not None and selected_rank_index >= 25:
            returned_candidates = evaluated_candidates[:24] + [selected_candidate]
            selected_index = 24
        else:
            returned_candidates = evaluated_candidates[:25]
            selected_index = selected_rank_index
    else:
        returned_candidates = evaluated_candidates
        selected_index = selected_rank_index

    return returned_candidates, selected_candidate, evaluated_count, rejected_count, selected_index
