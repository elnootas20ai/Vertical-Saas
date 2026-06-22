import type { AlertRecord } from './alertCenterApi';

/** Etiqueta del botón principal según destino o tipo de alerta. */
export function getAlertResolveLabel(alert: AlertRecord): string {
  const route = String(alert.route || '').toLowerCase();
  const cat = String(alert.category || '').toLowerCase();

  if (route.includes('caja') || cat.includes('cash') || cat.includes('register')) return 'Ir a caja';
  if (route.includes('delivery-kitchen') || cat.includes('kitchen')) return 'Ir a cocina';
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
