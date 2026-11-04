"""End-to-End Realism Verification Test: Live NASA ISS Telemetry Conjunction.

Red Team System Integration Tester:
1. Ingests live telemetry for the ISS (ZARYA, NORAD 25544) from Celestrak.
2. Injects this live ISS state vector as the Ego Spacecraft into a high-risk mock conjunction
   against a piece of Russian ASAT debris (COSMOS 1408 fragmentation).
3. Pushes this real-world encounter payload directly through the FastAPI endpoints:
   - POST /api/vv/pipeline
   - POST /api/epg/graph
4. Validates that the AEGIS-MESH pipeline orchestrates a live evasion maneuver
   (Foster 1992 Pc assessment -> CLM ranking -> EPG physics rules -> Hamilton-Jacobi
    reachability -> Control Barrier Function forward invariance).
5. Persists comprehensive test findings and JSON responses to live_nasa_e2e_report.json.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is in Python sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import tempfile
from live_celestrak_telemetry import fetch_live_iss_state
from app.main import app
from app.cara_engine import CARAEngine

REPORT_FILE = Path(tempfile.gettempdir()) / "live_nasa_e2e_report.json"


def construct_mock_asat_conjunction(iss_state: Dict[str, Any]) -> Dict[str, Any]:
    """Construct a physically sound mock encounter between live ISS and Russian ASAT debris.

    Models a lethal fragment from the November 2021 Russian direct-ascent ASAT test
    (COSMOS 1408 fragmentation) intersecting the live ISS orbital plane at high relative velocity.
    Calculates exact B-plane coordinate triad and encounter geometry.
    """
    cara = CARAEngine()

    r_iss = np.array(iss_state["position_km"], dtype=float)
    v_iss = np.array(iss_state["velocity_km_s"], dtype=float)

    # ISS orbital angular momentum and radial unit vectors
    h_vec = np.cross(r_iss, v_iss)
    h_u = h_vec / np.linalg.norm(h_vec)
    v_u = v_iss / np.linalg.norm(v_iss)
    r_u = r_iss / np.linalg.norm(r_iss)

    # Russian ASAT orbital inclination (~82.6°) creates an ~11.2 km/s crossing encounter
    v_rel_dir = -0.85 * v_u + 0.45 * h_u + 0.25 * r_u
    v_rel_dir = v_rel_dir / np.linalg.norm(v_rel_dir)
    target_v_rel_km_s = 11.2
    v_rel = target_v_rel_km_s * v_rel_dir
    v_debris = v_iss + v_rel

    # Compute orthonormal B-plane coordinate triad (xi_hat, zeta_hat, eta_hat)
    xi_hat, zeta_hat, eta_hat = cara.b_plane_frame(r_iss, v_iss, r_iss, v_debris)

    # Target close approach in the B-plane (meters -> km)
    # Placing encounter inside the collision keep-out zone
    b_xi_m = 145.0
    b_zeta_m = 110.0
    dr_km = (b_xi_m / 1000.0) * xi_hat + (b_zeta_m / 1000.0) * zeta_hat
    r_debris = r_iss + dr_km

    # Verify B-plane projection via CARA engine
    b_plane = cara.compute_b_plane(r_iss, v_iss, r_debris, v_debris)
    actual_v_rel = float(np.linalg.norm(v_debris - v_iss))

    # Combined 2x2 covariance in the B-plane
    sigma_xi_m = 120.0
    sigma_zeta_m = 60.0
    rho = 0.2
    cov_2x2_m2 = np.array([
        [sigma_xi_m ** 2, rho * sigma_xi_m * sigma_zeta_m],
        [rho * sigma_xi_m * sigma_zeta_m, sigma_zeta_m ** 2]
    ], dtype=float)

    # Compute initial Foster 1992 collision probability
    hard_body_radius_m = 15.0
    miss_vec_m = np.array([b_xi_m, b_zeta_m], dtype=float)
    pc_initial = float(cara.compute_probability(miss_vec_m, cov_2x2_m2, hard_body_radius_m))

    return {
        "scenario_name": "ISS Real-World Telemetry vs. COSMOS 1408 Russian ASAT Debris",
        "primary": {
            "name": iss_state.get("name", "ISS (ZARYA)"),
            "norad_id": "25544",
            "position_km": r_iss.tolist(),
            "velocity_km_s": v_iss.tolist(),
            "altitude_km": float(round(iss_state["altitude_km"], 2)),
            "speed_km_s": float(round(iss_state["speed_km_s"], 2)),
            "epoch_utc": iss_state["epoch"],
            "role": "Ego Spacecraft",
        },
        "secondary": {
            "name": "COSMOS 1408 DEBRIS (Russian ASAT Fragmentation)",
            "norad_id": "49863",
            "debris_mass_kg": 55.0,
            "position_km": r_debris.tolist(),
            "velocity_km_s": v_debris.tolist(),
            "role": "Non-maneuverable Debris Fragment",
        },
        "encounter_geometry": {
            "tca_s": 45.0,
            "relative_velocity_km_s": float(round(actual_v_rel, 2)),
            "b_plane_miss_xi_m": float(round(b_plane["xi"] * 1000.0, 2)),
            "b_plane_miss_zeta_m": float(round(b_plane["zeta"] * 1000.0, 2)),
            "miss_distance_m": float(round(math.sqrt(b_xi_m ** 2 + b_zeta_m ** 2), 2)),
            "sigma_xi_m": sigma_xi_m,
            "sigma_zeta_m": sigma_zeta_m,
            "covariance_rho": rho,
            "hard_body_radius_m": hard_body_radius_m,
            "initial_pc_foster1992": pc_initial,
            "threshold_breached": pc_initial >= 1e-4,
        },
    }


def execute_live_nasa_e2e_pipeline() -> Dict[str, Any]:
    """Execute the full end-to-end integration test against live Celestrak ISS telemetry."""
    print("=" * 80)
    print("  AEGIS-MESH RED TEAM SYSTEM INTEGRATION TESTER")
    print("  LIVE REALISM SUITE: CELESTRAK ISS TELEMETRY -> FASTAPI PIPELINE")
    print("=" * 80)

    # Step 1: Fetch live ISS telemetry from Celestrak
    print("\n[STEP 1/4] Querying live NASA ISS state vector from Celestrak...")
    iss_state = fetch_live_iss_state()
    if not iss_state or "position_km" not in iss_state:
        raise RuntimeError("Failed to obtain live ISS state vector.")

    print(f" -> Telemetry synchronized for {iss_state['name']} at epoch {iss_state['epoch']}")
    print(f" -> Live Altitude: {iss_state['altitude_km']:.2f} km | Speed: {iss_state['speed_km_s']:.2f} km/s")
    print(f" -> ECI Vector: X={iss_state['position_km'][0]:.2f}, Y={iss_state['position_km'][1]:.2f}, Z={iss_state['position_km'][2]:.2f} km")

    # Step 2: Inject live ISS state vector as Ego Spacecraft into mock Conjunction
    print("\n[STEP 2/4] Injecting live state vector into mock Russian ASAT Conjunction...")
    conjunction = construct_mock_asat_conjunction(iss_state)
    geom = conjunction["encounter_geometry"]

    print(f" -> Secondary Target: {conjunction['secondary']['name']}")
    print(f" -> Encounter Velocity: {geom['relative_velocity_km_s']:.2f} km/s")
    print(f" -> B-Plane Miss Vector: xi={geom['b_plane_miss_xi_m']:.1f} m, zeta={geom['b_plane_miss_zeta_m']:.1f} m (Total: {geom['miss_distance_m']:.1f} m)")
    print(f" -> Initial Foster (1992) Collision Probability: {geom['initial_pc_foster1992']:.4e}")
    print(f" -> Safety Threshold (1e-4) Breached: {geom['threshold_breached']}")

    # Step 3: Push payload through FastAPI endpoints
    print("\n[STEP 3/4] Transmitting payload directly through FastAPI endpoints...")
    client = TestClient(app)

    # 3A: POST /api/vv/pipeline
    pipeline_request_payload = {
        "tca_s": geom["tca_s"],
        "miss_xi_m": geom["b_plane_miss_xi_m"],
        "miss_zeta_m": geom["b_plane_miss_zeta_m"],
        "rel_velocity_km_s": geom["relative_velocity_km_s"],
        "debris_mass_kg": conjunction["secondary"]["debris_mass_kg"],
        "sigma_xi_m": geom["sigma_xi_m"],
        "sigma_zeta_m": geom["sigma_zeta_m"],
        "rho": geom["covariance_rho"],
        "hard_body_radius_m": geom["hard_body_radius_m"],
        "sat_mass_kg": 150.0,
        "propellant_mass_kg": 5.0,
        "isp_s": 220.0,
        "max_thrust_n": 22.0,
        "altitude_km": float(round(iss_state["altitude_km"], 2)),
        "min_perigee_km": 300.0,
        "d_max_mps2": 0.01,
        "pc_threshold": 1e-4,
        "top_k": 10,
    }

    print(" -> Invoking POST /api/vv/pipeline ...")
    resp_pipeline = client.post("/api/vv/pipeline", json=pipeline_request_payload)
    if resp_pipeline.status_code != 200:
        raise AssertionError(f"POST /api/vv/pipeline failed with HTTP {resp_pipeline.status_code}: {resp_pipeline.text}")
    pipeline_data = resp_pipeline.json()

    # 3B: POST /api/epg/graph
    epg_request_payload = {
        "sat_mass_kg": 150.0,
        "propellant_mass_kg": 5.0,
        "isp_s": 220.0,
        "max_thrust_n": 22.0,
        "tca_s": geom["tca_s"],
        "miss_xi_m": geom["b_plane_miss_xi_m"],
        "miss_zeta_m": geom["b_plane_miss_zeta_m"],
        "rel_velocity_km_s": geom["relative_velocity_km_s"],
        "debris_mass_kg": conjunction["secondary"]["debris_mass_kg"],
        "altitude_km": float(round(iss_state["altitude_km"], 2)),
    }

    print(" -> Invoking POST /api/epg/graph ...")
    resp_epg = client.post("/api/epg/graph", json=epg_request_payload)
    if resp_epg.status_code != 200:
        raise AssertionError(f"POST /api/epg/graph failed with HTTP {resp_epg.status_code}: {resp_epg.text}")
    epg_data = resp_epg.json()

    # Verify pipeline results
    verdict = pipeline_data.get("verdict", {})
    selected_action = pipeline_data.get("selected") or {}
    assessment = pipeline_data.get("assessment", {})
    hj = pipeline_data.get("hj", {})
    cbf = pipeline_data.get("cbf", {})
    reasoning = epg_data.get("reasoning_state", {})

    print("\n -> V&V Pipeline Verdict: ", verdict.get("status"))
    print(" -> Selected CLM Maneuver:", selected_action.get("label"), f"({selected_action.get('delta_v_mps')} m/s)")
    print(" -> Pc Pre-Burn:          ", f"{assessment.get('pc_pre', 0.0):.4e}")
    print(" -> Pc Post-Burn:         ", f"{assessment.get('pc_post', 0.0):.4e}")
    print(" -> HJ Maneuver Certified:", hj.get("maneuver_certified"))
    print(" -> CBF Forward Invariant:", cbf.get("forward_invariant"))
    print(" -> EPG Rule Verdict: ", reasoning.get("verdict"))
    print(" -> Knowledge Graph Size: ", f"{len(epg_data.get('nodes', []))} nodes, {len(epg_data.get('edges', []))} edges")

    # Rigorous red-team assertions
    assert verdict.get("status") == "EXECUTE", f"Expected verdict EXECUTE, got {verdict.get('status')}"
    assert selected_action.get("label"), "Pipeline did not select a valid maneuver action"
    assert assessment.get("pc_pre") >= 1e-4, "Initial Pc did not correctly breach threshold"
    assert assessment.get("pc_post") < assessment.get("threshold"), "Post-burn Pc failed to clear threshold"
    assert hj.get("maneuver_certified") is True, "Hamilton-Jacobi reachability failed certification"
    assert cbf.get("forward_invariant") is True, "Control Barrier Function violated forward invariance"
    assert reasoning.get("verdict") == "ACCEPTED", "EPG semantic rule evaluation did not accept vector"

    # Step 4: Persist JSON test report
    print("\n[STEP 4/4] Writing comprehensive test report to disk...")
    final_report = {
        "report_title": "AEGIS-MESH Red Team Realism Test: Live Celestrak ISS Conjunction E2E Report",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "tester_role": "Red Team System Integration Tester",
        "test_status": "PASSED",
        "live_telemetry_source": {
            "provider": "Celestrak Real-Time GP Stations Catalog",
            "station_name": iss_state.get("name"),
            "tle_line1": iss_state.get("tle1"),
            "tle_line2": iss_state.get("tle2"),
            "propagation_epoch_utc": iss_state.get("epoch"),
            "position_teme_km": iss_state.get("position_km"),
            "velocity_teme_km_s": iss_state.get("velocity_km_s"),
            "altitude_km": iss_state.get("altitude_km"),
            "orbital_speed_km_s": iss_state.get("speed_km_s"),
        },
        "mock_conjunction_scenario": conjunction,
        "endpoint_execution": {
            "post_vv_pipeline": {
                "endpoint": "/api/vv/pipeline",
                "status_code": resp_pipeline.status_code,
                "request_payload": pipeline_request_payload,
                "response": pipeline_data,
            },
            "post_epg_graph": {
                "endpoint": "/api/epg/graph",
                "status_code": resp_epg.status_code,
                "request_payload": epg_request_payload,
                "response": epg_data,
            },
        },
        "verification_verdict_summary": {
            "status": verdict.get("status"),
            "reasons": verdict.get("reasons", []),
            "selected_evasion_action": {
                "label": selected_action.get("label"),
                "category": selected_action.get("category"),
                "delta_v_mps": selected_action.get("delta_v_mps"),
                "direction_rtn": selected_action.get("direction_rtn"),
            },
            "risk_mitigation": {
                "initial_pc": assessment.get("pc_pre"),
                "post_maneuver_pc": assessment.get("pc_post"),
                "risk_mitigation_order_of_magnitude": float(round(
                    math.log10(max(1e-12, assessment.get("pc_pre", 1e-4)))
                    - math.log10(max(1e-12, assessment.get("pc_post", 1e-12))), 2
                )),
                "keepout_zone_cleared": bool(assessment.get("pc_post", 1.0) < 1e-4),
            },
            "mathematical_certificates": {
                "foster_1992_quadrature": "CONFIRMED_BREACH",
                "hamilton_jacobi_reachability": "CERTIFIED_SAFE",
                "control_barrier_function": "FORWARD_INVARIANT",
                "epg_rule_graph": "ACCEPTED",
            },
        },
    }

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=2)

    print(f" -> Saved full E2E report to: {REPORT_FILE}")
    print("\n" + "=" * 80)
    print("  ALL E2E INTEGRATION CHECKS PASSED: AEGIS-MESH ORCHESTRATED EVASION")
    print(f"  FOR THE ISS ({iss_state['altitude_km']:.1f} km ALTITUDE) WITH LIVE CELESTRAK DATA!")
    print("=" * 80 + "\n")

    return final_report


# Pytest test discovery entry points
@pytest.mark.network
def test_e2e_live_nasa_conjunction_and_report():
    """Pytest test case verifying live Celestrak telemetry pipeline execution."""
    report = execute_live_nasa_e2e_pipeline()
    assert report["test_status"] == "PASSED"
    assert REPORT_FILE.exists()
    assert REPORT_FILE.stat().st_size > 0


if __name__ == "__main__":
    execute_live_nasa_e2e_pipeline()
