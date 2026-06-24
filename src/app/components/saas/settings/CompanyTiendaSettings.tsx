import { useBusiness } from '../../../context/BusinessContext';
import { WorkCentersSettingsPanel } from '../../../pages/saas/SalesPointsPage';
import { SalesPointsTab } from './SalesPointsTab';

export function CompanyTiendaSettings() {
  const { currentBusiness } = useBusiness();
  if (currentBusiness?.businessType === 'carDealership') {
    return <WorkCentersSettingsPanel embedded />;
  }
  return <SalesPointsTab />;
}
