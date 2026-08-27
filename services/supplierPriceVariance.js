/**
 * Detecta si el albarán/factura llega con precio unitario distinto
 * al coste esperado del proveedor (costPrice / lastPurchase / pedido).
 */

export const SUPPLIER_PRICE_VARIANCE_THRESHOLD = 0.02;

function foldName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUnitPriceVariance(expected, actual, threshold = SUPPLIER_PRICE_VARIANCE_THRESHOLD) {
  const e = Number(expected) || 0;
  const a = Number(actual) || 0;
  if (!(a > 0) || !(e > 0)) return false;
  return Math.abs(a - e) / Math.max(e, 0.01) > threshold;
}

export function resolveExpectedUnitCost(catalogItem, orderItem) {
  const fromCost = Number(catalogItem?.costPrice || 0);
  if (fromCost > 0) return Math.round(fromCost * 10000) / 10000;
  const fromLast = Number(catalogItem?.lastPurchasePrice || 0);
  if (fromLast > 0) return Math.round(fromLast * 10000) / 10000;
  const fromOrder = Number(orderItem?.unitCost || 0);
  if (fromOrder > 0) return Math.round(fromOrder * 10000) / 10000;
  return 0;
}

function lineUnitPrice(line) {
  const qty = Number(line?.quantity) || 0;
  const unit = Number(line?.unitPrice ?? line?.unitCost ?? 0);
  if (unit > 0) return Math.round(unit * 100) / 100;
  const total = Number(line?.total || 0);
  if (total > 0 && qty > 0) return Math.round((total / qty) * 100) / 100;
  return 0;
}

function lineName(line) {
  return String(line?.itemName || line?.catalogItemName || line?.description || '').trim();
}

export function detectSupplierPriceVariance({
  lines = [],
  catalogItems = [],
  orderItems = [],
  threshold = SUPPLIER_PRICE_VARIANCE_THRESHOLD,
  now,
} = {}) {
  const thr = Number(threshold) > 0 ? Number(threshold) : SUPPLIER_PRICE_VARIANCE_THRESHOLD;
  const byId = new Map();
  const byName = new Map();
  for (const item of catalogItems || []) {
    const id = String(item?._id || item?.id || '').trim();
    if (id) byId.set(id, item);
    const key = foldName(String(item?.name || ''));
    if (key && !byName.has(key)) byName.set(key, item);
  }
  const orderById = new Map();
  const orderByName = new Map();
  for (const item of orderItems || []) {
    const id = String(item?.catalogItemId || '').trim();
    if (id) orderById.set(id, item);
    const key = foldName(String(item?.name || ''));
    if (key && !orderByName.has(key)) orderByName.set(key, item);
  }

  const out = [];
  for (const line of lines || []) {
    const name = lineName(line);
    const invoiceUnitCost = lineUnitPrice(line);
    if (!(invoiceUnitCost > 0)) continue;

    const catalogId = String(line?.catalogItemId || '').trim();
    const nameKey = foldName(name);
    const catalogItem =
      (catalogId && byId.get(catalogId)) ||
      (nameKey ? byName.get(nameKey) : null) ||
      null;
    const orderItem =
      (catalogId && orderById.get(catalogId)) ||
      (nameKey ? orderByName.get(nameKey) : null) ||
      null;

    const expectedUnitCost = resolveExpectedUnitCost(catalogItem, orderItem);
    if (!(expectedUnitCost > 0)) continue;
    if (!isUnitPriceVariance(expectedUnitCost, invoiceUnitCost, thr)) continue;

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
    checkedAt: now || new Date().toISOString(),
    thresholdPct: thr,
    lines: out,
  };
}

export function emptySupplierPriceVariance(now) {
  return {
    hasVariance: false,
    checkedAt: now || new Date().toISOString(),
    thresholdPct: SUPPLIER_PRICE_VARIANCE_THRESHOLD,
    lines: [],
  };
}
