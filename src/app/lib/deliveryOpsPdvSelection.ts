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

export interface DeliveryOrderPdvFilterOptions {
  /** PDV principal (el más antiguo). Pedidos legacy sin `salesPointId` solo cuentan aquí. */
  primaryPdvId?: string | null;
}

/**
 * Filtra pedidos por PDV de forma estricta: cada tienda es independiente.
 * Pedidos sin `salesPointId` (legacy) solo aparecen en el PDV principal, no en el 2º/3º.
 */
export function deliveryOrderMatchesPdvFilter(
  order: { salesPointId?: string | null },
  pdvId: string | null | undefined,
  options?: DeliveryOrderPdvFilterOptions,
): boolean {
  const filterId = String(pdvId || '').trim();
  if (!filterId) return true;
  const orderPdv = String(order.salesPointId || '').trim();
  if (!orderPdv) {
    const primary = String(options?.primaryPdvId || '').trim();
    return primary ? filterId === primary : false;
  }
  return orderPdv === filterId;
}

/**
 * PDV válido para la lista actual (preferencia guardada o el primero activo).
 * Evita errores de `<select>` cuando la tienda guardada no pertenece a esta empresa.
 */
export function coerceSelectedPdvId(
  pointsOfSale: Array<{ _id: string; workCenterId?: string; active?: boolean; createdAt?: string }>,
  preferred: string | null | undefined,
): string | null {
  const active = pointsOfSale.filter((p) => p.active !== false);
  if (active.length === 0) return null;
  const resolved = resolvePreferenceToPdvId(active, preferred ?? null);
  if (resolved) return resolved;
  return pickDefaultActivePdvId(active);
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
