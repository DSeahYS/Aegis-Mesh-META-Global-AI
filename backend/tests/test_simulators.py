"""Unit and validation tests for CubeSat EPS and Tegra hardware simulators."""

import os
import tempfile
import pytest

from simulators.eps_power_sim import (
    EPSSimulator,
    EPSConfig,
    OrbitalConfig,
    BatteryConfig,
    SolarArrayConfig,
    TransientSpike,
)
from simulators.hw_profiling_tegra import (
    TegraStatsParser,
    INA3221Reader,
    HardwareProfiler,
    benchmark_hj_cbf_solver,
)


def test_eps_orbital_illumination_and_eclipse():
    """Verify sunlit vs eclipse phase transitions and illumination fraction."""
    sim = EPSSimulator()
    orbit_period_s = 5400.0  # 90 minutes
    t_sunlit = orbit_period_s * (1.0 - 0.36)  # 3456 s

    # Mid-day sunlight
    illum_sun, phase_sun = sim.compute_illumination(1000.0, orbit_period_s)
    assert phase_sun == "SUNLIT"
    assert illum_sun == 1.0

    # Deep eclipse
    illum_ecl, phase_ecl = sim.compute_illumination(4200.0, orbit_period_s)
    assert phase_ecl == "ECLIPSE"
    assert illum_ecl == 0.0

    # Solar power generation in eclipse must be 0
    p_solar_ecl = sim.compute_solar_power(4200.0, orbit_period_s, illum_ecl, -30.0)
    assert p_solar_ecl == 0.0

    # Solar power generation in sunlight must be positive
    p_solar_sun = sim.compute_solar_power(1800.0, orbit_period_s, illum_sun, 50.0)
    assert p_solar_sun > 15.0


def test_eps_simulation_transient_cbf_spike():
    """Verify execution of EPS simulation and transient 10W CBF power spike injection."""
    cfg = EPSSimulator.default_config()
    cfg.dt_s = 2.0  # Fast step for test
    sim = EPSSimulator(cfg)
    result = sim.run_simulation()

    assert result.duration_s == 5400.0
    assert len(result.telemetry) > 0
    assert result.total_energy_gen_wh > 10.0
    assert result.total_energy_cons_wh > 5.0
    assert result.peak_dod_pct < cfg.battery.flight_dod_limit_pct
    assert result.dod_margin_ok is True

    # Find the telemetry step during the HJ-CBF solver spike (t = 3900 s)
    cbf_steps = [s for s in result.telemetry if "HJ_CBF_SOLVER_SPIKE" in s.active_spike_names]
    assert len(cbf_steps) > 0

    # Verify 10W transient spike added to baseline load
    sample_cbf = cbf_steps[0]
    assert sample_cbf.load_spikes_w == 10.0
    assert sample_cbf.load_total_w == pytest.approx(sample_cbf.load_avionics_w + 10.0, rel=1e-3)
    assert sample_cbf.orbit_phase == "ECLIPSE"
    # Current should be higher due to discharge in eclipse
    assert sample_cbf.battery_current_a > 0.9


def test_eps_csv_and_plot_export():
    """Verify CSV export and Matplotlib rendering."""
    sim = EPSSimulator()
    result = sim.run_simulation()

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "test_power.csv")
        plot_path = os.path.join(tmpdir, "test_plot.png")

        sim.export_csv(result, csv_path)
        assert os.path.exists(csv_path)
        assert os.path.getsize(csv_path) > 1000

        sim.generate_plot(result, plot_path)
        assert os.path.exists(plot_path)
        assert os.path.getsize(plot_path) > 5000


def test_tegrastats_parser_orin_format():
    """Test parsing NVIDIA Jetson Orin tegrastats output."""
    raw_orin = (
        "RAM 2842/7620MB (lfb 18x4MB) SWAP 0/3810MB (cached 0MB) "
        "CPU [12%@1984,14%@1984,8%@1984,10%@1984] EMC_FREQ 0% GR3D_FREQ 45%@1300 "
        "NVDEC 115 VIC_FREQ 0% APE 150 MTS fg 0% bg 1% AO 42C GPU 45C PMIC 50C "
        "AUX 43C CPU 46C thermal 44.8C VDD_IN 6850mW/6850mW VDD_CPU_GPU_CV 3200mW/3200mW "
        "VDD_SOC 1450mW/1450mW"
    )
    sample = TegraStatsParser.parse_line(raw_orin, timestamp_s=1.5)
    assert sample is not None
    assert sample.power_total_w == pytest.approx(6.850, abs=1e-3)
    assert sample.power_cpu_w == pytest.approx(3.200, abs=1e-3)
    assert sample.power_soc_w == pytest.approx(1.450, abs=1e-3)
    assert sample.temp_cpu_c == 46.0
    assert sample.temp_gpu_c == 45.0
    assert sample.temp_thermal_c == 44.8
    assert sample.gpu_util_pct == 45.0
    assert sample.cpu_util_avg_pct == pytest.approx(11.0, abs=0.5)
    assert sample.ram_used_mb == 2842.0
    assert sample.ram_total_mb == 7620.0


def test_tegrastats_parser_xavier_format():
    """Test parsing NVIDIA Jetson Xavier POM_5V rail format."""
    raw_xavier = (
        "RAM 1958/7772MB CPU [15%@1190,12%@1190] GR3D_FREQ 35% "
        "CPU@44C GPU@42.5C POM_5V_IN 5400/5400 POM_5V_CPU 2100/2100 POM_5V_GPU 1600/1600"
    )
    sample = TegraStatsParser.parse_line(raw_xavier, timestamp_s=2.0)
    assert sample is not None
    assert sample.power_total_w == pytest.approx(5.400, abs=1e-3)
    assert sample.power_cpu_w == pytest.approx(2.100, abs=1e-3)
    assert sample.power_gpu_w == pytest.approx(1.600, abs=1e-3)
    assert sample.temp_cpu_c == 44.0
    assert sample.temp_gpu_c == 42.5
    assert sample.gpu_util_pct == 35.0


def test_hardware_profiler_workload_and_cbf_solver():
    """Test profiling a live Hamilton-Jacobi CBF solver workload."""
    profiler = HardwareProfiler(sample_interval_ms=50, force_mock=True, spike_w=10.0)

    # Profile 1 fast iteration of the HJ solver
    res, report = profiler.profile_workload(
        lambda: benchmark_hj_cbf_solver(iterations=1),
        name="HJ-CBF Unit Test Run",
        pre_settle_s=0.2,
        post_settle_s=0.2,
    )

    assert res["iterations"] == 1
    assert report.workload_name == "HJ-CBF Unit Test Run"
    assert report.duration_s > 0.05
    assert report.sample_count >= 5
    assert report.baseline_power_w < 5.0
    assert report.active_power_mean_w > 12.0
    assert report.transient_delta_w == pytest.approx(10.0, abs=1.5)
    assert report.energy_joules > 0.0

    with tempfile.TemporaryDirectory() as tmpdir:
        csv_file = os.path.join(tmpdir, "prof.csv")
        json_file = os.path.join(tmpdir, "prof.json")

        profiler.export_csv(profiler._samples, csv_file)
        profiler.export_json(report, json_file)

        assert os.path.exists(csv_file)
        assert os.path.exists(json_file)
