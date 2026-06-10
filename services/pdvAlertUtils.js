/**
 * Guardas para alertas de PDV / caja: solo evaluar si hay puntos de venta configurados.
 */

export function isActivePointOfSale(pdv) {
  if (!pdv || pdv.deletedAt || pdv.active === false) return false;
  return true;
}

export function filterActivePointsOfSale(pointsOfSale) {
  return (Array.isArray(pointsOfSale) ? pointsOfSale : []).filter(isActivePointOfSale);
}

export function hasPdvTerminal(pdv) {
  const terminals = Array.isArray(pdv?.terminals) ? pdv.terminals : [];
  if (terminals.some((t) => t && t.active !== false)) return true;
  return Boolean(String(pdv?.terminalCode || '').trim());
}

/** Al menos un PDV activo con terminal operativo. */
export function hasPdvSetup(pointsOfSale) {
  return filterActivePointsOfSale(pointsOfSale).some(hasPdvTerminal);
}

/** ¿Puede emitir alertas de caja TPV? */
export function canEmitPdvCashAlerts(pointsOfSale) {
  return hasPdvSetup(pointsOfSale);
}

/** Repartidores activos — requisito para alertas de caja de reparto. */
export function hasDriverCashSetup(drivers) {
  return (Array.isArray(drivers) ? drivers : []).some((d) => d && !d.deletedAt && d.active !== false);
}

export function canEmitDriverCashAlerts(drivers) {
  return hasDriverCashSetup(drivers);
}
