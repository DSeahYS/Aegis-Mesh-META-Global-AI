import json
import sys
from pathlib import Path

def validate():
    res_file = Path(__file__).parent / "results" / "benchmark_report.json"
    if not res_file.exists():
        print("No benchmark results found.")
        sys.exit(1)
        
    with open(res_file, "r") as f:
        data = json.load(f)
        
    lat = data["latency_ms"]["p50"]
    mem = data["memory_bytes"]["peak"]
    pow_w = data["power_watts"]["estimated"]
    
    passed = True
    print("--- SWaP Constraints Validation ---")
    
    if lat <= 16.0:
        print(f"PASS: Latency {lat:.2f}ms <= 16ms")
    else:
        print(f"FAIL: Latency {lat:.2f}ms > 16ms")
        passed = False
        
    if mem <= 2 * 1024 * 1024:
        print(f"PASS: Memory {mem/1024:.2f}KB <= 2048KB")
    else:
        print(f"FAIL: Memory {mem/1024:.2f}KB > 2048KB")
        passed = False
        
    if pow_w <= 5.0:
        print(f"PASS: Power {pow_w:.2f}W <= 5W")
    else:
        print(f"FAIL: Power {pow_w:.2f}W > 5W")
        passed = False
        
    if passed:
        print("\nAll constraints met. Ready for edge deployment.")
        sys.exit(0)
    else:
        print("\nConstraints failed.")
        sys.exit(1)

if __name__ == '__main__':
    validate()
