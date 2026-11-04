"""FastAPI endpoint integration tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.vv.selftest import SAMPLE_CDM_TEXT

client = TestClient(app)

SAMPLE_TLE = {
    "norad_id": "25544",
    "name": "ISS (ZARYA)",
    "line1": "1 25544U 98067A   26272.11005302  .00004557  00000+0  91790-4 0  9991",
    "line2": "2 25544  51.6312 145.7721 0007123 200.7262 159.3438 15.48685648587861",
}


def test_health_endpoint():
    """Verify GET /api/health returns 200 and ok status."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_selftest_endpoint():
    """Verify GET /api/vv/selftest runs 16 live tests with 100% pass rate."""
    resp = client.get("/api/vv/selftest")
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["total"] == 16
    assert data["summary"]["passed"] == 16
    assert data["summary"]["failed"] == 0
    assert len(data["tests"]) == 16


def test_pipeline_endpoint_default():
    """Verify POST /api/vv/pipeline with empty body runs default scenario."""
    resp = client.post("/api/vv/pipeline", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"]["status"] == "EXECUTE"
    assert data["selected"] is not None
    assert data["selected"]["label"] == "INC-NORTH-129"
    assert data["hj"]["maneuver_certified"] is True
    assert data["cbf"]["forward_invariant"] is True


def test_pipeline_endpoint_fault_injection():
    """Verify POST /api/vv/pipeline with insufficient propellant triggers abort."""
    resp = client.post("/api/vv/pipeline", json={"propellant_mass_kg": 0.02})
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"]["status"] == "ABORT_NO_SAFE_MANEUVER"
    assert data["selected"] is None


def test_validate_cdm_endpoint():
    """Verify POST /api/vv/validate-cdm detects inconsistency in sample CDM."""
    resp = client.post("/api/vv/validate-cdm", json={"cdmText": SAMPLE_CDM_TEXT})
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["errors"] >= 1


def test_assess_conjunction_endpoint():
    """Verify POST /api/conjunction/assess propagates orbits and evaluates Pc."""
    payload = {
        "primary_tle": SAMPLE_TLE,
        "secondary_tle": SAMPLE_TLE,
        "epoch": "2026-09-29T12:00:00Z",
        "hard_body_radius": 10.0,
    }
    resp = client.post("/api/conjunction/assess", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "miss_distance_km" in data
    assert "probability_of_collision" in data
    assert "b_plane" in data
    assert "relative_velocity_km_s" in data


def test_cdm_traffic_endpoint():
    """Verify GET /api/cdm/traffic returns ingested CDMs in AEGIS-MESH format."""
    resp = client.get("/api/cdm/traffic")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["count"] >= 1
    assert "conjunctions" in data
    first = data["conjunctions"][0]
    assert "primary_object" in first
    assert "secondary_object" in first
    assert "urgency_metrics" in first


def test_cdm_assess_urgency_endpoint():
    """Verify POST /api/cdm/assess-urgency computes CARA urgency metrics."""
    payload = {
        "tca": "2026-10-04T06:00:00Z",
        "relative_position": [30.0, -120.0, 45.0],
        "combined_covariance": [
            [500.0, 50.0, 0.0],
            [50.0, 3000.0, 20.0],
            [0.0, 20.0, 400.0],
        ],
        "current_time": "2026-10-03T18:00:00Z",
        "hard_body_radius_m": 12.0,
        "reported_pc": 3.2e-4,
    }
    resp = client.post("/api/cdm/assess-urgency", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    metrics = data["metrics"]
    assert "mahalanobis_distance_3d" in metrics
    assert "time_to_tca_hours" in metrics
    assert metrics["urgency_tier"] in ["TIER_1_CRITICAL", "TIER_2_HIGH"]


def test_epg_graph_endpoint_schema_and_structure():
    """Verify GET /api/epg/graph returns Knowledge Graph schema, physical constraint nodes, and CLM reasoning."""
    resp = client.get("/api/epg/graph")
    assert resp.status_code == 200
    data = resp.json()

    # Verify top-level structure
    assert "nodes" in data
    assert "edges" in data
    assert "schema" in data
    assert "reasoning_state" in data
    assert "graph" in data

    # Verify schema definition
    schema = data["schema"]
    assert "$schema" in schema
    assert "title" in schema
    assert "entity_types" in schema
    assert "Propellant_Mass" in schema["entity_types"]["concept"]
    assert "Thrust_Capacity" in schema["entity_types"]["concept"]

    # Verify nodes format and required physical constraint & CLM nodes
    node_ids = set()
    for node in data["nodes"]:
        assert "id" in node
        assert "label" in node
        assert "type" in node
        assert node["type"] in ["concept", "rule", "instance"]
        node_ids.add(node["id"])

    assert "Propellant_Mass" in node_ids
    assert "Thrust_Capacity" in node_ids
    assert "CLM_Vector" in node_ids
    assert "Rule_R1_Tsiolkovsky" in node_ids
    assert "Rule_R2_Thrust_DutyCycle" in node_ids

    # Verify edges format and CLM vector evaluation edges
    clm_to_prop = False
    clm_to_thrust = False
    for edge in data["edges"]:
        assert "source" in edge
        assert "target" in edge
        assert "relation" in edge
        if edge["source"] == "CLM_Vector" and edge["target"] == "Propellant_Mass":
            if edge["relation"] == "evaluates_against":
                clm_to_prop = True
        if edge["source"] == "CLM_Vector" and edge["target"] == "Thrust_Capacity":
            if edge["relation"] == "evaluates_against":
                clm_to_thrust = True

    assert clm_to_prop, "Missing CLM_Vector -> Propellant_Mass evaluation edge"
    assert clm_to_thrust, "Missing CLM_Vector -> Thrust_Capacity evaluation edge"

    # Verify reasoning state under nominal defaults
    reasoning = data["reasoning_state"]
    assert "clm_vector" in reasoning
    assert "propellant_evaluation" in reasoning
    assert "thrust_evaluation" in reasoning
    assert reasoning["propellant_evaluation"]["status"] == "PASSED"
    assert reasoning["thrust_evaluation"]["status"] == "PASSED"
    assert reasoning["verdict"] == "ACCEPTED"


def test_epg_graph_propellant_evaluation_pruning():
    """Verify that insufficient propellant triggers Propellant_Mass VIOLATED and PRUNED verdict."""
    resp = client.get("/api/epg/graph?propellant_mass_kg=0.01")
    assert resp.status_code == 200
    data = resp.json()

    # Find Propellant_Mass node
    prop_node = next(n for n in data["nodes"] if n["id"] == "Propellant_Mass")
    assert prop_node["properties"]["evaluation_status"] == "VIOLATED"

    # Verify reasoning state
    reasoning = data["reasoning_state"]
    assert reasoning["propellant_evaluation"]["status"] == "VIOLATED"
    assert reasoning["verdict"] == "PRUNED"


def test_epg_graph_thrust_evaluation_pruning():
    """Verify that insufficient thrust authority triggers Thrust_Capacity VIOLATED and PRUNED verdict."""
    resp = client.get("/api/epg/graph?max_thrust_n=0.05")
    assert resp.status_code == 200
    data = resp.json()

    # Find Thrust_Capacity node
    thrust_node = next(n for n in data["nodes"] if n["id"] == "Thrust_Capacity")
    assert thrust_node["properties"]["evaluation_status"] == "VIOLATED"

    # Verify reasoning state
    reasoning = data["reasoning_state"]
    assert reasoning["thrust_evaluation"]["status"] == "VIOLATED"
    assert reasoning["verdict"] == "PRUNED"


def test_epg_graph_post_endpoint():
    """Verify POST /api/epg/graph correctly processes request body parameters."""
    payload = {
        "candidate_id": 12,
        "sat_mass_kg": 180.0,
        "propellant_mass_kg": 4.0,
        "max_thrust_n": 25.0,
        "tca_s": 50.0,
    }
    resp = client.post("/api/epg/graph", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["reasoning_state"]["clm_vector"]["id"] == 12
    assert data["reasoning_state"]["verdict"] in ["ACCEPTED", "PRUNED"]
    assert len(data["nodes"]) >= 10
    assert len(data["edges"]) >= 15

