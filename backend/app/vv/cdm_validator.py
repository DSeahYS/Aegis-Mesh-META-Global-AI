"""CCSDS 508.0-B-1 Conjunction Data Message (CDM) validator."""

import math
from datetime import datetime
from ..cdm_parser import CDMParser


def validate_cdm(cdm_text: str) -> dict:
    """Validate CDM text against CCSDS 508.0-B-1 standards and consistency checks."""
    parser = CDMParser()
    parsed = parser.parse(cdm_text)

    checks = []

    header = parsed.get("header", {})
    data = parsed.get("data", {})
    metadata = parsed.get("metadata", {})

    all_keys = set(header.keys()) | set(data.keys())

    # 1. Required keywords present
    required_keywords = ["CCSDS_CDM_VERS", "CREATION_DATE", "ORIGINATOR", "TCA", "MISS_DISTANCE"]
    missing = [k for k in required_keywords if k not in all_keys]
    checks.append({
        "id": "CDM-REQUIRED-KEYWORDS",
        "name": "Required Keywords Present",
        "severity": "error",
        "passed": bool(len(missing) == 0),
        "detail": "All required CCSDS keywords present" if not missing else f"Missing required keywords: {', '.join(missing)}",
    })

    # 2. Object designators OBJECT1/OBJECT2
    meta_objects = list(metadata.keys())
    standard_objects = {"OBJECT1", "OBJECT2"}
    has_non_standard = any(obj not in standard_objects for obj in meta_objects)
    checks.append({
        "id": "CDM-OBJECT-DESIGNATORS",
        "name": "Standard Object Designators",
        "severity": "warning",
        "passed": bool(not has_non_standard and len(meta_objects) > 0),
        "detail": (
            f"Standard object designators found: {meta_objects}"
            if not has_non_standard
            else f"Non-standard object designators found: {meta_objects} (CCSDS 508.0 expects OBJECT1 and OBJECT2)"
        ),
    })

    # 3. ISO-8601 date formatting
    date_fields = []
    if "CREATION_DATE" in all_keys:
        date_fields.append(("CREATION_DATE", header.get("CREATION_DATE") or data.get("CREATION_DATE")))
    if "TCA" in all_keys:
        date_fields.append(("TCA", data.get("TCA") or header.get("TCA")))
    for obj_name, obj_data in metadata.items():
        if "EPOCH" in obj_data:
            date_fields.append((f"{obj_name}.EPOCH", obj_data["EPOCH"]))

    date_errors = []
    for field_name, date_str in date_fields:
        try:
            cleaned = str(date_str).replace("Z", "+00:00")
            datetime.fromisoformat(cleaned)
        except Exception:
            date_errors.append(f"{field_name} ('{date_str}')")

    checks.append({
        "id": "CDM-DATE-FORMAT",
        "name": "ISO-8601 Date Format",
        "severity": "error",
        "passed": bool(len(date_errors) == 0),
        "detail": "All date fields adhere to ISO-8601 format" if not date_errors else f"Invalid ISO-8601 format in: {', '.join(date_errors)}",
    })

    # 4. COLLISION_PROBABILITY in [0, 1]
    if "COLLISION_PROBABILITY" in data:
        try:
            pc_val = float(data["COLLISION_PROBABILITY"])
            pc_valid = (0.0 <= pc_val <= 1.0) and not math.isnan(pc_val)
            checks.append({
                "id": "CDM-COLLISION-PROB",
                "name": "Collision Probability Range",
                "severity": "error",
                "passed": bool(pc_valid),
                "detail": f"COLLISION_PROBABILITY = {pc_val:.2e} is within [0, 1]" if pc_valid else f"COLLISION_PROBABILITY = {pc_val} out of valid [0, 1] range",
            })
        except Exception:
            checks.append({
                "id": "CDM-COLLISION-PROB",
                "name": "Collision Probability Range",
                "severity": "error",
                "passed": False,
                "detail": f"Unable to parse COLLISION_PROBABILITY '{data['COLLISION_PROBABILITY']}' as float",
            })

    # 5. MISS_DISTANCE consistent with RTN norm within 1%
    rtn_keys = ["RELATIVE_POSITION_R", "RELATIVE_POSITION_T", "RELATIVE_POSITION_N"]
    has_rtn = all(k in data for k in rtn_keys) and "MISS_DISTANCE" in data
    if has_rtn:
        try:
            r_val = float(data["RELATIVE_POSITION_R"])
            t_val = float(data["RELATIVE_POSITION_T"])
            n_val = float(data["RELATIVE_POSITION_N"])
            miss_val = float(data["MISS_DISTANCE"])
            rtn_norm = math.sqrt(r_val ** 2 + t_val ** 2 + n_val ** 2)

            rel_diff = abs(miss_val - rtn_norm) / max(rtn_norm, 1e-6)
            consistent = bool(rel_diff <= 0.01)

            checks.append({
                "id": "CDM-MISS-CONSISTENCY",
                "name": "Miss Distance Consistency",
                "severity": "error",
                "passed": consistent,
                "detail": (
                    f"MISS_DISTANCE ({miss_val:.2f} m) matches RTN norm ({rtn_norm:.2f} m, diff={rel_diff*100:.2f}%)"
                    if consistent
                    else f"MISS_DISTANCE ({miss_val:.2f} m) is inconsistent with RTN norm ({rtn_norm:.2f} m, rel error = {rel_diff*100:.1f}%)"
                ),
            })
        except Exception as e:
            checks.append({
                "id": "CDM-MISS-CONSISTENCY",
                "name": "Miss Distance Consistency",
                "severity": "error",
                "passed": False,
                "detail": f"Error parsing RTN coordinates: {e}",
            })

    # 6. RELATIVE_SPEED plausible range 1..20000 and warn if < 100
    if "RELATIVE_SPEED" in data:
        try:
            v_rel = float(data["RELATIVE_SPEED"])
            speed_plausible = (1.0 <= v_rel <= 20000.0)
            if not speed_plausible:
                checks.append({
                    "id": "CDM-RELATIVE-SPEED",
                    "name": "Relative Speed Plausibility",
                    "severity": "error",
                    "passed": False,
                    "detail": f"RELATIVE_SPEED ({v_rel:.2f} m/s) is outside plausible encounter range [1, 20000] m/s",
                })
            elif v_rel < 100.0:
                checks.append({
                    "id": "CDM-RELATIVE-SPEED",
                    "name": "Relative Speed Plausibility",
                    "severity": "warning",
                    "passed": False,
                    "detail": f"RELATIVE_SPEED ({v_rel:.2f} m/s) is plausibly low (< 100 m/s); verify whether km/s was entered instead of m/s",
                })
            else:
                checks.append({
                    "id": "CDM-RELATIVE-SPEED",
                    "name": "Relative Speed Plausibility",
                    "severity": "info",
                    "passed": True,
                    "detail": f"RELATIVE_SPEED ({v_rel:.2f} m/s) is within expected orbital regime",
                })
        except Exception:
            checks.append({
                "id": "CDM-RELATIVE-SPEED",
                "name": "Relative Speed Plausibility",
                "severity": "error",
                "passed": False,
                "detail": f"Unable to parse RELATIVE_SPEED '{data['RELATIVE_SPEED']}' as float",
            })

    errors = sum(1 for c in checks if c["severity"] == "error" and not c["passed"])
    warnings = sum(1 for c in checks if c["severity"] == "warning" and not c["passed"])
    valid = bool(errors == 0)

    return {
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
        "parsed": parsed,
    }
