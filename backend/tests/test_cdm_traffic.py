"""Unit and verification tests for Space-Track CDM Traffic Pipeline and NASA CARA Urgency Metrics."""

import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
import numpy as np
import pytest

from simulators.cdm_traffic_pipeline import (
    SpaceTrackClient,
    calculate_baseline_urgency_metrics,
    compute_mahalanobis_distance,
    parse_iso_datetime,
    EMBEDDED_FALLBACK_CDMS,
)


class TestSpaceTrackClient:
    """Test suite for SpaceTrackClient REST interaction and fallback mechanisms."""

    def test_client_initialization_defaults(self):
        client = SpaceTrackClient()
        assert not client.is_authenticated
        assert client.base_url == "https://www.space-track.org"
        assert client.fallback_path.exists()

    def test_fallback_json_loading(self):
        client = SpaceTrackClient()
        records = client.load_fallback()
        assert len(records) >= 4
        assert any(r.get("CDM_ID") == "CDM-2026-ISS-001" for r in records)

    def test_fallback_xml_loading(self, tmp_path):
        xml_file = Path(__file__).resolve().parent.parent / "simulators" / "fallback_cdm_data.xml"
        client = SpaceTrackClient(fallback_path=xml_file)
        records = client.load_fallback(xml_file)
        assert len(records) >= 1
        assert "ISS (ZARYA)" in str(records[0].get("OBJECT1_NAME", ""))

    def test_fallback_missing_file_uses_embedded(self, tmp_path):
        fake_path = tmp_path / "non_existent_cdm.json"
        client = SpaceTrackClient(fallback_path=fake_path)
        records = client.load_fallback(fake_path)
        assert len(records) == len(EMBEDDED_FALLBACK_CDMS)
        assert records[0]["CDM_ID"] == EMBEDDED_FALLBACK_CDMS[0]["CDM_ID"]

    def test_query_cdms_unauthenticated_returns_aegis_mesh(self):
        client = SpaceTrackClient(identity="", password="")
        cdms = client.query_cdms(limit=5)
        assert len(cdms) > 0
        first = cdms[0]
        # Verify official AEGIS-MESH schema fields
        assert "cdm_id" in first
        assert "primary_object" in first
        assert "secondary_object" in first
        assert "relative_state" in first
        assert "combined_covariance_rtn_m2" in first
        assert "urgency_metrics" in first
        assert first["source"] == "local-fallback"

    def test_conjunction_urgency_filter(self):
        client = SpaceTrackClient()
        cdms = client.query_cdms(limit=10)
        critical_only = client.filter_conjunctions(cdms, min_urgency="TIER_1_CRITICAL")
        for cdm in critical_only:
            assert cdm["urgency_metrics"]["urgency_tier"] == "TIER_1_CRITICAL"


class TestCARAUrgencyMetrics:
    """Test suite for NASA CARA Baseline Urgency Metrics."""

    def test_mahalanobis_analytic_known_case(self):
        # Diagonal covariance: var = [100, 400, 900] -> std = [10, 20, 30]
        # Diff = [20, 20, 30] -> (20/10)^2 + (20/20)^2 + (30/30)^2 = 4 + 1 + 1 = 6
        C = np.diag([100.0, 400.0, 900.0])
        diff = np.array([20.0, 20.0, 30.0])
        d_m, d_m_sq, pos_def = compute_mahalanobis_distance(diff, C)
        assert pos_def is True
        assert pytest.approx(d_m_sq, rel=1e-5) == 6.0
        assert pytest.approx(d_m, rel=1e-5) == math.sqrt(6.0)

    def test_mahalanobis_singular_covariance_handling(self):
        # Singular matrix (rank deficient) should not raise LinAlgError
        C_singular = np.array([
            [100.0, 100.0, 0.0],
            [100.0, 100.0, 0.0],
            [0.0, 0.0, 100.0],
        ])
        diff = np.array([10.0, 10.0, 10.0])
        d_m, d_m_sq, pos_def = compute_mahalanobis_distance(diff, C_singular)
        assert pos_def is False
        assert d_m > 0.0
        assert not math.isnan(d_m)

    def test_time_to_tca_horizons(self):
        now = datetime.now(timezone.utc)
        tca_12h = now + timedelta(hours=12)
        tca_30h = now + timedelta(hours=30)
        tca_60h = now + timedelta(hours=60)
        tca_past = now - timedelta(hours=2)

        C = np.eye(3) * 1000.0
        r_pos = [100.0, 100.0, 100.0]

        m_12h = calculate_baseline_urgency_metrics(tca_12h, r_pos, C, current_time=now)
        assert m_12h["horizon_category"] == "CRITICAL_LE24H"
        assert pytest.approx(m_12h["time_to_tca_hours"], rel=1e-2) == 12.0

        m_30h = calculate_baseline_urgency_metrics(tca_30h, r_pos, C, current_time=now)
        assert m_30h["horizon_category"] == "WARNING_24_TO_48H"

        m_60h = calculate_baseline_urgency_metrics(tca_60h, r_pos, C, current_time=now)
        assert m_60h["horizon_category"] == "WATCH_48_TO_72H"

        m_past = calculate_baseline_urgency_metrics(tca_past, r_pos, C, current_time=now)
        assert m_past["horizon_category"] == "PAST_TCA"
        assert m_past["is_actionable"] is False

    def test_tier_1_critical_classification(self):
        # High Pc >= 1e-4 and small miss within 24h
        now = "2026-10-03T12:00:00.000Z"
        tca = "2026-10-03T18:00:00.000Z"  # 6h
        r_pos = [25.0, -10.0, 15.0]
        C = np.diag([200.0, 800.0, 200.0])

        metrics = calculate_baseline_urgency_metrics(
            tca=tca,
            relative_position=r_pos,
            combined_covariance=C,
            current_time=now,
            reported_pc=2.5e-3,
        )
        assert metrics["urgency_tier"] == "TIER_1_CRITICAL"
        assert metrics["is_actionable"] is True
        assert "CRITICAL COLLISION RISK" in metrics["action_recommendation"]

    def test_probability_dilution_detection(self):
        # Small physical miss distance (80m) but massive covariance (var = 1e8)
        # causes reported Pc to drop to 1e-9 even though object is extremely close.
        now = "2026-10-03T12:00:00.000Z"
        tca = "2026-10-03T20:00:00.000Z"  # 8h
        r_pos = [20.0, -50.0, 30.0]  # ~61m miss distance
        C_massive = np.diag([1e7, 5e7, 1e7])

        metrics = calculate_baseline_urgency_metrics(
            tca=tca,
            relative_position=r_pos,
            combined_covariance=C_massive,
            current_time=now,
            reported_pc=1.5e-9,  # Artificially diluted Pc
            hard_body_radius_m=10.0,
        )
        assert metrics["probability_dilution_risk"] is True
        assert metrics["urgency_tier"] == "TIER_1_CRITICAL"
        assert metrics["is_actionable"] is True
        assert metrics["max_collision_probability"] > 1e-4

    def test_iso_parsing_formats(self):
        dt1 = parse_iso_datetime("2026-10-03T12:34:56Z")
        assert dt1.year == 2026 and dt1.month == 10 and dt1.hour == 12
        dt2 = parse_iso_datetime("2026-10-03T12:34:56.789+00:00")
        assert dt2.tzinfo == timezone.utc
