"""Regression tests for CW, dilution, parser, EPG/EPS, traffic and Meta loop fixes."""

import numpy as np
import pytest

from app.cdm_parser import CDMParser
from app.meta_agent import run_closed_loop_flight_director, run_vision_segment
from app.vv.epg import build_epg_knowledge_graph
from app.vv.physics_validator import evaluate_candidate
from app.vv.pipeline import DEFAULT_PIPELINE_PARAMS, run_vv_pipeline
from simulators.cdm_traffic_pipeline import SpaceTrackClient, calculate_baseline_urgency_metrics
from simulators.spice_orbit_sim import SpiceOrbitSimulator


def _candidate(direction, dv=2.0):
    return {
        "id": 1,
        "label": "TEST-CANDIDATE",
        "category": "test",
        "delta_v_mps": dv,
        "direction_rtn": direction,
        "confidence": 0.9,
        "score": 0.9,
    }


def _eval(direction, dv=2.0, params=None):
    p = dict(DEFAULT_PIPELINE_PARAMS)
    if params:
        p.update(params)
    cov = np.array([[p["sigma_xi_m"] ** 2, p["rho"] * p["sigma_xi_m"] * p["sigma_zeta_m"]],
                    [p["rho"] * p["sigma_xi_m"] * p["sigma_zeta_m"], p["sigma_zeta_m"] ** 2]], dtype=float)
    return evaluate_candidate(_candidate(direction, dv), p, 0.0, np.linalg.pinv(cov))


def test_along_track_burn_shifts_bplane_and_can_pass_r5():
    """A pure prograde burn must not produce a zero B-plane shift (CW coupling)."""
    ev = _eval([0.0, 1.0, 0.0], dv=2.0)
    assert abs(ev["bplane_displacement_m"][0]) > 0.5
    r5 = next(r for r in ev["rules"] if r["id"] == "R5")
    assert r5["passed"] is True


def test_retrograde_burn_also_couples_into_radial():
    ev = _eval([0.0, -1.0, 0.0], dv=2.0)
    assert ev["bplane_displacement_m"][0] < -0.5


def test_eps_r6_fails_closed_on_low_battery():
    ev = _eval([1.0, 0.0, 0.0], dv=0.5, params={"initial_soc": 0.55})
    r6 = next(r for r in ev["rules"] if r["id"] == "R6")
    assert r6["passed"] is False
    assert ev["accepted"] is False


def test_pipeline_dilution_guard_triggers():
    """Huge covariance + tiny reported Pc must not return NO_ACTION_REQUIRED."""
    result = run_vv_pipeline({
        "miss_xi_m": 62.0,
        "miss_zeta_m": 62.0,
        "sigma_xi_m": 50000.0,
        "sigma_zeta_m": 40000.0,
        "rho": 0.0,
    })
    assert result["assessment"]["probability_dilution_risk"] is True
    assert result["assessment"]["triggered"] is True
    assert result["assessment"]["pc_max"] > 1e-4
    assert result["verdict"]["status"] != "NO_ACTION_REQUIRED"


def test_cdm_parser_resets_object_scope_after_meta_stop():
    text = """META_START
OBJECT = OBJECT1
OBJECT_DESIGNATOR = 11111
META_STOP
MISS_DISTANCE = 123.4
OBJECT = OBJECT2
CR_R = 100.0
"""
    parsed = CDMParser().parse(text)
    assert parsed["data"]["MISS_DISTANCE"] == "123.4"
    assert "OBJECT1" not in parsed["data"]
    assert parsed["covariances"]["OBJECT2"]["CR_R"] == "100.0"


def test_epg_contains_computed_r6_and_no_hardcoded_r3_value():
    graph = build_epg_knowledge_graph({})
    r3 = next(n for n in graph["nodes"] if n["id"] == "Rule_R3_Perigee_Floor")
    r6 = next(n for n in graph["nodes"] if n["id"] == "Rule_R6_EPS_DoD")
    assert r3["properties"].get("value") != 548.0
    assert r6["properties"]["passed"] is True
    assert graph["reasoning_state"]["eps_evaluation"]["status"] == "PASSED"
    assert any(r["id"] == "R6" for r in graph["reasoning_state"]["rule_results"])


def test_bplane_covariance_rotates_with_relative_velocity():
    """Non-head-on encounter: huge CT_T must enter the B-plane covariance."""
    metrics = calculate_baseline_urgency_metrics(
        tca="2026-10-04T00:00:00.000Z",
        current_time="2026-10-03T12:00:00.000Z",
        relative_position=[100.0, -20.0, 50.0],
        combined_covariance=np.diag([100.0, 1.0e8, 400.0]),
        relative_velocity=[5000.0, -12000.0, 3000.0],
        reported_pc=1e-5,
    )
    cov_b = np.array(metrics["bplane_covariance_m2"], dtype=float)
    assert float(np.linalg.det(cov_b)) > 1.0e7
    assert metrics["bplane_basis_rtn"]["xi"] != [1.0, 0.0, 0.0]


class _FakeResponse:
    def __init__(self, records):
        self.status_code = 200
        self._records = records
        self.text = ""

    def json(self):
        return self._records


def test_query_cdms_searches_both_norad_fields(monkeypatch):
    client = SpaceTrackClient(identity="", password="")
    client.is_authenticated = True
    calls = []

    def fake_get(url, timeout=None):
        calls.append(url)
        if "NORAD_CAT_ID_1" in url:
            return _FakeResponse([{"CDM_ID": "A", "TCA": "2026-10-04T00:00:00.000Z"}])
        return _FakeResponse([
            {"CDM_ID": "B", "TCA": "2026-10-04T01:00:00.000Z"},
            {"CDM_ID": "A", "TCA": "2026-10-04T00:00:00.000Z"},
        ])

    monkeypatch.setattr(client.session, "get", fake_get)
    records = client.query_cdms(norad_id=99998, limit=10, raw=True)
    assert {r["CDM_ID"] for r in records} == {"A", "B"}
    assert any("NORAD_CAT_ID_1" in u for u in calls)
    assert any("NORAD_CAT_ID_2" in u for u in calls)


def test_sun_velocity_is_epoch_varying_not_hardcoded():
    from simulators.spice_orbit_sim import SpicePerturbationEngine

    v1 = SpiceOrbitSimulator._ephemeris_velocity_km_s(
        SpicePerturbationEngine.get_sun_position, 0.0
    )
    v2 = SpiceOrbitSimulator._ephemeris_velocity_km_s(
        SpicePerturbationEngine.get_sun_position, 90.0 * 86400.0
    )
    assert 25.0 < float(np.linalg.norm(v1)) < 35.0
    assert not np.allclose(v1, [0.0, 29.78, 0.0])
    assert not np.allclose(v1, v2)


def test_vision_segment_measures_segments_with_confidence():
    first = run_vision_segment(["spacecraft body", "debris fragment"], frame_ref="frame-a")
    second = run_vision_segment(["spacecraft body", "debris fragment"], frame_ref="frame-a")
    assert first == second
    assert first["provider"] == "sam31-offline-simulated"
    assert all(s["confidence"] is not None and s["confidence"] > 0.5 for s in first["segments"])
    assert first["covariance_refinement"]["sigma_scale"] in (0.1, 0.35)


def test_closed_loop_refines_diluted_covariance(monkeypatch):
    """Dilution -> SAM shrink raises revealed Pc (perception-to-control loop)."""
    monkeypatch.delenv("META_API_KEY", raising=False)
    result = run_closed_loop_flight_director(
        "CDM-2026-DILUTION-005 style event",
        {
            "miss_xi_m": 62.0,
            "miss_zeta_m": 62.0,
            "sigma_xi_m": 50000.0,
            "sigma_zeta_m": 40000.0,
            "rho": 0.0,
        },
        mode="fast",
    )
    assert result["vision_refinement"] is not None
    assert result["vision_refinement"]["pc_after_refinement"] > result["vision_refinement"]["pc_before"]
    assert any(t["tool"] == "refine_optical_tracklet_sam31" for t in result["tool_trace"])


def test_closed_loop_recovers_by_extending_lead_time(monkeypatch):
    monkeypatch.delenv("META_API_KEY", raising=False)
    result = run_closed_loop_flight_director(
        "CDM RECOVERY TEST", {"tca_s": 5.0}, mode="fast"
    )
    assert result["initial_verdict"] == "ABORT_NO_SAFE_MANEUVER"
    assert result["recovered_with_extended_lead_time"] is True
    assert result["final_verdict"] == "EXECUTE"
    assert any(t.get("trial_tca_s") == 90.0 for t in result["tool_trace"])
    assert any(t["tool"] == "check_eps_eclipse_budget" for t in result["tool_trace"])
