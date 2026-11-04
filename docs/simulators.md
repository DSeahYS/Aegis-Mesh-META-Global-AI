# AEGIS-MESH Astrodynamics & Hardware Simulators

The AEGIS-MESH backend includes high-fidelity simulation modules located in `backend/simulators/` designed to model realistic orbital environments and hardware constraints.

---

## 1. SPICE Precision Orbit Simulator (`spice_orbit_sim.py`)

Integrates the NASA NAIF SPICE toolkit (via `spiceypy` with analytical fallback):
- **Ephemerides**: Ingests leapseconds (`naif0012.tls`), planetary constants (`pck00010.tpc`), and spacecraft ephemerides (`sample_sat.bsp`).
- **Force Models**:
  - Central body gravity with J2 and J4 geopotential zonal harmonics.
  - Solar Radiation Pressure (SRP) modeling conical shadow geometry (umbra, penumbra, full sunlight).
  - Atmospheric drag utilizing exponential atmospheric density decay.
- **Numerical Integrator**: 4th-order Runge-Kutta (RK4) integrator for precision orbit determination.

---

## 2. Space-Track CDM Traffic Pipeline (`cdm_traffic_pipeline.py`)

Models ground-based Space Surveillance Network (SSN) Conjunction Data Messages:
- Ingests real-world CDMs in KVN (Key-Value-Notation) and XML formats.
- Computes Mahalanobis miss distances across full $6 \times 6$ relative state covariances.
- Classifies conjunction urgency into critical tiers based on Time-to-Closest-Approach (TCA) and $P_c$ dilution threshold metrics.

---

## 3. Electrical Power System Simulator (`eps_power_sim.py`)

Simulates solar panel generation and battery depth-of-discharge (DoD) during orbital maneuvers:
- Models solar array illumination fractions along 90-minute Low Earth Orbit passes.
- Simulates transient current and voltage spikes during peak thruster solenoid actuations.
- Generates CSV telemetry exports for power budget verification.

---

## 4. Edge Hardware Profiling (`hw_profiling_tegra.py`)

Emulates edge compute telemetry from embedded flight computers:
- Parses `tegrastats` telemetry structures from NVIDIA Jetson Orin Nano and Microchip PolarFire SoC architectures.
- Monitors thermal headroom, INT8 matrix engine utilization, and power dissipation during continuous CBF quadratic programming runs.
