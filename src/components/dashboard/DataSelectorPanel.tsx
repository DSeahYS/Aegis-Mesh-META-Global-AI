import React, { useMemo } from 'react';
import {
  Database,
  Layers,
  Radio,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Cpu,
  Flame,
  Globe2,
  Trash2,
  Zap,
} from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import { CATALOG_DEFINITIONS } from '../../lib/catalogGenerator';

interface DataSelectorPanelProps {
  className?: string;
}

export const DataSelectorPanel: React.FC<DataSelectorPanelProps> = ({ className = '' }) => {
  const activeCatalogs = useSimulationStore((state) => state.activeCatalogs);
  const toggleCatalog = useSimulationStore((state) => state.toggleCatalog);
  const addTelemetryMessage = useSimulationStore((state) => state.addTelemetryMessage);

  const catalogList = useMemo(() => {
    return Object.values(CATALOG_DEFINITIONS);
  }, []);

  const totalLoadedObjects = useMemo(() => {
    let count = 12; // AEGIS-MESH native nodes
    for (const cat of catalogList) {
      if (activeCatalogs.includes(cat.id)) {
        count += cat.count;
      }
    }
    return count;
  }, [activeCatalogs, catalogList]);

  const activeCatalogCount = useMemo(() => {
    return catalogList.filter((c) => activeCatalogs.includes(c.id)).length;
  }, [activeCatalogs, catalogList]);

  const handleToggle = (id: string, name: string, count: number) => {
    const isCurrentlyActive = activeCatalogs.includes(id);
    toggleCatalog(id);

    addTelemetryMessage({
      type: isCurrentlyActive ? 'warning' : 'info',
      message: isCurrentlyActive
        ? `Unloaded orbital dataset [${name}] (-${count.toLocaleString()} objects). Tracking pipeline freed.`
        : `Mounted orbital catalog [${name}] (+${count.toLocaleString()} objects) into spatial ephemeris filter.`,
      timestamp: Date.now() / 1000,
    });
  };

  const handleSelectAllDebris = () => {
    const debrisIds = ['cosmos-1408', 'fengyun-1c', 'uncatalogued'];
    for (const id of debrisIds) {
      if (!activeCatalogs.includes(id)) {
        toggleCatalog(id);
      }
    }
    addTelemetryMessage({
      type: 'warning',
      message: 'Mounted all debris catalog swarms (14,500 fragments). Conjunction threat matrix active.',
      timestamp: Date.now() / 1000,
    });
  };

  const handleSelectConstellations = () => {
    const constIds = ['starlink', 'oneweb'];
    for (const id of constIds) {
      if (!activeCatalogs.includes(id)) {
        toggleCatalog(id);
      }
    }
    addTelemetryMessage({
      type: 'info',
      message: 'Mounted mega-constellations (Starlink + OneWeb: 5,648 cooperative nodes).',
      timestamp: Date.now() / 1000,
    });
  };

  const handleClearAll = () => {
    for (const cat of catalogList) {
      if (activeCatalogs.includes(cat.id)) {
        toggleCatalog(cat.id);
      }
    }
    addTelemetryMessage({
      type: 'info',
      message: 'Purged all foreign ephemeris datasets. Constellation isolated to 12 AEGIS nodes.',
      timestamp: Date.now() / 1000,
    });
  };

  return (
    <div
      className={`bg-space-800/90 border border-space-600/90 rounded-sm p-5 shadow-xl shadow-black/40  flex flex-col justify-between ${className}`}
    >
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-space-600/70 gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-sm bg-cyber-blue/10 border border-cyber-blue/40 text-cyber-blue">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-wider text-zinc-100 uppercase font-mono">
                  MASSIVE ORBITAL CATALOG INGESTION
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-950/70 border border-cyan-500/40 text-blue-300">
                  REAL-TIME FILTER
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                Dynamic synthetic injection of mega-constellations and hypervelocity ASAT debris clouds
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 text-xs font-mono self-start sm:self-auto">
            <div className="px-2.5 py-1 rounded bg-zinc-900 border border-space-700 flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-cyber-green" />
              <span className="text-zinc-400">ACTIVE:</span>
              <span className="text-cyber-green font-bold">
                {activeCatalogCount}/{catalogList.length}
              </span>
            </div>
            <div className="px-2.5 py-1 rounded bg-zinc-900 border border-space-700 flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 text-cyber-blue" />
              <span className="text-zinc-400">TOTAL OBJECTS:</span>
              <span className="text-white font-bold">
                {totalLoadedObjects.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Filter Actions */}
        <div className="flex flex-wrap items-center gap-2 py-3 border-b border-space-700/50">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mr-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-blue-400" /> Presets:
          </span>
          <button
            onClick={handleSelectConstellations}
            className="px-2.5 py-1 text-[11px] font-mono rounded bg-zinc-950/40 hover:bg-zinc-900/60 border border-cyan-700/50 text-blue-300 transition-all flex items-center gap-1.5"
          >
            <Globe2 className="w-3 h-3" />
            <span>Constellations Only (5.6k)</span>
          </button>
          <button
            onClick={handleSelectAllDebris}
            className="px-2.5 py-1 text-[11px] font-mono rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-700/50 text-rose-300 transition-all flex items-center gap-1.5"
          >
            <Flame className="w-3 h-3 text-rose-400" />
            <span>All Debris Clouds (14.5k)</span>
          </button>
          <button
            onClick={handleClearAll}
            className="px-2.5 py-1 text-[11px] font-mono rounded bg-zinc-900 hover:bg-space-700/70 border border-space-700 text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5 ml-auto"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Catalogs</span>
          </button>
        </div>

        {/* Catalog Items Grid */}
        <div className="mt-3.5 space-y-2.5">
          {catalogList.map((catalog) => {
            const isActive = activeCatalogs.includes(catalog.id);

            return (
              <div
                key={catalog.id}
                onClick={() => handleToggle(catalog.id, catalog.name, catalog.count)}
                className={`relative group cursor-pointer p-3.5 rounded-sm border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-zinc-900/90 border-space-500 shadow-md'
                    : 'bg-zinc-900/40 border-space-700/60 hover:bg-zinc-900/70 hover:border-space-600'
                }`}
              >
                {/* Left: Checkbox & Name */}
                <div className="flex items-start sm:items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Toggle ${catalog.name}`}
                    className={`mt-0.5 sm:mt-0 p-1 rounded transition-colors ${
                      isActive
                        ? 'text-cyber-green bg-cyber-green/10'
                        : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  >
                    {isActive ? (
                      <CheckCircle2 className="w-5 h-5 text-cyber-green drop-shadow-md" />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-600" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-zinc-100 group-hover:text-white transition-colors">
                        {catalog.name}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${catalog.accentBg}`}
                      >
                        {catalog.badge}
                      </span>
                      {catalog.dangerLevel === 'CRITICAL' && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1 ">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          LETHAL
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                      {catalog.description}
                    </p>
                  </div>
                </div>

                {/* Right: Technical Stats */}
                <div className="flex items-center gap-4 sm:gap-6 text-xs font-mono shrink-0 pl-8 sm:pl-0">
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 block">ALTITUDE / INC</span>
                    <span className="text-zinc-300 font-semibold text-[11px]">
                      {catalog.nominalAltitudeKm} • {catalog.inclination}
                    </span>
                  </div>

                  <div className="text-right min-w-[70px]">
                    <span className="text-[10px] text-zinc-400 block">OBJECTS</span>
                    <span
                      className={`text-sm font-bold font-mono ${
                        isActive ? 'text-white' : 'text-zinc-500'
                      }`}
                    >
                      {catalog.count.toLocaleString()}
                    </span>
                  </div>

                  {/* Toggle switch visual */}
                  <div
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      isActive ? 'bg-cyber-blue/80' : 'bg-space-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="mt-4 pt-3 border-t border-space-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-cyber-blue" />
          <span>POLARFIRE FPGA SPATIAL OCTREE CACHE:</span>
          <span className="text-cyber-green font-semibold">SYNCHRONIZED (0.4ms)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-400">
            Total Ephemeris RAM: <span className="text-zinc-200 font-bold">~14.2 MB</span>
          </span>
          <span className="text-zinc-400">•</span>
          <span className="text-cyber-blue">InfoNCE Manifold Indexed</span>
        </div>
      </div>
    </div>
  );
};

export default DataSelectorPanel;
