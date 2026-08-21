import type { AlertRecord } from './alertCenterApi';
import { isEventsBusinessType } from './deliveryOpsTypes';

/** Rutas de alerta: sin remap a bar/restaurante (retirado del producto). */
export function resolveAlertRouteForBusiness(
  route: string | undefined | null,
  _businessType?: string | null,
): string {
  return String(route || '').trim();
}

/** ¿Esta alerta pertenece al vertical activo? Eventos no hereda ruido delivery/otras verticales. */
export function isAlertAllowedForBusinessVertical(
  alert: Pick<AlertRecord, 'category' | 'source' | 'route'>,
  businessType?: string | null,
): boolean {
  if (!isEventsBusinessType(businessType)) return true;

  const cat = String(alert.category || '').trim().toLowerCase();
  const source = String(alert.source || '').trim().toLowerCase();
  const route = String(alert.route || '').trim().toLowerCase();

  if (cat.startsWith('events_') || source === 'eventos') return true;
  if (cat === 'merma_registered') return true;
  if (route.includes('/eventos')) return true;

  // Núcleo compartido (equipo / docs / finanzas / sistema)
  if (
    source === 'equipo'
    || source === 'documentacion'
    || source === 'finanzas'
    || source === 'sistema'
    || source === 'seguridad'
    || source === 'ocr'
    || source === 'conciliacion'
    || source === 'stock'
  ) {
    return true;
  }
  if (
    cat.startsWith('worker_')
    || cat.startsWith('document_')
    || cat.startsWith('contract_')
    || cat.startsWith('payment_')
    || cat.startsWith('tax_')
    || cat === 'negative_cash_flow'
    || cat === 'user_login_new'
    || cat === 'user_role_changed'
  ) {
    return true;
  }

  // Delivery y demás verticales ajenas
  if (cat.startsWith('delivery_') || source === 'delivery') return false;
  if (cat.startsWith('butcher_') || source === 'carniceria') return false;
  if (cat.startsWith('scrapyard_') || source === 'desguaces') return false;
  if (cat.startsWith('cv_') || source === 'compraventa' || source === 'adquisiciones') return false;
  if (cat.startsWith('cleaning_') || source === 'limpieza') return false;
  if (cat.startsWith('construction_') || source === 'construccion') return false;
  if (
    route.includes('delivery-ops')
    || route.includes('delivery-kitchen')
    || route.includes('delivery-reparto')
    || route.includes('/vertical/delivery')
    || route.includes('restaurant-ops')
  ) {
    return false;
  }

  return false;
}

/** Devuelve la alerta con la ruta adaptada al vertical del negocio activo. */
export function mapAlertForBusinessVertical(alert: AlertRecord, businessType?: string | null): AlertRecord {
  const mapped = resolveAlertRouteForBusiness(alert.route, businessType);
  if (mapped === String(alert.route || '')) return alert;
  return { ...alert, route: mapped };
}

export function mapAlertsForBusinessVertical(alerts: AlertRecord[], businessType?: string | null): AlertRecord[] {
  return alerts
    .filter((alert) => isAlertAllowedForBusinessVertical(alert, businessType))
    .map((alert) => mapAlertForBusinessVertical(alert, businessType));
}

/** Etiqueta del botón principal según destino o tipo de alerta. */
export function getAlertResolveLabel(alert: AlertRecord): string {
  const route = String(alert.route || '').toLowerCase();
  const cat = String(alert.category || '').toLowerCase();

  if (route.includes('caja') || cat.includes('cash') || cat.includes('register')) return 'Ir a caja';
  if (route.includes('cocina') || route.includes('delivery-kitchen') || cat.includes('kitchen')) return 'Ir a cocina';
  if (route.includes('delivery-reparto') || cat.includes('reparto')) return 'Ir a reparto';
  if (route.includes('delivery-ops') || route.includes('delivery')) return 'Ir a pedidos';
  if (route.includes('eventos') || cat.startsWith('events_')) return 'Ir a eventos';
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
