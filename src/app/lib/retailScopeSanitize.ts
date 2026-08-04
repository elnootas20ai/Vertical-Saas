import type { PointOfSale } from './deliveryApi';
import type { WorkCenter } from './workCentersApi';

export function normalizeBusinessScopeId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function readWorkCenterBusinessId(wc: WorkCenter | Record<string, unknown>): string {
  const raw = wc as Record<string, unknown>;
  return normalizeBusinessScopeId(String(raw.businessId || raw.business_id || ''));
}

function filterWorkCentersForBusinessScope(
  workCenters: WorkCenter[],
  businessId: string,
  options?: { accountBusinessCount?: number },
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];

  const active = workCenters.filter((wc) => !wc.deletedAt);
  const isRetail = (wc: WorkCenter) =>
    wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';

  const mine = active.filter((wc) => readWorkCenterBusinessId(wc) === bid);
  const mineRetail = mine.filter(isRetail);
  const accountN = options?.accountBusinessCount;

  if (accountN === undefined) {
    return mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  if (mineRetail.length === 0) {
    const legacyRetail = active.filter((wc) => !readWorkCenterBusinessId(wc) && isRetail(wc));
    const merged = new Map<string, WorkCenter>();
    for (const wc of mine) merged.set(wc._id, wc);
    for (const wc of legacyRetail) merged.set(wc._id, wc);
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  return mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function workCentersStrictlyForBusiness(workCenters: WorkCenter[], businessId: string): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];
  return workCenters.filter((wc) => readWorkCenterBusinessId(wc) === bid);
}

function dedupeRetailWorkCentersForBusiness(workCenters: WorkCenter[]): WorkCenter[] {
  const isRetail = (wc: WorkCenter) =>
    wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
  const retail: WorkCenter[] = [];
  const other: WorkCenter[] = [];
  for (const wc of workCenters) {
    if (isRetail(wc)) retail.push(wc);
    else other.push(wc);
  }

  const byKey = new Map<string, WorkCenter>();
  for (const wc of retail) {
    const bid = readWorkCenterBusinessId(wc);
    const nameKey = String(wc.name || '')
      .trim()
      .toLowerCase();
    const key = `${bid}::${nameKey || wc._id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, wc);
      continue;
    }
    // Preferir el doc con horario; si empatan, el más reciente (updatedAt).
    // Antes se quedaba el createdAt más viejo y podía borrar la copia con openingHours.
    byKey.set(key, preferRicherWorkCenterForDedupe(prev, wc));
  }

  return [...other, ...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function wcHasHoursPayload(wc: WorkCenter): boolean {
  const oh = wc.openingHours as { schedule?: unknown; monday?: unknown } | undefined;
  return Boolean(oh && typeof oh === 'object' && (oh.schedule || oh.monday));
}

function preferRicherWorkCenterForDedupe(a: WorkCenter, b: WorkCenter): WorkCenter {
  const aHours = wcHasHoursPayload(a);
  const bHours = wcHasHoursPayload(b);
  if (aHours !== bHours) return bHours ? b : a;
  const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
  if (tb !== ta) return tb > ta ? b : a;
  return String(b._id || '').localeCompare(String(a._id || '')) < 0 ? b : a;
}

function filterPointsOfSaleForWorkCenters(
  pointsOfSale: PointOfSale[],
  workCenters: WorkCenter[],
  options?: { businessId?: string | null },
): PointOfSale[] {
  const wcIds = new Set(workCenters.map((wc) => String(wc._id || '').trim()).filter(Boolean));
  const businessId = normalizeBusinessScopeId(options?.businessId);
  const pdvBusinessId = (p: PointOfSale) =>
    normalizeBusinessScopeId(
      String((p as PointOfSale & { business_id?: string }).business_id || p.businessId || ''),
    );

  if (wcIds.size === 0) {
    if (!businessId) return [];
    const tagged = pointsOfSale.filter((p) => pdvBusinessId(p) === businessId);
    if (tagged.length > 0) return tagged;
    return pointsOfSale.filter((p) => !pdvBusinessId(p));
  }

  return pointsOfSale.filter((p) => {
    const wcId = String(p.workCenterId || '').trim();
    if (wcId && wcIds.has(wcId)) return true;
    const pBid = pdvBusinessId(p);
    if (businessId && pBid === businessId) return true;
    if (businessId && !pBid && !wcId) return true;
    return false;
  });
}

function dedupePointsOfSale(pointsOfSale: PointOfSale[]): PointOfSale[] {
  const seen = new Set<string>();
  return pointsOfSale.filter((p) => {
    const id = String(p._id || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function isRetailWorkCenter(wc: WorkCenter): boolean {
  return (
    !wc.deletedAt &&
    (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen')
  );
}

/** Filtra snapshot de tiendas/PDV a la empresa activa (caché, sidebar, TPV). */
export function sanitizeRetailScopeSnapshot(
  businessId: string,
  snapshot: { retailWorkCenters: WorkCenter[]; allPointsOfSale: PointOfSale[] },
  options?: { accountBusinessCount?: number },
): { retailWorkCenters: WorkCenter[]; allPointsOfSale: PointOfSale[] } {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return { retailWorkCenters: [], allPointsOfSale: [] };

  const input = snapshot.retailWorkCenters.filter((wc) => !wc.deletedAt);
  let retail: WorkCenter[];
  if (options?.accountBusinessCount !== undefined) {
    retail = dedupeRetailWorkCentersForBusiness(
      filterWorkCentersForBusinessScope(input, bid, options),
    ).filter(isRetailWorkCenter);
  } else {
    retail = dedupeRetailWorkCentersForBusiness(workCentersStrictlyForBusiness(input, bid)).filter(
      isRetailWorkCenter,
    );
  }

  const allPointsOfSale = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(snapshot.allPointsOfSale, retail, { businessId: bid }),
  );

  return { retailWorkCenters: retail, allPointsOfSale };
}
