# AEGIS-MESH Mathematical Formulations & Derivations

This document summarizes the core mathematical models used throughout the AEGIS-MESH autonomous guidance and safety pipeline. For step-by-step proofs and benchmark test results, refer to the [Detailed Technical Guide](../README_DETAILED.md).

---

## 1. Foster (1992) 2D B-Plane Collision Probability ($P_c$)

The probability of collision is defined as the integral of the relative positional probability density function over the combined Hard Body Radius ($R = r_1 + r_2$):

$$P_c = \frac{1}{2\pi \sqrt{\det \mathbf{P}_p}} \iint_{\text{HBR}} \exp\left(-\frac{1}{2} (\mathbf{x} - \mathbf{x}_e)^T \mathbf{P}_p^{-1} (\mathbf{x} - \mathbf{x}_e)\right) d\xi \, d\zeta$$

Using polar transformation ($\xi = r\cos\theta, \zeta = r\sin\theta$), the 2D integral simplifies to:

$$P_c = \frac{1}{2\pi \sigma_\xi \sigma_\zeta \sqrt{1 - \rho^2}} \int_0^{2\pi} \int_0^R r \exp\left( -\frac{1}{2(1-\rho^2)} \left[ \frac{(r\cos\theta - x_e)^2}{\sigma_\xi^2} - \frac{2\rho(r\cos\theta - x_e)(r\sin\theta - z_e)}{\sigma_\xi \sigma_\zeta} + \frac{(r\sin\theta - z_e)^2}{\sigma_\zeta^2} \right] \right) dr \, d\theta$$

Evaluated in `backend/app/cara_engine.py` via Gauss-Legendre quadrature (tested against analytical Rician oracles with error $< 10^{-6}$).

---

## 2. Edge Physics Graph (EPG) Deterministic Invariance Rules

1. **Rule R1: Tsiolkovsky Propellant Mass Budget Boundary**
   The maneuver $\Delta v$ cannot exceed the available propellant budget with a 10% safety margin:
   $$\Delta v \le 0.90 \cdot I_{\text{sp}} g_0 \ln\left(\frac{m_{\text{dry}} + m_{\text{prop}}}{m_{\text{dry}}}\right)$$

2. **Rule R2: Thruster Thermal Duty Cycle & Solenoid Protection**
   Total continuous burn time cannot exceed thruster thermal limits ($t_{\text{max\_burn}} = 300\text{ s}$):
   $$t_{\text{burn}} = \frac{m_{\text{dry}} \Delta v}{F_{\text{thrust}}} \le t_{\text{max\_burn}}$$

3. **Rule R3: Orbital Perigee Safety Floor**
   The post-burn perigee radius must remain strictly above the atmospheric entry floor ($h_{\text{floor}} = 200\text{ km}$, geocentric $r_p \ge 6578.137\text{ km}$):
   $$a = -\frac{\mu}{2\varepsilon}, \quad e = \sqrt{1 - \frac{\|\mathbf{h}_+\|^2}{\mu a}}, \quad r_p = a(1 - e) \ge R_{\text{Earth}} + h_{\text{floor}}$$

---

## 3. Hamilton-Jacobi Reachability (Isaacs PDE)

For relative dynamics under bounded thruster control $u \in \mathcal{U}$ and disturbance $d \in \mathcal{D}$:
$$\dot{x} = f(x, u, d)$$

The target avoidance tube is solved backward in time via the Hamilton-Jacobi-Isaacs equation:
$$D_t V(t, x) + \min\left[0, H(x, \nabla V)\right] = 0$$
where the Hamiltonian $H(x, p)$ maximizes avoidance control while assuming adversarial uncooperative debris motion:
$$H(x, p) = \max_{u \in \mathcal{U}} \min_{d \in \mathcal{D}} p^T f(x, u, d)$$

---

## 4. High-Order Control Barrier Functions (HOCBF)

For safe set $\mathcal{C} = \{x \mid h(x) \ge 0\}$ with miss distance function $h(x) = \|\mathbf{r}_{\text{rel}}\|^2 - R_{\text{safe}}^2$:
$$\dot{h}(x) = 2 \mathbf{r}_{\text{rel}} \cdot \mathbf{v}_{\text{rel}}$$
$$\ddot{h}(x) = 2 \|\mathbf{v}_{\text{rel}}\|^2 + 2 \mathbf{r}_{\text{rel}} \cdot (\mathbf{a}_{\text{grav}} + \mathbf{u} - \mathbf{d})$$

The CBF filter computes an admissible control projection $\mathbf{u}^*$ guaranteeing forward invariance $h(t) \ge 0$ for all $t \ge 0$:
$$\ddot{h}(x, \mathbf{u}^*) + \alpha_1 \dot{h}(x) + \alpha_2 h(x) \ge 0$$
