import { type FC, Suspense } from 'react';
import { OrbitalScene } from '../three/OrbitalScene';

export const OrbitalView: FC = () => {
  return (
    <div className="relative w-full h-full">
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <div className="text-center font-mono space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-dashed border-cyber-blue/40 flex items-center justify-center animate-spin">
                <div className="w-3 h-3 bg-cyber-blue rounded-full" />
              </div>
              <p className="text-sm text-zinc-400">Initializing Orbital Scene...</p>
              <p className="text-xs text-zinc-500">Loading constellation ephemerides</p>
            </div>
          </div>
        }
      >
        <OrbitalScene />
      </Suspense>
    </div>
  );
};

export default OrbitalView;
