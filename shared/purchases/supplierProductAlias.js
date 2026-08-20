/**
 * Alias proveedor → artículo Vertial (p. ej. texto Makro ↔ «Lechuga»).
 * Sin catálogo completo del proveedor: solo lo que el usuario vincula.
 */

export function normalizeSupplierProductKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeSupplierProductAliases(list) {
  if (!Array.isArray(list)) return [];
  const byKey = new Map();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const supplierId = String(raw.supplierId || '').trim();
    const label = String(raw.label || raw.description || '').trim();
    const key = normalizeSupplierProductKey(raw.key || label);
    const sku = String(raw.sku || '').trim();
    if (!supplierId || (!key && !sku)) continue;
    const mapKey = `${supplierId}::${key || `sku:${sku.toLowerCase()}`}`;
    byKey.set(mapKey, {
      supplierId,
      key,
      label: label || key,
      sku,
      updatedAt: String(raw.updatedAt || new Date().toISOString()),
    });
  }
  return [...byKey.values()];
}

/**
 * ¿La línea OCR coincide con un alias del artículo?
 * @returns {{ score: number, method: string } | null}
 */
export function scoreSupplierAliasMatch(lineText, lineSku, catalogItem, supplierId) {
  const sid = String(supplierId || '').trim();
  if (!sid) return null;
  const aliases = sanitizeSupplierProductAliases(catalogItem?.supplierProductAliases);
  if (aliases.length === 0) return null;

  const lineKey = normalizeSupplierProductKey(lineText);
  const skuLower = String(lineSku || '').toLowerCase().trim();

  for (const alias of aliases) {
    if (alias.supplierId !== sid) continue;
    if (skuLower && alias.sku && skuLower === alias.sku.toLowerCase()) {
      return { score: 0.99, method: 'supplier_alias_sku' };
    }
    if (alias.key && lineKey && alias.key === lineKey) {
      return { score: 1, method: 'supplier_alias' };
    }
    // Contención suave: alias corto dentro de la línea Makro (o al revés).
    if (alias.key && lineKey && alias.key.length >= 4 && lineKey.length >= 4) {
      if (lineKey.includes(alias.key) || alias.key.includes(lineKey)) {
        return { score: 0.92, method: 'supplier_alias_contains' };
      }
    }
  }
  return null;
}

/**
 * Fusiona un vínculo factura → catálogo en la lista de aliases del artículo.
 */
export function mergeSupplierProductAlias(existingAliases, entry) {
  const supplierId = String(entry?.supplierId || '').trim();
  const label = String(entry?.label || entry?.description || '').trim();
  const key = normalizeSupplierProductKey(entry?.key || label);
  const sku = String(entry?.sku || '').trim();
  if (!supplierId || (!key && !sku)) {
    return sanitizeSupplierProductAliases(existingAliases);
  }
  const next = sanitizeSupplierProductAliases(existingAliases).filter((a) => {
    if (a.supplierId !== supplierId) return true;
    if (key && a.key === key) return false;
    if (sku && a.sku && a.sku.toLowerCase() === sku.toLowerCase() && !key) return false;
    return true;
  });
  next.push({
    supplierId,
    key,
    label: label || key,
    sku,
    updatedAt: String(entry?.updatedAt || new Date().toISOString()),
  });
  return sanitizeSupplierProductAliases(next);
}
