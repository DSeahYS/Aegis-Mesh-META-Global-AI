import React from 'react';
import { CLMGpuDashboard } from '../architecture/CLMGpuDashboard';

export const CLMGpuView: React.FC = () => {
  return (
    <div className="w-full h-full p-6 overflow-y-auto">
      <CLMGpuDashboard />
    </div>
  );
};

export default CLMGpuView;
