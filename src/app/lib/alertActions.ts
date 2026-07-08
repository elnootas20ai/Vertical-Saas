import type { AlertRecord } from './alertCenterApi';

/**
 * Los motores de alertas emiten rutas del centro operativo delivery.
 * En bar/restaurante esas rutas están bloqueadas (RequireDeliveryVertical → /saas/sala),
 * así que se traducen a sus equivalentes de restaurante antes de navegar.
 */
const RESTAURANT_ROUTE_MAP: [prefix: string, target: string][] = [
  ['/saas/delivery-kitchen', '/saas/cocina'],
  ['/saas/delivery-ops', '/saas/sala'],
  ['/saas/delivery-reparto', '/saas/sala'],
  ['/saas/delivery-montaje', '/saas/sala'],
  ['/saas/vertical/delivery/caja', '/saas/caja'],
];

export function resolveAlertRouteForBusiness(
  route: string | undefined | null,
  businessType?: string | null,
): string {
  const raw = String(route || '').trim();
  if (!raw) return '';
  if (String(businessType || '').trim() !== 'restaurant') return raw;
  for (const [prefix, target] of RESTAURANT_ROUTE_MAP) {
    if (raw === prefix || raw.startsWith(`${prefix}?`) || raw.startsWith(`${prefix}/`)) {
      return target;
    }
  }
  return raw;
}

/** Devuelve la alerta con la ruta adaptada al vertical del negocio activo. */
export function mapAlertForBusinessVertical(alert: AlertRecord, businessType?: string | null): AlertRecord {
  const mapped = resolveAlertRouteForBusiness(alert.route, businessType);
  if (mapped === String(alert.route || '')) return alert;
  return { ...alert, route: mapped };
}

export function mapAlertsForBusinessVertical(alerts: AlertRecord[], businessType?: string | null): AlertRecord[] {
  if (String(businessType || '').trim() !== 'restaurant') return alerts;
  return alerts.map((alert) => mapAlertForBusinessVertical(alert, businessType));
}

/** Etiqueta del botón principal según destino o tipo de alerta. */
export function getAlertResolveLabel(alert: AlertRecord): string {
  const route = String(alert.route || '').toLowerCase();
  const cat = String(alert.category || '').toLowerCase();

  if (route.includes('caja') || cat.includes('cash') || cat.includes('register')) return 'Ir a caja';
  if (route.includes('cocina') || route.includes('delivery-kitchen') || cat.includes('kitchen')) return 'Ir a cocina';
  if (route.includes('/sala') || cat.startsWith('sala')) return 'Ir a sala';
  if (route.includes('delivery-reparto') || cat.includes('reparto')) return 'Ir a reparto';
  if (route.includes('delivery-ops') || route.includes('delivery')) return 'Ir a pedidos';
  if (route.includes('finance') || alert.source === 'finanzas') return 'Ir a finanzas';
  if (route.includes('clock') || alert.source === 'equipo') return 'Ir a fichajes';
  if (route.includes('catalog') || alert.source === 'stock') return 'Ir a catálogo';
  if (route.includes('clients') || alert.source === 'crm') return 'Ir a clientes';
  if (route.includes('document') || alert.source === 'documentacion') return 'Ver documento';
  if (route.includes('alerts')) return 'Ver detalle';
  if (alert.route) return 'Ir a resolver';
  return 'Ver en centro';
}

export function alertHasNavigateTarget(alert: AlertRecord): boolean {
  return Boolean(String(alert.route || '').trim());
}
