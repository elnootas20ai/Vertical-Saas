/**
 * Reparto de importe por línea de pedido delivery: marca vs compartido.
 * Usado en ops-center (backend), portfolio y cierre de caja.
 *
 * Las reglas las elige el gerente en Empresa → Marca → Facturación
 * (options / BrandBillingConfig). Sin hardcode de marcas concretas.
 *
 * Defaults (si no pasan options):
 * - 1 marca en el pedido → TODO el € (incl. sin marca) a esa marca.
 * - 2+ marcas → líneas con brandIds a su marca; lo compartido (bebidas…)
 *   va ENTERO a la marca con más unidades en el ticket (majority).
 *   Empate de uds → la que más € de producto propio lleva en el pedido.
 * - 0 marcas → unbranded / por categoría.
 */

/** Defaults de categorías solo para etiquetar informes cuando no hay marca. */
export const DEFAULT_SHARED_CATEGORY_KEYS = [
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
];

/** @deprecated Usar DEFAULT_SHARED_CATEGORY_KEYS */
export const SHARED_REPORT_CATEGORY_KEYS = new Set(DEFAULT_SHARED_CATEGORY_KEYS);

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

/**
 * @typedef {{
 *   monoBrandTakesAll?: boolean,
 *   sharedSplitMode?: 'majority' | 'by_units' | 'equal',
 * }} BrandRevenueSplitOptions
 */

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

export function lineQuantity(item) {
  const q = Number(item?.quantity);
  if (Number.isFinite(q) && q > 0) return q;
  return 0;
}

function itemBrandIds(item) {
  return Array.isArray(item?.brandIds)
    ? item.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
    : [];
}

/**
 * Pedido cruzado: cómo repartir lo sin marca (bebidas…).
 * - majority: entero a la marca dominante
 * - equal: a medias (1/N) entre las marcas del ticket
 * - by_units: legacy → se trata como equal
 */
export function normalizeSharedSplitMode(raw) {
  const mode = String(raw || 'majority').trim();
  if (mode === 'majority') return 'majority';
  if (mode === 'equal' || mode === 'by_units') return 'equal';
  return 'majority';
}

function normalizeSplitOptions(options) {
  const raw = options && typeof options === 'object' ? options : {};
  return {
    monoBrandTakesAll: raw.monoBrandTakesAll !== false,
    sharedSplitMode: normalizeSharedSplitMode(raw.sharedSplitMode),
  };
}

/**
 * Marca dominante del ticket: más unidades propias; empate → más € propio.
 */
export function pickMajorityBrandId(presentBrandIds, brandedUnits, brandedRevenue) {
  const ids = (Array.isArray(presentBrandIds) ? presentBrandIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (ids.length === 0) return '';
  let best = ids[0];
  let bestU = -1;
  let bestR = -1;
  for (const id of ids) {
    const u = Math.max(0, Number(brandedUnits?.[id]) || 0);
    const r = Math.max(0, Number(brandedRevenue?.[id]) || 0);
    if (u > bestU || (u === bestU && r > bestR)) {
      best = id;
      bestU = u;
      bestR = r;
    }
  }
  return best;
}

/**
 * Asigna `shared` según mode:
 * - majority: entero a la dominante
 * - equal: 1/N a cada marca presente (a medias si hay 2)
 */
export function splitSharedAmount(presentBrandIds, brandedUnits, shared, mode, brandedRevenue) {
  const ids = (Array.isArray(presentBrandIds) ? presentBrandIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const out = {};
  const amount = Number(shared) || 0;
  if (ids.length === 0 || amount === 0) return out;

  const normalized = normalizeSharedSplitMode(mode);
  if (normalized === 'equal') {
    const each = amount / ids.length;
    let assigned = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const part =
        i === ids.length - 1
          ? Math.round((amount - assigned) * 100) / 100
          : Math.round(each * 100) / 100;
      out[id] = part;
      assigned += part;
    }
    return out;
  }

  const winner = pickMajorityBrandId(ids, brandedUnits, brandedRevenue || {});
  if (winner) out[winner] = amount;
  return out;
}

/**
 * Atribuye el € del pedido a marcas según options del gerente.
 * @param {object} order
 * @param {BrandRevenueSplitOptions} [options]
 */
export function attributeOrderRevenueByBrand(order, options) {
  const { monoBrandTakesAll, sharedSplitMode } = normalizeSplitOptions(options);
  const items = Array.isArray(order?.items) ? order.items : [];
  const brandedRevenue = {};
  const brandedUnits = {};
  /** @type {Array<{ amount: number, qty: number, category: string }>} */
  const sharedLines = [];

  for (const item of items) {
    const amount = lineRevenueAmount(item);
    if (amount <= 0) continue;
    const qty = lineQuantity(item);
    const brandIds = itemBrandIds(item);

    if (brandIds.length > 0) {
      const shareAmt = amount / brandIds.length;
      const shareQty = qty / brandIds.length;
      for (const bid of brandIds) {
        brandedRevenue[bid] = (brandedRevenue[bid] || 0) + shareAmt;
        brandedUnits[bid] = (brandedUnits[bid] || 0) + shareQty;
      }
    } else {
      sharedLines.push({
        amount,
        qty,
        category: normalizeReportCategory(item.category),
      });
    }
  }

  const presentBrandIds = Object.keys(brandedRevenue).filter(
    (id) => (brandedRevenue[id] || 0) > 0 || (brandedUnits[id] || 0) > 0,
  );
  const sharedRevenue = sharedLines.reduce((s, l) => s + l.amount, 0);
  const byBrand = { ...brandedRevenue };
  const byCategory = {};
  let unbranded = 0;

  if (presentBrandIds.length === 1) {
    if (monoBrandTakesAll) {
      const only = presentBrandIds[0];
      byBrand[only] = (byBrand[only] || 0) + sharedRevenue;
    } else {
      unbranded = sharedRevenue;
      for (const line of sharedLines) {
        byCategory[line.category] = (byCategory[line.category] || 0) + line.amount;
      }
    }
  } else if (presentBrandIds.length >= 2) {
    const parts = splitSharedAmount(
      presentBrandIds,
      brandedUnits,
      sharedRevenue,
      sharedSplitMode,
      brandedRevenue,
    );
    for (const [id, amt] of Object.entries(parts)) {
      byBrand[id] = (byBrand[id] || 0) + amt;
    }
  } else {
    unbranded = sharedRevenue;
    for (const line of sharedLines) {
      byCategory[line.category] = (byCategory[line.category] || 0) + line.amount;
    }
  }

  return {
    byBrand,
    unbranded,
    byCategory,
    presentBrandIds,
  };
}

/**
 * Unidades propias + compartidas según options.
 * majority: lo compartido entero a la marca dominante.
 */
export function attributeOrderUnitsByBrand(order, options) {
  const { monoBrandTakesAll, sharedSplitMode } = normalizeSplitOptions(options);
  const items = Array.isArray(order?.items) ? order.items : [];
  const brandedUnits = {};
  const brandedRevenue = {};
  let sharedUnits = 0;

  for (const item of items) {
    const qty = lineQuantity(item);
    if (qty <= 0) continue;
    const brandIds = itemBrandIds(item);
    const amount = lineRevenueAmount(item);
    if (brandIds.length > 0) {
      const shareQty = qty / brandIds.length;
      const shareAmt = amount > 0 ? amount / brandIds.length : 0;
      for (const bid of brandIds) {
        brandedUnits[bid] = (brandedUnits[bid] || 0) + shareQty;
        if (shareAmt > 0) brandedRevenue[bid] = (brandedRevenue[bid] || 0) + shareAmt;
      }
    } else {
      sharedUnits += qty;
    }
  }

  const present = Object.keys(brandedUnits).filter((id) => (Number(brandedUnits[id]) || 0) > 0);
  const result = { ...brandedUnits };
  if (sharedUnits <= 0) return result;

  if (present.length === 1) {
    if (monoBrandTakesAll) {
      const only = present[0];
      result[only] = (result[only] || 0) + sharedUnits;
    }
    return result;
  }
  if (present.length === 0) return result;

  const parts = splitSharedAmount(present, brandedUnits, sharedUnits, sharedSplitMode, brandedRevenue);
  for (const [id, qty] of Object.entries(parts)) {
    result[id] = (result[id] || 0) + qty;
  }
  return result;
}

/**
 * Suma importes de líneas entregadas en mapas mutables.
 */
export function accumulateDeliveredOrderLines(order, revenueByBrand, revenueByCategory, options) {
  const { byBrand, byCategory } = attributeOrderRevenueByBrand(order, options);
  for (const [bid, amount] of Object.entries(byBrand)) {
    if (amount <= 0) continue;
    revenueByBrand[bid] = (revenueByBrand[bid] || 0) + amount;
  }
  for (const [cat, amount] of Object.entries(byCategory)) {
    if (amount <= 0) continue;
    revenueByCategory[cat] = (revenueByCategory[cat] || 0) + amount;
  }
}

export function roundRevenueMap(map) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    out[k] = Math.round(Number(v || 0) * 100) / 100;
  }
  return out;
}
