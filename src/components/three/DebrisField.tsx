import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EARTH_RADIUS_KM, SCALE_FACTOR } from '../../lib/constants';

export interface DebrisParticleInfo {
  catalogId: string;
  catalogName: string;
  objectId: string;
  altitudeKm: number;
  inclinationDeg: number;
  velocityKmS: number;
  color: string;
  dangerLevel: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE';
}

export interface DebrisFieldProps {
  activeCatalogs?: string[];
  pointSize?: number;
  opacity?: number;
  isPropagating?: boolean;
  propagationSpeed?: number;
  visible?: boolean;
  count?: number;
  altitudeRange?: [number, number];
  onParticleHover?: (particle: DebrisParticleInfo | null) => void;
  onParticleClick?: (particle: DebrisParticleInfo) => void;
}

const EARTH_MU_STANDARD = 398600.4418;

export function computeOrbitalVelocity(altKm: number): number {
  const a = EARTH_RADIUS_KM + altKm;
  return Math.round(Math.sqrt(EARTH_MU_STANDARD / a) * 100) / 100;
}

export function getDebrisObjectId(catalogId: string, index: number, realNoradId?: string): string {
  if (realNoradId && realNoradId.trim() !== '') {
    return `NORAD-${realNoradId}`;
  }
  switch (catalogId) {
    case 'cosmos-1408': return `COS-1408-${index}`;
    case 'fengyun-1c': return `FY1C-${index}`;
    case 'iridium-33': return `IRD33-${index}`;
    case 'uncatalogued': return `UNK-${index}`;
    case 'sl-16': return `SL16-${index}`;
    case 'leo-general': return `LEO-${index}`;
    default: return `DEB-${index}`;
  }
}

function createGlowPointTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

interface RawCatalogData {
  id: string;
  name: string;
  count: number;
  color: string;
  dangerLevel: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE';
  positions: Float32Array;
  colors: Float32Array;
  altitudes: Float32Array;
  inclinations: Float32Array;
  velocities: Float32Array;
  noradIds: string[];
}

const MAX_DEBRIS_CAPACITY = 15000; // Increased to accommodate real data

const DebrisFieldComponent: React.FC<DebrisFieldProps> = ({
  activeCatalogs,
  pointSize = 0.038,
  opacity = 0.85,
  isPropagating = true,
  propagationSpeed = 1.0,
  visible = true,
  onParticleHover,
  onParticleClick,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const glowTexture = useMemo(() => createGlowPointTexture(), []);

  const [catalogsData, setCatalogsData] = useState<Record<string, RawCatalogData>>({});

  // Fetch real data on mount
  useEffect(() => {
    fetch('/debris_catalog.json')
      .then((res) => res.json())
      .then((data) => {
        const parsed: Record<string, RawCatalogData> = {};
        for (const cat of data.catalogs) {
          const count = cat.count;
          const pos = new Float32Array(count * 3);
          const col = new Float32Array(count * 3);
          const alts = new Float32Array(count);
          const incs = new Float32Array(count);
          const vels = new Float32Array(count);
          const norads: string[] = [];

          const baseColor = new THREE.Color(cat.color || '#ffffff');

          for (let i = 0; i < count; i++) {
            const obj = cat.objects[i];
            
            // Apply scale factor to km
            pos[i * 3] = obj.x_km * SCALE_FACTOR;
            pos[i * 3 + 1] = obj.z_km * SCALE_FACTOR; // Swap Y/Z for Three.js (Z is up in SGP4 typically, or Y is up in Three)
            // Wait, SGP4 outputs X,Y,Z in TEME frame. In Three.js, Y is UP. SGP4 Z is UP.
            // So: Three.X = SGP4.X, Three.Y = SGP4.Z, Three.Z = -SGP4.Y
            pos[i * 3 + 1] = obj.z_km * SCALE_FACTOR;
            pos[i * 3 + 2] = -obj.y_km * SCALE_FACTOR;

            alts[i] = obj.alt_km;
            incs[i] = obj.inc_deg;
            vels[i] = obj.vel_km_s || computeOrbitalVelocity(obj.alt_km);
            norads.push(obj.norad_id || '');

            col[i * 3] = baseColor.r;
            col[i * 3 + 1] = baseColor.g;
            col[i * 3 + 2] = baseColor.b;
          }

          parsed[cat.id] = {
            id: cat.id,
            name: cat.name,
            count,
            color: cat.color,
            dangerLevel: cat.dangerLevel,
            positions: pos,
            colors: col,
            altitudes: alts,
            inclinations: incs,
            velocities: vels,
            noradIds: norads,
          };
        }
        setCatalogsData(parsed);
      })
      .catch((err) => console.error("Failed to load real debris data:", err));
  }, []);

  const selectedCatalogs = useMemo(() => {
    if (Object.keys(catalogsData).length === 0) return [];
    if ((!activeCatalogs || !Array.isArray(activeCatalogs) || activeCatalogs.length === 0)) {
      return ['cosmos-1408', 'fengyun-1c', 'leo-general', 'iridium-33'];
    }
    const lowered = activeCatalogs.filter(Boolean).map((c) => String(c).toLowerCase().trim()).filter(c => c !== '');
    if (lowered.includes('all') || lowered.includes('all-debris')) {
      return Object.keys(catalogsData);
    }
    const matched: string[] = [];
    for (const key of Object.keys(catalogsData)) {
      if (lowered.some((item) => item === key || item.includes(key) || key.includes(item))) {
        matched.push(key);
      }
    }
    if (matched.length === 0) {
      return ['cosmos-1408', 'fengyun-1c', 'leo-general', 'iridium-33'];
    }
    return matched;
  }, [activeCatalogs, catalogsData]);

  const catalogRanges = useRef<{ id: string; name: string; start: number; end: number; color: string; dangerLevel: any; norads: string[] }[]>([]);
  const altitudesRef = useRef<Float32Array>(new Float32Array(MAX_DEBRIS_CAPACITY));
  const inclinationsRef = useRef<Float32Array>(new Float32Array(MAX_DEBRIS_CAPACITY));
  const velocitiesRef = useRef<Float32Array>(new Float32Array(MAX_DEBRIS_CAPACITY));

  const { geometry, positionAttr, colorAttr } = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_DEBRIS_CAPACITY * 3);
    const col = new Float32Array(MAX_DEBRIS_CAPACITY * 3);

    const pAttr = new THREE.BufferAttribute(pos, 3);
    const cAttr = new THREE.BufferAttribute(col, 3);
    pAttr.setUsage(THREE.DynamicDrawUsage);
    cAttr.setUsage(THREE.DynamicDrawUsage);

    geom.setAttribute('position', pAttr);
    geom.setAttribute('color', cAttr);
    return { geometry: geom, positionAttr: pAttr, colorAttr: cAttr };
  }, []);


  useEffect(() => {
    return () => {
      geometry.dispose();
      glowTexture?.dispose();
    };
  }, [geometry, glowTexture]);
  
  useEffect(() => {

    let offset = 0;
    const ranges: { id: string; name: string; start: number; end: number; color: string; dangerLevel: any; norads: string[] }[] = [];

    const posArray = positionAttr.array as Float32Array;
    const colArray = colorAttr.array as Float32Array;

    for (const catId of selectedCatalogs) {
      const data = catalogsData[catId];
      if (!data) continue;

      const count = data.count;
      if (offset + count > MAX_DEBRIS_CAPACITY) break;

      posArray.set(data.positions, offset * 3);
      colArray.set(data.colors, offset * 3);
      altitudesRef.current.set(data.altitudes, offset);
      inclinationsRef.current.set(data.inclinations, offset);
      if (data.velocities) velocitiesRef.current.set(data.velocities, offset);

      ranges.push({
        id: data.id,
        name: data.name,
        start: offset,
        end: offset + count,
        color: data.color,
        dangerLevel: data.dangerLevel,
        norads: data.noradIds,
      });

      offset += count;
    }

    catalogRanges.current = ranges;
    geometry.setDrawRange(0, offset);
    
    // Safely assign update ranges for both older and newer Three.js versions
    const pAny = positionAttr as any;
    const cAny = colorAttr as any;
    if (typeof pAny.addUpdateRange === 'function') {
      pAny.clearUpdateRanges?.();
      cAny.clearUpdateRanges?.();
      pAny.addUpdateRange(0, offset * 3);
      cAny.addUpdateRange(0, offset * 3);
    } else {
      pAny.updateRange = { offset: 0, count: offset * 3 };
      cAny.updateRange = { offset: 0, count: offset * 3 };
    }
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    
    const maxDebrisRadius = (EARTH_RADIUS_KM + 2500) * SCALE_FACTOR;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), maxDebrisRadius);
  }, [selectedCatalogs, catalogsData, geometry, positionAttr, colorAttr]);


  const lastRaycastTime = useRef(0);
  useEffect(() => {
    const points = pointsRef.current;
    if (!points) return;
    const originalRaycast = points.raycast.bind(points);
    points.raycast = (raycaster: any, intersects: any) => {
      const now = performance.now();
      if (now - lastRaycastTime.current < 50) return;
      lastRaycastTime.current = now;
      originalRaycast(raycaster, intersects);
    };
  }, []);
  
  useFrame((_, delta) => {
    if (!isPropagating || !pointsRef.current) return;
    // We don't drift real data manually if we're rendering exact epoch, but for visualization drift is okay
    pointsRef.current.rotation.y += delta * 0.008 * propagationSpeed;
    
  });

  const handlePointerMove = useCallback(
    (e: any) => {
      e.stopPropagation();
      const index = e.index;
      if (index === undefined || index < 0) return;

      const ranges = catalogRanges.current;
      for (const range of ranges) {
        if (index >= range.start && index < range.end) {
          const localIndex = index - range.start;
          const altKm = Math.round((altitudesRef.current[index] ?? 550) * 10) / 10;
          const incDeg = Math.round((inclinationsRef.current[index] ?? 53.0) * 10) / 10;
          const realNoradId = range.norads[localIndex];
          const objectId = getDebrisObjectId(range.id, localIndex, realNoradId);
          const velocityKmS = Math.round((velocitiesRef.current[index] || computeOrbitalVelocity(altKm)) * 1000) / 1000;

          onParticleHover?.({
            catalogId: range.id,
            catalogName: range.name,
            objectId,
            altitudeKm: altKm,
            inclinationDeg: incDeg,
            velocityKmS,
            color: range.color,
            dangerLevel: range.dangerLevel,
          });
          return;
        }
      }
    },
    [onParticleHover]
  );

  const handlePointerOut = useCallback(
    (e: any) => {
      e.stopPropagation();
      onParticleHover?.(null);
    },
    [onParticleHover]
  );

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      const index = e.index;
      if (index === undefined || index < 0) return;

      const ranges = catalogRanges.current;
      for (const range of ranges) {
        if (index >= range.start && index < range.end) {
          const localIndex = index - range.start;
          const altKm = Math.round((altitudesRef.current[index] ?? 550) * 10) / 10;
          const incDeg = Math.round((inclinationsRef.current[index] ?? 53.0) * 10) / 10;
          const realNoradId = range.norads[localIndex];
          const objectId = getDebrisObjectId(range.id, localIndex, realNoradId);
          const velocityKmS = Math.round((velocitiesRef.current[index] || computeOrbitalVelocity(altKm)) * 1000) / 1000;

          onParticleClick?.({
            catalogId: range.id,
            catalogName: range.name,
            objectId,
            altitudeKm: altKm,
            inclinationDeg: incDeg,
            velocityKmS,
            color: range.color,
            dangerLevel: range.dangerLevel,
          });
          return;
        }
      }
    },
    [onParticleClick]
  );

  if (!visible) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      frustumCulled={true}
    >
      <pointsMaterial
        size={pointSize}
        map={glowTexture ?? undefined}
        vertexColors
        transparent
        opacity={opacity}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

export const DebrisField = React.memo(DebrisFieldComponent);
export default DebrisField;
