"""Unit and verification tests for the AEGIS-MESH V&V pipeline."""

import pytest
import numpy as np

from app.vv.selftest import run_selftest, SAMPLE_CDM_TEXT
from app.vv.pipeline import run_vv_pipeline
from app.vv.cdm_validator import validate_cdm
from app.clm_engine import CLMEngine
from app.cara_engine import CARAEngine


# Pre-run selftest to parametrize test cases
_selftest_results = run_selftest()


@pytest.mark.parametrize(
    "test_item",
    _selftest_results["tests"],
    ids=[t["id"] for t in _selftest_results["tests"]],
)
def test_selftest_suite(test_item):
    """Parametrized execution of each individual V&V verification oracle."""
    assert test_item["passed"] is True, (
        f"Test {test_item['id']} ({test_item['name']}) failed: "
        f"actual={test_item['actual']}, expected={test_item['expected']}, "
        f"error={test_item['error']}, tolerance={test_item['tolerance']}"
    )


def test_default_pipeline_execution():
    """Verify default scenario reproduces expected physics verdict and metrics."""
    res = run_vv_pipeline()

    # Verdict and certifications
    assert res["verdict"]["status"] == "EXECUTE"
    assert res["cbf"]["forward_invariant"] is True
    assert res["hj"]["maneuver_certified"] is True

    # Check candidate selection
    assert res["selected"] is not None
    assert res["selected"]["label"] == "INC-NORTH-129"
    assert res["validation"]["evaluated"] == 13
    assert res["validation"]["rejected"] == 12

    # Physical checks
    assert res["assessment"]["triggered"] is True
    assert res["assessment"]["pc_pre"] > 1e-4
    assert res["assessment"]["pc_post"] < 1e-4
    assert res["hj"]["maneuver_guaranteed_miss_m"] > 0.0
    assert res["cbf"]["nominal_min_h_after_entry"] < 0.0

    # Timing checks: whole pipeline should be fast
    assert res["stage_timings_ms"]["total"] < 2500.0


def test_fault_injection_propellant_budget():
    """Fault injection: 20 grams of propellant should exhaust budget and trigger ABORT_NO_SAFE_MANEUVER."""
    res = run_vv_pipeline({"propellant_mass_kg": 0.02})

    assert res["verdict"]["status"] == "ABORT_NO_SAFE_MANEUVER"
    assert res["selected"] is None
    assert res["validation"]["rejected"] >= 10
    # Every candidate evaluated should have failed R1
    for cand in res["validation"]["candidates"]:
        r1 = next(r for r in cand["rules"] if r["id"] == "R1")
        assert r1["passed"] is False


def test_cdm_validator_sample():
    """Verify CDM validator detects inconsistency in repo sample CDM."""
    res = validate_cdm(SAMPLE_CDM_TEXT)

    assert res["valid"] is False
    assert res["errors"] >= 1
    # Specific check for MISS_DISTANCE vs RTN
    miss_check = next(c for c in res["checks"] if c["id"] == "CDM-MISS-CONSISTENCY")
    assert miss_check["passed"] is False
    assert miss_check["severity"] == "error"


def test_clm_ranking():
    """Verify CLMEngine.rank_candidates returns 256 sorted candidates."""
    clm = CLMEngine()
    telemetry = [40.0, 0.2, 11.0, 45.0]
    cands = clm.rank_candidates(telemetry)

    assert len(cands) == 256
    assert cands[0]["rank"] == 1
    assert cands[-1]["rank"] == 256

    # Verify scores are monotonically non-increasing
    scores = [c["score"] for c in cands]
    assert all(scores[i] >= scores[i + 1] for i in range(len(scores) - 1))


def test_cara_engine_quadrature():
    """Verify CARAEngine Gauss-Legendre polar quadrature accuracy and rotation invariance."""
    cara = CARAEngine()
    C = np.array([[100.0 ** 2, 0.0], [0.0, 100.0 ** 2]])
    R = 20.0
    ref_zero = 1.0 - np.exp(-(R ** 2) / (2.0 * 100.0 ** 2))
    pc_zero = cara.compute_probability(np.array([0.0, 0.0]), C, R)
    assert abs(pc_zero - ref_zero) / ref_zero < 1e-8
