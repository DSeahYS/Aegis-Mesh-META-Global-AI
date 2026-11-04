# Project AEGIS-MESH — System Context & Executive Brief

> **Autonomous Edge Guidance & ISL Swarm Mesh for Decentralized Space Domain Awareness & Collision Avoidance**  
> *Autonomous Space Domain Awareness & Evasion*

---

## 1. Executive Summary & Context

Space debris in Low Earth Orbit (LEO) has reached an unprecedented density. Ground-based Space Traffic Management (STM) relies on centralized radar networks and takes **8 to 24 hours** to generate and disseminate Conjunction Data Messages (CDMs). For hypervelocity micro-debris ($> 10\text{ km/s}$), this latency loop creates catastrophic blind spots.

**Project AEGIS-MESH** decentralizes space domain awareness by establishing an autonomous, edge-based orbital defense system directly on spacecraft avionics. By combining optical edge sensing, real-time Foster (1992) probability of collision assessment, contrastive maneuver retrieval, deterministic physics validation, and formal control barriers, AEGIS-MESH shrinks the collision avoidance decision window from hours to **sub-second latency**.

---

## 2. Key Architecture: The 5-Stage Closed-Loop Evasion Pipeline

Located in [`backend/app/vv/pipeline.py`](backend/app/vv/pipeline.py), the end-to-end autonomous evasion lifecycle operates in 5 deterministic stages:

1. **Stage 1 (CARA Conjunction Assessment):** Evaluates collision probability $P_c$ from the relative state vector and combined covariance using Gauss-Legendre polar quadrature over the 2D B-plane encounter ellipse. If $P_c \ge 10^{-4}$, the autonomous sequence triggers.
2. **Stage 2 (CLM Maneuver Retrieval):** Executes high-speed dot-product similarity search against a pre-cached action embedding database, retrieving the top-3 candidate $\Delta\mathbf{v}$ escape vectors in $< 16\text{ ms}$.
3. **Stage 3 (EPG Physical Rule Validation):** Filters candidate burns against deterministic orbital mechanics rules:
   - **Rule R1 (Tsiolkovsky Propellant Mass):** $\Delta v \le 0.90 \cdot I_{\text{sp}} g_0 \ln(m_0/m_f)$
   - **Rule R2 (Duty Cycle & Thermal Limit):** $t_{\text{burn}} \le 300\text{ s}$
   - **Rule R3 (Perigee Altitude Floor):** $r_p \ge 200\text{ km}$ ($6578.137\text{ km}$ geocentric)
4. **Stage 4 (HJ Reachability Safety Verification):** Solves the Isaacs PDE to compute the Backward Reachable Tube (BRT), guaranteeing collision avoidance under worst-case uncooperative debris tumbling.
5. **Stage 5 (High-Order Control Barrier Function):** Applies a Quadratic Program (QP) projective filter to enforce relative degree 2 forward invariance of the safe set $\mathcal{C}$ during physical thruster burn execution.

---

## 3. Live Mathematical Verification for Judges

Every mathematical model and safety guarantee is fully implemented and verifiable in real time:

- **CLI Unit Tests:** Run `pytest backend/tests -v` to execute all 27 unit tests synchronously in under 7 seconds.
- **Interactive Web Dashboard:** Launch the frontend (`npm run dev`) and select the **"V&V Proof"** tab in the sidebar. Judges can:
  - Trigger all 16 mathematical self-tests live against analytical oracles ($< 10^{-6}$ error vs. Rician closed-form).
  - Interact with the 5-stage pipeline with custom mass/thrust parameters.
  - View the live HTML5 `<canvas>` Hamilton-Jacobi value function heatmap.
  - Ingest and structurally validate Conjunction Data Messages (CCSDS 508.0-B-1 / ISO 19389).

---

## 4. Key Documents & Cross-References

- **Executive & Detailed Guide:** [`README.md`](README.md) & [`README_DETAILED.md`](README_DETAILED.md)
- **Deep Astrodynamics Research Paper:** [`Research/research.md`](Research/research.md)
- **Architecture & Concept Document:** [`Research/Concept.md`](Research/Concept.md)
