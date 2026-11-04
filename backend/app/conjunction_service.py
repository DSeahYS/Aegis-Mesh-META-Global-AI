from .tle_client import TLEClient, ts_to_jday
from .cara_engine import CARAEngine
import numpy as np

class ConjunctionService:
    def __init__(self):
        self.tle_client = TLEClient()
        self.cara_engine = CARAEngine()

    def screen(self, catnr1: str, catnr2: str, window_hours: float = 24.0) -> dict:
        """Screen two satellites for conjunction within a time window."""
        tles1 = self.tle_client.query({"CATNR": catnr1})
        tles2 = self.tle_client.query({"CATNR": catnr2})

        if not tles1 or not tles2:
            return {"error": "Satellite not found", "conjunctions": []}

        tle1 = tles1[0]
        tle2 = tles2[0]

        # Propagate both satellites over the window
        import time
        from sgp4.api import Satrec
        try:
            sat1 = Satrec.twoline2rv(tle1["line1"], tle1["line2"])
            sat2 = Satrec.twoline2rv(tle2["line1"], tle2["line2"])
            if getattr(sat1, "error", 0) != 0 or getattr(sat2, "error", 0) != 0:
                return {"error": "Propagation failed: invalid TLE data", "conjunctions": []}
        except Exception as exc:
            return {"error": f"Invalid TLE data: {exc}", "conjunctions": []}

        now = time.time()
        jd_now, fr_now = ts_to_jday(now)
        step_seconds = 60.0
        steps = int(window_hours * 3600 / step_seconds)

        min_miss = float("inf")
        tca = None
        b_plane = None
        rel_speed = 0.0

        for i in range(steps):
            jd = jd_now + (i * step_seconds) / 86400.0
            fr = fr_now
            e1, r1, v1 = sat1.sgp4(jd, fr)
            e2, r2, v2 = sat2.sgp4(jd, fr)
            if e1 != 0 or e2 != 0:
                continue

            dr = np.array(r2) - np.array(r1)
            miss = float(np.linalg.norm(dr))
            if miss < min_miss:
                min_miss = miss
                tca = now + i * step_seconds
                b_plane = self.cara_engine.compute_b_plane(r1, v1, r2, v2)
                dv = np.array(v2) - np.array(v1)
                rel_speed = float(np.linalg.norm(dv))

        return {
            "primary": tle1.get("name", catnr1),
            "secondary": tle2.get("name", catnr2),
            "miss_distance_km": round(min_miss, 4),
            "tca": tca,
            "b_plane": b_plane or {"xi": 0.0, "zeta": 0.0, "b_mag": 0.0},
            "relative_velocity_km_s": round(rel_speed, 4),
            "conjunctions": [{
                "miss_distance_km": round(min_miss, 4),
                "tca": tca,
                "relative_velocity_km_s": round(rel_speed, 4),
            }],
        }

    def assess(self, primary_tle: dict, secondary_tle: dict, epoch: str,
               hard_body_radius: float = 10.0) -> dict:
        """Assess conjunction probability between two TLE sets at a given epoch."""
        from sgp4.api import Satrec

        try:
            sat1 = Satrec.twoline2rv(primary_tle["line1"], primary_tle["line2"])
            sat2 = Satrec.twoline2rv(secondary_tle["line1"], secondary_tle["line2"])
            if getattr(sat1, "error", 0) != 0 or getattr(sat2, "error", 0) != 0:
                return {"error": "Propagation failed: invalid TLE data", "probability_of_collision": 0.0}
        except Exception as exc:
            return {"error": f"Invalid TLE data: {exc}", "probability_of_collision": 0.0}

        # Parse epoch string (ISO 8601)
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
            ts = dt.timestamp()
        except Exception:
            return {"error": f"Invalid epoch format: '{epoch}'. Expected ISO 8601.", "probability_of_collision": 0.0}

        jd, fr = ts_to_jday(ts)
        e1, r1, v1 = sat1.sgp4(jd, fr)
        e2, r2, v2 = sat2.sgp4(jd, fr)

        if e1 != 0 or e2 != 0:
            return {"error": "Propagation failed", "probability_of_collision": 0.0}

        b_plane = self.cara_engine.compute_b_plane(r1, v1, r2, v2)
        xi_hat, zeta_hat, eta_hat = self.cara_engine.b_plane_frame(r1, v1, r2, v2)
        miss_dist = float(np.linalg.norm(np.array(r2) - np.array(r1)))
        rel_speed = float(np.linalg.norm(np.array(v2) - np.array(v1)))

        # Combined covariance (identity approximation for demo, projected 3x3 -> 2x2)
        combined_cov_3x3 = np.eye(3) * 100.0
        cov2 = self.cara_engine.project_covariance(combined_cov_3x3, xi_hat, zeta_hat)
        pc = self.cara_engine.compute_probability(b_plane, cov2, hard_body_radius / 1000.0)

        return {
            "miss_distance_km": round(miss_dist, 4),
            "probability_of_collision": round(pc, 8),
            "tca": epoch,
            "b_plane": b_plane,
            "relative_velocity_km_s": round(rel_speed, 4),
        }