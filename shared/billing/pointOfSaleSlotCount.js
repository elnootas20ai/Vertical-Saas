/**
 * Cupos PDV: tienda (centro retail) + caja delivery enlazada = 1 ubicación.
 * Activar la caja sobre una tienda ya creada no debe consumir un cupo extra.
 */

/** Ubicaciones retail efectivas = PDV enlazados + PDV huérfanos + tiendas sin caja. */
export function countEffectiveRetailPointOfSaleSlots({
  linkedWorkCenterIds = [],
  orphanPdvCount = 0,
  unlinkedWorkCenterCount = 0,
} = {}) {
  const linked = new Set(
    (linkedWorkCenterIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const orphan = Math.max(0, Math.floor(Number(orphanPdvCount) || 0));
  const unlinked = Math.max(0, Math.floor(Number(unlinkedWorkCenterCount) || 0));
  return linked.size + orphan + unlinked;
}

/** ¿Permite crear/enlazar un PDV de caja delivery? */
export function canCreateDeliveryPointOfSale({
  effectiveCount,
  limit,
  isLinkingExistingStore = false,
}) {
  const count = Math.max(0, Math.floor(Number(effectiveCount) || 0));
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (isLinkingExistingStore) return count <= max;
  return count < max;
}
