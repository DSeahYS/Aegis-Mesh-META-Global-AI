import { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, Upload, Database, Zap } from 'lucide-react';
import { getHealth, fetchTLEs, parseCDM, getBenchmarkResults, HealthStatus, TLEData, CDMData, BenchmarkReport } from '../../lib/apiClient';

export function LiveDataPanel() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [tles, setTles] = useState<TLEData[] | null>(null);
  const [cdmText, setCdmText] = useState('');
  const [cdmData, setCdmData] = useState<CDMData | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      const h = await getHealth();
      setHealth(h);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleFetchTLEs = async () => {
    setLoading(true);
    const data = await fetchTLEs({ group: 'stations' });
    setTles(data);
    setLoading(false);
  };

  const handleParseCDM = async () => {
    if (!cdmText) return;
    setLoading(true);
    const data = await parseCDM(cdmText);
    setCdmData(data);
    setLoading(false);
  };

  const handleFetchBenchmark = async () => {
    setLoading(true);
    const data = await getBenchmarkResults();
    setBenchmark(data);
    setLoading(false);
  };

  const isConnected = health?.status === 'ok';

  return (
    <div className="bg-space-800 border border-space-600 rounded-sm p-6 text-zinc-100 font-mono mt-6">
      <div className="flex items-center justify-between mb-6 border-b border-space-600 pb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-400" />
          Live Data Feed
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">System Status:</span>
          {isConnected ? (
            <span className="flex items-center gap-1 text-green-400 text-sm">
              <Wifi className="w-4 h-4" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-sm">
              <WifiOff className="w-4 h-4" /> Disconnected
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 p-4 rounded border border-space-600">
          <h3 className="text-lg mb-3 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            Orbital Elements (TLEs)
          </h3>
          <button 
            onClick={handleFetchTLEs}
            disabled={loading || !isConnected}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 px-4 rounded transition-colors"
          >
            Fetch Live TLEs
          </button>
          {tles && (
            <div className="mt-4 text-xs text-zinc-300 max-h-32 overflow-y-auto">
              {tles.length} elements loaded.
              {tles.slice(0, 2).map((tle, idx) => (
                <div key={idx} className="mt-2">
                  <div className="font-bold">{tle.name}</div>
                  <div>{tle.line1}</div>
                  <div>{tle.line2}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 p-4 rounded border border-space-600">
          <h3 className="text-lg mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            System Performance
          </h3>
          <button 
            onClick={handleFetchBenchmark}
            disabled={loading || !isConnected}
            className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-2 px-4 rounded transition-colors"
          >
            Run Benchmarks
          </button>
          {benchmark && (
            <div className="mt-4 text-sm text-zinc-300">
              <div>Mean Latency: {benchmark.latency_ms?.mean?.toFixed(3) ?? 'N/A'}ms</div>
              <div>Peak Memory: {benchmark.memory_bytes ? Math.round(benchmark.memory_bytes.peak / 1024) : 'N/A'}KB</div>
              <div>Est Power: {benchmark.power_watts?.estimated ?? 'N/A'}W</div>
            </div>
          )}
        </div>

        <div className="bg-zinc-900 p-4 rounded border border-space-600 md:col-span-2">
          <h3 className="text-lg mb-3 flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-500" />
            Parse Conjunction Data Message (CDM)
          </h3>
          <textarea
            value={cdmText}
            onChange={(e) => setCdmText(e.target.value)}
            placeholder="Paste CCSDS CDM here..."
            className="w-full h-32 bg-space-800 border border-space-600 rounded p-2 text-sm text-zinc-300 mb-3 focus:outline-none focus:border-emerald-500"
          />
          <button 
            onClick={handleParseCDM}
            disabled={loading || !isConnected || !cdmText}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 px-6 rounded transition-colors"
          >
            Parse CDM
          </button>
          {cdmData && (
            <div className="mt-4 p-3 bg-space-800 border border-emerald-900 rounded text-sm">
              <div className="text-emerald-500 font-bold mb-1">Parsed Conjunction:</div>
              <div>ID: {cdmData.messageId}</div>
              <div>Primary: {cdmData.primaryObject}</div>
              <div>Secondary: {cdmData.secondaryObject}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
