/**
 * Conversión g↔kg / ml↔l para qty de escandallo → unidad de stock.
 * Misma regla que catalogCosting.convertQuantityBetweenUnits (cliente).
 */

const UNIT_BASE = {
  g: { family: 'mass', toBase: 1 },
  kg: { family: 'mass', toBase: 1000 },
  ml: { family: 'vol', toBase: 1 },
  l: { family: 'vol', toBase: 1000 },
};

export function normalizeStockUnit(raw, fallback = 'ud') {
  const u = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^lt$/, 'l');
  if (!u) return fallback;
  if (u === 'ud' || u === 'g' || u === 'kg' || u === 'ml' || u === 'l') return u;
  return fallback;
}

/**
 * Convierte cantidad entre g↔kg o ml↔l. Misma unidad → qty.
 * Familias incompatibles (p. ej. ud vs g) → null.
 */
export function convertQuantityBetweenUnits(quantity, fromUnit, toUnit) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0) return null;
  const from = normalizeStockUnit(fromUnit, 'ud');
  const to = normalizeStockUnit(toUnit, 'ud');
  if (from === to) return qty;
  const a = UNIT_BASE[from];
  const b = UNIT_BASE[to];
  if (!a || !b || a.family !== b.family) return null;
  return (qty * a.toBase) / b.toBase;
}

/** Qty de línea de escandallo expresada en la unidad del SKU de almacén. */
export function quantityInStockUnit(quantity, lineUnit, stockUnit) {
  const target = normalizeStockUnit(stockUnit, normalizeStockUnit(lineUnit, 'ud'));
  const converted = convertQuantityBetweenUnits(quantity, lineUnit || 'ud', target);
  return converted != null ? converted : Number(quantity) || 0;
}
