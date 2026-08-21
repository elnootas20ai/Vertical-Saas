import { Navigate, useLocation } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Verticales que no usan TPV retail «de tienda»:
 * - Eventos → hub operativo para rutas TPV clásicas; SÍ carta/almacén/compras.
 * - Inmobiliaria → panel (sin catálogo ni proveedores)
 */
const EVENTS_ALLOWED_RETAIL_PREFIXES = [
  '/saas/catalog',
  '/saas/inventory',
  '/saas/articles',
  '/saas/suppliers',
  '/saas/correo-facturas',
  '/saas/compras-stock',
  '/saas/costing',
];

export function RedirectEventsFromRetailRoutes({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const location = useLocation();
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const businessType = businessCtx?.currentBusiness?.businessType;

  if (pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }

  if (businessType === 'events') {
    const path = location.pathname;
    const allowed = EVENTS_ALLOWED_RETAIL_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
    if (allowed) {
      return <>{children}</>;
    }
    return <Navigate to="/saas/vertical/eventos" replace />;
  }

  if (businessType === 'realEstate') {
    return <Navigate to="/saas/dashboard" replace />;
  }

  return <>{children}</>;
}
