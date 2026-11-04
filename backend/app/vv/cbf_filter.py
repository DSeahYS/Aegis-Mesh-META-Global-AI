"""Robust High-Order Control Barrier Function (HOCBF) filter in the 2D B-plane.

Relative degree 2 formulation with disturbance robustness:
h(p) = p^T M p - k^2
h_ddot + (alpha1 + alpha2)*h_dot + alpha1*alpha2*h >= 0
Robust constraint: a^T u >= b, a = 2Mp, b = -2 p_dot^T M p_dot - (alpha1+alpha2)*h_dot - alpha1*alpha2*h + ||a||*d_max.

Enforces safety envelope via closed-form projection (equivalent to QP for single constraint).
Safety certificate evaluates forward invariance check (simulation-verified, not formally proven due to thrust clipping).
"""

import numpy as np
from .physics_validator import compute_keepout_k


def run_cbf_simulation(
    miss_vec: np.ndarray,
    cov_2x2: np.ndarray,
    u_max: float,
    d_max: float,
    tca_s: float,
    k_keepout: float,
    selected_candidate: dict | None,
    use_cbf: bool,
    dt_s: float = 0.05,
    alpha1: float = 0.6,
    alpha2: float = 0.6,
):
    """Run closed-loop simulation over [0, tca_s] with semi-implicit Euler integration."""
    M = np.linalg.pinv(cov_2x2)
    k2 = k_keepout ** 2

    p = np.array(miss_vec, dtype=float)
    p_dot = np.zeros(2, dtype=float)

    if selected_candidate is not None:
        dv = float(selected_candidate["delta_v_mps"])
        dir_rtn = selected_candidate["direction_rtn"]
        dir_lat = np.array([float(dir_rtn[0]), float(dir_rtn[2])], dtype=float)
        norm_dir_lat = np.linalg.norm(dir_lat)
        if norm_dir_lat > 1e-8:
            dir_lat = dir_lat / norm_dir_lat
        t_burn = dv / u_max if u_max > 0.0 else 0.0
    else:
        dv = 0.0
        dir_lat = np.zeros(2)
        t_burn = 0.0

    steps = min(500, max(1, int(round(abs(tca_s) / dt_s))))
    dt_actual = tca_s / steps if steps > 0 else 0.0

    t_hist = []
    p_hist = []
    h_hist = []
    u_hist = []
    interventions = 0
    saturated_steps = 0

    for step in range(steps + 1):
        t = step * dt_actual
        h = float(p @ M @ p - k2)
        t_hist.append(t)
        p_hist.append(p.copy())
        h_hist.append(h)

        if step == steps:
            break

        # Nominal controller
        if selected_candidate is not None and t < t_burn:
            u_nom = u_max * dir_lat
        else:
            u_nom = -0.02 * (p - miss_vec) - 0.3 * p_dot
            norm_u_nom = np.linalg.norm(u_nom)
            if norm_u_nom > u_max:
                u_nom = u_nom * (u_max / norm_u_nom)

        # Worst-case disturbance pushing toward debris corridor
        norm_p = np.linalg.norm(p)
        if norm_p > 1e-8:
            d = -d_max * (p / norm_p)
        else:
            d = np.zeros(2)

        if use_cbf:
            h_dot = 2.0 * float(p @ M @ p_dot)
            a = 2.0 * (M @ p)
            norm_a = float(np.linalg.norm(a))
            b = (
                -2.0 * float(p_dot @ M @ p_dot)
                - (alpha1 + alpha2) * h_dot
                - (alpha1 * alpha2) * h
                + norm_a * d_max
            )

            # Closed-form projection (equivalent to QP for single constraint)
            a_dot_u = float(np.dot(a, u_nom))
            if a_dot_u >= b:
                u = u_nom
            else:
                interventions += 1
                if norm_a > 1e-8:
                    u = u_nom + ((b - a_dot_u) / (norm_a ** 2)) * a
                else:
                    u = u_nom

            # Note: Clipping thrust to u_max breaks the formal CBF guarantee. A feasibility check or slack variable would be needed for formal guarantees.
            norm_u = float(np.linalg.norm(u))
            if norm_u > u_max and norm_u > 1e-8:
                saturated_steps += 1
                u = u * (u_max / norm_u)
        else:
            u = u_nom

        u_hist.append(float(np.linalg.norm(u)))

        # Semi-implicit Euler
        accel = u + d
        p_dot = p_dot + accel * dt_actual
        p = p + p_dot * dt_actual

    return (
        np.array(t_hist),
        np.array(p_hist),
        np.array(h_hist),
        np.array(u_hist),
        interventions,
        saturated_steps,
    )


def run_cbf_filter(
    miss_vec: np.ndarray,
    cov_2x2: np.ndarray,
    u_max_mps2: float,
    d_max_mps2: float,
    tca_s: float,
    hard_body_radius_m: float,
    pc_threshold: float,
    selected_candidate: dict | None,
    cara_engine,
    dt_s: float = 0.05,
    alpha1: float = 0.6,
    alpha2: float = 0.6,
) -> dict:
    """Run dual simulation (filtered and nominal) and return CBF analysis results.

    Enforces safety envelope via closed-form projection (equivalent to QP for single constraint).
    Evaluates forward invariance check (simulation-verified, not formally proven due to thrust clipping).
    """
    k_keepout = compute_keepout_k(cov_2x2, hard_body_radius_m, pc_threshold)

    # 1. Filtered run
    t_f, p_f, h_f, u_f, interv, sat = run_cbf_simulation(
        miss_vec=miss_vec,
        cov_2x2=cov_2x2,
        u_max=u_max_mps2,
        d_max=d_max_mps2,
        tca_s=tca_s,
        k_keepout=k_keepout,
        selected_candidate=selected_candidate,
        use_cbf=True,
        dt_s=dt_s,
        alpha1=alpha1,
        alpha2=alpha2,
    )

    # 2. Nominal (unfiltered) run
    t_nom, p_nom, h_nom, u_nom, _, _ = run_cbf_simulation(
        miss_vec=miss_vec,
        cov_2x2=cov_2x2,
        u_max=u_max_mps2,
        d_max=d_max_mps2,
        tca_s=tca_s,
        k_keepout=k_keepout,
        selected_candidate=selected_candidate,
        use_cbf=False,
        dt_s=dt_s,
        alpha1=alpha1,
        alpha2=alpha2,
    )

    # Safe set entry and forward invariance check (simulation-verified, not formally proven due to thrust clipping)
    entered_indices = np.where(h_f >= 0.0)[0]
    slack = -1e-6 * (k_keepout ** 2)

    if len(entered_indices) > 0:
        entry_idx = int(entered_indices[0])
        entered_safe_set_at_s = float(round(float(t_f[entry_idx]), 2))
        min_h_after_entry = float(round(float(np.min(h_f[entry_idx:])), 6))
        forward_invariant = bool(min_h_after_entry >= slack)
    else:
        entered_safe_set_at_s = None
        min_h_after_entry = float(round(float(np.min(h_f)), 6))
        forward_invariant = False

    nom_entered_indices = np.where(h_nom >= 0.0)[0]
    if len(nom_entered_indices) > 0:
        nom_entry_idx = int(nom_entered_indices[0])
        nom_min_h_after = float(round(float(np.min(h_nom[nom_entry_idx:])), 6))
    else:
        nom_min_h_after = float(round(float(np.min(h_nom)), 6))

    # Final collision probabilities
    final_p_f = p_f[-1]
    final_p_nom = p_nom[-1]
    final_pc_filtered = float(cara_engine.compute_probability(final_p_f, cov_2x2, hard_body_radius_m))
    final_pc_nominal = float(cara_engine.compute_probability(final_p_nom, cov_2x2, hard_body_radius_m))

    # Subsample to <= 201 samples
    n_points = len(t_f)
    step_sub = max(1, (n_points - 1) // 200 + 1)
    sample_indices = list(range(0, n_points - 1, step_sub)) + [n_points - 1]
    # Remove duplicates preserving order
    sample_indices = sorted(list(set(sample_indices)))

    t_s = [float(round(t_f[i], 3)) for i in sample_indices]
    h_filtered = [float(round(h_f[i], 4)) for i in sample_indices]
    h_nominal = [float(round(h_nom[i], 4)) for i in sample_indices]
    miss_filtered_m = [float(round(float(np.linalg.norm(p_f[i])), 2)) for i in sample_indices]
    miss_nominal_m = [float(round(float(np.linalg.norm(p_nom[i])), 2)) for i in sample_indices]

    # For u, length was n_points - 1, extend last value for plotting
    u_f_ext = np.append(u_f, u_f[-1]) if len(u_f) > 0 else np.zeros(n_points)
    u_nom_ext = np.append(u_nom, u_nom[-1]) if len(u_nom) > 0 else np.zeros(n_points)
    u_filtered_norm = [float(round(u_f_ext[i], 4)) for i in sample_indices]
    u_nominal_norm = [float(round(u_nom_ext[i], 4)) for i in sample_indices]

    return {
        "keepout_k": float(round(k_keepout, 2)),
        "alpha1": float(alpha1),
        "alpha2": float(alpha2),
        "t_s": t_s,
        "h_filtered": h_filtered,
        "h_nominal": h_nominal,
        "miss_filtered_m": miss_filtered_m,
        "miss_nominal_m": miss_nominal_m,
        "u_filtered_norm": u_filtered_norm,
        "u_nominal_norm": u_nominal_norm,
        "interventions": int(interv),
        "saturated_steps": int(sat),
        "entered_safe_set_at_s": entered_safe_set_at_s,
        "min_h_after_entry": min_h_after_entry,
        "forward_invariant": forward_invariant,
        "nominal_min_h_after_entry": nom_min_h_after,
        "final_pc_filtered": final_pc_filtered,
        "final_pc_nominal": final_pc_nominal,
        "_final_p_f": final_p_f,
    }
