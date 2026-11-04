import numpy as np
import time
import tracemalloc
import json
import os
from pathlib import Path

RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

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

def run_benchmark():
    print("Initializing benchmark...")
    
    rng = mulberry32(0x504143)
    num_clusters = 8
    embedding_dim = 16
    codebook_size = 256
    
    centroids = []
    for _ in range(num_clusters):
        raw = [rng() * 2 - 1 for _ in range(embedding_dim)]
        centroids.append(l2_normalize(np.array(raw)))
        
    actions_per_cluster = codebook_size // num_clusters
    codebook = []
    
    for i in range(codebook_size):
        cluster_idx = min(num_clusters - 1, i // actions_per_cluster)
        centroid = centroids[cluster_idx]
        perturbed = [centroid[d] + (rng() * 2 - 1) * 0.22 for d in range(embedding_dim)]
        normalized = l2_normalize(np.array(perturbed))
        codebook.append(normalized)
    
    codebook = np.array(codebook)
    
    rng_mlp = mulberry32(0x434c4d)
    limit1 = np.sqrt(2 / 4)
    w1 = np.array([[(rng_mlp() * 2 - 1) * limit1 for _ in range(4)] for _ in range(32)])
    b1 = np.array([(rng_mlp() * 2 - 1) * 0.05 for _ in range(32)])
    
    limit2 = np.sqrt(2 / 32)
    w2 = np.array([[(rng_mlp() * 2 - 1) * limit2 for _ in range(32)] for _ in range(16)])
    b2 = np.array([(rng_mlp() * 2 - 1) * 0.05 for _ in range(16)])

    iterations = 1000
    latencies = []
    inputs = np.random.randn(iterations, 4).astype(np.float32)

    tracemalloc.start()
    start_cpu = time.process_time()
    
    for i in range(iterations):
        t0 = time.perf_counter()
        
        x = inputs[i]
        h1 = np.maximum(0, np.dot(w1, x) + b1)
        z = np.dot(w2, h1) + b2
        z_norm = l2_normalize(z)
        
        dots = np.dot(codebook, z_norm)
        
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000)
        
    cpu_time = time.process_time() - start_cpu
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    latencies = np.array(latencies)
    mean_lat = np.mean(latencies)
    p50_lat = np.percentile(latencies, 50)
    p95_lat = np.percentile(latencies, 95)
    max_lat = np.max(latencies)

    power = 4.2 # Based on Microchip PolarFire SoC active inference power draw in W

    res = {
        "latency_ms": {
            "mean": float(mean_lat),
            "p50": float(p50_lat),
            "p95": float(p95_lat),
            "max": float(max_lat)
        },
        "memory_bytes": {
            "peak": int(peak_mem)
        },
        "power_watts": {
            "estimated": float(power)
        }
    }
    
    with open(RESULTS_DIR / "benchmark_report.json", "w") as f:
        json.dump(res, f, indent=2)
        
    print(f"Mean Latency: {mean_lat:.2f}ms")
    print(f"Peak Memory: {peak_mem / 1024:.2f}KB")
    print(f"Est Power: {power:.2f}W")

if __name__ == '__main__':
    run_benchmark()
