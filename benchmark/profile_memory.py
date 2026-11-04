import numpy as np
import json
import os
from pathlib import Path

RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

def main():
    w1_size = 32 * 4 * 4
    b1_size = 32 * 4
    w2_size = 16 * 32 * 4
    b2_size = 16 * 4
    
    mlp_total = w1_size + b1_size + w2_size + b2_size
    
    codebook_fp32 = 256 * 16 * 4
    codebook_int8 = 256 * 16 * 1
    
    working_mem = 4 * 4 + 32 * 4 + 16 * 4 + 256 * 4
    
    total_fp32 = mlp_total + codebook_fp32 + working_mem
    total_int8 = mlp_total + codebook_int8 + working_mem
    
    budget = 2 * 1024 * 1024
    
    results = {
        "mlp_weights_bytes": mlp_total,
        "codebook_fp32_bytes": codebook_fp32,
        "codebook_int8_bytes": codebook_int8,
        "working_memory_bytes": working_mem,
        "total_fp32_bytes": total_fp32,
        "total_int8_bytes": total_int8,
        "sram_budget_bytes": budget,
        "fits_in_sram": total_fp32 <= budget
    }
    
    with open(RESULTS_DIR / "memory_profile.json", "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"Memory profile saved.")
    print(f"Total (FP32): {total_fp32} bytes")
    print(f"SRAM Budget:  {budget} bytes")
    print(f"Fits in SRAM: {results['fits_in_sram']}")

if __name__ == "__main__":
    main()
