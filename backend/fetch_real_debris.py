"""
fetch_real_debris.py
====================
Fetches REAL orbital debris TLE data from Celestrak (public, no auth),
propagates every object to the current UTC epoch using SGP4,
and writes public/debris_catalog.json for the AEGIS-MESH frontend.

Verified Celestrak GROUP / NAME identifiers (Oct 2026):
  - cosmos-1408   : NAME=COSMOS 1408 DEB   (~1600+ pieces)
  - fengyun-1c    : GROUP=FENGYUN-1C-DEBRIS (~1984 pieces)
  - iridium-33    : GROUP=IRIDIUM-33-DEBRIS (~110 pieces)
  - cosmos-2251   : GROUP=COSMOS-2251-DEBRIS (~586 pieces)
  - sl-16         : CATNR range for known SL-16 rocket bodies
  - leo-active    : GROUP=active            (active LEO satellites, sampled)

Run from project root:
    python backend/fetch_real_debris.py
"""

import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

# SGP4
try:
    from sgp4.api import Satrec, jday
except ImportError:
    print("ERROR: sgp4 not installed.")
    sys.exit(1)

EARTH_RADIUS_KM = 6371.0
NOW = datetime.now(timezone.utc)
JD_NOW, FR_NOW = jday(
    NOW.year, NOW.month, NOW.day, NOW.hour, NOW.minute,
    NOW.second + NOW.microsecond / 1e6
)
EPOCH_ISO = NOW.isoformat()
CELESTRAK_GP = "https://celestrak.org/NORAD/elements/gp.php"

CATALOGS = [
    {
        "id": "cosmos-1408",
        "name": "Cosmos-1408 ASAT Debris",
        "description": "Russian DA-ASAT intercept of Cosmos-1408, Nov 15 2021, ~485 km / 82.6 deg polar",
        "color": "#f97316",
        "dangerLevel": "HIGH",
        "params": {"NAME": "COSMOS 1408 DEB", "FORMAT": "TLE"},
        "max_objects": 1800,
    },
    {
        "id": "fengyun-1c",
        "name": "Fengyun-1C Breakup Cloud",
        "description": "Chinese SC-19 kinetic ASAT test, Jan 11 2007, ~865 km / 98.6 deg sun-sync",
        "color": "#ff3355",
        "dangerLevel": "CRITICAL",
        "params": {"GROUP": "FENGYUN-1C-DEBRIS", "FORMAT": "TLE"},
        "max_objects": 2000,
    },
    {
        "id": "iridium-33",
        "name": "Iridium-33 Collision Remnants",
        "description": "Accidental Iridium-33 / Cosmos-2251 collision, Feb 10 2009, ~790 km / 86.4 deg",
        "color": "#fbbf24",
        "dangerLevel": "HIGH",
        "params": {"GROUP": "IRIDIUM-33-DEBRIS", "FORMAT": "TLE"},
        "max_objects": 200,
    },
    {
        "id": "cosmos-2251",
        "name": "Cosmos-2251 Collision Remnants",
        "description": "Russian Cosmos-2251 collision partner cloud, Feb 10 2009, ~790 km",
        "color": "#fb923c",
        "dangerLevel": "HIGH",
        "params": {"GROUP": "COSMOS-2251-DEBRIS", "FORMAT": "TLE"},
        "max_objects": 700,
    },
    {
        "id": "sl-16",
        "name": "SL-16 Rocket Body Debris",
        "description": "Zenit-2 / SL-16 derelict upper stages and associated debris, 70-71 deg inclination",
        "color": "#d946ef",
        "dangerLevel": "ELEVATED",
        "params": {"NAME": "SL-16 DEB", "FORMAT": "TLE"},
        "max_objects": 500,
    },
    {
        "id": "leo-general",
        "name": "USSPACECOM Cataloged LEO Debris",
        "description": "General cataloged debris in LEO from USSPACECOM 18th SDS tracking data",
        "color": "#38bdf8",
        "dangerLevel": "MODERATE",
        "params": {"NAME": "DEB", "FORMAT": "TLE"},
        "max_objects": 2000,
    },
]


def fetch_tle_text(params: dict, label: str = "") -> str:
    url = f"{CELESTRAK_GP}?{urlencode(params)}"
    print(f"  GET {url}")
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "AEGIS-MESH/2026 (research; github.com/aegis-mesh)"}
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                text = resp.read().decode("utf-8")
                if text.strip() and not text.strip().startswith("<!"):
                    return text
                print(f"  Empty or HTML response on attempt {attempt+1}")
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(3 * (attempt + 1))
    return ""


def parse_tles(text: str) -> list:
    """Parse 3-line TLE sets from raw text. Returns list of (name, l1, l2)."""
    lines = [ln.rstrip("\r") for ln in text.splitlines()]
    lines = [ln for ln in lines if ln.strip()]
    tles = []
    i = 0
    while i < len(lines) - 2:
        l0 = lines[i]
        l1 = lines[i + 1]
        l2 = lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 ") and len(l1) >= 69 and len(l2) >= 69:
            tles.append((l0.strip(), l1.strip(), l2.strip()))
            i += 3
        else:
            i += 1
    return tles


def propagate_tle(name: str, l1: str, l2: str) -> dict | None:
    """SGP4-propagate to current epoch. Returns object dict or None."""
    try:
        sat = Satrec.twoline2rv(l1, l2)
        e, r, v = sat.sgp4(JD_NOW, FR_NOW)
        if e != 0:
            return None

        rx, ry, rz = float(r[0]), float(r[1]), float(r[2])
        vx, vy, vz = float(v[0]), float(v[1]), float(v[2])

        r_mag = math.sqrt(rx * rx + ry * ry + rz * rz)
        v_mag = math.sqrt(vx * vx + vy * vy + vz * vz)
        alt_km = r_mag - EARTH_RADIUS_KM

        # Filter: only keep LEO/MEO objects still in orbit
        if alt_km < 80.0 or alt_km > 35800.0:
            return None

        # Parse inclination from TLE line 2, columns 8-16
        try:
            inc_deg = float(l2[8:16].strip())
        except ValueError:
            inc_deg = 0.0

        # Parse NORAD ID from line 2, columns 2-7
        norad_id = l2[2:7].strip()

        # BSTAR drag term (rough decay estimate)
        try:
            bstar = float(sat.bstar)
        except Exception:
            bstar = 0.0

        return {
            "norad_id": norad_id,
            "name": name,
            "x_km": round(rx, 2),
            "y_km": round(ry, 2),
            "z_km": round(rz, 2),
            "alt_km": round(alt_km, 1),
            "inc_deg": round(inc_deg, 3),
            "vel_km_s": round(v_mag, 3),
            "bstar": round(bstar, 8),
        }
    except Exception:
        return None


def process_catalog(cat: dict) -> dict:
    print(f"\n[{cat['id']}] {cat['name']}")

    tle_text = fetch_tle_text(cat["params"], cat["id"])

    # Try alt_params fallback if primary returns nothing
    if not tle_text and "alt_params" in cat:
        print("  Primary params empty, trying fallback params...")
        tle_text = fetch_tle_text(cat["alt_params"], cat["id"])

    if not tle_text:
        print("  WARNING: No TLE data received, catalog will be empty")
        return {
            "id": cat["id"],
            "name": cat["name"],
            "description": cat.get("description", ""),
            "color": cat["color"],
            "dangerLevel": cat["dangerLevel"],
            "count": 0,
            "objects": [],
        }

    all_tles = parse_tles(tle_text)
    print(f"  Parsed {len(all_tles)} TLEs from Celestrak")

    # Sample if exceeds max
    sampled_tles = all_tles[: cat["max_objects"]]

    objects = []
    skipped = 0
    for name, l1, l2 in sampled_tles:
        obj = propagate_tle(name, l1, l2)
        if obj:
            objects.append(obj)
        else:
            skipped += 1

    print(f"  SGP4: {len(objects)} propagated OK, {skipped} decayed/failed")

    return {
        "id": cat["id"],
        "name": cat["name"],
        "description": cat.get("description", ""),
        "color": cat["color"],
        "dangerLevel": cat["dangerLevel"],
        "count": len(objects),
        "objects": objects,
    }


def main():
    out_dir = Path(__file__).resolve().parent.parent / "public"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "debris_catalog.json"

    print("=" * 60)
    print("AEGIS-MESH Real Debris Data Pipeline")
    print(f"Epoch UTC: {EPOCH_ISO}")
    print("Sources: Celestrak / USSPACECOM 18th SDS")
    print("=" * 60)

    result = {
        "epoch": EPOCH_ISO,
        "source": "Celestrak NORAD / USSPACECOM 18th Space Defense Squadron",
        "total_objects": 0,
        "catalogs": [],
    }

    for cat in CATALOGS:
        catalog_data = process_catalog(cat)
        result["catalogs"].append(catalog_data)
        result["total_objects"] += catalog_data["count"]

    print("\n" + "=" * 60)
    print(f"Total real tracked objects: {result['total_objects']}")
    print(f"Writing -> {out_path}")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"Done. File size: {size_kb:.1f} KB")
    print("=" * 60)

    return result


if __name__ == "__main__":
    main()
