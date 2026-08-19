/**
 * Número de pedido de compra: correlativo real (PC-0001…), no un código de reloj.
 */
export const PURCHASE_ORDER_NUMBER_PREFIX = 'PC-';

export function parsePurchaseOrderSequence(orderNumber: string | undefined | null): number {
  const m = /^PC-(\d+)$/i.exec(String(orderNumber || '').trim());
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatPurchaseOrderNumber(sequence: number): string {
  const seq = Math.max(1, Math.floor(Number(sequence) || 1));
  return `${PURCHASE_ORDER_NUMBER_PREFIX}${String(seq).padStart(4, '0')}`;
}

export function nextPurchaseOrderNumber(existingNumbers: Array<string | undefined | null> = []): string {
  let max = 0;
  for (const raw of existingNumbers) {
    const seq = parsePurchaseOrderSequence(raw);
    if (seq > max) max = seq;
  }
  return formatPurchaseOrderNumber(max + 1);
}
