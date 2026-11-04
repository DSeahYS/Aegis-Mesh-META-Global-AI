"""
Edge Retrieval Engine — Maneuver-Retrieval Prototype (Untrained)

This module implements a seeded-random codebook and MLP for maneuver candidate
retrieval via dot-product similarity search. The weights are initialized from a
deterministic PRNG seed (not trained via InfoNCE or any loss function).

In a production system, this codebook would be trained on astrodynamically valid
escape trajectories using contrastive learning (InfoNCE loss). The current
implementation demonstrates the retrieval architecture and API only.
"""

import numpy as np

def mulberry32(seed: int):
    s = seed & 0xFFFFFFFF
    def next_val():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((s ^ (s >> 15)) * (1 | s)) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF) & 0xFFFFFFFF
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        return t / 4294967296.0
    return next_val

def l2_normalize(v):
    norm = np.linalg.norm(v)
    if norm < 1e-12:
        return np.zeros_like(v)
    return v / norm

class CLMEngine:
    def __init__(self):
        self.embedding_dim = 16
        self.codebook_size = 256
        self.num_clusters = 8
        self.temperature = 0.07
        
        self._generate_codebook()
        self._init_mlp()

    def _generate_codebook(self):
        rng = mulberry32(0x504143)
        
        cluster_configs = [
            {'category': 'prograde', 'namePrefix': 'PRO-BOOST', 'dirBase': [0.05, 0.98, 0.02], 'dvRange': [1.2, 5.5]},
            {'category': 'retrograde', 'namePrefix': 'RETRO-DIVE', 'dirBase': [-0.04, -0.98, 0.01], 'dvRange': [1.4, 6.2]},
            {'category': 'radial-out', 'namePrefix': 'RADIAL-OUT', 'dirBase': [0.96, 0.08, -0.05], 'dvRange': [2.0, 7.8]},
            {'category': 'radial-in', 'namePrefix': 'RADIAL-IN', 'dirBase': [-0.96, -0.06, 0.04], 'dvRange': [2.0, 7.5]},
            {'category': 'cross-north', 'namePrefix': 'INC-NORTH', 'dirBase': [0.02, 0.04, 0.98], 'dvRange': [2.5, 9.0]},
            {'category': 'cross-south', 'namePrefix': 'INC-SOUTH', 'dirBase': [-0.03, -0.02, -0.98], 'dvRange': [2.5, 9.2]},
            {'category': 'emergency-escape', 'namePrefix': 'EMERG-EVADE', 'dirBase': [0.55, 0.65, 0.52], 'dvRange': [5.0, 14.8]},
            {'category': 'continuous-phasing', 'namePrefix': 'E-PHASE', 'dirBase': [0.12, 0.92, -0.15], 'dvRange': [0.4, 2.2]},
        ]
        
        centroids = []
        for _ in range(self.num_clusters):
            raw = [rng() * 2 - 1 for _ in range(self.embedding_dim)]
            centroids.append(l2_normalize(np.array(raw)))
            
        actions_per_cluster = self.codebook_size // self.num_clusters
        
        codebook = []
        metadata = []
        
        for i in range(self.codebook_size):
            cluster_idx = min(self.num_clusters - 1, i // actions_per_cluster)
            centroid = centroids[cluster_idx]
            cfg = cluster_configs[cluster_idx]
            
            perturbed = [centroid[d] + (rng() * 2 - 1) * 0.22 for d in range(self.embedding_dim)]
            normalized = l2_normalize(np.array(perturbed))
            codebook.append(normalized)
            
            progress = (i % actions_per_cluster) / actions_per_cluster
            dv_mag = cfg['dvRange'][0] + progress * (cfg['dvRange'][1] - cfg['dvRange'][0]) + (rng() - 0.5) * 0.3
            
            dir_base = cfg['dirBase']
            dir_vec = [
                dir_base[0] + (rng() - 0.5) * 0.08,
                dir_base[1] + (rng() - 0.5) * 0.08,
                dir_base[2] + (rng() - 0.5) * 0.08,
            ]
            dir_norm = np.linalg.norm(dir_vec)
            
            metadata.append({
                'id': i,
                'label': f"{cfg['namePrefix']}-{str(i).zfill(3)}",
                'category': cfg['category'],
                'clusterIndex': cluster_idx,
                'deltaV': {
                    'magnitude': round(max(0.1, dv_mag), 2),
                    'direction': [dir_vec[0]/dir_norm, dir_vec[1]/dir_norm, dir_vec[2]/dir_norm]
                }
            })
            
        self.action_codebook = np.array(codebook)
        self.action_metadata = metadata

    def _init_mlp(self):
        rng = mulberry32(0x434c4d)
        input_dim = 4
        hidden_dim = 32
        
        limit1 = np.sqrt(2 / input_dim)
        self.w1 = np.array([[(rng() * 2 - 1) * limit1 for _ in range(input_dim)] for _ in range(hidden_dim)])
        self.b1 = np.array([(rng() * 2 - 1) * 0.05 for _ in range(hidden_dim)])
        
        limit2 = np.sqrt(2 / hidden_dim)
        self.w2 = np.array([[(rng() * 2 - 1) * limit2 for _ in range(hidden_dim)] for _ in range(self.embedding_dim)])
        self.b2 = np.array([(rng() * 2 - 1) * 0.05 for _ in range(self.embedding_dim)])

    def encode_state(self, telemetry: list) -> np.ndarray:
        tca = telemetry[0] if len(telemetry) > 0 else 40.0
        md = telemetry[1] if len(telemetry) > 1 else 0.2
        rv = telemetry[2] if len(telemetry) > 2 else 11.0
        mass = telemetry[3] if len(telemetry) > 3 else 45.0
        
        x = np.array([
            max(-2.5, min(2.5, (tca - 50.0) / 75.0)),
            max(-2.5, min(2.5, (md - 0.5) / 1.2)),
            max(-2.5, min(2.5, (rv - 10.0) / 5.0)),
            max(-2.5, min(2.5, (np.log10(max(0.1, mass)) - 1.5) / 1.5))
        ])
        
        h1 = np.maximum(0, np.dot(self.w1, x) + self.b1)
        z = np.dot(self.w2, h1) + self.b2
        
        return l2_normalize(z)

    def _encode_state(self, telemetry: list) -> np.ndarray:
        if len(telemetry) == self.embedding_dim:
            return l2_normalize(np.array(telemetry))
        elif len(telemetry) == 4:
            return self.encode_state(telemetry)
        elif len(telemetry) < self.embedding_dim:
            # Placeholder: zero-padding raw telemetry into 16-D space is a temporary placeholder
            # for when full state embeddings are unavailable.
            padded = list(telemetry) + [0] * (self.embedding_dim - len(telemetry))
            return l2_normalize(np.array(padded))
        else:
            return l2_normalize(np.array(telemetry[:self.embedding_dim]))

    def infer(self, telemetry: list):
        state_vector = self._encode_state(telemetry)
        dots = np.dot(self.action_codebook, state_vector)
        logits = dots / self.temperature
        
        max_logit = np.max(logits)
        exp_vals = np.exp(np.maximum(-50, logits - max_logit))
        softmax_probs = exp_vals / np.sum(exp_vals)
        
        top_indices = np.argsort(dots)[::-1][:3]
        
        results = []
        for idx in top_indices:
            meta = self.action_metadata[idx]
            action_str = f"{meta['label']} [{meta['category'].upper()}] dv={meta['deltaV']['magnitude']}m/s"
            results.append({
                "action": action_str,
                "confidence": float(round(softmax_probs[idx], 3)),
                "score": float(round(dots[idx], 3))
            })
            
        return results

    def rank_candidates(self, telemetry: list, k: int = None) -> list[dict]:
        """Rank the action codebook by dot score given telemetry.
        
        Returns:
            list of dicts with keys: rank, id, label, category, delta_v_mps, direction_rtn, confidence, score.
        """
        state_vector = self._encode_state(telemetry)
        dots = np.dot(self.action_codebook, state_vector)
        logits = dots / self.temperature

        max_logit = np.max(logits)
        exp_vals = np.exp(np.maximum(-50, logits - max_logit))
        softmax_probs = exp_vals / np.sum(exp_vals)

        ranked_indices = np.argsort(dots)[::-1]
        if k is not None:
            ranked_indices = ranked_indices[:k]

        results = []
        for rank, idx in enumerate(ranked_indices, 1):
            meta = self.action_metadata[idx]
            dir_vec = [float(x) for x in meta["deltaV"]["direction"]]
            results.append({
                "rank": int(rank),
                "id": int(meta["id"]),
                "label": str(meta["label"]),
                "category": str(meta["category"]),
                "delta_v_mps": float(meta["deltaV"]["magnitude"]),
                "direction_rtn": dir_vec,
                "confidence": float(round(float(softmax_probs[idx]), 4)),
                "score": float(round(float(dots[idx]), 4)),
            })
        return results
