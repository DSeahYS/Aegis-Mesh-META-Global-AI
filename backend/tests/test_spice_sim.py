"""
Unit and Integration Tests for AEGIS-MESH SPICE Orbit Simulator.
Tests kernel management, spkezr queries, fallback physics, non-gravitational
perturbations (SRP, Albedo, Drag), RK4 orbital propagation, and FastAPI endpoints.
"""

import math
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from simulators.spice_orbit_sim import (
    SpiceOrbitSimulator,
    SpiceKernelManager,
    SpicePerturbationEngine,
    SpicePropagateRequest,
    SatellitePropertiesDTO,
    MU_EARTH,
    R_EARTH,
    SPICE_AVAILABLE,
)

client = TestClient(app)


@pytest.fixture(scope="module")
def simulator():
    """Provides a shared initialized SpiceOrbitSimulator instance."""
    sim = SpiceOrbitSimulator(auto_init_kernels=True)
    yield sim
    sim.kernel_manager.unload_all()


class TestSpiceKernelManager:
    """Tests for NAIF kernel downloading, synthesis, loading, and pool status."""

    def test_mock_kernel_generation(self, tmp_path):
        km = SpiceKernelManager(kernel_dir=str(tmp_path))
        lsk, pck = km.create_mock_text_kernels()
        assert (tmp_path / "naif0012_mock.tls").exists()
        assert (tmp_path / "pck00010_mock.tpc").exists()

        if SPICE_AVAILABLE:
            spk = km.create_mock_satellite_spk()
            assert spk is not None
            assert (tmp_path / "sample_sat.bsp").exists()

    def test_kernel_pool_status_and_loading(self, simulator):
        if not SPICE_AVAILABLE:
            pytest.skip("SpiceyPy not available")
        status = simulator.kernel_manager.get_status()
        assert status.spice_available is True
        assert "CSPICE" in status.toolkit_version
        assert status.loaded_kernels_count >= 1
        assert status.loaded_kernels_count >= 1


class TestSpiceStateVectorQueries:
    """Tests for spiceypy.spkezr state calculation and graceful analytical fallbacks."""

    def test_spkezr_query_mock_satellite(self, simulator):
        """Querying known satellite -999001 in loaded SPK should return spice_kernel."""
        if not SPICE_AVAILABLE:
            pytest.skip("SpiceyPy not available")
        state = simulator.get_state_vector(
            target_body="-999001",
            epoch_iso_or_et="2026-10-03T12:00:00Z",
            observer_body="EARTH",
            ref_frame="J2000"
        )
        assert state.calculation_source == "spice_kernel"
        assert state.target_body == "-999001"
        assert state.observer_body == "EARTH"
        assert len(state.position_km) == 3
        assert len(state.velocity_km_s) == 3

        # Orbital radius should match altitude 550km: ~6928 km
        r_mag = np.linalg.norm(state.position_km)
        assert 6900.0 < r_mag < 6960.0

        # Orbital velocity should be ~7.58 km/s
        v_mag = np.linalg.norm(state.velocity_km_s)
        assert 7.4 < v_mag < 7.8

    def test_fallback_when_kernel_ephemeris_missing(self, simulator):
        """Querying a celestial body without loaded DE430 should fall back gracefully."""
        sun_state = simulator.get_state_vector("SUN", "2026-10-03T12:00:00Z")
        # Should gracefully return analytical fallback without crashing
        assert sun_state.calculation_source in ["analytical_fallback", "spice_kernel"]
        r_sun_mag = np.linalg.norm(sun_state.position_km)
        # 1 AU is ~1.496e8 km; check distance within astronomical range
        assert 1.45e8 < r_sun_mag < 1.53e8

        moon_state = simulator.get_state_vector("MOON", "2026-10-03T12:00:00Z")
        assert moon_state.calculation_source in ["analytical_fallback", "spice_kernel"]
        r_moon_mag = np.linalg.norm(moon_state.position_km)
        # Moon distance is ~384,400 km
        assert 3.5e5 < r_moon_mag < 4.2e5


class TestNonGravitationalPerturbations:
    """Tests for SRP, Earth Albedo, IR, and Atmospheric Drag force models."""

    def test_solar_radiation_pressure_conical_shadow(self):
        engine = SpicePerturbationEngine()
        # Sun at [1.5e8, 0, 0] km
        r_sun = np.array([1.496e8, 0.0, 0.0])

        # 1. Satellite in full sunlight (e.g. noon side, +X)
        r_sunlit = np.array([7000.0, 0.0, 0.0])
        nu_sunlit = engine.compute_conical_shadow_factor(r_sunlit, r_sun)
        assert nu_sunlit == 1.0

        a_srp, nu = engine.compute_srp_acceleration(
            r_sat=r_sunlit,
            r_sun=r_sun,
            mass_kg=250.0,
            area_m2=3.5,
            cr=1.3
        )
        assert nu == 1.0
        # SRP acceleration should point away from Sun (-X direction)
        assert a_srp[0] < 0.0
        # Magnitude should be on order of 10^-8 m/s^2 (10^-11 km/s^2)
        a_srp_mag_m_s2 = np.linalg.norm(a_srp) * 1000.0
        assert 1e-9 < a_srp_mag_m_s2 < 1e-6

        # 2. Satellite directly behind Earth in deep umbra (-X side)
        r_umbra = np.array([-7000.0, 0.0, 0.0])
        nu_umbra = engine.compute_conical_shadow_factor(r_umbra, r_sun)
        assert nu_umbra == 0.0

        a_srp_umbra, _ = engine.compute_srp_acceleration(
            r_sat=r_umbra,
            r_sun=r_sun,
            mass_kg=250.0,
            area_m2=3.5,
            cr=1.3
        )
        assert np.linalg.norm(a_srp_umbra) == 0.0

    def test_earth_albedo_and_thermal_ir(self):
        engine = SpicePerturbationEngine()
        r_sun = np.array([1.496e8, 0.0, 0.0])

        # Day side satellite (+X)
        r_sat_day = np.array([7000.0, 0.0, 0.0])
        a_albedo_day = engine.compute_earth_albedo_acceleration(
            r_sat=r_sat_day,
            r_sun=r_sun,
            mass_kg=250.0,
            area_m2=3.5,
            cr=1.3
        )
        # Should push radially outward (+X)
        assert a_albedo_day[0] > 0.0
        albedo_mag_m_s2 = np.linalg.norm(a_albedo_day) * 1000.0
        assert 1e-9 < albedo_mag_m_s2 < 1e-6

        # Night side satellite (-X) -> albedo should be 0
        r_sat_night = np.array([-7000.0, 0.0, 0.0])
        a_albedo_night = engine.compute_earth_albedo_acceleration(
            r_sat=r_sat_night,
            r_sun=r_sun,
            mass_kg=250.0,
            area_m2=3.5,
            cr=1.3
        )
        assert np.linalg.norm(a_albedo_night) == 0.0

        # Thermal IR should be non-zero on both day and night
        a_ir_night = engine.compute_earth_thermal_ir_acceleration(
            r_sat=r_sat_night,
            mass_kg=250.0,
            area_m2=3.5,
            cr=1.3
        )
        assert a_ir_night[0] < 0.0  # outward from Earth center in -X
        assert np.linalg.norm(a_ir_night) > 0.0

    def test_atmospheric_drag(self):
        engine = SpicePerturbationEngine()
        # 300 km LEO circular velocity ~ 7.7 km/s
        r_leo = np.array([R_EARTH + 300.0, 0.0, 0.0])
        v_leo = np.array([0.0, 7.73, 0.0])

        a_drag = engine.compute_atmospheric_drag_acceleration(
            r_sat=r_leo,
            v_sat=v_leo,
            mass_kg=250.0,
            area_m2=2.5,
            cd=2.2
        )
        # Drag must oppose velocity vector (-Y direction)
        assert a_drag[1] < 0.0
        a_drag_m_s2 = np.linalg.norm(a_drag) * 1000.0
        assert 1e-8 < a_drag_m_s2 < 1e-3


class TestPrecisionOrbitPropagation:
    """Tests for numerical RK4 orbit integration."""

    def test_rk4_circular_leo_propagation(self, simulator):
        # 500 km circular orbit
        r0 = [R_EARTH + 500.0, 0.0, 0.0]
        v0 = [0.0, math.sqrt(MU_EARTH / (R_EARTH + 500.0)), 0.0]

        req = SpicePropagateRequest(
            initial_position_km=r0,
            initial_velocity_km_s=v0,
            epoch_iso="2026-10-03T12:00:00Z",
            duration_seconds=300.0,
            step_seconds=30.0,
            enable_srp=True,
            enable_albedo=True,
            enable_third_body=True,
            enable_drag=True
        )

        res = simulator.propagate_orbit(req)
        assert res.total_steps == 11
        assert len(res.trajectory) == 11
        assert res.execution_time_ms > 0.0

        final_step = res.trajectory[-1]
        assert final_step.elapsed_seconds == 300.0
        # Check altitude remains near 500 km
        assert 495.0 < final_step.altitude_km < 505.0
        # Perturbation breakdown verified
        p = final_step.perturbations
        assert p is not None
        assert abs(p.j2_oblateness_m_s2[0]) > 0.0 or abs(p.j2_oblateness_m_s2[1]) > 0.0


class TestFastApiSpiceEndpoints:
    """Integration tests for FastAPI SPICE endpoints."""

    def test_get_spice_status_endpoint(self):
        resp = client.get("/api/spice/status")
        assert resp.status_code == 200
        data = resp.json()
        if SPICE_AVAILABLE:
            assert data["spice_available"] is True
            assert data["loaded_kernels_count"] >= 1
        else:
            assert data["spice_available"] is False

    def test_get_spice_state_endpoint(self):
        resp = client.get("/api/spice/state?target=-999001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["target_body"] == "-999001"
        assert len(data["position_km"]) == 3
        assert len(data["velocity_km_s"]) == 3

    def test_propagate_spice_orbit_endpoint(self):
        payload = {
            "initial_position_km": [6928.1363, 0.0, 0.0],
            "initial_velocity_km_s": [0.0, 7.584, 0.0],
            "epoch_iso": "2026-10-03T12:00:00Z",
            "duration_seconds": 120.0,
            "step_seconds": 60.0,
            "enable_srp": True,
            "enable_albedo": True,
            "enable_third_body": True,
            "enable_drag": True,
        }
        resp = client.post("/api/spice/propagate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_steps"] == 3
        assert len(data["trajectory"]) == 3
        assert "kernel_status" in data
        assert data["trajectory"][0]["perturbations"] is not None
