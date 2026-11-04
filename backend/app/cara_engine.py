import numpy as np
import scipy.stats
from scipy.integrate import dblquad


def b_plane_frame(r_p, v_p, r_s, v_s):
    """Compute orthonormal B-plane coordinate frame (xi_hat, zeta_hat, eta_hat).
    
    r_p, v_p: primary position and velocity (numpy 3-vectors)
    r_s, v_s: secondary position and velocity (numpy 3-vectors)
    Returns:
        (xi_hat, zeta_hat, eta_hat) as unit numpy 3-vectors.
    """
    r_p = np.asarray(r_p, dtype=float)
    v_p = np.asarray(v_p, dtype=float)
    r_s = np.asarray(r_s, dtype=float)
    v_s = np.asarray(v_s, dtype=float)

    if not (np.all(np.isfinite(r_p)) and np.all(np.isfinite(v_p)) and np.all(np.isfinite(r_s)) and np.all(np.isfinite(v_s))):
        return np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), np.array([0.0, 0.0, 1.0])

    dv = v_s - v_p
    v_rel_mag = np.linalg.norm(dv)
    if v_rel_mag < 1e-8 or not np.isfinite(v_rel_mag):
        eta = np.array([0.0, 0.0, 1.0])
    else:
        eta = dv / v_rel_mag

    h = np.cross(r_p, v_p)
    if np.linalg.norm(h) < 1e-6 or not np.all(np.isfinite(h)):
        h = r_p.copy() if np.all(np.isfinite(r_p)) and np.linalg.norm(r_p) >= 1e-6 else np.array([0.0, 0.0, 1.0])

    xi = np.cross(h, eta)
    if np.linalg.norm(xi) < 1e-6 or not np.all(np.isfinite(xi)):
        fallback = np.array([0.0, 0.0, 1.0]) if abs(eta[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        xi = np.cross(fallback, eta)

    xi_norm = np.linalg.norm(xi)
    xi = xi / (xi_norm if xi_norm > 1e-8 else 1.0)
    zeta = np.cross(eta, xi)
    zeta_norm = np.linalg.norm(zeta)
    zeta = zeta / (zeta_norm if zeta_norm > 1e-8 else 1.0)

    # Re-normalize and ensure exact right-handed triad
    eta_norm = np.linalg.norm(eta)
    eta = eta / (eta_norm if eta_norm > 1e-8 else 1.0)
    return xi, zeta, eta


def project_covariance(cov3, xi_hat, zeta_hat):
    """Project a 3x3 covariance matrix onto the 2D B-plane.
    
    B = [xi_hat, zeta_hat] (3x2)
    cov2 = B^T * cov3 * B (2x2)
    """
    B = np.column_stack([xi_hat, zeta_hat])
    cov3_arr = np.asarray(cov3, dtype=float)
    return B.T @ cov3_arr @ B


def pc_small_hbr(b_plane, cov, hbr, basis=None) -> float:
    """Asymptotic small-HBR collision probability:
    R^2 / (2 * sqrt(|C|)) * exp(-0.5 * mu^T * C^-1 * mu).
    """
    cov_arr = np.asarray(cov, dtype=float)
    if cov_arr.shape == (3, 3):
        if basis is None:
            raise ValueError("basis=(xi_hat, zeta_hat) required for 3x3 covariance")
        cov_arr = project_covariance(cov_arr, basis[0], basis[1])

    if isinstance(b_plane, dict):
        mu = np.array([float(b_plane["xi"]), float(b_plane["zeta"])], dtype=float)
    else:
        mu = np.asarray(b_plane, dtype=float)[:2]

    if not (np.all(np.isfinite(mu)) and np.all(np.isfinite(cov_arr))):
        return 0.0

    det_c = float(np.linalg.det(cov_arr))
    if not np.isfinite(det_c) or det_c <= 0.0 or hbr <= 0.0:
        return 0.0

    inv_c = np.linalg.pinv(cov_arr)
    mahal_sq = float(mu @ inv_c @ mu)
    exponent = -0.5 * mahal_sq
    if exponent < -100.0 or not np.isfinite(exponent):
        return 0.0

    r = float(hbr)
    asymptote = (r ** 2 / (2.0 * np.sqrt(det_c))) * np.exp(exponent)
    if not np.isfinite(asymptote):
        return 0.0
    return float(min(1.0, max(0.0, asymptote)))


def pc_isotropic_exact(miss: float, sigma: float, R: float) -> float:
    """Exact Rician oracle for isotropic covariance:
    scipy.stats.ncx2.cdf((R/sigma)^2, df=2, nc=(miss/sigma)^2).
    """
    return float(scipy.stats.ncx2.cdf((R / sigma) ** 2, df=2, nc=(miss / sigma) ** 2))


def pc_monte_carlo(miss, C, R: float, n: int = 400_000, seed: int = 42):
    """Monte Carlo 2D collision probability estimation with standard error."""
    rng = np.random.default_rng(seed)
    if isinstance(miss, dict):
        mu = np.array([float(miss["xi"]), float(miss["zeta"])], dtype=float)
    else:
        mu = np.asarray(miss, dtype=float)[:2]

    C_arr = np.asarray(C, dtype=float)
    samples = rng.multivariate_normal(mu, C_arr, size=n)
    dists_sq = np.sum(samples ** 2, axis=1)
    hits = int(np.count_nonzero(dists_sq <= float(R) ** 2))
    pc = hits / float(n)
    se = float(np.sqrt(pc * (1.0 - pc) / n))
    return float(pc), se


class CARAEngine:
    def __init__(self):
        pass

    def b_plane_frame(self, r_p, v_p, r_s, v_s):
        return b_plane_frame(r_p, v_p, r_s, v_s)

    def project_covariance(self, cov3, xi_hat, zeta_hat):
        return project_covariance(cov3, xi_hat, zeta_hat)

    def compute_b_plane(self, r_p, v_p, r_s, v_s):
        dr = np.asarray(r_s, dtype=float) - np.asarray(r_p, dtype=float)
        xi, zeta, eta = self.b_plane_frame(r_p, v_p, r_s, v_s)

        b_xi = float(np.dot(dr, xi))
        b_zeta = float(np.dot(dr, zeta))

        return {
            "xi": float(b_xi),
            "zeta": float(b_zeta),
            "b_mag": float(np.sqrt(b_xi ** 2 + b_zeta ** 2)),
        }

    def compute_probability(self, b_plane, combined_cov, hbr_km: float, basis=None) -> float:
        """Foster (1992) 2D B-plane collision probability via high-order Gauss-Legendre polar quadrature.
        
        (1/(2π√|C|)) ∬_{|x|≤R} exp(-½ (x-μ)ᵀ C⁻¹ (x-μ)) dA, μ=(xi, zeta).
        If combined_cov is 3x3, projects using basis=(xi_hat, zeta_hat).
        """
        try:
            cov_arr = np.asarray(combined_cov, dtype=float)
            if cov_arr.shape == (3, 3):
                if basis is None:
                    raise ValueError("basis=(xi_hat, zeta_hat) required for 3x3 covariance projection")
                cov_arr = self.project_covariance(cov_arr, basis[0], basis[1])

            if isinstance(b_plane, dict):
                mu = np.array([float(b_plane["xi"]), float(b_plane["zeta"])], dtype=float)
            else:
                mu = np.asarray(b_plane, dtype=float)[:2]

            r_hbr = float(hbr_km)
            if r_hbr <= 0.0 or not np.isfinite(r_hbr):
                return 0.0

            if not (np.all(np.isfinite(mu)) and np.all(np.isfinite(cov_arr))):
                return 0.0

            det_cov = float(np.linalg.det(cov_arr))
            if det_cov <= 1e-18 or not np.isfinite(det_cov):
                return 0.0

            inv_cov = np.linalg.pinv(cov_arr)
            eigvals = np.linalg.eigvalsh(cov_arr)
            sigma_max = np.sqrt(max(1e-12, float(np.max(eigvals))))
            norm_mu = float(np.linalg.norm(mu))

            # If HBR completely covers the uncertainty distribution (> 8 sigma beyond center)
            if r_hbr >= norm_mu + 8.0 * sigma_max:
                return 1.0

            r_effective = min(r_hbr, norm_mu + 8.0 * sigma_max)

            # High-order Gauss-Legendre polar quadrature (n_r=50, n_th=100)
            n_r = 50
            n_th = 100
            x_r, w_r = np.polynomial.legendre.leggauss(n_r)
            r = 0.5 * r_effective * (x_r + 1.0)
            w_r = 0.5 * r_effective * w_r

            x_th, w_th = np.polynomial.legendre.leggauss(n_th)
            th = np.pi * (x_th + 1.0)
            w_th = np.pi * w_th

            R_grid, TH_grid = np.meshgrid(r, th, indexing="ij")
            W_grid = np.outer(w_r, w_th)

            x = R_grid * np.cos(TH_grid) - mu[0]
            y = R_grid * np.sin(TH_grid) - mu[1]

            Q = inv_cov[0, 0] * x ** 2 + 2.0 * inv_cov[0, 1] * x * y + inv_cov[1, 1] * y ** 2
            integrand = R_grid * np.exp(-0.5 * np.maximum(0.0, Q))
            integral_val = float(np.sum(W_grid * integrand))

            denom = 2.0 * np.pi * np.sqrt(det_cov)
            if denom <= 0.0 or not np.isfinite(denom):
                return 0.0

            pc = integral_val / denom
            if not np.isfinite(pc):
                return 0.0
            return float(min(1.0, max(0.0, pc)))
        except Exception:
            return 0.0

    def pc_small_hbr(self, b_plane, cov, hbr, basis=None) -> float:
        return pc_small_hbr(b_plane, cov, hbr, basis)

    def pc_isotropic_exact(self, miss: float, sigma: float, R: float) -> float:
        return pc_isotropic_exact(miss, sigma, R)

    def pc_monte_carlo(self, miss, C, R: float, n: int = 400_000, seed: int = 42):
        return pc_monte_carlo(miss, C, R, n, seed)
