/**
 * Tiempos de fase delivery (montaje / reparto).
 *
 * Reparto en Vertial: el repartidor marca salida (departedAt) y al volver
 * marca entregado (deliveredAt). No hay marca en la puerta del cliente.
 * Por eso la ida estimada = (vuelta - salida) / 2.
 */

export function minutesBetweenIso(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}

/** Montaje: ancla → listo para salir. */
export function estimateAssemblyMinutes(order) {
  if (!order || typeof order !== 'object') return null;
  const start = order.assemblyStartedAt || order.createdAt;
  const end = order.assemblyCompletedAt;
  return minutesBetweenIso(start, end);
}

/**
 * Ida estimada de reparto (domicilio).
 * Solo si hay salida y vuelta; no aplica a recogida.
 */
export function estimateOneWayDeliveryMinutes(order) {
  if (!order || typeof order !== 'object') return null;
  if (String(order.deliveryType || '') === 'recogida') return null;
  const start = order.departedAt || order.assemblyCompletedAt;
  const end = order.deliveredAt;
  const roundTrip = minutesBetweenIso(start, end);
  if (roundTrip == null || roundTrip <= 0) return null;
  return roundTrip / 2;
}
