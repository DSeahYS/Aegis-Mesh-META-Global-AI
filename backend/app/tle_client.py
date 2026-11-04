import requests
from sgp4.api import Satrec, jday
import numpy as np
import re
from datetime import datetime, timezone


def ts_to_jday(ts: float):
    """Convert a unix timestamp to (jd, fr) for SGP4 propagation."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                dt.second + dt.microsecond / 1e6)


class TLEClient:
    def __init__(self):
        self.base_url = "https://celestrak.org/NORAD/elements/gp.php"

    def query(self, params: dict):
        """Query Celestrak and return structured TLE list."""
        try:
            params = {**params, "FORMAT": "TLE"}
            resp = requests.get(self.base_url, params=params, timeout=10)
            if resp.status_code == 200:
                lines = resp.text.strip().split("\n")
                tles = []
                for i in range(0, len(lines), 3):
                    if i + 2 < len(lines):
                        name = lines[i].strip()
                        line1 = lines[i + 1].strip()
                        line2 = lines[i + 2].strip()
                        # Skip CSV header rows
                        if name.startswith("OBJECT_NAME") or not line1.startswith("1"):
                            continue
                        norad_match = re.search(r"\d{5,}", line1)
                        tles.append({
                            "name": name,
                            "line1": line1,
                            "line2": line2,
                            "norad_id": norad_match.group(0) if norad_match else "",
                        })
                return tles
        except Exception as e:
            print(f"TLE Fetch Error: {e}")
        return []

    def propagate(self, tle_line1: str, tle_line2: str, jd: float, fr: float):
        try:
            satellite = Satrec.twoline2rv(tle_line1, tle_line2)
            e, r, v = satellite.sgp4(jd, fr)
            if e == 0:
                return np.array(r), np.array(v)
        except Exception:
            pass
        return None, None
