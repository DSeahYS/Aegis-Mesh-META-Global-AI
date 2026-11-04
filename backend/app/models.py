from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class InferenceRequest(BaseModel):
    telemetry: List[float] = Field(..., min_items=4)

class ActionScore(BaseModel):
    action: str
    confidence: float
    score: float

class InferenceResponse(BaseModel):
    top_actions: List[ActionScore]
    latency_ms: float
    source: str

class TLEData(BaseModel):
    norad_id: str
    name: str
    line1: str
    line2: str

class ConjunctionRequest(BaseModel):
    primary_tle: TLEData
    secondary_tle: TLEData
    epoch: str
    hard_body_radius: float = 10.0

class ConjunctionResponse(BaseModel):
    miss_distance_km: float
    probability_of_collision: float
    tca: str
    b_plane: Dict[str, float]
    relative_velocity_km_s: float