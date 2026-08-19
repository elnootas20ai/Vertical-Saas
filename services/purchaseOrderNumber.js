/**
 * Número de pedido de compra: correlativo real, no un recorte del reloj.
 * Formato: PC-0001, PC-0002…
 */
export const PURCHASE_ORDER_NUMBER_PREFIX = 'PC-';

export function parsePurchaseOrderSequence(orderNumber) {
  const m = /^PC-(\d+)$/i.exec(String(orderNumber || '').trim());
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatPurchaseOrderNumber(sequence) {
  const seq = Math.max(1, Math.floor(Number(sequence) || 1));
  return `${PURCHASE_ORDER_NUMBER_PREFIX}${String(seq).padStart(4, '0')}`;
}

export function nextPurchaseOrderNumber(existingNumbers = []) {
  let max = 0;
  for (const raw of existingNumbers) {
    const seq = parsePurchaseOrderSequence(raw);
    if (seq > max) max = seq;
  }
  return formatPurchaseOrderNumber(max + 1);
}
