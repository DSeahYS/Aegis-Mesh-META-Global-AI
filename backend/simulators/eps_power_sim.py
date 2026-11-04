"""AEGIS-MESH CubeSat Electrical Power System (EPS) & Orbital Solar Simulator.

Simulates a 90-minute Low Earth Orbit (LEO) power lifecycle:
1. Orbital illumination dynamics (Sunlit vs Eclipse phases with penumbral transitions).
2. Photovoltaic solar array generation curve with temperature derating.
3. Subsystem baseline power demands (OBC, ADCS, Comm Rx, Thermal).
4. Transient power injection (e.g. 10-Watt spike for Hamilton-Jacobi CBF solver runs).
5. Non-linear Li-ion battery pack model tracking Depth-of-Discharge (DoD) and terminal bus voltage.
6. Exportable CSV telemetry dataset and publication-grade Matplotlib visualization.
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple


@dataclass
class OrbitalConfig:
    """Orbital geometry and illumination configuration."""
    orbit_period_min: float = 90.0          # Standard LEO orbital period (~5400 s)
    altitude_km: float = 550.0              # Altitude above Earth surface
    earth_radius_km: float = 6378.137       # WGS-84 equatorial radius
    eclipse_fraction: float = 0.36          # Fraction of orbit in Earth shadow (~32.4 min)
    penumbra_duration_s: float = 35.0       # Solar limb ingress/egress transition time
    solar_flux_w_m2: float = 1361.0         # Solar constant at 1 AU


@dataclass
class SolarArrayConfig:
    """Photovoltaic solar array generation parameters."""
    peak_power_w: float = 28.0              # Peak power under normal irradiance at 25 deg C
    cell_efficiency: float = 0.295          # Triple-junction GaAs cell efficiency
    panel_area_m2: float = 0.08             # Deployable 3U/6U wing area
    mppt_efficiency: float = 0.95           # Maximum Power Point Tracker efficiency
    packing_factor: float = 0.90            # Cell packing & coverglass transmittance
    temp_coeff_pct_per_c: float = -0.0022   # Power temperature derating coefficient
    temp_sunlit_c: float = 55.0             # Steady-state panel temperature in sunlight
    temp_eclipse_c: float = -35.0           # Minimum panel temperature in shadow
    thermal_time_const_s: float = 180.0     # Thermal equilibrium time constant


@dataclass
class BatteryConfig:
    """Lithium-Ion battery pack parameters (4S2P CubeSat configuration)."""
    capacity_wh: float = 60.0               # Nominal battery capacity in Watt-hours
    nominal_voltage_v: float = 14.8         # 4S pack nominal voltage (3.7V/cell)
    v_max: float = 16.8                     # Fully charged voltage (4.2V/cell)
    v_min: float = 12.0                     # Safe discharge cutoff (3.0V/cell)
    initial_soc: float = 0.85               # Starting State-of-Charge (0.0 to 1.0)
    internal_resistance_ohm: float = 0.12   # Pack equivalent series resistance (ESR)
    charge_efficiency: float = 0.94         # Coulombic charge efficiency
    discharge_efficiency: float = 0.97      # Discharge conversion efficiency
    flight_dod_limit_pct: float = 40.0      # Mission lifetime DoD limit (40% DoD)
    critical_dod_limit_pct: float = 60.0    # Emergency low-power load-shed cutoff


@dataclass
class SubsystemLoadsConfig:
    """Continuous baseline avionics loads."""
    obc_w: float = 1.8                      # Flight computer & C&DH ARM Cortex
    adcs_w: float = 2.4                     # Reaction wheels, magnetorquers, star tracker
    comm_rx_w: float = 1.2                  # Transceiver listening standby
    thermal_payload_w: float = 1.1          # Housekeeping sensors, survival heaters
    
    @property
    def total_baseline_w(self) -> float:
        return self.obc_w + self.adcs_w + self.comm_rx_w + self.thermal_payload_w


@dataclass
class TransientSpike:
    """Transient operational power event."""
    name: str
    start_s: float
    duration_s: float
    power_w: float
    description: str = ""

    def is_active(self, t_s: float) -> bool:
        return self.start_s <= t_s < (self.start_s + self.duration_s)


@dataclass
class EPSConfig:
    """Master EPS configuration."""
    orbit: OrbitalConfig = field(default_factory=OrbitalConfig)
    solar: SolarArrayConfig = field(default_factory=SolarArrayConfig)
    battery: BatteryConfig = field(default_factory=BatteryConfig)
    loads: SubsystemLoadsConfig = field(default_factory=SubsystemLoadsConfig)
    spikes: List[TransientSpike] = field(default_factory=list)
    dt_s: float = 1.0


@dataclass
class SimulationTelemetryStep:
    """Single time-step telemetry snapshot."""
    time_s: float
    time_min: float
    orbit_phase: str           # "SUNLIT", "PENUMBRA_INGRESS", "ECLIPSE", "PENUMBRA_EGRESS"
    sun_illumination_frac: float
    solar_cell_temp_c: float
    solar_power_gen_w: float
    load_avionics_w: float
    load_spikes_w: float
    load_total_w: float
    net_power_w: float
    battery_energy_wh: float
    battery_soc_pct: float
    battery_dod_pct: float
    battery_voltage_v: float
    battery_current_a: float
    active_spike_names: List[str]


@dataclass
class SimulationResult:
    """Aggregated results of the EPS simulation."""
    telemetry: List[SimulationTelemetryStep]
    duration_s: float
    total_energy_gen_wh: float
    total_energy_cons_wh: float
    net_energy_balance_wh: float
    peak_dod_pct: float
    final_dod_pct: float
    peak_load_w: float
    average_load_w: float
    cbf_events_evaluated: int
    dod_margin_ok: bool


class EPSSimulator:
    """Physics-informed Electrical Power System (EPS) numerical simulator."""

    def __init__(self, config: Optional[EPSConfig] = None):
        self.config = config or self.default_config()

    @classmethod
    def default_config(cls) -> EPSConfig:
        """Create a standard default configuration with realistic transients."""
        cfg = EPSConfig()
        # Transient events:
        # 1. Routine CLM retrieval & screening in sunlight (t = 15 min = 900 s)
        cfg.spikes.append(TransientSpike(
            name="CLM_RETRIEVAL_BURST",
            start_s=900.0,
            duration_s=45.0,
            power_w=4.0,
            description="Contrastive-LM latent codebook retrieval burst"
        ))
        # 2. High-speed X-band downlink pass (t = 30 min = 1800 s)
        cfg.spikes.append(TransientSpike(
            name="COMMS_DOWNLINK_PASS",
            start_s=1800.0,
            duration_s=360.0,  # 6 minutes
            power_w=6.5,
            description="High-gain S/X-band telemetry downlink transmission"
        ))
        # 3. Emergency Conjunction Avoidance Maneuver (CAM) in Eclipse!
        # Hamilton-Jacobi Isaacs Reachability + HOCBF solver 10-Watt compute spike!
        # (t = 65 min = 3900 s, deep in eclipse)
        cfg.spikes.append(TransientSpike(
            name="HJ_CBF_SOLVER_SPIKE",
            start_s=3900.0,
            duration_s=90.0,
            power_w=10.0,
            description="10W transient power spike: GPU/CPU solving Hamilton-Jacobi CBF PDE"
        ))
        return cfg

    def compute_illumination(self, t_s: float, orbit_period_s: float) -> Tuple[float, str]:
        """Compute the solar illumination fraction and orbital phase.
        
        Orbit timeline:
        - 0 to t_sunlit: Sunlit phase (with penumbra ingress at the end)
        - t_sunlit to orbit_period_s: Eclipse shadow (with penumbra egress at the start of next)
        """
        ecl_frac = self.config.orbit.eclipse_fraction
        t_sunlit = orbit_period_s * (1.0 - ecl_frac)
        t_orbit = t_s % orbit_period_s
        penumbra_s = self.config.orbit.penumbra_duration_s

        if t_orbit < (t_sunlit - penumbra_s):
            return 1.0, "SUNLIT"
        elif t_orbit < t_sunlit:
            # Penumbra ingress: sunlight smoothly fades from 1.0 to 0.0
            dt = t_orbit - (t_sunlit - penumbra_s)
            frac = 0.5 * (1.0 + math.cos(math.pi * dt / penumbra_s))
            return max(0.0, min(1.0, frac)), "PENUMBRA_INGRESS"
        elif t_orbit < (orbit_period_s - penumbra_s):
            # Full umbra eclipse
            return 0.0, "ECLIPSE"
        else:
            # Penumbra egress: sunrise approaching
            dt = t_orbit - (orbit_period_s - penumbra_s)
            frac = 0.5 * (1.0 - math.cos(math.pi * dt / penumbra_s))
            return max(0.0, min(1.0, frac)), "PENUMBRA_EGRESS"

    def compute_solar_power(
        self,
        t_s: float,
        orbit_period_s: float,
        illum_frac: float,
        cell_temp_c: float
    ) -> float:
        """Compute photovoltaic power generation incorporating geometry and temperature."""
        if illum_frac <= 0.0:
            return 0.0

        t_sunlit = orbit_period_s * (1.0 - self.config.orbit.eclipse_fraction)
        t_orbit = t_s % orbit_period_s

        # Solar elevation angle factor (approximate half-sine insolation sweep across orbit)
        if t_orbit <= t_sunlit:
            angle_factor = math.sin(math.pi * t_orbit / t_sunlit)
            angle_factor = max(0.0, angle_factor)
        else:
            angle_factor = 0.0

        # Temperature derating: cold cells at sunrise generate MORE power (+Voc), hot cells less
        delta_t = cell_temp_c - 25.0
        temp_derate = 1.0 + (self.config.solar.temp_coeff_pct_per_c * delta_t)
        temp_derate = max(0.6, min(1.25, temp_derate))

        p_gen = (
            self.config.solar.peak_power_w
            * illum_frac
            * angle_factor
            * temp_derate
        )
        return max(0.0, p_gen)

    def estimate_battery_voltage(self, soc: float, i_batt_a: float) -> float:
        """Estimate 4S Li-ion battery pack terminal voltage with non-linear OCV and ESR drop."""
        soc_clamped = max(0.0, min(1.0, soc))
        
        # 4S Open Circuit Voltage characteristic curve
        # Empty = 12.0V, Nominal = 14.8V, Full = 16.8V
        v_oc = 12.0 + (4.0 * soc_clamped) + (0.8 * (soc_clamped ** 2))
        v_oc = max(self.config.battery.v_min, min(self.config.battery.v_max, v_oc))

        # Terminal voltage under load: V_term = V_oc - I * R_int
        # (Positive I means discharging, dropping terminal voltage)
        v_term = v_oc - (i_batt_a * self.config.battery.internal_resistance_ohm)
        return max(10.0, min(17.2, v_term))

    def run_simulation(self) -> SimulationResult:
        """Run the full time-step simulation over the configured orbit duration."""
        cfg = self.config
        orbit_period_s = cfg.orbit.orbit_period_min * 60.0
        total_time_s = orbit_period_s
        dt = cfg.dt_s
        n_steps = int(round(total_time_s / dt))

        # State initialization
        batt_capacity_wh = cfg.battery.capacity_wh
        batt_energy_wh = batt_capacity_wh * cfg.battery.initial_soc
        cell_temp_c = cfg.solar.temp_sunlit_c

        telemetry: List[SimulationTelemetryStep] = []
        total_gen_joules = 0.0
        total_cons_joules = 0.0
        peak_dod_pct = 0.0
        peak_load_w = 0.0
        sum_load_w = 0.0
        cbf_spike_count = 0

        for step in range(n_steps + 1):
            t_s = step * dt
            t_min = t_s / 60.0

            # 1. Illumination & Orbital Phase
            illum_frac, phase_str = self.compute_illumination(t_s, orbit_period_s)

            # 2. Solar cell thermal dynamics
            target_temp = (
                cfg.solar.temp_sunlit_c if illum_frac > 0.1 else cfg.solar.temp_eclipse_c
            )
            alpha_temp = 1.0 - math.exp(-dt / cfg.solar.thermal_time_const_s)
            cell_temp_c += alpha_temp * (target_temp - cell_temp_c)

            # 3. Solar Generation
            p_solar_w = self.compute_solar_power(t_s, orbit_period_s, illum_frac, cell_temp_c)

            # 4. Electrical Load Calculation
            p_base_w = cfg.loads.total_baseline_w
            active_spikes = [sp for sp in cfg.spikes if sp.is_active(t_s)]
            p_spikes_w = sum(sp.power_w for sp in active_spikes)
            p_load_w = p_base_w + p_spikes_w

            # Track metrics
            if any("CBF" in sp.name for sp in active_spikes) and (t_s % 10.0 < dt):
                cbf_spike_count += 1
            peak_load_w = max(peak_load_w, p_load_w)
            sum_load_w += p_load_w

            # 5. Power Balance & Battery Integration
            p_net_w = p_solar_w - p_load_w

            # Initial voltage estimate for current calculation
            soc_current = batt_energy_wh / batt_capacity_wh
            v_est = self.estimate_battery_voltage(soc_current, 0.0)

            if p_net_w >= 0.0:
                # Surplus solar power: charging battery up to capacity
                p_chg = p_net_w * cfg.battery.charge_efficiency
                delta_energy_wh = (p_chg * dt) / 3600.0
                batt_energy_wh = min(batt_capacity_wh, batt_energy_wh + delta_energy_wh)
                i_batt_a = - (p_chg / v_est)  # Negative denotes charging current
            else:
                # Power deficit: battery discharging to support satellite bus
                p_deficit = abs(p_net_w)
                p_discharge_drawn = p_deficit / cfg.battery.discharge_efficiency
                delta_energy_wh = (p_discharge_drawn * dt) / 3600.0
                batt_energy_wh = max(0.0, batt_energy_wh - delta_energy_wh)
                i_batt_a = p_discharge_drawn / v_est  # Positive denotes discharge current

            # Update battery terminal voltage with actual current
            soc = batt_energy_wh / batt_capacity_wh
            dod_pct = (1.0 - soc) * 100.0
            peak_dod_pct = max(peak_dod_pct, dod_pct)
            v_batt = self.estimate_battery_voltage(soc, i_batt_a)

            # Energy accumulation
            total_gen_joules += p_solar_w * dt
            total_cons_joules += p_load_w * dt

            step_data = SimulationTelemetryStep(
                time_s=round(t_s, 2),
                time_min=round(t_min, 3),
                orbit_phase=phase_str,
                sun_illumination_frac=round(illum_frac, 4),
                solar_cell_temp_c=round(cell_temp_c, 2),
                solar_power_gen_w=round(p_solar_w, 3),
                load_avionics_w=round(p_base_w, 3),
                load_spikes_w=round(p_spikes_w, 3),
                load_total_w=round(p_load_w, 3),
                net_power_w=round(p_net_w, 3),
                battery_energy_wh=round(batt_energy_wh, 4),
                battery_soc_pct=round(soc * 100.0, 2),
                battery_dod_pct=round(dod_pct, 2),
                battery_voltage_v=round(v_batt, 3),
                battery_current_a=round(i_batt_a, 3),
                active_spike_names=[sp.name for sp in active_spikes],
            )
            telemetry.append(step_data)

        total_gen_wh = total_gen_joules / 3600.0
        total_cons_wh = total_cons_joules / 3600.0
        net_balance_wh = total_gen_wh - total_cons_wh
        avg_load_w = sum_load_w / (n_steps + 1)
        final_dod = telemetry[-1].battery_dod_pct
        dod_ok = peak_dod_pct <= cfg.battery.flight_dod_limit_pct

        return SimulationResult(
            telemetry=telemetry,
            duration_s=total_time_s,
            total_energy_gen_wh=round(total_gen_wh, 3),
            total_energy_cons_wh=round(total_cons_wh, 3),
            net_energy_balance_wh=round(net_balance_wh, 3),
            peak_dod_pct=round(peak_dod_pct, 2),
            final_dod_pct=round(final_dod, 2),
            peak_load_w=round(peak_load_w, 2),
            average_load_w=round(avg_load_w, 2),
            cbf_events_evaluated=len([sp for sp in cfg.spikes if "CBF" in sp.name]),
            dod_margin_ok=dod_ok,
        )

    def export_csv(self, result: SimulationResult, output_path: str) -> str:
        """Export simulation telemetry to a structured CSV file."""
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        fieldnames = [
            "time_s",
            "time_min",
            "orbit_phase",
            "illumination_frac",
            "solar_cell_temp_c",
            "solar_gen_w",
            "load_avionics_w",
            "load_transients_w",
            "load_total_w",
            "net_power_w",
            "battery_energy_wh",
            "battery_soc_pct",
            "battery_dod_pct",
            "battery_voltage_v",
            "battery_current_a",
            "active_events",
        ]

        with open(output_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(fieldnames)
            for row in result.telemetry:
                writer.writerow([
                    row.time_s,
                    row.time_min,
                    row.orbit_phase,
                    row.sun_illumination_frac,
                    row.solar_cell_temp_c,
                    row.solar_power_gen_w,
                    row.load_avionics_w,
                    row.load_spikes_w,
                    row.load_total_w,
                    row.net_power_w,
                    row.battery_energy_wh,
                    row.battery_soc_pct,
                    row.battery_dod_pct,
                    row.battery_voltage_v,
                    row.battery_current_a,
                    ";".join(row.active_spike_names),
                ])
        return output_path

    def generate_plot(
        self,
        result: SimulationResult,
        output_image_path: str,
        show: bool = False
    ) -> str:
        """Generate a 4-panel publication-grade EPS power profile plot using Matplotlib."""
        try:
            import matplotlib.pyplot as plt
            import matplotlib.ticker as ticker
        except ImportError:
            sys.stderr.write("Matplotlib is not installed. Skipping plot generation.\n")
            return ""

        times_min = [s.time_min for s in result.telemetry]
        p_solar = [s.solar_power_gen_w for s in result.telemetry]
        p_load = [s.load_total_w for s in result.telemetry]
        p_base = [s.load_avionics_w for s in result.telemetry]
        p_spikes = [s.load_spikes_w for s in result.telemetry]
        battery_dod = [s.battery_dod_pct for s in result.telemetry]
        battery_soc = [s.battery_soc_pct for s in result.telemetry]
        battery_v = [s.battery_voltage_v for s in result.telemetry]
        battery_i = [s.battery_current_a for s in result.telemetry]

        # Orbit timing boundaries for background shading
        ecl_frac = self.config.orbit.eclipse_fraction
        t_sunlit_min = self.config.orbit.orbit_period_min * (1.0 - ecl_frac)
        t_orbit_min = self.config.orbit.orbit_period_min

        # Styling
        plt.style.use("default")
        fig, axes = plt.subplots(4, 1, figsize=(14, 12), sharex=True)
        fig.patch.set_facecolor("#0b0f19")

        for ax in axes:
            ax.set_facecolor("#111827")
            ax.grid(True, linestyle="--", alpha=0.25, color="#9ca3af")
            ax.tick_params(colors="#e5e7eb", labelsize=9)
            for spine in ax.spines.values():
                spine.set_color("#374151")

        # -------------------------------------------------------------
        # Subplot 1: Power Generation vs Total Demand
        # -------------------------------------------------------------
        ax1 = axes[0]
        ax1.plot(times_min, p_solar, color="#fbbf24", linewidth=2.0, label="Solar Array Generation (W)")
        ax1.plot(times_min, p_load, color="#38bdf8", linewidth=1.8, label="Total Subsystem Demand (W)")

        # Highlight Eclipse region
        ax1.axvspan(0, t_sunlit_min, color="#fbbf24", alpha=0.04, label="Sunlit Phase")
        ax1.axvspan(t_sunlit_min, t_orbit_min, color="#3b82f6", alpha=0.08, label="Eclipse Shadow Phase")

        # Highlight transient compute spikes
        for sp in self.config.spikes:
            t_sp_min = sp.start_s / 60.0
            sp_dur_min = sp.duration_s / 60.0
            if "CBF" in sp.name:
                ax1.annotate(
                    f"HJ-CBF Spike (+{sp.power_w:.0f}W)",
                    xy=(t_sp_min + sp_dur_min / 2, sp.power_w + 6.5),
                    xytext=(t_sp_min - 12, sp.power_w + 9.0),
                    arrowprops=dict(facecolor="#ef4444", shrink=0.05, width=1.5, headwidth=6),
                    color="#f87171",
                    fontsize=8.5,
                    fontweight="bold",
                )

        ax1.set_ylabel("Power (W)", color="#e5e7eb", fontsize=10, fontweight="bold")
        ax1.set_title(
            f"AEGIS-MESH CubeSat EPS Simulation — 90-Min LEO Orbit (Alt: {self.config.orbit.altitude_km:.0f} km)\n"
            f"Solar Gen: {result.total_energy_gen_wh:.1f} Wh | Consumption: {result.total_energy_cons_wh:.1f} Wh | "
            f"Net Balance: {result.net_energy_balance_wh:+.1f} Wh | Peak DoD: {result.peak_dod_pct:.1f}%",
            color="#f9fafb",
            fontsize=12,
            fontweight="bold",
            pad=12,
        )
        ax1.legend(loc="upper right", facecolor="#1f2937", edgecolor="#4b5563", labelcolor="#f3f4f6", fontsize=8.5)

        # -------------------------------------------------------------
        # Subplot 2: Subsystem Load Breakdown
        # -------------------------------------------------------------
        ax2 = axes[1]
        ax2.plot(times_min, p_base, color="#9ca3af", linestyle=":", linewidth=1.5, label="Avionics Baseline (6.5W)")
        ax2.fill_between(times_min, p_base, p_load, color="#ef4444", alpha=0.35, label="Dynamic Transient Spikes")
        ax2.plot(times_min, p_load, color="#f87171", linewidth=1.5)

        ax2.set_ylabel("Load Power (W)", color="#e5e7eb", fontsize=10, fontweight="bold")
        ax2.legend(loc="upper right", facecolor="#1f2937", edgecolor="#4b5563", labelcolor="#f3f4f6", fontsize=8.5)

        # -------------------------------------------------------------
        # Subplot 3: Battery Depth of Discharge (DoD) & State of Charge (SoC)
        # -------------------------------------------------------------
        ax3 = axes[2]
        ax3.plot(times_min, battery_dod, color="#c084fc", linewidth=2.0, label="Battery DoD (%)")
        ax3.axhline(
            self.config.battery.flight_dod_limit_pct,
            color="#eab308",
            linestyle="--",
            linewidth=1.5,
            label=f"LEO Mission DoD Safety Ceiling ({self.config.battery.flight_dod_limit_pct:.0f}%)",
        )
        ax3.axhline(
            self.config.battery.critical_dod_limit_pct,
            color="#ef4444",
            linestyle=":",
            linewidth=1.5,
            label=f"Emergency Load-Shed Limit ({self.config.battery.critical_dod_limit_pct:.0f}%)",
        )

        # Annotate peak DoD
        max_dod_idx = battery_dod.index(max(battery_dod))
        ax3.plot(times_min[max_dod_idx], battery_dod[max_dod_idx], "ro", markersize=6)
        ax3.annotate(
            f"Peak DoD = {result.peak_dod_pct:.1f}% (Margin: {self.config.battery.flight_dod_limit_pct - result.peak_dod_pct:+.1f}%)",
            xy=(times_min[max_dod_idx], battery_dod[max_dod_idx]),
            xytext=(times_min[max_dod_idx] - 22, battery_dod[max_dod_idx] + 5.0),
            arrowprops=dict(facecolor="#c084fc", shrink=0.05, width=1.2, headwidth=5),
            color="#e9d5ff",
            fontsize=8.5,
            fontweight="bold",
        )

        ax3.set_ylabel("Battery DoD (%)", color="#e5e7eb", fontsize=10, fontweight="bold")
        ax3.set_ylim(-2.0, max(65.0, result.peak_dod_pct + 15.0))
        ax3.legend(loc="upper left", facecolor="#1f2937", edgecolor="#4b5563", labelcolor="#f3f4f6", fontsize=8.5)

        # -------------------------------------------------------------
        # Subplot 4: Battery Bus Voltage & Terminal Current
        # -------------------------------------------------------------
        ax4 = axes[3]
        color_v = "#34d399"
        ax4.plot(times_min, battery_v, color=color_v, linewidth=1.8, label="Pack Bus Voltage (V)")
        ax4.set_ylabel("Bus Voltage (V)", color=color_v, fontsize=10, fontweight="bold")
        ax4.tick_params(axis="y", labelcolor=color_v)
        ax4.set_ylim(13.0, 17.0)

        # Twin axis for current
        ax4_twin = ax4.twinx()
        color_i = "#f472b6"
        ax4_twin.plot(times_min, battery_i, color=color_i, linestyle="-.", linewidth=1.5, label="Pack Current (A) [+Dischg / -Chg]")
        ax4_twin.set_ylabel("Current (A)", color=color_i, fontsize=10, fontweight="bold")
        ax4_twin.tick_params(axis="y", labelcolor=color_i)
        ax4_twin.grid(False)

        ax4.set_xlabel("Orbit Elapsed Time (Minutes)", color="#f9fafb", fontsize=11, fontweight="bold")
        ax4.xaxis.set_major_locator(ticker.MultipleLocator(10))
        ax4.set_xlim(0, t_orbit_min)

        # Combine legends for twin axis
        lines_4, labels_4 = ax4.get_legend_handles_labels()
        lines_4_t, labels_4_t = ax4_twin.get_legend_handles_labels()
        ax4.legend(lines_4 + lines_4_t, labels_4 + labels_4_t, loc="upper right", facecolor="#1f2937", edgecolor="#4b5563", labelcolor="#f3f4f6", fontsize=8.5)

        plt.tight_layout()
        os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
        fig.savefig(output_image_path, dpi=200, facecolor=fig.get_facecolor(), edgecolor="none")

        if show:
            plt.show()
        plt.close(fig)
        return output_image_path


def main() -> int:
    """CLI Entry point for CubeSat EPS simulator."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_csv = os.path.join(script_dir, "power_profile_90min.csv")
    default_png = os.path.join(script_dir, "power_profile_90min.png")

    parser = argparse.ArgumentParser(
        description="AEGIS-MESH CubeSat EPS Power & Battery DoD Orbital Simulator."
    )
    parser.add_argument(
        "--duration-min",
        type=float,
        default=90.0,
        help="Orbital simulation duration in minutes (default: 90.0)",
    )
    parser.add_argument(
        "--dt-s",
        type=float,
        default=1.0,
        help="Simulation time step in seconds (default: 1.0)",
    )
    parser.add_argument(
        "--battery-wh",
        type=float,
        default=60.0,
        help="Battery capacity in Watt-hours (default: 60.0 Wh)",
    )
    parser.add_argument(
        "--solar-peak-w",
        type=float,
        default=28.0,
        help="Peak solar array generation in Watts (default: 28.0 W)",
    )
    parser.add_argument(
        "--cbf-spike-w",
        type=float,
        default=10.0,
        help="Power spike for Hamilton-Jacobi CBF solver run in Watts (default: 10.0 W)",
    )
    parser.add_argument(
        "--csv-out",
        type=str,
        default=default_csv,
        help=f"Path for output telemetry CSV file (default: {default_csv})",
    )
    parser.add_argument(
        "--plot-out",
        type=str,
        default=default_png,
        help=f"Path for output Matplotlib figure (default: {default_png})",
    )
    parser.add_argument(
        "--no-plot",
        action="store_true",
        help="Disable Matplotlib figure generation",
    )

    args = parser.parse_args()

    # Configure simulation
    cfg = EPSSimulator.default_config()
    cfg.orbit.orbit_period_min = args.duration_min
    cfg.dt_s = args.dt_s
    cfg.battery.capacity_wh = args.battery_wh
    cfg.solar.peak_power_w = args.solar_peak_w

    # Update or add CBF spike
    for sp in cfg.spikes:
        if "CBF" in sp.name:
            sp.power_w = args.cbf_spike_w

    sim = EPSSimulator(cfg)
    print("=" * 70)
    print(" AEGIS-MESH CUBESAT EPS ORBITAL POWER SIMULATOR")
    print(f" Orbit Period: {cfg.orbit.orbit_period_min:.1f} min | Altitude: {cfg.orbit.altitude_km:.1f} km")
    print(f" Battery Capacity: {cfg.battery.capacity_wh:.1f} Wh | Solar Peak: {cfg.solar.peak_power_w:.1f} W")
    print(f" HJ-CBF Compute Spike: +{args.cbf_spike_w:.1f} W injected in eclipse")
    print("=" * 70)

    result = sim.run_simulation()

    # Print summary report
    print("\n[SIMULATION RESULTS]")
    print(f"  Total Solar Energy Harvested:  {result.total_energy_gen_wh:.2f} Wh")
    print(f"  Total Subsystem Energy Drawn:  {result.total_energy_cons_wh:.2f} Wh")
    print(f"  Net Orbit Energy Balance:      {result.net_energy_balance_wh:+.2f} Wh")
    print(f"  Average Power Draw:            {result.average_load_w:.2f} W")
    print(f"  Peak Transient Load:           {result.peak_load_w:.2f} W")
    print(f"  Maximum Depth-of-Discharge:    {result.peak_dod_pct:.2f}% (Limit: {cfg.battery.flight_dod_limit_pct}%)")
    print(f"  Final Orbit DoD:               {result.final_dod_pct:.2f}%")
    print(f"  Flight Safety Margin Check:    {'PASSED (Compliant)' if result.dod_margin_ok else 'FAILED (Exceeded Limit)'}")

    # Export CSV
    csv_path = sim.export_csv(result, args.csv_out)
    print(f"\n[OK] Telemetry CSV written to: {csv_path}")

    # Generate Plot
    if not args.no_plot:
        plot_path = sim.generate_plot(result, args.plot_out)
        if plot_path:
            print(f"[OK] High-resolution plot generated: {plot_path}")

    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
