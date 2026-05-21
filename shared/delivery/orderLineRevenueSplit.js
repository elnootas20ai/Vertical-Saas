/**
 * Reparto de importe por línea de pedido delivery: marca vs categoría compartida.
 * Usado en ops-center (backend) y puede reexportarse en el front para informes.
 */

/** Categorías que no van al informe por marca (bebidas, complementos, etc.). */
export const SHARED_REPORT_CATEGORY_KEYS = new Set([
  'bebidas',
  'bebida',
  'complementos',
  'complemento',
  'extras',
  'postres',
  'postre',
  'salsas',
  'salsa',
  'cubiertos',
  'otros',
  'sin_categoria',
]);

const CATEGORY_LABELS = {
  bebidas: 'Bebidas',
  bebida: 'Bebidas',
  complementos: 'Complementos',
  complemento: 'Complementos',
  extras: 'Extras',
  postres: 'Postres',
  postre: 'Postres',
  salsas: 'Salsas',
  salsa: 'Salsas',
  cubiertos: 'Cubiertos',
  otros: 'Otros',
  sin_categoria: 'Sin categoría',
};

export function normalizeReportCategory(category) {
  const c = String(category || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return c || 'sin_categoria';
}

export function reportCategoryLabel(categoryKey) {
  const k = normalizeReportCategory(categoryKey);
  return CATEGORY_LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1);
}

/** Línea contabilizada por marca cuando el producto lleva brandIds en catálogo/pedido. */
export function lineCountsAsBrandSale(item) {
  const brandIds = Array.isArray(item?.brandIds)
    ? item.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
    : [];
  return brandIds.length > 0;
}

export function lineRevenueAmount(item) {
  const total = Number(item?.total ?? 0);
  if (total > 0) return total;
  return Number(item?.unitPrice ?? 0) * Number(item?.quantity ?? 0);
}

/**
 * Suma importes de líneas entregadas en mapas mutables:
 * - revenueByBrand: { [brandId]: euros }
 * - revenueByCategory: { [categoryKey]: euros } (sin marca o categoría compartida)
 */
export function accumulateDeliveredOrderLines(order, revenueByBrand, revenueByCategory) {
  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const amount = lineRevenueAmount(item);
    if (amount <= 0) continue;

    const brandIds = Array.isArray(item.brandIds)
      ? item.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
      : [];

    if (lineCountsAsBrandSale(item)) {
      const share = amount / brandIds.length;
      for (const bid of brandIds) {
        revenueByBrand[bid] = (revenueByBrand[bid] || 0) + share;
      }
    } else {
      const cat = normalizeReportCategory(item.category);
      revenueByCategory[cat] = (revenueByCategory[cat] || 0) + amount;
    }
  }
}

export function roundRevenueMap(map) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    out[k] = Math.round(Number(v || 0) * 100) / 100;
  }
  return out;
}
