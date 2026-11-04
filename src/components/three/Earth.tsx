import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { EARTH_RADIUS_KM, SCALE_FACTOR } from '../../lib/constants';

const EARTH_SPECULAR_COLOR = new THREE.Color('#4a8fc4');

const EARTH_RADIUS = EARTH_RADIUS_KM * SCALE_FACTOR; // ~6.371 units
const AXIAL_TILT = (-23.5 * Math.PI) / 180; // Real Earth axial tilt

// Fresnel atmosphere shader — realistic blue limb glow
const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 glowColor;
  uniform float intensity;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    // Fresnel: edge glow strongest at limb (normal perpendicular to camera)
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.5);
    float alpha = fresnel * intensity;
    gl_FragColor = vec4(glowColor, alpha);
  }
`;

const EarthInner: React.FC = () => {
  const earthGroupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);

  // Load NASA Blue Marble textures from CDN
  const [dayMap, nightMap, bumpMap, specularMap, cloudsMap] = useTexture([
    'https://unpkg.com/three-globe/example/img/earth-day.jpg',
    'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    'https://unpkg.com/three-globe/example/img/earth-water.png',
    'https://unpkg.com/three-globe/example/clouds/clouds.png',
  ]);

  // Custom Fresnel atmosphere shader material
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        glowColor: { value: new THREE.Color('#4db8ff') },
        intensity: { value: 1.4 },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  // Outer halo material (wider, fainter)
  const haloMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        glowColor: { value: new THREE.Color('#1a6fff') },
        intensity: { value: 0.7 },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  useEffect(() => {
    return () => {
      atmosphereMaterial.dispose();
      haloMaterial.dispose();
    };
  }, [atmosphereMaterial, haloMaterial]);


  useFrame((_, delta) => {
    if (earthGroupRef.current) {
      // Real sidereal day ≈ 23h 56m; at 60x speed: 0.001 rad/frame @60fps ≈ realistic
      earthGroupRef.current.rotation.y += delta * 0.06;
    }
    if (cloudsRef.current) {
      // Clouds drift slightly faster than the surface
      cloudsRef.current.rotation.y += delta * 0.0078;
    }
  });

  return (
    <group rotation={[0, 0, AXIAL_TILT]}>
      {/* ── Rotating Earth Surface ── */}
      <group ref={earthGroupRef}>

        {/* Main Earth Surface — PBR with day texture, bump, specular */}
        <mesh receiveShadow castShadow>
          <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
          <meshPhongMaterial
            map={dayMap}
            bumpMap={bumpMap}
            bumpScale={0.018}
            specularMap={specularMap}
            specular={EARTH_SPECULAR_COLOR}
            shininess={28}
          />
        </mesh>

        {/* Night Lights — city glow on dark side (Additive over main surface) */}
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS * 1.0005, 64, 64]} />
          <meshBasicMaterial
            map={nightMap}
            blending={THREE.AdditiveBlending}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>

        {/* Cloud layer — rotates slightly faster than surface */}
        <mesh ref={cloudsRef}>
          <sphereGeometry args={[EARTH_RADIUS * 1.008, 56, 56]} />
          <meshStandardMaterial
            map={cloudsMap}
            alphaMap={cloudsMap}
            transparent
            opacity={0.42}
            depthWrite={false}
            roughness={1.0}
            metalness={0}
          />
        </mesh>

        {/* Polar Ice Caps — subtle white rings at poles */}
        <mesh position={[0, EARTH_RADIUS * 0.97, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.0, EARTH_RADIUS * 0.26, 48]} />
          <meshBasicMaterial
            color="#d4eeff"
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, -EARTH_RADIUS * 0.97, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.0, EARTH_RADIUS * 0.22, 48]} />
          <meshBasicMaterial
            color="#d4eeff"
            transparent
            opacity={0.22}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* ── Fresnel Atmosphere Shell — Realistic Limb Glow ── */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.022, 48, 48]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>

      {/* ── Outer Halo — wider, very faint ── */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.06, 32, 32]} />
        <primitive object={haloMaterial} attach="material" />
      </mesh>

      {/* ── Equatorial Glow Ring (orbital plane indicator) ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[EARTH_RADIUS * 1.02, EARTH_RADIUS * 1.22, 64]} />
        <meshBasicMaterial
          color="#1e5aff"
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

// Catches texture load failures (e.g. CDN 404 / offline) so they don't unmount the whole Canvas
class TextureErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[Earth] Texture load failed, using fallback globe:', error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// Wrap in Suspense fallback so textures load gracefully
const EarthComponent: React.FC = () => {
  return (
    <TextureErrorBoundary fallback={<EarthFallback />}>
      <React.Suspense fallback={<EarthFallback />}>
        <EarthInner />
      </React.Suspense>
    </TextureErrorBoundary>
  );
};

// Fallback while textures stream in — keeps the placeholder Earth visible
const EarthFallback: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.06;
  });
  return (
    <group rotation={[0, 0, AXIAL_TILT]}>
      <mesh ref={meshRef} receiveShadow castShadow>
        <sphereGeometry args={[EARTH_RADIUS, 48, 48]} />
        <meshStandardMaterial
          color="#1a3a5c"
          roughness={0.7}
          metalness={0.1}
          emissive="#0d1f33"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Fallback atmosphere */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.022, 32, 32]} />
        <meshBasicMaterial
          color="#4da6ff"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export const Earth = React.memo(EarthComponent);
export default Earth;
