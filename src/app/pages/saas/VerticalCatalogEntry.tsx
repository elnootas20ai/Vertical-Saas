import { Navigate } from 'react-router-dom';
import { useBusiness } from '../../context/BusinessContext';
import { isDeliveryBusinessType } from '../../lib/deliverySetup';
import { CatalogPage as DeliveryCatalogPage } from './DeliveryCatalog';
import { CatalogPage as GenericCatalogPage } from './CatalogPage';

/** Catálogo: delivery → módulo TPV/pizzas; compraventa → vehículos; resto → catálogo genérico. */
export function VerticalCatalogEntry() {
  const { currentBusiness } = useBusiness();
  const businessType = currentBusiness?.businessType;
  if (businessType === 'carDealership') {
    return <Navigate to="/saas/vehicles" replace />;
  }
  if (isDeliveryBusinessType(businessType)) {
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
