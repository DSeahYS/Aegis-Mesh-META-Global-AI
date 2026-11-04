import type { FC } from 'react';
import { DashboardView as DashboardPanels } from '../dashboard/DashboardView';

export const DashboardView: FC = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto overflow-y-auto h-full">
      <DashboardPanels />
    </div>
  );
};

export default DashboardView;
