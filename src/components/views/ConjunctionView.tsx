import React from 'react';
import { ConjunctionView as ConjunctionComponent } from '../conjunction/ConjunctionView';

export const ConjunctionView: React.FC = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto overflow-y-auto">
      <ConjunctionComponent />
    </div>
  );
};

export default ConjunctionView;
