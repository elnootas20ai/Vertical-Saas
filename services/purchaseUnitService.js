const UNIT_DEFINITIONS = {
  kg: { family: 'mass', factor: 1 },
  g: { family: 'mass', factor: 0.001 },
  l: { family: 'volume', factor: 1 },
  ml: { family: 'volume', factor: 0.001 },
  ud: { family: 'count', factor: 1 },
};

export function normalizePurchaseUnit(value) {
  const unit = String(value || '').toLowerCase().trim().replace(/\./g, '');
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(unit)) return 'kg';
  if (['g', 'gr', 'gramo', 'gramos'].includes(unit)) return 'g';
  if (['l', 'lt', 'litro', 'litros'].includes(unit)) return 'l';
  if (['ml', 'mililitro', 'mililitros'].includes(unit)) return 'ml';
  if (['ud', 'uds', 'u', 'unidad', 'unidades', 'pieza', 'piezas'].includes(unit)) return 'ud';
  return unit;
}

/**
 * Convierte cantidad y coste unitario conservando el importe de línea.
 * Si la unidad del documento está vacía se considera ya expresada en la del catálogo.
 */
export function convertPurchaseLineToCatalogUnit(quantity, unitCost, sourceUnit, catalogUnit) {
  const target = normalizePurchaseUnit(catalogUnit) || 'ud';
  const source = normalizePurchaseUnit(sourceUnit) || target;
  if (source === target) {
    return { quantity: Number(quantity || 0), unitCost: Number(unitCost || 0), unit: target };
  }
  const sourceDefinition = UNIT_DEFINITIONS[source];
  const targetDefinition = UNIT_DEFINITIONS[target];
  if (!sourceDefinition || !targetDefinition || sourceDefinition.family !== targetDefinition.family) {
    return null;
  }
  const ratio = sourceDefinition.factor / targetDefinition.factor;
  return {
    quantity: Number(quantity || 0) * ratio,
    unitCost: Number(unitCost || 0) / ratio,
    unit: target,
  };
}
