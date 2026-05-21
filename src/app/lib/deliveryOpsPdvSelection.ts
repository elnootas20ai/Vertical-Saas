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

/** PDV por defecto si no hay preferencia guardada: el más antiguo activo (suele ser el principal). */
export function pickDefaultActivePdvId(
  pointsOfSale: Array<{ _id: string; active?: boolean; createdAt?: string }>,
): string | null {
  const active = pointsOfSale.filter((p) => p.active !== false);
  if (active.length === 0) return null;
  const sorted = [...active].sort((a, b) => {
    const ta = String(a.createdAt || '');
    const tb = String(b.createdAt || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return a._id.localeCompare(b._id);
  });
  return sorted[0]._id;
}

/** Si la preferencia es `wc:…`, devuelve el `_id` del PDV y opcionalmente reescribe storage al id estable. */
export function normalizeStoredPdvPreference(
  pointsOfSale: Array<{ _id: string; workCenterId?: string; active?: boolean }>,
  raw: string | null,
): string | null {
  const resolved = resolvePreferenceToPdvId(pointsOfSale, raw);
  if (!resolved) return null;
  const r = String(raw || '').trim();
  if (r && r !== resolved) return resolved;
  return resolved;
}
