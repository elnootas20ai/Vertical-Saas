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
  /** Marcado cuando no viene en el albarán (no entra stock). */
  excluded: boolean;
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
    const invoiceQty = hit
      ? Number(hit.line.quantity) || 0
      : hasInvoiceDoc
        ? 0
        : pendingQty || orderedQty;
    const invoiceUnitCost = hit ? Number(hit.line.unitPrice) || 0 : 0;
    const missingOnInvoice = hasInvoiceDoc && !hit;
    const receiveQty = missingOnInvoice ? 0 : hit ? invoiceQty : pendingQty || orderedQty;
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
      excluded: missingOnInvoice,
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
      excluded: true,
    });
  }

  return rows;
}

/** Cantidad pendiente de recibir de una línea de pedido. */
export function pendingOrderQty(item: Pick<PurchaseOrderItem, 'quantity' | 'received'>): number {
  const orderedQty = Number(item.quantity) || 0;
  const alreadyReceived = Number(item.received) || 0;
  return Math.max(0, orderedQty - alreadyReceived);
}

/** Recalcula fila tras editar la cantidad del albarán (comprobación manual). */
export function applyManualAlbaranQty(row: AlbaranCompareRow, albaranQty: number): AlbaranCompareRow {
  const qty = Math.max(0, albaranQty);
  const excluded = qty <= 0.001;
  return {
    ...row,
    invoiceQty: qty,
    receiveQty: excluded ? 0 : qty,
    excluded,
    status: excluded
      ? 'missing_invoice'
      : resolveCompareStatus(row.orderedQty, row.orderedUnitCost, qty, row.receiveUnitCost, true),
  };
}

/** Marca o desmarca «no viene en el albarán». */
export function toggleCompareRowExcluded(
  row: AlbaranCompareRow,
  excluded: boolean,
  pendingQty?: number,
): AlbaranCompareRow {
  if (row.status === 'extra_invoice') return row;
  if (excluded) {
    return {
      ...row,
      excluded: true,
      invoiceQty: 0,
      receiveQty: 0,
      status: 'missing_invoice',
    };
  }
  const restoreQty = pendingQty ?? row.orderedQty;
  return applyManualAlbaranQty(
    { ...row, excluded: false },
    restoreQty,
  );
}

export function isCompareRowReceivable(row: AlbaranCompareRow): boolean {
  return Boolean(row.catalogItemId) && !row.excluded && row.receiveQty > 0 && row.status !== 'extra_invoice';
}

export type PendingOrderLine = {
  catalogItemId: string;
  name: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  pendingQty: number;
};

/** Líneas del pedido que siguen pendientes tras comprobar el albarán. */
export function buildPendingOrderLinesFromCompare(
  order: Pick<PurchaseOrder, 'items'>,
  rows: AlbaranCompareRow[],
): PendingOrderLine[] {
  const pending: PendingOrderLine[] = [];
  const orderItems = Array.isArray(order.items) ? order.items : [];

  for (const row of rows) {
    if (row.status === 'extra_invoice') continue;
    const item = orderItems.find(
      (i) => i.catalogItemId === row.catalogItemId && i.name === row.name,
    );
    const orderedQty = Number(item?.quantity ?? row.orderedQty) || 0;
    const alreadyReceived = Number(item?.received) || 0;
    const pendingBefore = Math.max(0, orderedQty - alreadyReceived);

    if (row.excluded) {
      if (pendingBefore <= 0.001) continue;
      pending.push({
        catalogItemId: row.catalogItemId,
        name: row.name,
        sku: row.sku || item?.sku || '',
        orderedQty,
        receivedQty: alreadyReceived,
        pendingQty: pendingBefore,
      });
      continue;
    }

    const receiveNow = Number(row.receiveQty) || 0;
    const afterReceive = alreadyReceived + receiveNow;
    const stillPending = Math.max(0, orderedQty - afterReceive);
    if (stillPending <= 0.001) continue;
    pending.push({
      catalogItemId: row.catalogItemId,
      name: row.name,
      sku: row.sku || item?.sku || '',
      orderedQty,
      receivedQty: afterReceive,
      pendingQty: stillPending,
    });
  }

  return pending;
}

export function isAlbaranReceptionIncomplete(
  order: Pick<PurchaseOrder, 'items'>,
  rows: AlbaranCompareRow[],
): boolean {
  return buildPendingOrderLinesFromCompare(order, rows).length > 0;
}

/** Pendientes desde pedido parcial ya guardado (histórico). */
export function pendingLinesFromPurchaseOrder(order: Pick<PurchaseOrder, 'items'> | null | undefined): PendingOrderLine[] {
  const items = Array.isArray(order?.items) ? order!.items : [];
  return items
    .filter((item) => Number(item.received || 0) < Number(item.quantity || 0))
    .map((item) => {
      const orderedQty = Number(item.quantity) || 0;
      const receivedQty = Number(item.received) || 0;
      return {
        catalogItemId: String(item.catalogItemId || ''),
        name: String(item.name || ''),
        sku: String(item.sku || ''),
        orderedQty,
        receivedQty,
        pendingQty: Math.max(0, orderedQty - receivedQty),
      };
    });
}

export function isAlbaranInvoiceIncomplete(
  inv: { flags?: { orderIncomplete?: boolean }; pendingOrderLines?: PendingOrderLine[] },
  order?: Pick<PurchaseOrder, 'status' | 'items'> | null,
): boolean {
  if (inv.flags?.orderIncomplete) return true;
  if (Array.isArray(inv.pendingOrderLines) && inv.pendingOrderLines.length > 0) return true;
  if (order?.status === 'partial') return true;
  return pendingLinesFromPurchaseOrder(order).length > 0;
}

export function resolveAlbaranPendingLines(
  inv: { pendingOrderLines?: PendingOrderLine[] },
  order?: Pick<PurchaseOrder, 'items'> | null,
): PendingOrderLine[] {
  if (Array.isArray(inv.pendingOrderLines) && inv.pendingOrderLines.length > 0) {
    return inv.pendingOrderLines;
  }
  return pendingLinesFromPurchaseOrder(order);
}

/** Borrador de pedido nuevo con lo que falta del pedido origen (mismas líneas, cantidades pendientes). */
export function buildReplenishPurchaseOrderPayload(
  sourceOrder: Pick<
    PurchaseOrder,
    'orderNumber' | 'supplierId' | 'supplierName' | 'taxRate' | 'items' | 'businessId' | 'businessName'
  >,
  pendingLines: PendingOrderLine[],
): Partial<PurchaseOrder> | null {
  if (!pendingLines.length) return null;
  const sourceItems = Array.isArray(sourceOrder.items) ? sourceOrder.items : [];

  const items: PurchaseOrderItem[] = pendingLines.map((pending, idx) => {
    const orig =
      sourceItems.find((i) => i.catalogItemId === pending.catalogItemId && i.name === pending.name)
      || sourceItems.find((i) => i.catalogItemId === pending.catalogItemId);
    const quantity = Math.max(0, Number(pending.pendingQty) || 0);
    const unitCost = Number(orig?.unitCost) || 0;
    return {
      id: `poi-${Date.now()}-${idx}`,
      catalogItemId: pending.catalogItemId,
      sku: pending.sku || orig?.sku || '',
      name: pending.name,
      quantity,
      unitCost,
      total: Math.round(quantity * unitCost * 100) / 100,
      received: 0,
      notes: '',
      supplierId: orig?.supplierId || sourceOrder.supplierId || '',
      supplierName: orig?.supplierName || sourceOrder.supplierName || '',
    };
  }).filter((item) => item.quantity > 0 && item.catalogItemId);

  if (items.length === 0) return null;

  const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const taxRate = Number(sourceOrder.taxRate) || 21;
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const supplierIds = [...new Set(items.map((item) => item.supplierId).filter(Boolean))];
  const supplierNames = [...new Set(items.map((item) => item.supplierName).filter(Boolean))];

  return {
    supplierId: supplierIds.length === 1 ? supplierIds[0] : '',
    supplierName:
      supplierNames.length === 1
        ? supplierNames[0]
        : supplierNames.join(' · ') || sourceOrder.supplierName || '',
    items,
    subtotal,
    taxRate,
    taxAmount,
    total,
    status: 'draft',
    source: 'manual',
    notes: `Reposición automática de ${sourceOrder.orderNumber || 'pedido'} — faltante del albarán`,
    ...(sourceOrder.businessId
      ? { businessId: sourceOrder.businessId, businessName: sourceOrder.businessName || '' }
      : {}),
  };
}

export function compareRowHasIssue(row: AlbaranCompareRow): boolean {
  if (row.excluded) return false;
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
