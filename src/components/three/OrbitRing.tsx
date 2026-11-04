import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { SCALE_FACTOR, type OrbitalElements } from '../../lib/constants';
import { keplerianToCartesian } from '../../lib/orbitalMechanics';

export interface OrbitRingProps {
  orbitalElements: OrbitalElements;
  color?: string;
  opacity?: number;
  lineWidth?: number;
  dashed?: boolean;
}

export const OrbitRing: React.FC<OrbitRingProps> = ({
  orbitalElements,
  color = '#38bdf8',
  opacity = 0.35,
  lineWidth = 1.2,
  dashed = false,
}) => {
  const points = useMemo(() => {
    // Detect degree format vs radian format
    const hasDegreeClues =
      orbitalElements.argumentOfPerigee !== undefined ||
      Math.abs(orbitalElements.inclination) > 2 * Math.PI ||
      Math.abs(orbitalElements.raan) > 2 * Math.PI;

    const degToRad = (v: number) => (hasDegreeClues ? (v * Math.PI) / 180 : v);

    const omega =
      orbitalElements.argPerigee ??
      orbitalElements.argumentOfPerigee ??
      0;

    const normalizedElements: OrbitalElements = {
      semiMajorAxis: orbitalElements.semiMajorAxis,
      eccentricity: orbitalElements.eccentricity,
      inclination: degToRad(orbitalElements.inclination),
      raan: degToRad(orbitalElements.raan),
      argPerigee: degToRad(omega),
      trueAnomaly: 0,
    };

    const numPoints = 200;
    const pts: [number, number, number][] = [];
    const step = (2 * Math.PI) / numPoints;

    for (let k = 0; k <= numPoints; k++) {
      const nu = k * step;
      const { position } = keplerianToCartesian({
        ...normalizedElements,
        trueAnomaly: nu,
      });

      pts.push([
        position[0] * SCALE_FACTOR,
        position[1] * SCALE_FACTOR,
        position[2] * SCALE_FACTOR,
      ]);
    }

    return pts;
  }, [orbitalElements]);

  return (
    <Line
      points={points}
      color={color}
      transparent
      opacity={opacity}
      lineWidth={lineWidth}
      dashed={dashed}
      dashScale={30}
      dashSize={0.5}
      gapSize={0.25}
    />
  );
};

export default OrbitRing;
