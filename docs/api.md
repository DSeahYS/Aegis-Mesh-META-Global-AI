# AEGIS-MESH API Reference

The AEGIS-MESH backend is built with FastAPI. When running locally (`cd backend && uvicorn app.main:app --port 8000`), the interactive Swagger UI is available at `http://localhost:8000/docs` and OpenAPI JSON at `http://localhost:8000/openapi.json`.

---

## Base URL

- Local Development: `http://localhost:8000`
- Vite Proxy: Frontend routes `/api/*` to `http://localhost:8000`

---

## Endpoints

### 1. System Health
- **`GET /api/health`**
  - **Description**: Verifies backend availability and system health status.
  - **Response**: `{"status": "ok", "service": "aegis-mesh", "version": "1.0.0"}`

### 2. Edge Retrieval Inference
- **`POST /api/inference`**
  - **Description**: Executes candidate evasion maneuver retrieval using 16-D state latent embeddings and quantized codebook matching.
  - **Request Body**:
    ```json
    {
      "telemetry": [40.0, 0.20, 11.0, 45.0],
      "top_k": 3
    }
    ```
  - **Response**:
    ```json
    {
      "top_k_actions": [
        { "action_id": 142, "score": 0.892, "dv": [0.12, -0.04, 0.08] }
      ],
      "latency_ms": 15.8
    }
    ```

### 3. Conjunction Assessment
- **`POST /api/conjunction`**
  - **Description**: Evaluates probability of collision ($P_c$) from relative position and combined covariance.
  - **Request Body**:
    ```json
    {
      "r_rel": [120.0, 40.0, 15.0],
      "v_rel": [0.0, 7800.0, 0.0],
      "covariance": [
        [1000.0, 0.0, 0.0],
        [0.0, 2500.0, 0.0],
        [0.0, 0.0, 400.0]
      ],
      "hard_body_radius": 15.0
    }
    ```
  - **Response**: Computed $P_c$, B-plane miss distance, and covariance semi-axes.

### 4. Live TLE Catalog
- **`GET /api/tle/query`**
  - **Description**: Queries live Celestrak or cached orbital elements for space stations and debris clusters.
  - **Parameters**: `catalog` (string, optional: `stations`, `starlink`, `debris-active`).

### 5. CCSDS Conjunction Data Message (CDM)
- **`POST /api/cdm/parse`**
  - **Description**: Parses standard CCSDS 508.0-B-1 or ISO 19389 Conjunction Data Messages (KVN or XML).
  - **Request Body**: Raw text of the CDM.
  - **Response**: Extracted metadata, TCA, relative state vector, and 6x6 combined covariance.

### 6. Verification & Validation (V&V) Engine
- **`GET /api/vv/selftest`**
  - **Description**: Executes all 16 mathematical and physical test oracles synchronously against ground truth.
  - **Response**: Individual test outcomes, error tolerances, execution times, and overall pass/fail status.
- **`POST /api/vv/pipeline`**
  - **Description**: Runs the full 5-stage closed-loop evasion pipeline (Foster $P_c \to$ CLM retrieval $\to$ EPG rules $\to$ HJ reachability $\to$ CBF projection).
  - **Request Body**: Spacecraft mass, propellant mass, thrust limit, TCA horizon, and miss distance.
  - **Response**: 5-stage stepper trace, execution latency per stage, and formal execution certificate or abort reason.
- **`POST /api/vv/cdm`**
  - **Description**: Validates CDM structural integrity and covariance positive-definiteness.
- **`POST /api/vv/epg`**
  - **Description**: Returns the symbolic Edge Physics Graph with real-time pruning edge states.

### 7. Astrodynamics Simulators (Optional SPICE)
- **`GET /api/spice/status`**: NAIF SPICE kernel loading pool status.
- **`POST /api/spice/propagate`**: Precision RK4 numerical propagation under J2/J4 zonal harmonics, solar radiation pressure, and atmospheric drag.
