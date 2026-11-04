"""Hamilton-Jacobi (HJ) Isaacs Reachability Certificate and BRT computation.

Solves the 1D lateral Isaacs differential game along the post-maneuver miss axis:
y_dot = v, v_dot = u + d, |u| <= u_max, |d| <= d_max.
Terminal cost l = |y| - R.

# Note: This implements a 2-state double integrator (y_dot = v, v_dot = u + d)
# with 3 control values ({-max, 0, +max}), suitable for bang-bang control.
# The README describes a 4-state HCW Isaacs PDE, which is a target for future work.
"""

import time
import numpy as np
from scipy.interpolate import RegularGridInterpolator


def solve_hj_grid(
    u_max: float,
    d_max: float,
    R: float,
    horizon_s: float,
    dt_s: float = 0.25,
    grid_n: int = 121,
    Y_m: float = 600.0,
    Vm_mps: float = 12.0,
):
    """Solve Isaacs HJ PDE via semi-Lagrangian dynamic programming on an N x N grid.
    
    Returns:
        (V, y_grid, v_grid, solve_ms)
        V has shape (N, N), indexing='ij' (axis 0 = y, axis 1 = v).
    """
    u_max = max(0.0, float(u_max)) if np.isfinite(u_max) else 0.0
    d_max = max(0.0, float(d_max)) if np.isfinite(d_max) else 0.0
    R = max(0.0, float(R)) if np.isfinite(R) else 0.0
    horizon_s = float(horizon_s) if np.isfinite(horizon_s) else 0.0
    dt_s = max(1e-4, float(dt_s)) if np.isfinite(dt_s) else 0.25
    grid_n = max(3, int(grid_n))
    Y_m = max(10.0, float(Y_m)) if np.isfinite(Y_m) else 600.0
    Vm_mps = max(1.0, float(Vm_mps)) if np.isfinite(Vm_mps) else 12.0

    y_arr = np.linspace(-Y_m, Y_m, grid_n)
    v_arr = np.linspace(-Vm_mps, Vm_mps, grid_n)
    Y_grid, V_grid = np.meshgrid(y_arr, v_arr, indexing="ij")

    # Terminal cost l = |y| - R
    V = np.abs(Y_grid) - R

    if horizon_s <= 0.0:
        return V, y_arr, v_arr, 0.0

    steps = min(200, max(1, int(round(horizon_s / dt_s))))
    dt_actual = horizon_s / steps

    u_set = np.array([-u_max, 0.0, u_max])
    d_set = np.array([-d_max, 0.0, d_max])

    U, D = np.meshgrid(u_set, d_set, indexing="ij")
    U_4d = U[:, :, None, None]
    D_4d = D[:, :, None, None]
    Y_4d = Y_grid[None, None, :, :]
    V_4d = V_grid[None, None, :, :]

    accel = U_4d + D_4d
    Y_next = Y_4d + V_4d * dt_actual + 0.5 * accel * (dt_actual ** 2)
    V_next = V_4d + accel * dt_actual
    flat_pts = np.stack([Y_next, V_next], axis=-1).reshape(-1, 2)

    t0 = time.perf_counter()
    for _ in range(steps):
        # TODO: Performance — reuse interpolator across steps
        interp = RegularGridInterpolator((y_arr, v_arr), V, method="linear", bounds_error=False, fill_value=None)
        vals = interp(flat_pts).reshape(3, 3, grid_n, grid_n)
        # Disturbance minimizes (axis 1), evader maximizes (axis 0)
        V = np.max(np.min(vals, axis=1), axis=0)
    t1 = time.perf_counter()
    solve_ms = (t1 - t0) * 1000.0

    return V, y_arr, v_arr, float(solve_ms)


def analytic_value_oracle(y: float, v: float, tau: float, u_max: float, d_max: float, R: float) -> float:
    """Analytic oracle: V*(y, v, tau) = max(|y + v*tau| + 0.5*(u_max - d_max)*tau^2, 0) - R."""
    val = abs(y + v * tau) + 0.5 * (u_max - d_max) * (tau ** 2)
    return float(max(val, 0.0) - R)


def solve_hj_reachability(
    miss_norm_m: float,
    p_tca_norm_m: float,
    dv_lat_norm_mps: float,
    u_max_mps2: float,
    d_max_mps2: float,
    hard_body_radius_m: float,
    horizon_s: float,
    dt_s: float = 0.25,
    grid_n: int = 121,
) -> dict:
    """Execute complete HJ reachability analysis and return response dictionary."""
    R = float(hard_body_radius_m)
    tau = float(horizon_s)
    u_max = float(u_max_mps2)
    d_max = float(d_max_mps2)

    # Choose sensible bounds: Y >= 2 * max(|miss|, |p_tca|) + 50, Vm >= max(|dv_lat|) + u_max * tau
    Y_m = max(500.0, 2.0 * max(miss_norm_m, p_tca_norm_m) + 100.0)
    Vm_mps = max(10.0, dv_lat_norm_mps + u_max * tau + 5.0)

    V, y_arr, v_arr, solve_ms = solve_hj_grid(
        u_max=u_max,
        d_max=d_max,
        R=R,
        horizon_s=tau,
        dt_s=dt_s,
        grid_n=grid_n,
        Y_m=Y_m,
        Vm_mps=Vm_mps,
    )

    steps = min(200, max(1, int(round(tau / dt_s))))
    interp_final = RegularGridInterpolator((y_arr, v_arr), V, method="linear", bounds_error=False, fill_value=None)

    # Initial state (y=|miss|, v=0)
    state_y = float(miss_norm_m) if np.isfinite(miss_norm_m) else 0.0
    state_v = 0.0
    val_num_raw = float(interp_final(np.array([[state_y, state_v]]))[0])
    val_num = val_num_raw if np.isfinite(val_num_raw) else 0.0
    val_analytic_raw = analytic_value_oracle(state_y, state_v, tau, u_max, d_max, R)
    val_analytic = val_analytic_raw if np.isfinite(val_analytic_raw) else 0.0

    # Post-maneuver state (y=|p_tca|, v=|dv_lat|)
    post_y = float(p_tca_norm_m) if np.isfinite(p_tca_norm_m) else 0.0
    post_v = float(dv_lat_norm_mps) if np.isfinite(dv_lat_norm_mps) else 0.0

    # Guaranteed miss: |p_tca| - 0.5 * d_max * tau^2 - R
    guaranteed_miss_raw = post_y - 0.5 * d_max * (tau ** 2) - R
    guaranteed_miss = guaranteed_miss_raw if np.isfinite(guaranteed_miss_raw) else 0.0
    maneuver_certified = bool(guaranteed_miss > 0.0)
    in_brt = bool(val_num <= 0.0)

    # Sub-sample grid for JSON representation (<= 81 samples)
    step_sub = 2 if grid_n > 81 else 1
    sub_y = [float(round(y, 2)) for y in y_arr[::step_sub]]
    sub_v = [float(round(v, 2)) for v in v_arr[::step_sub]]
    # Format: rows = v index, cols = y index -> V.T[::step_sub, ::step_sub]
    sub_val = [[float(round(V[i, j], 2)) if np.isfinite(V[i, j]) else 0.0 for i in range(0, grid_n, step_sub)] for j in range(0, grid_n, step_sub)]

    return {
        "method": "Semi-Lagrangian Isaacs DP (HJ PDE)",
        "u_max_mps2": float(round(u_max, 4)),
        "d_max_mps2": float(round(d_max, 4)),
        "horizon_s": float(round(tau, 1)),
        "in_brt": in_brt,
        "value_at_state_m": float(round(val_num, 2)),
        "value_at_state_analytic_m": float(round(val_analytic, 2)),
        "maneuver_certified": maneuver_certified,
        "maneuver_guaranteed_miss_m": float(round(guaranteed_miss, 2)),
        "grid": {
            "y_m": sub_y,
            "v_mps": sub_v,
            "value_m": sub_val,
        },
        "state": {"y_m": float(round(state_y, 2)), "v_mps": float(round(state_v, 2))},
        "post_maneuver_state": {"y_m": float(round(post_y, 2)), "v_mps": float(round(post_v, 2))},
        "solver": {
            "grid_n": int(grid_n),
            "dt_s": float(round(dt_s, 2)),
            "steps": int(steps),
            "solve_ms": float(round(solve_ms, 2)),
        },
    }
