import React from 'react';
import { ArchitectureView as ArchitectureComponent } from '../architecture/ArchitectureView';

export const ArchitectureView: React.FC = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto overflow-y-auto">
      <ArchitectureComponent />
    </div>
  );
};

export default ArchitectureView;
