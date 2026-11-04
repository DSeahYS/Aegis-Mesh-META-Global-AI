/**
 * Formatting utilities for V&V Proof telemetry and numerical oracles
 */

export function formatNumberSmart(
  val: number | string | null | undefined,
  precision = 4
): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val;
  if (!Number.isFinite(val)) return '—';
  if (val === 0) return '0';

  const abs = Math.abs(val);
  if (abs < 1e-3 || abs >= 1e4) {
    return val.toExponential(2);
  }
  return Number(val.toFixed(precision)).toString();
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  return `${ms.toFixed(1)} ms`;
}

export function formatProbability(pc: number | null | undefined): string {
  if (pc === null || pc === undefined || !Number.isFinite(pc)) return '—';
  if (pc === 0) return '0.00e+0';
  return pc.toExponential(2);
}

export function formatDistanceM(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  if (Math.abs(m) >= 1000) {
    return `${(m / 1000).toFixed(2)} km`;
  }
  return `${m.toFixed(1)} m`;
}
