# AEGIS-MESH Hardware Benchmarking and Profiling Suite

This benchmark suite validates that the CLM inference pipeline for satellite collision avoidance runs within the strict SWaP (Size, Weight, and Power) constraints of the Microchip PolarFire SoC.

## Constraints
- **Latency**: < 16ms per inference iteration
- **Memory**: < 2MB SRAM working memory footprint
- **Power**: < 5W power budget

## Files
- `run_benchmark.py`: Main benchmark script (latency, throughput, simulated power).
- `profile_memory.py`: Detailed memory profiling script (model weights, codebook).
- `validate_swap.py`: Validates benchmark results against SWaP constraints.
- `generate_report.py`: Generates the final markdown report.
