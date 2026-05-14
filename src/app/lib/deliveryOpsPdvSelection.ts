/**
 * PDV/tienda elegida en el centro de operaciones de delivery (filtro superior).
 * El TPV rápido la reutiliza para abrir directamente la caja de esa tienda.
 * Sidebar (centros de trabajo) escribe la misma clave: el gerente elige tienda y
 * las pantallas que escuchan `DELIVERY_ACTIVE_STORE_CHANGED` se alinean.
 */
export const DELIVERY_ACTIVE_STORE_CHANGED = 'vertial-delivery-active-store';

export function notifyDeliveryActiveStoreChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_ACTIVE_STORE_CHANGED));
  } catch {
    /* ignore */
  }
}

export function deliveryOpsSelectedPdvStorageKey(businessId: string, dataUserId: string): string {
  return `vertial.deliveryOps.selectedPdv.${String(businessId || 'noBiz')}.${String(dataUserId || '')}`;
}

export function readDeliveryOpsSelectedPdvId(businessId: string, dataUserId: string): string | null {
  try {
    const v = localStorage.getItem(deliveryOpsSelectedPdvStorageKey(businessId, dataUserId));
    const t = v && String(v).trim();
    return t || null;
  } catch {
    return null;
  }
}

export function writeDeliveryOpsSelectedPdvId(
  businessId: string,
  dataUserId: string,
  value: string | null,
): void {
  try {
    const key = deliveryOpsSelectedPdvStorageKey(businessId, dataUserId);
    if (value && String(value).trim()) localStorage.setItem(key, String(value).trim());
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Valor guardado: PDV `_id` o `wc:` + id del centro de trabajo (sales_point). */
export function resolvePreferenceToPdvId(
  pointsOfSale: Array<{ _id: string; workCenterId?: string; active?: boolean }>,
  raw: string | null,
): string | null {
  if (!raw) return null;
  const r = String(raw).trim();
  if (!r) return null;
  if (r.startsWith('wc:')) {
    const wc = r.slice(3).trim();
    if (!wc) return null;
    const p = pointsOfSale.find(
      (x) => String(x.workCenterId || '').trim() === wc && x.active !== false,
    );
    return p?._id || null;
  }
  if (pointsOfSale.some((p) => p._id === r && p.active !== false)) return r;
  return null;
}
