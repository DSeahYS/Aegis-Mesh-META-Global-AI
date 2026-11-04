from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import InferenceRequest, InferenceResponse, ConjunctionRequest, ConjunctionResponse
from .clm_engine import CLMEngine
from .cara_engine import CARAEngine
from .cdm_parser import CDMParser
from .tle_client import TLEClient, ts_to_jday
from .conjunction_service import ConjunctionService
import time
from pydantic import BaseModel
from typing import List, Optional
from .vv import run_selftest, run_vv_pipeline, validate_cdm, build_epg_knowledge_graph

try:
    from simulators.spice_orbit_sim import (
        SpiceOrbitSimulator,
        SpicePropagateRequest,
        SpicePropagateResponse,
        StateVectorDTO,
        KernelStatusDTO,
    )
    from simulators.cdm_traffic_pipeline import (
        SpaceTrackClient,
        calculate_baseline_urgency_metrics,
    )
except ImportError:
    from ..simulators.spice_orbit_sim import (
        SpiceOrbitSimulator,
        SpicePropagateRequest,
        SpicePropagateResponse,
        StateVectorDTO,
        KernelStatusDTO,
    )
    from ..simulators.cdm_traffic_pipeline import (
        SpaceTrackClient,
        calculate_baseline_urgency_metrics,
    )

app = FastAPI(title="AEGIS-MESH Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

clm = CLMEngine()
cara = CARAEngine()
cdm_parser = CDMParser()
tle_client = TLEClient()
conjunction_service = ConjunctionService()
spice_sim = SpiceOrbitSimulator()
spacetrack_client = SpaceTrackClient()


@app.post("/api/inference", response_model=InferenceResponse)
async def run_inference(request: InferenceRequest):
    start_time = time.perf_counter()
    results = clm.infer(request.telemetry)
    latency_ms = (time.perf_counter() - start_time) * 1000

    return InferenceResponse(
        top_actions=results,
        latency_ms=latency_ms,
        source="polarfire-backend"
    )


class CDMRequest(BaseModel):
    cdmText: str


class ScreenRequest(BaseModel):
    primary_tle: str
    debris_tles: List[str]
    window_hours: float = 24.0


@app.post("/api/cdm/parse")
async def parse_cdm(req: CDMRequest):
    try:
        data = cdm_parser.parse(req.cdmText)
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/cdm/traffic")
async def get_cdm_traffic(
    norad_id: Optional[str] = None,
    limit: int = 50,
    min_urgency: Optional[str] = None,
):
    """Query Space-Track.org / fallback CDMs parsed into AEGIS-MESH telemetry."""
    records = spacetrack_client.query_cdms(norad_id=norad_id, limit=limit)
    if min_urgency:
        records = spacetrack_client.filter_conjunctions(records, min_urgency=min_urgency)
    return {
        "status": "success",
        "count": len(records),
        "source": "space-track-live" if spacetrack_client.is_authenticated else "local-fallback",
        "conjunctions": records,
    }


class CDMUrgencyRequest(BaseModel):
    tca: str
    relative_position: List[float]
    combined_covariance: List[List[float]]
    current_time: Optional[str] = None
    hard_body_radius_m: Optional[float] = 10.0
    reported_pc: Optional[float] = None
    position_units: Optional[str] = "m"


@app.post("/api/cdm/assess-urgency")
async def assess_cdm_urgency(req: CDMUrgencyRequest):
    """Calculate NASA CARA baseline urgency metrics (TCA horizon, Mahalanobis distance, Pc_max)."""
    try:
        metrics = calculate_baseline_urgency_metrics(
            tca=req.tca,
            relative_position=req.relative_position,
            combined_covariance=req.combined_covariance,
            current_time=req.current_time,
            hard_body_radius_m=req.hard_body_radius_m or 10.0,
            reported_pc=req.reported_pc,
            position_units=req.position_units or "m",
        )
        return {"status": "success", "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/tle/query")
async def query_tle(catnr: str = None, group: str = None):
    params = {}
    if catnr:
        params["CATNR"] = catnr
    if group:
        params["GROUP"] = group
    tles = tle_client.query(params)
    # Return structured JSON with parsed TLE fields
    parsed = []
    for t in tles:
        parsed.append({
            "norad_id": t.get("norad_id", ""),
            "name": t.get("name", ""),
            "line1": t.get("line1", ""),
            "line2": t.get("line2", ""),
        })
    return {"tles": parsed}


@app.post("/api/conjunction/assess", response_model=ConjunctionResponse)
async def assess_conjunction(req: ConjunctionRequest):
    try:
        result = conjunction_service.assess(
            req.primary_tle.model_dump(),
            req.secondary_tle.model_dump(),
            req.epoch,
            req.hard_body_radius,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/conjunction/screen")
async def screen_conjunctions(req: ScreenRequest):
    """Screen a primary satellite against a list of debris TLE NORAD IDs."""
    results = []
    for debris_id in req.debris_tles:
        result = conjunction_service.screen(req.primary_tle, debris_id, req.window_hours)
        results.append(result)
    primary_name = next((r.get("primary") for r in results if r.get("primary")), req.primary_tle)
    return {"primary": primary_name, "screened": len(results), "conjunctions": results}


@app.get("/api/tle/propagate")
async def propagate_orbit(tle_line1: str, tle_line2: str, epoch: str = None):
    """Propagate a TLE to a given epoch and return position/velocity."""
    import math
    import time as _time
    from sgp4.api import Satrec
    from datetime import datetime

    try:
        sat = Satrec.twoline2rv(tle_line1, tle_line2)
        if getattr(sat, "error", 0) != 0:
            raise HTTPException(status_code=400, detail="Propagation failed: invalid TLE data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid TLE data: {exc}")

    if epoch:
        try:
            dt = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
            ts = dt.timestamp()
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid epoch format: '{epoch}'. Must be ISO 8601.")
    else:
        ts = _time.time()

    jd, fr = ts_to_jday(ts)
    e, r, v = sat.sgp4(jd, fr)
    if e != 0 or any(math.isnan(x) for x in r) or any(math.isnan(x) for x in v):
        raise HTTPException(status_code=400, detail="Propagation failed")

    return {
        "position": list(r),
        "velocity": list(v),
        "epoch": epoch or _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime(ts)),
    }


@app.get("/api/health")
async def get_health():
    return {"status": "ok", "uptime": time.process_time()}


@app.get("/api/benchmark/results")
async def get_benchmark_results():
    import json
    from pathlib import Path
    # Docker container path first, then repo-relative path for local runs
    candidates = [
        Path("/app/benchmark/results/benchmark_report.json"),
        Path(__file__).resolve().parent.parent.parent / "benchmark" / "results" / "benchmark_report.json",
    ]
    for path in candidates:
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            continue
    return {"error": "Benchmark results not found. Run benchmark first."}


class PipelineRequest(BaseModel):
    tca_s: Optional[float] = 40.0
    miss_xi_m: Optional[float] = 160.0
    miss_zeta_m: Optional[float] = 120.0
    rel_velocity_km_s: Optional[float] = 11.0
    debris_mass_kg: Optional[float] = 45.0
    sigma_xi_m: Optional[float] = 120.0
    sigma_zeta_m: Optional[float] = 60.0
    rho: Optional[float] = 0.2
    hard_body_radius_m: Optional[float] = 15.0
    sat_mass_kg: Optional[float] = 150.0
    propellant_mass_kg: Optional[float] = 2.0
    isp_s: Optional[float] = 220.0
    max_thrust_n: Optional[float] = 22.0
    altitude_km: Optional[float] = 550.0
    min_perigee_km: Optional[float] = 300.0
    d_max_mps2: Optional[float] = 0.01
    pc_threshold: Optional[float] = 1e-4
    top_k: Optional[int] = 10


@app.get("/api/vv/selftest")
async def get_vv_selftest():
    return run_selftest()


@app.post("/api/vv/pipeline")
async def execute_vv_pipeline(req: Optional[PipelineRequest] = None):
    params = req.model_dump() if req else {}
    return run_vv_pipeline(params, cara_engine=cara, clm_engine=clm)


@app.post("/api/vv/validate-cdm")
async def validate_cdm_route(req: CDMRequest):
    return validate_cdm(req.cdmText)


class EPGRequest(BaseModel):
    propellant_mass_kg: Optional[float] = None
    max_thrust_n: Optional[float] = None
    sat_mass_kg: Optional[float] = None
    isp_s: Optional[float] = None
    tca_s: Optional[float] = None
    miss_xi_m: Optional[float] = None
    miss_zeta_m: Optional[float] = None
    rel_velocity_km_s: Optional[float] = None
    debris_mass_kg: Optional[float] = None
    altitude_km: Optional[float] = None
    candidate_id: Optional[int] = None



@app.get("/api/epg/graph")
async def get_epg_graph(
    propellant_mass_kg: Optional[float] = None,
    max_thrust_n: Optional[float] = None,
    sat_mass_kg: Optional[float] = None,
    isp_s: Optional[float] = None,
    tca_s: Optional[float] = None,
    miss_xi_m: Optional[float] = None,
    miss_zeta_m: Optional[float] = None,
    rel_velocity_km_s: Optional[float] = None,
    debris_mass_kg: Optional[float] = None,
    candidate_id: Optional[int] = None,
):
    """Retrieve EPG Knowledge Graph of satellite physical constraints and CLM rule reasoning state."""
    params = {}
    if propellant_mass_kg is not None:
        params["propellant_mass_kg"] = propellant_mass_kg
    if max_thrust_n is not None:
        params["max_thrust_n"] = max_thrust_n
    if sat_mass_kg is not None:
        params["sat_mass_kg"] = sat_mass_kg
    if isp_s is not None:
        params["isp_s"] = isp_s
    if tca_s is not None:
        params["tca_s"] = tca_s
    if miss_xi_m is not None:
        params["miss_xi_m"] = miss_xi_m
    if miss_zeta_m is not None:
        params["miss_zeta_m"] = miss_zeta_m
    if rel_velocity_km_s is not None:
        params["rel_velocity_km_s"] = rel_velocity_km_s
    if debris_mass_kg is not None:
        params["debris_mass_kg"] = debris_mass_kg

    return build_epg_knowledge_graph(params=params, clm_engine=clm, candidate_id=candidate_id)


@app.post("/api/epg/graph")
async def post_epg_graph(req: Optional[EPGRequest] = None):
    """Evaluate and return EPG Knowledge Graph for submitted spacecraft & encounter parameters."""
    params = req.model_dump(exclude_unset=True) if req else {}
    candidate_id = params.pop("candidate_id", None)
    return build_epg_knowledge_graph(params=params, clm_engine=clm, candidate_id=candidate_id)


@app.get("/api/spice/status", response_model=KernelStatusDTO)
async def get_spice_status():
    """Retrieve active SPICE kernel pool status and loaded ephemerides."""
    return spice_sim.kernel_manager.get_status()


@app.get("/api/spice/state", response_model=StateVectorDTO)
async def get_spice_state(
    target: str = "-999001",
    epoch: Optional[str] = None,
    observer: str = "EARTH",
    frame: str = "J2000",
    abcorr: str = "NONE",
):
    """
    Query high-precision state vector using spiceypy.spkezr with graceful analytical fallback.
    Default target '-999001' queries the synthetic AEGIS LEO satellite SPK.
    """
    query_epoch = epoch or "2026-10-03T12:00:00Z"
    return spice_sim.get_state_vector(
        target_body=target,
        epoch_iso_or_et=query_epoch,
        observer_body=observer,
        ref_frame=frame,
        abcorr=abcorr,
    )


@app.post("/api/spice/propagate", response_model=SpicePropagateResponse)
async def propagate_spice_orbit_route(req: SpicePropagateRequest):
    """
    Run precision numerical RK4 orbital propagation with full non-gravitational
    perturbations (J2/J3/J4, third-body Sun/Moon, SRP with conical shadow, Earth albedo, drag).
    """
    return spice_sim.propagate_orbit(req)

