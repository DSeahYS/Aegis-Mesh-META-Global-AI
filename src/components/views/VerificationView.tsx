import React from 'react';
import { VerificationDashboard } from '../verification/VerificationDashboard';

export const VerificationView: React.FC = () => {
  return (
    <div className="w-full h-full p-6 overflow-y-auto">
      <VerificationDashboard />
    </div>
  );
};

export default VerificationView;
