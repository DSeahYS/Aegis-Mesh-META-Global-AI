import React from 'react';
import { CLMLab } from '../architecture/CLMLab';

export const CLMLabView: React.FC = () => {
  return (
    <div className="w-full h-full p-6 overflow-y-auto">
      <CLMLab />
    </div>
  );
};

export default CLMLabView;
