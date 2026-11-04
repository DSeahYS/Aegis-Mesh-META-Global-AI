"""Red Team Backend Stress Tester Suite.

Aggressively stresses core physics algorithms and verification pipelines:
1. Foster 1992 B-plane & Polar Quadrature Engine (CARAEngine, b_plane_frame, pc_small_hbr)
2. Hamilton-Jacobi Reachability Dynamic Programming PDE Solver (solve_hj_reachability, solve_hj_grid, analytic_value_oracle)
3. EPG Semantic Knowledge Graph & Physics Rule Engine (build_epg_knowledge_graph, validate_candidates, evaluate_orbit_perigee, compute_keepout_k)
4. End-to-End Closed-Loop Verification Pipeline (run_vv_pipeline)

Tests extreme edge cases:
- Sub-meter encounters (< 1 meter down to 0.0 m direct collision)
- Massive covariances (up to 1e30 m^2) and singular/degenerate covariances (rho = 1.0)
- Extreme orbital regimes (hyperbolic escape, low perigee 120 km, GEO 35,786 km)
- Extreme propulsion authority (0 N to 500 kN, 0 kg propellant, micro-CubeSat to mega-station)
- Extreme relative velocities (0.0 km/s to 75.0 km/s hypersonic)

Guarantees:
- Zero NaNs (math.isnan is False)
- Zero Infinities (math.isinf is False)
- Zero unhandled exceptions
- Strict mathematical realism [0.0 <= Pc <= 1.0]
"""

import math
import os
import sys
import time
import traceback
from typing import Any, Dict, List, Tuple

import numpy as np

# Ensure backend modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.cara_engine import (
    CARAEngine,
    b_plane_frame,
    pc_isotropic_exact,
    pc_monte_carlo,
    pc_small_hbr,
    project_covariance,
)
from app.clm_engine import CLMEngine
from app.vv.cbf_filter import run_cbf_filter, run_cbf_simulation
from app.vv.hj_reachability import (
    analytic_value_oracle,
    solve_hj_grid,
    solve_hj_reachability,
)
from app.vv.epg import build_epg_knowledge_graph
from app.vv.physics_validator import (
    compute_keepout_k,
    evaluate_candidate,
    evaluate_orbit_perigee,
    validate_candidates,
)
from app.vv.pipeline import DEFAULT_PIPELINE_PARAMS, run_vv_pipeline


class StressTestReporter:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.failures: List[Tuple[str, str]] = []
        self.start_time = time.time()

    def record_pass(self, test_name: str, detail: str = ""):
        self.total_tests += 1
        self.passed_tests += 1
        msg = f"  [PASS] {test_name}"
        if detail:
            msg += f" - {detail}"
        print(msg)

    def record_fail(self, test_name: str, reason: str):
        self.total_tests += 1
        self.failed_tests += 1
        self.failures.append((test_name, reason))
        print(f"  [FAIL] {test_name}: {reason}")

    def summary(self) -> Dict[str, Any]:
        elapsed = time.time() - self.start_time
        return {
            "total": self.total_tests,
            "passed": self.passed_tests,
            "failed": self.failed_tests,
            "elapsed_seconds": round(elapsed, 3),
            "survived": self.failed_tests == 0,
            "failures": self.failures,
        }


def assert_all_finite(obj: Any, path: str = "root") -> None:
    """Recursively verify that no float in the data structure is NaN or Infinite."""
    if isinstance(obj, (float, np.floating)):
        val = float(obj)
        if not math.isfinite(val):
            raise AssertionError(f"Non-finite float at {path}: {val}")
    elif isinstance(obj, np.ndarray):
        if not np.all(np.isfinite(obj)):
            bad_indices = np.where(~np.isfinite(obj))
            raise AssertionError(f"Non-finite values in numpy array at {path} at indices {bad_indices}")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            assert_all_finite(v, f"{path}.{k}")
    elif isinstance(obj, (list, tuple)):
        for idx, item in enumerate(obj):
            assert_all_finite(item, f"{path}[{idx}]")


# ==============================================================================
# 1. FOSTER 1992 B-PLANE RED TEAM STRESS TESTS
# ==============================================================================
def stress_test_foster_b_plane(reporter: StressTestReporter):
    print("\n=======================================================")
    print("SUITE 1: Foster 1992 B-Plane & Quadrature Stress Tests")
    print("=======================================================")
    cara = CARAEngine()

    # 1.1 Extremely Close Approaches (< 1 meter down to 0.0m)
    close_distances = [
        ("Sub-meter 0.99 m", 0.99, 0.0),
        ("Sub-meter 0.10 m (10 cm)", 0.10, 0.0),
        ("Sub-meter 0.01 m (1 cm)", 0.01, 0.0),
        ("Sub-meter 0.001 m (1 mm)", 0.001, 0.0),
        ("Sub-meter 1e-6 m (1 um)", 1e-6, 0.0),
        ("Direct Collision 0.0 m (Center-on-Center)", 0.0, 0.0),
    ]
    C_nom = np.array([[50.0 ** 2, 0.0], [0.0, 50.0 ** 2]], dtype=float)
    hbr = 10.0

    for label, xi, zeta in close_distances:
        tname = f"Foster Close Approach: {label}"
        try:
            miss = np.array([xi, zeta], dtype=float)
            pc = cara.compute_probability(miss, C_nom, hbr)
            assert_all_finite(pc, tname)
            if not (0.0 <= pc <= 1.0):
                reporter.record_fail(tname, f"Pc out of bounds [0, 1]: {pc}")
                continue
            # Also test small-hbr asymptotic formula
            pc_shbr = pc_small_hbr(miss, C_nom, hbr)
            assert_all_finite(pc_shbr, f"{tname} (small_hbr)")
            reporter.record_pass(tname, f"Pc = {pc:.6e}, Pc_shbr = {pc_shbr:.6e}")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}\n{traceback.format_exc()}")

    # 1.2 Massive Covariances
    massive_covariances = [
        ("Massive 10 km (sigma = 1e4 m)", 1e4),
        ("Massive 1,000 km (sigma = 1e6 m)", 1e6),
        ("Massive 1,000,000 km (sigma = 1e9 m)", 1e9),
        ("Extreme Interplanetary (sigma = 1e15 m)", 1e15),
        ("Ultra astronomical (sigma = 1e30 m)", 1e30),
    ]
    for label, sigma in massive_covariances:
        tname = f"Foster Massive Covariance: {label}"
        try:
            C_big = np.array([[sigma ** 2, 0.0], [0.0, sigma ** 2]], dtype=float)
            pc = cara.compute_probability(np.array([10.0, 10.0]), C_big, hbr)
            assert_all_finite(pc, tname)
            if not (0.0 <= pc <= 1.0):
                reporter.record_fail(tname, f"Pc out of bounds: {pc}")
                continue
            reporter.record_pass(tname, f"Pc = {pc:.6e}")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}")

    # 1.3 Degenerate, Singular & Ill-Conditioned Covariances
    ill_conditioned_covs = [
        ("Singular Correlation rho = 1.0 (Rank 1)", np.array([[100.0**2, 100.0**2], [100.0**2, 100.0**2]])),
        ("Extreme Correlation rho = 0.99999999", np.array([[100.0**2, 0.99999999*100.0**2], [0.99999999*100.0**2, 100.0**2]])),
        ("Extreme Aspect Ratio 1e8 : 1", np.array([[1e8**2, 0.0], [0.0, 0.1**2]])),
        ("Microscopic Covariance 1 mm (sigma = 1e-3)", np.array([[1e-3**2, 0.0], [0.0, 1e-3**2]])),
        ("Zero Variance on One Axis (sigma_zeta = 0)", np.array([[100.0**2, 0.0], [0.0, 0.0]])),
        ("Near-zero determinant 1e-30", np.array([[1e-15, 0.0], [0.0, 1e-15]])),
    ]
    for label, C_ill in ill_conditioned_covs:
        tname = f"Foster Ill-Conditioned Covariance: {label}"
        try:
            pc = cara.compute_probability(np.array([5.0, 5.0]), C_ill, hbr)
            assert_all_finite(pc, tname)
            if not (0.0 <= pc <= 1.0):
                reporter.record_fail(tname, f"Pc out of bounds: {pc}")
                continue
            reporter.record_pass(tname, f"Pc = {pc:.6e}")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}")

    # 1.4 Hard Body Radius Extremes
    hbr_extremes = [
        ("Zero HBR (0.0 m)", 0.0),
        ("Negative HBR (-10.0 m)", -10.0),
        ("Microscopic HBR (1e-6 m)", 1e-6),
        ("Enormous HBR (10,000 km = 1e7 m)", 1e7),
    ]
    for label, r in hbr_extremes:
        tname = f"Foster HBR Extreme: {label}"
        try:
            pc = cara.compute_probability(np.array([5.0, 5.0]), C_nom, r)
            assert_all_finite(pc, tname)
            if not (0.0 <= pc <= 1.0):
                reporter.record_fail(tname, f"Pc out of bounds: {pc}")
                continue
            reporter.record_pass(tname, f"Pc = {pc:.6e}")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}")

    # 1.5 B-Plane Geometry Singularities
    geometry_cases = [
        ("Collinear / Parallel velocities (v_rel = 0)", [7000.0, 0.0, 0.0], [0.0, 7.5, 0.0], [7000.0001, 0.0, 0.0], [0.0, 7.5, 0.0]),
        ("Head-on Counter-Rotating (v_rel = 15 km/s)", [7000.0, 0.0, 0.0], [0.0, 7.5, 0.0], [7000.0001, 0.0, 0.0], [0.0, -7.5, 0.0]),
        ("Rectilinear Plunge (r || v)", [7000.0, 0.0, 0.0], [1.0, 0.0, 0.0], [7000.0001, 0.0, 0.0], [-1.0, 0.0, 0.0]),
        ("Origin Singularity (r_p = 0)", [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0001], [0.0, 0.0, 1.0]),
        ("Hypersonic encounter (75 km/s)", [7000.0, 0.0, 0.0], [0.0, 37.5, 0.0], [7000.0001, 0.0, 0.0], [0.0, -37.5, 0.0]),
        ("Sub-meter encounter frame (0.05m delta)", [6800.0, 0.0, 0.0], [0.0, 7.6, 0.0], [6800.00005, 0.0, 0.0], [0.0, 7.6, 0.05]),
    ]
    for label, rp, vp, rs, vs in geometry_cases:
        tname = f"B-Plane Geometry: {label}"
        try:
            xi, zeta, eta = b_plane_frame(rp, vp, rs, vs)
            assert_all_finite(xi, f"{tname}.xi")
            assert_all_finite(zeta, f"{tname}.zeta")
            assert_all_finite(eta, f"{tname}.eta")
            bp = cara.compute_b_plane(rp, vp, rs, vs)
            assert_all_finite(bp, f"{tname}.b_plane")
            reporter.record_pass(tname, f"b_mag = {bp['b_mag']:.6f} km")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}")


# ==============================================================================
# 2. HAMILTON-JACOBI REACHABILITY PDE SOLVER STRESS TESTS
# ==============================================================================
def stress_test_hamilton_jacobi(reporter: StressTestReporter):
    print("\n=======================================================")
    print("SUITE 2: Hamilton-Jacobi Dynamic Programming PDE Stress Tests")
    print("=======================================================")

    hj_scenarios = [
        ("Sub-meter Initial Miss (0.01 m)", 0.01, 0.05, 0.01, 0.5, 0.01, 15.0, 30.0),
        ("Direct Collision (0.0 m miss)", 0.0, 0.0, 0.0, 0.5, 0.01, 15.0, 30.0),
        ("Massive Miss Distance (1,000 km = 1e6 m)", 1e6, 1e6, 10.0, 1.0, 0.01, 15.0, 30.0),
        ("Zero Evader Thrust Authority (u_max = 0)", 50.0, 50.0, 0.0, 0.0, 0.05, 15.0, 30.0),
        ("Overpowering Debris Disturbance (d_max >> u_max)", 50.0, 50.0, 1.0, 0.05, 20.0, 15.0, 20.0),
        ("Extreme Evader Authority (u_max = 100 m/s^2)", 50.0, 50.0, 5.0, 100.0, 0.01, 15.0, 30.0),
        ("Zero Hard Body Radius (R = 0 m)", 20.0, 20.0, 0.2, 0.5, 0.01, 0.0, 30.0),
        ("Massive Hard Body Radius (R = 10 km = 10000 m)", 100.0, 100.0, 1.0, 0.5, 0.01, 10000.0, 30.0),
        ("Ultra-Short Horizon (tau = 0.1 s)", 20.0, 20.0, 0.2, 0.5, 0.01, 15.0, 0.1),
        ("Zero Horizon (tau = 0.0 s)", 20.0, 20.0, 0.2, 0.5, 0.01, 15.0, 0.0),
        ("Long Horizon (tau = 600.0 s)", 20.0, 20.0, 0.2, 0.5, 0.01, 15.0, 600.0),
        ("Negative Horizon (tau = -10.0 s)", 20.0, 20.0, 0.2, 0.5, 0.01, 15.0, -10.0),
    ]

    for label, miss, ptca, dvlat, umax, dmax, hbr, hor in hj_scenarios:
        tname = f"Hamilton-Jacobi PDE: {label}"
        try:
            res = solve_hj_reachability(
                miss_norm_m=miss,
                p_tca_norm_m=ptca,
                dv_lat_norm_mps=dvlat,
                u_max_mps2=umax,
                d_max_mps2=dmax,
                hard_body_radius_m=hbr,
                horizon_s=hor,
            )
            assert_all_finite(res, tname)
            v_num = res["value_at_state_m"]
            v_ana = res["value_at_state_analytic_m"]
            cert = res["maneuver_certified"]
            reporter.record_pass(tname, f"V_num = {v_num:.2f} m, V_ana = {v_ana:.2f} m, Certified = {cert}")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}\n{traceback.format_exc()}")


# ==============================================================================
# 3. EPG KNOWLEDGE GRAPH & PHYSICS RULES STRESS TESTS
# ==============================================================================
def stress_test_epg_and_rules(reporter: StressTestReporter):
    print("\n=======================================================")
    print("SUITE 3: EPG Knowledge Graph & Physics Rules Stress Tests")
    print("=======================================================")

    # 3.1 Physics Validator Sub-Functions: evaluate_orbit_perigee & compute_keepout_k
    perigee_cases = [
        ("Nominal LEO (500 km, 10 m/s prograde)", 500.0, 10.0, [0.0, 1.0, 0.0]),
        ("Hypersonic delta-v (15,000 m/s Hyperbolic Escape)", 500.0, 15000.0, [0.0, 1.0, 0.0]),
        ("Zero delta-v (0 m/s)", 500.0, 0.0, [0.0, 1.0, 0.0]),
        ("Retrograde burn de-orbiting into Earth (200 m/s retrograde)", 300.0, 200.0, [0.0, -1.0, 0.0]),
        ("Geostationary altitude (35,786 km)", 35786.0, 50.0, [0.0, 1.0, 0.0]),
        ("Atmospheric entry interface (120 km)", 120.0, 5.0, [0.0, 1.0, 0.0]),
        ("Radial plunging burn (direction = [1, 0, 0])", 500.0, 50.0, [1.0, 0.0, 0.0]),
        ("Direction vector norm zero ([0, 0, 0])", 500.0, 20.0, [0.0, 0.0, 0.0]),
        ("Negative altitude (-100 km crash)", -100.0, 10.0, [0.0, 1.0, 0.0]),
    ]
    for label, alt, dv, d_rtn in perigee_cases:
        tname = f"Orbit Perigee Evaluator: {label}"
        try:
            peri = evaluate_orbit_perigee(alt, dv, d_rtn)
            assert_all_finite(peri, tname)
            reporter.record_pass(tname, f"Perigee Alt = {peri:.2f} km")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}")

    keepout_cases = [
        ("Nominal Keepout", np.eye(2)*100**2, 15.0, 1e-4),
        ("Singular Covariance det = 0", np.array([[100.0**2, 100.0**2], [100.0**2, 100.0**2]]), 15.0, 1e-4),
        ("Zero Pc threshold (pc = 0.0)", np.eye(2)*100**2, 15.0, 0.0),
        ("Microscopic Pc threshold underflow (pc = 1e-320)", np.eye(2)*100**2, 15.0, 1e-320),
        ("Huge Hard Body Radius (10,000 m)", np.eye(2)*100**2, 10000.0, 1e-4),
        ("Zero Hard Body Radius (0.0 m)", np.eye(2)*100**2, 0.0, 1e-4),
    ]
    for label, cov, hbr, thresh in keepout_cases:
        tname = f"Keepout Ellipse k: {label}"
        try:
            k = compute_keepout_k(cov, hbr, thresh)
            assert_all_finite(k, tname)
            reporter.record_pass(tname, f"k = {k:.4f} sigma")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}")

    # 3.2 EPG Full Knowledge Graph Build Across Extreme Mission Architectures
    epg_scenarios = [
        ("Sub-meter encounter (0.05m miss)", {"miss_xi_m": 0.05, "miss_zeta_m": 0.05}),
        ("Direct head-on collision (0m miss)", {"miss_xi_m": 0.0, "miss_zeta_m": 0.0}),
        ("Massive Covariance (1000 km)", {"sigma_xi_m": 1e6, "sigma_zeta_m": 1e6}),
        ("Degenerate Singular Covariance (rho = 1.0)", {"rho": 1.0}),
        ("Zero Variance Axis (sigma_xi = 0.0)", {"sigma_xi_m": 0.0}),
        ("High Eccentricity / Low Perigee", {"altitude_km": 150.0, "min_perigee_km": 120.0}),
        ("GEO Orbit High Altitude", {"altitude_km": 35786.0, "min_perigee_km": 35500.0}),
        ("Zero Propellant Dead Spacecraft", {"propellant_mass_kg": 0.0}),
        ("Zero Thruster Authority (0 N)", {"max_thrust_n": 0.0}),
        ("Massive Thruster (100 kN)", {"max_thrust_n": 100000.0}),
        ("Micro CubeSat vs Mega Debris", {"sat_mass_kg": 0.25, "debris_mass_kg": 50000.0, "propellant_mass_kg": 0.02}),
        ("Mega Space Station vs Micro Flake", {"sat_mass_kg": 450000.0, "debris_mass_kg": 0.0001, "propellant_mass_kg": 10000.0}),
        ("Hypersonic Velocity (72 km/s)", {"rel_velocity_km_s": 72.0}),
        ("Low Relative Velocity (0.01 km/s)", {"rel_velocity_km_s": 0.01}),
        ("Ultra-short TCA (1.0 s)", {"tca_s": 1.0}),
        ("Zero TCA (0.0 s)", {"tca_s": 0.0}),
    ]

    for label, param_overrides in epg_scenarios:
        tname = f"EPG Graph Build: {label}"
        try:
            params = dict(DEFAULT_PIPELINE_PARAMS)
            params.update(param_overrides)
            kg = build_epg_knowledge_graph(params)
            assert_all_finite(kg, tname)
            assert "nodes" in kg and "edges" in kg
            n_nodes = len(kg["nodes"])
            n_edges = len(kg["edges"])
            reporter.record_pass(tname, f"Graph built successfully ({n_nodes} nodes, {n_edges} edges)")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}\n{traceback.format_exc()}")


# ==============================================================================
# 4. END-TO-END V&V PIPELINE CLOSED-LOOP STRESS SCENARIOS
# ==============================================================================
def stress_test_pipeline_e2e(reporter: StressTestReporter):
    print("\n=======================================================")
    print("SUITE 4: End-to-End V&V Pipeline Stress Scenarios")
    print("=======================================================")

    pipeline_scenarios = [
        ("Sub-meter Encounter (xi=0.1m, zeta=0.2m)", {"miss_xi_m": 0.1, "miss_zeta_m": 0.2}),
        ("Direct Impact 0.0m Head-On Collision", {"miss_xi_m": 0.0, "miss_zeta_m": 0.0}),
        ("Massive Covariance Dispersal (1,000 km)", {"sigma_xi_m": 1e6, "sigma_zeta_m": 1e6}),
        ("Degenerate Singular Covariance (rho = 1.0)", {"rho": 1.0}),
        ("Zero Variance Axis (sigma_xi_m = 0.0)", {"sigma_xi_m": 0.0}),
        ("Tiny Covariance (1 mm sigma)", {"sigma_xi_m": 0.001, "sigma_zeta_m": 0.001}),
        ("Extreme Covariance Aspect Ratio 1e7 : 1", {"sigma_xi_m": 1e5, "sigma_zeta_m": 0.01, "rho": 0.9999}),
        ("Low Atmospheric Perigee Boundary (150 km)", {"altitude_km": 150.0, "min_perigee_km": 120.0}),
        ("High GEO Equatorial Orbit (35,786 km)", {"altitude_km": 35786.0, "min_perigee_km": 35500.0}),
        ("Zero Propellant Reserve (0 kg)", {"propellant_mass_kg": 0.0}),
        ("Zero Thruster Authority (0 N)", {"max_thrust_n": 0.0}),
        ("Massive Chemical Booster (100 kN)", {"max_thrust_n": 100000.0}),
        ("Micro-CubeSat Platform (0.5 kg, 0.05 kg prop)", {"sat_mass_kg": 0.5, "debris_mass_kg": 50000.0, "propellant_mass_kg": 0.05}),
        ("Mega Orbital Complex (450,000 kg)", {"sat_mass_kg": 450000.0, "debris_mass_kg": 0.001, "propellant_mass_kg": 5000.0}),
        ("Hypersonic Encounter Velocity (72.0 km/s)", {"rel_velocity_km_s": 72.0}),
        ("Near-Zero Relative Velocity (0.01 km/s)", {"rel_velocity_km_s": 0.01}),
        ("Imminent Collision Window (TCA = 2.0 s)", {"tca_s": 2.0}),
        ("Zero Time of Closest Approach (TCA = 0.0 s)", {"tca_s": 0.0}),
        ("Massive Keepout Sphere (HBR = 500 m)", {"hard_body_radius_m": 500.0}),
        ("Zero Hard Body Radius (HBR = 0.0 m)", {"hard_body_radius_m": 0.0}),
    ]

    for label, param_overrides in pipeline_scenarios:
        tname = f"V&V Pipeline Scenario: {label}"
        t0 = time.perf_counter()
        try:
            params = dict(DEFAULT_PIPELINE_PARAMS)
            params.update(param_overrides)
            res = run_vv_pipeline(params)
            assert_all_finite(res, tname)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            verdict = res["verdict"]["status"]
            pc_pre = res["assessment"]["pc_pre"]
            reporter.record_pass(tname, f"Verdict = {verdict}, Pc_pre = {pc_pre:.4e} ({elapsed_ms:.1f} ms)")
        except Exception as e:
            reporter.record_fail(tname, f"Exception: {e}\n{traceback.format_exc()}")


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================
def main():
    print("========================================================================")
    print("      RED TEAM BACKEND STRESS TESTER: REALISM & STABILITY SUITE         ")
    print("========================================================================")
    reporter = StressTestReporter()

    stress_test_foster_b_plane(reporter)
    stress_test_hamilton_jacobi(reporter)
    stress_test_epg_and_rules(reporter)
    stress_test_pipeline_e2e(reporter)

    summary = reporter.summary()
    print("\n========================================================================")
    print(f"STRESS TEST SUMMARY:")
    print(f"  Total Test Cases Executed : {summary['total']}")
    print(f"  Passed                    : {summary['passed']}")
    print(f"  Failed                    : {summary['failed']}")
    print(f"  Execution Time            : {summary['elapsed_seconds']} s")
    print(f"  Engine Survival Verdict   : {'SURVIVED (100% PASS)' if summary['survived'] else 'FAILED'}")
    print("========================================================================")

    if not summary["survived"]:
        print("\nFAILURE DETAILS:")
        for name, reason in summary["failures"]:
            print(f"  - {name}: {reason}")
        sys.exit(1)
    else:
        print("\nAll numerical edge cases, singularities, and orbital stress parameters passed without NaN, Inf, or crash.")
        sys.exit(0)


if __name__ == "__main__":
    main()
