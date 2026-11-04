import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { COLORS } from '../../lib/constants';

export interface ISLLinkProps {
  start: [number, number, number];
  end: [number, number, number];
  active: boolean;
  qkdSecured?: boolean;
}

export const ISLLink: React.FC<ISLLinkProps> = ({
  start,
  end,
  active,
  qkdSecured = false,
}) => {
  const packetRef = useRef<THREE.Mesh>(null);
  const returnPacketRef = useRef<THREE.Mesh>(null);

  // Link styling
  const lineColor = !active
    ? '#4b5563'
    : qkdSecured
    ? '#c084fc'
    : (COLORS.ISL_LINK || '#00d4ff');

  const lineOpacity = !active ? 0.18 : qkdSecured ? 0.75 : 0.6;

  useFrame(({ clock }) => {
    if (!active) return;

    const t = clock.getElapsedTime() * 0.8;
    const progressA = (t * 0.7) % 1;
    const progressB = (1 - (t * 0.7) % 1);

    if (packetRef.current) {
      packetRef.current.position.set(
        start[0] + (end[0] - start[0]) * progressA,
        start[1] + (end[1] - start[1]) * progressA,
        start[2] + (end[2] - start[2]) * progressA
      );
    }

    if (returnPacketRef.current) {
      returnPacketRef.current.position.set(
        start[0] + (end[0] - start[0]) * progressB,
        start[1] + (end[1] - start[1]) * progressB,
        start[2] + (end[2] - start[2]) * progressB
      );
    }
  });

  return (
    <group>
      {/* Inter-satellite laser beam */}
      <Line
        points={[start, end]}
        color={lineColor}
        transparent
        opacity={lineOpacity}
        lineWidth={active ? 1.5 : 0.8}
        dashed={active}
        dashScale={20}
        dashSize={0.4}
        gapSize={0.2}
      />

      {/* Traveling telemetry data packets when link is active */}
      {active && (
        <>
          {/* Outbound laser packet */}
          <mesh ref={packetRef}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshBasicMaterial
              color={qkdSecured ? '#f3e8ff' : '#e0f2fe'}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Inbound laser packet */}
          <mesh ref={returnPacketRef}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial
              color={qkdSecured ? '#c084fc' : '#38bdf8'}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}
    </group>
  );
};

export default ISLLink;
