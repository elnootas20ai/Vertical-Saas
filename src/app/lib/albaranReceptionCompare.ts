import type { PurchaseInvoice, PurchaseInvoiceLine } from './deliveryApi';
import type { PurchaseOrder, PurchaseOrderItem } from './purchaseOrderApi';

/** Estados de pedido que esperan albarán / recepción. */
export const PURCHASE_ORDER_WAITING_STATUSES = new Set(['draft', 'pending', 'sent', 'partial']);

export type AlbaranCompareStatus = 'ok' | 'qty_diff' | 'price_diff' | 'both_diff' | 'missing_invoice' | 'extra_invoice';

export type AlbaranCompareRow = {
  catalogItemId: string;
  name: string;
  sku: string;
  orderedQty: number;
  orderedUnitCost: number;
  invoiceQty: number;
  invoiceUnitCost: number;
  status: AlbaranCompareStatus;
  /** Editable en UI antes de confirmar. */
  receiveQty: number;
  receiveUnitCost: number;
};

function normName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard de palabras (mismo criterio que receive-with-invoice). */
export function nameMatchScore(a: string, b: string): number {
  const words1 = new Set(normName(a).split(' ').filter(Boolean));
  const words2 = new Set(normName(b).split(' ').filter(Boolean));
  if (words1.size === 0 || words2.size === 0) return 0;
  let intersection = 0;
  for (const w of words1) if (words2.has(w)) intersection += 1;
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}

function resolveCompareStatus(
  orderedQty: number,
  orderedUnitCost: number,
  invoiceQty: number,
  invoiceUnitCost: number,
  hasInvoiceLine: boolean,
): AlbaranCompareStatus {
  if (!hasInvoiceLine) return 'missing_invoice';
  const qtyDiff = Math.abs(invoiceQty - orderedQty) > 0.001;
  const priceDiff =
    orderedUnitCost > 0 && invoiceUnitCost > 0
      ? Math.abs(invoiceUnitCost - orderedUnitCost) / Math.max(orderedUnitCost, 0.01) > 0.02
      : invoiceUnitCost > 0 && orderedUnitCost === 0;
  if (qtyDiff && priceDiff) return 'both_diff';
  if (qtyDiff) return 'qty_diff';
  if (priceDiff) return 'price_diff';
  return 'ok';
}

export function isPurchaseOrderWaitingAlbaran(order: Pick<PurchaseOrder, 'status'>): boolean {
  return PURCHASE_ORDER_WAITING_STATUSES.has(String(order.status || ''));
}

export function invoiceIsAlbaran(inv: Pick<PurchaseInvoice, 'documentKind' | 'ocrData'>): boolean {
  const kind = String(inv.documentKind || '').toLowerCase();
  const ocrKind = String(inv.ocrData?.documentType || '').toLowerCase();
  return kind === 'albaran' || kind.includes('albaran') || ocrKind === 'albaran' || ocrKind.includes('albaran');
}

/**
 * Construye filas de comparación pedido ↔ albarán/factura.
 * Si no hay factura, usa cantidades/precios del pedido (listos para editar al comprobar).
 */
export function buildAlbaranCompareRows(
  order: Pick<PurchaseOrder, 'items'>,
  invoice?: Pick<PurchaseInvoice, 'lines'> | null,
): AlbaranCompareRow[] {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const invoiceLines = Array.isArray(invoice?.lines) ? [...invoice.lines] : [];
  const usedInvoiceIdx = new Set<number>();
  const rows: AlbaranCompareRow[] = [];

  const matchInvoiceLine = (item: PurchaseOrderItem): { line: PurchaseInvoiceLine; idx: number } | null => {
    const byId = invoiceLines.findIndex(
      (l, i) => !usedInvoiceIdx.has(i) && l.catalogItemId && l.catalogItemId === item.catalogItemId,
    );
    if (byId >= 0) return { line: invoiceLines[byId], idx: byId };

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < invoiceLines.length; i++) {
      if (usedInvoiceIdx.has(i)) continue;
      const line = invoiceLines[i];
      const score = nameMatchScore(item.name, line.itemName || line.catalogItemName || '');
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return null;
    return { line: invoiceLines[bestIdx], idx: bestIdx };
  };

  const hasInvoiceDoc = Boolean(invoice);

  for (const item of orderItems) {
    const hit = hasInvoiceDoc ? matchInvoiceLine(item) : null;
    if (hit) usedInvoiceIdx.add(hit.idx);
    const orderedQty = Number(item.quantity) || 0;
    const orderedUnitCost = Number(item.unitCost) || 0;
    const alreadyReceived = Number(item.received) || 0;
    const pendingQty = Math.max(0, orderedQty - alreadyReceived);
    const invoiceQty = hit ? Number(hit.line.quantity) || 0 : 0;
    const invoiceUnitCost = hit ? Number(hit.line.unitPrice) || 0 : 0;
    const receiveQty = hit ? invoiceQty : pendingQty || orderedQty;
    const receiveUnitCost =
      (hit ? invoiceUnitCost : 0) > 0 ? invoiceUnitCost : orderedUnitCost;

    rows.push({
      catalogItemId: item.catalogItemId,
      name: item.name,
      sku: item.sku || '',
      orderedQty,
      orderedUnitCost,
      invoiceQty,
      invoiceUnitCost,
      status: hasInvoiceDoc
        ? resolveCompareStatus(orderedQty, orderedUnitCost, invoiceQty, invoiceUnitCost, Boolean(hit))
        : 'ok',
      receiveQty,
      receiveUnitCost,
    });
  }

  // Líneas de factura sin pedido → aviso (no se reciben automáticamente).
  for (let i = 0; i < invoiceLines.length; i++) {
    if (usedInvoiceIdx.has(i)) continue;
    const line = invoiceLines[i];
    const name = String(line.itemName || line.catalogItemName || '').trim();
    if (!name) continue;
    rows.push({
      catalogItemId: String(line.catalogItemId || ''),
      name,
      sku: '',
      orderedQty: 0,
      orderedUnitCost: 0,
      invoiceQty: Number(line.quantity) || 0,
      invoiceUnitCost: Number(line.unitPrice) || 0,
      status: 'extra_invoice',
      receiveQty: 0,
      receiveUnitCost: Number(line.unitPrice) || 0,
    });
  }

  return rows;
}

export function compareRowHasIssue(row: AlbaranCompareRow): boolean {
  return row.status !== 'ok' && row.status !== 'missing_invoice';
}

export function summarizeCompareIssues(rows: AlbaranCompareRow[]): {
  ok: number;
  issues: number;
  extras: number;
} {
  let ok = 0;
  let issues = 0;
  let extras = 0;
  for (const row of rows) {
    if (row.status === 'ok') ok += 1;
    else if (row.status === 'extra_invoice') extras += 1;
    else if (row.status === 'missing_invoice' && !row.invoiceQty) {
      /* sin factura aún: no cuenta como incidencia */
    } else issues += 1;
  }
  return { ok, issues, extras };
}
