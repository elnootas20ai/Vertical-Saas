/** Rutas canónicas del vertical compraventa → core (sin duplicar pantallas). */

export const COMPRAVENTA_HOME_PATH = '/saas/vertical/compraventa';
export const COMPRAVENTA_VENTAS_PATH = '/saas/vertical/compraventa/ventas';
export const COMPRAVENTA_ENTREGAS_PATH = '/saas/vertical/compraventa/entregas';
export const COMPRAVENTA_PUBLICACION_PATH = '/saas/vertical/compraventa/publicacion-venta';
export const COMPRAVENTA_GASTOS_PATH = '/saas/vertical/compraventa/gastos-preparacion';
export const COMPRAVENTA_ALERTS_PATH = '/saas/alerts?department=compraventa';

/** Ficha de venta: sigue en core SaleDetail. */
export function compraventaSaleDetailPath(
  saleId: string,
  query?: Record<string, string | undefined>,
): string {
  const qs = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') qs.set(key, value);
    }
  }
  const suffix = qs.toString();
  return `/saas/sales/${encodeURIComponent(saleId)}${suffix ? `?${suffix}` : ''}`;
}

/** Lista de ventas del vertical (opcionalmente preselección / nueva). */
export function compraventaVentasListPath(query?: {
  saleId?: string;
  newSale?: boolean;
  vehicleId?: string;
  clientId?: string;
}): string {
  const qs = new URLSearchParams();
  if (query?.saleId) qs.set('saleId', query.saleId);
  if (query?.newSale) qs.set('newSale', '1');
  if (query?.vehicleId) qs.set('vehicleId', query.vehicleId);
  if (query?.clientId) qs.set('clientId', query.clientId);
  const suffix = qs.toString();
  return `${COMPRAVENTA_VENTAS_PATH}${suffix ? `?${suffix}` : ''}`;
}

export function compraventaGastosPath(vehicleId?: string): string {
  if (!vehicleId) return COMPRAVENTA_GASTOS_PATH;
  return `${COMPRAVENTA_GASTOS_PATH}?vehicleId=${encodeURIComponent(vehicleId)}`;
}

export function compraventaPublicacionPath(vehicleId?: string): string {
  if (!vehicleId) return COMPRAVENTA_PUBLICACION_PATH;
  return `${COMPRAVENTA_PUBLICACION_PATH}?vehicleId=${encodeURIComponent(vehicleId)}`;
}

/** Lista de ventas según vertical activa. */
export function salesListPathForBusiness(businessType?: string | null): string {
  return businessType === 'carDealership' ? COMPRAVENTA_VENTAS_PATH : '/saas/sales';
}
