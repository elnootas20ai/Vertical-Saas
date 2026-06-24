import { Navigate } from 'react-router-dom';
import { useBusiness } from '../../context/BusinessContext';
import { CatalogPage } from './DeliveryCatalog';

/** Catálogo: delivery usa DeliveryCatalog; compraventa va a stock vehículos. */
export function VerticalCatalogEntry() {
  const { currentBusiness } = useBusiness();
  if (currentBusiness?.businessType === 'carDealership') {
    return <Navigate to="/saas/vehicles" replace />;
  }
  return <CatalogPage />;
}

export function VerticalArticlesRedirect() {
  const { currentBusiness } = useBusiness();
  if (currentBusiness?.businessType === 'carDealership') {
    return <Navigate to="/saas/vehicles" replace />;
  }
  return <Navigate to="/saas/catalog?tab=stock" replace />;
}
