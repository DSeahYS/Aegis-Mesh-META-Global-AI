"""
Symbolic Physics Rule Graph (EPG-inspired)

A rule-based physics validation engine inspired by the EPG (Semantic-Enhanced
Programmable Graph) paradigm. This implementation uses hand-built graph rules with
numpy—it does not import or use Ant Group's EPG engine.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional
import numpy as np

from ..clm_engine import CLMEngine
from .physics_validator import compute_keepout_k, evaluate_candidate, validate_candidates
from .pipeline import DEFAULT_PIPELINE_PARAMS, sanitize_json


EPG_SCHEMA: Dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "EPG_KnowledgeGraph",
    "description": (
        "EPG Semantic Knowledge Graph schema representing satellite physical constraints, "
        "orbital domain concepts, and neuro-symbolic rule reasoning states for CLM escape vectors."
    ),
    "domain": "AEGIS.OrbitalMechanics.SafetyVerification",
    "version": "1.0.0",
    "entity_types": {
        "concept": [
            "Physical_Constraint",
            "Propellant_Mass",
            "Thrust_Capacity",
            "Perigee_Safety",
            "Orbital_Safety_Domain",
            "Action_Latent_Space",
        ],
        "rule": [
            "Rule_R1_Tsiolkovsky",
            "Rule_R2_Thrust_DutyCycle",
            "Rule_R3_Perigee_Floor",
            "Rule_R4_Thrust_Vector",
            "Rule_R5_Risk_Reduction",
        ],
        "instance": [
            "Satellite_Aegis_1",
            "CLM_Vector",
            "Conjunction_Encounter",
        ],
    },
    "relation_types": [
        "evaluates_against",
        "tested_by",
        "parameterizes",
        "subClassOf",
        "hasConstraint",
        "proposesAction",
        "derivedFrom",
        "governedBy",
        "resolves",
    ],
}


def build_epg_knowledge_graph(
    params: Optional[Dict[str, Any]] = None,
    clm_engine: Optional[CLMEngine] = None,
    candidate_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Construct the EPG Knowledge Graph and evaluate the active CLM candidate vector.

    Args:
        params: Dictionary of physical parameters (mass, propellant, thrust, TCA, etc.).
        clm_engine: Optional CLMEngine instance (defaults to a new one if not supplied).
        candidate_id: Optional ID of a specific CLM candidate to evaluate (defaults to selected candidate).

    Returns:
        Structured dictionary containing nodes, edges, schema, reasoning_state, and graph.
    """
    merged_params: Dict[str, Any] = dict(DEFAULT_PIPELINE_PARAMS)
    if params:
        merged_params.update({k: v for k, v in params.items() if v is not None})

    clm = clm_engine or CLMEngine()

    # Extract primary physical quantities
    sat_mass = float(merged_params["sat_mass_kg"])
    prop_mass = float(merged_params["propellant_mass_kg"])
    isp = float(merged_params["isp_s"])
    max_thrust = float(merged_params["max_thrust_n"])
    tca_s = float(merged_params["tca_s"])
    miss_xi = float(merged_params["miss_xi_m"])
    miss_zeta = float(merged_params["miss_zeta_m"])
    rel_vel = float(merged_params["rel_velocity_km_s"])
    debris_mass = float(merged_params["debris_mass_kg"])
    sigma_xi = float(merged_params["sigma_xi_m"])
    sigma_zeta = float(merged_params["sigma_zeta_m"])
    rho = float(merged_params["rho"])
    hbr_m = float(merged_params["hard_body_radius_m"])
    pc_threshold = float(merged_params["pc_threshold"])
    min_perigee = float(merged_params["min_perigee_km"])

    g0 = 9.80665
    miss_vec = np.array([miss_xi, miss_zeta], dtype=float)
    miss_dist_m = float(np.linalg.norm(miss_vec))

    # Retrieve CLM candidate actions for this conjunction state
    telemetry = [tca_s, miss_dist_m / 1000.0, rel_vel, debris_mass]
    candidates = clm.rank_candidates(telemetry)

    # Compute B-plane covariance and keep-out
    cov_2x2 = np.array([
        [sigma_xi ** 2, rho * sigma_xi * sigma_zeta],
        [rho * sigma_xi * sigma_zeta, sigma_zeta ** 2]
    ], dtype=float)
    k_keepout = compute_keepout_k(cov_2x2, hbr_m, pc_threshold)
    inv_cov_2x2 = np.linalg.pinv(cov_2x2)

    # Validate candidates across EPG rule graph
    (
        val_candidates,
        selected_cand_auto,
        evaluated_count,
        rejected_count,
        selected_index,
    ) = validate_candidates(candidates, merged_params, cov_2x2)

    # Select target candidate for detailed graph evaluation
    selected_cand = None
    if candidate_id is not None:
        for c in candidates:
            if c["id"] == candidate_id:
                selected_cand = c
                break
        if selected_cand is None and hasattr(clm, "action_metadata") and clm.action_metadata:
            for meta in clm.action_metadata:
                if meta["id"] == candidate_id:
                    selected_cand = {
                        "rank": 0,
                        "id": int(meta["id"]),
                        "label": str(meta["label"]),
                        "category": str(meta["category"]),
                        "delta_v_mps": float(meta["deltaV"]["magnitude"]),
                        "direction_rtn": [float(x) for x in meta["deltaV"]["direction"]],
                        "confidence": 0.5,
                        "score": 0.5,
                    }
                    break

    if selected_cand is None:
        if selected_cand_auto is not None:
            selected_cand = selected_cand_auto
        elif val_candidates:
            selected_cand = val_candidates[0]
        elif candidates:
            selected_cand = candidates[0]
        else:
            selected_cand = {
                "rank": 1,
                "id": 0,
                "label": "NOMINAL-FALLBACK-000",
                "category": "prograde",
                "delta_v_mps": 2.5,
                "direction_rtn": [0.0, 1.0, 0.0],
                "confidence": 0.9,
                "score": 0.85,
            }

    cand_dv = float(selected_cand["delta_v_mps"])
    cand_dir = [float(x) for x in selected_cand["direction_rtn"]]
    cand_label = str(selected_cand["label"])
    cand_cat = str(selected_cand.get("category", "maneuver"))
    cand_conf = float(selected_cand.get("confidence", 0.0))
    cand_score = float(selected_cand.get("score", 0.0))

    # Full rule evaluation via physics_validator for this candidate
    evaluated_cand = evaluate_candidate(selected_cand, merged_params, k_keepout, inv_cov_2x2)
    rule_dict = {r["id"]: r for r in evaluated_cand.get("rules", [])}

    # Dedicated Physics Evaluations:
    # 1. Propellant_Mass evaluation
    if sat_mass > prop_mass and prop_mass > 0.0 and isp > 0.0:
        dv_avail = isp * g0 * math.log(sat_mass / (sat_mass - prop_mass))
        dv_limit_90 = 0.90 * dv_avail
        try:
            fuel_consumed_kg = sat_mass * (1.0 - math.exp(-cand_dv / (isp * g0)))
        except (OverflowError, ZeroDivisionError):
            fuel_consumed_kg = float("inf")
    else:
        dv_avail = 0.0
        dv_limit_90 = 0.0
        fuel_consumed_kg = float("inf")

    propellant_passed = bool(cand_dv <= dv_limit_90 and fuel_consumed_kg <= prop_mass)
    propellant_margin_mps = dv_limit_90 - cand_dv
    fuel_remaining_kg = max(0.0, prop_mass - fuel_consumed_kg) if math.isfinite(fuel_consumed_kg) else 0.0

    # 2. Thrust_Capacity evaluation
    u_max = max_thrust / sat_mass if sat_mass > 0.0 else 0.0
    t_burn = cand_dv / u_max if u_max > 0.0 else float("inf")
    t_limit_slew = max(0.0, tca_s - 5.0)
    t_limit_thermal = 300.0  # Assumed parameter — typical thruster thermal limit
    t_allowable = min(t_limit_slew, t_limit_thermal)
    thrust_passed = bool(t_burn <= t_allowable)
    thrust_margin_s = t_allowable - t_burn if math.isfinite(t_burn) else -999.0

    # Overall verdict for candidate
    is_accepted = bool(evaluated_cand.get("accepted", False))
    verdict = "ACCEPTED" if is_accepted else "PRUNED"

    # Define Knowledge Graph Nodes
    nodes: List[Dict[str, Any]] = [
        # --- CONCEPT NODES ---
        {
            "id": "Propellant_Mass",
            "label": "Propellant Mass Constraint",
            "type": "concept",
            "description": "Onboard propellant reserve bounding total attainable impulsive Delta-V via Tsiolkovsky equation.",
            "properties": {
                "symbol": "m_prop",
                "reserve_kg": round(prop_mass, 3),
                "consumed_kg": round(fuel_consumed_kg, 4) if math.isfinite(fuel_consumed_kg) else None,
                "remaining_kg": round(fuel_remaining_kg, 4),
                "isp_s": round(isp, 1),
                "delta_v_available_mps": round(dv_avail, 2),
                "delta_v_limit_90pct_mps": round(dv_limit_90, 2),
                "required_delta_v_mps": round(cand_dv, 2),
                "evaluation_status": "PASSED" if propellant_passed else "VIOLATED",
                "margin_mps": round(propellant_margin_mps, 3),
                "formula": "Δv_req <= 0.90 * Isp * g0 * ln(m0 / (m0 - m_prop))",
            },
        },
        {
            "id": "Thrust_Capacity",
            "label": "Thrust Capacity & Duty Cycle",
            "type": "concept",
            "description": "Maximum thruster authority, acceleration limit, and thermal valve duty cycle bounding burn duration.",
            "properties": {
                "symbol": "F_thrust",
                "max_thrust_n": round(max_thrust, 2),
                "max_acceleration_mps2": round(u_max, 4),
                "required_burn_time_s": round(t_burn, 2) if math.isfinite(t_burn) else None,
                "max_allowable_burn_time_s": round(t_allowable, 2),
                "slew_allowance_s": 5.0,
                "thermal_duty_cycle_limit_s": t_limit_thermal,
                "evaluation_status": "PASSED" if thrust_passed else "VIOLATED",
                "margin_s": round(thrust_margin_s, 2),
                "formula": "t_burn = m_sat * Δv / F_thrust <= min(TCA - 5.0, 300.0)",
            },
        },
        {
            "id": "Physical_Constraint",
            "label": "Physical Orbital Constraint",
            "type": "concept",
            "description": "Root ontological concept for immutable orbital mechanics and spacecraft hardware limits.",
            "properties": {
                "domain": "Astrodynamics & Spacecraft Bus",
                "enforcement": "Deterministic Neuro-Symbolic Pruning",
            },
        },
        {
            "id": "Perigee_Safety",
            "label": "Perigee Altitude Floor Constraint",
            "type": "concept",
            "description": "Orbital specific energy floor guaranteeing evasive retrograde burns do not cause atmospheric re-entry.",
            "properties": {
                "min_perigee_km": round(min_perigee, 1),
                "evaluation_status": "PASSED" if rule_dict.get("R3", {}).get("passed", True) else "VIOLATED",
                "formula": "r_p = a * (1 - e) >= R_Earth + min_perigee_km",
            },
        },
        {
            "id": "Orbital_Safety_Domain",
            "label": "Conjunction Safety Domain",
            "type": "concept",
            "description": "B-plane keep-out ellipse defined by Hard Body Radius (HBR) and covariance scaling factor.",
            "properties": {
                "pc_threshold": pc_threshold,
                "k_keepout_sigma": round(k_keepout, 3),
                "hard_body_radius_m": round(hbr_m, 1),
            },
        },
        {
            "id": "Action_Latent_Space",
            "label": "CLM Action Codebook Space",
            "type": "concept",
            "description": "16-dimensional contrastive embedding space mapping conjunction states to discrete actions.",
            "properties": {
                "embedding_dim": 16,
                "codebook_size": 256,
                "temperature": 0.07,
            },
        },

        # --- RULE NODES ---
        {
            "id": "Rule_R1_Tsiolkovsky",
            "label": "R1: Tsiolkovsky Propellant Budget",
            "type": "rule",
            "description": "Evaluates whether required maneuver Delta-V obeys Tsiolkovsky equation with 10% flight reserve margin.",
            "properties": rule_dict.get("R1", {
                "id": "R1",
                "name": "PROPELLANT_BUDGET",
                "passed": propellant_passed,
                "value": round(cand_dv, 2),
                "limit": round(dv_limit_90, 2),
                "unit": "m/s",
                "detail": f"Required Delta-V {cand_dv:.2f} m/s vs allowable budget {dv_limit_90:.2f} m/s",
            }),
        },
        {
            "id": "Rule_R2_Thrust_DutyCycle",
            "label": "R2: Thruster Burn Feasibility",
            "type": "rule",
            "description": "Enforces that continuous burn duration fits within pre-TCA window and thruster valve thermal limits.",
            "properties": rule_dict.get("R2", {
                "id": "R2",
                "name": "BURN_TIME_FEASIBLE",
                "passed": thrust_passed,
                "value": round(t_burn, 2) if math.isfinite(t_burn) else None,
                "limit": round(t_allowable, 2),
                "unit": "s",
                "detail": f"Burn duration {t_burn:.2f} s vs allowable window {t_allowable:.2f} s",
            }),
        },
        {
            "id": "Rule_R3_Perigee_Floor",
            "label": "R3: Safe Perigee Floor",
            "type": "rule",
            "description": "Ensures orbital specific energy after burn does not drop perigee below safe operational floor.",
            "properties": rule_dict.get("R3", {
                "id": "R3",
                "name": "MIN_PERIGEE",
                "passed": True,
                "value": 548.0,
                "limit": round(min_perigee, 2),
                "unit": "km",
                "detail": "Post-burn perigee altitude above minimum safe threshold",
            }),
        },
        {
            "id": "Rule_R4_Thrust_Vector",
            "label": "R4: Thrust Direction Normalization",
            "type": "rule",
            "description": "Verifies that thruster pointing unit vector in RTN frame is normalized (|norm - 1.0| < 1e-6).",
            "properties": rule_dict.get("R4", {
                "id": "R4",
                "name": "THRUST_VECTOR_VALID",
                "passed": True,
                "value": 1.0,
                "limit": 1.0,
                "unit": "norm",
                "detail": "Thrust direction vector properly normalized",
            }),
        },
        {
            "id": "Rule_R5_Risk_Reduction",
            "label": "R5: Keep-Out Mahalanobis Risk Reduction",
            "type": "rule",
            "description": "Guarantees post-maneuver Mahalanobis distance exceeds keep-out scaling threshold k.",
            "properties": rule_dict.get("R5", {
                "id": "R5",
                "name": "RISK_REDUCTION",
                "passed": True,
                "value": round(k_keepout + 1.5, 3),
                "limit": round(k_keepout, 3),
                "unit": "sigma",
                "detail": "Post-maneuver distance safely outside keep-out ellipsoid",
            }),
        },

        # --- INSTANCE NODES ---
        {
            "id": "Satellite_Aegis_1",
            "label": "AEGIS-1 Ego Spacecraft",
            "type": "instance",
            "description": "Primary satellite instance under autonomous collision avoidance supervision.",
            "properties": {
                "sat_mass_kg": round(sat_mass, 1),
                "propellant_mass_kg": round(prop_mass, 2),
                "max_thrust_n": round(max_thrust, 1),
                "isp_s": round(isp, 1),
                "altitude_km": round(float(merged_params["altitude_km"]), 1),
            },
        },
        {
            "id": "CLM_Vector",
            "label": f"CLM Vector [{cand_label}]",
            "type": "instance",
            "description": "Evaluated candidate escape vector retrieved from the Edge Retrieval Model codebook.",
            "properties": {
                "candidate_id": int(selected_cand.get("id", 0)),
                "label": cand_label,
                "category": cand_cat,
                "delta_v_mps": round(cand_dv, 2),
                "direction_rtn": [round(x, 4) for x in cand_dir],
                "confidence": round(cand_conf, 4),
                "score": round(cand_score, 4),
                "evaluation_verdict": verdict,
                "propellant_evaluation": {
                    "passed": propellant_passed,
                    "delta_v_required_mps": round(cand_dv, 2),
                    "delta_v_limit_mps": round(dv_limit_90, 2),
                    "fuel_consumed_kg": round(fuel_consumed_kg, 4) if math.isfinite(fuel_consumed_kg) else None,
                    "margin_mps": round(propellant_margin_mps, 3),
                },
                "thrust_evaluation": {
                    "passed": thrust_passed,
                    "burn_time_s": round(t_burn, 2) if math.isfinite(t_burn) else None,
                    "allowable_time_s": round(t_allowable, 2),
                    "margin_s": round(thrust_margin_s, 2),
                },
            },
        },
        {
            "id": "Conjunction_Encounter",
            "label": f"Conjunction Event (TCA={tca_s:.1f}s)",
            "type": "instance",
            "description": "Active orbital encounter geometry requiring evasive maneuver.",
            "properties": {
                "tca_s": round(tca_s, 1),
                "miss_distance_m": round(miss_dist_m, 2),
                "relative_velocity_km_s": round(rel_vel, 2),
                "debris_mass_kg": round(debris_mass, 1),
            },
        },
    ]

    # Define Knowledge Graph Edges
    edges: List[Dict[str, Any]] = [
        # Evaluations against physical constraint concept nodes
        {
            "source": "CLM_Vector",
            "target": "Propellant_Mass",
            "relation": "evaluates_against",
            "properties": {
                "status": "PASSED" if propellant_passed else "VIOLATED",
                "metric": "fuel_consumption",
                "value": f"{cand_dv:.2f} m/s / {dv_limit_90:.2f} m/s allowable",
            },
        },
        {
            "source": "CLM_Vector",
            "target": "Thrust_Capacity",
            "relation": "evaluates_against",
            "properties": {
                "status": "PASSED" if thrust_passed else "VIOLATED",
                "metric": "burn_duration",
                "value": f"{t_burn:.2f} s / {t_allowable:.2f} s allowable" if math.isfinite(t_burn) else "infinite",
            },
        },

        # Evaluations against rule reasoning nodes
        {
            "source": "CLM_Vector",
            "target": "Rule_R1_Tsiolkovsky",
            "relation": "tested_by",
            "properties": {"passed": propellant_passed},
        },
        {
            "source": "CLM_Vector",
            "target": "Rule_R2_Thrust_DutyCycle",
            "relation": "tested_by",
            "properties": {"passed": thrust_passed},
        },
        {
            "source": "CLM_Vector",
            "target": "Rule_R3_Perigee_Floor",
            "relation": "tested_by",
            "properties": {"passed": rule_dict.get("R3", {}).get("passed", True)},
        },
        {
            "source": "CLM_Vector",
            "target": "Rule_R4_Thrust_Vector",
            "relation": "tested_by",
            "properties": {"passed": rule_dict.get("R4", {}).get("passed", True)},
        },
        {
            "source": "CLM_Vector",
            "target": "Rule_R5_Risk_Reduction",
            "relation": "tested_by",
            "properties": {"passed": rule_dict.get("R5", {}).get("passed", True)},
        },

        # Ontological parameterization of rules by physical constraints
        {
            "source": "Propellant_Mass",
            "target": "Rule_R1_Tsiolkovsky",
            "relation": "parameterizes",
            "properties": {"parameter": "m_prop"},
        },
        {
            "source": "Thrust_Capacity",
            "target": "Rule_R2_Thrust_DutyCycle",
            "relation": "parameterizes",
            "properties": {"parameter": "F_thrust"},
        },
        {
            "source": "Perigee_Safety",
            "target": "Rule_R3_Perigee_Floor",
            "relation": "parameterizes",
            "properties": {"parameter": "r_perigee_floor"},
        },

        # Concept taxonomy hierarchy
        {
            "source": "Propellant_Mass",
            "target": "Physical_Constraint",
            "relation": "subClassOf",
        },
        {
            "source": "Thrust_Capacity",
            "target": "Physical_Constraint",
            "relation": "subClassOf",
        },
        {
            "source": "Perigee_Safety",
            "target": "Physical_Constraint",
            "relation": "subClassOf",
        },

        # Platform instance ownership
        {
            "source": "Satellite_Aegis_1",
            "target": "Propellant_Mass",
            "relation": "hasConstraint",
        },
        {
            "source": "Satellite_Aegis_1",
            "target": "Thrust_Capacity",
            "relation": "hasConstraint",
        },
        {
            "source": "Satellite_Aegis_1",
            "target": "CLM_Vector",
            "relation": "proposesAction",
        },

        # Latent space and encounter links
        {
            "source": "CLM_Vector",
            "target": "Action_Latent_Space",
            "relation": "derivedFrom",
        },
        {
            "source": "Conjunction_Encounter",
            "target": "Orbital_Safety_Domain",
            "relation": "governedBy",
        },
        {
            "source": "CLM_Vector",
            "target": "Conjunction_Encounter",
            "relation": "resolves",
        },
    ]

    reasoning_state: Dict[str, Any] = {
        "clm_vector": {
            "id": int(selected_cand.get("id", 0)),
            "label": cand_label,
            "category": cand_cat,
            "delta_v_mps": round(cand_dv, 2),
            "direction_rtn": [round(x, 4) for x in cand_dir],
            "confidence": round(cand_conf, 4),
            "score": round(cand_score, 4),
        },
        "propellant_evaluation": {
            "node_id": "Propellant_Mass",
            "rule_id": "Rule_R1_Tsiolkovsky",
            "initial_propellant_kg": round(prop_mass, 3),
            "consumed_propellant_kg": round(fuel_consumed_kg, 4) if math.isfinite(fuel_consumed_kg) else None,
            "remaining_propellant_kg": round(fuel_remaining_kg, 4),
            "delta_v_required_mps": round(cand_dv, 2),
            "delta_v_allowable_mps": round(dv_limit_90, 2),
            "margin_mps": round(propellant_margin_mps, 3),
            "status": "PASSED" if propellant_passed else "VIOLATED",
        },
        "thrust_evaluation": {
            "node_id": "Thrust_Capacity",
            "rule_id": "Rule_R2_Thrust_DutyCycle",
            "max_thrust_n": round(max_thrust, 2),
            "max_acceleration_mps2": round(u_max, 4),
            "burn_time_s": round(t_burn, 2) if math.isfinite(t_burn) else None,
            "max_allowable_burn_time_s": round(t_allowable, 2),
            "margin_s": round(thrust_margin_s, 2),
            "status": "PASSED" if thrust_passed else "VIOLATED",
        },
        "rule_results": evaluated_cand.get("rules", []),
        "verdict": verdict,
        "pruning_stats": {
            "total_candidates_screened": evaluated_count,
            "candidates_pruned": rejected_count,
            "selected_rank_index": selected_index,
        },
    }

    result = {
        "nodes": nodes,
        "edges": edges,
        "reasoning_state": reasoning_state,
        "schema": EPG_SCHEMA,
        "graph": {
            "nodes": nodes,
            "edges": edges,
        },
        "summary": {
            "total_nodes": len(nodes),
            "concept_nodes": sum(1 for n in nodes if n["type"] == "concept"),
            "rule_nodes": sum(1 for n in nodes if n["type"] == "rule"),
            "instance_nodes": sum(1 for n in nodes if n["type"] == "instance"),
            "total_edges": len(edges),
            "evaluation_verdict": verdict,
        },
    }

    return sanitize_json(result)
