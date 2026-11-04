"""AEGIS-MESH NVIDIA Tegra & INA3221 Hardware Power Profiling Wrapper.

Designed for physical edge devices (NVIDIA Jetson Orin Nano, Xavier NX, AGX Orin)
to measure real hardware power, thermal envelopes, and energy dissipation:
1. TegraStats parser: Robust regex parser for `tegrastats` streaming output.
2. INA3221 sysfs reader: Direct low-latency hardware monitor parsing for TI INA3221 I2C power ICs.
3. Workload Profiler: Measures baseline power, active power, transient delta (W), and energy (Joules).
4. Direct integration with the AEGIS-MESH Hamilton-Jacobi CBF solver (`--run-hj-cbf`).
5. Hardware auto-detection with high-fidelity mock fallback for non-Tegra development machines.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Callable, Tuple


@dataclass
class TegraSample:
    """Parsed hardware power, thermal, and compute telemetry sample."""
    timestamp_s: float
    power_total_w: float                    # Primary rail power (VDD_IN or POM_5V_IN)
    power_cpu_w: Optional[float] = None     # CPU power rail
    power_gpu_w: Optional[float] = None     # GPU / CV power rail
    power_soc_w: Optional[float] = None     # SoC power rail
    temp_cpu_c: Optional[float] = None      # CPU thermal zone (deg C)
    temp_gpu_c: Optional[float] = None      # GPU thermal zone (deg C)
    temp_thermal_c: Optional[float] = None  # Board ambient / thermal junction (deg C)
    gpu_util_pct: Optional[float] = None    # GPU engine utilization (0 - 100%)
    cpu_util_avg_pct: Optional[float] = None# Mean CPU core utilization (0 - 100%)
    ram_used_mb: Optional[float] = None     # Physical RAM utilized
    ram_total_mb: Optional[float] = None    # Total physical RAM
    source: str = "tegrastats"              # "tegrastats", "ina3221_sysfs", or "mock"
    raw_line: str = ""


@dataclass
class ProfileReport:
    """Summary metrics of a hardware profiling session."""
    workload_name: str
    duration_s: float
    sample_count: int
    baseline_power_w: float
    active_power_mean_w: float
    peak_power_w: float
    min_power_w: float
    transient_delta_w: float
    energy_joules: float
    energy_mwh: float
    peak_cpu_temp_c: Optional[float]
    peak_gpu_temp_c: Optional[float]
    hardware_source: str
    is_simulated_mock: bool
    timestamps: List[float] = field(default_factory=list)
    power_w_series: List[float] = field(default_factory=list)


class TegraStatsParser:
    """Robust parser for NVIDIA Jetson `tegrastats` streaming logs."""

    # Regex patterns matching Orin, Xavier, TX2, and Nano formats
    RE_RAM = re.compile(r"RAM\s+(\d+)/(\d+)MB")
    RE_CPU_CORES = re.compile(r"CPU\s+\[(.*?)\]")
    RE_GR3D = re.compile(r"GR3D_FREQ\s+(\d+)%(@\d+)?")
    RE_TEMP_CPU = re.compile(r"CPU[@\s]([\d\.]+)C")
    RE_TEMP_GPU = re.compile(r"GPU[@\s]([\d\.]+)C")
    RE_TEMP_THERMAL = re.compile(r"thermal[@\s]([\d\.]+)C")
    
    # Power rails (mW)
    # Jetson Orin: VDD_IN 6850mW/6850mW VDD_CPU_GPU_CV 3200mW/3200mW VDD_SOC 1450mW/1450mW
    # Jetson Xavier: POM_5V_IN 6120/6120 POM_5V_CPU 2140/2140 POM_5V_GPU 1860/1860
    RE_VDD_IN = re.compile(r"(?:VDD_IN|POM_5V_IN)\s+(\d+)(?:mW)?/(\d+)(?:mW)?")
    RE_VDD_CPU = re.compile(r"(?:VDD_CPU_GPU_CV|POM_5V_CPU|VDD_CPU)\s+(\d+)(?:mW)?/(\d+)(?:mW)?")
    RE_VDD_GPU = re.compile(r"(?:POM_5V_GPU|VDD_GPU)\s+(\d+)(?:mW)?/(\d+)(?:mW)?")
    RE_VDD_SOC = re.compile(r"(?:VDD_SOC|POM_5V_SOC)\s+(\d+)(?:mW)?/(\d+)(?:mW)?")

    @classmethod
    def parse_line(cls, line: str, timestamp_s: float = 0.0) -> Optional[TegraSample]:
        """Parse a single line of tegrastats output."""
        line = line.strip()
        if not line:
            return None

        # 1. Total Power
        power_in_mw = None
        match_in = cls.RE_VDD_IN.search(line)
        if match_in:
            power_in_mw = float(match_in.group(1))
        
        # If no explicit VDD_IN, search for any general mW figure
        if power_in_mw is None:
            # Fallback search for general milliwatt readings
            mw_matches = re.findall(r"(\d+)mW", line)
            if mw_matches:
                power_in_mw = max(float(x) for x in mw_matches)
            else:
                power_in_mw = 4000.0  # Conservative fallback

        power_total_w = power_in_mw / 1000.0

        # 2. Rail breakdowns
        power_cpu_w = None
        match_cpu_p = cls.RE_VDD_CPU.search(line)
        if match_cpu_p:
            power_cpu_w = float(match_cpu_p.group(1)) / 1000.0

        power_gpu_w = None
        match_gpu_p = cls.RE_VDD_GPU.search(line)
        if match_gpu_p:
            power_gpu_w = float(match_gpu_p.group(1)) / 1000.0

        power_soc_w = None
        match_soc_p = cls.RE_VDD_SOC.search(line)
        if match_soc_p:
            power_soc_w = float(match_soc_p.group(1)) / 1000.0

        # 3. Temperatures
        temp_cpu = None
        m_tcpu = cls.RE_TEMP_CPU.search(line)
        if m_tcpu:
            temp_cpu = float(m_tcpu.group(1))

        temp_gpu = None
        m_tgpu = cls.RE_TEMP_GPU.search(line)
        if m_tgpu:
            temp_gpu = float(m_tgpu.group(1))

        temp_thermal = None
        m_tthm = cls.RE_TEMP_THERMAL.search(line)
        if m_tthm:
            temp_thermal = float(m_tthm.group(1))

        # 4. GPU Utilization
        gpu_util = None
        m_gr3d = cls.RE_GR3D.search(line)
        if m_gr3d:
            gpu_util = float(m_gr3d.group(1))

        # 5. CPU Utilization
        cpu_avg = None
        m_cpu = cls.RE_CPU_CORES.search(line)
        if m_cpu:
            core_str = m_cpu.group(1)
            core_pcts = [float(p) for p in re.findall(r"(\d+)%", core_str)]
            if core_pcts:
                cpu_avg = sum(core_pcts) / len(core_pcts)

        # 6. RAM
        ram_used = None
        ram_total = None
        m_ram = cls.RE_RAM.search(line)
        if m_ram:
            ram_used = float(m_ram.group(1))
            ram_total = float(m_ram.group(2))

        return TegraSample(
            timestamp_s=round(timestamp_s, 4),
            power_total_w=round(power_total_w, 3),
            power_cpu_w=round(power_cpu_w, 3) if power_cpu_w is not None else None,
            power_gpu_w=round(power_gpu_w, 3) if power_gpu_w is not None else None,
            power_soc_w=round(power_soc_w, 3) if power_soc_w is not None else None,
            temp_cpu_c=temp_cpu,
            temp_gpu_c=temp_gpu,
            temp_thermal_c=temp_thermal,
            gpu_util_pct=gpu_util,
            cpu_util_avg_pct=round(cpu_avg, 1) if cpu_avg is not None else None,
            ram_used_mb=ram_used,
            ram_total_mb=ram_total,
            source="tegrastats",
            raw_line=line,
        )


class INA3221Reader:
    """Direct Linux sysfs driver interface for TI INA3221 power monitor chips."""

    SYSFS_SEARCH_PATHS = [
        "/sys/bus/i2c/drivers/ina3221x",
        "/sys/bus/i2c/drivers/ina3221",
        "/sys/class/hwmon",
    ]

    def __init__(self):
        self.device_path: Optional[str] = self._locate_device()

    def _locate_device(self) -> Optional[str]:
        """Locate active INA3221 sysfs node on Linux."""
        if not sys.platform.startswith("linux"):
            return None

        # Check /sys/class/hwmon
        hwmon_root = "/sys/class/hwmon"
        if os.path.exists(hwmon_root):
            try:
                for entry in os.listdir(hwmon_root):
                    dir_path = os.path.join(hwmon_root, entry)
                    name_file = os.path.join(dir_path, "name")
                    if os.path.exists(name_file):
                        with open(name_file, "r") as f:
                            dev_name = f.read().strip().lower()
                        if "ina3221" in dev_name:
                            return dir_path
            except Exception:
                pass

        # Check I2C driver entries
        for base in ["/sys/bus/i2c/drivers/ina3221x", "/sys/bus/i2c/drivers/ina3221"]:
            if os.path.exists(base):
                try:
                    for dev in os.listdir(base):
                        hwmon_sub = os.path.join(base, dev, "hwmon")
                        if os.path.exists(hwmon_sub):
                            subdirs = os.listdir(hwmon_sub)
                            if subdirs:
                                return os.path.join(hwmon_sub, subdirs[0])
                except Exception:
                    pass

        return None

    @property
    def is_available(self) -> bool:
        return self.device_path is not None

    def read_sample(self, timestamp_s: float = 0.0) -> Optional[TegraSample]:
        """Read instantaneous voltage and current from INA3221 channels."""
        if not self.device_path:
            return None

        try:
            total_w = 0.0
            cpu_w = None
            gpu_w = None
            soc_w = None

            # INA3221 has 3 channels: in1, in2, in3
            for ch in [1, 2, 3]:
                v_file = os.path.join(self.device_path, f"in{ch}_input")
                curr_file = os.path.join(self.device_path, f"curr{ch}_input")
                label_file = os.path.join(self.device_path, f"in{ch}_label")

                label = f"rail_{ch}"
                if os.path.exists(label_file):
                    with open(label_file, "r") as f:
                        label = f.read().strip().upper()

                if os.path.exists(v_file) and os.path.exists(curr_file):
                    with open(v_file, "r") as f:
                        v_mv = float(f.read().strip())
                    with open(curr_file, "r") as f:
                        i_ma = float(f.read().strip())
                    ch_w = (v_mv * i_ma) / 1.0e6

                    if ch == 1:
                        total_w = ch_w  # Channel 1 is typically main bus / VDD_IN
                    elif "CPU" in label or ch == 2:
                        cpu_w = ch_w
                    elif "GPU" in label or "CV" in label or ch == 3:
                        gpu_w = ch_w
                    elif "SOC" in label:
                        soc_w = ch_w

            if total_w == 0.0 and (cpu_w or gpu_w):
                total_w = sum(filter(None, [cpu_w, gpu_w, soc_w]))

            return TegraSample(
                timestamp_s=round(timestamp_s, 4),
                power_total_w=round(total_w, 3),
                power_cpu_w=round(cpu_w, 3) if cpu_w else None,
                power_gpu_w=round(gpu_w, 3) if gpu_w else None,
                power_soc_w=round(soc_w, 3) if soc_w else None,
                source="ina3221_sysfs",
                raw_line=f"sysfs:{self.device_path}",
            )
        except Exception:
            return None


class MockTegraStream:
    """Generates realistic Tegra hardware telemetry for testing on host dev machines."""

    def __init__(self, baseline_w: float = 3.8, peak_spike_w: float = 10.0):
        self.baseline_w = baseline_w
        self.peak_spike_w = peak_spike_w
        self.is_load_active = False
        self._temp_cpu = 41.5
        self._temp_gpu = 43.0

    def set_load_active(self, active: bool):
        self.is_load_active = active

    def generate_line(self, t_s: float) -> str:
        """Synthesize a realistic NVIDIA Orin Nano `tegrastats` string."""
        import random

        noise = random.uniform(-0.15, 0.15)
        if self.is_load_active:
            # Active compute spike: High CPU/GPU utilization and ~10W surge
            total_w = self.baseline_w + self.peak_spike_w + noise
            cpu_util = min(100, int(75 + random.uniform(-8, 15)))
            gpu_util = min(100, int(85 + random.uniform(-5, 10)))
            cpu_p_mw = int((total_w * 0.45) * 1000)
            gpu_p_mw = int((total_w * 0.40) * 1000)
            soc_p_mw = int((total_w * 0.15) * 1000)
            self._temp_cpu = min(68.0, self._temp_cpu + 0.3)
            self._temp_gpu = min(65.0, self._temp_gpu + 0.35)
        else:
            # Idle baseline
            total_w = self.baseline_w + noise
            cpu_util = max(1, int(12 + random.uniform(-4, 6)))
            gpu_util = max(0, int(random.uniform(0, 5)))
            cpu_p_mw = int((total_w * 0.40) * 1000)
            gpu_p_mw = int((total_w * 0.20) * 1000)
            soc_p_mw = int((total_w * 0.40) * 1000)
            self._temp_cpu = max(41.0, self._temp_cpu - 0.2)
            self._temp_gpu = max(42.5, self._temp_gpu - 0.2)

        tot_p_mw = int(total_w * 1000)
        
        # Emulate standard Tegra Orin line format
        line = (
            f"RAM 2180/7620MB (lfb 114x4MB) SWAP 0/3810MB (cached 0MB) "
            f"CPU [{cpu_util}%@1984,{cpu_util-3}%@1984,8%@1984,10%@1984] "
            f"EMC_FREQ 0% GR3D_FREQ {gpu_util}%@624 VIC_FREQ 0% APE 150 "
            f"AO 41.5C GPU {self._temp_gpu:.1f}C PMIC 50C AUX 42C CPU {self._temp_cpu:.1f}C "
            f"thermal {(self._temp_cpu+self._temp_gpu)/2:.1f}C "
            f"VDD_IN {tot_p_mw}mW/{tot_p_mw}mW "
            f"VDD_CPU_GPU_CV {cpu_p_mw+gpu_p_mw}mW/{cpu_p_mw+gpu_p_mw}mW "
            f"VDD_SOC {soc_p_mw}mW/{soc_p_mw}mW"
        )
        return line


class HardwareProfiler:
    """Comprehensive Hardware Power & Compute Profiler."""

    def __init__(
        self,
        sample_interval_ms: int = 100,
        force_mock: bool = False,
        baseline_w: float = 3.8,
        spike_w: float = 10.0,
    ):
        self.sample_interval_ms = sample_interval_ms
        self.interval_s = sample_interval_ms / 1000.0
        self.ina_reader = INA3221Reader()
        self.has_tegrastats = shutil.which("tegrastats") is not None
        self.force_mock = force_mock
        
        # Determine operating mode
        if force_mock:
            self.mode = "mock"
        elif self.ina_reader.is_available:
            self.mode = "ina3221_sysfs"
        elif self.has_tegrastats:
            self.mode = "tegrastats"
        else:
            self.mode = "mock"

        self.mock_stream = MockTegraStream(baseline_w=baseline_w, peak_spike_w=spike_w)
        self._samples: List[TegraSample] = []
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _sample_worker(self, start_epoch: float):
        """Background sampling loop."""
        proc = None
        if self.mode == "tegrastats":
            try:
                proc = subprocess.Popen(
                    ["tegrastats", "--interval", str(self.sample_interval_ms)],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
            except Exception:
                proc = None
                self.mode = "mock"

        while not self._stop_event.is_set():
            t_now = time.time() - start_epoch
            sample = None

            if self.mode == "tegrastats" and proc and proc.stdout:
                line = proc.stdout.readline()
                if line:
                    sample = TegraStatsParser.parse_line(line, timestamp_s=t_now)
            elif self.mode == "ina3221_sysfs":
                sample = self.ina_reader.read_sample(timestamp_s=t_now)
            else:  # mock
                line = self.mock_stream.generate_line(t_now)
                sample = TegraStatsParser.parse_line(line, timestamp_s=t_now)
                sample.source = "mock"

            if sample:
                self._samples.append(sample)

            time.sleep(self.interval_s)

        if proc:
            proc.terminate()

    def start_sampling(self):
        """Start asynchronous background telemetry collection."""
        self._samples.clear()
        self._stop_event.clear()
        start_epoch = time.time()
        self._thread = threading.Thread(target=self._sample_worker, args=(start_epoch,), daemon=True)
        self._thread.start()

    def stop_sampling(self) -> List[TegraSample]:
        """Stop sampling and retrieve accumulated samples."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=1.5)
        return list(self._samples)

    def profile_workload(
        self,
        workload_fn: Callable[[], Any],
        name: str = "Workload",
        pre_settle_s: float = 1.0,
        post_settle_s: float = 1.0,
    ) -> Tuple[Any, ProfileReport]:
        """Profile a callable with baseline settling and post-workload cooldown."""
        self.start_sampling()

        # 1. Capture baseline quiescent power
        self.mock_stream.set_load_active(False)
        time.sleep(pre_settle_s)
        baseline_cutoff_idx = len(self._samples)

        # 2. Execute workload under profiling
        self.mock_stream.set_load_active(True)
        t_work_start = time.time()
        result = workload_fn()
        workload_duration_s = time.time() - t_work_start

        # 3. Capture cooldown
        self.mock_stream.set_load_active(False)
        time.sleep(post_settle_s)

        samples = self.stop_sampling()

        # Process metrics
        baseline_samples = samples[:baseline_cutoff_idx]
        active_samples = [s for s in samples if s.timestamp_s >= pre_settle_s and s.timestamp_s <= (pre_settle_s + workload_duration_s)]
        if not active_samples:
            active_samples = samples

        p_base = (
            sum(s.power_total_w for s in baseline_samples) / len(baseline_samples)
            if baseline_samples else 3.8
        )
        p_active_mean = sum(s.power_total_w for s in active_samples) / len(active_samples)
        p_peak = max(s.power_total_w for s in samples)
        p_min = min(s.power_total_w for s in samples)
        p_delta = max(0.0, p_active_mean - p_base)

        # Numerical integration of energy (Trapezoidal Rule)
        energy_joules = 0.0
        for i in range(1, len(samples)):
            dt = samples[i].timestamp_s - samples[i-1].timestamp_s
            p_avg = (samples[i].power_total_w + samples[i-1].power_total_w) / 2.0
            energy_joules += p_avg * dt

        energy_mwh = (energy_joules / 3600.0) * 1000.0

        cpu_temps = [s.temp_cpu_c for s in samples if s.temp_cpu_c is not None]
        gpu_temps = [s.temp_gpu_c for s in samples if s.temp_gpu_c is not None]

        report = ProfileReport(
            workload_name=name,
            duration_s=round(workload_duration_s, 4),
            sample_count=len(samples),
            baseline_power_w=round(p_base, 2),
            active_power_mean_w=round(p_active_mean, 2),
            peak_power_w=round(p_peak, 2),
            min_power_w=round(p_min, 2),
            transient_delta_w=round(p_delta, 2),
            energy_joules=round(energy_joules, 2),
            energy_mwh=round(energy_mwh, 3),
            peak_cpu_temp_c=max(cpu_temps) if cpu_temps else None,
            peak_gpu_temp_c=max(gpu_temps) if gpu_temps else None,
            hardware_source=self.mode,
            is_simulated_mock=(self.mode == "mock"),
            timestamps=[s.timestamp_s for s in samples],
            power_w_series=[s.power_total_w for s in samples],
        )

        return result, report

    def export_csv(self, samples: List[TegraSample], output_path: str) -> str:
        """Export raw samples to CSV."""
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        fieldnames = [
            "timestamp_s",
            "power_total_w",
            "power_cpu_w",
            "power_gpu_w",
            "power_soc_w",
            "temp_cpu_c",
            "temp_gpu_c",
            "gpu_util_pct",
            "cpu_util_avg_pct",
            "ram_used_mb",
            "source",
        ]
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(fieldnames)
            for s in samples:
                writer.writerow([
                    s.timestamp_s,
                    s.power_total_w,
                    s.power_cpu_w or "",
                    s.power_gpu_w or "",
                    s.power_soc_w or "",
                    s.temp_cpu_c or "",
                    s.temp_gpu_c or "",
                    s.gpu_util_pct or "",
                    s.cpu_util_avg_pct or "",
                    s.ram_used_mb or "",
                    s.source,
                ])
        return output_path

    def export_json(self, report: ProfileReport, output_path: str) -> str:
        """Export report summary to JSON."""
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(asdict(report), f, indent=2)
        return output_path


def benchmark_hj_cbf_solver(iterations: int = 5) -> Dict[str, Any]:
    """Execute Hamilton-Jacobi Reachability PDE solver to generate authentic compute load."""
    try:
        from app.vv.hj_reachability import solve_hj_grid
    except ImportError:
        # Fallback path if run directly inside backend/simulators
        sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        from app.vv.hj_reachability import solve_hj_grid

    timings_ms = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        # 121x121 semi-Lagrangian dynamic programming grid
        V, y, v, solve_ms = solve_hj_grid(
            u_max=0.1466,
            d_max=0.010,
            R=15.0,
            horizon_s=40.0,
            dt_s=0.25,
            grid_n=121,
        )
        timings_ms.append((time.perf_counter() - t0) * 1000.0)

    return {
        "iterations": iterations,
        "mean_solve_ms": sum(timings_ms) / len(timings_ms),
        "min_solve_ms": min(timings_ms),
        "max_solve_ms": max(timings_ms),
    }


def main() -> int:
    """CLI Entry point for NVIDIA Tegra / INA3221 hardware power profiler."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_csv = os.path.join(script_dir, "tegra_power_profile.csv")
    default_json = os.path.join(script_dir, "tegra_power_report.json")

    parser = argparse.ArgumentParser(
        description="AEGIS-MESH NVIDIA Tegra & INA3221 Edge Hardware Power Profiler."
    )
    parser.add_argument(
        "--interval-ms",
        type=int,
        default=100,
        help="Sampling rate in milliseconds (default: 100 ms)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=5.0,
        help="Passive profiling duration in seconds (ignored if --run-hj-cbf is set)",
    )
    parser.add_argument(
        "--run-hj-cbf",
        action="store_true",
        help="Execute Hamilton-Jacobi CBF reachability solver and measure its transient power spike",
    )
    parser.add_argument(
        "--hj-iters",
        type=int,
        default=4,
        help="Number of HJ solver iterations for compute load test (default: 4)",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Force mock Tegra telemetry stream (auto-selected on non-Tegra hosts)",
    )
    parser.add_argument(
        "--output-csv",
        type=str,
        default=default_csv,
        help=f"Path to output CSV timeseries (default: {default_csv})",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=default_json,
        help=f"Path to output JSON summary report (default: {default_json})",
    )

    args = parser.parse_args()

    profiler = HardwareProfiler(
        sample_interval_ms=args.interval_ms,
        force_mock=args.mock,
    )

    print("=" * 70)
    print(" AEGIS-MESH NVIDIA TEGRA / INA3221 HARDWARE POWER PROFILER")
    print(f" Hardware Detection: Mode = {profiler.mode.upper()}")
    if profiler.mode == "mock":
        print(" [INFO] Host machine is not a physical Tegra device. Using high-fidelity Jetson mock.")
    print("=" * 70)

    if args.run_hj_cbf:
        print(f"\n[BENCHMARK] Profiling Hamilton-Jacobi CBF Solver ({args.hj_iters} iterations)...")
        res, report = profiler.profile_workload(
            lambda: benchmark_hj_cbf_solver(iterations=args.hj_iters),
            name="Hamilton-Jacobi Isaacs CBF Solver",
            pre_settle_s=1.0,
            post_settle_s=1.0,
        )
        print(f"  HJ Solve Benchmark: {res['mean_solve_ms']:.1f} ms / solve (min: {res['min_solve_ms']:.1f} ms)")
    else:
        print(f"\n[PASSIVE] Profiling hardware for {args.duration:.1f} seconds...")
        profiler.start_sampling()
        time.sleep(args.duration)
        samples = profiler.stop_sampling()
        # Compute passive report
        p_series = [s.power_total_w for s in samples]
        report = ProfileReport(
            workload_name="Passive Monitoring",
            duration_s=args.duration,
            sample_count=len(samples),
            baseline_power_w=round(sum(p_series) / len(p_series), 2),
            active_power_mean_w=round(sum(p_series) / len(p_series), 2),
            peak_power_w=round(max(p_series), 2),
            min_power_w=round(min(p_series), 2),
            transient_delta_w=0.0,
            energy_joules=round(sum(p_series) * (args.interval_ms / 1000.0), 2),
            energy_mwh=round((sum(p_series) * (args.interval_ms / 1000.0) / 3600.0) * 1000.0, 3),
            peak_cpu_temp_c=max([s.temp_cpu_c for s in samples if s.temp_cpu_c]) if samples else None,
            peak_gpu_temp_c=max([s.temp_gpu_c for s in samples if s.temp_gpu_c]) if samples else None,
            hardware_source=profiler.mode,
            is_simulated_mock=(profiler.mode == "mock"),
        )

    # Print summary metrics
    print("\n[HARDWARE POWER METRICS]")
    print(f"  Workload:               {report.workload_name}")
    print(f"  Duration:               {report.duration_s:.3f} s")
    print(f"  Baseline Power:         {report.baseline_power_w:.2f} W")
    print(f"  Active Load Power:      {report.active_power_mean_w:.2f} W")
    print(f"  Peak Power Spike:       {report.peak_power_w:.2f} W (+{report.transient_delta_w:.2f} W transient)")
    print(f"  Total Energy Consumed:  {report.energy_joules:.2f} Joules ({report.energy_mwh:.3f} mWh)")
    if report.peak_cpu_temp_c:
        print(f"  Peak CPU Junction Temp: {report.peak_cpu_temp_c:.1f} °C")
    if report.peak_gpu_temp_c:
        print(f"  Peak GPU Junction Temp: {report.peak_gpu_temp_c:.1f} °C")

    # Export CSV & JSON
    csv_out = profiler.export_csv(profiler._samples, args.output_csv)
    json_out = profiler.export_json(report, args.output_json)

    print(f"\n[OK] Raw telemetry CSV:   {csv_out}")
    print(f"[OK] Summary JSON report: {json_out}")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
