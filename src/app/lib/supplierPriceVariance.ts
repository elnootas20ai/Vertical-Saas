/** Umbral relativo para marcar precio distinto vs coste esperado del proveedor. */
export const SUPPLIER_PRICE_VARIANCE_THRESHOLD = 0.02;

export type SupplierPriceVarianceLine = {
  catalogItemId: string;
  name: string;
  expectedUnitCost: number;
  invoiceUnitCost: number;
  deltaAbs: number;
  deltaPct: number;
};

export type SupplierPriceVariance = {
  hasVariance: boolean;
  checkedAt: string;
  thresholdPct: number;
  lines: SupplierPriceVarianceLine[];
};

type CatalogCostLike = {
  _id?: string;
  id?: string;
  name?: string;
  costPrice?: number;
  lastPurchasePrice?: number;
  supplierId?: string;
};

type OrderItemLike = {
  catalogItemId?: string;
  name?: string;
  unitCost?: number;
};

type InvoiceLineLike = {
  catalogItemId?: string;
  itemName?: string;
  catalogItemName?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  total?: number;
};

function foldName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUnitPriceVariance(
  expected: number,
  actual: number,
  threshold = SUPPLIER_PRICE_VARIANCE_THRESHOLD,
): boolean {
  const e = Number(expected) || 0;
  const a = Number(actual) || 0;
  if (!(a > 0) || !(e > 0)) return false;
  return Math.abs(a - e) / Math.max(e, 0.01) > threshold;
}

export function resolveExpectedUnitCost(
  catalogItem?: CatalogCostLike | null,
  orderItem?: OrderItemLike | null,
): number {
  const fromCost = Number(catalogItem?.costPrice || 0);
  if (fromCost > 0) return Math.round(fromCost * 10000) / 10000;
  const fromLast = Number(catalogItem?.lastPurchasePrice || 0);
  if (fromLast > 0) return Math.round(fromLast * 10000) / 10000;
  const fromOrder = Number(orderItem?.unitCost || 0);
  if (fromOrder > 0) return Math.round(fromOrder * 10000) / 10000;
  return 0;
}

function lineUnitPrice(line: InvoiceLineLike): number {
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.unitPrice ?? line.unitCost ?? 0);
  if (unit > 0) return Math.round(unit * 100) / 100;
  const total = Number(line.total || 0);
  if (total > 0 && qty > 0) return Math.round((total / qty) * 100) / 100;
  return 0;
}

function lineName(line: InvoiceLineLike): string {
  return String(line.itemName || line.catalogItemName || line.description || '').trim();
}

/**
 * Compara precios unitarios de factura/albarán con el coste esperado
 * (costPrice del proveedor en catálogo → lastPurchasePrice → unitCost del pedido).
 */
export function detectSupplierPriceVariance(input: {
  lines?: InvoiceLineLike[] | null;
  catalogItems?: CatalogCostLike[] | null;
  orderItems?: OrderItemLike[] | null;
  threshold?: number;
  now?: string;
}): SupplierPriceVariance {
  const threshold = Number(input.threshold) > 0 ? Number(input.threshold) : SUPPLIER_PRICE_VARIANCE_THRESHOLD;
  const catalogItems = Array.isArray(input.catalogItems) ? input.catalogItems : [];
  const orderItems = Array.isArray(input.orderItems) ? input.orderItems : [];
  const lines = Array.isArray(input.lines) ? input.lines : [];

  const byId = new Map<string, CatalogCostLike>();
  const byName = new Map<string, CatalogCostLike>();
  for (const item of catalogItems) {
    const id = String(item._id || item.id || '').trim();
    if (id) byId.set(id, item);
    const key = foldName(String(item.name || ''));
    if (key && !byName.has(key)) byName.set(key, item);
  }

  const orderById = new Map<string, OrderItemLike>();
  const orderByName = new Map<string, OrderItemLike>();
  for (const item of orderItems) {
    const id = String(item.catalogItemId || '').trim();
    if (id) orderById.set(id, item);
    const key = foldName(String(item.name || ''));
    if (key && !orderByName.has(key)) orderByName.set(key, item);
  }

  const out: SupplierPriceVarianceLine[] = [];

  for (const line of lines) {
    const name = lineName(line);
    const invoiceUnitCost = lineUnitPrice(line);
    if (!(invoiceUnitCost > 0)) continue;

    const catalogId = String(line.catalogItemId || '').trim();
    const nameKey = foldName(name);
    const catalogItem =
      (catalogId && byId.get(catalogId)) ||
      (nameKey ? byName.get(nameKey) : undefined) ||
      null;
    const orderItem =
      (catalogId && orderById.get(catalogId)) ||
      (nameKey ? orderByName.get(nameKey) : undefined) ||
      null;

    const expectedUnitCost = resolveExpectedUnitCost(catalogItem, orderItem);
    if (!(expectedUnitCost > 0)) continue;
    if (!isUnitPriceVariance(expectedUnitCost, invoiceUnitCost, threshold)) continue;

    const deltaAbs = Math.round((invoiceUnitCost - expectedUnitCost) * 100) / 100;
    const deltaPct =
      Math.round((Math.abs(invoiceUnitCost - expectedUnitCost) / Math.max(expectedUnitCost, 0.01)) * 1000) / 10;

    out.push({
      catalogItemId: String(catalogItem?._id || catalogItem?.id || catalogId || ''),
      name: name || String(catalogItem?.name || 'Artículo'),
      expectedUnitCost,
      invoiceUnitCost,
      deltaAbs,
      deltaPct,
    });
  }

  return {
    hasVariance: out.length > 0,
    checkedAt: input.now || new Date().toISOString(),
    thresholdPct: threshold,
    lines: out,
  };
}

export function emptySupplierPriceVariance(now?: string): SupplierPriceVariance {
  return {
    hasVariance: false,
    checkedAt: now || new Date().toISOString(),
    thresholdPct: SUPPLIER_PRICE_VARIANCE_THRESHOLD,
    lines: [],
  };
}
