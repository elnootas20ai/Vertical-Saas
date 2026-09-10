import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AuthRouteLoading } from '../AuthRouteLoading';
import { usesTpvCatalogOpsBusinessType } from '../../lib/deliveryOpsTypes';

/**
 * Verticales TPV (restaurant/delivery/heladería/events): una sola puerta de
 * proveedores en Catálogo. Compraventa y resto conservan /saas/suppliers.
 */
export function SuppliersEntryRedirect() {
  const businessCtx = useBusinessOptional();
  const location = useLocation();
  const { supplierId } = useParams();
  const pending =
    !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const businessType = businessCtx?.currentBusiness?.businessType;

  if (pending) {
    return <AuthRouteLoading label="Preparando proveedores…" />;
  }

  if (usesTpvCatalogOpsBusinessType(businessType)) {
    const path = location.pathname.replace(/\/+$/, '');
    if (path.endsWith('/ordenes-compra')) {
      return <Navigate to="/saas/catalog?tab=purchase-orders" replace />;
    }
    if (path.endsWith('/facturas')) {
      return <Navigate to="/saas/catalog?tab=invoices" replace />;
    }
    if (path.endsWith('/correo-facturas')) {
      return <Navigate to="/saas/correo-facturas" replace />;
    }
    if (supplierId && supplierId !== 'ordenes-compra' && supplierId !== 'facturas') {
      return (
        <Navigate
          to={`/saas/catalog?tab=suppliers&edit=${encodeURIComponent(supplierId)}`}
          replace
        />
      );
    }
    return <Navigate to="/saas/catalog?tab=suppliers" replace />;
  }

  return <Outlet />;
}
