"""
AEGIS-MESH Precision Astrodynamics Simulators Package.
Provides SPICE-backed ephemeris queries, relativistic & non-gravitational
perturbation modeling, and high-fidelity orbital propagation.
"""

from .spice_orbit_sim import (
    SpiceOrbitSimulator,
    SpiceKernelManager,
    SpicePerturbationEngine,
    StateVector,
    PerturbationAcceleration,
)
from .cdm_traffic_pipeline import (
    SpaceTrackClient,
    calculate_baseline_urgency_metrics,
    compute_mahalanobis_distance,
    parse_iso_datetime,
    EMBEDDED_FALLBACK_CDMS,
)
from .eps_power_sim import (
    EPSSimulator,
    EPSConfig,
    OrbitalConfig,
    BatteryConfig,
    TransientSpike,
    SimulationResult,
)
from .hw_profiling_tegra import (
    TegraStatsParser,
    TegraSample,
    INA3221Reader,
    HardwareProfiler,
    ProfileReport,
)

__all__ = [
    "SpiceOrbitSimulator",
    "SpiceKernelManager",
    "SpicePerturbationEngine",
    "StateVector",
    "PerturbationAcceleration",
    "SpaceTrackClient",
    "calculate_baseline_urgency_metrics",
    "compute_mahalanobis_distance",
    "parse_iso_datetime",
    "EMBEDDED_FALLBACK_CDMS",
    "SPARK2022Dataset",
    "Edge6DoFPoseResNet",
    "StarTrackerConfig",
    "Pose6DoFPrediction",
    "create_spark_dataloader",
    "profile_edge_latency",
    "EPSSimulator",
    "EPSConfig",
    "OrbitalConfig",
    "BatteryConfig",
    "TransientSpike",
    "SimulationResult",
    "TegraStatsParser",
    "TegraSample",
    "INA3221Reader",
    "HardwareProfiler",
    "ProfileReport",
]


def __getattr__(name: str):
    if name in {
        "SPARK2022Dataset",
        "Edge6DoFPoseResNet",
        "StarTrackerConfig",
        "Pose6DoFPrediction",
        "create_spark_dataloader",
        "profile_edge_latency",
    }:
        from . import star_tracker_vision
        return getattr(star_tracker_vision, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

