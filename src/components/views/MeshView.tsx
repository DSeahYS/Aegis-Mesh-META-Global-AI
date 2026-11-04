import React from 'react';
import { MeshView as MeshComponent } from '../mesh/MeshView';

export const MeshView: React.FC = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto overflow-y-auto">
      <MeshComponent />
    </div>
  );
};

export default MeshView;
