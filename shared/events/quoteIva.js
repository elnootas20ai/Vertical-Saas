/** IVA de presupuestos Eventos (líneas = base imponible). Alineado front ↔ email API. */
export const EVENTS_QUOTE_IVA_RATE = 0.1;
export const EVENTS_QUOTE_IVA_PERCENT = Math.round(EVENTS_QUOTE_IVA_RATE * 100);

export function computeEventsQuoteIva(subtotal) {
  const base = Math.round((Number(subtotal) || 0) * 100) / 100;
  const iva = Math.round(base * EVENTS_QUOTE_IVA_RATE * 100) / 100;
  const total = Math.round((base + iva) * 100) / 100;
  return { subtotal: base, iva, total };
}
