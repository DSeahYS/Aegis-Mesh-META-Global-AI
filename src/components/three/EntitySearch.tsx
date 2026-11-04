import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, X, Radio, Layers, Flame, Terminal, CornerDownLeft } from 'lucide-react';

export interface EntitySearchProps {
  onSelectSatellite: (id: string) => void;
  onActivateCatalog: (catalogId: string) => void;
  className?: string;
}

export const AEGIS_SATELLITES = [
  { id: 'AEGIS-01', name: 'Alpha Node', status: 'nominal' },
  { id: 'AEGIS-02', name: 'Bravo Node', status: 'nominal' },
  { id: 'AEGIS-03', name: 'Charlie Node', status: 'nominal' },
  { id: 'AEGIS-04', name: 'Delta Node', status: 'alert' },
  { id: 'AEGIS-05', name: 'Echo Node', status: 'nominal' },
  { id: 'AEGIS-06', name: 'Foxtrot Node', status: 'nominal' },
  { id: 'AEGIS-07', name: 'Golf Node', status: 'maneuvering' },
  { id: 'AEGIS-08', name: 'Hotel Node', status: 'nominal' },
  { id: 'AEGIS-09', name: 'India Node', status: 'nominal' },
  { id: 'AEGIS-10', name: 'Juliet Node', status: 'nominal' },
  { id: 'AEGIS-11', name: 'Kilo Node', status: 'nominal' },
  { id: 'AEGIS-12', name: 'Lima Node', status: 'nominal' },
];

export const DEBRIS_CATALOGS = [
  { id: 'cosmos-1408', name: 'Cosmos-1408 ASAT Debris', count: 3, dangerLevel: 'HIGH', alt: '485 km / 82.6°' },
  { id: 'fengyun-1c', name: 'Fengyun-1C Breakup Ring', count: 1984, dangerLevel: 'CRITICAL', alt: '865 km / 98.6°' },
  { id: 'iridium-33', name: 'Iridium-33 Collision Remnants', count: 110, dangerLevel: 'HIGH', alt: '790 km / 86.4°' },
  { id: 'cosmos-2251', name: 'Cosmos-2251 Remnants', count: 586, dangerLevel: 'HIGH', alt: '790 km / 74.0°' },
  { id: 'sl-16', name: 'SL-16 Derelict Stages', count: 294, dangerLevel: 'ELEVATED', alt: '600-950 km / 71°' },
  { id: 'leo-general', name: 'USSPACECOM Cataloged Debris', count: 1998, dangerLevel: 'MODERATE', alt: '350-1400 km' },
];

export const MEGA_CONSTELLATIONS = [
  { id: 'starlink-1', name: 'Starlink Shell 1', count: 4420, alt: '550 km / 53.0°' },
  { id: 'starlink-2', name: 'Starlink Shell 2', count: 1870, alt: '540 km / 53.2°' },
  { id: 'oneweb', name: 'OneWeb Polar Shell', count: 1190, alt: '1,200 km / 87.9°' },
  { id: 'kuiper', name: 'Project Kuiper Shell', count: 1020, alt: '630 km / 51.9°' },
];

type FlattenedItem =
  | { type: 'aegis'; id: string; targetId: string }
  | { type: 'debris'; id: string; targetId: string }
  | { type: 'mega'; id: string; targetId: string };

export const EntitySearch: React.FC<EntitySearchProps> = ({
  onSelectSatellite,
  onActivateCatalog,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Query normalization
  const q = query.trim().toLowerCase();

  // Filtered entity collections
  const filteredAegis = useMemo(() => {
    if (!q) return AEGIS_SATELLITES;
    return AEGIS_SATELLITES.filter(
      (sat) =>
        sat.id.toLowerCase().includes(q) ||
        sat.name.toLowerCase().includes(q) ||
        sat.status.toLowerCase().includes(q) ||
        (q.length >= 3 && 'aegis'.includes(q)) ||
        q === 'aegis'
    );
  }, [q]);

  const filteredDebris = useMemo(() => {
    if (!q) return DEBRIS_CATALOGS;
    return DEBRIS_CATALOGS.filter(
      (cat) =>
        cat.id.toLowerCase().includes(q) ||
        cat.name.toLowerCase().includes(q) ||
        cat.dangerLevel.toLowerCase().includes(q) ||
        cat.alt.toLowerCase().includes(q) ||
        (q.length >= 3 && 'debris'.includes(q)) ||
        q === 'debris'
    );
  }, [q]);

  const filteredMega = useMemo(() => {
    if (!q) return MEGA_CONSTELLATIONS;
    return MEGA_CONSTELLATIONS.filter(
      (con) =>
        con.id.toLowerCase().includes(q) ||
        con.name.toLowerCase().includes(q) ||
        con.alt.toLowerCase().includes(q) ||
        'constellation'.includes(q) ||
        'swarm'.includes(q) ||
        'starlink'.includes(q) ||
        'oneweb'.includes(q) ||
        'kuiper'.includes(q)
    );
  }, [q]);

  const totalResults = filteredAegis.length + filteredDebris.length + filteredMega.length;

  // Flattened items list for unified command palette keyboard navigation
  const flattenedItems = useMemo<FlattenedItem[]>(() => {
    const list: FlattenedItem[] = [];
    filteredAegis.forEach((sat) => list.push({ type: 'aegis', id: sat.id, targetId: sat.id }));
    filteredDebris.forEach((cat) => list.push({ type: 'debris', id: cat.id, targetId: cat.id }));
    filteredMega.forEach((con) => list.push({ type: 'mega', id: con.id, targetId: con.id }));
    return list;
  }, [filteredAegis, filteredDebris, filteredMega]);

  // Reset keyboard highlight on search query change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [q]);

  const handleSelectAegis = useCallback(
    (id: string) => {
      onSelectSatellite(id);
      setIsOpen(false);
    },
    [onSelectSatellite]
  );

  const handleSelectDebris = useCallback(
    (id: string) => {
      onActivateCatalog(id);
      setIsOpen(false);
    },
    [onActivateCatalog]
  );

  const handleSelectMega = useCallback(
    (id: string) => {
      onActivateCatalog(id);
      setIsOpen(false);
    },
    [onActivateCatalog]
  );

  const selectItemByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= flattenedItems.length) return;
      const target = flattenedItems[index];
      if (target.type === 'aegis') {
        handleSelectAegis(target.targetId);
      } else if (target.type === 'debris') {
        handleSelectDebris(target.targetId);
      } else if (target.type === 'mega') {
        handleSelectMega(target.targetId);
      }
    },
    [flattenedItems, handleSelectAegis, handleSelectDebris, handleSelectMega]
  );

  // Global Keyboard shortcuts: '/' focuses search, 'Escape' closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation handler inside input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < flattenedItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : flattenedItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flattenedItems.length) {
        selectItemByIndex(highlightedIndex);
      } else if (flattenedItems.length > 0) {
        selectItemByIndex(0);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 w-80 sm:w-96 select-none pointer-events-auto ${className}`}
    >
      {/* Search Input Bar (Palantir Foundry / Bloomberg Terminal Style) */}
      <div
        className={`relative flex items-center gap-2 px-3 py-2 bg-zinc-950 border transition-colors shadow-lg shadow-black/80 rounded-sm ${
          isOpen
            ? 'border-zinc-600 ring-1 ring-zinc-700/60'
            : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder="SEARCH ENTITIES (ID, CATALOG, ORBIT)..."
          className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 font-sans tracking-tight focus:outline-none"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none tracking-wider select-none"
            title="Press / to focus"
          >
            /
          </kbd>
        )}
      </div>

      {/* Dropdown Results Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 w-full rounded-sm bg-zinc-950 border border-zinc-800 shadow-xl shadow-black/90 overflow-hidden flex flex-col z-30">
          {/* Top Telemetry Header Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-[10px]">
            <div className="flex items-center gap-1.5 font-sans text-zinc-400">
              <Terminal className="w-3 h-3 text-zinc-500 shrink-0" />
              <span>MATCHES:</span>
              <span className="font-mono font-bold text-zinc-200">{totalResults}</span>
              {q && (
                <span className="font-mono text-zinc-400 text-[9px]">[{q}]</span>
              )}
            </div>
            <span className="font-mono text-zinc-500 text-[9px] tracking-wider uppercase">ESC [DISMISS]</span>
          </div>

          {/* Categorized Results Scroll Area */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-900/60">
            {totalResults === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-zinc-500 space-y-1">
                <div>NO ENTITIES FOUND</div>
                <div className="text-[10px] text-zinc-600 font-sans">
                  Verify identifier or orbital catalog name
                </div>
              </div>
            ) : (
              <>
                {/* Section 1: AEGIS Nodes */}
                {filteredAegis.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/60 border-y border-zinc-800/80">
                      <div className="flex items-center gap-1.5">
                        <Radio className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="font-sans font-semibold text-[10px] text-zinc-400 uppercase tracking-wider">
                          AEGIS Constellation Nodes
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-500">
                        {filteredAegis.length}
                      </span>
                    </div>

                    <div>
                      {filteredAegis.map((sat) => {
                        const isNominal = sat.status === 'nominal';
                        const isAlert = sat.status === 'alert';

                        const currentIndex = flattenedItems.findIndex(
                          (item) => item.type === 'aegis' && item.id === sat.id
                        );
                        const isHighlighted = currentIndex === highlightedIndex;

                        const dotColor = isNominal
                          ? 'bg-emerald-500'
                          : isAlert
                          ? 'bg-rose-500'
                          : 'bg-amber-500';

                        const badgeClass = isNominal
                          ? 'text-emerald-500 bg-emerald-950/40 border-emerald-800/50'
                          : isAlert
                          ? 'text-rose-400 bg-rose-950/40 border-rose-800/50'
                          : 'text-amber-400 bg-amber-950/40 border-amber-800/50';

                        return (
                          <div
                            key={sat.id}
                            onClick={() => handleSelectAegis(sat.id)}
                            onMouseEnter={() => setHighlightedIndex(currentIndex)}
                            className={`group flex items-center justify-between px-3 py-2 border-b border-zinc-900/80 hover:bg-zinc-900 cursor-pointer transition-colors ${
                              isHighlighted ? 'bg-zinc-900 ring-1 ring-inset ring-zinc-700' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                              <span className="font-mono font-bold text-xs text-zinc-100 group-hover:text-blue-400 transition-colors">
                                {sat.id}
                              </span>
                              <span className="font-sans text-[11px] text-zinc-400 truncate">
                                {sat.name}
                              </span>
                            </div>

                            <span
                              className={`font-mono text-[9px] px-1.5 py-0.5 border uppercase tracking-wider font-semibold shrink-0 ${badgeClass}`}
                            >
                              {sat.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 2: Debris Catalogs */}
                {filteredDebris.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/60 border-y border-zinc-800/80">
                      <div className="flex items-center gap-1.5">
                        <Flame className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="font-sans font-semibold text-[10px] text-zinc-400 uppercase tracking-wider">
                          Debris Track Catalogs
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-500">
                        {filteredDebris.length}
                      </span>
                    </div>

                    <div>
                      {filteredDebris.map((cat) => {
                        const isCritical = cat.dangerLevel === 'CRITICAL';
                        const isHigh = cat.dangerLevel === 'HIGH';
                        const isElevated = cat.dangerLevel === 'ELEVATED';

                        const currentIndex = flattenedItems.findIndex(
                          (item) => item.type === 'debris' && item.id === cat.id
                        );
                        const isHighlighted = currentIndex === highlightedIndex;

                        const dotColor = isCritical
                          ? 'bg-rose-500'
                          : isHigh
                          ? 'bg-amber-500'
                          : isElevated
                          ? 'bg-orange-500'
                          : 'bg-zinc-400';

                        const dangerBadgeClass = isCritical
                          ? 'text-rose-400 bg-rose-950/40 border-rose-800/50'
                          : isHigh
                          ? 'text-amber-400 bg-amber-950/40 border-amber-800/50'
                          : isElevated
                          ? 'text-orange-400 bg-orange-950/40 border-orange-800/50'
                          : 'text-zinc-400 bg-zinc-900 border-zinc-800';

                        return (
                          <div
                            key={cat.id}
                            onClick={() => handleSelectDebris(cat.id)}
                            onMouseEnter={() => setHighlightedIndex(currentIndex)}
                            className={`group flex items-center justify-between px-3 py-2 border-b border-zinc-900/80 hover:bg-zinc-900 cursor-pointer transition-colors ${
                              isHighlighted ? 'bg-zinc-900 ring-1 ring-inset ring-zinc-700' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-zinc-100 group-hover:text-blue-400 transition-colors">
                                    {cat.id}
                                  </span>
                                  <span className="font-sans text-[11px] text-zinc-400 truncate">
                                    {cat.name}
                                  </span>
                                </div>
                                <div className="font-mono text-[10px] text-zinc-500 tracking-tight mt-0.5">
                                  {cat.alt}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`font-mono text-[9px] px-1.5 py-0.5 border uppercase tracking-wider font-semibold ${dangerBadgeClass}`}
                              >
                                {cat.dangerLevel}
                              </span>
                              <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold tabular-nums">
                                {cat.count.toLocaleString()} PCS
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 3: Mega-Constellations */}
                {filteredMega.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/60 border-y border-zinc-800/80">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="font-sans font-semibold text-[10px] text-zinc-400 uppercase tracking-wider">
                          Mega-Constellation Shells
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-500">
                        {filteredMega.length}
                      </span>
                    </div>

                    <div>
                      {filteredMega.map((con) => {
                        const currentIndex = flattenedItems.findIndex(
                          (item) => item.type === 'mega' && item.id === con.id
                        );
                        const isHighlighted = currentIndex === highlightedIndex;

                        return (
                          <div
                            key={con.id}
                            onClick={() => handleSelectMega(con.id)}
                            onMouseEnter={() => setHighlightedIndex(currentIndex)}
                            className={`group flex items-center justify-between px-3 py-2 border-b border-zinc-900/80 hover:bg-zinc-900 cursor-pointer transition-colors ${
                              isHighlighted ? 'bg-zinc-900 ring-1 ring-inset ring-zinc-700' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-zinc-100 group-hover:text-blue-400 transition-colors">
                                    {con.id}
                                  </span>
                                  <span className="font-sans text-[11px] text-zinc-400 truncate">
                                    {con.name}
                                  </span>
                                </div>
                                <div className="font-mono text-[10px] text-zinc-500 tracking-tight mt-0.5">
                                  {con.alt}
                                </div>
                              </div>
                            </div>

                            <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold tabular-nums shrink-0">
                              {con.count.toLocaleString()} PCS
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom Telemetry Footer */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-t border-zinc-800 text-[9px] text-zinc-500">
            <div className="flex items-center gap-1 font-sans">
              <CornerDownLeft className="w-3 h-3 text-zinc-400 shrink-0" />
              <span>Select entity to focus tracking camera</span>
            </div>
            <span className="font-mono text-zinc-500 tracking-wider">AEGIS-OS v4.2</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EntitySearch;
