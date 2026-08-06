import { Navigate } from 'react-router-dom';
import { useBusiness } from '../../context/BusinessContext';
import { usesTpvCatalogOpsBusinessType } from '../../lib/deliveryOpsTypes';
import { CatalogPage as DeliveryCatalogPage } from './DeliveryCatalog';
import { CatalogPage as GenericCatalogPage } from './CatalogPage';

/** Catálogo: delivery/restaurante/heladería → módulo TPV + Excel; compraventa → vehículos; resto → genérico. */
export function VerticalCatalogEntry() {
  const { currentBusiness } = useBusiness();
  const businessType = currentBusiness?.businessType;
  if (businessType === 'carDealership') {
    return <Navigate to="/saas/vehicles" replace />;
  }
  if (usesTpvCatalogOpsBusinessType(businessType)) {
    return <DeliveryCatalogPage />;
  }
  return <GenericCatalogPage />;
}

export function VerticalArticlesRedirect() {
  const { currentBusiness } = useBusiness();
  if (currentBusiness?.businessType === 'carDealership') {
    return <Navigate to="/saas/vehicles" replace />;
  }
  return <Navigate to="/saas/inventory" replace />;
}
