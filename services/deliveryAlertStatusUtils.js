/**
 * Normalización de estados de pedidos delivery para motores de alerta.
 * El dominio usa español (cocina, listo, en_reparto, entregado); el motor
 * histórico usaba inglés — aquí unificamos ambos.
 */

const STATUS_MIGRATION = {
  pending: 'nuevo',
  preparing: 'nuevo',
  kitchen: 'cocina',
  assembly: 'listo',
  delivery: 'en_reparto',
  delivered: 'entregado',
};

const TERMINAL_STATUSES = new Set(['entregado', 'cancelled']);

/** Fase operativa (clave de umbrales delayThresholds). */
const PHASE_BY_STATUS = {
  nuevo: 'pending',
  cocina: 'kitchen',
  listo: 'assembly',
  en_reparto: 'delivery',
};

export function normalizeDeliveryOrderStatus(status) {
  const v = String(status || '');
  if (STATUS_MIGRATION[v]) return STATUS_MIGRATION[v];
  return v;
}

export function isTerminalDeliveryStatus(status) {
  return TERMINAL_STATUSES.has(normalizeDeliveryOrderStatus(status));
}

export function isActiveDeliveryOrder(order) {
  if (!order || order.deletedAt) return false;
  return !isTerminalDeliveryStatus(order.status);
}

export function getOrderPhase(order) {
  const status = normalizeDeliveryOrderStatus(order?.status);
  return PHASE_BY_STATUS[status] || null;
}

export function orderHasDeliveryPhase(order) {
  const history = Array.isArray(order?.stageHistory) ? order.stageHistory : [];
  return history.some((h) => {
    const s = normalizeDeliveryOrderStatus(h?.status);
    return s === 'en_reparto';
  });
}

export function isDeliveredStatus(status) {
  return normalizeDeliveryOrderStatus(status) === 'entregado';
}

export function filterActiveDeliveryOrders(orders) {
  return (Array.isArray(orders) ? orders : []).filter(isActiveDeliveryOrder);
}

export function getPhaseStartTime(order) {
  const status = normalizeDeliveryOrderStatus(order.status);
  if (status === 'cocina' && order.kitchenStartedAt) return new Date(order.kitchenStartedAt);
  if (status === 'listo' && order.assemblyStartedAt) return new Date(order.assemblyStartedAt);
  for (let i = (order.stageHistory || []).length - 1; i >= 0; i--) {
    const h = order.stageHistory[i];
    if (normalizeDeliveryOrderStatus(h.status) === status && h.date) return new Date(h.date);
  }
  return new Date(order.createdAt);
}
