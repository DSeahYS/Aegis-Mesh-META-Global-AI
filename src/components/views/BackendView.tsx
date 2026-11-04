import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import {
  Server,
  Wifi,
  WifiOff,
  Database,
  Zap,
  Radar,
  Gauge,
  FileText,
  RotateCcw,
  Send,
  Clock,
} from 'lucide-react';
import {
  getHealth,
  runInference,
  fetchTLEs,
  assessConjunction,
  getBenchmarkResults,
  parseCDM,
  type HealthStatus,
  type InferenceResult,
  type TLEData,
  type ConjunctionResult,
  type BenchmarkReport,
  type CDMData,
} from '../../lib/apiClient';

// -------------------------------------------------------------
// Live API activity log
// -------------------------------------------------------------
interface ApiLogEntry {
  id: number;
  time: string;
  method: string;
  endpoint: string;
  status: number | string;
  durationMs: number;
}

const SAMPLE_CDM = `COMMENT Conjunction Data Message
CCSDS_CDM_VERS = 2.0
CREATION_DATE = 2026-09-29T10:00:00.000Z
ORIGINATOR = AEGIS-MESH
META_START
OBJECT = OBJECT_A
OBJECT_NAME = ISS (ZARYA)
OBJECT_ID = 1998-067A
EPOCH = 2026-09-29T11:30:00.000Z
META_STOP
META_START
OBJECT = OBJECT_B
OBJECT_NAME = CSS (TIANHE)
OBJECT_ID = 2021-035A
EPOCH = 2026-09-29T11:30:00.000Z
META_STOP
RELATIVE_POSITION_R = 1200.0
RELATIVE_POSITION_T = -850.0
RELATIVE_POSITION_N = 300.0
RELATIVE_SPEED = 10.5
MISS_DISTANCE = 1.49
TCA = 2026-09-29T11:30:00.000Z
COLLISION_PROBABILITY = 2.5E-05`;

const SAMPLE_TLE = {
  norad_id: '25544',
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26272.11005302  .00004557  00000+0  91790-4 0  9991',
  line2: '2 25544  51.6312 145.7721 0007123 200.7262 159.3438 15.48685648587861',
};

const SAMPLE_TLE_2 = {
  norad_id: '49863',
  name: 'COSMOS 1408 DEB',
  line1: '1 49863U 82092PR  26272.50000000  .00010000  00000+0  10000-3 0  9999',
  line2: '2 49863  82.5000 120.0000 0020000  90.0000 270.0000 14.50000000210000'
};


export const BackendView: FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [tles, setTles] = useState<TLEData[] | null>(null);
  const [conjunction, setConjunction] = useState<ConjunctionResult | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [cdmText, setCdmText] = useState(SAMPLE_CDM);
  const [cdmData, setCdmData] = useState<CDMData | null>(null);
  const [apiLog, setApiLog] = useState<ApiLogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const pushLog = useCallback((method: string, endpoint: string, status: number | string, durationMs: number) => {
    logIdRef.current += 1;
    const entry: ApiLogEntry = {
      id: logIdRef.current,
      time: new Date().toLocaleTimeString([], { hour12: false }),
      method,
      endpoint,
      status,
      durationMs,
    };
    setApiLog((prev) => [...prev.slice(-49), entry]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [apiLog]);

  // Poll backend health continuously
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const t0 = performance.now();
      const h = await getHealth();
      pushLog('GET', '/api/health', h ? 200 : 'ERR', performance.now() - t0);
      if (!cancelled) setHealth(h);
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pushLog]);

  const isConnected = health?.status === 'ok';

  const handleRunInference = async () => {
    setBusy('inference');
    const t0 = performance.now();
    const res = await runInference([40.0, 0.2, 11.0, 45.0]);
    pushLog('POST', '/api/inference', res ? 200 : 'ERR', performance.now() - t0);
    setInference(res);
    setBusy(null);
  };

  const handleFetchTLEs = async () => {
    setBusy('tles');
    const t0 = performance.now();
    const res = await fetchTLEs({ group: 'stations' });
    pushLog('GET', '/api/tle/query?group=stations', res ? 200 : 'ERR', performance.now() - t0);
    setTles(res);
    setBusy(null);
  };

  const handleAssessConjunction = async () => {
    setBusy('conjunction');
    const t0 = performance.now();
    const res = await assessConjunction(SAMPLE_TLE, SAMPLE_TLE_2, '2026-09-29T12:00:00Z', 10.0);
    pushLog('POST', '/api/conjunction/assess', res ? 200 : 'ERR', performance.now() - t0);
    setConjunction(res);
    setBusy(null);
  };

  const handleBenchmark = async () => {
    setBusy('benchmark');
    const t0 = performance.now();
    const res = await getBenchmarkResults();
    pushLog('GET', '/api/benchmark/results', res && !('error' in res) ? 200 : 'ERR', performance.now() - t0);
    setBenchmark(res && !('error' in res) ? res : null);
    setBusy(null);
  };

  const handleParseCDM = async () => {
    if (!cdmText) return;
    setBusy('cdm');
    const t0 = performance.now();
    const res = await parseCDM(cdmText);
    pushLog('POST', '/api/cdm/parse', res ? 200 : 'ERR', performance.now() - t0);
    setCdmData(res);
    setBusy(null);
  };

  const uptimeSec = health ? Math.max(0, Math.round(health.uptime)) : 0;

  return (
    <div className="w-full min-h-full p-6 space-y-6 text-zinc-100 pb-10">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-space-600/80">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-cyber-green animate-pulse' : 'bg-alert-red'}`} />
            <span className="text-xs font-mono tracking-widest text-cyber-green uppercase font-semibold">
              EDGE BACKEND CONSOLE
            </span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs font-mono text-zinc-400">POLARFIRE SWaP SIMULATION</span>
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white mt-0.5">
            FastAPI Backend Live Telemetry
          </h1>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto font-mono text-xs">
          <div className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-cyber-green" />
                <span className="text-cyber-green font-semibold">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-alert-red" />
                <span className="text-alert-red font-semibold">OFFLINE</span>
              </>
            )}
          </div>
          <div className="px-3 py-1.5 rounded-sm bg-space-800/80 border border-space-600 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-300">UPTIME {uptimeSec}s</span>
          </div>
        </div>
      </div>

      {/* ============ PANEL GRID ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-7 space-y-5">
          {/* Inference Panel */}
          <div className="bg-space-800 border border-space-600 rounded-sm p-5 font-mono">
            <div className="flex items-center justify-between mb-4 border-b border-space-600 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-100">
                <Zap className="w-4 h-4 text-yellow-400" />
                CLM INFERENCE (/api/inference)
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
                4-D TELEMETRY → 16-D LATENT
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] mb-4">
              {[
                { label: 'TCA (s)', value: '40.0' },
                { label: 'MISS DIST (km)', value: '0.20' },
                { label: 'REL VEL (km/s)', value: '11.0' },
                { label: 'DEBRIS MASS (kg)', value: '45.0' },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">{s.label}</div>
                  <div className="text-zinc-100 font-bold text-sm mt-0.5">{s.value}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleRunInference}
              disabled={busy !== null || !isConnected}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-2 rounded transition-colors flex items-center justify-center gap-2 text-xs font-semibold"
            >
              <Send className="w-3.5 h-3.5" />
              {busy === 'inference' ? 'RUNNING…' : 'RUN EDGE INFERENCE'}
            </button>
            {inference && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>
                    SOURCE:{' '}
                    <span className={inference.source === 'polarfire-backend' ? 'text-cyber-green' : 'text-alert-amber'}>
                      {inference.source}
                    </span>
                  </span>
                  <span>LATENCY: <span className="text-blue-300 font-bold">{inference.latency_ms.toFixed(3)} ms</span></span>
                </div>
                {inference.top_actions.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-zinc-900 border border-space-700 rounded px-3 py-2 text-[11px]"
                  >
                    <span className="text-zinc-200">
                      <span className="text-zinc-500 mr-2">#{i + 1}</span>
                      {a.action}
                    </span>
                    <span className="text-emerald-500 font-bold">
                      {(a.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TLE Catalog Panel */}
          <div className="bg-space-800 border border-space-600 rounded-sm p-5 font-mono">
            <div className="flex items-center justify-between mb-4 border-b border-space-600 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-100">
                <Database className="w-4 h-4 text-indigo-400" />
                LIVE TLE CATALOG (/api/tle/query)
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950/60 text-blue-300 border border-blue-500/30">
                CELESTRAK UPLINK
              </span>
            </div>
            <button
              type="button"
              onClick={handleFetchTLEs}
              disabled={busy !== null || !isConnected}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded transition-colors text-xs font-semibold"
            >
              {busy === 'tles' ? 'FETCHING…' : 'FETCH STATION TLEs'}
            </button>
            {tles && (
              <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
                <div className="text-[10px] text-zinc-400">{tles.length} elements received from backend</div>
                {tles.slice(0, 5).map((t, idx) => (
                  <div key={idx} className="bg-zinc-900 border border-space-700 rounded p-2 text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="text-cyber-blue font-bold">{t.name}</span>
                      <span className="text-zinc-500">NORAD {t.norad_id}</span>
                    </div>
                    <div className="text-zinc-500 mt-1 truncate">{t.line1}</div>
                    <div className="text-zinc-500 truncate">{t.line2}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CDM Parser Panel */}
          <div className="bg-space-800 border border-space-600 rounded-sm p-5 font-mono">
            <div className="flex items-center justify-between mb-4 border-b border-space-600 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-100">
                <FileText className="w-4 h-4 text-emerald-500" />
                CDM PARSER (/api/cdm/parse)
              </h2>
              <button
                type="button"
                onClick={() => setCdmText(SAMPLE_CDM)}
                className="text-[10px] px-2 py-1 rounded bg-space-700 text-zinc-300 hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> SAMPLE
              </button>
            </div>
            <textarea
              value={cdmText}
              onChange={(e) => setCdmText(e.target.value)}
              placeholder="Paste CCSDS CDM here..."
              className="w-full h-28 bg-zinc-900 border border-space-700 rounded p-2 text-[10px] text-zinc-300 mb-3 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleParseCDM}
              disabled={busy !== null || !isConnected || !cdmText}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 px-6 rounded transition-colors text-xs font-semibold"
            >
              {busy === 'cdm' ? 'PARSING…' : 'PARSE CDM'}
            </button>
            {cdmData && (
              <div className="mt-4 p-3 bg-zinc-900 border border-emerald-900 rounded text-[11px] space-y-1">
                <div className="text-emerald-500 font-bold mb-1">PARSED CONJUNCTION MESSAGE</div>
                <div className="text-zinc-400">Message ID: <span className="text-zinc-200">{cdmData.messageId || '(not set)'}</span></div>
                <div className="text-zinc-400">Created: <span className="text-zinc-200">{cdmData.creationDate || '(not set)'}</span></div>
                <div className="text-zinc-400">Primary: <span className="text-cyber-blue">{cdmData.primaryObject || '(unknown)'}</span></div>
                <div className="text-zinc-400">Secondary: <span className="text-alert-amber">{cdmData.secondaryObject || '(unknown)'}</span></div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-5 space-y-5">
          {/* Conjunction Assessment Panel */}
          <div className="bg-space-800 border border-space-600 rounded-sm p-5 font-mono">
            <div className="flex items-center justify-between mb-4 border-b border-space-600 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-100">
                <Radar className="w-4 h-4 text-rose-400" />
                CONJUNCTION ASSESSMENT
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30">
                SGP4 + FOSTER B-PLANE
              </span>
            </div>
            <button
              type="button"
              onClick={handleAssessConjunction}
              disabled={busy !== null || !isConnected}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-2 rounded transition-colors text-xs font-semibold"
            >
              {busy === 'conjunction' ? 'PROPAGATING…' : 'RUN ASSESSMENT (ISS @ 12:00Z)'}
            </button>
            {conjunction && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">MISS DISTANCE</div>
                  <div className="text-zinc-100 font-bold text-sm">{conjunction.missDistance.toFixed(4)} km</div>
                </div>
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">COLLISION PROB</div>
                  <div className="text-alert-amber font-bold text-sm">{conjunction.probability.toExponential(2)}</div>
                </div>
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">REL VELOCITY</div>
                  <div className="text-blue-300 font-bold text-sm">{conjunction.relativeVelocityKmS ?? '—'} km/s</div>
                </div>
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">B-PLANE |b|</div>
                  <div className="text-zinc-100 font-bold text-sm">{(conjunction.bPlaneB ?? 0).toFixed(3)} km</div>
                </div>
              </div>
            )}
          </div>

          {/* Benchmark Panel */}
          <div className="bg-space-800 border border-space-600 rounded-sm p-5 font-mono">
            <div className="flex items-center justify-between mb-4 border-b border-space-600 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-100">
                <Gauge className="w-4 h-4 text-blue-400" />
                BENCHMARK REPORT (/api/benchmark/results)
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950/60 text-blue-300 border border-cyan-500/30">
                1000 ITERATIONS
              </span>
            </div>
            <button
              type="button"
              onClick={handleBenchmark}
              disabled={busy !== null || !isConnected}
              className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white py-2 rounded transition-colors text-xs font-semibold"
            >
              {busy === 'benchmark' ? 'LOADING…' : 'FETCH BENCHMARK RESULTS'}
            </button>
            {benchmark && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">MEAN LATENCY</div>
                  <div className="text-cyber-green font-bold text-sm">{benchmark.latency_ms.mean.toFixed(3)} ms</div>
                </div>
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">P95 LATENCY</div>
                  <div className="text-blue-300 font-bold text-sm">{benchmark.latency_ms.p95.toFixed(3)} ms</div>
                </div>
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">PEAK MEMORY</div>
                  <div className="text-zinc-100 font-bold text-sm">{(benchmark.memory_bytes.peak / 1024).toFixed(1)} KB</div>
                </div>
                <div className="bg-zinc-900 border border-space-700 rounded p-2">
                  <div className="text-zinc-500">EST POWER</div>
                  <div className="text-alert-amber font-bold text-sm">{benchmark.power_watts.estimated.toFixed(2)} W</div>
                </div>
              </div>
            )}
          </div>

          {/* Live API Activity Log */}
          <div className="bg-space-800 border border-space-600 rounded-sm p-5 font-mono">
            <div className="flex items-center justify-between mb-4 border-b border-space-600 pb-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-100">
                <Server className="w-4 h-4 text-cyber-green" />
                BACKEND API ACTIVITY
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-space-700/80 text-zinc-300 border border-space-600">
                {apiLog.length} CALLS
              </span>
            </div>
            <div className="bg-zinc-950 rounded border border-space-700 p-3 h-48 overflow-y-auto text-[10px] leading-relaxed">
              {apiLog.length === 0 ? (
                <div className="text-zinc-500">// Awaiting backend requests…</div>
              ) : (
                apiLog.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-zinc-600">{e.time}</span>
                    <span className={e.method === 'GET' ? 'text-blue-400 font-bold w-9' : 'text-purple-400 font-bold w-9'}>
                      {e.method}
                    </span>
                    <span className="text-zinc-300 flex-1 truncate">{e.endpoint}</span>
                    <span className={e.status === 200 ? 'text-cyber-green' : 'text-alert-red font-bold'}>
                      {e.status}
                    </span>
                    <span className="text-zinc-500 w-16 text-right">{e.durationMs.toFixed(1)} ms</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackendView;
