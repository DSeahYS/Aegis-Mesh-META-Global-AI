"""
AEGIS-MESH Precision Astrodynamics Simulator
=============================================
High-precision orbital state propagation and ephemeris querying using NASA/NAIF SPICE
(via SpiceyPy), augmented with non-gravitational perturbation modeling:
  - High-order geopotential zonal harmonics (J2, J3, J4)
  - SPICE-derived third-body lunar and solar gravitational perturbations (spkezr)
  - Cannonball Solar Radiation Pressure (SRP) with dual-cone conical eclipse modeling
  - Diffuse Earth Albedo and Thermal Infrared radiation pressure
  - Upper atmospheric drag with exponential density profile
  - Graceful analytical fallbacks when SPICE kernels are unavailable
  - Mock kernel synthesizer for offline self-contained unit testing and CI/CD

Author: AEGIS-MESH Astrodynamics & SPICE Team
Standards: NASA NAIF SPICE Toolkit N0067, CCSDS 502.0-B-2 Orbit Data Messages
"""

import os
import math
import time
import logging
import urllib.request
from typing import List, Dict, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from datetime import datetime, timezone
import numpy as np
from pydantic import BaseModel, Field

# Set up dedicated logger for the astrodynamics engine
logger = logging.getLogger("aegis.spice_simulator")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Attempt to import spiceypy gracefully
try:
    import spiceypy as spice
    SPICE_AVAILABLE = True
except ImportError:
    spice = None
    SPICE_AVAILABLE = False
    logger.warning("spiceypy library is not installed. All SPICE functions will operate in analytical fallback mode.")


# ==============================================================================
# PHYSICAL AND ASTRONOMICAL CONSTANTS (CODATA 2018 / IAU / NAIF DE430 Standards)
# ==============================================================================
MU_EARTH = 398600.4418            # Earth gravitational parameter [km^3 / s^2] (WGS-84/EGM96)
MU_SUN = 132712440041.93938       # Solar gravitational parameter [km^3 / s^2] (DE430)
MU_MOON = 4902.800066             # Lunar gravitational parameter [km^3 / s^2] (DE430)

R_EARTH = 6378.1363               # Earth equatorial radius [km] (WGS-84)
R_EARTH_POLAR = 6356.7523         # Earth polar radius [km] (WGS-84)
R_SUN = 696000.0                  # Solar radius [km]
R_MOON = 1737.4                   # Lunar radius [km]
AU_KM = 149597870.7               # 1 Astronomical Unit in km (IAU standard)

# Earth Zonal Harmonics (JGM-3 / EGM96)
J2 = 1.08262668e-3                # J2 Earth oblateness coefficient (dimensionless)
J3 = -2.5327e-6                   # J3 pear-shape coefficient (dimensionless)
J4 = -1.6196e-6                   # J4 zonal coefficient (dimensionless)

# Solar Radiation Pressure Constants
SOLAR_FLUX_1AU = 1361.0           # Total Solar Irradiance at 1 AU [W / m^2]
SPEED_OF_LIGHT = 299792458.0      # Speed of light [m / s]
P_SRP_1AU = SOLAR_FLUX_1AU / SPEED_OF_LIGHT  # Solar radiation pressure at 1 AU [N / m^2] (~4.54e-6 N/m^2)

# Earth Radiation Budget Constants
EARTH_BOND_ALBEDO = 0.306         # Mean Earth Bond albedo (dimensionless)
EARTH_IR_FLUX = 240.0             # Mean Earth outward longwave thermal radiation [W / m^2]
P_IR_EARTH = EARTH_IR_FLUX / SPEED_OF_LIGHT  # Earth IR radiation pressure at surface [N / m^2] (~8.0e-7 N/m^2)


# ==============================================================================
# PYDANTIC DTOs & TYPED DATA STRUCTURES (FASTAPI READY)
# ==============================================================================
class SatellitePropertiesDTO(BaseModel):
    """Physical mass and optical characteristics of the satellite for non-grav forces."""
    mass_kg: float = Field(default=250.0, description="Wet/dry satellite mass in kg", gt=0.0)
    drag_area_m2: float = Field(default=2.5, description="Effective cross-sectional drag area in m^2", gt=0.0)
    srp_area_m2: float = Field(default=3.5, description="Effective solar radiation projected area in m^2", gt=0.0)
    cd: float = Field(default=2.2, description="Aerodynamic drag coefficient (dimensionless)", ge=0.0)
    cr: float = Field(default=1.3, description="Solar radiation reflectivity coefficient (1.0=blackbody, 2.0=pure mirror)", ge=1.0, le=2.0)
    albedo_cr: float = Field(default=1.3, description="Optical reflectivity coefficient for Earth albedo reflection", ge=1.0, le=2.0)


class StateVectorDTO(BaseModel):
    """6D Cartesian position and velocity state vector."""
    epoch_iso: str = Field(..., description="Epoch in UTC ISO-8601 format")
    et_seconds: float = Field(..., description="Ephemeris Time (seconds past J2000 TDB)")
    position_km: List[float] = Field(..., description="[x, y, z] Cartesian position in kilometers", min_length=3, max_length=3)
    velocity_km_s: List[float] = Field(..., description="[vx, vy, vz] Cartesian velocity in km/s", min_length=3, max_length=3)
    frame: str = Field(default="J2000", description="Inertial reference frame (e.g. J2000, ECLIPJ2000)")
    target_body: str = Field(..., description="Target body name or NAIF ID")
    observer_body: str = Field(default="EARTH", description="Observer body name or NAIF ID")
    light_time_sec: float = Field(default=0.0, description="One-way light time from target to observer in seconds")
    calculation_source: str = Field(default="spice", description="'spice_kernel' or 'analytical_fallback'")


class PerturbationBreakdownDTO(BaseModel):
    """Detailed acceleration contribution breakdown in m/s^2."""
    keplerian_m_s2: List[float] = Field(..., description="Central two-body Earth gravity vector [ax, ay, az]")
    j2_oblateness_m_s2: List[float] = Field(..., description="Earth J2 oblateness acceleration [ax, ay, az]")
    j3_j4_higher_zonal_m_s2: List[float] = Field(..., description="Earth J3 and J4 geopotential acceleration [ax, ay, az]")
    third_body_sun_m_s2: List[float] = Field(..., description="Third-body solar gravitational perturbation [ax, ay, az]")
    third_body_moon_m_s2: List[float] = Field(..., description="Third-body lunar gravitational perturbation [ax, ay, az]")
    srp_m_s2: List[float] = Field(..., description="Solar Radiation Pressure acceleration [ax, ay, az]")
    srp_shadow_factor: float = Field(..., description="Conical shadow occultation factor (1.0=sunlight, 0.0=umbra, 0..1=penumbra)")
    earth_albedo_m_s2: List[float] = Field(..., description="Earth reflected albedo radiation acceleration [ax, ay, az]")
    earth_thermal_ir_m_s2: List[float] = Field(..., description="Earth thermal infrared radiation pressure [ax, ay, az]")
    atmospheric_drag_m_s2: List[float] = Field(..., description="Atmospheric drag acceleration [ax, ay, az]")
    total_perturbation_m_s2: List[float] = Field(..., description="Net sum of all non-Keplerian accelerations")
    net_acceleration_m_s2: List[float] = Field(..., description="Total resultant acceleration [ax, ay, az]")


class SpicePropagateRequest(BaseModel):
    """Request payload for high-precision orbit propagation."""
    initial_position_km: List[float] = Field(..., min_length=3, max_length=3, description="Initial [x, y, z] position in km")
    initial_velocity_km_s: List[float] = Field(..., min_length=3, max_length=3, description="Initial [vx, vy, vz] velocity in km/s")
    epoch_iso: str = Field(default="2026-10-03T12:00:00Z", description="Initial epoch ISO UTC string")
    duration_seconds: float = Field(default=5400.0, description="Total simulation duration in seconds (e.g. 1 orbit ~5400s)")
    step_seconds: float = Field(default=60.0, description="Integration step size in seconds", gt=0.1)
    satellite_properties: SatellitePropertiesDTO = Field(default_factory=SatellitePropertiesDTO)
    enable_srp: bool = Field(default=True, description="Enable Solar Radiation Pressure modeling")
    enable_albedo: bool = Field(default=True, description="Enable Earth Albedo & Thermal IR modeling")
    enable_third_body: bool = Field(default=True, description="Enable Sun/Moon third-body gravitational perturbations")
    enable_drag: bool = Field(default=True, description="Enable atmospheric drag modeling")


class PropagationStepDTO(BaseModel):
    """Single propagated timestep state with physical perturbation breakdown."""
    step_index: int
    elapsed_seconds: float
    state: StateVectorDTO
    altitude_km: float
    orbital_speed_km_s: float
    perturbations: Optional[PerturbationBreakdownDTO] = None


class SpicePropagateResponse(BaseModel):
    """Full trajectory output with telemetry metadata."""
    total_steps: int
    duration_seconds: float
    start_epoch: str
    end_epoch: str
    trajectory: List[PropagationStepDTO]
    execution_time_ms: float
    kernel_status: Dict[str, Any]


class KernelStatusDTO(BaseModel):
    """Status summary of all currently loaded NAIF SPICE kernels."""
    spice_available: bool
    toolkit_version: str
    loaded_kernels_count: int
    kernels: List[Dict[str, Any]]


@dataclass
class StateVector:
    """Internal lightweight dataclass representation of an orbital state."""
    r: np.ndarray  # Position vector in km [x, y, z]
    v: np.ndarray  # Velocity vector in km/s [vx, vy, vz]
    et: float      # Ephemeris time (seconds past J2000)
    epoch_iso: str
    frame: str = "J2000"
    target: str = "SATELLITE"
    observer: str = "EARTH"
    light_time: float = 0.0
    source: str = "spice"


@dataclass
class PerturbationAcceleration:
    """Internal dataclass for breakdown of acceleration components in km/s^2."""
    a_keplerian: np.ndarray
    a_j2: np.ndarray
    a_j3_j4: np.ndarray
    a_sun: np.ndarray
    a_moon: np.ndarray
    a_srp: np.ndarray
    srp_nu: float
    a_albedo: np.ndarray
    a_thermal_ir: np.ndarray
    a_drag: np.ndarray

    @property
    def a_total(self) -> np.ndarray:
        return (
            self.a_keplerian
            + self.a_j2
            + self.a_j3_j4
            + self.a_sun
            + self.a_moon
            + self.a_srp
            + self.a_albedo
            + self.a_thermal_ir
            + self.a_drag
        )

    @property
    def a_perturbations_only(self) -> np.ndarray:
        return (
            self.a_j2
            + self.a_j3_j4
            + self.a_sun
            + self.a_moon
            + self.a_srp
            + self.a_albedo
            + self.a_thermal_ir
            + self.a_drag
        )


# ==============================================================================
# SPICE KERNEL MANAGER: DOWNLOADING, MOCK GENERATION, AND KERNEL POOL
# ==============================================================================
class SpiceKernelManager:
    """
    Manages NAIF SPICE kernel discovery, downloading, synthetic mock creation,
    and kernel pool loading (furnsh/unload/kclear).
    
    Standard kernels tracked:
      - Leapseconds Kernel (LSK): naif0012.tls
      - Planetary Constants Kernel (PCK): pck00010.tpc
      - Solar System Ephemerides SPK: de430.bsp (or lightweight de432s.bsp)
      - Satellite Trajectory SPK: dynamic mock/real mission files
    """

    # Official NAIF JPL generic kernel repositories
    NAIF_GENERIC_URLS = {
        "naif0012.tls": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        "pck00010.tpc": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00010.tpc",
        "de430.bsp": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de430.bsp",
        "de432s.bsp": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de432s.bsp",
    }

    def __init__(self, kernel_dir: Optional[str] = None):
        if kernel_dir is None:
            # Default to a dedicated local directory inside simulators package
            base_dir = os.path.dirname(os.path.abspath(__file__))
            self.kernel_dir = os.path.join(base_dir, "spice_kernels")
        else:
            self.kernel_dir = os.path.abspath(kernel_dir)

        os.makedirs(self.kernel_dir, exist_ok=True)
        self.loaded_kernels: List[str] = []

    def download_kernel(self, kernel_name: str, force: bool = False, timeout_sec: int = 20) -> Optional[str]:
        """
        Attempts to download a standard NAIF kernel from JPL servers.
        If download fails (e.g. offline, rate-limited, firewall), logs a warning
        and returns None so mock/fallback mechanisms can engage.
        """
        dest_path = os.path.join(self.kernel_dir, kernel_name)
        if os.path.exists(dest_path) and not force and os.path.getsize(dest_path) > 0:
            logger.info("Kernel %s already exists locally at %s", kernel_name, dest_path)
            return dest_path

        url = self.NAIF_GENERIC_URLS.get(kernel_name)
        if not url:
            logger.warning("No standard URL known for kernel %s", kernel_name)
            return None

        logger.info("Downloading NAIF kernel %s from %s ...", kernel_name, url)
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "AEGIS-MESH-Astrodynamics-Simulator/1.0"}
            )
            with urllib.request.urlopen(req, timeout=timeout_sec) as response, open(dest_path, "wb") as out_file:
                chunk_size = 65536
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
            logger.info("Successfully downloaded %s (size: %d bytes)", kernel_name, os.path.getsize(dest_path))
            return dest_path
        except Exception as e:
            logger.warning(
                "Could not download %s from NAIF servers (%s). Will engage mock/analytical fallback.",
                kernel_name, str(e)
            )
            if os.path.exists(dest_path) and os.path.getsize(dest_path) == 0:
                os.remove(dest_path)
            return None

    def create_mock_text_kernels(self) -> Tuple[str, str]:
        """
        Synthesizes standard-compliant NAIF text kernels:
          1. naif0012_mock.tls (Leapseconds Kernel)
          2. pck00010_mock.tpc (Planetary Constants Kernel)
        These allow full CSPICE parsing of UTC times, delta-ET, and planetary radii/GMs
        without requiring internet connectivity.
        """
        lsk_path = os.path.join(self.kernel_dir, "naif0012_mock.tls")
        pck_path = os.path.join(self.kernel_dir, "pck00010_mock.tpc")

        lsk_content = """KPL/LSK
\\begindata
DELTET/DELTA_T_A = 32.184
DELTET/K         = 1.657e-3
DELTET/EB        = 1.671e-2
DELTET/M         = ( 6.239996 1.99096871e-7 )
DELTET/DELTA_AT  = ( 10, @1972-JAN-1
                     11, @1972-JUL-1
                     12, @1973-JAN-1
                     13, @1974-JAN-1
                     14, @1975-JAN-1
                     15, @1976-JAN-1
                     16, @1977-JAN-1
                     17, @1978-JAN-1
                     18, @1979-JAN-1
                     19, @1980-JAN-1
                     20, @1981-JUL-1
                     21, @1982-JUL-1
                     22, @1983-JUL-1
                     23, @1985-JUL-1
                     24, @1988-JAN-1
                     25, @1990-JAN-1
                     26, @1991-JAN-1
                     27, @1992-JUL-1
                     28, @1993-JUL-1
                     29, @1994-JUL-1
                     30, @1996-JAN-1
                     31, @1997-JUL-1
                     32, @1999-JAN-1
                     33, @2006-JAN-1
                     34, @2009-JAN-1
                     35, @2012-JUL-1
                     36, @2015-JUL-1
                     37, @2017-JAN-1 )
\\begintext
"""
        with open(lsk_path, "w", encoding="utf-8") as f:
            f.write(lsk_content)

        pck_content = """KPL/PCK
\\begindata
BODY399_RADII    = ( 6378.1366   6378.1366   6356.7519 )
BODY399_GM       = ( 398600.4418 )
BODY10_RADII     = ( 696000.0   696000.0   696000.0 )
BODY10_GM        = ( 132712440041.93938 )
BODY301_RADII    = ( 1737.4     1737.4     1737.4 )
BODY301_GM       = ( 4902.800066 )
BODY3_GM         = ( 403503.2355 )
\\begintext
"""
        with open(pck_path, "w", encoding="utf-8") as f:
            f.write(pck_content)

        logger.info("Generated synthetic mock text kernels: %s and %s", lsk_path, pck_path)
        return lsk_path, pck_path

    def create_mock_satellite_spk(
        self,
        filename: str = "sample_sat.bsp",
        target_id: int = -999001,
        center_id: int = 399,
        frame: str = "J2000",
        altitude_km: float = 550.0,
        inclination_deg: float = 53.0,
        epoch_start_et: float = 844300000.0,
        duration_sec: float = 86400.0,
        num_points: int = 200,
    ) -> Optional[str]:
        """
        Creates an authentic binary NAIF SPK (Type 9 - Lagrange 3-point interpolation)
        using native CSPICE spkopn, spkw09, and spkcls routines.
        This provides an authentic binary ephemeris that spkezr queries directly.
        """
        if not SPICE_AVAILABLE:
            logger.warning("SpiceyPy not available; skipping binary SPK creation.")
            return None

        spk_path = os.path.join(self.kernel_dir, filename)
        if os.path.exists(spk_path):
            try:
                os.remove(spk_path)
            except Exception:
                pass

        try:
            # Generate unperturbed circular inclined orbit state vectors
            r_orb = R_EARTH + altitude_km
            v_orb = math.sqrt(MU_EARTH / r_orb)
            omega_mean = v_orb / r_orb
            inc_rad = math.radians(inclination_deg)

            epochs = np.linspace(epoch_start_et, epoch_start_et + duration_sec, num_points)
            states = np.zeros((num_points, 6))

            for i, et in enumerate(epochs):
                dt = et - epoch_start_et
                nu = omega_mean * dt

                # In-plane orbit coordinates
                x_orb = r_orb * math.cos(nu)
                y_orb = r_orb * math.sin(nu)
                vx_orb = -v_orb * math.sin(nu)
                vy_orb = v_orb * math.cos(nu)

                # Rotate by inclination about X-axis into J2000 equatorial
                states[i, 0] = x_orb
                states[i, 1] = y_orb * math.cos(inc_rad)
                states[i, 2] = y_orb * math.sin(inc_rad)

                states[i, 3] = vx_orb
                states[i, 4] = vy_orb * math.cos(inc_rad)
                states[i, 5] = vy_orb * math.sin(inc_rad)

            # Open new binary SPK file
            handle = spice.spkopn(spk_path, f"AEGIS-MESH Satellite SPK ID={target_id}", 500)
            seg_id = f"SAT_{target_id}_LEO_EPHEMERIS"
            degree = 3

            # Write Type 9 (Lagrange interpolation) segment
            spice.spkw09(
                handle,
                target_id,
                center_id,
                frame,
                float(epochs[0]),
                float(epochs[-1]),
                seg_id,
                degree,
                num_points,
                states.tolist(),
                epochs.tolist()
            )
            spice.spkcls(handle)
            logger.info("Successfully created binary SPK kernel: %s", spk_path)
            return spk_path
        except Exception as e:
            logger.error("Failed to generate mock binary SPK kernel: %s", str(e), exc_info=True)
            return None

    def load_kernel(self, kernel_path: str) -> bool:
        """Loads a kernel into the CSPICE kernel pool using spiceypy.furnsh."""
        if not SPICE_AVAILABLE:
            return False

        if not os.path.exists(kernel_path):
            logger.warning("Cannot load kernel: path does not exist %s", kernel_path)
            return False

        try:
            spice.furnsh(kernel_path)
            if kernel_path not in self.loaded_kernels:
                self.loaded_kernels.append(kernel_path)
            logger.info("Furnished SPICE kernel: %s", os.path.basename(kernel_path))
            return True
        except Exception as e:
            logger.error("Error loading kernel %s: %s", kernel_path, str(e))
            return False

    def load_all_standard_kernels(self, allow_download: bool = True) -> Dict[str, bool]:
        """
        Orchestrates loading standard NAIF kernels.
        Tries downloading first if permitted; falls back to generating mock kernels.
        Ensures the CSPICE kernel pool is operational.
        """
        results: Dict[str, bool] = {}
        if not SPICE_AVAILABLE:
            return {"spice_available": False}

        # 1. Leapseconds Kernel (LSK)
        lsk_path = os.path.join(self.kernel_dir, "naif0012.tls")
        if not os.path.exists(lsk_path) and allow_download:
            self.download_kernel("naif0012.tls")
        if not os.path.exists(lsk_path):
            lsk_path, _ = self.create_mock_text_kernels()
        results["lsk"] = self.load_kernel(lsk_path)

        # 2. Planetary Constants Kernel (PCK)
        pck_path = os.path.join(self.kernel_dir, "pck00010.tpc")
        if not os.path.exists(pck_path) and allow_download:
            self.download_kernel("pck00010.tpc")
        if not os.path.exists(pck_path):
            _, pck_path = self.create_mock_text_kernels()
        results["pck"] = self.load_kernel(pck_path)

        # 3. Satellite SPK (Synthetic or real)
        sat_spk = os.path.join(self.kernel_dir, "sample_sat.bsp")
        if not os.path.exists(sat_spk):
            sat_spk = self.create_mock_satellite_spk()
        if sat_spk and os.path.exists(sat_spk):
            results["sat_spk"] = self.load_kernel(sat_spk)

        # 4. Optional DE430/DE432s planetary ephemerides
        de_path = os.path.join(self.kernel_dir, "de430.bsp")
        if os.path.exists(de_path):
            results["de430"] = self.load_kernel(de_path)

        return results

    def unload_all(self):
        """Clears the CSPICE kernel pool and resets loaded tracker."""
        if SPICE_AVAILABLE:
            try:
                spice.kclear()
            except Exception as e:
                logger.warning("Error clearing SPICE kernel pool: %s", str(e))
        self.loaded_kernels.clear()
        logger.info("CSPICE kernel pool cleared.")

    def get_status(self) -> KernelStatusDTO:
        """Returns structured metadata of the active SPICE environment."""
        if not SPICE_AVAILABLE:
            return KernelStatusDTO(
                spice_available=False,
                toolkit_version="UNAVAILABLE",
                loaded_kernels_count=0,
                kernels=[]
            )

        try:
            ver = spice.tkvrsn("TOOLKIT")
            count = spice.ktotal("ALL")
            details = []
            for i in range(count):
                file_p, file_type, src, handle = spice.kdata(i, "ALL")
                details.append({
                    "index": i,
                    "path": file_p,
                    "filename": os.path.basename(file_p),
                    "type": file_type,
                    "source": src,
                    "handle": handle
                })
            return KernelStatusDTO(
                spice_available=True,
                toolkit_version=ver,
                loaded_kernels_count=count,
                kernels=details
            )
        except Exception as e:
            logger.warning("Error inspecting SPICE kernel pool status: %s", str(e))
            return KernelStatusDTO(
                spice_available=True,
                toolkit_version="ERROR",
                loaded_kernels_count=len(self.loaded_kernels),
                kernels=[{"path": k} for k in self.loaded_kernels]
            )


# ==============================================================================
# PERTURBATION PHYSICS & ANALYTICAL FALLBACK ENGINE
# ==============================================================================
class SpicePerturbationEngine:
    """
    Computes high-precision gravitational and non-gravitational accelerations.
    
    Includes:
      - Point-mass Earth gravity (Keplerian)
      - Geopotential oblateness perturbations: J2, J3, J4
      - Third-body gravitational accelerations: Sun and Moon (SPICE or analytical ephemeris)
      - Solar Radiation Pressure (SRP) cannonball model with dual-cone conical shadow
      - Earth Albedo & Thermal Longwave Infrared (IR) radiation pressure
      - Atmospheric Drag with exponential scale height
    """

    @staticmethod
    def utc_to_et(epoch_str: str) -> float:
        """Converts UTC ISO string to Ephemeris Time (ET / TDB seconds past J2000)."""
        if SPICE_AVAILABLE:
            try:
                return float(spice.str2et(epoch_str))
            except Exception:
                pass

        # Fallback ET calculation using standard Julian Date conversion
        try:
            clean_str = epoch_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
        except Exception:
            dt = datetime.now(timezone.utc)

        # Standard J2000 epoch is 2000-01-01 12:00:00 UTC (JD 2451545.0)
        # Delta-T ~ 69.184s between UTC and TDB
        epoch_ts = dt.timestamp()
        j2000_ts = 946728000.0  # 2000-01-01 12:00:00 UTC
        et = (epoch_ts - j2000_ts) + 69.184
        return et

    @staticmethod
    def et_to_utc(et: float) -> str:
        """Converts Ephemeris Time (ET) to ISO-8601 UTC string."""
        if SPICE_AVAILABLE:
            try:
                # Format: 'YYYY-MM-DDTHR:MN:SC.###::UTC'
                return spice.timout(et, "YYYY-MM-DDTHR:MN:SC.###::UTC")
            except Exception:
                pass

        j2000_ts = 946728000.0
        utc_ts = (et - 69.184) + j2000_ts
        dt = datetime.fromtimestamp(utc_ts, tz=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    # --------------------------------------------------------------------------
    # 1. Gravitational Perturbations (Earth J2, J3, J4)
    # --------------------------------------------------------------------------
    @staticmethod
    def compute_j2_acceleration(r: np.ndarray) -> np.ndarray:
        """
        Calculates J2 oblateness acceleration vector in ECI frame.
        Formulation: Vallado (4th ed), Eq. 8-43 / Montenbruck & Gill.
        """
        x, y, z = r[0], r[1], r[2]
        r_mag = np.linalg.norm(r)
        if r_mag < 1.0:
            return np.zeros(3)

        factor = (1.5 * J2 * MU_EARTH * (R_EARTH**2)) / (r_mag**5)
        z_over_r_sq = (z / r_mag)**2

        ax = factor * x * (5.0 * z_over_r_sq - 1.0)
        ay = factor * y * (5.0 * z_over_r_sq - 1.0)
        az = factor * z * (5.0 * z_over_r_sq - 3.0)

        return np.array([ax, ay, az])

    @staticmethod
    def compute_j3_j4_acceleration(r: np.ndarray) -> np.ndarray:
        """
        Calculates J3 (asymmetric pear shape) and J4 higher-order zonal accelerations.
        """
        x, y, z = r[0], r[1], r[2]
        r_mag = np.linalg.norm(r)
        if r_mag < 1.0:
            return np.zeros(3)

        # J3 term
        fac_j3 = (0.5 * J3 * MU_EARTH * (R_EARTH**3)) / (r_mag**7)
        z_r = z / r_mag
        z_r_sq = z_r**2

        ax3 = fac_j3 * x * (35.0 * z_r**3 - 15.0 * z_r)
        ay3 = fac_j3 * y * (35.0 * z_r**3 - 15.0 * z_r)
        az3 = fac_j3 * (35.0 * (z**4 / r_mag) - 30.0 * (z**2 / r_mag) + 3.0 * r_mag)

        # J4 term
        fac_j4 = (5.0 / 8.0) * J4 * MU_EARTH * (R_EARTH**4) / (r_mag**7)
        ax4 = fac_j4 * x * (1.0 - 14.0 * z_r_sq + 21.0 * (z_r_sq**2))
        ay4 = fac_j4 * y * (1.0 - 14.0 * z_r_sq + 21.0 * (z_r_sq**2))
        az4 = fac_j4 * z * (5.0 - 70.0 / 3.0 * z_r_sq + 21.0 * (z_r_sq**2))

        return np.array([ax3 + ax4, ay3 + ay4, az3 + az4])

    # --------------------------------------------------------------------------
    # 2. Celestial Ephemerides (Sun & Moon) with SPICE or Analytical Fallback
    # --------------------------------------------------------------------------
    @staticmethod
    def get_sun_position(et: float) -> Tuple[np.ndarray, str]:
        """
        Returns geocentric Sun position in km (ECI / J2000).
        Uses spiceypy.spkezr if kernels loaded, otherwise high-precision analytical
        solar algorithm (Vallado Algorithm 29 / Astronomical Almanac).
        """
        if SPICE_AVAILABLE:
            try:
                state, _ = spice.spkezr("SUN", et, "J2000", "NONE", "EARTH")
                return np.array(state[0:3]), "spice_kernel"
            except Exception:
                pass

        # Analytical Sun position (Meeus / Vallado Alg 29)
        # Julian centuries past J2000.0
        t_ut1 = et / 3155760000.0  # centuries
        # Mean longitude of the Sun
        lam_m = (280.460 + 36000.770 * t_ut1) % 360.0
        # Mean anomaly of the Sun
        m_sun = math.radians((357.5277233 + 35999.05034 * t_ut1) % 360.0)
        # Ecliptic longitude
        lam_ecl = math.radians(lam_m + 1.914666471 * math.sin(m_sun) + 0.019994643 * math.sin(2.0 * m_sun))
        # Obliquity of the ecliptic
        eps = math.radians(23.439291 - 0.0130042 * t_ut1)
        # Distance in AU
        r_mag_au = 1.000140612 - 0.016708617 * math.cos(m_sun) - 0.000139589 * math.cos(2.0 * m_sun)
        r_mag_km = r_mag_au * AU_KM

        r_sun = np.array([
            r_mag_km * math.cos(lam_ecl),
            r_mag_km * math.cos(eps) * math.sin(lam_ecl),
            r_mag_km * math.sin(eps) * math.sin(lam_ecl)
        ])
        return r_sun, "analytical_fallback"

    @staticmethod
    def get_moon_position(et: float) -> Tuple[np.ndarray, str]:
        """
        Returns geocentric Moon position in km (ECI / J2000).
        Uses spiceypy.spkezr if available, otherwise truncated Brown lunar theory.
        """
        if SPICE_AVAILABLE:
            try:
                state, _ = spice.spkezr("MOON", et, "J2000", "NONE", "EARTH")
                return np.array(state[0:3]), "spice_kernel"
            except Exception:
                pass

        # Low-precision analytical lunar ephemeris (Vallado Alg 31)
        t_c = et / 3155760000.0
        # Lunar orbital fundamentals
        lam_moon = math.radians((218.32 + 481267.881 * t_c) % 360.0)
        m_moon = math.radians((134.96 + 477198.867 * t_c) % 360.0)
        f_moon = math.radians((93.27 + 483202.018 * t_c) % 360.0)
        eps = math.radians(23.439291 - 0.0130042 * t_c)

        # Geocentric ecliptic longitude and latitude
        lam = lam_moon + math.radians(6.29 * math.sin(m_moon))
        beta = math.radians(5.13 * math.sin(f_moon))
        r_moon_km = 385000.0 - 20905.0 * math.cos(m_moon)

        r_moon = np.array([
            r_moon_km * math.cos(beta) * math.cos(lam),
            r_moon_km * (math.cos(eps) * math.cos(beta) * math.sin(lam) - math.sin(eps) * math.sin(beta)),
            r_moon_km * (math.sin(eps) * math.cos(beta) * math.sin(lam) + math.cos(eps) * math.sin(beta))
        ])
        return r_moon, "analytical_fallback"

    @staticmethod
    def compute_third_body_acceleration(r_sat: np.ndarray, r_body: np.ndarray, mu_body: float) -> np.ndarray:
        """
        Computes third-body point-mass gravitational acceleration vector in km/s^2.
        Formula: a = mu_body * [ (r_body - r_sat) / |r_body - r_sat|^3 - r_body / |r_body|^3 ]
        """
        d_vec = r_body - r_sat
        d_mag = np.linalg.norm(d_vec)
        r_body_mag = np.linalg.norm(r_body)

        if d_mag < 1.0 or r_body_mag < 1.0:
            return np.zeros(3)

        a_3rd = mu_body * ((d_vec / (d_mag**3)) - (r_body / (r_body_mag**3)))
        return a_3rd

    # --------------------------------------------------------------------------
    # 3. Non-Gravitational: Solar Radiation Pressure (SRP) & Eclipse Shadow
    # --------------------------------------------------------------------------
    @staticmethod
    def compute_conical_shadow_factor(r_sat: np.ndarray, r_sun: np.ndarray) -> float:
        """
        Calculates the dual-cone conical shadow occultation factor nu:
          nu = 1.0  (Full sunlight)
          nu = 0.0  (Total umbra eclipse)
          0 < nu < 1 (Penumbra partial eclipse)
        Ref: Montenbruck & Gill, 'Satellite Orbits', Sec 3.4.2.
        """
        # Satellite to Sun vector
        d_vec = r_sun - r_sat
        d_mag = np.linalg.norm(d_vec)
        r_sat_mag = np.linalg.norm(r_sat)

        if d_mag < 1.0 or r_sat_mag < 1.0:
            return 1.0

        # Vector from Earth center to satellite dotted with Sun direction
        s_unit = r_sun / np.linalg.norm(r_sun)
        sat_proj = np.dot(r_sat, s_unit)

        # If satellite is on sunlit side of Earth, it cannot be in eclipse
        if sat_proj >= 0.0:
            return 1.0

        # Apparent angular radii seen from satellite
        # sin(alpha_pen) and sin(alpha_umb)
        d_sat_earth = r_sat_mag
        theta = math.acos(np.clip(np.dot(-r_sat / d_sat_earth, d_vec / d_mag), -1.0, 1.0))

        # Apparent semi-diameters of Sun and Earth as viewed from satellite
        app_r_sun = math.asin(min(1.0, R_SUN / d_mag))
        app_r_earth = math.asin(min(1.0, R_EARTH / d_sat_earth))

        # Test geometry
        if theta >= (app_r_sun + app_r_earth):
            # No occultation
            return 1.0
        elif theta <= (app_r_earth - app_r_sun):
            # Complete umbra (Sun totally blocked)
            return 0.0
        elif theta <= (app_r_sun - app_r_earth):
            # Annular eclipse (Earth fully inside solar disk)
            area_sun = math.pi * (app_r_sun**2)
            area_earth = math.pi * (app_r_earth**2)
            return max(0.0, 1.0 - (area_earth / area_sun))
        else:
            # Partial penumbra occultation (circular intersection area)
            c1 = (theta**2 + app_r_sun**2 - app_r_earth**2) / (2.0 * theta * app_r_sun)
            c2 = (theta**2 + app_r_earth**2 - app_r_sun**2) / (2.0 * theta * app_r_earth)
            c1 = np.clip(c1, -1.0, 1.0)
            c2 = np.clip(c2, -1.0, 1.0)

            phi1 = math.acos(c1)
            phi2 = math.acos(c2)

            overlap = (
                app_r_sun**2 * (phi1 - math.sin(phi1) * math.cos(phi1))
                + app_r_earth**2 * (phi2 - math.sin(phi2) * math.cos(phi2))
            )
            sun_area = math.pi * (app_r_sun**2)
            nu = 1.0 - (overlap / sun_area)
            return float(np.clip(nu, 0.0, 1.0))

    def compute_srp_acceleration(
        self,
        r_sat: np.ndarray,
        r_sun: np.ndarray,
        mass_kg: float,
        area_m2: float,
        cr: float,
    ) -> Tuple[np.ndarray, float]:
        """
        Cannonball Solar Radiation Pressure acceleration in km/s^2.
        Formula:
          a_srp = - (P_1AU * AU^2 / d^2) * Cr * (A / m) * nu * (d_vec / d)
        """
        d_vec = r_sun - r_sat
        d_km = np.linalg.norm(d_vec)
        if d_km < 1.0 or mass_kg <= 0.0:
            return np.zeros(3), 1.0

        nu = self.compute_conical_shadow_factor(r_sat, r_sun)
        if nu <= 1e-6:
            return np.zeros(3), 0.0

        # Scaled solar radiation pressure at actual distance [N / m^2]
        p_flux = P_SRP_1AU * ((AU_KM / d_km)**2)

        # Acceleration magnitude in m/s^2: F = p * A * Cr, a = F / m
        a_mag_m_s2 = p_flux * cr * (area_m2 / mass_kg) * nu

        # Convert to km/s^2 (divide by 1000) and point along anti-Sun direction:
        u_sun = d_vec / d_km
        a_srp_km_s2 = -(a_mag_m_s2 / 1000.0) * u_sun

        return a_srp_km_s2, nu

    # --------------------------------------------------------------------------
    # 4. Non-Gravitational: Earth Albedo and Thermal Infrared Radiation Pressure
    # --------------------------------------------------------------------------
    @staticmethod
    def compute_earth_albedo_acceleration(
        r_sat: np.ndarray,
        r_sun: np.ndarray,
        mass_kg: float,
        area_m2: float,
        cr: float,
    ) -> np.ndarray:
        """
        Calculates Earth Albedo radiation pressure acceleration in km/s^2.
        Models diffuse spherical reflection of sunlight from Earth's illuminated cap.
        Reference: Knocke, Ries, Tapley (1988) / Vallado Sec. 8.6.
        """
        r_sat_mag = np.linalg.norm(r_sat)
        r_sun_mag = np.linalg.norm(r_sun)
        if r_sat_mag < R_EARTH or mass_kg <= 0.0:
            return np.zeros(3)

        u_sat = r_sat / r_sat_mag
        u_sun = r_sun / r_sun_mag

        # Cosine of angle between Sun and satellite (sub-solar angle)
        cos_theta = np.dot(u_sat, u_sun)
        if cos_theta <= 0.0:
            # Satellite is on the night side of Earth; albedo illumination is zero
            return np.zeros(3)

        # Dilution factor based on altitude relative to Earth radius
        geometric_factor = (R_EARTH / r_sat_mag)**2

        # Reflected flux [W / m^2]
        reflected_flux = EARTH_BOND_ALBEDO * SOLAR_FLUX_1AU * geometric_factor * cos_theta
        p_albedo = reflected_flux / SPEED_OF_LIGHT  # [N / m^2]

        # Acceleration in m/s^2 directed radially outward from Earth center
        a_mag_m_s2 = p_albedo * cr * (area_m2 / mass_kg)
        a_albedo_km_s2 = (a_mag_m_s2 / 1000.0) * u_sat

        return a_albedo_km_s2

    @staticmethod
    def compute_earth_thermal_ir_acceleration(
        r_sat: np.ndarray,
        mass_kg: float,
        area_m2: float,
        cr: float,
    ) -> np.ndarray:
        """
        Calculates Earth outward longwave thermal infrared radiation pressure in km/s^2.
        Emitted continuously day and night uniformly from Earth's spherical surface.
        """
        r_sat_mag = np.linalg.norm(r_sat)
        if r_sat_mag < R_EARTH or mass_kg <= 0.0:
            return np.zeros(3)

        u_sat = r_sat / r_sat_mag
        geometric_factor = (R_EARTH / r_sat_mag)**2

        p_ir = P_IR_EARTH * geometric_factor
        a_mag_m_s2 = p_ir * cr * (area_m2 / mass_kg)
        a_ir_km_s2 = (a_mag_m_s2 / 1000.0) * u_sat

        return a_ir_km_s2

    # --------------------------------------------------------------------------
    # 5. Non-Gravitational: Atmospheric Drag (Exponential Atmosphere)
    # --------------------------------------------------------------------------
    @staticmethod
    def compute_atmospheric_drag_acceleration(
        r_sat: np.ndarray,
        v_sat: np.ndarray,
        mass_kg: float,
        area_m2: float,
        cd: float,
    ) -> np.ndarray:
        """
        Calculates atmospheric drag acceleration in km/s^2 using an exponential
        atmospheric density model with Earth co-rotation.
        """
        r_mag = np.linalg.norm(r_sat)
        altitude_km = r_mag - R_EARTH

        # Negligible drag above 1000 km in LEO
        if altitude_km > 1000.0 or altitude_km < 80.0 or mass_kg <= 0.0:
            return np.zeros(3)

        # Standard Earth rotation vector omega_earth = [0, 0, 7.292115e-5 rad/s]
        omega_vec = np.array([0.0, 0.0, 7.292115e-5])
        # Relative velocity taking atmosphere co-rotation into account [km/s]
        v_rel = v_sat - np.cross(omega_vec, r_sat)
        v_rel_mag = np.linalg.norm(v_rel)
        if v_rel_mag < 1e-6:
            return np.zeros(3)

        # Exponential atmosphere approximation (US Standard Atmosphere table)
        # Base scale heights
        if altitude_km < 200.0:
            h0, rho0, h_scale = 150.0, 2.07e-9, 29.74
        elif altitude_km < 400.0:
            h0, rho0, h_scale = 250.0, 7.248e-11, 45.546
        elif altitude_km < 600.0:
            h0, rho0, h_scale = 400.0, 2.80e-12, 58.2
        else:
            h0, rho0, h_scale = 600.0, 8.61e-14, 71.8

        rho = rho0 * math.exp(-(altitude_km - h0) / h_scale)  # kg / m^3

        # Drag acceleration [m/s^2]: a = -0.5 * rho * v_rel^2 * Cd * (A / m)
        v_rel_m_s = v_rel_mag * 1000.0
        a_drag_m_s2 = 0.5 * rho * (v_rel_m_s**2) * cd * (area_m2 / mass_kg)

        # Convert to km/s^2 anti-parallel to relative velocity
        a_drag_km_s2 = -(a_drag_m_s2 / 1000.0) * (v_rel / v_rel_mag)
        return a_drag_km_s2

    # --------------------------------------------------------------------------
    # 6. Master Acceleration Evaluator
    # --------------------------------------------------------------------------
    def evaluate_accelerations(
        self,
        r: np.ndarray,
        v: np.ndarray,
        et: float,
        props: SatellitePropertiesDTO,
        enable_srp: bool = True,
        enable_albedo: bool = True,
        enable_third_body: bool = True,
        enable_drag: bool = True,
    ) -> PerturbationAcceleration:
        """
        Evaluates all physical acceleration components acting on the satellite at (r, v, et).
        All returned vectors are in km/s^2.
        """
        r_mag = np.linalg.norm(r)
        if r_mag < 1.0:
            zero = np.zeros(3)
            return PerturbationAcceleration(zero, zero, zero, zero, zero, zero, 1.0, zero, zero, zero)

        # 1. Central Keplerian Earth Gravity
        a_keplerian = -(MU_EARTH / (r_mag**3)) * r

        # 2. Earth Oblateness (J2, J3, J4)
        a_j2 = self.compute_j2_acceleration(r)
        a_j3_j4 = self.compute_j3_j4_acceleration(r)

        # 3. Third-Body Sun & Moon Gravity
        if enable_third_body:
            r_sun, _ = self.get_sun_position(et)
            r_moon, _ = self.get_moon_position(et)
            a_sun = self.compute_third_body_acceleration(r, r_sun, MU_SUN)
            a_moon = self.compute_third_body_acceleration(r, r_moon, MU_MOON)
        else:
            r_sun, _ = self.get_sun_position(et)
            a_sun = np.zeros(3)
            a_moon = np.zeros(3)

        # 4. Solar Radiation Pressure
        if enable_srp:
            a_srp, srp_nu = self.compute_srp_acceleration(
                r, r_sun, props.mass_kg, props.srp_area_m2, props.cr
            )
        else:
            a_srp = np.zeros(3)
            srp_nu = 1.0

        # 5. Earth Albedo & Thermal IR
        if enable_albedo:
            a_albedo = self.compute_earth_albedo_acceleration(
                r, r_sun, props.mass_kg, props.drag_area_m2, props.albedo_cr
            )
            a_thermal_ir = self.compute_earth_thermal_ir_acceleration(
                r, props.mass_kg, props.drag_area_m2, props.albedo_cr
            )
        else:
            a_albedo = np.zeros(3)
            a_thermal_ir = np.zeros(3)

        # 6. Upper Atmospheric Drag
        if enable_drag:
            a_drag = self.compute_atmospheric_drag_acceleration(
                r, v, props.mass_kg, props.drag_area_m2, props.cd
            )
        else:
            a_drag = np.zeros(3)

        return PerturbationAcceleration(
            a_keplerian=a_keplerian,
            a_j2=a_j2,
            a_j3_j4=a_j3_j4,
            a_sun=a_sun,
            a_moon=a_moon,
            a_srp=a_srp,
            srp_nu=srp_nu,
            a_albedo=a_albedo,
            a_thermal_ir=a_thermal_ir,
            a_drag=a_drag,
        )


# ==============================================================================
# PRECISION ORBIT SIMULATOR (HIGH-LEVEL FACADE FOR FASTAPI & ANALYSIS)
# ==============================================================================
class SpiceOrbitSimulator:
    """
    Main entry point for Precision Astrodynamics Simulation.
    Provides:
      - Ephemeris querying via CSPICE spkezr (with graceful fallback)
      - High-order Runge-Kutta (RK4) integration with complete perturbation suite
      - Full JSON/Pydantic serialization for FastAPI endpoints
    """

    def __init__(self, kernel_dir: Optional[str] = None, auto_init_kernels: bool = True):
        self.kernel_manager = SpiceKernelManager(kernel_dir=kernel_dir)
        self.physics = SpicePerturbationEngine()

        if auto_init_kernels:
            try:
                self.kernel_manager.load_all_standard_kernels(allow_download=True)
            except Exception as e:
                logger.warning("Auto kernel initialization completed with warnings: %s", str(e))

    def get_state_vector(
        self,
        target_body: Union[str, int],
        epoch_iso_or_et: Union[str, float],
        observer_body: Union[str, int] = "EARTH",
        ref_frame: str = "J2000",
        abcorr: str = "NONE",
    ) -> StateVectorDTO:
        """
        High-precision state vector calculation using spiceypy.spkezr.
        Gracefully falls back to high-accuracy analytical ephemerides if
        kernels are absent or target is not in the loaded SPK.
        """
        # Resolve Ephemeris Time
        if isinstance(epoch_iso_or_et, (int, float)):
            et = float(epoch_iso_or_et)
            epoch_iso = self.physics.et_to_utc(et)
        else:
            epoch_iso = str(epoch_iso_or_et)
            et = self.physics.utc_to_et(epoch_iso)

        target_str = str(target_body)
        observer_str = str(observer_body)

        # 1. Try native CSPICE spkezr
        if SPICE_AVAILABLE:
            try:
                state, lt = spice.spkezr(target_str, et, ref_frame, abcorr, observer_str)
                return StateVectorDTO(
                    epoch_iso=epoch_iso,
                    et_seconds=et,
                    position_km=[float(state[0]), float(state[1]), float(state[2])],
                    velocity_km_s=[float(state[3]), float(state[4]), float(state[5])],
                    frame=ref_frame,
                    target_body=target_str,
                    observer_body=observer_str,
                    light_time_sec=float(lt),
                    calculation_source="spice_kernel"
                )
            except Exception as spice_err:
                logger.warning(
                    "spiceypy.spkezr failed for target='%s' obs='%s' (%s). Engaging analytical fallback.",
                    target_str, observer_str, str(spice_err)
                )

        # 2. Analytical Fallbacks for standard bodies relative to Earth
        upper_target = target_str.upper()
        if upper_target in ["SUN", "10"]:
            r_sun, src = self.physics.get_sun_position(et)
            # Estimate orbital velocity ~ 29.78 km/s orthogonal in ecliptic
            v_est = np.array([0.0, 29.78, 0.0])
            return StateVectorDTO(
                epoch_iso=epoch_iso,
                et_seconds=et,
                position_km=r_sun.tolist(),
                velocity_km_s=v_est.tolist(),
                frame=ref_frame,
                target_body=target_str,
                observer_body=observer_str,
                light_time_sec=float(np.linalg.norm(r_sun) / (SPEED_OF_LIGHT / 1000.0)),
                calculation_source=src
            )
        elif upper_target in ["MOON", "301"]:
            r_moon, src = self.physics.get_moon_position(et)
            v_est = np.array([0.0, 1.022, 0.0])
            return StateVectorDTO(
                epoch_iso=epoch_iso,
                et_seconds=et,
                position_km=r_moon.tolist(),
                velocity_km_s=v_est.tolist(),
                frame=ref_frame,
                target_body=target_str,
                observer_body=observer_str,
                light_time_sec=float(np.linalg.norm(r_moon) / (SPEED_OF_LIGHT / 1000.0)),
                calculation_source=src
            )

        # 3. Default nominal LEO orbital state if unknown target requested
        logger.info("Target %s not in ephemeris; synthesizing nominal baseline circular LEO state.", target_str)
        r_leo = np.array([7000.0, 0.0, 0.0])
        v_leo = np.array([0.0, 7.546, 0.0])
        return StateVectorDTO(
            epoch_iso=epoch_iso,
            et_seconds=et,
            position_km=r_leo.tolist(),
            velocity_km_s=v_leo.tolist(),
            frame=ref_frame,
            target_body=target_str,
            observer_body=observer_str,
            light_time_sec=0.0,
            calculation_source="analytical_fallback"
        )

    def propagate_orbit(self, request: SpicePropagateRequest) -> SpicePropagateResponse:
        """
        Executes high-precision numerical orbit propagation using a 4th-order
        Runge-Kutta (RK4) integrator over the specified duration.
        """
        start_wall_time = time.perf_counter()

        # Parse initial state
        r = np.array(request.initial_position_km, dtype=np.float64)
        v = np.array(request.initial_velocity_km_s, dtype=np.float64)
        et = self.physics.utc_to_et(request.epoch_iso)

        dt = float(request.step_seconds)
        total_steps = int(request.duration_seconds / dt)
        if total_steps <= 0:
            total_steps = 1

        trajectory: List[PropagationStepDTO] = []

        # Dynamics function: dr/dt = v, dv/dt = a_total(r, v, et)
        def dynamics(r_curr: np.ndarray, v_curr: np.ndarray, t_curr: float) -> Tuple[np.ndarray, np.ndarray, PerturbationAcceleration]:
            acc_obj = self.physics.evaluate_accelerations(
                r=r_curr,
                v=v_curr,
                et=t_curr,
                props=request.satellite_properties,
                enable_srp=request.enable_srp,
                enable_albedo=request.enable_albedo,
                enable_third_body=request.enable_third_body,
                enable_drag=request.enable_drag
            )
            return v_curr, acc_obj.a_total, acc_obj

        # Record initial step (step 0)
        v_init, a_init, acc_init = dynamics(r, v, et)
        alt_0 = float(np.linalg.norm(r) - R_EARTH)
        speed_0 = float(np.linalg.norm(v))

        # Format initial perturbation breakdown in m/s^2 (multiply km/s^2 by 1000)
        def to_m_s2(arr: np.ndarray) -> List[float]:
            return (arr * 1000.0).round(8).tolist()

        trajectory.append(
            PropagationStepDTO(
                step_index=0,
                elapsed_seconds=0.0,
                altitude_km=round(alt_0, 4),
                orbital_speed_km_s=round(speed_0, 5),
                state=StateVectorDTO(
                    epoch_iso=request.epoch_iso,
                    et_seconds=et,
                    position_km=r.round(4).tolist(),
                    velocity_km_s=v.round(6).tolist(),
                    frame="J2000",
                    target_body="PRIMARY_SAT",
                    observer_body="EARTH",
                    light_time_sec=0.0,
                    calculation_source="numerical_rk4"
                ),
                perturbations=PerturbationBreakdownDTO(
                    keplerian_m_s2=to_m_s2(acc_init.a_keplerian),
                    j2_oblateness_m_s2=to_m_s2(acc_init.a_j2),
                    j3_j4_higher_zonal_m_s2=to_m_s2(acc_init.a_j3_j4),
                    third_body_sun_m_s2=to_m_s2(acc_init.a_sun),
                    third_body_moon_m_s2=to_m_s2(acc_init.a_moon),
                    srp_m_s2=to_m_s2(acc_init.a_srp),
                    srp_shadow_factor=round(acc_init.srp_nu, 4),
                    earth_albedo_m_s2=to_m_s2(acc_init.a_albedo),
                    earth_thermal_ir_m_s2=to_m_s2(acc_init.a_thermal_ir),
                    atmospheric_drag_m_s2=to_m_s2(acc_init.a_drag),
                    total_perturbation_m_s2=to_m_s2(acc_init.a_perturbations_only),
                    net_acceleration_m_s2=to_m_s2(acc_init.a_total),
                )
            )
        )

        # Runge-Kutta 4th Order Time Integration Loop
        current_et = et
        for step in range(1, total_steps + 1):
            # Stage 1
            dr1, dv1, _ = dynamics(r, v, current_et)

            # Stage 2
            r2 = r + 0.5 * dt * dr1
            v2 = v + 0.5 * dt * dv1
            dr2, dv2, _ = dynamics(r2, v2, current_et + 0.5 * dt)

            # Stage 3
            r3 = r + 0.5 * dt * dr2
            v3 = v + 0.5 * dt * dv2
            dr3, dv3, _ = dynamics(r3, v3, current_et + 0.5 * dt)

            # Stage 4
            r4 = r + dt * dr3
            v4 = v + dt * dv3
            dr4, dv4, _ = dynamics(r4, v4, current_et + dt)

            # Combined state update
            r = r + (dt / 6.0) * (dr1 + 2.0 * dr2 + 2.0 * dr3 + dr4)
            v = v + (dt / 6.0) * (dv1 + 2.0 * dv2 + 2.0 * dv3 + dv4)
            current_et += dt

            # Compute breakdown at end of step
            _, _, acc_step = dynamics(r, v, current_et)
            step_iso = self.physics.et_to_utc(current_et)
            alt = float(np.linalg.norm(r) - R_EARTH)
            spd = float(np.linalg.norm(v))

            trajectory.append(
                PropagationStepDTO(
                    step_index=step,
                    elapsed_seconds=round(step * dt, 2),
                    altitude_km=round(alt, 4),
                    orbital_speed_km_s=round(spd, 5),
                    state=StateVectorDTO(
                        epoch_iso=step_iso,
                        et_seconds=current_et,
                        position_km=r.round(4).tolist(),
                        velocity_km_s=v.round(6).tolist(),
                        frame="J2000",
                        target_body="PRIMARY_SAT",
                        observer_body="EARTH",
                        light_time_sec=0.0,
                        calculation_source="numerical_rk4"
                    ),
                    perturbations=PerturbationBreakdownDTO(
                        keplerian_m_s2=to_m_s2(acc_step.a_keplerian),
                        j2_oblateness_m_s2=to_m_s2(acc_step.a_j2),
                        j3_j4_higher_zonal_m_s2=to_m_s2(acc_step.a_j3_j4),
                        third_body_sun_m_s2=to_m_s2(acc_step.a_sun),
                        third_body_moon_m_s2=to_m_s2(acc_step.a_moon),
                        srp_m_s2=to_m_s2(acc_step.a_srp),
                        srp_shadow_factor=round(acc_step.srp_nu, 4),
                        earth_albedo_m_s2=to_m_s2(acc_step.a_albedo),
                        earth_thermal_ir_m_s2=to_m_s2(acc_step.a_thermal_ir),
                        atmospheric_drag_m_s2=to_m_s2(acc_step.a_drag),
                        total_perturbation_m_s2=to_m_s2(acc_step.a_perturbations_only),
                        net_acceleration_m_s2=to_m_s2(acc_step.a_total),
                    )
                )
            )

        exec_time_ms = (time.perf_counter() - start_wall_time) * 1000.0
        status_dto = self.kernel_manager.get_status().model_dump()

        return SpicePropagateResponse(
            total_steps=len(trajectory),
            duration_seconds=request.duration_seconds,
            start_epoch=request.epoch_iso,
            end_epoch=trajectory[-1].state.epoch_iso,
            trajectory=trajectory,
            execution_time_ms=round(exec_time_ms, 2),
            kernel_status=status_dto,
        )


# ==============================================================================
# STANDALONE VERIFICATION AND DEMO RUNNER
# ==============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("AEGIS-MESH Precision Astrodynamics & SPICE Simulator Verification")
    print("=" * 80)

    sim = SpiceOrbitSimulator()
    status = sim.kernel_manager.get_status()
    print(f"SPICE Toolkit Version : {status.toolkit_version}")
    print(f"Loaded Kernels Count  : {status.loaded_kernels_count}")

    # Query Sun & Moon positions relative to Earth
    sample_epoch = "2026-10-03T12:00:00Z"
    sun_state = sim.get_state_vector("SUN", sample_epoch)
    moon_state = sim.get_state_vector("MOON", sample_epoch)
    print(f"\nSun Position [km]  ({sun_state.calculation_source}): {sun_state.position_km}")
    print(f"Moon Position [km] ({moon_state.calculation_source}): {moon_state.position_km}")

    # Propagate a 550 km Starlink-like satellite for 10 minutes (600s, 60s steps)
    r0 = [6928.1363, 0.0, 0.0]  # 550 km altitude above 6378.1363 km radius
    v0 = [0.0, 7.584, 0.0]      # ~7.584 km/s circular orbital speed
    req = SpicePropagateRequest(
        initial_position_km=r0,
        initial_velocity_km_s=v0,
        epoch_iso=sample_epoch,
        duration_seconds=600.0,
        step_seconds=60.0,
        enable_srp=True,
        enable_albedo=True,
        enable_third_body=True,
        enable_drag=True
    )

    print(f"\nPropagating orbit with full perturbation suite...")
    res = sim.propagate_orbit(req)
    print(f"Propagation complete in {res.execution_time_ms:.2f} ms ({res.total_steps} steps)")
    step0 = res.trajectory[0]
    step_final = res.trajectory[-1]

    print(f"\nInitial State (t=0s):")
    print(f"  Pos: {step0.state.position_km} km | Speed: {step0.orbital_speed_km_s:.3f} km/s")
    if step0.perturbations:
        p = step0.perturbations
        print(f"  J2 Acceleration      : {p.j2_oblateness_m_s2} m/s^2")
        print(f"  Sun 3rd Body         : {p.third_body_sun_m_s2} m/s^2")
        print(f"  Solar Rad Pressure   : {p.srp_m_s2} m/s^2 (Shadow factor nu={p.srp_shadow_factor})")
        print(f"  Earth Albedo         : {p.earth_albedo_m_s2} m/s^2")
        print(f"  Atmospheric Drag     : {p.atmospheric_drag_m_s2} m/s^2")

    print(f"\nFinal State (t={step_final.elapsed_seconds}s):")
    print(f"  Pos: {step_final.state.position_km} km | Speed: {step_final.orbital_speed_km_s:.3f} km/s")
    print("=" * 80)
